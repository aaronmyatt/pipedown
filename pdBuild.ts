import {pd, std} from "./deps.ts";
import {mdToPipe} from "./mdToPipe.ts";
import {pipeToScript} from "./pipeToScript.ts";
import * as utils from "./pdUtils.ts";
import type {Step, WalkOptions, BuildInput} from "./pipedown.d.ts";
import {defaultTemplateFiles} from "./defaultTemplateFiles.ts";
import {exportPipe} from "./exportPipe.ts";

const PD_DIR = `./.pd`;

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
  // .concat() returns a new array — must reassign to apply gitignore and global skip/exclude patterns
  walkOpts.skip = (walkOpts.skip || [])
    .concat(respectGitIgnore())
    .concat(input.globalConfig?.skip || [])
    .concat(input.globalConfig?.exclude || []);
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

  for await (const entry of std.walk(Deno.cwd(), walkOptions(input))) {
    const markdown = await Deno.readTextFile(entry.path);
    if (markdown === "") continue;
    
    // the "executable markdown" will live in a directory with the same name as the file.
    // We will use {pipe.dir}/index.ts for the entry point.
    const fileName = utils.fileName(entry.path);
    pd.$p.set(input, '/markdown/'+fileName, markdown);
    const dir = std.join(
      PD_DIR,
      std.parsePath(std.relative(Deno.cwd(), entry.path)).dir,
      fileName,
    );
    const absoluteDir = std.join(
      Deno.cwd(),
      PD_DIR,
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
  if (input.debug) console.log(`Merging parent directory configs for ${input.pipes?.length} pipes...`);
  for (const pipe of (input.pipes || [])) {
    const parts = pipe.mdPath.split("/");
    let config = pipe.config;

    if (input.debug) console.log(`Merging parent directory config for pipe: ${pipe.name}`);
    
    for (let i = parts.length - 1; i > 0; i--) {
      const parentDir = '/' + std.join(...parts.slice(0, i));
      const maybeConfigFilePath = std.join(parentDir, "config.json")
     try {
        const parentConfig = await Deno.readTextFile(maybeConfigFilePath);
        config = Object.assign(config || {}, JSON.parse(parentConfig));
      } catch (_e) {
        // probably no config file
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
