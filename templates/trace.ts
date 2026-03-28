import pipe from "./index.ts";
import rawPipe from "./index.json" with { type: "json" };
import { parseArgs } from "jsr:@std/cli@1.0.28";
import $p from "jsr:@pd/pointers@0.1.1";

// --- Trace sanitization (truncate large strings, detect base64/images) ---

interface SanitizeOptions {
  maxStringLength: number;
  maxBase64Length: number;
}

const DEFAULT_SANITIZE: SanitizeOptions = {
  maxStringLength: 1024,
  maxBase64Length: 128,
};

function sanitizeValue(
  value: unknown,
  opts: SanitizeOptions = DEFAULT_SANITIZE,
): unknown {
  if (typeof value === "string") {
    // Detect data URIs (images, fonts, etc.)
    if (/^data:[^;]+;base64,/.test(value)) {
      const mimeMatch = value.match(/^data:([^;]+);base64,/);
      const mime = mimeMatch?.[1] ?? "unknown";
      return `[base64 ${mime}: ${value.length.toLocaleString()} chars]`;
    }

    // Detect raw base64 blobs (>80% base64-alphabet chars and long)
    if (value.length > opts.maxBase64Length) {
      const b64Chars = value.replace(/[^A-Za-z0-9+/=]/g, "").length;
      if (b64Chars / value.length > 0.8) {
        return `[base64-like data: ${value.length.toLocaleString()} chars]`;
      }
    }

    // Truncate long strings
    if (value.length > opts.maxStringLength) {
      const removed = value.length - opts.maxStringLength;
      return value.slice(0, opts.maxStringLength) +
        `... [truncated: ${removed.toLocaleString()} chars removed]`;
    }

    return value;
  }

  if (Array.isArray(value)) {
    return value.map((v) => sanitizeValue(v, opts));
  }

  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (
      const [k, v] of Object.entries(value as Record<string, unknown>)
    ) {
      result[k] = sanitizeValue(v, opts);
    }
    return result;
  }

  return value;
}

// --- Safe snapshotting (handles non-cloneable values like Request/Response) ---

function safeSnapshot(
  input: Record<string, unknown>,
  exclude: string[] = ["request", "response", "event"],
  sanitizeOpts: SanitizeOptions = DEFAULT_SANITIZE,
): Record<string, unknown> {
  const snap: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (exclude.includes(key)) {
      snap[key] = `[${typeof value}]`;
      continue;
    }
    try {
      snap[key] = sanitizeValue(structuredClone(value), sanitizeOpts);
    } catch {
      snap[key] = `[non-cloneable: ${typeof value}]`;
    }
  }
  return snap;
}

// --- Delta computation (key-level diff) ---

function computeDelta(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): { added: string[]; modified: string[]; removed: string[] } {
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const added: string[] = [];
  const modified: string[] = [];
  const removed: string[] = [];
  for (const key of allKeys) {
    if (!(key in before)) added.push(key);
    else if (!(key in after)) removed.push(key);
    else if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      modified.push(key);
    }
  }
  return { added, modified, removed };
}

// --- Wrap pipeline stages to capture before/after ---

interface TraceEntry {
  index: number;
  name: string;
  durationMs: number;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  delta: { added: string[]; modified: string[]; removed: string[] };
}

const projectConfig = readProjectConfig();
const sanitizeOpts = resolveSanitizeOptions(projectConfig);

const traceLog: TraceEntry[] = [];
const originalStages = [...pipe.stages];

pipe.stages = originalStages.map((stage, index) => {
  const traced = async function (input: Record<string, unknown>) {
    const before = safeSnapshot(input, undefined, sanitizeOpts);
    const start = performance.now();
    const result = await stage(input);
    const output = result || input;
    const after = safeSnapshot(output, undefined, sanitizeOpts);
    traceLog.push({
      index,
      name: stage.name,
      durationMs: Math.round((performance.now() - start) * 100) / 100,
      before,
      after,
      delta: computeDelta(before, after),
    });
    return output;
  };
  Object.defineProperty(traced, "name", { value: stage.name });
  return traced;
});

// --- Resolve project config ---

function readProjectConfig(): Record<string, unknown> {
  const projectRoot = "../../"; // .pd/<pipeName>/ -> project root
  let base: Record<string, unknown> = {};

  // Try deno.json -> pipedown first
  try {
    const raw = JSON.parse(
      Deno.readTextFileSync(projectRoot + "deno.json"),
    );
    if (raw.pipedown && typeof raw.pipedown === "object") {
      base = raw.pipedown;
    }
  } catch { /* not found */ }

  // Layer config.json on top (override)
  try {
    const legacy = JSON.parse(
      Deno.readTextFileSync(projectRoot + "config.json"),
    );
    Object.assign(base, legacy);
  } catch { /* not found */ }

  return base;
}

function resolveProjectName(config: Record<string, unknown>): string {
  if (config.name) return config.name as string;
  return Deno.cwd().split("/").pop() || "unknown";
}

function resolveSanitizeOptions(
  config: Record<string, unknown>,
): SanitizeOptions {
  const traceConfig = config.trace as Record<string, unknown> | undefined;
  if (!traceConfig || typeof traceConfig !== "object") return DEFAULT_SANITIZE;
  return {
    maxStringLength:
      (typeof traceConfig.maxStringLength === "number"
        ? traceConfig.maxStringLength
        : DEFAULT_SANITIZE.maxStringLength),
    maxBase64Length:
      (typeof traceConfig.maxBase64Length === "number"
        ? traceConfig.maxBase64Length
        : DEFAULT_SANITIZE.maxBase64Length),
  };
}

// --- Write trace to $HOME/.pipedown/traces/ ---

async function writeTrace(
  pipeName: string,
  steps: TraceEntry[],
  originalInput: Record<string, unknown>,
  finalOutput: Record<string, unknown>,
  durationMs: number,
  config: Record<string, unknown>,
  opts: SanitizeOptions,
) {
  const home = Deno.env.get("HOME");
  if (!home) {
    console.error("Cannot determine HOME directory for trace storage");
    return;
  }
  const projectName = resolveProjectName(config);
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
    input: safeSnapshot(originalInput, undefined, opts),
    output: safeSnapshot(finalOutput, undefined, opts),
    steps,
    errors: (finalOutput as Record<string, unknown>).errors || [],
  };

  const filePath = `${traceDir}/${fileTimestamp}.json`;
  await Deno.writeTextFile(filePath, JSON.stringify(trace, null, 2));
  console.log(`Trace written to: ${filePath}`);
}

// --- Main execution ---

const flags = parseArgs(Deno.args);
const input = JSON.parse(flags.input || flags.i || "{}");
$p.set(input, "/flags", flags);
$p.set(input, "/mode/cli", true);
$p.set(input, "/mode/trace", true);

const originalInput = safeSnapshot(input, undefined, sanitizeOpts);
const pipelineStart = performance.now();
const output = await pipe.process(input);
const pipelineDuration =
  Math.round((performance.now() - pipelineStart) * 100) / 100;

await writeTrace(
  rawPipe.name,
  traceLog,
  originalInput,
  output,
  pipelineDuration,
  projectConfig,
  sanitizeOpts,
);

if (flags.json || flags.j) {
  console.log(JSON.stringify(output));
} else {
  console.log(output);
}
Deno.exit(0);
