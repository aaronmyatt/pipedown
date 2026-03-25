import type { CliInput, Input, PipeConfig} from "../pipedown.d.ts";

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
import { llmCommand } from "./llmCommand.ts";
import { inspectCommand } from "./inspectCommand.ts";
import { runStepCommand } from "./runStepCommand.ts";

async function pdInit(input: CliInput) {
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

async function registerProject(input: CliInput) {
    const project = {
        name: input.globalConfig.name || std.parsePath(Deno.cwd()).name,
        path: Deno.cwd(),
    };

    const home = Deno.env.get("HOME");
    if (home) {
        const pipedownGlobalDir = std.join(home, ".pipedown");
        try {
            await Deno.mkdir(pipedownGlobalDir, { recursive: true });
        } catch (e) {
            if (!(e instanceof Deno.errors.AlreadyExists)) throw e;
        }

        const projectsPath = std.join(pipedownGlobalDir, "projects.json");
        let projects = [];
        try {
            const projectsRaw = await Deno.readTextFile(projectsPath)
            projects = JSON.parse(projectsRaw);
        } catch (_e) {
            // probably the first project
        }

        const exists = projects.find((_project: typeof project) => project.path === _project.path)

        if(exists){
            // do nothing
        } else {
            projects.push(project);
            await Deno.writeTextFile(
                projectsPath,
                JSON.stringify(projects, null, 2),
                { create: true },
            );
        }
    }
}

export function checkMinFlags(
    flags: string[],
    func: (input: CliInput) => Promise<CliInput> | CliInput,
): (input: CliInput) => Promise<CliInput> | CliInput {
    return (input: CliInput) => {
        // Check if we have at least the required number of arguments
        if (input.flags._.length < flags.length) {
            return input;
        }       

        const flagsMatch = flags.every((flag, index) => {
            return flag === "*" || flag === input.flags._[index];
        });

        if (flagsMatch) return func(input);
        return input;
    };
}

const gatherProjectContext = async (input: CliInput) => {
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

const versionCommand = (input: CliInput) => {
    console.log(version);
    return input;
};

const funcs = [
    pdInit,
    registerProject,
    gatherProjectContext,
    checkMinFlags(["none"], defaultCommand),
    checkMinFlags(["help"], helpCommand),
    checkMinFlags(["list"], listCommand),
    checkMinFlags(["clean"], cleanCommand),
    checkMinFlags(["build"], buildCommand),
    checkMinFlags(["serve", "*", "*"], serveCommand),
    checkMinFlags(["repl"], replCommand),
    checkMinFlags(["run", "*", "*"], runCommand),
    checkMinFlags(["runWith", "*", "*", "*"], runWithCommand),
    checkMinFlags(["llm", "*", "*", "*"], llmCommand),
    checkMinFlags(["inspect", "*"], inspectCommand),
    checkMinFlags(["run-step", "*", "*"], runStepCommand),
    checkMinFlags(["test"], testCommand),
    checkMinFlags(["test-update"], updateTestCommand),
    checkMinFlags(["t"], testCommand),
    checkMinFlags(["tu"], updateTestCommand),
    checkMinFlags(["version"], versionCommand),
];

const debugParamPresent = Deno.env.get("DEBUG") ||
    Deno.args.includes("--debug") ||
    Deno.args.includes("-d") || Deno.args.includes("--DEBUG") ||
    Deno.args.includes("-D");

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

const output = await process<CliInput>(funcs, {
    flags,
    globalConfig: {} as PipeConfig,
    projectPipes: [],
    errors: [],
    output: { errors: [] } as Input,
    debug: debugParamPresent,
}, {});

if(output.debug){
    console.log(output);
}
