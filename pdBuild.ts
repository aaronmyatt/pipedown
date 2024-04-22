import type { pdCliInput } from "./pdCli/mod.ts";

import * as esbuild from "https://deno.land/x/esbuild@v0.20.2/mod.js";
import { denoPlugins } from "jsr:@luca/esbuild-deno-loader";
import { walk } from "https://deno.land/std@0.206.0/fs/mod.ts";
import type { WalkOptions } from "https://deno.land/std@0.206.0/fs/mod.ts";
import * as colors from "https://deno.land/x/std/fmt/colors.ts";
import {
  dirname,
  join,
  parse,
} from "https://deno.land/std@0.208.0/path/mod.ts";
import { exists } from "https://deno.land/std@0.213.0/fs/exists.ts";
import { globToRegExp } from "https://deno.land/std@0.220.1/path/glob_to_regexp.ts";

import { mdToPipe } from "./mdToPipe.ts";
import { pipeToScript } from "./pipeToScript.ts";
import { process } from "jsr:@pd/pdpipe@0.1.1";
import { mergeErrors } from "./pdCli/helpers.ts";
import { deepMerge } from "https://deno.land/std@0.208.0/collections/deep_merge.ts";
import { camelCaseString } from "./pdUtils.ts";

const PD_DIR = `./.pd`;
const fileName = (path: string) => camelCaseString(parse(path).name);
const fileDir = (path: string) => parse(path).dir;

const respectGitIgnore = () => {
  const gitIgnorePath = join(Deno.cwd(), ".gitignore");
  try {
    const gitIgnore = Deno.readTextFileSync(gitIgnorePath);
    return gitIgnore.split("\n").map((glob) => globToRegExp(glob));
  } catch (e) {
    // probably no .gitignore file
    return [];
  }
};

async function parseMdFiles(input: pdBuildInput) {
  input.pipes = input.pipes || [];
  input.globalConfig = input.globalConfig || {};
  input.errors = input.errors || [];
  const opts: WalkOptions = {
    exts: [".md"],
    skip: [
      /node_modules/,
      /\.pd/,
      /^readme\.md\/*$/,
      /^README\.md\/*$/,
    ].concat(respectGitIgnore()),
  };
  if (input.match) opts.match = [new RegExp(input.match)];
  for await (const entry of walk(".", opts)) {
    const markdown = await Deno.readTextFile(entry.path);
    const output = await mdToPipe({ markdown });
    input = mergeErrors(input, output);
    if (output.pipe && output.pipe.steps.length > 0) {
      output.pipe.fileName = fileName(entry.path);
      output.pipe.dir = join(PD_DIR, fileDir(entry.path), output.pipe.fileName);
      output.pipe.config = output.pipe.config || {};
      output.pipe.config = deepMerge(input.globalConfig, output.pipe.config);

      input.pipes && input.pipes.push(output.pipe);

      try {
        await Deno.mkdir(output.pipe.dir, { recursive: true });
      } catch (e) {
        if (e.name !== "AlreadyExists") throw e;
      }
      const jsonPath = `${output.pipe.dir}/${output.pipe.camelName}.json`;
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
    if (output.success) {
      await Deno.writeTextFile(scriptPath, output.script);
    } else {
      input = mergeErrors(input, output);
    }
  }
  return input;
}

async function writeTests(input: pdBuildInput) {
  for (const pipe of (input.pipes || [])) {
    const testPath = `${pipe.dir}/test.ts`;
    if (await exists(testPath)) continue;
    await Deno.writeTextFile(
      testPath,
      `import { assertEquals } from "https://deno.land/std/testing/asserts.ts";
    import { assertSnapshot } from "https://deno.land/std@0.208.0/testing/snapshot.ts";
    import {pipe, rawPipe} from "./index.ts";

    Deno.test("${pipe.name}", async (t) => {
      rawPipe.config = rawPipe.config || {};
      rawPipe.config.inputs = rawPipe.config.inputs || [];
      
      for(const pipeInput of rawPipe.config.inputs) {
        const testName = pipeInput?._name || JSON.stringify(pipeInput)
        pipeInput.mode = 'test';
        await t.step({
          name: testName,
          fn: async () => {
            pipeInput.test = true;
            const output = await pipe.process(pipeInput);
            try {
              await assertSnapshot(t, output, {name: testName});
            } catch (e) {
              console.log(output);
              throw e;
            }
          }
        })
      }
    });`,
    );
  }
  return input;
}

async function writeDenoImportMap(input: pdBuildInput) {
  input.importMap = {
    imports: {
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

  for await (const entry of walk("./.pd", { exts: [".ts"] })) {
    // extract directory name from entry.path
    const dirName = dirname(entry.path).split("/").pop();
    // exclude .pd directory
    if (dirName === ".pd") continue;
    const innerPath = dirname(entry.path).replace(/\.pd\//, "");
    input.importMap.imports[`${dirName}`] = `./${innerPath}/index.ts`;
    input.importMap.imports['/'+innerPath] = `./${innerPath}/index.ts`;
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
  const imports = 
    (input.importMap ? Object.keys(input.importMap.imports) : [])
    .filter((key) => !key.includes('/'));
  const pipeImports = imports
    .map((key) => {
      return `import ${key} from "${key}";`;
    });

  const evalContent = `${pipeImports.join("\n")}
  import $p from "jsr:@pd/pointers@0.1.1";

  function test(pipe, { exclude = [], test = true } = {}) {
    pipe.json.config.inputs.forEach(i => {
      const match = exclude.map(path => $p.get(i, path)).some(Boolean)
      if(match) return;

      i.test = test;
      pipe.process(i).then(output => {
        console.log('Input:: '+JSON.stringify(i))
        output.errors && output.errors.map(e => console.error(e.message))
        output.data && console.info(output.data)
        console.log('')
      })
    })
  }

  async function step(pipe, { exclude = [], test = true } = {}) {
    const wTestMode = pipe.json.config.inputs.map(i => { i.test = test; return i })
    const inputIterable = wTestMode[Symbol.iterator]();
    let notDone = true; 
    let continueLoop = true; 
    while(notDone && continueLoop) {
      const { value, done } = inputIterable.next();
      if(done) notDone = false;
      if(notDone) {
        const match = exclude.map(path => $p.get(value, path)).some(Boolean)
        if(match) continue;
        const output = await pipe.process(value)
        console.log('Input:: ' + JSON.stringify(value))
        continueLoop = confirm('Press Enter to continue');
        output.errors && output.errors.map(e => console.error(e.message))
        console.info(output)
        console.log('')
      }
    }
  }

  ${
    imports.map((key) =>
      `const test${
        key[0].toUpperCase() + key.substring(1)
      } = () => test(${key});`
    ).join("\n")
  }
  ${
    imports.map((key) =>
      `const step${
        key[0].toUpperCase() + key.substring(1)
      } = () => step(${key});`
    ).join("\n")
  }
  `;

  await Deno.writeTextFile(replEvalPath, evalContent);
}

const writeCliFile = async (input: pdBuildInput) => {
  for (const pipe of (input.pipes || [])) {
    const cliPath = `${pipe.dir}/cli.ts`;
    if (await exists(cliPath)) continue;
    await Deno.writeTextFile(
      cliPath,
      `import pipe from "./index.ts"
import { parse } from "https://deno.land/std@0.202.0/flags/mod.ts";

const flags = parse(Deno.args);
const output = await pipe.process({ flags, mode: "cli" })
if(output.errors){
  console.error(output.errors)
  Deno.exit(1);
}
if(flags.pretty || flags.p){
  console.log(output);
} else {
  console.log(JSON.stringify(output));
  Deno.exit(0);
}
`,
    );
  }
};

const writeServerFile = async (input: pdBuildInput) => {
  for (const pipe of (input.pipes || [])) {
    const serverPath = `${pipe.dir}/server.ts`;
    if (await exists(serverPath)) continue;
    await Deno.writeTextFile(
      serverPath,
      `import pipe from "./index.ts"
const server = Deno.serve({ handler: async (request: Request) => {
        console.log(request.url);
        const output = await pipe.process({request, body: {}, responseOptions: {
                headers: {
                    "content-type": "application/json"
                },
                status: 200,
            },
            mode: "server"
        });
        if(output.errors) {
            console.error(output.errors);
            return new Response(JSON.stringify(output.errors), {status: 500});
        }
        if(output.responseOptions.headers['content-type'] === 'application/json' && typeof output.body === 'object') {
            output.body = JSON.stringify(output.body);
        }
        const response = output.response || new Response(output.body, output.responseOptions);
        return response;
    } });
server.finished.then(() => console.log("Server closed"));
`,
    );
  }
  return input;
};

const writeWorkerFile = async (input: pdBuildInput) => {
  for (const pipe of (input.pipes || [])) {
    const workerPath = `${pipe.dir}/worker.ts`;
    if (await exists(workerPath)) continue;
    await Deno.writeTextFile(
      workerPath,
      `import pipe from "./index.ts"
globalThis.addEventListener("install", async (event) => {
    event.waitUntil(pipe.process({event, mode: 'worker', type: {install: true}}));
})
globalThis.addEventListener("activate", async (event) => {
    event.waitUntil(pipe.process({event, mode: 'worker', type: {activate: true}}));
})
globalThis.addEventListener("fetch", async (event) => {
    const detectCacheExceptions = [
        event.request.headers.get("connection"),
        event.request.headers.get('content-type'),
        event.request.headers.get('accept')
    ];
    const skipCache = detectCacheExceptions.filter(Boolean)
        .some(header => {
            return ['upgrade', 'text/event-stream'].includes(header.toLowerCase())
        })
    if(skipCache) return;
    

    event.respondWith((async () => {
        const output = await pipe.process({
            event, 
            type: {fetch: true},
            request: event.request,
            body: {},
            responseOptions: {
                headers: {
                    "content-type": "application/json"
                },
                status: 200,
            }
        })
        if(output.errors) {
            console.error(output.errors);
            return new Response(JSON.stringify(output.errors), {status: 500});
        }
        const response = output.response || new Response(output.body, output.responseOptions);
        return response;
    })());
})

globalThis.addEventListener("message", async (event) => {
    const output = await pipe.process({event, mode: 'worker', type: {message: true}});
    if(output.errors) {
        console.error(output.errors);
        return;
    }
    if(output.data) {
        console.log(output.data);
    }
});`,
    );
  }
  return input;
};

async function buildIIFE(input: pdBuildInput) {
  const configPath = Deno.cwd() + "/.pd/deno.json";
  const _denoPlugins = denoPlugins({ configPath })
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
    colors.brightGreen(`Markdown files processed: ${input.pipes?.length}`),
  );
  return input;
}

export interface pdBuildInput extends pdCliInput {
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
}

export const pdBuild = async (input: pdBuildInput) => {
  input = Object.assign(input, {
    importMap: { imports: {} },
    pipes: [],
  });

  const funcs = [
    parseMdFiles,
    transformMdFiles,
    writeTests,
    writeDenoImportMap,
    writeReplEvalFile,
    writeCliFile,
    writeServerFile,
    writeWorkerFile,
    buildIIFE,
    buildESM,
    report,
  ];

  return await process(funcs, input, {});
};
