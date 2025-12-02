import type { PDError } from "../pipedown.d.ts";
import { std } from "../deps.ts";

// Get the global pipedown directory (~/.pipedown)
export const getGlobalPipedownDir = () => {
    const home = Deno.env.get("HOME");
    if (!home) {
        throw new Error("HOME environment variable is not set");
    }
    return std.join(home, ".pipedown");
};

// Get project name from config or current directory
export const getProjectName = (globalConfig?: { name?: string }) => {
    return globalConfig?.name || std.parsePath(Deno.cwd()).name;
};

// Get project-specific build directory within global pipedown directory
export const getProjectBuildDir = (projectName?: string) => {
    const name = projectName || getProjectName();
    return std.join(getGlobalPipedownDir(), "builds", name);
};

// Legacy PD_DIR for backward compatibility - now points to global location
// Note: This is evaluated at module load time, so it uses the current directory name
export const PD_DIR = getProjectBuildDir();

// Get common args for deno commands, requires project name for correct path
export const getCommonArgs = (projectName?: string) => {
    const buildDir = getProjectBuildDir(projectName);
    return [
        "--unstable-kv",
        "-A",
        "-c",
        std.join(buildDir, "deno.json"),
    ];
};

// Legacy commonArgs - uses default project name
export const commonArgs = getCommonArgs();

export async function pdRun(scriptName: string, testInput: string, projectName?: string) {
    const buildDir = getProjectBuildDir(projectName);
    const pipeDir = std.join(buildDir, scriptName.replace(/\.md/, ""));
    const scriptPath = std.join(pipeDir, "cli.ts");

    const scriptArgs = Deno.args.slice(
        Deno.args.findIndex((arg) => arg === "--") + 1,
    );
    const command = new Deno.Command(Deno.execPath(), {
        args: [
            "run",
            ...getCommonArgs(projectName),
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
    projectName?: string,
) {
    const buildDir = getProjectBuildDir(projectName);
    const pipeDir = std.join(buildDir, scriptName.replace(/\.md/, ""));
    const scriptPath = std.join(pipeDir, `${wrapperName}.ts`);

    const scriptArgs = Deno.args.slice(
        Deno.args.findIndex((arg) => arg === "--") + 1,
    );
    const command = new Deno.Command(Deno.execPath(), {
        args: [
            "run",
            ...getCommonArgs(projectName),
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

export async function pdServe(scriptName: string, testInput: string, projectName?: string) {
    const buildDir = getProjectBuildDir(projectName);
    const pipeDir = std.join(buildDir, scriptName.replace(/\.md/, ""));
    const scriptPath = std.join(pipeDir, "server.ts");
    const command = new Deno.Command(Deno.execPath(), {
        args: [
            "run",
            ...getCommonArgs(projectName),
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

export async function pdRepl(projectName?: string) {
    const buildDir = getProjectBuildDir(projectName);
    const command = new Deno.Command(Deno.execPath(), {
        args: [
            "repl",
            ...getCommonArgs(projectName),
            `--eval-file=${std.join(buildDir, "replEval.ts")}`
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
