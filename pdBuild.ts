import {pd, std} from "./deps.ts";
import {mdToPipe} from "./mdToPipe.ts";
import {pipeToScript} from "./pipeToScript.ts";
import * as utils from "./pdUtils.ts";
import type {Step, WalkOptions, BuildInput, Pipe, WorkspaceMetadata} from "./pipedown.d.ts";
import {defaultTemplateFiles} from "./defaultTemplateFiles.ts";
import {exportPipe} from "./exportPipe.ts";
import {readPipedownConfig} from "./pdConfig.ts";

// ── Helpers ──

/**
 * Resolves the working directory for the current build. Uses input.cwd
 * when provided (e.g. by the dashboard server building a different
 * project), otherwise falls back to the process's Deno.cwd().
 *
 * @param input - The build input that may carry an overridden cwd
 * @returns Absolute path to use as the project root
 */
const resolveCwd = (input: BuildInput): string => input.cwd || Deno.cwd();

/**
 * Returns the .pd output directory path relative to the resolved cwd.
 * Kept as a function rather than a constant so it can be project-aware.
 *
 * @param input - The build input (used to resolve cwd)
 * @returns Absolute path to the .pd directory
 */
const resolvePdDir = (input: BuildInput): string =>
  std.join(resolveCwd(input), ".pd");

const _walkOpts: WalkOptions = {
  exts: [".md"],
  skip: [
    /node_modules/,
    /\.pd/,
    /^readme\.md\/*$/,
    /^README\.md\/*$/,
    /deno.*/,
  ]
}

/**
 * Builds walk options for std.walk, merging base defaults with
 * gitignore patterns and any global skip/exclude config.
 *
 * @param input    - Build input carrying globalConfig and optional match filter
 * @param override - Additional WalkOptions to merge in
 * @returns Merged WalkOptions ready for std.walk
 */
function walkOptions(input: BuildInput, override: WalkOptions = {}) {
  const walkOpts = Object.assign({}, _walkOpts, override);
  // .concat() returns a new array — must reassign to apply gitignore and global skip/exclude patterns
  walkOpts.skip = (walkOpts.skip || [])
    .concat(respectGitIgnore(resolveCwd(input)))
    .concat(input.globalConfig?.skip || [])
    .concat(input.globalConfig?.exclude || []);
  if (input.match) walkOpts.match = [new RegExp(input.match)];
  return walkOpts;
}

/**
 * Reads the .gitignore file from the given root directory and converts
 * each glob pattern into a RegExp for use with std.walk's skip option.
 * Returns an empty array if no .gitignore exists.
 *
 * @param rootDir - Absolute path to the project root directory
 * @returns Array of RegExp patterns to skip during file walking
 */
const respectGitIgnore = (rootDir: string) => {
  // Ref: https://jsr.io/@std/path/doc/glob-to-reg-exp/~
  const gitIgnorePath = std.join(rootDir, ".gitignore");
  try {
    const gitIgnore = Deno.readTextFileSync(gitIgnorePath);
    return gitIgnore.split("\n").map((glob) => std.globToRegExp(glob));
  } catch (_e) {
    // probably no .gitignore file
    return [];
  }
};

/**
 * Walks the project directory for .md files, parses each into a Pipe
 * object, and appends valid pipes (with at least one non-internal step)
 * to input.pipes.
 *
 * Uses resolveCwd(input) as the walk root so the dashboard server can
 * build projects in directories other than the process cwd.
 *
 * @param input - The build input to populate with parsed pipes
 * @returns The mutated input with pipes[] populated
 */
async function parseMdFiles(input: BuildInput) {
  input.pipes = input.pipes || [];

  // Walk from the resolved project root, not necessarily Deno.cwd().
  const rootDir = resolveCwd(input);
  const pdDir = resolvePdDir(input);

  for await (const entry of std.walk(rootDir, walkOptions(input))) {
    const markdown = await Deno.readTextFile(entry.path);
    if (markdown === "") continue;

    // the "executable markdown" will live in a directory with the same name as the file.
    // We will use {pipe.dir}/index.ts for the entry point.
    const fileName = utils.fileName(entry.path);
    pd.$p.set(input, '/markdown/'+fileName, markdown);

    // dir is relative (for portability in generated output), absoluteDir
    // is the fully-resolved path for code that needs it.
    const relativeSubdir = std.parsePath(std.relative(rootDir, entry.path)).dir;
    const dir = std.join(pdDir, relativeSubdir, fileName);
    const absoluteDir = dir;
    const output = await mdToPipe({
      markdown,
      pipe: {
        mdPath: entry.path,
        fileName,
        dir,
        absoluteDir,
        config: Object.assign({}, input.globalConfig),
        name: "",
        cleanName: "",
        steps: [],
      },
    });

    if (
      output.pipe &&
      output.pipe.steps.filter((step: Step) => !step.internal).length > 0
    ) {
      input.pipes && input.pipes.push(output.pipe);
    }
  }
  return input;
}


// merge parent directory config (deno.json "pipedown" + config.json) into the pipe config
async function mergeParentDirConfig(input: BuildInput) {
  if (input.debug) console.log(`Merging parent directory configs for ${input.pipes?.length} pipes...`);
  for (const pipe of (input.pipes || [])) {
    const parts = pipe.mdPath.split("/");
    let config = pipe.config;

    if (input.debug) console.log(`Merging parent directory config for pipe: ${pipe.name}`);

    for (let i = parts.length - 1; i > 0; i--) {
      const parentDir = '/' + std.join(...parts.slice(0, i));
      try {
        const parentConfig = await readPipedownConfig(parentDir);
        if (Object.keys(parentConfig).length > 0) {
          config = Object.assign(config || {}, parentConfig);
        }
      } catch (_e) {
        // probably no config in this directory
      }
      const topOfProject = await std.exists(std.join(parentDir, '.pd', 'deno.json'));
      if(topOfProject) break;
    }
    pipe.config = config;
  }
}

// ── Step Fingerprinting ──
// Each step gets a content-based fingerprint (SHA-256 hex) derived from
// its meaningful content: code, funcName, and config. This fingerprint
// is used by the session layer to detect whether a step has changed
// between runs — unchanged upstream steps can safely reuse prior
// snapshots, making "rerun from here" fast and trustworthy.
//
// Ref: WEB_FIRST_WORKFLOW_PLAN.md §4.1-C (step fingerprint)
// Ref: WEB_FIRST_WORKFLOW_PLAN.md §8.3 (snapshot reuse model)
// Ref: https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest

/**
 * Computes a SHA-256 hex fingerprint from a step's meaningful content.
 *
 * The fingerprint captures three fields that define what a step *does*:
 *   1. `code`     — the actual executable logic
 *   2. `funcName` — the sanitised identifier (reflects heading changes)
 *   3. `config`   — conditional execution guards (checks, routes, etc.)
 *
 * Fields like `description`, `name`, `sourceMap`, and `range` are
 * deliberately excluded — they affect documentation and positioning
 * but not execution behaviour.
 *
 * @param step - The step to fingerprint
 * @returns Hex-encoded SHA-256 hash string
 */
export async function computeStepFingerprint(step: Step): Promise<string> {
  // Build a deterministic string from the meaningful fields.
  // JSON.stringify on config ensures object key order is consistent
  // (V8 preserves insertion order for string keys).
  const content = [
    step.code ?? "",
    step.funcName ?? "",
    step.config ? JSON.stringify(step.config) : "",
  ].join("\n");

  // Use the Web Crypto API (available in Deno) to compute SHA-256.
  // Ref: https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);

  // Convert the ArrayBuffer to a hex string.
  // Ref: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Uint8Array
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── Step ID Assignment ──
// Stable `stepId` values allow the web UI, sessions, and Pi patch proposals
// to reference steps durably across rebuilds. IDs are persisted in index.json
// but never written to markdown — they are a structured-workspace concern.
//
// Matching strategy (in priority order):
//   1. Exact match: same funcName at same array index → reuse stepId
//   2. Name match:  same funcName at a different index (step was moved) → reuse stepId
//   3. No match:    step is genuinely new → generate a fresh UUID
//
// Ref: WEB_FIRST_WORKFLOW_PLAN.md §4.1-C, §0 checklist
// Ref: https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID

/**
 * Reads the existing index.json for a pipe directory and returns the
 * steps array with their stepId values. Returns an empty array if the
 * file doesn't exist or can't be parsed (defensive — first build or
 * corrupted file should not block the pipeline).
 *
 * @param pipeDir - Absolute path to the .pd/<pipe>/ directory
 * @returns Array of prior steps with their stepId values
 */
async function readPriorSteps(pipeDir: string): Promise<Step[]> {
  try {
    const indexJsonPath = std.join(pipeDir, "index.json");
    const content = await Deno.readTextFile(indexJsonPath);
    const priorPipe = JSON.parse(content) as Pipe;
    return priorPipe.steps || [];
  } catch (_e) {
    // File doesn't exist yet (first build) or is unreadable — that's fine,
    // all steps will get fresh UUIDs.
    return [];
  }
}

/**
 * Assigns stable `stepId` values to each step in every pipe. Tries to
 * preserve existing IDs from the prior index.json by matching on funcName.
 * Also initialises the `workspace` metadata block on each pipe.
 *
 * This runs between `mergeParentDirConfig` and `writePipeDir` in the
 * build pipeline so that IDs are set before index.json is written.
 *
 * @param input - The build input containing parsed pipes
 * @returns The mutated input with stepIds and workspace metadata set
 */
export async function assignStepIds(input: BuildInput) {
  for (const pipe of (input.pipes || [])) {
    const priorSteps = await readPriorSteps(pipe.dir);

    // Build a lookup of prior stepIds by funcName for name-based matching.
    // If multiple prior steps share the same funcName (unusual but possible),
    // the first one wins — subsequent duplicates get fresh IDs.
    const priorByFuncName = new Map<string, string>();
    for (const ps of priorSteps) {
      if (ps.stepId && ps.funcName && !priorByFuncName.has(ps.funcName)) {
        priorByFuncName.set(ps.funcName, ps.stepId);
      }
    }

    // Track which prior stepIds have been claimed so we don't accidentally
    // assign the same ID to two different new steps.
    const usedIds = new Set<string>();

    for (let i = 0; i < pipe.steps.length; i++) {
      const step = pipe.steps[i];
      let assignedId: string | undefined;

      // Priority 1: exact match — same funcName at same index
      const priorAtIndex = priorSteps[i];
      if (
        priorAtIndex?.stepId &&
        priorAtIndex.funcName === step.funcName &&
        !usedIds.has(priorAtIndex.stepId)
      ) {
        assignedId = priorAtIndex.stepId;
      }

      // Priority 2: name match — same funcName at a different index (step moved)
      if (!assignedId) {
        const idFromName = priorByFuncName.get(step.funcName);
        if (idFromName && !usedIds.has(idFromName)) {
          assignedId = idFromName;
        }
      }

      // Priority 3: no match found — generate a new UUID
      // Ref: https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID
      if (!assignedId) {
        assignedId = crypto.randomUUID();
      }

      step.stepId = assignedId;
      usedIds.add(assignedId);

      // Compute content-based fingerprint for snapshot reuse detection.
      // This runs alongside ID assignment so both are set before index.json
      // is written. Ref: WEB_FIRST_WORKFLOW_PLAN.md §8.3
      step.fingerprint = await computeStepFingerprint(step);
    }

    // Set workspace metadata — after a build, the workspace is always "clean"
    // because index.json was just regenerated from the canonical markdown.
    // Ref: WEB_FIRST_WORKFLOW_PLAN.md §7.3
    pipe.workspace = {
      syncState: "clean",
      lastBuiltAt: new Date().toISOString(),
      lastModifiedBy: "build",
    } as WorkspaceMetadata;
  }

  return input;
}

async function writePipeDir(input: BuildInput) {
  for (const pipe of (input.pipes || [])) {
    if (input.debug) console.log(`Creating pipe directory: ${pipe.dir}`);
    await Deno.mkdir(pipe.dir, { recursive: true  });
  }
}

async function writePipeJson(input: BuildInput) {
  for (const pipe of (input.pipes || [])) {
    const path = std.join(pipe.dir, "index.json");
    await Deno.writeTextFile(path, JSON.stringify(pipe, null, 2));
  }
}

async function writePipeMd(input: BuildInput) {
  for (const pipe of (input.pipes || [])) {
    const path = std.join(pipe.dir, "index.md");
    input.markdown && pipe.fileName in input.markdown && await Deno.writeTextFile(path, input.markdown[pipe.fileName]);
  }
}

async function transformMdFiles(input: BuildInput) {
  for (const pipe of (input.pipes || [])) {
    const scriptPath = std.join(pipe.dir, "index.ts");
    const output = await pipeToScript({ pipe });
    if (output.success && output.script) {
      await Deno.writeTextFile(scriptPath, output.script);
    } else {
      input.errors = input.errors || [];
      input.errors.push(...(output.errors || []));
    }
  }
  return input;
}

const writeDefaultGeneratedTemplates = async (input: BuildInput) => {
  await defaultTemplateFiles(input);

}

const writeUserTemplates = async (input: BuildInput) => {
  for (const pipe of (input.pipes || [])) {
    for (
      const path of pd.$p.get(pipe, "/config/templates") ||
        [] as string[]
    ) {
      const pipePath = std.join(pipe.dir, utils.fileName(path) + ".ts");
      // Skip if file already exists (allows user overrides in .pd/<pipe>/)
      if (await std.exists(pipePath)) continue;
      await Deno.copyFile(path, pipePath);
    }
  }
  return input;
};

const maybeExportPipe = async (input: BuildInput) =>{
  await exportPipe(input);
}

function report(input: BuildInput) {
  if(input.debug) {
    input.markdownFilesProcesses = input.pipes?.length;
  }
  return input;
}

export const pdBuild = async (input: BuildInput) => {
  input = Object.assign(input, {
    importMap: { imports: {} },
    pipes: [],
  });

  const funcs = [
    // copyFiles,
    parseMdFiles,
    mergeParentDirConfig,
    assignStepIds,
    writePipeDir,
    writePipeJson,
    writePipeMd,
    transformMdFiles,
    writeDefaultGeneratedTemplates,
    writeUserTemplates,
    maybeExportPipe,
    report
  ];
  
  return await pd.process(funcs, input, {});
};
