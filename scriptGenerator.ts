import {getPipeFunctions, pipeScriptName, pipeClientScriptName} from "./utils.ts";
import * as esbuild from "https://deno.land/x/esbuild@v0.18.17/mod.js";
import { httpImports } from "https://deno.land/x/esbuild_plugin_http_imports/index.ts";

export async function generateServerScript(pipe, buildConfig = {}) {
    buildConfig = Object.assign({
        bundle: true,
        format: 'esm',
        write: false,
        treeShaking: true,
        plugins: [],
    }, buildConfig);
    const result = await generatePipeScript(pipe, buildConfig)
    const scriptName = pipeScriptName(pipe)
    await Deno.writeTextFile(scriptName, result)
    return result;
}

export async function generateClientScript(pipe, buildConfig = {}) {
    buildConfig = Object.assign({
        format: 'iife', 
        platform: 'browser', 
        globalName: 'pipe' + pipe.id, 
        plugins: [httpImports()]
    }, buildConfig);
    const result = await generatePipeScript(pipe, buildConfig)
    const scriptName = pipeClientScriptName(pipe)
    await Deno.writeTextFile(scriptName, result)
    return result;
}

const PIPE_TEMPLATE = (pipe, funcSequence) => `import {pipeProcessor} from './pipeProcessor.js';

${funcSequence.map(func => `import {func${func.id}} from './out/scripts/func-${func.id}.js'`).join('\n')}

globalThis.html = someHtml => someHtml;
globalThis.css = someCss => someCss;
globalThis._pipe = ${JSON.stringify(pipe)}
globalThis.pipedeps = {};
const funcSequence = ${JSON.stringify(funcSequence)}
const funcs =[${funcSequence.map(func => `func${func.id}`).join(', ')}]

export const pipe = pipeProcessor.bind({defaultInput: _pipe.defaultInput || {}}, funcSequence.map((func, index) => {
    func.exec = funcs[index]
    return func
}))
`

async function generatePipeScript(pipe: Record<string, unknown>, buildConfig = {}) {
    const funcSequence = await getPipeFunctions(pipe)
    // generate func script for each func in the sequence
    await Promise.all(funcSequence.map(async (func) => {
        return await generateFuncScript(func)
    }))


    const config = Object.assign({}, {
        bundle: true,
        stdin: {
            contents: PIPE_TEMPLATE(pipe, funcSequence),
            resolveDir: '.'
        },
        format: 'esm',
        write: false,
        treeShaking: true,
    }, buildConfig)
    const pipeBuild = await esbuild.build(config)
    return pipeBuild.outputFiles[0].text
}

const FUNC_TEMPLATE = (func) => `${[...func.code.matchAll(/^import.*/g, '')].join('\n')}
export default async function func${func.id}(input={}) {
${func.code.replaceAll(/^import.*/g, '')}
}
export {func${func.id}}`

export async function generateFuncScript(func:Record<string, unknown>, buildConfig = {}) {
    const config = Object.assign({
        // bundle: true,
        stdin: {
            contents: FUNC_TEMPLATE(func),
            resolveDir: '.'
        },
        format: 'esm',
        treeShaking: true,
        // minify: true,
        outfile: `./out/scripts/func-${func.id}.js`,
        // banner: {js: `export const func${func.id} = (async function(){`},
        // footer: {js: `})();`},
    }, buildConfig)

    const pipeBuild = await esbuild.build(config)
    // return pipeBuild.outputFiles[0].text
}