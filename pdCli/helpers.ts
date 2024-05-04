import type {Input, PDError} from "../pipedown.d.ts";
import {pdBuild} from "../pdBuild.ts";
import {std} from "../deps.ts";

export const PD_DIR = `./.pd`;

export const lazyBuild = std.debounce(pdBuild, 100);
export const lazyRun = std.debounce(async (fileName) => {
    console.log(std.colors.brightGreen(`Running... ${fileName}`));
    await pdRun(std.basename(fileName, ".md"), "{}");
}, 100);
export const lazyLint = std.debounce(async () => {
    const lint = new Deno.Command(Deno.execPath(), {
        args: ["lint", PD_DIR, "-q"],
    });
    await lint.output();
}, 100);
export const lazyFmt = std.debounce(async () => {
    const fmt = new Deno.Command(Deno.execPath(), {
        args: ["fmt", PD_DIR, "-q"],
    });
    await fmt.output();
}, 100);
export const lazyTest = std.debounce(async () => {
    const test = new Deno.Command(Deno.execPath(), {
        args: ["test", "-A", `--config=${PD_DIR}/deno.json`, "--no-check"],
        stdout: "inherit",
        stderr: "inherit",
    });
    await test.output();
}, 100);

export function pdRun(scriptName: string, testInput: string) {
    const pipeDir = `${PD_DIR}/${scriptName.replace(/\.md/, '')}`;
    const scriptPath = `${pipeDir}/cli.ts`;
    console.log(std.colors.brightGreen(`Running... ${scriptName}`));
    const command = new Deno.Command('deno', {
        args: [
            "run",
            "-A",
            "-c",
            ".pd/deno.json",
            scriptPath,
            testInput || "{}",
        ],
        stdout: "inherit",
        stderr: "inherit",
    });
    command.outputSync();
}

export async function pdServe(scriptName: string, testInput: string) {
    const pipeDir = `${PD_DIR}/${scriptName.replace(/\.md/, '')}`;
    const scriptPath = `${pipeDir}/server.ts`;
    const command = new Deno.Command(Deno.execPath(), {
        args: [
            "run",
            "-A",
            "-c",
            ".pd/deno.json",
            "--unstable",
            "--watch",
            scriptPath,
            testInput || "{}",
        ],
        stdout: "inherit",
        stderr: "inherit",
    });
    const process =  command.spawn();
    await process.output();
}

interface ErrorObject {
    errors: Array<PDError>
}
export function mergeErrors(input: ErrorObject, output: ErrorObject) {
    if (output.errors) {
        input.errors = input.errors || [];
        input.errors = input.errors.concat(output.errors);
    }
    return input;
}

export const objectEmpty = (obj: object) => {
    return Object.keys(obj).length === 0
}
