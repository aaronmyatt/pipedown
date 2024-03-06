import {process} from "../pdPipe.ts";
import {
    PD_DIR,
    objectEmpty,
    colors,
    pdRun,
} from "./helpers.ts";
import {parse} from "https://deno.land/std@0.202.0/flags/mod.ts";
import {WalkEntry} from "https://deno.land/std@0.208.0/fs/mod.ts";
import {walk} from "https://deno.land/std@0.206.0/fs/mod.ts";
import {parse as parsePath, ParsedPath} from "https://deno.land/std@0.208.0/path/mod.ts";

import {helpCommand} from "./helpCommand.ts";
import {buildCommand} from "./buildCommand.ts";
import {runCommand} from "./runCommand.ts";
import {serveCommand} from "./serveCommand.ts";
import {listCommand} from "./listCommand.ts";
import {testCommand} from "./testCommand.ts";
import {cleanCommand} from "./cleanCommand.ts";
import {defaultCommand} from "./defaultCommand.ts";

async function pdInit(input: pdCliInput) {
    try {
        await Deno.mkdir(PD_DIR);
        console.log(colors.brightCyan("First time here? Welcome to Pipe ↓!"));
        console.log(colors.brightGreen("Creating ~/.pd"));
    } catch (e) {
        if (e.name !== "AlreadyExists") throw e;
    }

    // read global config file, config.json, from the current directory,
    // if it exists
    const configPath = `${Deno.cwd()}/config.json`;
    input.globalConfig = {
        on: {},
        ...input.globalConfig
    };
    try {
        const config = JSON.parse(await Deno.readTextFile(configPath));
        Object.assign(input, {globalConfig: config});
    } catch (e) {
        if (e.name !== "NotFound") throw e;
    }
}

export function checkFlags(flags: string[], func: (input: pdCliInput) => Promise<pdCliInput> | pdCliInput) {
    return (input: pdCliInput) => {
        if (input.flags._.length === 0 && flags[0] === "none") return func(input);

        const flagsMatch = input.flags._.length &&
            input.flags._.every((flag, index) => {
                return flags[index] === "*" || flags[index] === flag;
            });
        if (flagsMatch) {
            return func(input);
        }
        return input;
    };
}

const runAsCommand = async (input: pdCliInput) => {
    if (input.flags._.length > 0) {
        await runCommand(input);
    } else {
        console.error("Command not found: ", input.flags._[1]);
    }
    return input;
};

const gatherProjectContext = async (input: pdCliInput) => {
    input.projectPipes = [];
    const opts = {exts: [".md"], skip: [/node_modules/, /\.pd/]};
    for await (const entry of walk(".", opts)) {
        input.projectPipes.push({
            path: entry.path,
            entry,
            ...parsePath(entry.path)
        });
    }
    return input;
}

const startListeners = async (input: pdCliInput) => {
    input.globalConfig.on = input.globalConfig.on || {};
    console.log(input.globalConfig.on)
    for (const key in input.globalConfig.on) {
        const scripts = input.globalConfig.on[key];
        if (!Array.isArray(scripts)) {
            throw new Error(`Expected an array of scripts for the config key: on.${key}`);
        }

        addEventListener(key, async (e) => {
            console.log(`Running scripts for event: ${key}`);
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
    function dispatchProcessStartEvent(input: pdCliInput){
        const event = new CustomEvent('pdstart', {detail: input})
        dispatchEvent(event)
    },
    checkFlags(["none"], defaultCommand),
    checkFlags(["help"], helpCommand),
    checkFlags(["build"], buildCommand),
    checkFlags(["run", "*", "*"], runCommand),
    checkFlags(["serve", "*", "*"], serveCommand),
    checkFlags(["list"], listCommand),
    checkFlags(["test"], testCommand),
    checkFlags(["clean"], cleanCommand),
    checkFlags(["c", '*'], runAsCommand),
    checkFlags(["command", '*'], runAsCommand),
    function dispatchProcessEndEvent(input: pdCliInput){
        const event = new CustomEvent('pdend', {detail: input})
        dispatchEvent(event)
    }
];

const debugParamPresent = Deno.env.get("DEBUG") || Deno.args.includes("--debug") ||
    Deno.args.includes("-d") || Deno.args.includes("--DEBUG") ||
    Deno.args.includes("-D");

export type pdCliInput = {
    flags: typeof flags,
    globalConfig: PipeConfig,
    projectPipes: Array<{ path: string, entry: WalkEntry } & ParsedPath>,
    errors?: Array<PDError>,
    output: Input,
    debug: boolean | string,
    match?: string,
}

const flags = parse(Deno.args, {"--": true});
const output = await process<pdCliInput>(funcs, {
    flags,
    globalConfig: {},
    projectPipes: [],
    errors: [],
    output: {errors: []},
    debug: debugParamPresent,
}, {});

if (output.errors && output.errors.filter((err: PDError) => err).length > 0) {
    console.error(output);
    Deno.exit(1);
} else {
    if (output.debug) {
        console.log(output);
    } else {
        delete output.errors;
        delete output.output.errors;
        !objectEmpty(output.output) && console.log(output.output);
    }
    Deno.exit(0);
}

