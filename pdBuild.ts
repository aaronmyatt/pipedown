import {pd, std} from "./deps.ts";
import {mdToPipe} from "./mdToPipe.ts";
import {pipeToScript} from "./pipeToScript.ts";
import * as utils from "./pdUtils.ts";
import type {Step, WalkOptions, BuildInput} from "./pipedown.d.ts";
import {defaultTemplateFiles} from "./defaultTemplateFiles.ts";
import {exportPipe} from "./exportPipe.ts";

const PD_DIR = `./.pd`;

const walkOpts: WalkOptions = {
  exts: [".md"],
  skip: [
    /node_modules/,
    /\.pd/,
    /^readme\.md\/*$/,
    /^README\.md\/*$/,
  ]
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
  // input.errors = input.errors || [];
  walkOpts.skip && walkOpts.skip
      .concat(respectGitIgnore())
      .concat(input.globalConfig?.skip || [])
      .concat(input.globalConfig?.exclude || [])
  if (input.match) walkOpts.match = [new RegExp(input.match)];

  for await (const entry of std.walk(Deno.cwd(), walkOpts)) {
    const markdown = await Deno.readTextFile(entry.path);
    if (markdown === "") continue;

    // the "executable markdown" will live in a directory with the same name as the file.
    // We will use the {dir}/index.ts convention for the entry point.
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
  // copy js(x),json,ts(x) files to .pd directory, preserving directory structure
  const opts: WalkOptions = {
    exts: [".js", ".jsx", ".json", ".ts", ".tsx"],
    skip: [
      /node_modules/,
      /\.pd/,
      /^readme\.md\/*$/,
      /^README\.md\/*$/,
      /deno.*/,
    ]
      .concat(respectGitIgnore())
      .concat(input.globalConfig?.skip || [])
      .concat(input.globalConfig?.exclude || []),
  };

  if (input.match) opts.match = [new RegExp(input.match)];
  for await (const entry of std.walk(".", opts)) {
    const dest = std.join(PD_DIR, utils.fileDir(entry.path), entry.name);
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
      const path of pd.$p.get(input, "/globalConfig/templates") ||
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
    parseMdFiles,
    writePipeDir,
    writePipeJson,
    writePipeMd,
    transformMdFiles,
    copyFiles,
    writeDefaultGeneratedTemplates,
    writeUserTemplates,
    maybeExportPipe,
    report
  ];
  
  return await pd.process(funcs, input, {});
};
