import type { CliInput, Input, PipeConfig} from "../pipedown.d.ts";

import projectMetadata from "./../deno.json" with { type: "json" };

import { getGlobalPipedownDir, getProjectBuildDir, getProjectName } from "./helpers.ts";

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

async function pdInit(input: CliInput) {
    // Read global config file first to get project name
    const configPath = std.join(Deno.cwd(), "config.json");
    input.globalConfig = input.globalConfig || {};
    try {
        const config = JSON.parse(await Deno.readTextFile(configPath));
        Object.assign(input.globalConfig, config);
    } catch (e) {
        if (!(e instanceof Deno.errors.NotFound)) throw e;
    }

    // Create global pipedown directory and project-specific build directory
    const globalDir = getGlobalPipedownDir();
    const projectName = getProjectName(input.globalConfig);
    const buildDir = getProjectBuildDir(projectName);
    
    try {
        await Deno.mkdir(buildDir, { recursive: true });
        console.log(
            std.colors.brightCyan("First time here? Welcome to Pipe ↓!"),
        );
        console.log(std.colors.brightGreen(`Creating ${buildDir}`));
    } catch (e) {
        if (!(e instanceof Deno.errors.AlreadyExists)) throw e;
    }
}

async function registerProject(input: CliInput) {
    const projectName = getProjectName(input.globalConfig);
    const project = {
        name: projectName,
        path: Deno.cwd(),
        buildDir: getProjectBuildDir(projectName),
    };

    const globalDir = getGlobalPipedownDir();
    const projectsPath = std.join(globalDir, "projects.json");
    let projects: Array<typeof project> = [];
    try {
        const content = await Deno.readTextFile(projectsPath);
        projects = JSON.parse(content);
    } catch (_e) {
        // probably the first project
    }
    
    // Update or add project entry
    const existingIndex = projects.findIndex(p => p.path === project.path);
    if (existingIndex >= 0) {
        projects[existingIndex] = project;
    } else {
        projects.push(project);
    }
    
    await Deno.writeTextFile(
        projectsPath,
        JSON.stringify(projects, null, 2),
        { create: true },
    );
}

export function checkFlags(
    flags: string[],
    func: (input: CliInput) => Promise<CliInput> | CliInput,
): (input: CliInput) => Promise<CliInput> | CliInput {
    return (input: CliInput) => {
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