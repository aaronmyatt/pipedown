export const pipeDirName = 'data';
export const funcDirName = 'functions';
export const pipeFileName = (dirname: string, id: string) => `${Deno.cwd()}/${dirname}/pipes-${id}.json`;
export const writePipeDataToFile = (pipeData: Record<string, unknown>) => writeDataToFile(pipeFileName(pipeDirName, pipeData.id), pipeData);
export const funcFileName = (dirname: string, id: string) => `${Deno.cwd()}/${dirname}/functions-${id}.json`;
export const writeFuncDataToFile = (funcData: Record<string, unknown>) => writeDataToFile(funcFileName(funcDirName, funcData.id), funcData);

export function readWholeJSONDir(dirname: string) {
    const files = Array.from(Deno.readDirSync(`${Deno.cwd()}/${dirname}`));
    const entries = [];
    for (const file of files) {
        const fileData = Deno.readTextFileSync(`${Deno.cwd()}/${dirname}/${file.name}`);
        entries.push(JSON.parse(fileData));
    }
    return entries;
}

export function createDirIfItDoesntExist(dirname: string) {
    try {
        Deno.statSync(`${Deno.cwd()}/${dirname}`)
    } catch (_) {
        Deno.mkdirSync(`${Deno.cwd()}/${dirname}`);
    }
}

export function writeDataToFile (fileName: string, data: Record<string, unknown>) {
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

export function readRawJsonFile(fileName: string) {
    const fileData = Deno.readTextFileSync(fileName);
    return fileData;
}
