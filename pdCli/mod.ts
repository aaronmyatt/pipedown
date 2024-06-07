import type { PDError, Input, PipeConfig } from "../pipedown.d.ts";
import type { Args } from "jsr:@std/cli@0.224.0";
import type { WalkEntry } from "jsr:@std/fs@0.224.0/walk";
import type { ParsedPath } from "jsr:@std/path@0.224.0/parse";

import {
    PD_DIR,
    objectEmpty,
    pdRun,
} from "./helpers.ts";

import {std, pd} from "../deps.ts";

const {$p, process} = pd;

import {helpCommand} from "./helpCommand.ts";
import {buildCommand} from "./buildCommand.ts";
import {runCommand} from "./runCommand.ts";
import {listCommand} from "./listCommand.ts";
import {testCommand} from "./testCommand.ts";
import {cleanCommand} from "./cleanCommand.ts";
import {defaultCommand} from "./defaultCommand.ts";

async function pdInit(input: pdCliInput) {
    try {
        await Deno.mkdir(PD_DIR);
        console.log(std.colors.brightCyan("First time here? Welcome to Pipe ↓!"));
        console.log(std.colors.brightGreen("Creating ~/.pd"));
    } catch (e) {
        if (e.name !== "AlreadyExists") throw e;
    }

    // read global config file, config.json, from the current directory,
    // if it exists
    const configPath = std.join(Deno.cwd(), 'config.json');
    input.globalConfig = {
        on: {},
        emit: true,
        persist: true,
        ...input.globalConfig
    };
    try {
        const config = JSON.parse(await Deno.readTextFile(configPath));
        Object.assign(input.globalConfig, config);
    } catch (e) {
        if (e.name !== "NotFound") throw e;
    }
}

export function checkFlags(flags: string[], func: (input: pdCliInput) => Promise<pdCliInput> | pdCliInput): (input: pdCliInput) => Promise<pdCliInput> | pdCliInput {
    return (input: pdCliInput) => {
        if (input.flags._.length === 0 && flags[0] === "none") return func(input);

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
    const opts = {exts: [".md"], skip: [/node_modules/, /\.pd/]};
    for await (const entry of std.walk(".", opts)) {
        input.projectPipes.push({
            path: entry.path,
            entry,
            ...std.parsePath(entry.path)
        });
    }
    return input;
}

const startListeners = (input: pdCliInput) => {
    input.globalConfig.on = input.globalConfig.on || {};
    for (const key in input.globalConfig.on) {
        const scripts = input.globalConfig.on[key];
        if (!Array.isArray(scripts)) {
            throw new Error(`Expected an array of scripts for the config key: on.${key}`);
        }

        addEventListener(key, async (_e) => {
            //console.log(`Running scripts for event: ${key}`);
            await Promise.all(scripts.map(async (script: (string | {[p: string]: Input})) => {
                console.log(`Running script: ${script}`);
                if(typeof script === "string") {
                    await pdRun(script, "{}");
                }
                else {
                    for (const key in script) {
                        await pdRun(key, JSON.stringify(script[key]));
                    }
                }
            }));
        });
    }
}

const funcs = [
    pdInit,
    gatherProjectContext,
    startListeners,
    checkFlags(["none"], defaultCommand),

    checkFlags(["help"], helpCommand),
    checkFlags(["list"], listCommand),
    checkFlags(["clean"], cleanCommand),

    checkFlags(["build"], buildCommand),
    checkFlags(["run", "*", "*"], runCommand),
    checkFlags(["test"], testCommand),
    checkFlags(["version"], async (input: pdCliInput) => {
        const response = await (await fetch("https://jsr.io/@pd/pdcli/meta.json")).json();
        console.log($p.get(response, '/latest'));
        return input;
    })
];

const debugParamPresent = Deno.env.get("DEBUG") || Deno.args.includes("--debug") ||
    Deno.args.includes("-d") || Deno.args.includes("--DEBUG") ||
    Deno.args.includes("-D");
export interface pdCliInput extends Input {
    flags: Args,
    globalConfig: PipeConfig,
    projectPipes: Array<{ path: string, entry: WalkEntry } & ParsedPath>,
    errors?: Array<PDError>,
    output: Input,
    debug: boolean | string,
    match?: string,
};

// @ts-ignore - this is a Deno specific API
const flags: Args = std.parseArgs(Deno.args, {"--": true, boolean: ["json", "pretty", "j", "p", "debug", "d", "DEBUG", "D"]});
const output = await process<pdCliInput>(funcs, {
    flags,
    globalConfig: {} as PipeConfig,
    projectPipes: [],
    errors: [],
    output: {errors: []} as Input,
    debug: debugParamPresent,
}, {});

if (output.errors && output.errors.length > 0) {
    output.errors.forEach((error: PDError) => {
        console.log(error.name)
        console.log('function: ', error.func)
        console.log(error.message)
        console.log(error.stack)
        console.log('---')
    })
    Deno.exit(1);
} else {
    if (output.debug) {
        console.log(output);
    } else if(flags.json || flags.j) {
        console.log(JSON.stringify(output.output, null, 2));
    } else if (flags.pretty || flags.p) {
        console.log(output.output);
    }
    Deno.exit(0);
}

