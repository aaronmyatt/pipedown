import {process} from "../pdPipe.ts";
import {
    PD_DIR,
    objectEmpty,
    colors
} from "./helpers.ts";
import {parse} from "https://deno.land/std@0.202.0/flags/mod.ts";
import {WalkEntry} from "https://deno.land/std@0.208.0/fs/mod.ts";
import {parse as keycodeParse} from "https://deno.land/x/cliffy@v1.0.0-rc.3/keycode/mod.ts";
import {firstNotNullishOf} from "https://deno.land/std@0.208.0/collections/mod.ts";
import {walk} from "https://deno.land/std@0.206.0/fs/mod.ts";
import {parse as parsePath, ParsedPath} from "https://deno.land/std@0.208.0/path/mod.ts";

import {helpCommand} from "./helpCommand.ts";
import {buildCommand} from "./buildCommand.ts";
import {runCommand} from "./runCommand.ts";
import {listCommand} from "./listCommand.ts";
import {testCommand} from "./testCommand.ts";
import {cleanCommand} from "./cleanCommand.ts";
import {defaultCommand} from "./defaultCommand.ts";

(async () => {

    addEventListener("keypress", async (e) => {
        const detail = (e as CustomEvent).detail;
        if (detail.name === "c" && detail.ctrl) {
            Deno.exit();
        }
        console.log(detail);

        if (detail.name === "e") {
            console.log('Exporting')
        }
    });

    Deno.stdin.setRaw(true)
    // Deno.stdin.setRaw(true, {cbreak: true})
    for await (const stdin of Deno.stdin.readable) {
        const keycode = firstNotNullishOf(keycodeParse(stdin), (k => k))
        if (keycode) {
            dispatchEvent(new CustomEvent('keypress', {detail: {keycode}}))
        }
    }
})()

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
    input.globalConfig = {};
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

const funcs = [
    pdInit,
    async (input: pdCliInput) => {
        input.projectPipes = [];
        const opts = {exts: [".md"], skip: [/node_modules/, /\.pd/]};
        for await (const entry of walk(".", opts)) {
            input.projectPipes.push({
                path: entry.path,
                entry,
                ...parsePath(entry.path)
            });
        }
    },
    checkFlags(["none"], defaultCommand),
    checkFlags(["help"], helpCommand),
    checkFlags(["build"], buildCommand),
    checkFlags(["run", "*", "*"], runCommand),
    checkFlags(["list"], listCommand),
    checkFlags(["test"], testCommand),
    checkFlags(["clean"], cleanCommand),
    async (input: pdCliInput) => {
        if (input.flags._.length > 0) {
            const found = input.projectPipes.find(pipe => {
                return pipe.path === input.flags._[0] || pipe.name === input.flags._[0];
            });
            if (found) {
                input.flags._ = [0, ...input.flags._]
                await runCommand(input);
            }
        }
        // input.errors.push(`Command not found: ${input.flags._[0]}`);
    },
];

const debugParamPresent = Deno.env.get("DEBUG") || Deno.args.includes("--debug") ||
    Deno.args.includes("-d") || Deno.args.includes("--DEBUG") ||
    Deno.args.includes("-D");

export type pdCliInput = {
    flags: typeof flags,
    globalConfig: {
        on?: {
            filechange: string[],
            before: string[],
            after: string[],
        }
        commands?: {
            [key: string]: string
        }
    },
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

