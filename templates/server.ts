import pipe from "./index.ts"
import rawPipe from "./index.json" with { type: "json" };
import {parseArgs} from "jsr:@std/cli@1.0.28";

// ── Environment detection ──
// Deno Deploy sets DENO_DEPLOYMENT_ID at runtime; used to skip local-only
// logic like port scanning and body parsing guards.
// Ref: https://docs.deno.com/deploy/api/runtime-environment/
const isDenoDeploy = Deno.env.has('DENO_DEPLOYMENT_ID');

// ── Pipe config ──
// Read pipe-level configuration from the generated index.json.
// Authors set these in their markdown JSON config block, e.g.:
//   { "cors": true, "defaultContentType": "text/html", "static": "./public" }
const pipeConfig: Record<string, unknown> = (rawPipe as Record<string, unknown>).config || {};

// cors: true | "<origin>" — auto-handle OPTIONS preflight + add CORS headers
// Ref: https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS
const corsOrigin: string | false = pipeConfig.cors
  ? (typeof pipeConfig.cors === "string" ? pipeConfig.cors as string : "*")
  : false;

// defaultContentType — override the default "application/json" for pipes that
// primarily serve HTML or other content types.
const defaultContentType = (pipeConfig.defaultContentType as string) || "application/json";

// static — directory path for automatic static file serving before pipe execution.
// Ref: https://jsr.io/@std/http/doc/file-server/~/serveDir
const staticDir = pipeConfig.static as string | undefined;

// parseBody — opt out of automatic request body parsing. Default: true.
const parseBody = pipeConfig.parseBody !== false;

// ── Port discovery ──
// On Deno Deploy the port is managed by the platform, so we skip scanning.
// Locally, we probe upward from the default port to find an open one.
// Ref: https://docs.deno.com/api/deno/~/Deno.listen
function findOpenPort(defaultPort = 8000){
  let port = defaultPort;
  if(isDenoDeploy) return port;
  while(true){
    try {
      Deno.listen({port});
    } catch (_e) {
      port += 1;
      continue;
    }
    return port;
  }
}

const flags = parseArgs(Deno.args);
const hostname = flags.host || "127.0.0.1";
const port = flags.port || findOpenPort();

// ── Request body parser ──
// Automatically parse the incoming request body based on Content-Type.
// The parsed result is placed on input.requestBody, keeping input.body as the
// response body (populated by pipe steps).
// Ref: https://developer.mozilla.org/en-US/docs/Web/API/Request
async function parseRequestBody(request: Request): Promise<unknown> {
  if (!parseBody) return {};

  const ct = (request.headers.get("content-type") || "").toLowerCase();
  try {
    if (ct.includes("application/json")) {
      return await request.json();
    } else if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
      // formData() handles both url-encoded and multipart forms.
      // Object.fromEntries flattens it to a plain object; duplicate keys
      // keep only the last value (acceptable for most form submissions).
      // Ref: https://developer.mozilla.org/en-US/docs/Web/API/Request/formData
      const fd = await request.formData();
      return Object.fromEntries(fd.entries());
    } else if (ct.includes("text/")) {
      return await request.text();
    }
  } catch {
    // Body parsing failed (empty body, malformed JSON, etc.) — fall through
    // to the default empty object so pipe steps can still run.
  }
  return {};
}

// ── Static file serving ──
// If "static" is configured, attempt to serve files from that directory before
// running the pipe. Returns null if no static file matches.
async function maybeServeStatic(request: Request): Promise<Response | null> {
  if (!staticDir) return null;
  try {
    // Dynamic import so the dependency is only loaded when static serving is
    // configured. serveDir returns a 404 Response (not an exception) for
    // missing files, so we check the status to decide whether to fall through.
    // Ref: https://jsr.io/@std/http/doc/file-server/~/serveDir
    const { serveDir } = await import("jsr:@std/http/file-server");
    const response = await serveDir(request, { fsRoot: staticDir, quiet: true });
    if (response.status !== 404) return response;
  } catch {
    // Static serving failed — fall through to pipe processing
  }
  return null;
}

// ── CORS helpers ──
// Build CORS headers once at startup (if enabled) to avoid per-request allocation.
// Ref: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Access-Control-Allow-Origin
const corsHeaders: Record<string, string> = corsOrigin
  ? {
      "Access-Control-Allow-Origin": corsOrigin,
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,PATCH,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
      "Access-Control-Max-Age": "86400",
    }
  : {};

// ── Main request handler ──
const handler = async (request: Request) => {
  // CORS preflight: respond immediately without running the pipe.
  if (corsOrigin && request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Static file serving: try before pipe execution.
  const staticResponse = await maybeServeStatic(request);
  if (staticResponse) return staticResponse;

  // Parse the request body (if enabled) so pipe steps can access it.
  const requestBody = await parseRequestBody(request);

  // Execute the pipeline with the standard input shape.
  const output = await pipe.process({
    request,
    requestBody,
    body: {},
    responseOptions: {
      headers: {
        "content-type": defaultContentType,
      },
      status: 200,
    },
    mode: {
      server: true,
      deploy: isDenoDeploy,
    },
  });

  // ── Error handling ──
  if (output.errors) {
    console.error(output.errors);
    return new Response(JSON.stringify(output.errors), { status: 500 });
  }

  // ── Escape hatch ──
  // If a step set input.response directly, use it as-is (the pipe author has
  // full control over the Response object).
  if (output.response) {
    // Still add CORS header if configured (the author may have forgotten).
    if (corsOrigin && !output.response.headers.has("Access-Control-Allow-Origin")) {
      // Response headers may be immutable, so clone if needed.
      try {
        output.response.headers.set("Access-Control-Allow-Origin", corsOrigin);
      } catch {
        // Headers were immutable — the author is responsible for CORS.
      }
    }
    return output.response;
  }

  // ── Content-type inference ──
  // The pipe's content-type starts as the configured default (usually
  // "application/json"). If the body is a string that looks like HTML and
  // the content-type was never changed from the default, auto-switch to HTML.
  const ct = (output.responseOptions.headers["content-type"] || "").toLowerCase();

  if (ct.startsWith(defaultContentType.toLowerCase()) && typeof output.body === "string") {
    const trimmed = output.body.trimStart();
    // Detect common HTML document openers.
    if (
      trimmed.startsWith("<!") ||
      trimmed.startsWith("<html") ||
      trimmed.startsWith("<head") ||
      trimmed.startsWith("<body")
    ) {
      output.responseOptions.headers["content-type"] = "text/html; charset=utf-8";
    }
  }

  // ── JSON auto-serialization ──
  // When the content-type indicates JSON and the body is an object, stringify
  // it. Uses .startsWith() (not ===) so "application/json; charset=utf-8"
  // and similar variations are handled correctly.
  const finalCt = (output.responseOptions.headers["content-type"] || "").toLowerCase();
  if (finalCt.startsWith("application/json") && typeof output.body === "object" && output.body !== null) {
    output.body = JSON.stringify(output.body);
  }

  // ── 404 fallback ──
  // If no step set body, response, or changed the status from the initial 200,
  // assume no route matched and return 404. This prevents silent empty 200s.
  const bodyIsEmpty = output.body === undefined || output.body === null ||
    (typeof output.body === "object" && Object.keys(output.body as Record<string, unknown>).length === 0);
  if (bodyIsEmpty && output.responseOptions.status === 200) {
    return new Response("Not Found", {
      status: 404,
      headers: { "content-type": "text/plain", ...corsHeaders },
    });
  }

  // ── Build response ──
  // Add CORS headers to the final response if configured.
  if (corsOrigin) {
    Object.assign(output.responseOptions.headers, corsHeaders);
  }

  const response = new Response(output.body, output.responseOptions);
  return response;
};

const server = Deno.serve({ handler, port, hostname });
server.finished.then(() => console.log("Server closed"));
