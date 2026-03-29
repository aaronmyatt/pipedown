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
import { enrichProjects, readProjectsRegistry, scanProjectPipes, readPipeMarkdown, projectsPage } from "./projectsDashboard.ts";
import { scanRecentPipes, readPipeIndex, recentStepTraces, recentPipeTraces, homePage } from "./homeDashboard.ts";
import { findTargetStep, buildContextPrompt, callLLM } from "./llmCommand.ts";

let _controller: ReadableStreamDefaultController<string> | null = null;

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
function buildPipeContextHeader(pipeData: any, steps: any[], stepIndex: number): string {
  const parts: string[] = [];

  parts.push("You are working on a step within a markdown-based pipeline.");

  // Pipe-level metadata gives the LLM the "big picture"
  parts.push(`\nPipeline name: ${pipeData.name || "unnamed"}`);
  if (pipeData.pipeDescription) {
    parts.push(`Pipeline description: ${pipeData.pipeDescription}`);
  }
  if (pipeData.schema) {
    parts.push(`Pipeline schema:\n\`\`\`zod\n${pipeData.schema}\n\`\`\``);
  }

  // Preceding steps provide the sequential context — the LLM needs to
  // understand what data transformations have already occurred before
  // the target step so it can generate coherent titles, descriptions,
  // or code improvements.
  const preceding = steps.slice(0, stepIndex);
  if (preceding.length > 0) {
    parts.push("\nPreceding steps in this pipeline:");
    preceding.forEach((s: { name: string; description?: string; code: string }, i: number) => {
      parts.push(`\nStep ${i + 1}: ${s.name}`);
      if (s.description) parts.push(`Description: ${s.description}`);
      parts.push(`Code:\n\`\`\`\n${s.code}\n\`\`\``);
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
function spawnAndStream(cmd: string[], cwd?: string): Response {
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
      return new Response(JSON.stringify(pipes), {
        headers: { "content-type": "application/json" },
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
      return new Response(JSON.stringify(data), {
        headers: { "content-type": "application/json" },
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

        if (action === "description") {
          const contextPrompt = `Generate a concise description for this pipeline based on its steps:\n${JSON.stringify(steps.map((s: { name: string; code: string }) => ({ name: s.name, code: s.code })), null, 2)}\n\nProvide only the description text, no markdown formatting.`;
          result = await callLLM(contextPrompt);
          // Persist: set the pipe-level description field
          pipeData.pipeDescription = result;
        } else if (action === "schema") {
          const contextPrompt = `Generate a Zod schema for the input/output of this pipeline:\n${JSON.stringify(steps.map((s: { name: string; code: string }) => ({ name: s.name, code: s.code })), null, 2)}\n\nProvide only the Zod schema code.`;
          result = await callLLM(contextPrompt);
          // Strip markdown code fences if the LLM wrapped the output.
          // The LLM is instructed to return only the schema code, but may
          // include ```zod ... ``` or ```ts ... ``` fences anyway.
          pipeData.schema = stripCodeFences(result);
        } else if (action === "tests") {
          const contextPrompt = `Generate test input objects for this pipeline:\n${JSON.stringify(steps.map((s: { name: string; code: string }) => ({ name: s.name, code: s.code })), null, 2)}\n\nProvide JSON array of test inputs.`;
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
          // sits within the pipeline. Includes pipe name, description, schema,
          // and all preceding steps — the same context that step-code gets via
          // buildContextPrompt, but focused on title generation.
          const pipeContext = buildPipeContextHeader(pipeData, steps, stepIndex);
          const contextPrompt = `${pipeContext}\nSuggest a better title for this pipeline step:\nCurrent title: ${step.name}\nCode:\n${step.code}\n\nProvide only the title text, no markdown formatting or quotes.`;
          result = await callLLM(contextPrompt);
          // Persist: update the step's heading name in the pipe data
          pipeData.steps[stepIndex].name = result.trim();
        } else if (action === "step-description" && stepIndex !== undefined) {
          const { step } = findTargetStep(steps, "" + stepIndex);
          // Include full pipeline context so the LLM can write a description
          // that accurately reflects how this step relates to earlier steps
          // and the overall pipeline purpose.
          const pipeContext = buildPipeContextHeader(pipeData, steps, stepIndex);
          const contextPrompt = `${pipeContext}\nWrite a brief description for this pipeline step:\nTitle: ${step.name}\nCode:\n${step.code}\n\nProvide only the description text, no markdown formatting.`;
          result = await callLLM(contextPrompt);
          // Persist: set the step's description paragraph
          pipeData.steps[stepIndex].description = result.trim();
        } else if (action === "step-code" && stepIndex !== undefined) {
          // buildContextPrompt already includes preceding steps, but we
          // enhance it with pipe-level metadata (name, description, schema)
          // so the LLM understands the broader pipeline purpose.
          const pipeContext = buildPipeContextHeader(pipeData, steps, stepIndex);
          const codePrompt = buildContextPrompt(steps, stepIndex, userPrompt || "Improve this code");
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
            synced = true;
          } catch (syncErr) {
            // Log but don't fail the request — the LLM result is still valid
            console.error("Sync-back failed:", (syncErr as Error).message);
          }
        }

        return new Response(JSON.stringify({ result, synced }), {
          headers: { "content-type": "application/json" },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: (e as Error).message }), {
          status: 500,
          headers: { "content-type": "application/json" },
        });
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

    // Projects API: list all projects enriched with mtime
    if (url.pathname === "/api/projects") {
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
        return new Response(content, {
          headers: { "content-type": "text/plain; charset=utf-8" },
        });
      } catch (e) {
        const status = (e as Error).message?.includes("traversal") ? 403 : 404;
        return new Response((e as Error).message || "File not found", { status });
      }
    }

    // Projects dashboard page
    if (url.pathname === "/projects") {
      return new Response(projectsPage(), {
        headers: { "content-type": "text/html" },
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
        headers: { "content-type": "text/html" },
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
      return response;
    }

    // SSE for hot reload
    if (url.pathname === "/sse") {
      return tellClientToReload();
    }

    // Default: home dashboard (recent pipes with toolbar overlays)
    return new Response(homePage(), {
      headers: { "content-type": "text/html" },
    });
  }

  console.log('wat')

  const server = Deno.serve({ handler, port, hostname });
  await server.finished.then(() => console.log("Server closed"));
}
