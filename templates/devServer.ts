/**
 * Pipedown Dev Server Template
 *
 * A development-mode HTTP server with:
 *   - File watching: rebuilds .pd/ when .md files change
 *   - Hot reload: dynamic re-import of the pipe module after rebuild
 *   - SSE push: browser auto-refresh via /__pd/sse endpoint
 *   - Verbose logging: structured req/res cycle output
 *   - Trace writing: per-request traces to $HOME/.pipedown/traces/
 *
 * Invoked via: pd serve <file> --dev
 * The production server.ts template is used for non-dev deployments.
 *
 * Ref: https://docs.deno.com/api/deno/~/Deno.serve
 */

import rawPipe from "./index.json" with { type: "json" };
import { parseArgs } from "jsr:@std/cli@1.0.28";
import { debounce } from "jsr:@std/async@1.2.0";
import $p from "jsr:@pd/pointers@0.1.1";

// ── Pipe config ──
// Same config system as server.ts — read from the generated index.json.
const pipeConfig: Record<string, unknown> = (rawPipe as Record<string, unknown>).config || {};

const corsOrigin: string | false = pipeConfig.cors
  ? (typeof pipeConfig.cors === "string" ? pipeConfig.cors as string : "*")
  : false;

const defaultContentType = (pipeConfig.defaultContentType as string) || "application/json";
const staticDir = pipeConfig.static as string | undefined;
const parseBody = pipeConfig.parseBody !== false;

// ── CLI flags ──
const flags = parseArgs(Deno.args);
const hostname = flags.host || "127.0.0.1";
const traceEnabled = flags["no-trace"] !== true;

// ── Colour helpers for terminal output ──
// Using ANSI escape codes directly to avoid importing @std/fmt/colors
// (keeps the template dependency-light).
// Ref: https://en.wikipedia.org/wiki/ANSI_escape_code#Colors
const c = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
  white: "\x1b[37m",
};

// ── Port discovery ──
// Probe upward from the default port to find an open one.
// Ref: https://docs.deno.com/api/deno/~/Deno.listen
function findOpenPort(defaultPort = 8000): number {
  let port = defaultPort;
  while (true) {
    try {
      const listener = Deno.listen({ port });
      listener.close();
      return port;
    } catch (_e) {
      port += 1;
    }
  }
}

const port = flags.port || findOpenPort();

// ── Dynamic pipe import ──
// We dynamically import the pipe module so we can re-import it after rebuilds
// without restarting the server process. Each import uses a unique query param
// to bust Deno's module cache.
// Ref: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/import
let pipe: { process: (input: Record<string, unknown>) => Promise<Record<string, unknown>>; stages?: unknown[] };
const pipeDir = new URL(".", import.meta.url).pathname;

async function loadPipe() {
  const mod = await import(`${pipeDir}index.ts?t=${Date.now()}`);
  pipe = mod.default;
}

await loadPipe();

// ── SSE controller ──
// A single SSE stream that pushes "reload" events to connected browsers.
// The /__pd/sse endpoint hands out the stream; on rebuild we enqueue a message.
// Ref: https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events
let sseController: ReadableStreamDefaultController<string> | null = null;

function sseResponse(): Response {
  const body = new ReadableStream<string>({
    start(controller) {
      sseController = controller;
    },
    cancel() {
      sseController = null;
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

// ── Request body parser ──
// Same logic as server.ts — parses incoming body by Content-Type into
// input.requestBody so pipe steps can access it directly.
// Ref: https://developer.mozilla.org/en-US/docs/Web/API/Request
async function parseRequestBody(request: Request): Promise<unknown> {
  if (!parseBody) return {};
  const ct = (request.headers.get("content-type") || "").toLowerCase();
  try {
    if (ct.includes("application/json")) {
      return await request.json();
    } else if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
      const fd = await request.formData();
      return Object.fromEntries(fd.entries());
    } else if (ct.includes("text/")) {
      return await request.text();
    }
  } catch { /* body parse failed — fall through */ }
  return {};
}

// ── Static file serving ──
async function maybeServeStatic(request: Request): Promise<Response | null> {
  if (!staticDir) return null;
  try {
    const { serveDir } = await import("jsr:@std/http/file-server");
    const response = await serveDir(request, { fsRoot: staticDir, quiet: true });
    if (response.status !== 404) return response;
  } catch { /* fall through */ }
  return null;
}

// ── CORS headers ──
const corsHeaders: Record<string, string> = corsOrigin
  ? {
      "Access-Control-Allow-Origin": corsOrigin,
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,PATCH,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
      "Access-Control-Max-Age": "86400",
    }
  : {};

// ── Trace infrastructure ──
// Reuses the same trace format as templates/trace.ts so traces appear in the
// dashboard at /traces. Each request produces one trace file.
// Ref: templates/trace.ts for the canonical format

interface TraceEntry {
  index: number;
  name: string;
  durationMs: number;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  delta: { added: string[]; modified: string[]; removed: string[] };
}

// Sanitize values for trace snapshots — truncates large strings and replaces
// base64 blobs with metadata placeholders.
const MAX_STRING_LENGTH = 1024;

function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") {
    if (/^data:[^;]+;base64,/.test(value)) {
      const mime = value.match(/^data:([^;]+);base64,/)?.[1] ?? "unknown";
      return `[base64 ${mime}: ${value.length.toLocaleString()} chars]`;
    }
    if (value.length > MAX_STRING_LENGTH) {
      return value.slice(0, MAX_STRING_LENGTH) + `... [truncated: ${(value.length - MAX_STRING_LENGTH).toLocaleString()} chars removed]`;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = sanitizeValue(v);
    }
    return result;
  }
  return value;
}

// Safe snapshot: structuredClone with excluded keys (Request, Response, etc.)
function safeSnapshot(
  input: Record<string, unknown>,
  exclude: string[] = ["request", "response", "event"],
): Record<string, unknown> {
  const snap: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (exclude.includes(key)) {
      snap[key] = `[${typeof value}]`;
      continue;
    }
    try {
      snap[key] = sanitizeValue(structuredClone(value));
    } catch {
      snap[key] = `[non-cloneable: ${typeof value}]`;
    }
  }
  return snap;
}

// Delta computation: which keys were added/modified/removed by a step.
function computeDelta(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): { added: string[]; modified: string[]; removed: string[] } {
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const added: string[] = [], modified: string[] = [], removed: string[] = [];
  for (const key of allKeys) {
    if (!(key in before)) added.push(key);
    else if (!(key in after)) removed.push(key);
    else if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) modified.push(key);
  }
  return { added, modified, removed };
}

// Resolve project name from config or directory name.
function resolveProjectName(): string {
  if (pipeConfig.name) return pipeConfig.name as string;
  // The devServer runs from .pd/{pipeName}/ so go up two levels for project root
  return Deno.cwd().split("/").pop() || "unknown";
}

const projectName = resolveProjectName();
const pipeName = (rawPipe as Record<string, unknown>).name as string || "unknown";

// Write a trace file in the dashboard-compatible format.
// Ref: $HOME/.pipedown/traces/{project}/{pipe}/{timestamp}.json
async function writeTrace(
  steps: TraceEntry[],
  originalInput: Record<string, unknown>,
  finalOutput: Record<string, unknown>,
  durationMs: number,
  requestMeta: { method: string; url: string; headers: Record<string, string> },
  responseMeta: { status: number; contentType: string; bodySize: number },
) {
  const home = Deno.env.get("HOME");
  if (!home) return;

  const traceDir = `${home}/.pipedown/traces/${projectName}/${pipeName}`;
  await Deno.mkdir(traceDir, { recursive: true });

  const now = new Date();
  const timestamp = now.toISOString();
  const fileTimestamp = timestamp.replace(/[:.]/g, "-");

  const trace = {
    pipeName,
    project: projectName,
    timestamp,
    durationMs,
    stepsTotal: steps.length,
    input: originalInput,
    output: safeSnapshot(finalOutput),
    steps,
    errors: (finalOutput as Record<string, unknown>).errors || [],
    // HTTP-specific extensions — extra metadata for server context.
    // The dashboard shows these in the Raw JSON tab.
    request: requestMeta,
    response: responseMeta,
  };

  const filePath = `${traceDir}/${fileTimestamp}.json`;
  await Deno.writeTextFile(filePath, JSON.stringify(trace, null, 2));
}

// ── Instrumented pipe execution ──
// Wraps each pipeline stage to capture before/after snapshots and timing,
// identical to trace.ts but operating per-request instead of per-CLI-run.

async function instrumentedProcess(
  input: Record<string, unknown>,
): Promise<{
  output: Record<string, unknown>;
  traceEntries: TraceEntry[];
  stageNames: string[];
  executedStages: string[];
  skippedStages: string[];
  totalDurationMs: number;
}> {
  const traceEntries: TraceEntry[] = [];
  const executedStages: string[] = [];
  const skippedStages: string[] = [];

  // Collect stage names before wrapping (the funcWrapper names them "{index}-{name}")
  const stages = (pipe as Record<string, unknown>).stages as Array<
    (input: Record<string, unknown>) => Promise<Record<string, unknown>>
  >;

  if (!stages) {
    // Fallback: pipe doesn't expose stages — just run process directly
    const start = performance.now();
    const output = await pipe.process(input);
    return {
      output,
      traceEntries: [],
      stageNames: [],
      executedStages: [],
      skippedStages: [],
      totalDurationMs: Math.round((performance.now() - start) * 100) / 100,
    };
  }

  const stageNames = stages.map((s) => s.name || "anonymous");
  const originalStages = [...stages];

  // Wrap stages with tracing
  const tracedStages = originalStages.map((stage, index) => {
    const traced = async function (inp: Record<string, unknown>) {
      const before = safeSnapshot(inp);
      const start = performance.now();
      const result = await stage(inp);
      const out = result || inp;
      const durationMs = Math.round((performance.now() - start) * 100) / 100;
      const after = safeSnapshot(out);

      // A stage that runs in <0.01ms with no delta likely got short-circuited
      // by a guard (route mismatch, method mismatch, etc.)
      const delta = computeDelta(before, after);
      const hasChanges = delta.added.length > 0 || delta.modified.length > 0 || delta.removed.length > 0;

      if (hasChanges || durationMs > 0.05) {
        executedStages.push(stage.name);
      } else {
        skippedStages.push(stage.name);
      }

      traceEntries.push({ index, name: stage.name, durationMs, before, after, delta });
      return out;
    };
    Object.defineProperty(traced, "name", { value: stage.name });
    return traced;
  });

  // Replace stages, run the pipeline, then restore
  (pipe as Record<string, unknown>).stages = tracedStages;
  const pipelineStart = performance.now();
  const output = await pipe.process(input);
  const totalDurationMs = Math.round((performance.now() - pipelineStart) * 100) / 100;
  (pipe as Record<string, unknown>).stages = originalStages;

  return { output, traceEntries, stageNames, executedStages, skippedStages, totalDurationMs };
}

// ── Request logging ──
// Prints a structured log block for each request/response cycle.

function logRequest(
  method: string,
  pathname: string,
  executedStages: string[],
  skippedStages: string[],
  totalStages: number,
  durationMs: number,
  status: number,
  contentType: string,
  bodySize: number,
  requestCt: string,
  requestBodySize: number,
) {
  const time = new Date().toLocaleTimeString("en-GB", { hour12: false });
  const statusColor = status < 300 ? c.green : status < 400 ? c.yellow : c.red;

  console.log(`${c.dim}┌─${c.reset} ${c.bold}${method}${c.reset} ${c.cyan}${pathname}${c.reset} ${c.dim}(${time})${c.reset}`);

  // Show which steps executed vs skipped
  if (executedStages.length > 0) {
    const names = executedStages.map((n) => n.replace(/^\d+-/, "")).join(", ");
    console.log(`${c.dim}│${c.reset}  ${c.green}Executed:${c.reset} ${names}`);
  }
  if (skippedStages.length > 0) {
    const names = skippedStages.map((n) => n.replace(/^\d+-/, "")).join(", ");
    console.log(`${c.dim}│${c.reset}  ${c.dim}Skipped:  ${names}${c.reset}`);
  }

  // Request body info (if present)
  if (requestBodySize > 0) {
    console.log(`${c.dim}│${c.reset}  ${c.magenta}Body in:${c.reset}  ${requestCt} (${formatBytes(requestBodySize)})`);
  }

  // Step count and timing
  console.log(`${c.dim}│${c.reset}  ${c.white}Steps:${c.reset}    ${executedStages.length}/${totalStages} ${c.dim}in${c.reset} ${durationMs}ms`);

  // Response
  console.log(`${c.dim}│${c.reset}  ${statusColor}${status}${c.reset} ${contentType} ${c.dim}(${formatBytes(bodySize)})${c.reset}`);
  console.log(`${c.dim}└─${c.reset}`);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── SSE script injection ──
// For HTML responses in dev mode, inject a tiny SSE client before </body>
// so the browser auto-reloads when the pipe is rebuilt.
const SSE_INJECT_SCRIPT = `<script>new EventSource("/__pd/sse").onmessage=()=>location.reload()</script>`;

function maybeInjectSSE(body: string, contentType: string): string {
  if (!contentType.includes("text/html")) return body;
  // Inject before closing </body> tag (case-insensitive)
  const idx = body.toLowerCase().lastIndexOf("</body>");
  if (idx !== -1) {
    return body.slice(0, idx) + SSE_INJECT_SCRIPT + "\n" + body.slice(idx);
  }
  // No </body> — append at end
  return body + SSE_INJECT_SCRIPT;
}

// ── Main request handler ──
const handler = async (request: Request): Promise<Response> => {
  const url = new URL(request.url);

  // Dev-only SSE endpoint for hot reload
  if (url.pathname === "/__pd/sse") {
    return sseResponse();
  }

  // CORS preflight
  if (corsOrigin && request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Static file serving
  const staticResponse = await maybeServeStatic(request);
  if (staticResponse) return staticResponse;

  // Parse request body
  const requestBody = await parseRequestBody(request);
  const requestCt = request.headers.get("content-type") || "";
  // Estimate request body size from content-length header
  const requestBodySize = parseInt(request.headers.get("content-length") || "0", 10);

  // Build the input object — same shape as server.ts
  const input: Record<string, unknown> = {
    request,
    requestBody,
    body: {},
    responseOptions: {
      headers: { "content-type": defaultContentType },
      status: 200,
    },
    mode: { server: true, deploy: false, dev: true },
  };

  // Run the pipeline with instrumentation
  const originalInput = safeSnapshot(input);
  const { output, traceEntries, executedStages, skippedStages, totalDurationMs } =
    await instrumentedProcess(input);

  // ── Error handling ──
  if (output.errors) {
    const errBody = JSON.stringify(output.errors);
    logRequest(
      request.method, url.pathname,
      executedStages, skippedStages, executedStages.length + skippedStages.length,
      totalDurationMs, 500, "application/json", errBody.length,
      requestCt, requestBodySize,
    );
    console.error(output.errors);
    return new Response(errBody, { status: 500 });
  }

  // ── Build response ──
  let response: Response;

  if (output.response) {
    response = output.response as Response;
    // Add CORS if configured
    if (corsOrigin) {
      try { response.headers.set("Access-Control-Allow-Origin", corsOrigin); } catch { /* immutable */ }
    }
  } else {
    const responseOptions = output.responseOptions as { headers: Record<string, string>; status: number };
    let ct = (responseOptions.headers["content-type"] || "").toLowerCase();

    // HTML content-type inference
    if (ct.startsWith(defaultContentType.toLowerCase()) && typeof output.body === "string") {
      const trimmed = (output.body as string).trimStart();
      if (trimmed.startsWith("<!") || trimmed.startsWith("<html") || trimmed.startsWith("<head") || trimmed.startsWith("<body")) {
        responseOptions.headers["content-type"] = "text/html; charset=utf-8";
      }
    }

    // JSON auto-serialization
    ct = (responseOptions.headers["content-type"] || "").toLowerCase();
    if (ct.startsWith("application/json") && typeof output.body === "object" && output.body !== null) {
      output.body = JSON.stringify(output.body);
    }

    // 404 fallback
    const bodyIsEmpty = output.body === undefined || output.body === null ||
      (typeof output.body === "object" && Object.keys(output.body as Record<string, unknown>).length === 0);
    if (bodyIsEmpty && responseOptions.status === 200) {
      response = new Response("Not Found", {
        status: 404,
        headers: { "content-type": "text/plain", ...corsHeaders },
      });
    } else {
      // CORS headers
      if (corsOrigin) Object.assign(responseOptions.headers, corsHeaders);

      // Inject SSE reload script into HTML responses
      let body = output.body as string;
      if (typeof body === "string") {
        body = maybeInjectSSE(body, responseOptions.headers["content-type"] || "");
      }

      response = new Response(body, responseOptions);
    }
  }

  // ── Logging ──
  const responseCt = response.headers.get("content-type") || "unknown";
  // Clone the response body to measure size without consuming it
  const responseClone = response.clone();
  let bodySize = 0;
  try {
    const buf = await responseClone.arrayBuffer();
    bodySize = buf.byteLength;
  } catch { /* streaming body — can't measure */ }

  logRequest(
    request.method, url.pathname,
    executedStages, skippedStages, executedStages.length + skippedStages.length,
    totalDurationMs, response.status, responseCt, bodySize,
    requestCt, requestBodySize,
  );

  // ── Trace writing ──
  // Write trace file asynchronously (fire-and-forget) so it doesn't slow down
  // the response. Errors are logged but don't affect the response.
  if (traceEnabled) {
    const reqHeaders: Record<string, string> = {};
    request.headers.forEach((v, k) => { reqHeaders[k] = v; });

    writeTrace(
      traceEntries,
      originalInput,
      output,
      totalDurationMs,
      { method: request.method, url: request.url, headers: reqHeaders },
      { status: response.status, contentType: responseCt, bodySize },
    ).catch((e) => console.error(`${c.red}Trace write failed:${c.reset}`, e));
  }

  return response;
};

// ── Start the server ──
const server = Deno.serve({ handler, port, hostname });

console.log(`\n${c.bold}${c.cyan}Pipedown Dev Server${c.reset}`);
console.log(`${c.dim}├─${c.reset} ${c.green}http://${hostname}:${port}${c.reset}`);
console.log(`${c.dim}├─${c.reset} Pipe: ${c.bold}${pipeName}${c.reset}`);
console.log(`${c.dim}├─${c.reset} SSE:  ${c.cyan}/__pd/sse${c.reset}`);
console.log(`${c.dim}├─${c.reset} Trace: ${traceEnabled ? `${c.green}on${c.reset}` : `${c.yellow}off${c.reset} (--no-trace)`}`);
if (corsOrigin) console.log(`${c.dim}├─${c.reset} CORS: ${c.green}${corsOrigin}${c.reset}`);
if (staticDir) console.log(`${c.dim}├─${c.reset} Static: ${c.cyan}${staticDir}${c.reset}`);
console.log(`${c.dim}└─${c.reset} Watching for .md changes...\n`);

// ── File watcher ──
// Watch for .md file changes, rebuild, re-import the pipe, and push SSE reload.
// Uses the same debounce pattern as buildandserve.ts and watchCommand.ts.
// The pdBuild import is dynamic because this template runs from .pd/{pipe}/
// and the build module is at the pipedown package root.
const pathRegex = /\.pd|deno|dist|\.git|\.vscode|\.github|\.cache|\.history|\.log|\.lock|\.swp|node_modules/;

// We need to import pdBuild dynamically since this runs from .pd/{pipe}/
// and we don't know the absolute path at template-write time. Instead, we
// shell out to `pd build` to trigger a rebuild — this is simpler and ensures
// the same build logic runs regardless of how pipedown is installed.
const rebuild = debounce(async (filePath: string) => {
  console.log(`\n${c.yellow}Rebuilding:${c.reset} ${filePath}`);
  const start = performance.now();

  try {
    // Shell out to pd build — this ensures the exact same build pipeline runs.
    // Ref: https://docs.deno.com/api/deno/~/Deno.Command
    const command = new Deno.Command(Deno.execPath(), {
      args: ["run", "-A", "--no-check", "jsr:@pd/pdcli", "build"],
      stdout: "piped",
      stderr: "piped",
    });
    const { success, stderr } = await command.output();

    if (!success) {
      const errText = new TextDecoder().decode(stderr);
      console.error(`${c.red}Build failed:${c.reset}\n${errText}`);
      return;
    }

    // Re-import the pipe with cache-busting query param
    await loadPipe();

    const duration = Math.round(performance.now() - start);
    console.log(`${c.green}Rebuilt${c.reset} in ${duration}ms — live at http://${hostname}:${port}\n`);

    // Push SSE reload event to all connected browsers
    try {
      sseController?.enqueue("data: reload\n\n");
    } catch {
      // Controller may have been closed — browser disconnected
      sseController = null;
    }
  } catch (e) {
    console.error(`${c.red}Rebuild error:${c.reset}`, e);
  }
}, 200);

// Start the file watcher — runs forever alongside the server.
// Ref: https://docs.deno.com/api/deno/~/Deno.watchFs
(async () => {
  for await (const event of Deno.watchFs(Deno.cwd(), { recursive: true })) {
    const notInProtectedDir = event.paths.every((path) => !path.match(pathRegex));
    const hasValidExtension = event.paths.every((path) => path.endsWith(".md"));

    if (
      event.kind === "modify" &&
      event.paths.length === 1 &&
      notInProtectedDir &&
      hasValidExtension
    ) {
      rebuild(event.paths[0]);
    }
  }
})();

server.finished.then(() => console.log("Dev server closed"));
