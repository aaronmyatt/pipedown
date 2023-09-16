import {getPipeFunctions, pipeScriptName} from "./utils.ts";
import * as esbuild from "https://deno.land/x/esbuild@v0.18.17/mod.js";

export async function generateServerScript(pipe, buildConfig = {}) {
    buildConfig = Object.assign({
        bundle: true,
        format: 'esm',
        write: false,
        treeShaking: true,
    }, buildConfig);
    const result = await generateScript(pipe, buildConfig)
    const scriptName = pipeScriptName(pipe)
    await Deno.writeTextFile(scriptName, result)
    return result;
}

export async function generateClientPipeScript(pipe, buildConfig = {}) {
    buildConfig = Object.assign({format: 'iife', platform: 'browser', globalName: 'pipe' + pipe.id}, buildConfig);
    const result = await generateScript(pipe, buildConfig)
    const scriptName = pipeScriptName(pipe)
    await Deno.writeTextFile(scriptName, result)
    return result;
}

const PIPE_TEMPLATE = (pipe, funcSequence) => `import {pipeProcessor} from './pipeProcessor.js';
const funcSequence = ${JSON.stringify(funcSequence)}
const _pipe = ${JSON.stringify(pipe)}
export const pipe = pipeProcessor.bind({_pipe: _pipe, defaultInput: _pipe.defaultInput || {}}, funcSequence)
`

async function generateScript(pipe: Record<string, unknown>, buildConfig = {}) {
    const funcSequence = await getPipeFunctions(pipe)
    const config = Object.assign({
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
