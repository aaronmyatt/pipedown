import pipe from "./index.ts";
import rawPipe from "./index.json" with { type: "json" };
import { parseArgs } from "jsr:@std/cli@1.0.28";
import $p from "jsr:@pd/pointers@0.1.1";

// --- Safe snapshotting (handles non-cloneable values like Request/Response) ---

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
      snap[key] = structuredClone(value);
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

const traceLog: TraceEntry[] = [];
const originalStages = [...pipe.stages];

pipe.stages = originalStages.map((stage, index) => {
  const traced = async function (input: Record<string, unknown>) {
    const before = safeSnapshot(input);
    const start = performance.now();
    const result = await stage(input);
    const output = result || input;
    const after = safeSnapshot(output);
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

// --- Resolve project name ---

function resolveProjectName(): string {
  try {
    const configText = Deno.readTextFileSync("../../config.json");
    const config = JSON.parse(configText);
    if (config.name) return config.name;
  } catch { /* no config.json or no name field */ }
  // Fallback: use the current working directory name
  return Deno.cwd().split("/").pop() || "unknown";
}

// --- Write trace to $HOME/.pipedown/traces/ ---

async function writeTrace(
  pipeName: string,
  steps: TraceEntry[],
  originalInput: Record<string, unknown>,
  finalOutput: Record<string, unknown>,
  durationMs: number,
) {
  const home = Deno.env.get("HOME");
  if (!home) {
    console.error("Cannot determine HOME directory for trace storage");
    return;
  }
  const projectName = resolveProjectName();
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
    input: safeSnapshot(originalInput),
    output: safeSnapshot(finalOutput),
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

const originalInput = safeSnapshot(input);
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
);

if (flags.json || flags.j) {
  console.log(JSON.stringify(output));
} else {
  console.log(output);
}
Deno.exit(0);
