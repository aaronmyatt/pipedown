#!/usr/bin/env -S deno run --allow-all --no-check
// ── genPipeDescription.ts ──
// Generates or improves a pipeline description (pipeDescription) or a step
// description using Claude Code (`claude -p`). The workflow:
//   1. `pd build` to ensure .pd/ is fresh
//   2. Prompt for pipe name + optional step index if not provided as CLI args
//   3. Extract a "slim" version of index.json (no internal metadata)
//   4. Send context + prompt to `claude -p` which writes updated JSON to /tmp
//   5. Back up the current index.json
//   6. Merge the generated description into index.json
//   7. `pd sync` to write changes back to source markdown
//
// Usage:
//   deno run -A genPipeDescription.ts <pipeName> [stepIndex] [prompt]
//   deno run -A genPipeDescription.ts boards           # pipe-level description
//   deno run -A genPipeDescription.ts boards 1         # step 1 description
//   deno run -A genPipeDescription.ts boards 1 "focus on error handling"
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

// The .pd/ directory is always relative to the current working directory,
// mirroring how the `pd` CLI resolves it.
const PD_DIR = join(Deno.cwd(), ".pd");

// Temporary output path where Claude writes its result. Using /tmp avoids
// cluttering the project directory and provides a predictable read-back location.
const TMP_OUTPUT = "/tmp/pd_gen_description.json";

// ── System Prompt ──
// This is the static context sent to Claude so it understands what Pipedown is,
// how descriptions are used, and what format to output. It includes a real-world
// example from the jira-sprint-metrics project to ground the model's output in
// a concrete pattern.

const SYSTEM_PROMPT =
  `You are an expert Pipedown assistant. Pipedown transforms markdown files into
executable TypeScript pipelines on Deno.

## Your Task

Generate a clear, concise description for a Pipedown pipeline or step.

## What a Description Is

- **Pipeline description** (pipeDescription): 1-3 sentences below the H1 heading
  explaining what this pipeline does, what APIs or services it calls, and what
  its output is.
- **Step description**: 1-2 sentences between the H2 heading and the code block
  explaining what this specific step does in the context of the pipeline.

## How to Write Good Descriptions

- Reference key \`input\` properties the step reads from or writes to.
- Mention external APIs, services, or files accessed.
- Note conditional execution directives if present (not:/check:/route: etc.).
- Keep it factual — describe what the code does, not why it exists.
- Do NOT use markdown formatting, quotes, or code fences in the description text.
- Plain text only.

## Example: Pipeline Markdown

\`\`\`markdown
# Boards

List all Jira boards accessible to the authenticated user. This is the entry
point for discovering which board contains the sprints you want to analyse.

The pipeline authenticates against the Jira Cloud REST API using credentials
stored in \\\`opts.config\\\`. It paginates through all results and returns a flat
list of boards with their IDs and names.

## Jira API Authentication

\\\`\\\`\\\`ts
import JiraAuth from "JiraAuth";
const { fetchWithCache } = await JiraAuth.process()
input.fetchWithCache = fetchWithCache;
\\\`\\\`\\\`

## Fetch Boards

Call GET /rest/agile/1.0/board with pagination. Jira returns pages of 50 by
default — keep fetching while startAt + maxResults < total. Collect every
board's id, name, and type into input.boards.

\\\`\\\`\\\`ts
const MAX_RESULTS_PER_PAGE = $p.get(opts, "/config/MAX_RESULTS_PER_PAGE") ?? 50;
input.boards = [];
// ... pagination logic ...
\\\`\\\`\\\`

## Format Output

\\\`\\\`\\\`ts
input.boards = (input.boards ?? []).map((board) => ({
  id: board.id,
  name: board.name,
  type: board.type ?? "",
}));
\\\`\\\`\\\`
\`\`\`

## Example: Slim JSON (what you receive as context)

\`\`\`json
{
  "name": "Boards",
  "pipeDescription": "List all Jira boards accessible to the authenticated user...",
  "config": { "MAX_RESULTS_PER_PAGE": 50, "BOARD_ID": 2662 },
  "schema": "z.object({ boards: z.array(z.object({ id: z.number(), name: z.string() })).default([]) })",
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
      "code": "const MAX_RESULTS_PER_PAGE = ...",
      "language": "ts",
      "inList": false
    }
  ]
}
\`\`\`

## Output Format

You MUST write a JSON file to \`${TMP_OUTPUT}\` containing ONLY the fields you are updating.

For a **pipeline description**, write:
\`\`\`json
{ "pipeDescription": "Your generated description here." }
\`\`\`

For a **step description**, write:
\`\`\`json
{ "stepIndex": 1, "description": "Your generated description here." }
\`\`\`

Output NOTHING else — no explanations, no commentary. Just write the file.`;

// ── Helpers ──

/**
 * Strips internal metadata fields from an index.json Pipe object, keeping only
 * the fields an LLM needs to understand the pipeline. This dramatically reduces
 * token usage: a typical index.json shrinks from ~240 lines to ~80.
 *
 * @param {Record<string, unknown>} pipe - The full index.json object
 * @returns {Record<string, unknown>} A slim copy with only LLM-relevant fields
 */
// deno-lint-ignore no-explicit-any
function slimPipeJson(pipe: any): Record<string, unknown> {
  // Keep only the fields that help the LLM understand structure and data flow.
  // Drop: rawSource (entire markdown duplicated), original* fields (mutation
  // tracking), sourceMap (line numbers for reconstruction), stepId/fingerprint
  // (internal tracking), range (token indices), file system paths.
  const slim: Record<string, unknown> = {
    name: pipe.name,
  };

  // Only include non-empty optional fields to keep the context tight.
  if (pipe.pipeDescription) slim.pipeDescription = pipe.pipeDescription;
  if (pipe.schema) slim.schema = pipe.schema;

  // Strip internal config fields like 'templates' that aren't relevant to
  // understanding the pipeline's behaviour.
  if (pipe.config) {
    // deno-lint-ignore no-explicit-any
    const { templates: _, ...cleanConfig } = pipe.config as any;
    if (Object.keys(cleanConfig).length > 0) slim.config = cleanConfig;
  }

  // For each step, keep only the fields that describe what it does.
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
 * Runs a shell command and returns its output. Throws on non-zero exit code.
 * Ref: https://docs.deno.com/api/deno/~/Deno.Command
 *
 * @param {string[]} cmd - Command and arguments
 * @param {object} opts - Options: cwd for working directory
 * @returns {Promise<string>} stdout text
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
 * Interactively prompts the user for input. Returns the trimmed response.
 * Uses Deno's built-in prompt() which reads from stdin.
 * Ref: https://docs.deno.com/api/deno/~/prompt
 *
 * @param {string} message - The prompt message to display
 * @returns {string} User's response, trimmed
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
 * Uses `which` to probe — returns true if the command exits cleanly.
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
 * The items are piped into fzf's stdin; fzf renders its TUI on /dev/tty so it
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
      // Reverse layout puts the prompt at the top — more natural for short lists.
      // Ref: https://github.com/junegunn/fzf#layout
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
    // User pressed Escape or Ctrl-C in fzf — treat as cancellation.
    console.error("Selection cancelled.");
    Deno.exit(1);
  }
  return new TextDecoder().decode(result.stdout).trim();
}

// ── Main ──

async function main() {
  const args = parseArgs(Deno.args, {
    string: ["_"],
    // --prompt / -m allows passing a custom instruction to the LLM.
    alias: { m: "prompt" },
  });

  // Step 1: Always build first so .pd/ reflects the latest markdown source.
  // This ensures the index.json we read is never stale.
  console.log("Building pipelines...");
  await run(["pd", "build"]);
  console.log("Build complete.\n");

  // Step 2: Determine the target pipe and optional step index.
  // Accept them as positional args or prompt interactively.
  let pipeName = args._[0] as string | undefined;
  let stepTarget = args._[1] as string | undefined;
  const userPrompt = (args.prompt as string) ||
    (args._[2] as string | undefined);

  // Detect fzf once — reused for both pipe and step selection.
  const useFzf = await hasFzf();

  if (!pipeName) {
    // Get the list of available pipe names from `pd list`.
    const listOutput = await run(["pd", "list"]);
    // `pd list` prints ANSI-coloured names, one per line. Strip colour codes
    // so fzf and plain prompts both get clean strings.
    // Ref: https://en.wikipedia.org/wiki/ANSI_escape_code
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

  // Step 3: Load the full index.json and extract the slim version.
  const indexJsonPath = join(PD_DIR, pipeName, "index.json");
  let fullPipe: Record<string, unknown>;
  try {
    fullPipe = JSON.parse(await Deno.readTextFile(indexJsonPath));
  } catch (e) {
    console.error(`Could not read ${indexJsonPath}: ${(e as Error).message}`);
    console.error("Make sure the pipe name matches a directory under .pd/");
    Deno.exit(1);
  }

  const slim = slimPipeJson(fullPipe);

  // If no step target was provided, ask if the user wants pipe-level or
  // step-level description. Show step names for convenience.
  // deno-lint-ignore no-explicit-any
  const steps = (fullPipe as any).steps || [];
  if (stepTarget === undefined) {
    // Build the list of options: a special "pipe description" entry followed
    // by each step, prefixed with its index for easy parsing.
    const PIPE_LEVEL_LABEL = "(pipe-level description)";
    // deno-lint-ignore no-explicit-any
    const stepLabels = steps.map((s: any, i: number) => `${i}: ${s.name}`);
    const allOptions = [PIPE_LEVEL_LABEL, ...stepLabels];

    if (useFzf) {
      const selected = await fzfSelect(allOptions, "Select target:");
      if (selected === PIPE_LEVEL_LABEL) {
        stepTarget = undefined;
      } else {
        // fzf returns the full line, e.g. "2: Fetch Boards". Extract the
        // leading index number.
        stepTarget = selected.split(":")[0];
      }
    } else {
      console.log("\nSteps in this pipeline:");
      stepLabels.forEach((l: string) => console.log(`  ${l}`));
      console.log(
        "  (press Enter for pipe-level description, or type a step index/name)",
      );
      const raw = prompt("Step (or Enter for pipe description):");
      stepTarget = raw?.trim() || undefined;
    }
  }

  // Resolve step index if a step target was provided. Supports numeric index
  // or partial heading name match (same logic as pd llm).
  let stepIndex: number | undefined;
  if (stepTarget !== undefined && stepTarget !== "") {
    const idx = parseInt(stepTarget);
    if (!isNaN(idx)) {
      if (idx < 0 || idx >= steps.length) {
        console.error(
          `Step index ${idx} out of range (0-${steps.length - 1})`,
        );
        Deno.exit(1);
      }
      stepIndex = idx;
    } else {
      // Search by name (case-insensitive partial match).
      // deno-lint-ignore no-explicit-any
      const found = steps.findIndex((s: any) =>
        s.name.toLowerCase().includes(stepTarget!.toLowerCase()) ||
        s.funcName.toLowerCase().includes(stepTarget!.toLowerCase())
      );
      if (found === -1) {
        console.error(`No step matching "${stepTarget}" found.`);
        Deno.exit(1);
      }
      stepIndex = found;
    }
    console.log(`\nTargeting step ${stepIndex}: ${steps[stepIndex!].name}`);
  } else {
    console.log("\nTargeting pipe-level description.");
  }

  // Step 4: Build the prompt for Claude. Include the slim JSON as context
  // and a task-specific instruction.
  const taskDescription = stepIndex !== undefined
    ? `Generate a description for step ${stepIndex} ("${
      steps[stepIndex].name
    }") in the "${slim.name}" pipeline.
The step's code is:
\`\`\`ts
${steps[stepIndex].code}
\`\`\`
${
      steps[stepIndex].config
        ? `Conditional directives: ${JSON.stringify(steps[stepIndex].config)}`
        : ""
    }
${userPrompt ? `\nAdditional instruction: ${userPrompt}` : ""}

Write the result to ${TMP_OUTPUT} as: { "stepIndex": ${stepIndex}, "description": "..." }`
    : `Generate a pipeline-level description (pipeDescription) for the "${slim.name}" pipeline.
${userPrompt ? `\nAdditional instruction: ${userPrompt}` : ""}

Write the result to ${TMP_OUTPUT} as: { "pipeDescription": "..." }`;

  const fullPrompt = `## Pipeline Context (slim JSON)

\`\`\`json
${JSON.stringify(slim, null, 2)}
\`\`\`

## Task

${taskDescription}`;

  // Step 5: Call `claude -p` with the system prompt and user prompt.
  // --print mode runs Claude non-interactively and exits when done.
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

  // Build the --allowedTools args. Each Read pattern must be a separate
  // argument because --allowedTools is variadic. We place the prompt on
  // stdin (below) so it doesn't get consumed as a tool name.
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

  // Step 7: Back up the current index.json before modifying it. The backup
  // is written alongside the original with a .bak extension so rollback is
  // as simple as `cp index.json.bak index.json && pd sync <pipe>`.
  const backupPath = indexJsonPath + ".bak";
  await Deno.copyFile(indexJsonPath, backupPath);
  console.log(`Backed up ${indexJsonPath} → ${backupPath}`);

  // Step 8: Merge the generated description into the full index.json.
  // deno-lint-ignore no-explicit-any
  const pipe = fullPipe as any;
  if (generated.pipeDescription !== undefined) {
    // Pipe-level description update.
    pipe.pipeDescription = generated.pipeDescription;
    console.log("Updated pipeDescription.");
  } else if (
    generated.stepIndex !== undefined && generated.description !== undefined
  ) {
    // Step-level description update.
    const si = generated.stepIndex as number;
    if (si >= 0 && si < pipe.steps.length) {
      pipe.steps[si].description = generated.description;
      console.log(`Updated step ${si} description.`);
    } else {
      console.error(`Invalid stepIndex ${si} in generated output.`);
      Deno.exit(1);
    }
  } else {
    console.error(
      "Generated JSON does not contain expected fields (pipeDescription or stepIndex+description).",
    );
    Deno.exit(1);
  }

  // Write the updated index.json back to disk.
  await Deno.writeTextFile(indexJsonPath, JSON.stringify(pipe, null, 2));
  console.log(`Wrote updated ${indexJsonPath}`);

  // Step 9: Run `pd sync` to reconstruct the source markdown from the
  // modified index.json. This uses pipeToMarkdown's lossless mode when
  // rawSource + sourceMap are present, preserving original formatting.
  console.log("\nSyncing changes back to markdown...");
  const syncOutput = await run(["pd", "sync", pipeName]);
  console.log(syncOutput);
  console.log("Done! Review the changes in your markdown file.");
  console.log(
    `Rollback: cp ${backupPath} ${indexJsonPath} && pd sync ${pipeName}`,
  );
}

main();
