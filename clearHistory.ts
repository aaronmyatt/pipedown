import {
    readWholeJSONDir,
    writePipeDataToFile,
    writeFuncDataToFile,
    pipeDirName,
    funcDirName,
} from './utils.ts';


export function clearPipeInputsAndOuputs() {
    const dataFiles = readWholeJSONDir(pipeDirName)
        for (const pipe of dataFiles) {
            pipe.inputs = [];
            pipe.outputs = [];
            writePipeDataToFile(pipe)
        }
}
export function clearFunctionInputsAndOuputs() {
    const funcFiles = readWholeJSONDir(funcDirName)
    for (const func of funcFiles) {
        func.inputs = [];
        func.outputs = [];
        writeFuncDataToFile(func)
    }
}

clearFunctionInputsAndOuputs();
clearPipeInputsAndOuputs();
