import type { Input, PDError, PipeConfig } from "../pipedown.d.ts";
import type { Args } from "jsr:@std/cli@1.0.6";
import type { WalkEntry } from "jsr:@std/fs@1.0.3/walk";
import type { ParsedPath } from "jsr:@std/path@1.0.4/parse";
import projectMetadata from "./../deno.json" with { type: "json" };

import { PD_DIR } from "./helpers.ts";

import { pd, std } from "../deps.ts";

const { process } = pd;
const version = projectMetadata.version;

import { helpCommand } from "./helpCommand.ts";
import { buildCommand } from "./buildCommand.ts";
import { runCommand } from "./runCommand.ts";
import { runWithCommand } from "./runWithCommand.ts";
import { serveCommand } from "./serveCommand.ts";
import { listCommand } from "./listCommand.ts";
import { testCommand, updateTestCommand } from "./testCommand.ts";
import { cleanCommand } from "./cleanCommand.ts";
import { defaultCommand } from "./defaultCommand.ts";
import { helpText } from "../stringTemplates.ts";
import {replCommand} from "./replCommand.ts";

async function pdInit(input: pdCliInput) {
    try {
        await Deno.mkdir(PD_DIR);
        console.log(
            std.colors.brightCyan("First time here? Welcome to Pipe ↓!"),
        );
        console.log(std.colors.brightGreen("Creating ~/.pd"));
    } catch (e) {
        if (!(e instanceof Deno.errors.AlreadyExists)) throw e;
    }

    // read global config file, config.json, from the current directory,
    // if it exists
    const configPath = std.join(Deno.cwd(), "config.json");
    input.globalConfig = input.globalConfig || {};
    try {
        const config = JSON.parse(await Deno.readTextFile(configPath));
        Object.assign(input.globalConfig, config);
    } catch (e) {
        if (!(e instanceof Deno.errors.NotFound)) throw e;
    }
}

async function registerProject(input: pdCliInput) {
    const project = {
        name: input.globalConfig.name || std.parsePath(Deno.cwd()).name,
        path: Deno.cwd(),
    };

    const home = Deno.env.get("HOME");
    if (home) {
        try {
            await Deno.mkdir(std.join(home, ".pipedown"), { recursive: true });
        } catch (e) {
            if (!(e instanceof Deno.errors.AlreadyExists)) throw e;
        }

        const projectsPath = std.join(home, ".pipedown", "projects.json");
        let projects = [];
        try {
            projects = JSON.parse(projectsPath);
        } catch (_e) {
            // probably the first project
        }
        projects.push(project);
        await Deno.writeTextFile(
            projectsPath,
            JSON.stringify(projects, null, 2),
            { create: true },
        );
    }
}

export function checkFlags(
    flags: string[],
    func: (input: pdCliInput) => Promise<pdCliInput> | pdCliInput,
): (input: pdCliInput) => Promise<pdCliInput> | pdCliInput {
    return (input: pdCliInput) => {
        if (input.flags._.length === 0 && flags[0] === "none") {
            return func(input);
        }

        const flagsMatch = input.flags._.length &&
            input.flags._.every((flag, index) => {
                return flags[index] === "*" || flags[index] === flag;
            });
        if (flagsMatch) return func(input);
        return input;
    };
}

const gatherProjectContext = async (input: pdCliInput) => {
    input.projectPipes = [];
    const opts = { exts: [".md"], skip: [/node_modules/, /\.pd/] };
    for await (const entry of std.walk(".", opts)) {
        input.projectPipes.push({
            path: entry.path,
            entry,
            ...std.parsePath(entry.path),
        });
    }
    return input;
};

const versionCommand = (input: pdCliInput) => {
    console.log(version);
    return input;
};

const funcs = [
    pdInit,
    registerProject,
    gatherProjectContext,
    checkFlags(["none"], defaultCommand),
    checkFlags(["help"], helpCommand),
    checkFlags(["list"], listCommand),
    checkFlags(["clean"], cleanCommand),
    checkFlags(["build"], buildCommand),
    checkFlags(["serve", "*", "*"], serveCommand),
    checkFlags(["repl"], replCommand),
    checkFlags(["run", "*", "*"], runCommand),
    checkFlags(["runWith", "*", "*", "*"], runWithCommand),
    checkFlags(["test"], testCommand),
    checkFlags(["test-update"], updateTestCommand),
    checkFlags(["t"], testCommand),
    checkFlags(["tu"], updateTestCommand),
    checkFlags(["version"], versionCommand),
];

const debugParamPresent = Deno.env.get("DEBUG") ||
    Deno.args.includes("--debug") ||
    Deno.args.includes("-d") || Deno.args.includes("--DEBUG") ||
    Deno.args.includes("-D");
export interface pdCliInput extends Input {
    flags: Args;
    globalConfig: PipeConfig;
    projectPipes: Array<{ path: string; entry: WalkEntry } & ParsedPath>;
    errors?: Array<PDError>;
    output: Input;
    debug: boolean | string;
    match?: string;
}

// @ts-ignore - this is a Deno specific API
const flags: Args = std.parseArgs(Deno.args, {
    "--": true,
    boolean: [
        "json",
        "pretty",
        "j",
        "p",
        "debug",
        "d",
        "DEBUG",
        "D",
        "version",
        "v",
        "help",
        "h",
    ],
});
if (flags.version || flags.v) {
    console.log(version);
    Deno.exit(0);
}

if (flags.help || flags.h) {
    console.log(helpText);
    Deno.exit(0);
}

const output = await process<pdCliInput>(funcs, {
    flags,
    globalConfig: {} as PipeConfig,
    projectPipes: [],
    errors: [],
    output: { errors: [] } as Input,
    debug: debugParamPresent,
}, {});

if (output.errors && output.errors.length > 0) {
    output.errors.forEach((error: PDError) => {
        console.log(error.name);
        console.log("function: ", error.func);
        console.log(error.message);
        console.log(error.stack);
        console.log("---");
    });
    Deno.exit(1);
} else {
    if (output.debug) {
        console.log(output);
    } else if (flags.json || flags.j) {
        console.log(JSON.stringify(output.output, null, 2));
    } else if (flags.pretty || flags.p) {
        console.log(output.output);
    }
    Deno.exit(0);
}
