/**
 * Pipedown CLI — transforms markdown files into executable TypeScript pipelines.
 *
 * Install and use via Deno:
 *
 * @example Install and run the CLI
 * ```sh
 * deno install -Arfg -n pd jsr:@pd/pdcli
 * pd build          # compile .md pipes into .ts scripts
 * pd run pipe.md    # build and execute a pipe
 * pd test           # run pipe tests
 * pd serve pipe.md  # serve a pipe over HTTP
 * ```
 *
 * @example Use checkMinFlags to guard a CLI command handler
 * ```ts
 * import { checkMinFlags } from "@pd/pdcli";
 *
 * const myCommand = checkMinFlags(
 *   ["greet", "*"],
 *   async (input) => {
 *     console.log(`Hello, ${input.flags._[1]}`);
 *     return input;
 *   },
 * );
 * ```
 *
 * @module
 */

import type { CliInput, Input, PipeConfig } from "../pipedown.d.ts";

import projectMetadata from "./../deno.json" with { type: "json" };

import { PD_DIR } from "./helpers.ts";

import { pd, std } from "../deps.ts";
import { readPipedownConfig, writePipedownConfig } from "../pdConfig.ts";

const { process } = pd;
const version = projectMetadata.version;

import { helpCommand } from "./helpCommand.ts";
import { buildCommand } from "./buildCommand.ts";
import { runCommand } from "./runCommand.ts";
import { interactiveCommand } from "./interactiveCommand.ts";
import { runWithCommand } from "./runWithCommand.ts";
import { serveCommand } from "./serveCommand.ts";
import { listCommand } from "./listCommand.ts";
import { testCommand, updateTestCommand } from "./testCommand.ts";
import { cleanCommand } from "./cleanCommand.ts";
import { defaultCommand } from "./defaultCommand.ts";
import { helpText } from "../stringTemplates.ts";
import { llmCommand } from "./llmCommand.ts";
import { replCommand } from "./replCommand.ts";
import { inspectCommand } from "./inspectCommand.ts";
import { runStepCommand } from "./runStepCommand.ts";
import { syncCommand } from "./syncCommand.ts";
import { watchCommand } from "./watchCommand.ts";
import { packCommand } from "./packCommand.ts";
import { installCommand } from "./installCommand.ts";
import { extractCommand } from "./extractCommand.ts";
import { lintCommand } from "./lintCommand.ts";

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

  // read project config from deno.json "pipedown" property (primary)
  // or config.json (fallback), if either exists
  input.globalConfig = input.globalConfig || {};
  const config = await readPipedownConfig(Deno.cwd());
  Object.assign(input.globalConfig, config);
}

const DEFAULT_TEMPLATE_FILES = [
  "cli.ts",
  "server.ts",
  "devServer.ts",
  "worker.ts",
  "test.ts",
  "trace.ts",
];

async function scaffoldTemplates(input: CliInput) {
  const templatesDir = std.join(Deno.cwd(), "templates");

  // Only scaffold if templates/ directory doesn't exist yet
  if (await std.exists(templatesDir)) return input;

  await Deno.mkdir(templatesDir, { recursive: true });
  console.log(
    std.colors.brightGreen("Scaffolding default templates to templates/"),
  );

  // Copy default template files from pipedown source
  const sourceTemplateDir = new URL("../templates/", import.meta.url);
  for (const file of DEFAULT_TEMPLATE_FILES) {
    const sourceUrl = new URL(file, sourceTemplateDir);
    const content = await Deno.readTextFile(sourceUrl);
    await Deno.writeTextFile(std.join(templatesDir, file), content);
  }

  // Update config to include templates (prefers deno.json "pipedown", falls back to config.json)
  const templatePaths = DEFAULT_TEMPLATE_FILES.map((f) => `./templates/${f}`);
  const config = await readPipedownConfig(Deno.cwd());

  const existingTemplates = (config.templates as string[]) || [];
  const newTemplates = templatePaths.filter((t) =>
    !existingTemplates.includes(t)
  );
  config.templates = [...existingTemplates, ...newTemplates];

  await writePipedownConfig(Deno.cwd(), config);

  // Update globalConfig so the build picks up the templates
  Object.assign(input.globalConfig, config);

  return input;
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
      const projectsRaw = await Deno.readTextFile(projectsPath);
      projects = JSON.parse(projectsRaw);
    } catch (_e) {
      // probably the first project
    }

    const exists = projects.find((_project: typeof project) =>
      project.path === _project.path
    );

    if (exists) {
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

/**
 * Guard a CLI command handler so it only runs when positional arguments match.
 *
 * Each entry in `flags` is matched against the corresponding positional arg.
 * Use `"*"` as a wildcard that matches any value.
 *
 * @param flags - Pattern of positional args to match (e.g. `["build"]` or `["run", "*"]`).
 * @param func - The command handler to invoke when the pattern matches.
 * @returns A wrapped function that passes through unmatched input unchanged.
 */
export function checkMinFlags(
  flags: string[],
  func: (input: CliInput) => Promise<CliInput> | CliInput,
): (input: CliInput) => Promise<CliInput> | CliInput {
  return (input: CliInput) => {
    // ["none"] is a special case that matches when no positional arguments are provided
    if (input.flags._.length === 0 && flags[0] === "none") {
      return func(input);
    }

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
  scaffoldTemplates,
  registerProject,
  gatherProjectContext,
  checkMinFlags(["none"], defaultCommand),
  checkMinFlags(["help"], helpCommand),
  checkMinFlags(["list"], listCommand),
  checkMinFlags(["clean"], cleanCommand),
  checkMinFlags(["build"], buildCommand),
  checkMinFlags(["lint"], lintCommand),
  checkMinFlags(["serve", "*", "*"], serveCommand),
  checkMinFlags(["repl"], replCommand),
  checkMinFlags(["interactive", "*"], interactiveCommand),
  checkMinFlags(["i", "*"], interactiveCommand),
  checkMinFlags(["run", "*"], runCommand),
  checkMinFlags(["run-with", "*", "*", "*"], runWithCommand),
  checkMinFlags(["llm", "*", "*", "*"], llmCommand),
  checkMinFlags(["inspect", "*"], inspectCommand),
  checkMinFlags(["run-step", "*", "*"], runStepCommand),
  checkMinFlags(["sync", "*"], syncCommand),
  checkMinFlags(["watch"], watchCommand),
  checkMinFlags(["pack"], packCommand),
  checkMinFlags(["install"], installCommand),
  checkMinFlags(["extract", "*", "*", "*"], extractCommand),
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
    "trace",
    "record",
    "replay",
    "dry-run",
    "list",
    "build",
    "dev",
    "no-trace",
    "interactive",
    "i",
    "warnings-as-errors",
    "skip-lint",
  ],
  string: [
    "out",
    "step",
    "instruction",
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

if (output.debug) {
  console.log(output);
}
