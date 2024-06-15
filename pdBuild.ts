import { esbuild, std, pd } from "./deps.ts";
import { denoPlugins } from "jsr:@luca/esbuild-deno-loader@0.10.3";
import { mdToPipe } from "./mdToPipe.ts";
import { pipeToScript } from "./pipeToScript.ts";
import * as utils from "./pdUtils.ts";
import * as templates from "./stringTemplates.ts";
import type { Input, WalkOptions, Pipe, Step } from "./pipedown.d.ts";  

const PD_DIR = `./.pd`;

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
    .concat(input.globalConfig?.skip || [])
    .concat(input.globalConfig?.exclude || [])
  };
  if (input.match) opts.match = [new RegExp(input.match)];

  for await (const entry of std.walk(Deno.cwd(), opts)) {
    const markdown = await Deno.readTextFile(entry.path);
    if(markdown === '') continue;

    // the "executable markdown" will live in a directory with the same name as the file.
    // We will use the {dir}/index.ts convention for the entry point.
    const fileName = utils.fileName(entry.path);
    const dir = std.join(PD_DIR, std.parsePath(std.relative(Deno.cwd(), entry.path)).dir, fileName)
    const output = await mdToPipe({ markdown,
      pipe: {
        fileName,
        dir,
        config: Object.assign({}, input.globalConfig),
        name: "",
        camelName: "",
        steps: [],
      }
    });
    input.errors = input.errors?.concat(output.errors || [])
    if (output.pipe && output.pipe.steps.filter((step: Step) => !step.internal).length > 0) {
      input.pipes && input.pipes.push(output.pipe);

      try {
        await Deno.mkdir(output.pipe.dir, { recursive: true });
      } catch (e) {
        if (e.name !== "AlreadyExists") throw e;
      }
      const jsonPath = std.join(output.pipe.dir, 'index.json');
      const markdownPath = std.join(output.pipe.dir, 'index.md')
      await Deno.writeTextFile(jsonPath, JSON.stringify(output.pipe, null, 2));
      await Deno.writeTextFile(markdownPath, markdown);
    }
  }
  return input;
}

async function transformMdFiles(input: pdBuildInput) {
  for (const pipe of (input.pipes || [])) {
    const scriptPath = std.join(pipe.dir, 'index.ts');
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
    .concat((input.globalConfig?.skip || []).map((glob) => std.globToRegExp(glob)))
    .concat((input.globalConfig?.exclude || []).map((glob) => std.globToRegExp(glob)))
  };

  if (input.match) opts.match = [new RegExp(input.match)];
  for await (const entry of std.walk(".", opts)) {
    const dest = std.join(PD_DIR, utils.fileDir(entry.path), entry.name);
    await Deno.mkdir(std.dirname(dest), { recursive: true });
    await Deno.copyFile(entry.path, dest);
  }
}

async function writeDeps(input: pdBuildInput) {
  // write empty deps.ts file if it doesn't exist

  const depsPath = std.join(PD_DIR, 'deps.ts');
  if (await std.exists(depsPath)) return input;
  await Deno.writeTextFile(depsPath, '');
  return input;
}


async function writeTests(input: pdBuildInput) {
  for (const pipe of (input.pipes || [])) {
    const testPath = std.join(pipe.dir, 'test.ts');
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
    std.join(PD_DIR, 'deno.json'),
    JSON.stringify(input.importMap, null, 2),
  );
  return input;
}

async function writeReplEvalFile(input: pdBuildInput) {
  const replEvalPath = std.join(PD_DIR, 'replEval.ts');

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
    const cliPath = std.join(pipe.dir, 'cli.ts');
    if (await std.exists(cliPath)) continue;
    await Deno.writeTextFile(cliPath, templates.pdCliTemplate());
  }
};

const writeServerFile = async (input: pdBuildInput) => {
  for (const pipe of (input.pipes || [])) {
    const serverPath = std.join(pipe.dir, 'server.ts');
    if (await std.exists(serverPath)) continue;
    await Deno.writeTextFile(serverPath, templates.pdServerTemplate());
  }
  return input;
};

const writeWorkerFile = async (input: pdBuildInput) => {
  for (const pipe of (input.pipes || [])) {
    const workerPath = std.join(pipe.dir, 'worker.ts');
    if (await std.exists(workerPath)) continue;
    await Deno.writeTextFile( workerPath, templates.pdWorkerTemplate());
  }
  return input;
};

const writeUserTemplates = async (input: pdBuildInput) => {
  for (const pipe of (input.pipes || [])) {
    for(const path of pd.$p.get(input, '/globalConfig/templates') || [] as string[]){
      const pipePath = std.join(pipe.dir, utils.fileName(path)+'.ts');
      await Deno.copyFile(path, pipePath);
    }
  }
  return input;
}

async function buildIIFE(input: pdBuildInput) {
  const configPath = std.join(Deno.cwd(),'.pd', 'deno.json');
  const _denoPlugins = denoPlugins({ configPath, loader: "native" })
  const filteredPipes = input.pipes?.filter((pipe) => pipe.config?.build?.includes("iife")) || [];
  for (const pipe of filteredPipes) {
    const scriptPath = std.join(pipe.dir, 'index.ts');
    await esbuild.build({
      bundle: true,
      entryPoints: [scriptPath],
      // entryNames: "[dir].js",
      format: "iife",
      treeShaking: true,
      // outdir: '.pd/public',
      outfile: std.join(pipe.dir, 'index.iife.js'),
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
  const configPath = std.join(Deno.cwd(),'.pd', 'deno.json');
  const _denoPlugins = denoPlugins({ configPath })
  const filteredPipes = input.pipes?.filter((pipe) => pipe.config?.build?.includes("esm")) || [];
  for (const pipe of filteredPipes) {
    const scriptPath = std.join(pipe.dir, 'index.ts');
    await esbuild.build({
      bundle: true,
      entryPoints: [scriptPath],
      // entryNames: "[dir].js",
      format: "esm",
      treeShaking: true,
      // outdir: '.pd/public',
      outfile: std.join(pipe.dir, 'index.esm.js'),
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
    writeDeps,
    writeTests,
    writeDenoImportMap,
    writeReplEvalFile,
    writeReplFile,
    writeCliFile,
    writeServerFile,
    writeWorkerFile,
    writeUserTemplates,
    buildIIFE,
    buildESM,
    report,
  ];

  return await pd.process(funcs, input, {});
};
