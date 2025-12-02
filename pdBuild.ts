import {pd, std} from "./deps.ts";
import {mdToPipe} from "./mdToPipe.ts";
import {pipeToScript} from "./pipeToScript.ts";
import * as utils from "./pdUtils.ts";
import type {Step, WalkOptions, BuildInput} from "./pipedown.d.ts";
import {defaultTemplateFiles} from "./defaultTemplateFiles.ts";
import {exportPipe} from "./exportPipe.ts";
import {getProjectBuildDir, getProjectName} from "./pdCli/helpers.ts";

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

function walkOptions(input: BuildInput, override: WalkOptions = {}) {
  const walkOpts = Object.assign({}, _walkOpts, override);
  walkOpts.skip && walkOpts.skip
  .concat(respectGitIgnore())
  .concat(input.globalConfig?.skip || [])
  .concat(input.globalConfig?.exclude || [])
  if (input.match) walkOpts.match = [new RegExp(input.match)];
  return walkOpts;
}

const respectGitIgnore = () => {
  const gitIgnorePath = std.join(Deno.cwd(), ".gitignore");
  try {
    const gitIgnore = Deno.readTextFileSync(gitIgnorePath);
    return gitIgnore.split("\n").map((glob) => std.globToRegExp(glob));
  } catch (_e) {
    // probably no .gitignore file
    return [];
  }
};

async function parseMdFiles(input: BuildInput) {
  input.pipes = input.pipes || [];
  const projectName = getProjectName(input.globalConfig);
  const buildDir = getProjectBuildDir(projectName);

  for await (const entry of std.walk(Deno.cwd(), walkOptions(input))) {
    const markdown = await Deno.readTextFile(entry.path);
    if (markdown === "") continue;

    // the "executable markdown" will live in a directory with the same name as the file.
    // We will use {pipe.dir}/index.ts for the entry point.
    const fileName = utils.fileName(entry.path);
    pd.$p.set(input, '/markdown/'+fileName, markdown);
    const dir = std.join(
      buildDir,
      std.parsePath(std.relative(Deno.cwd(), entry.path)).dir,
      fileName,
    );
    const absoluteDir = std.join(
      buildDir,
      std.parsePath(std.relative(Deno.cwd(), entry.path)).dir,
      fileName,
    );
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
    input.errors = input.errors?.concat(output.errors || []);
    if (
      output.pipe &&
      output.pipe.steps.filter((step: Step) => !step.internal).length > 0
    ) {
      input.pipes && input.pipes.push(output.pipe);
    }
  }
  return input;
}


// merge parent directory config.json files into the pipe config
async function mergeParentDirConfig(input: BuildInput) {
  for (const pipe of (input.pipes || [])) {
    const parts = pipe.mdPath.split("/");
    let config = pipe.config;
    
    for (let i = parts.length - 1; i > 0; i--) {
      const parentDir = '/' + std.join(...parts.slice(0, i));
      const maybeConfigFilePath = std.join(parentDir, "config.json")
     try {
        const parentConfig = await Deno.readTextFile(maybeConfigFilePath);
        config = Object.assign(config || {}, JSON.parse(parentConfig));
      } catch (_e) {
        // probably no config file
      }
      // Check for project root indicators: deno.json or .git directory
      const hasDenoJson = await std.exists(std.join(parentDir, 'deno.json'));
      const hasGitDir = await std.exists(std.join(parentDir, '.git'));
      if(hasDenoJson || hasGitDir) break;
    }
    pipe.config = config;
  }
}

async function writePipeDir(input: BuildInput) {
  for (const pipe of (input.pipes || [])) {
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
      input.errors.concat(output.errors || []);
    }
  }
  return input;
}

async function copyFiles(input: BuildInput) {
  const projectName = getProjectName(input.globalConfig);
  const buildDir = getProjectBuildDir(projectName);
  // copy js(x),json,ts(x) files to build directory, preserving directory structure
  for await (const entry of std.walk(".", walkOptions(input, { exts: [".js", ".jsx", ".json", ".ts", ".tsx"] }))) {
    const dest = std.join(buildDir, utils.fileDir(entry.path), entry.name);
    await Deno.mkdir(std.dirname(dest), { recursive: true });
    await Deno.copyFile(entry.path, dest);
  }
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
    copyFiles,
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
