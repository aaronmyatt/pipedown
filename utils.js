export const pipeDirName = 'data';
export const funcDirName = 'functions';
export const pipeFileName = (dirname, id) => `${Deno.cwd()}/${dirname}/pipes-${id}.json`;
export const writePipeDataToFile = (pipeData) => writeDataToFile(pipeFileName(pipeDirName, pipeData.id), pipeData);
export const funcFileName = (dirname, id) => `${Deno.cwd()}/${dirname}/functions-${id}.json`;
export const writeFuncDataToFile = (funcData) => writeDataToFile(funcFileName(funcDirName, funcData.id), funcData);

export function allPipes(){
    createDirIfItDoesntExist(pipeDirName);
    return readWholeJSONDir(pipeDirName);
}

export function allFuncs(){
    createDirIfItDoesntExist(funcDirName);
    return readWholeJSONDir(funcDirName);
}

export function onePipe(pipeid){
    return allPipes().find(p => p.id === Number(pipeid));
}

export function onePipeWithName(name){
    return allPipes().find(p => p.name === name);
}

export function oneFunc(funcid){
    return allFuncs().find(f => f.id === Number(funcid));
}

export function saveFunctionInput(funcid, input) {
    const func = oneFunc(funcid)
    func.inputs.push(input)
    writeFuncDataToFile(func)
}

export function saveFunctionOutput(funcid, output) {
    const func = oneFunc(funcid)
    func.outputs.push(output)
    writeFuncDataToFile(func)
}

export function readWholeJSONDir(dirname) {
    const files = Array.from(Deno.readDirSync(`${Deno.cwd()}/${dirname}`));
    const entries = [];
    for (const file of files) {
        const fileData = Deno.readTextFileSync(`${Deno.cwd()}/${dirname}/${file.name}`);
        entries.push(JSON.parse(fileData));
    }
    return entries;
}

export function createDirIfItDoesntExist(dirname) {
    try {
        Deno.statSync(`${Deno.cwd()}/${dirname}`)
    } catch (_) {
        Deno.mkdirSync(`${Deno.cwd()}/${dirname}`);
    }
}

export function writeDataToFile (fileName, data) {
    try {
        Deno.statSync(fileName)
    } catch (_) {
        Deno.writeTextFileSync(fileName, JSON.stringify(data));
    } finally {
        const fileData = Deno.readTextFileSync(fileName);
        if (fileData !== JSON.stringify(data)) {
            Deno.writeTextFileSync(fileName, JSON.stringify(data));
        }
    }
}

export function readRawJsonFile(fileName) {
    const fileData = Deno.readTextFileSync(fileName);
    return fileData;
}

export function getPipeFunctions(pipe) {
    return readWholeJSONDir('functions')
        .filter(f => pipe.functions.includes(f.id))
        .sort((a, b) => pipe.functions.indexOf(a.id) - pipe.functions.indexOf(b.id))
}
