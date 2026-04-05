import type { BuildInput } from "../pipedown.d.ts";
import { std } from "../deps.ts";

import { pdBuild } from "../pdBuild.ts";
// pipeToMarkdown converts a Pipe JSON object back to markdown source.
// Used here to persist LLM-generated changes (descriptions, schemas, code, etc.)
// back to the original .md file — the same round-trip mechanism that `pd sync` uses.
// Ref: see pipeToMarkdown.ts for lossless vs lossy reconstruction modes
import { pipeToMarkdown } from "../pipeToMarkdown.ts";
import { reportErrors } from "./reportErrors.ts";
import { scanTraces, readTrace, tracePage } from "./traceDashboard.ts";
import { enrichProjects, readProjectsRegistry, scanProjectPipes, readPipeMarkdown, projectsPage, readGlobalConfig, writeGlobalConfig, createProject } from "./projectsDashboard.ts";
import { scanRecentPipes, readPipeIndex, recentStepTraces, recentPipeTraces, homePage } from "./homeDashboard.ts";
import { findTargetStep, buildContextPrompt, callLLM, getPipedownSystemPrompt } from "./llmCommand.ts";
// performExtraction splits a pipe's steps into a new sub-pipe and rewrites
// the parent with a delegation step. Used by POST /api/extract.
// Ref: extractSteps.ts — parseStepIndices, buildExtractedPipe, buildReplacementStep
import { performExtraction, toKebabCase } from "../extractSteps.ts";

let _controller: ReadableStreamDefaultController<string> | null = null;

// ── SSE broadcast helpers ──
// The basic `_controller.enqueue("data: reload\n\n")` sends a plain "reload"
// string to all connected browser tabs. For richer notifications — e.g. telling
// the frontend which pipe was just executed — we send JSON-encoded event data.
// The frontend parses `event.data` as JSON first, falling back to the legacy
// string check for backwards compatibility.
//
// Ref: https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events
// Ref: https://html.spec.whatwg.org/multipage/server-sent-events.html#event-stream-interpretation

/**
 * Broadcast a structured SSE event to all connected browser clients.
 * If no client is connected (_controller is null), the call is silently ignored.
 *
 * @param data - Plain string (e.g. "reload") or an object to JSON-encode.
 *               Objects must include a `type` field so the frontend can dispatch.
 *
 * @example
 *   broadcastSSE("reload");  // legacy reload
 *   broadcastSSE({ type: "pipe_executed", project: "myproj", pipe: "fetch" });
 */
function broadcastSSE(data: string | Record<string, unknown>): void {
  if (!_controller) return;
  try {
    const payload = typeof data === "string" ? data : JSON.stringify(data);
    _controller.enqueue(`data: ${payload}\n\n`);
  } catch {
    // SSE client may have disconnected — ignore.
  }
}

// ── Tauri Desktop IPC ──
// When Pipedown Desktop (the Tauri app) is running, it listens on a Unix
// domain socket at /tmp/pipedown.sock for event notifications. The pd server
// sends newline-delimited JSON messages after operations complete (run, LLM,
// test, pack). The Tauri app uses these to fire native macOS notifications.
//
// **Graceful degradation:** If the socket doesn't exist (Tauri not running),
// the connection attempt silently fails and no events are sent. This means
// `pd` works identically whether or not the desktop app is running.
//
// **Protocol:** Each message is a single JSON object followed by `\n`:
//   { "type": "run_complete", "project": "myproj", "pipe": "fetch", "success": true, "message": "..." }
//
// Ref: https://docs.deno.com/runtime/reference/api/net/#unix-sockets
// Ref: /Users/aaronmyatt/pipes/pd-desktop/src-tauri/src/ipc.rs for the Tauri-side listener

const TAURI_SOCKET_PATH = "/tmp/pipedown.sock";

/**
 * Attempt to connect to the Tauri desktop app's Unix socket.
 * Returns the connection if successful, or null if the socket doesn't exist
 * (meaning the Tauri app isn't running).
 *
 * @returns A Deno.Conn object for writing events, or null
 */
async function connectToTauriSocket(): Promise<Deno.Conn | null> {
  try {
    // Deno.connect with transport: "unix" opens a Unix domain socket.
    // This will throw if the socket file doesn't exist (Tauri not running).
    // Ref: https://docs.deno.com/api/deno/~/Deno.connect
    const conn = await Deno.connect({
      transport: "unix",
      path: TAURI_SOCKET_PATH,
    });
    return conn;
  } catch {
    // Socket doesn't exist or connection refused — Tauri app isn't running.
    // This is the expected case for standalone `pd` usage.
    return null;
  }
}

/**
 * Send an event notification to the Tauri desktop app via Unix socket.
 *
 * This is a fire-and-forget operation: if the socket isn't available or the
 * write fails, the error is silently ignored. The pd server must never crash
 * or block because of Tauri IPC issues.
 *
 * @param event - An object with at least a `type` field. Common types:
 *   - `run_complete` — pipe finished executing
 *   - `llm_complete` — LLM action finished
 *   - `test_complete` — tests finished
 *   - `pack_complete` — pack operation finished
 *   - `error` — an operation failed
 *
 * Ref: /Users/aaronmyatt/pipes/pd-desktop/src-tauri/src/ipc.rs (IpcEvent struct)
 */
async function notifyTauri(event: {
  type: string;
  title?: string;
  message?: string;
  project?: string;
  pipe?: string;
  success?: boolean;
}): Promise<void> {
  try {
    const conn = await connectToTauriSocket();
    if (!conn) return; // Tauri not running — silently skip

    // Encode the event as newline-delimited JSON (the IPC protocol)
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(event) + "\n");
    await conn.write(data);
    conn.close();
  } catch {
    // Silently ignore any write errors — the pd server must not be
    // affected by Tauri IPC failures.
  }
}

// ── Optimistic Project Build ──
// Before any toolbar action (run, run-step, test, pack, etc.) we rebuild
// the target project's .pd/ directory in-process. This ensures the compiled
// .ts files are always in sync with the latest .md source, even if the user
// edited markdown since the last build.
//
// pdBuild now accepts an optional `cwd` field on its input object, so we
// can build any registered project without shelling out to a child process.
// This is faster (no process spawn overhead) and shares the same module
// cache as the dashboard server.

/**
 * Runs pdBuild in-process for the given project directory. The `cwd`
 * field on BuildInput tells pdBuild where to walk for .md files, where
 * to resolve .gitignore, and where to write .pd/ output.
 *
 * @param projectPath - Absolute path to the target project root
 * @returns true if the build completed without errors, false otherwise
 */
async function buildProject(projectPath: string): Promise<boolean> {
  try {
    // Construct a minimal BuildInput with `cwd` pointing at the target
    // project. pdBuild uses input.cwd (falling back to Deno.cwd()) for
    // all path resolution, so this builds the correct project in-process.
    const result = await pdBuild({
      cwd: projectPath,
      errors: [],
    } as unknown as BuildInput);
    if (result.errors && result.errors.length > 0) {
      reportErrors(result);
      console.error(
        std.colors.brightRed(
          `Build had ${result.errors.length} error(s) in ${projectPath}`,
        ),
      );
      return false;
    }
    console.log(std.colors.brightGreen(`Built ${projectPath}`));
    return true;
  } catch (e) {
    console.error(
      std.colors.brightRed(
        `Build error in ${projectPath}: ${(e as Error).message}`,
      ),
    );
    return false;
  }
}

/**
 * Strips markdown code fences from LLM output.
 *
 * LLMs are instructed to return bare code/schema, but often wrap their
 * response in fenced code blocks like ```ts ... ``` or ```zod ... ```.
 * This helper removes the outermost fence so the content can be stored
 * directly in the Pipe JSON fields (code, schema, etc.).
 *
 * @param text - Raw LLM output that may be wrapped in code fences
 * @returns The unwrapped content, or the original text if no fences found
 */
function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  // Match opening fence with optional language tag and closing fence
  // Ref: CommonMark spec § 4.5 — fenced code blocks
  // https://spec.commonmark.org/0.31.2/#fenced-code-blocks
  const match = trimmed.match(/^```\w*\s*\n([\s\S]*?)\n```\s*$/);
  if (match) return match[1];
  return trimmed;
}

/**
 * Builds a context header for step-level LLM prompts.
 *
 * Step-level actions (step-title, step-description, step-code) need to
 * understand the broader pipeline context to generate relevant output.
 * This header includes:
 * - Pipe name and description (so the LLM knows the pipeline's purpose)
 * - Schema (so the LLM knows the data shape flowing through steps)
 * - All preceding steps (name, description, code) so the LLM understands
 *   what has already happened before the target step
 *
 * @param pipeData  - Full Pipe object from index.json
 * @param steps     - The steps array (same as pipeData.steps)
 * @param stepIndex - Zero-based index of the target step
 * @returns A formatted context string to prepend to any step-level prompt
 */
// deno-lint-ignore no-explicit-any
async function buildPipeContextHeader(pipeData: any, steps: any[], stepIndex: number): Promise<string> {
  const parts: string[] = [];

  // Start with the comprehensive Pipedown system prompt so the LLM
  // understands the framework's conventions (input object, opts, $p,
  // conditionals, imports, etc.) before seeing the specific pipeline.
  parts.push(await getPipedownSystemPrompt());

  // ── Pipeline-specific metadata ──
  // Gives the LLM the "big picture" for this particular pipeline.
  parts.push(`## This Pipeline`);
  parts.push(`\nPipeline name: ${pipeData.name || "unnamed"}`);
  if (pipeData.pipeDescription) {
    parts.push(`Pipeline description: ${pipeData.pipeDescription}`);
  }
  if (pipeData.schema) {
    parts.push(`Pipeline schema:\n\`\`\`zod\n${pipeData.schema}\n\`\`\``);
  }
  if (pipeData.config) {
    // Surface relevant config (inputs, build settings) so the LLM
    // understands what test data exists and how the pipe is configured.
    const { inputs, ...rest } = pipeData.config;
    if (inputs && inputs.length > 0) {
      parts.push(`\nTest inputs (${inputs.length} entries):\n\`\`\`json\n${JSON.stringify(inputs.slice(0, 3), null, 2)}\n\`\`\``);
    }
    if (Object.keys(rest).length > 0) {
      parts.push(`\nConfig:\n\`\`\`json\n${JSON.stringify(rest, null, 2)}\n\`\`\``);
    }
  }

  // ── Preceding steps ──
  // The LLM needs to understand what data transformations have already
  // occurred before the target step so it can generate coherent titles,
  // descriptions, or code improvements.
  const preceding = steps.slice(0, stepIndex);
  if (preceding.length > 0) {
    parts.push("\n## Preceding steps in this pipeline:");
    preceding.forEach((s: { name: string; description?: string; code: string; config?: any }, i: number) => {
      parts.push(`\n### Step ${i + 1}: ${s.name}`);
      if (s.description) parts.push(`Description: ${s.description}`);
      if (s.config) parts.push(`Conditionals: ${JSON.stringify(s.config)}`);
      parts.push(`Code:\n\`\`\`ts\n${s.code}\n\`\`\``);
    });
  }

  return parts.join("\n");
}

const lazyIO = std.debounce(async (input = { errors: [] }) => {
  Object.assign(input, await pdBuild(input));
  _controller && _controller.enqueue("data: reload\n\n");
  if (input.errors && input.errors.length > 0) {
    reportErrors(input);
  }
  input.errors = [];
}, 200);

// ── Template Helpers ──

/**
 * Ensures a standard template (e.g. trace.ts, cli.ts) exists in a pipe's
 * `.pd/{pipeName}/` directory. Templates are only written there during build
 * if the project has configured them (via `pd init`). This helper fills the
 * gap by copying from pipedown's own source templates on first use.
 *
 * The templates use relative imports (`import pipe from "./index.ts"`) so
 * they must live alongside the compiled index.ts/index.json in the pipe dir.
 *
 * @param pipeDir      - Absolute path to `.pd/{pipeName}/`
 * @param templateName - File name of the template (e.g. "trace.ts", "cli.ts")
 * @returns Absolute path to the template in the pipe directory
 */
async function ensureTemplate(pipeDir: string, templateName: string): Promise<string> {
  const dest = std.join(pipeDir, templateName);
  if (!await std.exists(dest)) {
    // Ref: templates/ in the pipedown source tree — these are the canonical
    // versions that `pd init` scaffolds into user projects.
    const source = new URL(`../templates/${templateName}`, import.meta.url);
    await Deno.copyFile(source, dest);
  }
  return dest;
}

// Helper to resolve a project path from the registry by name
async function resolveProject(name: string): Promise<{ name: string; path: string } | null> {
  const raw = await readProjectsRegistry();
  return raw.find((p) => p.name === name) || null;
}

// Helper to run a shell command and stream output back
/**
 * Spawn a child process and stream its combined stdout+stderr as an HTTP response.
 *
 * The response is returned immediately (streaming), so the caller can send
 * it to the HTTP client while the process is still running. The optional
 * `onComplete` callback fires when the process finishes — this is used to
 * notify the Tauri desktop app via Unix socket IPC.
 *
 * @param cmd      - Command and arguments array (e.g., ["deno", "run", ...])
 * @param cwd      - Working directory for the child process
 * @param onComplete - Optional callback invoked with the exit success status
 *                     when the process finishes. Fire-and-forget; errors are ignored.
 *
 * Ref: https://docs.deno.com/api/deno/~/Deno.Command
 * Ref: https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream
 */
function spawnAndStream(cmd: string[], cwd?: string, onComplete?: (success: boolean) => void): Response {
  const process = new Deno.Command(cmd[0], {
    args: cmd.slice(1),
    stdout: "piped",
    stderr: "piped",
    cwd,
  });
  const child = process.spawn();
  const merged = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const dec = new TextDecoder();
      async function pump(stream: ReadableStream<Uint8Array>) {
        const reader = stream.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(enc.encode(dec.decode(value)));
        }
      }
      await Promise.all([pump(child.stdout), pump(child.stderr)]);
      controller.close();

      // After both streams are drained, the process has finished.
      // Fire the completion callback (used for Tauri IPC notifications).
      if (onComplete) {
        try {
          const status = await child.status;
          onComplete(status.success);
        } catch {
          onComplete(false);
        }
      }
    },
  });
  return new Response(merged, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

async function watchFs(input: BuildInput) {
  for await (const event of Deno.watchFs(Deno.cwd(), { recursive: true })) {
    const pathRegex = new RegExp(/\.pd|deno|dist|\.git|\.vscode|\.github|\.cache|\.history|\.log|\.lock|\.swp/)
    const notInProtectedDir = event.paths.every((path) => !path.match(pathRegex));

    const extensions = [".md"];
    const hasValidExtension = event.paths.every((path) =>
      extensions.some((ext) => path.endsWith(ext))
  );

  if (
    event.kind === "modify" && event.paths.length === 1 &&
    notInProtectedDir && hasValidExtension
  ) {
      const fileName = event.paths[0];
      console.log(std.colors.brightGreen(`File changed: ${fileName}`));
      lazyIO(Object.assign(input, { match: fileName }));
    }
  }
}

function tellClientToReload() {
  const body = new ReadableStream({
    start(controller) {
      _controller = controller;
    },
    cancel() {
      // _controller = null;
    },
  });

  return new Response(body.pipeThrough(new TextEncoderStream()), {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      "connection": "keep-alive",
    },
  });
}

function findOpenPort(defaultPort = 8000){
  let port = defaultPort;
  while(true){
    try {
      Deno.listen({port});
    } catch (e) {
      port += 1;
      continue;
    }
    return port;
  }
}

export async function serve(input: BuildInput){
  pdBuild(input);
  watchFs(input);

  const hostname = "127.0.0.1";
  const port = findOpenPort(8888);

  const handler = async (request: Request) => {
    const url = new URL(request.url);

    // --- Home dashboard API routes ---

    // Recent pipes (flat list across all projects)
    if (url.pathname === "/api/recent-pipes") {
      const pipes = await scanRecentPipes();
      // no-store prevents the browser from caching the pipe list — stale
      // responses here would hide newly created or recently modified pipes.
      // Ref: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control#no-store
      return new Response(JSON.stringify(pipes), {
        headers: { "content-type": "application/json", "cache-control": "no-store" },
      });
    }

    // Pipe index.json (parsed pipe data for toolbar binding)
    if (url.pathname.match(/^\/api\/projects\/[^/]+\/pipes\/[^/]+\/index$/)) {
      const segments = url.pathname.split("/");
      const projectName = decodeURIComponent(segments[3]);
      const pipeName = decodeURIComponent(segments[5]);
      const project = await resolveProject(projectName);
      if (!project) return new Response("Project not found", { status: 404 });
      const data = await readPipeIndex(project.path, pipeName);
      if (!data) return new Response("Pipe index not found (run pd build first)", { status: 404 });
      // no-store ensures refreshPipe() always gets the latest index.json
      // after LLM actions or manual edits rebuild .pd/. Without this header,
      // XHR-based m.request() may serve a cached 200 and the UI won't update.
      // Ref: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control#no-store
      return new Response(JSON.stringify(data), {
        headers: { "content-type": "application/json", "cache-control": "no-store" },
      });
    }

    // Traces for a specific pipe.
    // When ?step=N is present → return step-level before/after traces.
    // When ?step is absent → return pipe-level input/output traces.
    // Ref: homeDashboard.ts recentStepTraces / recentPipeTraces
    if (url.pathname.match(/^\/api\/projects\/[^/]+\/pipes\/[^/]+\/traces$/)) {
      const segments = url.pathname.split("/");
      const projectName = decodeURIComponent(segments[3]);
      const pipeName = decodeURIComponent(segments[5]);
      const stepParam = url.searchParams.get("step");
      const limitParam = url.searchParams.get("limit");
      const limit = limitParam ? parseInt(limitParam) : 5;

      let data;
      if (stepParam !== null) {
        // Step-level traces: return before/after for the given step index.
        const stepIndex = parseInt(stepParam);
        data = await recentStepTraces(projectName, pipeName, stepIndex, limit);
      } else {
        // Pipe-level traces: return the whole-pipeline input/output.
        data = await recentPipeTraces(projectName, pipeName, limit);
      }
      return new Response(JSON.stringify(data), {
        headers: { "content-type": "application/json" },
      });
    }

    // --- Action API routes (POST) ---

    if (request.method === "POST" && url.pathname === "/api/llm") {
      try {
        const body = await request.json();
        const { action, project: projectName, pipe: pipeName, stepIndex, prompt: userPrompt } = body;
        const project = await resolveProject(projectName);
        if (!project) return new Response("Project not found", { status: 404 });
        // Optimistic rebuild: recompile .md → .pd/ before LLM reads pipe context
        await buildProject(project.path);

        // Load the full Pipe object from index.json (not just steps).
        // We need the complete object — including rawSource, mdPath, sourceMap,
        // config, schema, etc. — so we can mutate it and use pipeToMarkdown()
        // to write the LLM result back to the source .md file.
        // Ref: see syncCommand.ts for the same load-mutate-write pattern
        const pipeDir = std.join(project.path, ".pd", pipeName);
        const indexJsonPath = std.join(pipeDir, "index.json");
        const pipeData = JSON.parse(await Deno.readTextFile(indexJsonPath));
        const steps = pipeData.steps || [];

        let result: string;
        // Track whether the sync succeeded so we can inform the frontend
        let synced = false;

        // ── Shared step summary ──
        // Several prompts need a compact view of all steps (name + code).
        // Build it once so each action branch can reference it.
        const stepsOverview = JSON.stringify(
          steps.map((s: { name: string; code: string; description?: string; config?: any }) => ({
            name: s.name,
            code: s.code,
            ...(s.description ? { description: s.description } : {}),
            ...(s.config ? { conditionals: s.config } : {}),
          })),
          null,
          2,
        );

        if (action === "description") {
          // ── Description generation ──
          // Uses the full Pipedown system prompt so the LLM understands the
          // framework conventions and can write a description that references
          // the input object flow, conditionals, and execution modes accurately.
          const contextPrompt = `${await getPipedownSystemPrompt()}

## Your Task

Generate a concise 1-2 sentence description for this Pipedown pipeline based on its steps. The description should explain what the pipeline does at a high level — what data it processes, what side effects it has, and what it produces on the \`input\` object.

### Pipeline name: ${pipeData.name || "unnamed"}

### Steps:
${stepsOverview}

### Rules:
- Output ONLY the description text — no markdown formatting, no quotes, no preamble.
- Focus on the pipeline's purpose and data flow, not implementation details.
- Reference the key \`input\` properties the pipeline reads and writes.`;
          result = await callLLM(contextPrompt);
          // Persist: set the pipe-level description field
          pipeData.pipeDescription = result;
        } else if (action === "schema") {
          // ── Zod schema generation ──
          // The LLM needs to understand Pipedown's input object conventions
          // (input.errors, input.request, input.mode, etc.) to generate a
          // schema that validates both user-defined and framework-set properties.
          const contextPrompt = `${await getPipedownSystemPrompt()}

## Your Task

Generate a Zod schema that validates the \`input\` object for this Pipedown pipeline. The schema should cover all properties that steps read from and write to \`input\`.

### Pipeline name: ${pipeData.name || "unnamed"}
${pipeData.pipeDescription ? `### Pipeline description: ${pipeData.pipeDescription}` : ""}

### Steps:
${stepsOverview}

### Rules:
- Output ONLY the Zod schema code — no markdown fences, no explanations, no imports.
- Use \`z.object({ ... })\` as the top-level shape.
- Include properties that steps explicitly read from or write to \`input\`.
- Mark optional properties with \`.optional()\` — only properties guaranteed to exist by the end should be required.
- Do NOT include framework-internal properties (\`input.errors\`, \`input.mode\`, \`input.request\`, \`input.response\`, \`input.flags\`, \`input.route\`) unless the pipeline's steps explicitly use them.
- Use descriptive \`.describe()\` annotations on non-obvious fields.
- Prefer \`z.unknown()\` over \`z.any()\` for untyped data.`;
          result = await callLLM(contextPrompt);
          // Strip markdown code fences if the LLM wrapped the output.
          // The LLM is instructed to return only the schema code, but may
          // include ```zod ... ``` or ```ts ... ``` fences anyway.
          pipeData.schema = stripCodeFences(result);
        } else if (action === "tests") {
          // ── Test input generation ──
          // The LLM needs to understand that test inputs are passed as the
          // initial `input` object and snapshot-tested via `pd test`.
          // Each entry needs `_name` for labeling in test output.
          const contextPrompt = `${await getPipedownSystemPrompt()}

## Your Task

Generate test input objects for this Pipedown pipeline. Each object becomes the initial \`input\` passed to the pipeline and is snapshot-tested with \`pd test\`.

### Pipeline name: ${pipeData.name || "unnamed"}
${pipeData.pipeDescription ? `### Pipeline description: ${pipeData.pipeDescription}` : ""}
${pipeData.schema ? `### Pipeline schema:\n\`\`\`zod\n${pipeData.schema}\n\`\`\`` : ""}

### Steps:
${stepsOverview}

### Rules:
- Output ONLY a JSON array — no markdown fences, no explanations.
- Every object MUST have a \`_name\` string property that describes the test scenario (used as the snapshot test label).
- Include at least 3-5 test cases covering:
  - A happy-path / normal input
  - Edge cases (empty values, missing optional fields)
  - Error conditions (invalid data that should trigger error handling)
  - Conditional paths (inputs that activate different \`check:\`/\`not:\`/\`route:\` branches)
- Only include properties that the pipeline's first steps actually read from \`input\`.
- Use realistic but deterministic values (avoid random data, timestamps, or UUIDs that would break snapshots).
- If the pipeline uses \`input.flags\`, include a test with flags set.
- If the pipeline uses \`input.request\`, note that server-mode properties are set by the framework — test inputs should only include user-domain data.`;
          result = await callLLM(contextPrompt);
          // Parse the LLM's JSON array into config.inputs.
          // The LLM may return markdown-fenced JSON — strip fences first.
          try {
            const cleaned = stripCodeFences(result);
            const parsed = JSON.parse(cleaned);
            // Ensure config object exists before setting inputs
            if (!pipeData.config) pipeData.config = {};
            pipeData.config.inputs = Array.isArray(parsed) ? parsed : [parsed];
          } catch {
            // If parsing fails, skip the sync but still return the raw result
            // so the user can see what the LLM produced.
            console.error("Could not parse LLM test output as JSON — skipping sync");
          }
        } else if (action === "step-title" && stepIndex !== undefined) {
          const { step } = findTargetStep(steps, "" + stepIndex);
          // Build a full-context prompt so the LLM understands where this step
          // sits within the pipeline. Includes the Pipedown system prompt, pipe
          // metadata, and all preceding steps.
          const pipeContext = await buildPipeContextHeader(pipeData, steps, stepIndex);
          const contextPrompt = `${pipeContext}

## Your Task

Suggest a better title for this pipeline step. The title becomes a markdown heading (## Title) in the source file.

### Current step:
Title: ${step.name}
Code:
\`\`\`ts
${step.code}
\`\`\`

### Rules:
- Output ONLY the title text — no markdown formatting, no quotes, no heading markers.
- Keep it concise (2-5 words).
- Use imperative verb form (e.g., "Fetch User Data", "Validate Input", "Build Response").
- The title should describe what the step does in the context of the overall pipeline.`;
          result = await callLLM(contextPrompt);
          // Persist: update the step's heading name in the pipe data
          pipeData.steps[stepIndex].name = result.trim();
        } else if (action === "step-description" && stepIndex !== undefined) {
          const { step } = findTargetStep(steps, "" + stepIndex);
          // Include full pipeline context so the LLM can write a description
          // that accurately reflects how this step relates to earlier steps
          // and the overall pipeline purpose.
          const pipeContext = await buildPipeContextHeader(pipeData, steps, stepIndex);
          const contextPrompt = `${pipeContext}

## Your Task

Write a brief description for this pipeline step. The description appears as a paragraph between the heading and the code block in the markdown source.

### Current step:
Title: ${step.name}
Code:
\`\`\`ts
${step.code}
\`\`\`

### Rules:
- Output ONLY the description text — no markdown formatting, no quotes.
- Keep it to 1-2 sentences.
- Explain what the step does and why, referencing the \`input\` properties it reads/writes.
- If the step has conditionals, mention when it runs.`;
          result = await callLLM(contextPrompt);
          // Persist: set the step's description paragraph
          pipeData.steps[stepIndex].description = result.trim();
        } else if (action === "step-code" && stepIndex !== undefined) {
          // buildContextPrompt already includes the Pipedown system prompt and
          // preceding steps, but we enhance it with pipe-level metadata (name,
          // description, schema, config) via buildPipeContextHeader so the LLM
          // understands the broader pipeline purpose.
          const pipeContext = await buildPipeContextHeader(pipeData, steps, stepIndex);
          const codePrompt = await buildContextPrompt(steps, stepIndex, userPrompt || "Improve this code");
          const contextPrompt = `${pipeContext}\n${codePrompt}`;
          result = await callLLM(contextPrompt);
          // Strip markdown code fences if the LLM wrapped the output.
          // The prompt asks for code-only, but LLMs often wrap in ```ts ... ```
          pipeData.steps[stepIndex].code = stripCodeFences(result);
        } else {
          return new Response("Unknown action: " + action, { status: 400 });
        }

        // ── Sync LLM result back to the source markdown file ──
        // This mirrors the `pd sync` command: convert the mutated Pipe JSON
        // back to markdown via pipeToMarkdown(), write it to the original .md
        // path, then rebuild so .pd/ reflects the new source.
        // Ref: syncCommand.ts for the same pattern
        if (pipeData.mdPath) {
          try {
            console.log(pipeData);
            const markdown = pipeToMarkdown(pipeData);
            console.log(std.colors.brightGreen(`Syncing LLM result back to ${pipeData.mdPath}`));
            console.log(markdown);
            await Deno.writeTextFile(pipeData.mdPath, markdown);
            // Rebuild so the .pd/ directory (index.json, index.ts) stays in
            // sync with the updated markdown source
            await buildProject(project.path);
            // Notify SSE clients so the UI refreshes immediately — without
            // this, only the requesting tab's onDone callback would refresh,
            // and other open tabs/windows would stay stale until the file
            // watcher's debounced rebuild fires (~200ms later).
            // Matches the pattern used by /api/extract and /api/projects/{name}/files/{path}.
            try { _controller?.enqueue("data: reload\n\n"); } catch { /* SSE client may have disconnected */ }
            synced = true;
          } catch (syncErr) {
            // Log but don't fail the request — the LLM result is still valid
            console.error("Sync-back failed:", (syncErr as Error).message);
          }
        }

        // Notify the Tauri desktop app that an LLM action completed.
        // This triggers a native macOS notification so the user knows
        // the (potentially slow) LLM operation has finished.
        notifyTauri({
          type: "llm_complete",
          title: `LLM ${action} Complete`,
          message: `${action} for ${pipeName}${synced ? " (synced)" : ""}`,
          project: projectName,
          pipe: pipeName,
          success: true,
        });

        return new Response(JSON.stringify({ result, synced }), {
          headers: { "content-type": "application/json" },
        });
      } catch (e) {
        // Notify Tauri about the error too — the user might have switched
        // to another app while waiting for the LLM response.
        notifyTauri({
          type: "error",
          title: "LLM Action Failed",
          message: (e as Error).message,
          success: false,
        });
        return new Response(JSON.stringify({ error: (e as Error).message }), {
          status: 500,
          headers: { "content-type": "application/json" },
        });
      }
    }

    // ── Extract steps into a new sub-pipe ──
    // POST /api/extract — splits selected steps out of a parent pipe into a
    // new .md file and replaces them with a delegation step in the parent.
    // Follows the same resolve → build → mutate → write → rebuild pattern as
    // /api/llm above.
    // Ref: extractSteps.ts — performExtraction orchestrates the whole operation
    if (request.method === "POST" && url.pathname === "/api/extract") {
      try {
        const body = await request.json();
        const { project: projectName, pipe: pipeName, stepIndices, newName } = body;

        if (!projectName || !pipeName || !stepIndices || !newName) {
          return new Response(
            JSON.stringify({ error: "Missing required fields: project, pipe, stepIndices, newName" }),
            { status: 400, headers: { "content-type": "application/json" } },
          );
        }

        const project = await resolveProject(projectName);
        if (!project) return new Response("Project not found", { status: 404 });

        // Optimistic rebuild: ensure .pd/ is current before reading pipe data
        await buildProject(project.path);

        // Load the full Pipe object from index.json — includes rawSource,
        // sourceMap, mdPath, config, and all step metadata needed for extraction.
        const pipeDir = std.join(project.path, ".pd", pipeName);
        const indexJsonPath = std.join(pipeDir, "index.json");
        let pipeData;
        try {
          pipeData = JSON.parse(await Deno.readTextFile(indexJsonPath));
        } catch {
          return new Response(
            JSON.stringify({ error: `Pipe "${pipeName}" not found (run pd build first)` }),
            { status: 404, headers: { "content-type": "application/json" } },
          );
        }

        // ── Determine output path for the new pipe file ──
        // Created as a sibling of the parent .md file (same directory).
        const parentMdPath = pipeData.mdPath;
        if (!parentMdPath) {
          return new Response(
            JSON.stringify({ error: "Pipe has no mdPath — cannot determine source location" }),
            { status: 500, headers: { "content-type": "application/json" } },
          );
        }

        const parentDir = std.dirname(parentMdPath);
        const newFileName = toKebabCase(newName) + ".md";
        const newFilePath = std.join(parentDir, newFileName);

        // ── File collision guard ──
        // Refuse to overwrite to prevent accidental data loss.
        if (await std.exists(newFilePath)) {
          return new Response(
            JSON.stringify({ error: `File already exists: ${newFileName}. Choose a different name.` }),
            { status: 409, headers: { "content-type": "application/json" } },
          );
        }

        // ── Perform the extraction ──
        const { newPipeMarkdown, modifiedParentMarkdown } = performExtraction(
          pipeData,
          stepIndices,
          newName,
        );

        // ── Write both files ──
        await Deno.writeTextFile(newFilePath, newPipeMarkdown);
        await Deno.writeTextFile(parentMdPath, modifiedParentMarkdown);

        // ── Rebuild so .pd/ reflects both the new and modified pipes ──
        await buildProject(project.path);

        // ── Notify SSE clients to refresh the UI ──
        if (_controller) {
          _controller.enqueue("data: reload\n\n");
        }

        // Notify the Tauri desktop app about the extraction
        notifyTauri({
          type: "llm_complete",
          title: "Extract Complete",
          message: `Extracted ${stepIndices.length} step(s) from ${pipeName} → ${newFileName}`,
          project: projectName,
          pipe: pipeName,
          success: true,
        });

        return new Response(
          JSON.stringify({ success: true, newPipePath: newFilePath, parentModified: true }),
          { headers: { "content-type": "application/json" } },
        );
      } catch (e) {
        notifyTauri({
          type: "error",
          title: "Extract Failed",
          message: (e as Error).message,
          success: false,
        });
        return new Response(
          JSON.stringify({ error: (e as Error).message }),
          { status: 500, headers: { "content-type": "application/json" } },
        );
      }
    }

    if (request.method === "POST" && url.pathname === "/api/run") {
      try {
        const body = await request.json();
        const project = await resolveProject(body.project);
        if (!project) return new Response("Project not found", { status: 404 });
        // Optimistic rebuild: recompile .md → .pd/ before running
        await buildProject(project.path);
        const pipeDir = std.join(project.path, ".pd", body.pipe);
        const configPath = std.join(project.path, ".pd", "deno.json");

        // Run the pipe via the standard trace.ts template — the same entry
        // point the CLI uses (`pd run --trace`). trace.ts imports the
        // compiled pipe, executes pipe.process(), writes a trace file to
        // ~/.pipedown/traces/, and outputs JSON.
        // Input is passed as a CLI arg; Deno.Command handles escaping.
        // Ref: templates/trace.ts for the full implementation
        const traceTsPath = await ensureTemplate(pipeDir, "trace.ts");
        return spawnAndStream(
          [Deno.execPath(), "run", "--unstable-kv", "-A", "-c", configPath, "--no-check",
           traceTsPath, "--input", body.input || "{}", "--json"],
          project.path,
          // Notify Tauri + SSE clients when the pipe run finishes.
          // The SSE broadcast tells the frontend which pipe was just executed
          // so it can auto-focus it for quick inspection.
          // The notification fires after the stream is fully consumed.
          (success) => {
            notifyTauri({
              type: "run_complete",
              title: success ? "Pipe Run Complete" : "Pipe Run Failed",
              message: `${body.pipe}${success ? "" : " encountered errors"}`,
              project: body.project,
              pipe: body.pipe,
              success,
            });
            broadcastSSE({ type: "pipe_executed", project: body.project, pipe: body.pipe });
          },
        );
      } catch (e) {
        return new Response("Error: " + (e as Error).message, { status: 500 });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/run-step") {
      try {
        const body = await request.json();
        const project = await resolveProject(body.project);
        if (!project) return new Response("Project not found", { status: 404 });
        // Optimistic rebuild: recompile .md → .pd/ before running step
        await buildProject(project.path);

        const pipeDir = std.join(project.path, ".pd", body.pipe);
        const configPath = std.join(project.path, ".pd", "deno.json");

        // Use the pdPipe runtime's built-in `input.stop` guard to halt
        // execution after the target step index. When a step's index
        // exceeds `input.stop`, the guard returns `input` unchanged.
        // Ref: pdPipe/pdUtils.ts — `if (index > stop) return input;`
        const inputObj = JSON.parse(body.input || "{}");
        inputObj.stop = body.stepIndex;
        const inputJson = JSON.stringify(inputObj);

        // Run via cli.ts (not trace.ts) — partial runs don't need trace
        // files and the frontend intentionally skips loadDrawerTrace()
        // for step runs to avoid showing stale trace data.
        // Ref: state.js runToStep() comment
        const cliTsPath = await ensureTemplate(pipeDir, "cli.ts");
        return spawnAndStream(
          [Deno.execPath(), "run", "--unstable-kv", "-A", "-c", configPath, "--no-check",
           cliTsPath, "--input", inputJson, "--json"],
          project.path,
          // Notify Tauri + SSE clients when the step run finishes.
          // Same auto-focus behavior as full pipe runs — the user wants to
          // see the pipe they just ran, even for partial step executions.
          (success) => {
            notifyTauri({
              type: "run_complete",
              title: success ? "Step Run Complete" : "Step Run Failed",
              message: `${body.pipe} (step ${body.stepIndex})`,
              project: body.project,
              pipe: body.pipe,
              success,
            });
            broadcastSSE({ type: "pipe_executed", project: body.project, pipe: body.pipe });
          },
        );
      } catch (e) {
        return new Response("Error: " + (e as Error).message, { status: 500 });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/test") {
      try {
        const body = await request.json();
        const project = await resolveProject(body.project);
        if (!project) return new Response("Project not found", { status: 404 });
        // Optimistic rebuild: recompile .md → .pd/ before testing
        await buildProject(project.path);
        return spawnAndStream(
          [Deno.execPath(), "test", "--unstable-kv", "-A", "--no-check"],
          project.path,
          // Notify Tauri when tests finish.
          (success) => notifyTauri({
            type: "test_complete",
            title: success ? "Tests Passed" : "Tests Failed",
            message: body.project,
            project: body.project,
            success,
          }),
        );
      } catch (e) {
        return new Response("Error: " + (e as Error).message, { status: 500 });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/pack") {
      try {
        const body = await request.json();
        const project = await resolveProject(body.project);
        if (!project) return new Response("Project not found", { status: 404 });
        // Optimistic rebuild: recompile .md → .pd/ before packing
        await buildProject(project.path);
        return spawnAndStream(
          [Deno.execPath(), "run", "-A", "--no-check", "jsr:@niceguyyo/pipedown", "pack"],
          project.path,
          // Notify Tauri when packing finishes.
          (success) => notifyTauri({
            type: "pack_complete",
            title: success ? "Pack Complete" : "Pack Failed",
            message: body.project,
            project: body.project,
            success,
          }),
        );
      } catch (e) {
        return new Response("Error: " + (e as Error).message, { status: 500 });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/open-editor") {
      try {
        const body = await request.json();
        const filePath = body.filePath;
        // Validate path is within a registered project
        const projects = await readProjectsRegistry();
        const isValid = projects.some((p) => filePath.startsWith(p.path));
        if (!isValid) return new Response("Path not within a registered project", { status: 403 });
        const cmd = new Deno.Command("code", { args: [filePath] });
        await cmd.output();
        return new Response("OK");
      } catch (e) {
        return new Response("Error: " + (e as Error).message, { status: 500 });
      }
    }

    // --- Existing API routes ---

    // ── Global Config API ──
    // GET /api/config — returns ~/.pipedown/config.json contents.
    // PUT /api/config — merges the JSON body into existing config and persists.
    // Ref: readGlobalConfig / writeGlobalConfig in projectsDashboard.ts
    if (url.pathname === "/api/config") {
      if (request.method === "GET") {
        const config = await readGlobalConfig();
        return new Response(JSON.stringify(config), {
          headers: { "content-type": "application/json" },
        });
      }
      if (request.method === "PUT") {
        try {
          const patch = await request.json();
          const merged = await writeGlobalConfig(patch);
          return new Response(JSON.stringify(merged), {
            headers: { "content-type": "application/json" },
          });
        } catch (e) {
          return new Response(
            JSON.stringify({ error: (e as Error).message }),
            { status: 500, headers: { "content-type": "application/json" } },
          );
        }
      }
    }

    // ── Create Project API ──
    // POST /api/projects — scaffolds a new project directory under the
    // configured newProjectDir and registers it in projects.json.
    // Body: { "name": "My Project" }
    // Returns the enriched project entry on success.
    // Ref: createProject in projectsDashboard.ts
    if (request.method === "POST" && url.pathname === "/api/projects") {
      try {
        const body = await request.json();
        if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
          return new Response(
            JSON.stringify({ error: "Project name is required" }),
            { status: 400, headers: { "content-type": "application/json" } },
          );
        }
        const entry = await createProject(body.name.trim());

        // Return enriched version so frontend has all display fields
        const enriched = await enrichProjects([entry]);
        return new Response(JSON.stringify(enriched[0]), {
          headers: { "content-type": "application/json" },
        });
      } catch (e) {
        const msg = (e as Error).message;
        // createProject throws "ALREADY_EXISTS" when the directory is taken
        const status = msg === "ALREADY_EXISTS" ? 409 : 500;
        return new Response(
          JSON.stringify({ error: status === 409 ? "A project with that name already exists" : msg }),
          { status, headers: { "content-type": "application/json" } },
        );
      }
    }

    // Projects API: list all projects enriched with mtime.
    // The GET guard is required because POST /api/projects (above) handles
    // project creation — without it this route would swallow POST requests.
    if (request.method === "GET" && url.pathname === "/api/projects") {
      const raw = await readProjectsRegistry();
      const enriched = await enrichProjects(raw);
      return new Response(JSON.stringify(enriched), {
        headers: { "content-type": "application/json" },
      });
    }

    // Projects API: list pipes for a project
    if (url.pathname.match(/^\/api\/projects\/[^/]+\/pipes$/)) {
      const name = decodeURIComponent(url.pathname.split("/")[3]);
      const raw = await readProjectsRegistry();
      const project = raw.find((p) => p.name === name);
      if (!project) {
        return new Response("Project not found", { status: 404 });
      }
      try {
        let pipes;
        if (project.pipes) {
          pipes = await Promise.all(project.pipes.map(async (p) => {
            const absPath = std.join(project.path, p.path);
            try {
              const stat = await Deno.stat(absPath);
              return { name: p.name, path: p.path, mtime: stat.mtime?.toISOString() || null };
            } catch {
              return { name: p.name, path: p.path, mtime: null };
            }
          }));
          pipes.sort((a: { mtime: string | null }, b: { mtime: string | null }) =>
            (b.mtime || "").localeCompare(a.mtime || ""));
        } else {
          pipes = await scanProjectPipes(project.path);
        }
        return new Response(JSON.stringify(pipes), {
          headers: { "content-type": "application/json" },
        });
      } catch {
        return new Response("Project directory not accessible", { status: 404 });
      }
    }

    // ── Projects API: write a markdown file ──
    // POST /api/projects/{name}/files/{path}
    // Accepts raw markdown text in the request body, writes it to disk,
    // rebuilds the project's .pd/ directory, and notifies SSE clients.
    // Used by both "Save edits" (overwrite existing) and "New Pipe" (create new).
    // Ref: readPipeMarkdown in projectsDashboard.ts for the path-traversal guard
    if (
      request.method === "POST" &&
      url.pathname.match(/^\/api\/projects\/[^/]+\/files\/.+$/)
    ) {
      const segments = url.pathname.split("/");
      const name = decodeURIComponent(segments[3]);
      const filePath = decodeURIComponent(segments.slice(5).join("/"));
      const raw = await readProjectsRegistry();
      const project = raw.find((p) => p.name === name);
      if (!project) {
        return new Response("Project not found", { status: 404 });
      }
      try {
        // Resolve the absolute path and verify it doesn't escape the project
        // directory. std.join normalises ".." segments, then std.relative
        // confirms the result is still within the project root.
        // Ref: https://jsr.io/@std/path/doc/~/join
        const absPath = std.join(project.path, filePath);
        const rel = std.relative(project.path, absPath);
        if (rel.startsWith("..")) {
          return new Response("Path traversal not allowed", { status: 403 });
        }

        const content = await request.text();

        // Ensure parent directories exist — important when creating files in
        // subdirectories that don't yet exist (e.g. "subdir/new-pipe.md").
        // Ref: https://docs.deno.com/api/deno/~/Deno.mkdir
        const parentDir = std.dirname(absPath);
        await Deno.mkdir(parentDir, { recursive: true });

        await Deno.writeTextFile(absPath, content);

        // Rebuild the project so .pd/ reflects the new/updated markdown.
        await buildProject(project.path);

        // Notify SSE clients immediately — the file watcher's debounce
        // would add a ~200ms delay, so we send an explicit reload event.
        // Ref: _controller is the SSE stream controller (line 16)
        try {
          _controller?.enqueue("data: reload\n\n");
        } catch { /* SSE client may have disconnected — ignore */ }

        return new Response(JSON.stringify({ ok: true }), {
          headers: { "content-type": "application/json" },
        });
      } catch (e) {
        return new Response(
          JSON.stringify({ error: (e as Error).message || "Write failed" }),
          { status: 500, headers: { "content-type": "application/json" } },
        );
      }
    }

    // Projects API: read a markdown file
    if (url.pathname.match(/^\/api\/projects\/[^/]+\/files\/.+$/)) {
      const segments = url.pathname.split("/");
      const name = decodeURIComponent(segments[3]);
      const filePath = decodeURIComponent(segments.slice(5).join("/"));
      const raw = await readProjectsRegistry();
      const project = raw.find((p) => p.name === name);
      if (!project) {
        return new Response("Project not found", { status: 404 });
      }
      try {
        const content = await readPipeMarkdown(project.path, filePath);
        // no-store so refreshPipe() never gets a stale cached copy of the
        // markdown after an LLM action or manual save rewrites the file.
        // Ref: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control#no-store
        return new Response(content, {
          headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
        });
      } catch (e) {
        const status = (e as Error).message?.includes("traversal") ? 403 : 404;
        return new Response((e as Error).message || "File not found", { status });
      }
    }

    // Projects dashboard page
    if (url.pathname === "/projects") {
      return new Response(projectsPage(), {
        headers: { "content-type": "text/html", "cache-control": "no-store" },
      });
    }

    // Trace API: list all traces
    if (url.pathname === "/api/traces") {
      const traces = await scanTraces();
      return new Response(JSON.stringify(traces), {
        headers: { "content-type": "application/json" },
      });
    }

    // Trace API: get single trace file
    if (url.pathname.startsWith("/api/traces/")) {
      const segments = url.pathname.replace("/api/traces/", "").split("/");
      if (segments.length >= 3) {
        const project = decodeURIComponent(segments[0]);
        const pipe = decodeURIComponent(segments.slice(1, -1).join("/"));
        const file = decodeURIComponent(segments[segments.length - 1]);
        const home = Deno.env.get("HOME");
        if (home) {
          const filePath = std.join(home, ".pipedown", "traces", project, pipe, file);
          try {
            const trace = await readTrace(filePath);
            return new Response(JSON.stringify(trace), {
              headers: { "content-type": "application/json" },
            });
          } catch {
            return new Response("Trace not found", { status: 404 });
          }
        }
      }
      return new Response("Bad request", { status: 400 });
    }

    // Trace dashboard page
    if (url.pathname === "/traces") {
      return new Response(tracePage(), {
        headers: { "content-type": "text/html", "cache-control": "no-store" },
      });
    }

    // Frontend static assets (CSS + JS)
    if (url.pathname.startsWith("/frontend/")) {
      const frontendDir = new URL("./frontend/", import.meta.url).pathname;
      const filePath = std.join(frontendDir, url.pathname.replace("/frontend/", ""));
      // Prevent path traversal
      if (!filePath.startsWith(frontendDir)) {
        return new Response("Forbidden", { status: 403 });
      }
      try {
        const response = await std.serveFile(request, filePath);
        const ext = url.pathname.split(".").pop();
        if (ext === "css") response.headers.set("content-type", "text/css; charset=utf-8");
        if (ext === "js") response.headers.set("content-type", "text/javascript; charset=utf-8");
        response.headers.set("Access-Control-Allow-Origin", "*");
        // Disable caching in development so file edits are picked up immediately.
        // serveFile sets etag/last-modified by default which causes 304 responses;
        // removing them + setting no-store forces the browser to always fetch fresh.
        // Ref: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control
        response.headers.set("cache-control", "no-store");
        response.headers.delete("etag");
        response.headers.delete("last-modified");
        return response;
      } catch {
        return new Response("Not found", { status: 404 });
      }
    }

    // Static JS files (legacy, serves from CWD)
    if (url.pathname.endsWith(".js")) {
      const pathname = url.pathname;
      const response = await std.serveFile(request, "." + pathname);
      response.headers.set("Access-Control-Allow-Origin", "*");
      response.headers.set(
        "Access-Control-Allow-Headers",
        "Origin, X-Requested-With, Content-Type, Accept, Range",
      );
      // Disable caching for legacy JS files in development.
      response.headers.set("cache-control", "no-store");
      response.headers.delete("etag");
      response.headers.delete("last-modified");
      return response;
    }

    // SSE for hot reload
    if (url.pathname === "/sse") {
      return tellClientToReload();
    }

    // Default: home dashboard (recent pipes with toolbar overlays)
    return new Response(homePage(), {
      headers: { "content-type": "text/html", "cache-control": "no-store" },
    });
  }

  // ── Start Tauri Command Listener ──
  // If the Tauri desktop app is running, it may send commands to this server
  // via the Unix socket. We listen in the background — if the socket doesn't
  // exist yet, we retry periodically (the Tauri app may start after pd).
  //
  // Commands arrive as newline-delimited JSON:
  //   { "command": "run", "project": "myproj", "pipe": "fetchData" }
  //
  // We handle them by making internal HTTP requests to ourselves, which
  // reuses all the existing route logic without duplication.
  listenForTauriCommands(port);

  const server = Deno.serve({ handler, port, hostname });
  await server.finished.then(() => console.log("Server closed"));
}

/**
 * Listen for incoming commands from the Tauri desktop app via Unix socket.
 *
 * This function connects to the Tauri socket and reads commands. If the
 * socket isn't available (Tauri not running), it retries every 10 seconds.
 * Commands are dispatched by making internal HTTP requests to the pd server's
 * own API endpoints — this avoids duplicating route logic.
 *
 * @param serverPort - The port the pd HTTP server is listening on
 *
 * Ref: https://docs.deno.com/api/deno/~/Deno.connect
 */
async function listenForTauriCommands(serverPort: number): Promise<void> {
  // Retry loop: keep trying to connect to the Tauri socket.
  // The Tauri app may start before or after the pd server.
  while (true) {
    try {
      const conn = await Deno.connect({
        transport: "unix",
        path: TAURI_SOCKET_PATH,
      });
      console.log(std.colors.brightCyan("Connected to Tauri desktop app"));

      // Read commands from the socket. Each command is a JSON line.
      const decoder = new TextDecoderStream();
      const reader = conn.readable.pipeThrough(decoder).getReader();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log(std.colors.brightYellow("Tauri socket disconnected"));
          break;
        }

        buffer += value;
        // Process complete lines (newline-delimited JSON protocol)
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep incomplete last line in buffer

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          try {
            const cmd = JSON.parse(trimmed);
            // Dispatch the command by making an internal HTTP request.
            // This reuses all existing route logic (validation, build, etc.)
            await dispatchTauriCommand(cmd, serverPort);
          } catch (e) {
            console.error("Failed to parse Tauri command:", (e as Error).message);
          }
        }
      }
    } catch {
      // Socket not available — Tauri isn't running. Wait and retry.
    }

    // Wait before retrying connection
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
}

/**
 * Dispatch a command received from the Tauri app by making an internal
 * HTTP request to the pd server's own API.
 *
 * This approach avoids duplicating route logic — the Tauri command is
 * translated to an API call, which goes through the same handler as
 * browser-initiated requests.
 *
 * @param cmd - The parsed command object from the Tauri socket
 * @param port - The pd server's HTTP port for internal requests
 */
// deno-lint-ignore no-explicit-any
async function dispatchTauriCommand(cmd: any, port: number): Promise<void> {
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    switch (cmd.command) {
      case "run":
        await fetch(`${baseUrl}/api/run`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ project: cmd.project, pipe: cmd.pipe, input: cmd.input }),
        });
        break;
      case "test":
        await fetch(`${baseUrl}/api/test`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ project: cmd.project }),
        });
        break;
      case "pack":
        await fetch(`${baseUrl}/api/pack`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ project: cmd.project }),
        });
        break;
      default:
        console.log(`Unknown Tauri command: ${cmd.command}`);
    }
  } catch (e) {
    console.error(`Failed to dispatch Tauri command '${cmd.command}':`, (e as Error).message);
  }
}
