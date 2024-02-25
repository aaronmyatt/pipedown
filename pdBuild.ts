import type {pdCliInput} from "./pdCli/mod.ts";

import {walk} from "https://deno.land/std@0.206.0/fs/mod.ts";
import * as colors from "https://deno.land/x/std/fmt/colors.ts";
import {dirname, parse} from "https://deno.land/std@0.208.0/path/mod.ts";

import {mdToPipe} from "./mdToPipe.ts";
import {pipeToScript} from "./pipeToScript.ts";
import {process} from "./pdPipe.ts";
import {mergeErrors} from "./pdCli/helpers.ts";
import {deepMerge} from "https://deno.land/std@0.208.0/collections/deep_merge.ts";
import {PD_PIPE_DIR} from "./pdUtils.ts";

const PD_DIR = `./.pd`;
const fileName = (path: string) => parse(path).name;

async function parseMdFiles(input: pdBuildInput) {
    input.errors = input.errors || [];
    const opts = {exts: [".md"], skip: [/node_modules/, /\.pd/], match: input.match ? [RegExp(input.match)] : []};
    for await (const entry of walk(".", opts)) {
        const markdown = await Deno.readTextFile(entry.path);
        const output = await mdToPipe({markdown});
        input = mergeErrors(input, output);
        if (output.pipe && output.pipe.steps.length > 0) {
            output.pipe.dir = `${PD_DIR}/${fileName(entry.path)}`;
            output.pipe.fileName = fileName(entry.path);
            output.pipe.config = output.pipe.config || {};
            output.pipe.config = deepMerge(input.globalConfig, output.pipe.config);

            input.pipes && input.pipes.push(output.pipe);

            try {
                await Deno.mkdir(output.pipe.dir);
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
        const output = await pipeToScript({pipe});
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
            "pdlib": `file://${Deno.cwd()}/.pd`,
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

    for await (const entry of walk("./.pd", {exts: [".ts"]})) {
        // extract directory name from entry.path
        const dirName = dirname(entry.path).split("/").pop();
        input.importMap.imports[`${dirName}`] = `./${dirName}/index.ts`;
    }
    await Deno.writeTextFile(
        `${PD_DIR}/deno.json`,
        JSON.stringify(input.importMap, null, 2),
    );
    return input;
}

async function writeReplEvalFile(input: pdBuildInput) {
    // assumes deno repl is run from .pd directory
    const imports = input.importMap ? Object.keys(input.importMap.imports) : [];
    const pipeImports = imports
        .map((key) => {
            return `import ${key} from "${key}";`;
        });

    const evalContent = `${pipeImports.join("\n")}
  import {$p} from "${PD_PIPE_DIR}/jsonPointers.ts";

  function run(pipe, { exclude = [], test = true } = {}) {
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

  ${imports.map(key => `const run${key} = () => run(${key}Json);`).join("\n")}
  ${imports.map(key => `const step${key} = () => step(${key}Json);`).join("\n")}
  `
    const replEvalPath = `${PD_DIR}/replEval.ts`;
    await Deno.writeTextFile(replEvalPath, evalContent);
}

interface pdBuildInput extends pdCliInput {
    importMap?: {
        imports: {
            [key: string]: string
        },
        lint: {
            include: string[],
            exclude: string[],
        }
    };
    pipes?: Pipe[];
}

function report(input: pdBuildInput) {
    if (input.pipes && input.pipes.length > 1) {
        console.log(
            colors.brightGreen(`Markdown files processed: ${input.pipes?.length}`),
        );
    }
    return input;
}


export const pdBuild = async (input: pdBuildInput) => {
    input = Object.assign(input, {
        importMap: {imports: {}},
        pipes: [],
    });

    const funcs = [
        parseMdFiles,
        transformMdFiles,
        writeTests,
        writeDenoImportMap,
        writeReplEvalFile,
        async (input: pdBuildInput) => {
            for (const pipe of (input.pipes || [])) {
                const cliPath = `${pipe.dir}/cli.ts`;
                await Deno.writeTextFile(cliPath, `import pipe from "./index.ts"
import { parse } from "https://deno.land/std@0.202.0/flags/mod.ts";

const flags = parse(Deno.args);
const output = await pipe.process({ flags })

if(flags.pretty || flags.p){
  console.log(output);
} else {
  console.log(JSON.stringify(output));
}
`)
            }
        },
        report,
    ];

    return await process(funcs, input, {});
};
