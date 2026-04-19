#!/usr/bin/env -S deno run --allow-all --no-check
// ── genPipeCode.ts ──
// Generates or improves a step's code block using Claude Code (`claude -p`).
// The workflow:
//   1. `pd build` to ensure .pd/ is fresh
//   2. Prompt for pipe name + step index/name if not provided as CLI args
//   3. Extract a "slim" index.json with only LLM-relevant fields
//   4. Send context (system prompt + slim JSON + preceding steps) to `claude -p`
//   5. Claude writes the updated step JSON to /tmp
//   6. Back up the current index.json for rollback
//   7. Merge the generated code into index.json
//   8. `pd sync` to write changes back to source markdown
//
// Usage:
//   deno run -A genPipeCode.ts <pipeName> <stepIndex|stepName> [prompt]
//   deno run -A genPipeCode.ts boards 1 "add retry logic with exponential backoff"
//   deno run -A genPipeCode.ts boards "Fetch Boards"
//   deno run -A genPipeCode.ts   # interactive mode — prompts for everything
//
// Ref: https://docs.deno.com/api/deno/

// ── Imports ──
// @std/path for cross-platform path manipulation.
// Ref: https://jsr.io/@std/path
import { dirname, join, resolve } from "@std/path";

// @std/cli for parsing command-line arguments into a typed object.
// Ref: https://jsr.io/@std/cli
import { parseArgs } from "@std/cli/parse-args";

// ── Constants ──

const PD_DIR = join(Deno.cwd(), ".pd");
const TMP_OUTPUT = "/tmp/pd_gen_code.json";

// ── System Prompt ──
// Provides Claude with Pipedown code block conventions, the runtime API
// (input/opts/$p), and a real-world example from the jira-sprint-metrics
// project. This is focused specifically on code generation — no markdown
// structure rules needed.

const SYSTEM_PROMPT =
  `You are an expert Pipedown code generator. Pipedown transforms markdown files
into executable TypeScript pipelines on Deno.

## Code Block Rules

- Code runs inside \`async function StepName(input, opts) { ... }\`.
- \`input\`, \`opts\`, and \`$p\` are already in scope — do NOT declare or import them.
- Store results on \`input\` so later steps can access them (e.g. \`input.data = ...\`).
- Read data set by preceding steps from \`input\` (e.g. \`input.userId\`).
- Access pipeline config via \`$p.get(opts, '/config/key')\` or \`opts.config.key\`.
- Imports (\`npm:\`, \`jsr:\`, URLs, other pipe names) go at the top of the code block.
- Do NOT wrap code in a function or module — it executes inline.
- Errors are caught automatically and appended to \`input.errors\`. The pipeline
  continues. To halt early, use \`return;\`.

## The \`input\` Object

Mutable state flowing through all steps:
- \`input.errors\` — array of captured errors
- \`input.request\` / \`input.response\` — HTTP (server mode)
- \`input.body\` — response body (server mode)
- \`input.responseOptions\` — \`{ headers, status }\` (server mode)
- \`input.route\` — matched route with \`pathname.groups\` (server mode)
- \`input.flags\` — parsed CLI arguments (CLI mode)
- \`input.mode\` — \`{ cli: true }\`, \`{ server: true }\`, or \`{ test: true }\`
- Any custom properties you set

## The \`$p\` JSON Pointer Utility

- \`$p.get(obj, '/path/to/value')\` — get nested value safely
- \`$p.set(obj, '/path/to/value', data)\` — set nested value (creates path)
- \`$p.compile('/path')\` — compile pointer for repeated use

## Example: Slim JSON (what you receive as context)

\`\`\`json
{
  "name": "Boards",
  "pipeDescription": "List all Jira boards via the Jira Cloud REST API...",
  "config": { "MAX_RESULTS_PER_PAGE": 50, "BOARD_ID": 2662 },
  "steps": [
    {
      "name": "Jira API Authentication",
      "code": "import JiraAuth from \\"JiraAuth\\";\\nconst { fetchWithCache } = await JiraAuth.process()\\ninput.fetchWithCache = fetchWithCache;",
      "language": "ts",
      "inList": false
    },
    {
      "name": "Fetch Boards",
      "description": "Call GET /rest/agile/1.0/board with pagination...",
      "code": "const MAX_RESULTS_PER_PAGE = $p.get(opts, \\"/config/MAX_RESULTS_PER_PAGE\\") ?? 50;\\ninput.boards = [];\\nlet startAt = 0;\\nlet isLastPage = false;\\n\\nwhile (!isLastPage) {\\n  const page = await input.fetchWithCache(\\\`/rest/agile/1.0/board\\\`, {\\n    startAt,\\n    maxResults: MAX_RESULTS_PER_PAGE,\\n  }, [\\".cache\\", \\"boards\\"]);\\n  const values = page.values ?? [];\\n  input.boards.push(...values);\\n  startAt += values.length;\\n  const total = page.total ?? 0;\\n  isLastPage = page.isLast === true || startAt >= total || values.length === 0;\\n}",
      "language": "ts",
      "inList": false
    },
    {
      "name": "Narrow to board of interest",
      "description": "aka GBG Insights Portal",
      "code": "const preferredBoardId = input.boardId ?? $p.get(opts, \\"/config/BOARD_ID\\");\\ninput.board = input.boards.find(b => b?.id === preferredBoardId);\\ninput.boardId = input.board?.id || preferredBoardId;",
      "language": "ts",
      "inList": false
    },
    {
      "name": "Format Output",
      "code": "input.boards = (input.boards ?? []).map((board) => ({\\n  id: board.id,\\n  name: board.name,\\n  type: board.type ?? \\"\\",\\n}));",
      "language": "ts",
      "inList": false
    }
  ]
}
\`\`\`

## Example: Conditional Step (with list DSL)

Steps can have conditional execution via markdown list directives. When
\`inList\` is true and \`config\` has \`not\`/\`check\`/\`and\`/\`or\`/\`route\`/\`method\`
fields, the step only runs when those conditions are met.

\`\`\`json
{
  "name": "Update deno.json",
  "description": "Write the new version to deno.json.",
  "code": "input.denoJson.version = input.newVersion;\\nawait Deno.writeTextFile(input.denoJsonPath, JSON.stringify(input.denoJson, null, 2));",
  "language": "ts",
  "inList": true,
  "config": { "not": ["/error", "/dryRun"] }
}
\`\`\`

## Output Format

You MUST write a JSON file to \`${TMP_OUTPUT}\` containing:

\`\`\`json
{ "stepIndex": <number>, "code": "<your generated TypeScript code>" }
\`\`\`

The \`code\` field should contain ONLY the raw TypeScript code — no markdown
fences, no function wrappers, no \`export async function\`. Just the code that
goes inside the step's async function body.

Output NOTHING else — no explanations, no commentary. Just write the file.`;

// ── Helpers ──

/**
 * Strips internal metadata from a full index.json Pipe object, keeping only
 * the fields an LLM needs to understand the pipeline's structure and data flow.
 *
 * Fields removed: rawSource, original* (mutation tracking), sourceMap (line
 * numbers), stepId/fingerprint (tracking), range (token indices), file paths
 * (mdPath, dir, absoluteDir, fileName, cleanName), dependencies.
 *
 * @param pipe - The full index.json object
 * @returns A slim copy suitable for LLM context
 */
// deno-lint-ignore no-explicit-any
function slimPipeJson(pipe: any): Record<string, unknown> {
  const slim: Record<string, unknown> = {
    name: pipe.name,
  };

  if (pipe.pipeDescription) slim.pipeDescription = pipe.pipeDescription;
  if (pipe.schema) slim.schema = pipe.schema;

  if (pipe.config) {
    // deno-lint-ignore no-explicit-any
    const { templates: _, ...cleanConfig } = pipe.config as any;
    if (Object.keys(cleanConfig).length > 0) slim.config = cleanConfig;
  }

  // deno-lint-ignore no-explicit-any
  slim.steps = (pipe.steps || []).map((step: any) => {
    // deno-lint-ignore no-explicit-any
    const s: any = {
      name: step.name,
      code: step.code,
      language: step.language || "ts",
      inList: step.inList,
    };
    if (step.description) s.description = step.description;
    if (step.config) s.config = step.config;
    return s;
  });

  return slim;
}

/**
 * Resolves a pipe's dependency paths to absolute filesystem paths that can be
 * used as `Read(//path/**)` patterns for `--allowedTools`. This lets the
 * spawned Claude session read dependency source files for additional context
 * without having access to the entire workspace.
 *
 * Uses `pipe.dependencies` which is populated by `pd build`'s
 * `resolveDependencies()` stage. That stage scans step imports and classifies
 * them against the .pd/deno.json import map.
 * Ref: pdBuild.ts resolveDependencies()
 *
 * @param pipe - The full index.json object
 * @param pdDir - Absolute path to the .pd/ directory
 * @returns Array of `--allowedTools` entries like `Read(//abs/path/**)`
 */
async function resolveDependencyReadTools(
  // deno-lint-ignore no-explicit-any
  pipe: any,
  pdDir: string,
): Promise<string[]> {
  const readPatterns: string[] = [];

  // Always allow reading the pipe's own .pd/ subdirectory and source markdown.
  // The `//` prefix tells Claude Code this is an absolute filesystem path.
  // Ref: Claude Code --allowedTools path pattern documentation
  if (pipe.absoluteDir) {
    readPatterns.push(`Read(//${pipe.absoluteDir}/**)`);
  }
  if (pipe.mdPath) {
    readPatterns.push(`Read(//${pipe.mdPath})`);
  }

  // Resolve pipe dependencies to their .pd/ subdirectories and source markdown.
  for (const depName of (pipe.dependencies?.pipes || [])) {
    const depDir = join(pdDir, depName);
    readPatterns.push(`Read(//${depDir}/**)`);
    // Look up the dependency pipe's source markdown via its index.json mdPath.
    try {
      const depPipe = JSON.parse(
        await Deno.readTextFile(join(depDir, "index.json")),
      );
      if (depPipe.mdPath) {
        readPatterns.push(`Read(//${depPipe.mdPath})`);
      }
    } catch {
      // Dependency pipe not built — skip its source markdown.
    }
  }

  // Resolve local file dependencies relative to the pipe's markdown location.
  if (pipe.mdPath) {
    const mdDir = dirname(pipe.mdPath);
    for (const localFile of (pipe.dependencies?.localFiles || [])) {
      const absPath = resolve(mdDir, localFile);
      readPatterns.push(`Read(//${absPath})`);
    }
  }

  return readPatterns;
}

/**
 * Runs a shell command and returns stdout. Throws on non-zero exit.
 * Ref: https://docs.deno.com/api/deno/~/Deno.Command
 */
async function run(
  cmd: string[],
  opts: { cwd?: string } = {},
): Promise<string> {
  const command = new Deno.Command(cmd[0], {
    args: cmd.slice(1),
    stdout: "piped",
    stderr: "piped",
    cwd: opts.cwd,
  });
  const result = await command.output();
  if (!result.success) {
    const stderr = new TextDecoder().decode(result.stderr);
    throw new Error(`Command failed: ${cmd.join(" ")}\n${stderr}`);
  }
  return new TextDecoder().decode(result.stdout);
}

/**
 * Prompt the user for input. Exits if nothing provided.
 * Ref: https://docs.deno.com/api/deno/~/prompt
 */
function ask(message: string): string {
  const answer = prompt(message);
  if (answer === null || answer.trim() === "") {
    console.error("No input provided. Exiting.");
    Deno.exit(1);
  }
  return answer.trim();
}

/**
 * Checks whether `fzf` is available on the system PATH.
 * Ref: https://github.com/junegunn/fzf
 *
 * @returns {Promise<boolean>} true if fzf is installed and reachable
 */
async function hasFzf(): Promise<boolean> {
  try {
    const cmd = new Deno.Command("which", {
      args: ["fzf"],
      stdout: "null",
      stderr: "null",
    });
    const result = await cmd.output();
    return result.success;
  } catch {
    return false;
  }
}

/**
 * Presents a list of options to the user via fzf and returns the selected line.
 * Items are piped into fzf's stdin; fzf renders its TUI on /dev/tty so it
 * works even when our own stdin is consumed by Deno.
 * Ref: https://github.com/junegunn/fzf#usage
 *
 * @param {string[]} items - Lines to display in fzf
 * @param {string} header - Header text shown above the list
 * @returns {Promise<string>} The selected line, trimmed
 */
async function fzfSelect(items: string[], header: string): Promise<string> {
  const cmd = new Deno.Command("fzf", {
    args: [
      "--header",
      header,
      "--reverse",
      "--height",
      "40%",
    ],
    stdin: "piped",
    stdout: "piped",
    stderr: "inherit",
  });

  const child = cmd.spawn();
  const writer = child.stdin.getWriter();
  await writer.write(new TextEncoder().encode(items.join("\n")));
  await writer.close();

  const result = await child.output();
  if (!result.success) {
    console.error("Selection cancelled.");
    Deno.exit(1);
  }
  return new TextDecoder().decode(result.stdout).trim();
}

// ── Main ──

async function main() {
  const args = parseArgs(Deno.args, {
    string: ["_"],
    alias: { m: "prompt" },
  });

  // Step 1: Always build first so .pd/ is current.
  console.log("Building pipelines...");
  await run(["pd", "build"]);
  console.log("Build complete.\n");

  // Step 2: Resolve pipe name and step target from args or interactive prompts.
  let pipeName = args._[0] as string | undefined;
  let stepTarget = args._[1] as string | undefined;
  const userPrompt = (args.prompt as string) ||
    ((args._ as string[]).slice(2).join(" ") || undefined);

  // Detect fzf once — reused for both pipe and step selection.
  const useFzf = await hasFzf();

  if (!pipeName) {
    const listOutput = await run(["pd", "list"]);
    // Strip ANSI colour codes from `pd list` output so fzf and plain
    // prompts both get clean pipe names.
    const pipeNames = listOutput
      .split("\n")
      // deno-lint-ignore no-control-regex
      .map((l) => l.replace(/\x1b\[[0-9;]*m/g, "").trim())
      .filter(Boolean);

    if (useFzf) {
      pipeName = await fzfSelect(pipeNames, "Select a pipe:");
    } else {
      console.log("Available pipes:\n" + pipeNames.join("\n"));
      pipeName = ask("Pipe name:");
    }
  }

  // Step 3: Load full index.json and build slim context.
  const indexJsonPath = join(PD_DIR, pipeName, "index.json");
  // deno-lint-ignore no-explicit-any
  let fullPipe: any;
  try {
    fullPipe = JSON.parse(await Deno.readTextFile(indexJsonPath));
  } catch (e) {
    console.error(`Could not read ${indexJsonPath}: ${(e as Error).message}`);
    Deno.exit(1);
  }

  const slim = slimPipeJson(fullPipe);
  const steps = fullPipe.steps || [];

  // Step target is required for code generation (unlike description which
  // can be pipe-level). If not provided, prompt the user.
  if (stepTarget === undefined) {
    // deno-lint-ignore no-explicit-any
    const stepLabels = steps.map((s: any, i: number) => `${i}: ${s.name}`);

    if (useFzf) {
      const selected = await fzfSelect(stepLabels, "Select a step:");
      // fzf returns the full line, e.g. "2: Fetch Boards". Extract the
      // leading index number.
      stepTarget = selected.split(":")[0];
    } else {
      console.log("\nSteps in this pipeline:");
      stepLabels.forEach((l: string) => console.log(`  ${l}`));
      stepTarget = ask("Step index or name:");
    }
  }

  // Resolve to a numeric index. Supports integer or partial name match.
  let stepIndex: number;
  const idx = parseInt(stepTarget);
  if (!isNaN(idx)) {
    if (idx < 0 || idx >= steps.length) {
      console.error(`Step index ${idx} out of range (0-${steps.length - 1})`);
      Deno.exit(1);
    }
    stepIndex = idx;
  } else {
    const found = steps.findIndex(
      // deno-lint-ignore no-explicit-any
      (s: any) =>
        s.name.toLowerCase().includes(stepTarget!.toLowerCase()) ||
        s.funcName.toLowerCase().includes(stepTarget!.toLowerCase()),
    );
    if (found === -1) {
      console.error(`No step matching "${stepTarget}" found.`);
      Deno.exit(1);
    }
    stepIndex = found;
  }

  const targetStep = steps[stepIndex];
  console.log(`\nTargeting step ${stepIndex}: ${targetStep.name}`);

  // Build context showing what preceding steps put on `input`, so the LLM
  // knows which properties are available. We provide the code as a real
  // fenced block (not JSON-escaped) for readability.
  // deno-lint-ignore no-explicit-any
  const slimSteps = (slim as any).steps;
  const precedingContext = slimSteps
    .slice(0, stepIndex)
    // deno-lint-ignore no-explicit-any
    .map((s: any, i: number) => {
      let block = `### Step ${i}: ${s.name}`;
      if (s.description) block += `\n${s.description}`;
      block += `\n\`\`\`ts\n${s.code}\n\`\`\``;
      if (s.config) {
        block += `\nConditionals: ${JSON.stringify(s.config)}`;
      }
      return block;
    })
    .join("\n\n");

  const currentStepContext = `### Current step ${stepIndex}: ${targetStep.name}
${targetStep.description ? targetStep.description + "\n" : ""}
\`\`\`ts
${targetStep.code}
\`\`\`
${
    targetStep.config
      ? `Conditionals: ${JSON.stringify(targetStep.config)}\n`
      : ""
  }`;

  // Step 4: Build the full prompt.
  const instruction = userPrompt || "Improve this code";

  const fullPrompt = `## Pipeline: ${slim.name}
${
    (slim as { pipeDescription?: string }).pipeDescription
      ? (slim as { pipeDescription?: string }).pipeDescription + "\n"
      : ""
  }
## Pipeline Config
\`\`\`json
${JSON.stringify((slim as { config?: unknown }).config || {}, null, 2)}
\`\`\`
${slim.schema ? `\n## Schema\n\`\`\`\n${slim.schema}\n\`\`\`\n` : ""}
## Preceding Steps
${precedingContext || "(this is the first step)"}

## Target Step
${currentStepContext}

## Instruction
${instruction}

Write the result to ${TMP_OUTPUT} as: { "stepIndex": ${stepIndex}, "code": "..." }`;

  // Step 5: Invoke `claude -p` with system prompt and the assembled context.
  // --allowedTools grants Write + Bash for output, plus Read restricted to
  // only the pipe's own files and its dependency paths. This lets Claude
  // look up dependency code for context without accessing the full workspace.
  // Ref: claude --help
  console.log("\nCalling Claude...");

  // Resolve dependency paths to Read(//path/**) tool patterns.
  const depReadTools = await resolveDependencyReadTools(fullPipe, PD_DIR);
  if (depReadTools.length > 0) {
    console.log(
      `Allowing reads from ${depReadTools.length} dependency path(s)`,
    );
  }

  const allowedTools = ["Write", "Bash", ...depReadTools];

  const claudeCmd = new Deno.Command("claude", {
    args: [
      "-p",
      "--system-prompt",
      SYSTEM_PROMPT,
      "--allowedTools",
      ...allowedTools,
    ],
    // Pipe prompt via stdin — avoids arg-length limits and escaping issues.
    // Ref: https://docs.deno.com/api/deno/~/Deno.Command
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  });

  // Spawn the child process so we can write to its stdin stream.
  const child = claudeCmd.spawn();
  const writer = child.stdin.getWriter();
  await writer.write(new TextEncoder().encode(fullPrompt));
  await writer.close();

  const claudeResult = await child.output();
  const claudeOutput = new TextDecoder().decode(claudeResult.stdout);
  const claudeStderr = new TextDecoder().decode(claudeResult.stderr);

  if (!claudeResult.success) {
    console.error("Claude command failed:");
    console.error(claudeStderr || claudeOutput);
    Deno.exit(1);
  }

  console.log("Claude response:\n" + claudeOutput);

  // Step 6: Read the generated JSON from /tmp.
  let generated: Record<string, unknown>;
  try {
    generated = JSON.parse(await Deno.readTextFile(TMP_OUTPUT));
  } catch (e) {
    console.error(
      `Could not read generated output at ${TMP_OUTPUT}: ${
        (e as Error).message
      }`,
    );
    console.error(
      "Claude may not have written the file. Check the output above.",
    );
    Deno.exit(1);
  }

  console.log("\nGenerated:", JSON.stringify(generated, null, 2));

  // Validate the generated output has the expected shape.
  if (generated.stepIndex === undefined || generated.code === undefined) {
    console.error(
      "Generated JSON missing required fields (stepIndex, code).",
    );
    Deno.exit(1);
  }

  const genIndex = generated.stepIndex as number;
  if (genIndex !== stepIndex) {
    console.error(
      `Warning: generated stepIndex (${genIndex}) doesn't match target (${stepIndex}). Using target.`,
    );
  }

  // Clean the code output — strip markdown fences if the LLM wrapped them.
  let code = (generated.code as string).trim();
  const fenceMatch = code.match(/^```\w*\s*\n([\s\S]*?)\n```\s*$/);
  if (fenceMatch) code = fenceMatch[1];

  // Ensure trailing newline — pipedown convention for step code.
  if (!code.endsWith("\n")) code += "\n";

  // Step 7: Back up index.json before modifying.
  const backupPath = indexJsonPath + ".bak";
  await Deno.copyFile(indexJsonPath, backupPath);
  console.log(`Backed up ${indexJsonPath} → ${backupPath}`);

  // Step 8: Merge the generated code into the full index.json.
  fullPipe.steps[stepIndex].code = code;
  await Deno.writeTextFile(indexJsonPath, JSON.stringify(fullPipe, null, 2));
  console.log(`Updated step ${stepIndex} code in ${indexJsonPath}`);

  // Step 9: Run `pd sync` to reconstruct the source markdown.
  console.log("\nSyncing changes back to markdown...");
  const syncOutput = await run(["pd", "sync", pipeName]);
  console.log(syncOutput);
  console.log("Done! Review the changes in your markdown file.");
  console.log(
    `Rollback: cp ${backupPath} ${indexJsonPath} && pd sync ${pipeName}`,
  );
}

main();
