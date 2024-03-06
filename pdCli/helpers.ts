import {pdBuild} from "../pdBuild.ts";
import {basename} from "https://deno.land/std@0.208.0/path/mod.ts";
import {assert} from "https://deno.land/std@0.208.0/testing/asserts.ts";
import {debounce} from "https://deno.land/std@0.208.0/async/debounce.ts";
import * as colors from "https://deno.land/x/std@0.208.0/fmt/colors.ts";

export {colors};

const HOME = Deno.env.get("HOME");
export const PD_DIR = `./.pd`;

export const lazyBuild = debounce(pdBuild, 100);
const lazyRun = debounce(async (fileName) => {
    console.log(colors.brightGreen(`Running... ${fileName}`));
    await pdRun(basename(fileName, ".md"), "{}");
}, 100);
export const lazyLint = debounce(async () => {
    const lint = new Deno.Command(Deno.execPath(), {
        args: ["lint", PD_DIR, "-q"],
    });
    await lint.output();
}, 100);
export const lazyFmt = debounce(async () => {
    const fmt = new Deno.Command(Deno.execPath(), {
        args: ["fmt", PD_DIR, "-q"],
    });
    await fmt.output();
}, 100);
export const lazyTest = debounce(async () => {
    const test = new Deno.Command(Deno.execPath(), {
        args: ["test", "-A", `--config=${PD_DIR}/deno.json`, "--no-check"],
        stdout: "inherit",
        stderr: "inherit",
    });
    await test.output();
}, 100);

const stashProcess = (process: AsyncDisposable) => {
    globalThis.processes = globalThis.processes || []; // @ts-expect-error helper to close any running process
    globalThis.processes.push(process);
}

export async function pdRun(scriptName: string, testInput: string) {
    const pipeDir = `${PD_DIR}/${scriptName.replace(/\.md/, '')}`;
    const scriptPath = `${pipeDir}/cli.ts`;
    console.log(colors.brightGreen(`Running... ${scriptName}`));
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
    stashProcess(process);
    await process.output();
}

export function mergeErrors<I extends Input>(input: I, output: I) {
    if (output.errors) {
        input.errors = input.errors || [];
        input.errors = input.errors.concat(output.errors);
    }
    return input;
}

export const objectEmpty = (obj: object) => {
    return Object.keys(obj).length === 0
}
