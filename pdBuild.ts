import { esbuild, std, pd } from "./deps.ts";
import { denoPlugins } from "jsr:@luca/esbuild-deno-loader@0.10.3";
import { mdToPipe } from "./mdToPipe.ts";
import { pipeToScript } from "./pipeToScript.ts";
import { camelCaseString } from "./pdUtils.ts";
import * as templates from "./stringTemplates.ts";
import type { Input, WalkOptions, Pipe, PipeConfig } from "./pipedown.d.ts";  

const PD_DIR = `./.pd`;
const fileName = (path: string) => camelCaseString(std.parsePath(path).name);
const fileDir = (path: string) => std.parsePath(path).dir;

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

async function parseMdFiles(input: pdBuildInput) {
  input.pipes = input.pipes || [];
  // input.errors = input.errors || [];
  const opts: WalkOptions = {
    exts: [".md"],
    skip: [
      /node_modules/,
      /\.pd/,
      /^readme\.md\/*$/,
      /^README\.md\/*$/,
    ]
    .concat(respectGitIgnore())
    .concat((input.globalConfig.skip || []).map((glob) => std.globToRegExp(glob)))
    .concat((input.globalConfig.exclude || []).map((glob) => std.globToRegExp(glob)))
  };
  if (input.match) opts.match = [new RegExp(input.match)];
  for await (const entry of std.walk(".", opts)) {
    const markdown = await Deno.readTextFile(entry.path);
    const output = await mdToPipe({ markdown });
    input.errors = input.errors?.concat(output.errors || [])
    if (output.pipe && output.pipe.steps.length > 0) {
      output.pipe.fileName = fileName(entry.path);
      output.pipe.dir = std.join(PD_DIR, fileDir(entry.path), 'index.md');
      output.pipe.config = std.deepMerge(input.globalConfig, output.pipe.config || {});

      input.pipes && input.pipes.push(output.pipe);

      try {
        await Deno.mkdir(output.pipe.dir, { recursive: true });
      } catch (e) {
        if (e.name !== "AlreadyExists") throw e;
      }
      const jsonPath = `${output.pipe.dir}/index.json`;
      await Deno.writeTextFile(jsonPath, JSON.stringify(output.pipe, null, 2));
      await Deno.writeTextFile(`${output.pipe.dir}/${entry.name}`, markdown);
    }
  }
  return input;
}

async function transformMdFiles(input: pdBuildInput) {
  for (const pipe of (input.pipes || [])) {
    const scriptPath = `${pipe.dir}/index.ts`;
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

async function copyFiles(input: pdBuildInput) {
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
    .concat((input.globalConfig.skip || []).map((glob) => std.globToRegExp(glob)))
    .concat((input.globalConfig.exclude || []).map((glob) => std.globToRegExp(glob)))
  };

  if (input.match) opts.match = [new RegExp(input.match)];
  for await (const entry of std.walk(".", opts)) {
    const dest = std.join(PD_DIR, fileDir(entry.path), entry.name);
    await Deno.mkdir(std.dirname(dest), { recursive: true });
    await Deno.copyFile(entry.path, dest);
  }
}

async function writeTests(input: pdBuildInput) {
  for (const pipe of (input.pipes || [])) {
    const testPath = `${pipe.dir}/test.ts`;
    if (await std.exists(testPath)) continue;
    await Deno.writeTextFile(
      testPath,
      templates.denoTestFileTemplate(pipe.name),
    );
  }
  return input;
}

async function writeDenoImportMap(input: pdBuildInput) {
  input.importMap = {
    imports: {
      "/": "./",
      "./": "./"
    },
    lint: {
      include: [
        ".pd/**/*.ts",
      ],
      exclude: [
        ".pd/**/*.json",
        ".pd/**/*.md",
      ],
    },
  };

  for await (const entry of std.walk("./.pd", { exts: [".ts"] })) {
    const dirName = std.dirname(entry.path).split("/").pop();
    const innerPath = std.dirname(entry.path).replace(/\.pd\//, "");
    if(entry.path.includes('index.ts')) {
      // regex for '.pd' at start of path
      const regex = new RegExp(`^\.pd`);
      const path = entry.path.replace(regex, '.');  
      input.importMap.imports[`${dirName}`] = path;
      input.importMap.imports['/'+innerPath] = path;
    }
  }
  await Deno.writeTextFile(
    `${PD_DIR}/deno.json`,
    JSON.stringify(input.importMap, null, 2),
  );
  return input;
}

async function writeReplEvalFile(input: pdBuildInput) {
  const replEvalPath = `${PD_DIR}/replEval.ts`;

  // assumes deno repl is run from .pd directory
  const importNames = 
    (input.importMap ? Object.keys(input.importMap.imports) : [])
    .filter(key => !key.includes('/'))
    .filter(key => input.importMap?.imports[key].endsWith('index.ts'));

  await Deno.writeTextFile(replEvalPath, templates.denoReplEvalTemplate(importNames));
}

async function writeReplFile(input: pdBuildInput) {
  const path = `./repl`;
  await Deno.writeTextFile(path, templates.denoReplTemplate());
  await Deno.chmod(path, 0o755);
}

const writeCliFile = async (input: pdBuildInput) => {
  for (const pipe of (input.pipes || [])) {
    const cliPath = `${pipe.dir}/cli.ts`;
    if (await std.exists(cliPath)) continue;
    await Deno.writeTextFile(cliPath, templates.pdCliTemplate());
  }
};

const writeServerFile = async (input: pdBuildInput) => {
  for (const pipe of (input.pipes || [])) {
    const serverPath = `${pipe.dir}/server.ts`;
    if (await std.exists(serverPath)) continue;
    await Deno.writeTextFile(serverPath, templates.pdServerTemplate());
  }
  return input;
};

const writeWorkerFile = async (input: pdBuildInput) => {
  for (const pipe of (input.pipes || [])) {
    const workerPath = `${pipe.dir}/worker.ts`;
    if (await std.exists(workerPath)) continue;
    await Deno.writeTextFile( workerPath, templates.pdWorkerTemplate());
  }
  return input;
};

async function buildIIFE(input: pdBuildInput) {
  const configPath = Deno.cwd() + "/.pd/deno.json";
  const _denoPlugins = denoPlugins({ configPath, loader: "native" })
  const filteredPipes = input.pipes?.filter((pipe) => pipe.config?.build?.includes("iife")) || [];
  for (const pipe of filteredPipes) {
    const scriptPath = `${pipe.dir}/index.ts`;
    await esbuild.build({
      bundle: true,
      entryPoints: [scriptPath],
      // entryNames: "[dir].js",
      format: "iife",
      treeShaking: true,
      // outdir: '.pd/public',
      outfile: `${pipe.dir}/index.iife.js`,
      globalName: `PD.${pipe.fileName}`,
      plugins: _denoPlugins,
    })
      .catch((e) => {
        input.warning = input.warning || [];
        input.warning.push(e);
      });
  }
}

async function buildESM(input: pdBuildInput) {
  const configPath = Deno.cwd() + "/.pd/deno.json";
  const _denoPlugins = denoPlugins({ configPath })
  const filteredPipes = input.pipes?.filter((pipe) => pipe.config?.build?.includes("esm")) || [];
  for (const pipe of filteredPipes) {
    const scriptPath = `${pipe.dir}/index.ts`;
    await esbuild.build({
      bundle: true,
      entryPoints: [scriptPath],
      // entryNames: "[dir].js",
      format: "esm",
      treeShaking: true,
      // outdir: '.pd/public',
      outfile: `${pipe.dir}/index.esm.js`,
      globalName: `PD.${pipe.fileName}`,
      plugins: _denoPlugins,
    }).catch((e) => {
      input.warning = input.warning || [];
      input.warning.push(e);
    });
  }
}

function report(input: pdBuildInput) {
  console.log(
    std.colors.brightGreen(`Markdown files processed: ${input.pipes?.length}`),
  );
  return input;
}

export interface pdBuildInput extends Input {
  importMap?: {
    imports: {
      [key: string]: string;
    };
    lint: {
      include: string[];
      exclude: string[];
    };
  };
  pipes?: Pipe[];
  warning?: string[];
  match?: string;
  globalConfig: PipeConfig;
}

export const pdBuild = async (input: pdBuildInput) => {
  input = Object.assign(input, {
    importMap: { imports: {} },
    pipes: [],
  });

  const funcs = [
    parseMdFiles,
    transformMdFiles,
    copyFiles,
    writeTests,
    writeDenoImportMap,
    writeReplEvalFile,
    writeReplFile,
    writeCliFile,
    writeServerFile,
    writeWorkerFile,
    buildIIFE,
    buildESM,
    report,
  ];

  return await pd.process(funcs, input, {});
};
