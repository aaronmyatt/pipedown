import type { PDError } from "../pipedown.d.ts";

export const commonArgs = [
    "--unstable-kv",
    "-A",
    "-c",
    ".pd/deno.json",
];

export const PD_DIR = `./.pd`;

export async function pdRun(scriptName: string, testInput: string) {
    const pipeDir = `${PD_DIR}/${scriptName.replace(/\.md/, "")}`;
    const scriptPath = `${pipeDir}/cli.ts`;

    const scriptArgs = Deno.args.slice(
        Deno.args.findIndex((arg) => arg === "--") + 1,
    );
    const command = new Deno.Command(Deno.execPath(), {
        args: [
            "run",
            ...commonArgs,
            scriptPath,
            "--input",
            testInput || "{}",
            ...scriptArgs,
        ],
        stdout: "inherit",
        stderr: "inherit",
        stdin: "inherit",
    });
    await command.output();
}

export async function pdRunWith(
    wrapperName: string,
    scriptName: string,
    testInput: string,
) {
    const pipeDir = `${PD_DIR}/${scriptName.replace(/\.md/, "")}`;
    const scriptPath = `${pipeDir}/${wrapperName}.ts`;

    const scriptArgs = Deno.args.slice(
        Deno.args.findIndex((arg) => arg === "--") + 1,
    );
    const command = new Deno.Command(Deno.execPath(), {
        args: [
            "run",
            ...commonArgs,
            scriptPath,
            "--input",
            testInput || "{}",
            ...scriptArgs,
        ],
        stdout: "inherit",
        stderr: "inherit",
        stdin: "inherit",
    });
    await command.output();
}

export async function pdServe(scriptName: string, testInput: string) {
    const pipeDir = `${PD_DIR}/${scriptName.replace(/\.md/, "")}`;
    const scriptPath = `${pipeDir}/server.ts`;
    const command = new Deno.Command(Deno.execPath(), {
        args: [
            "run",
            ...commonArgs,
            "--watch",
            scriptPath,
            testInput || "{}",
        ],
        stdout: "inherit",
        stderr: "inherit",
        stdin: "inherit",
    });
    const process = command.spawn();
    await process.output();
}

export async function pdRepl() {
    const command = new Deno.Command(Deno.execPath(), {
        args: [
            "repl",
            ...commonArgs,
            "--eval-file=./.pd/replEval.ts"
        ],
        stdout: "inherit",
        stderr: "inherit",
        stdin: "inherit",
    });
    const process = command.spawn();
    await process.output();
}

interface ErrorObject {
    errors: Array<PDError>;
}
export function mergeErrors(input: ErrorObject, output: ErrorObject) {
    if (output.errors) {
        input.errors = input.errors || [];
        input.errors = input.errors.concat(output.errors);
    }
    return input;
}

export const objectEmpty = (obj: object) => {
    return Object.keys(obj).length === 0;
};
