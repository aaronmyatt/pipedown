import {pd, std} from "./deps.ts";
import {mdToPipe} from "./mdToPipe.ts";
import {pipeToScript} from "./pipeToScript.ts";
import * as utils from "./pdUtils.ts";
import type {Step, WalkOptions, BuildInput} from "./pipedown.d.ts";
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
