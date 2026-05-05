import { std } from "./deps.ts";

// ── REPL eval template ──
// Generates the TypeScript code loaded by `deno repl --eval-file`.
// Each pipe is imported with its default export and process function,
// then helper functions (run, test, step, traced, help) are provided
// for convenient interactive use.
// Ref: https://docs.deno.com/runtime/reference/cli/repl/

/**
 * Converts a raw import-map key into a safe PascalCase identifier.
 * Handles leading digits, hyphens, underscores, and single-char names.
 * Used at template-generation time (in Node/Deno), NOT inside the REPL.
 * @param {string} key - The import map key (e.g. "my-pipe", "2things")
 * @returns {string} PascalCase identifier (e.g. "MyPipe", "Things")
 */
function toPascal(key: string): string {
  // Strip leading digits that would make an invalid JS identifier
  const cleaned = key.replace(/^\d+/, "");
  if (!cleaned) return "Pipe";
  // Split on hyphens, underscores, or camelCase boundaries, then PascalCase join
  // Ref: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Grammar_and_types#variables
  return cleaned
    .split(/[-_]/)
    .map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1))
    .join("");
}

/**
 * Strips leading digits from a key to produce a valid JS identifier.
 * @param {string} key - The raw import map key
 * @returns {string} Sanitized identifier safe for use as a variable name
 */
function safeId(key: string): string {
  return key.replace(/^\d+/, "") || "pipe";
}

export const denoReplEvalTemplate = (importNames: string[]) =>
  `${
    // ── Pipe imports ──
    // Each pipe exports a default (the Pipe instance) and a named 'process' function.
    // We import both so users can call pipe.process(input) or pipeProcess(input).
    importNames
      .map((key: string) =>
        `import { default as ${safeId(key)}, process as ${
          safeId(key)
        }Process } from "${key}";`
      )
      .join("\n")}
// ── Pointer library ──
// JSON Pointer utilities for deep object access/mutation.
// Now resolved through the import map instead of a hardcoded JSR URL.
// Ref: https://jsr.io/@pd/pointers
import $p from "$p";

// ── Trace infrastructure ──
// Ported from templates/trace.ts so REPL runs produce the same trace files
// that appear on the dashboard's /traces page.
// Ref: https://developer.mozilla.org/en-US/docs/Web/API/Performance/now

/**
 * Takes a safe snapshot of an object, excluding non-cloneable values
 * (Request, Response, Event) and sanitizing large strings / base64 blobs.
 * @param {Record<string, unknown>} input - The object to snapshot
 * @param {string[]} exclude - Keys to replace with type placeholders
 * @returns {Record<string, unknown>} A deep-cloned, sanitized copy
 */
function _safeSnapshot(input, exclude = ["request", "response", "event"]) {
  const MAX_STR = 1024;
  function sanitize(v) {
    if (typeof v === "string") {
      if (/^data:[^;]+;base64,/.test(v)) return "[base64 data: " + v.length + " chars]";
      if (v.length > MAX_STR) return v.slice(0, MAX_STR) + "... [truncated]";
      return v;
    }
    if (Array.isArray(v)) return v.map(sanitize);
    if (v !== null && typeof v === "object") {
      const r = {};
      for (const [k, val] of Object.entries(v)) r[k] = sanitize(val);
      return r;
    }
    return v;
  }
  const snap = {};
  for (const [key, value] of Object.entries(input)) {
    if (exclude.includes(key)) { snap[key] = "[" + typeof value + "]"; continue; }
    try { snap[key] = sanitize(structuredClone(value)); }
    catch { snap[key] = "[non-cloneable]"; }
  }
  return snap;
}

/**
 * Computes key-level diff between two snapshots.
 * @param {Record<string, unknown>} before - State before step execution
 * @param {Record<string, unknown>} after - State after step execution
 * @returns {{ added: string[], modified: string[], removed: string[] }}
 */
function _computeDelta(before, after) {
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const added = [], modified = [], removed = [];
  for (const key of allKeys) {
    if (!(key in before)) added.push(key);
    else if (!(key in after)) removed.push(key);
    else if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) modified.push(key);
  }
  return { added, modified, removed };
}

/**
 * Reads project config from deno.json (pipedown property) or config.json.
 * Used to resolve project name for trace file paths.
 * @returns {Record<string, unknown>} Merged project configuration
 */
function _readProjectConfig() {
  let base = {};
  try {
    const raw = JSON.parse(Deno.readTextFileSync("deno.json"));
    if (raw.pipedown && typeof raw.pipedown === "object") base = raw.pipedown;
  } catch { /* not found */ }
  try { Object.assign(base, JSON.parse(Deno.readTextFileSync("config.json"))); }
  catch { /* not found */ }
  return base;
}

/**
 * Writes a trace JSON file to ~/.pipedown/traces/{project}/{pipe}/{timestamp}.json.
 * Uses the same directory structure and format as the dashboard's trace.ts template,
 * so REPL-originated traces appear alongside dashboard traces.
 * Ref: https://docs.deno.com/api/deno/~/Deno.mkdir
 * @param {string} pipeName - The pipeline name (from pipe.json.name)
 * @param {object[]} steps - Array of per-step trace entries
 * @param {Record<string, unknown>} originalInput - Snapshot of input before execution
 * @param {Record<string, unknown>} finalOutput - Output after execution
 * @param {number} durationMs - Total execution time in milliseconds
 */
async function _writeTrace(pipeName, steps, originalInput, finalOutput, durationMs) {
  const home = Deno.env.get("HOME");
  if (!home) return;
  const config = _readProjectConfig();
  const projectName = config.name || Deno.cwd().split("/").pop() || "unknown";
  const traceDir = home + "/.pipedown/traces/" + projectName + "/" + pipeName;
  await Deno.mkdir(traceDir, { recursive: true });
  const now = new Date();
  const ts = now.toISOString();
  const trace = {
    pipeName,
    project: projectName,
    timestamp: ts,
    durationMs,
    stepsTotal: steps.length,
    input: _safeSnapshot(originalInput),
    output: _safeSnapshot(finalOutput),
    steps,
    errors: finalOutput.errors || [],
  };
  const filePath = traceDir + "/" + ts.replace(/[:.]/g, "-") + ".json";
  await Deno.writeTextFile(filePath, JSON.stringify(trace, null, 2));
  console.log("Trace written to: " + filePath);
}

// ── run(pipe, input) ──
// Execute a single input through a pipe with structured output and timing.
// This is the primary function for ad-hoc REPL execution.

/**
 * Run a pipe with a single input object. Prints formatted output with timing.
 * @param pipe - A Pipe instance (default export from a pipe module)
 * @param {Record<string, unknown>} input - The input object to process
 * @returns {Promise<Record<string, unknown>>} The pipe output
 */
async function run(pipe, input = {}) {
  const start = performance.now();
  const output = await pipe.process(input);
  const ms = Math.round((performance.now() - start) * 100) / 100;
  console.log("\\n── Result (" + ms + "ms) ──");
  if (output.errors) output.errors.forEach(e => console.error("  ERROR: " + e.message));
  console.log(JSON.stringify(output.data ?? output, null, 2));
  return output;
}

// ── traced(pipe, input) ──
// Like run(), but wraps each stage to capture before/after snapshots and
// writes a trace file visible on the dashboard /traces page.

/**
 * Run a pipe with full tracing. Wraps each stage to capture snapshots,
 * then writes a trace JSON file to ~/.pipedown/traces/.
 * The original pipe.stages are restored after execution.
 * @param pipe - A Pipe instance
 * @param {Record<string, unknown>} input - The input object to process
 * @returns {Promise<Record<string, unknown>>} The pipe output
 */
async function traced(pipe, input = {}) {
  const traceLog = [];
  const originalStages = [...pipe.stages];

  // Wrap each stage to capture before/after state and timing
  pipe.stages = originalStages.map((stage, index) => {
    const fn = async function (inp) {
      const before = _safeSnapshot(inp);
      const t0 = performance.now();
      const result = await stage(inp);
      const out = result || inp;
      const after = _safeSnapshot(out);
      traceLog.push({
        index,
        name: stage.name,
        durationMs: Math.round((performance.now() - t0) * 100) / 100,
        before,
        after,
        delta: _computeDelta(before, after),
      });
      return out;
    };
    Object.defineProperty(fn, "name", { value: stage.name });
    return fn;
  });

  const originalInput = _safeSnapshot(input);
  const start = performance.now();
  let output;
  try {
    output = await pipe.process(input);
  } finally {
    // Always restore original stages so subsequent non-traced runs aren't affected
    pipe.stages = originalStages;
  }
  const ms = Math.round((performance.now() - start) * 100) / 100;

  console.log("\\n── Traced Result (" + ms + "ms, " + traceLog.length + " steps) ──");
  if (output.errors) output.errors.forEach(e => console.error("  ERROR: " + e.message));
  console.log(JSON.stringify(output.data ?? output, null, 2));

  await _writeTrace(pipe.json.name, traceLog, originalInput, output, ms);
  return output;
}

// ── test(pipe, opts) ──
// Run all configured inputs for a pipe. Shows structured output per input
// with timing and an error summary at the end.

/**
 * Execute all config.inputs for a pipe, printing each result with timing.
 * @param pipe - A Pipe instance with pipe.json.config.inputs
 * @param {{ exclude?: string[], test?: boolean }} opts
 *   - exclude: JSON pointer paths; inputs where any path is truthy are skipped
 *   - test: value to set on input.test (default true)
 */
async function test(pipe, { exclude = [], test = true } = {}) {
  const inputs = pipe.json.config.inputs || [];
  if (!inputs.length) { console.log("No inputs configured for " + pipe.json.name); return; }

  let errorCount = 0;
  let runCount = 0;

  for (const i of inputs) {
    const match = exclude.map(path => $p.get(i, path)).some(Boolean);
    if (match) continue;

    i.test = test;
    const label = i._name || JSON.stringify(i);
    const start = performance.now();
    const output = await pipe.process(i);
    const ms = Math.round((performance.now() - start) * 100) / 100;
    runCount++;

    console.log("\\n── Input: " + label + " (" + ms + "ms) ──");
    if (output.errors) {
      errorCount += output.errors.length;
      output.errors.forEach(e => console.error("  ERROR: " + e.message));
    }
    console.log(JSON.stringify(output.data ?? output, null, 2));
  }

  console.log("\\n── Done: " + runCount + " inputs, " + errorCount + " errors ──");
}

// ── stepThrough(pipe, opts) ──
// Async generator that yields { input, output } for each configured input.
// Gives programmatic control: use for-await-of to iterate at your own pace.

/**
 * Async generator that yields each input's result one at a time.
 * Use with: for await (const r of stepThrough(myPipe)) { ... }
 * @param pipe - A Pipe instance
 * @param {{ exclude?: string[], test?: boolean }} opts
 * @yields {{ input: Record<string, unknown>, output: Record<string, unknown> }}
 */
async function* stepThrough(pipe, { exclude = [], test = true } = {}) {
  const inputs = pipe.json.config.inputs || [];
  for (const i of inputs) {
    const match = exclude.map(path => $p.get(i, path)).some(Boolean);
    if (match) continue;
    i.test = test;
    const output = await pipe.process(i);
    yield { input: i, output };
  }
}

// ── step(pipe, opts) ──
// Backwards-compatible interactive stepper using confirm() prompts.
// For programmatic control, prefer stepThrough() instead.

/**
 * Interactive step-by-step execution with confirm() between each input.
 * @param pipe - A Pipe instance
 * @param {{ exclude?: string[], test?: boolean }} opts
 */
async function step(pipe, { exclude = [], test = true } = {}) {
  for await (const { input, output } of stepThrough(pipe, { exclude, test })) {
    const label = input._name || JSON.stringify(input);
    console.log("\\n── Input: " + label + " ──");
    if (output.errors) output.errors.forEach(e => console.error("  ERROR: " + e.message));
    console.log(JSON.stringify(output.data ?? output, null, 2));
    if (!confirm("Continue to next input?")) break;
  }
}

// ── Per-pipe convenience shorthands ──
// Generated for each pipe: run<Name>(input), test<Name>(), step<Name>(), traced<Name>(input)
${
    importNames.map((key) => {
      const id = safeId(key);
      const pascal = toPascal(key);
      return [
        `const run${pascal} = (input) => run(${id}, input);`,
        `const test${pascal} = () => test(${id});`,
        `const step${pascal} = () => step(${id});`,
        `const traced${pascal} = (input) => traced(${id}, input);`,
      ].join("\n");
    }).join("\n")
  }

// ── Pipe registry (for help and introspection) ──
const _pipes = {
${
    importNames.map((key) => {
      const id = safeId(key);
      return `  "${key}": ${id},`;
    }).join("\n")
  }
};

// ── help() ──
// Prints a summary of all available pipes, their named inputs, and REPL functions.

/**
 * Display available pipes, their configured inputs, and helper function reference.
 */
function help() {
  console.log("\\n── Pipedown REPL ──\\n");
  console.log("Pipes:\\n");
  for (const [name, pipe] of Object.entries(_pipes)) {
    const inputs = pipe.json?.config?.inputs || [];
    const named = inputs.filter(i => i._name).map(i => i._name).join(", ");
    const label = inputs.length + " input" + (inputs.length !== 1 ? "s" : "");
    console.log("  " + name + "  (" + label + (named ? ": " + named : "") + ")");
  }
  console.log("\\nFunctions:\\n");
  console.log("  run(pipe, input)       Run a single input, structured output");
  console.log("  test(pipe)             Run all configured inputs");
  console.log("  step(pipe)             Interactive step-through with confirm()");
  console.log("  stepThrough(pipe)      Async generator: for await (const r of stepThrough(pipe))");
  console.log("  traced(pipe, input)    Run with full tracing (writes to ~/.pipedown/traces/)");
  console.log("  help()                 Show this message");
  console.log("\\nPer-pipe shorthands: run<Name>(input), test<Name>(), step<Name>(), traced<Name>(input)");
  console.log("Pointer library: $p.get(obj, '/path'), $p.set(obj, '/path', val)\\n");
}

// ── Welcome banner ──
// Printed on REPL startup so users know what's available.
console.log("\\n  Pipedown REPL  |  " + Object.keys(_pipes).length + " pipe(s) loaded  |  Type help() for commands\\n");
console.log("  Pipes: " + Object.keys(_pipes).join(", ") + "\\n");
`;

export const cliHelpTemplate = ({ title, command, sections }: {
  title: string;
  command: string;
  sections: string[];
}) =>
  `${std.colors.bold(title)}
Usage: ${std.colors.green(command)}

${sections.join("\n\n")}
`;

export const helpText = cliHelpTemplate({
  title: "Pipedown (pd) — Markdown-to-executable pipeline tool",
  command: "pd <command> [args] [options]",
  sections: [
    `Description:
  Pipedown transforms markdown files into executable TypeScript pipelines.
  Each markdown file defines a pipeline of steps (fenced codeblocks under headings).
  Built artifacts are stored in the .pd/ directory.`,
    `Commands:

  Build & Generate:
    build                                   Parse all .md files in cwd and generate executable .ts in .pd/
    lint [pipe]                             Statically check pipelines for malformed config, typo'd directives, etc.
    clean                                   Delete the .pd/ directory and all generated artifacts

  Run:
    run <file.md>                           Build and execute a pipeline. Accepts --input '<json>'
    run-step <file.md> <step-index>         Build and run steps 0..N, output the intermediate input object as JSON
    runWith <wrapper.md> <file.md> <input>  Build and run <file.md> wrapped by <wrapper.md>
    serve <file.md> <input>                 Build and start an HTTP server from a pipeline

  Inspect & List:
    list                                    List all .md files that have been processed in .pd/
    inspect <file.md> [step-index]          Output structured JSON describing a pipe's steps, config, and code

  Edit & Sync:
    llm <file> <index|heading> <prompt>     Use an LLM to generate or improve a specific codeblock in a pipeline
    sync <pipeName>                         Write .pd/<pipeName>/index.json back to the source .md file

  Watch & Interactive:
    interactive <file.md>                   Replay a pipe via the interactive workflow entry point
    i <file.md>                             Short alias for interactive
    watch                                   Watch .md files for changes, rebuild on save. Use --assist <path> for stub detection
    repl                                    Open a Deno REPL with all project pipes preloaded

  Test:
    test   (alias: t)                       Build and run snapshot tests for all pipelines
    test-update (alias: tu)                 Re-run tests and update snapshots

  Other:
    help                                    Show this help message
    version                                 Print the Pipedown version`,
    `Global Options:
  -j, --json      Print output as JSON
  -p, --pretty    Pretty-print JSON output
  -d, --debug     Display debug information
  -h, --help      Display help (global or per-command)
  -v, --version   Print the Pipedown version
  --input <json>  Provide initial input as a JSON string (used by run, run-step, serve)`,
    `Examples:
  pd build                                          # Build all .md pipelines
  pd run myPipe.md                                  # Build and run myPipe.md
  pd run myPipe.md --input '{"key": "value"}'       # Run with initial input
  pd interactive myPipe.md                          # Replay a pipe via the interactive workflow
  pd i myPipe.md                                    # Short alias for interactive
  pd run-with server myPipe.md                      # Run with a user template in the templates/ directory
  pd run-step myPipe.md 2                           # Run steps 0-2, print intermediate state
  pd inspect myPipe.md                              # Dump full pipe structure as JSON
  pd inspect myPipe.md 0                            # Dump step 0 with preceding context
  pd llm myPipe 0 "Add error handling"              # LLM-edit step 0
  pd sync myPipe                                    # Write index.json back to .md source
  pd serve myPipe.md '{}'                           # Start HTTP server from pipeline
  pd watch --assist ./assist.md                     # Watch and detect incomplete steps
  pd test                                           # Run all snapshot tests
  pd test-update                                    # Update test snapshots

  Per-command help:  pd <command> --help`,
  ],
});
