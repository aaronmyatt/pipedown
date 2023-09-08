import { DEFAULT_FUNCTION, DEFAULT_PIPE } from "./default_schemas.js";
export const pipeDirName = 'data';
export const funcDirName = 'functions';
export const inputsDirName = 'inputs';
export const outputsDirName = 'outputs';
export const pipeFileName = (dirname: string, id: string) => `${Deno.cwd()}/${dirname}/pipes-${id}.json`;
export const funcFileName = (dirname: string, id: string) => `${Deno.cwd()}/${dirname}/functions-${id}.json`;
export const pipeScriptName = (pipe) => pipeFileName('out/scripts', pipe.id) + '.js'
export const writePipeDataToFile = (pipeData: Record<string, unknown>) => writeDataToFile(pipeFileName(pipeDirName, pipeData.id), pipeData);
export const writeFuncDataToFile = (funcData: Record<string, unknown>) => writeDataToFile(funcFileName(funcDirName, funcData.id), funcData);
export const writeFuncInputsDataToFile = (func: Record<string, unknown>, inputs: Record<string, unknown>) => writeLineToFile(funcFileName(inputsDirName, func.id), inputs);
export const writeFuncOutputsDataToFile = (func: Record<string, unknown>, outputs: Record<string, unknown>) => writeLineToFile(funcFileName(outputsDirName, func.id), outputs);
export const writePipeInputsDataToFile = (pipe: Record<string, unknown>, inputs: Record<string, unknown>) => writeLineToFile(pipeFileName(inputsDirName, pipe.id), inputs);
export const writePipeOutputsDataToFile = (pipe: Record<string, unknown>, outputs: Record<string, unknown>) => writeLineToFile(pipeFileName(outputsDirName, pipe.id), outputs);

export async function allPipes(){
    await createDirIfItDoesntExist(pipeDirName);
    return await readWholeJSONDir(pipeDirName);
}

export async function allFuncs(){
    await createDirIfItDoesntExist(funcDirName);
    return await readWholeJSONDir(funcDirName);
}

export async function onePipe(pipeid){
    return await allPipes().then(pipes => pipes.find(p => p.id === Number(pipeid)));
}

export async function onePipeWithName(name: string){
    return await allPipes().then(pipes => pipes.find(p => p.name === name));
}

export async function oneFunc(funcid){
    return await allFuncs().then(funcs => funcs.find(f => f.id === Number(funcid)));
}

export async function saveFunctionInput(funcid, input) {
    const func = await oneFunc(funcid);
    writeFuncInputsDataToFile(func, input);
}

export async function saveFunctionOutput(funcid, output) {
    const func = await oneFunc(funcid);
    writeFuncOutputsDataToFile(func, output);
}

export async function savePipeInput(pipeid, input) {
    const pipe = await onePipe(pipeid);
    writePipeInputsDataToFile(pipe, input);
}

export async function savePipeOutput(pipeid, input) {
    const pipe = await onePipe(pipeid);
    writePipeOutputsDataToFile(pipe, input);
}

export async function readWholeJSONDir(dirname: string) {
    const entries = [];
    for await (const file of Deno.readDir(`${Deno.cwd()}/${dirname}`)){
        const fileData = await Deno.readTextFile(`${Deno.cwd()}/${dirname}/${file.name}`);
        entries.push(JSON.parse(fileData));
    }
    return entries;
}

export async function createDirIfItDoesntExist(dirname: string) {
    try {
        await Deno.stat(`${Deno.cwd()}/${dirname}`)
    } catch (_) {
        await Deno.mkdir(`${Deno.cwd()}/${dirname}`);
    }
}

export async function createFileIfItDoesntExist(filename: string) {
    try {
        await Deno.statSync(filename)
    } catch (_) {
        await Deno.writeTextFile(filename, '')
    }
}

export async function writeDataToFile (fileName: string, data: Record<string, unknown>) {
    await createFileIfItDoesntExist(fileName)
    Deno.writeTextFile(fileName, JSON.stringify(data));
    return data;
}

export async function writeLineToFile (fileName: string, data: Record<string, unknown>) {
    await createFileIfItDoesntExist(fileName);
    Deno.writeTextFile(fileName, JSON.stringify(data) + '\n', {append: true});
    return data;
}

// get last line of file
export async function readLastLine(fileName: string) {
    await createFileIfItDoesntExist(fileName);
    const fileData = Deno.readTextFileSync(fileName);
    const lines = fileData.split('\n');
    return lines.at(-2);
}

// read last function input
export async function readLastFunctionInput(funcid: string) {
    const fileName = funcFileName(inputsDirName, funcid);
    return await readLastLine(fileName);
}

// read last function output
export async function readLastFunctionOutput(funcid: string) {
    const fileName = funcFileName(outputsDirName, funcid);
    return await readLastLine(fileName);
}

// read last pipe input
export async function readLastPipeInput(pipeid: string) {
    const fileName = pipeFileName(inputsDirName, pipeid);
    return await readLastLine(fileName);
}

// read last pipe output
export async function readLastPipeOutput(pipeid: string) {
    const fileName = pipeFileName(outputsDirName, pipeid);
    return await readLastLine(fileName);
}

export async function readRawJsonFile(fileName: string) {
    await createFileIfItDoesntExist(fileName);
    return await Deno.readTextFile(fileName);
}

export async function getPipeFunctions(pipe) {
    return await readWholeJSONDir('functions').then(funcs => {
        return funcs
            .filter(f => pipe.functions.includes(f.id))
            .sort((a, b) => pipe.functions.indexOf(a.id) - pipe.functions.indexOf(b.id))
    })

}

export const gotwindow = typeof window !== 'undefined'
export const maybeworker = typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope
export const gotdeno = typeof Deno !== 'undefined'

export default {
    DEFAULT_PIPE,
    DEFAULT_FUNCTION,
    allPipes,
    allFuncs,
    onePipe,
    onePipeWithName,
    oneFunc,
    saveFunctionInput,
    saveFunctionOutput,
    readWholeJSONDir,
    createDirIfItDoesntExist,
    writeDataToFile,
    readRawJsonFile,
    getPipeFunctions,
    pipeFileName,
    writePipeDataToFile,
    funcFileName,
    writeFuncDataToFile,
    pipeDirName,
    funcDirName,
    gotwindow,
    maybeworker,
    gotdeno,
    pipeScriptName,
    savePipeInput,
    savePipeOutput,
    writePipeInputsDataToFile,
    writePipeOutputsDataToFile,
    readLastPipeInput,
    readLastFunctionInput,
    readLastFunctionOutput,
    readLastPipeOutput
}
