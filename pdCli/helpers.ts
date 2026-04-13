import type { PDError } from "../pipedown.d.ts";

export const commonArgs = ["--unstable-kv", "-A", "-c", ".pd/deno.json"];

export const PD_DIR = `./.pd`;

interface PdRunOptions {
  subcommand?: string;
  scriptName: string;
  testInput: string;
  entryPoint?: string;
  watch?: boolean;
  rawInput?: boolean;
  includeScriptArgs?: boolean;
  extraArgs?: string[];
}

export async function pdRun(options: PdRunOptions) {
  const {
    subcommand = "run",
    scriptName,
    testInput,
    entryPoint = "cli.ts",
    watch = false,
    rawInput = false,
    includeScriptArgs = true,
    extraArgs = [],
  } = options;

  const args: string[] = [subcommand, ...commonArgs];

  if (watch) args.push("--watch");
  args.push(...extraArgs);

  const pipeDir = `${PD_DIR}/${scriptName.replace(/\.md/, "")}`;
  args.push(`${pipeDir}/${entryPoint}`);

  if (rawInput) {
    args.push(testInput || "{}");
  } else {
    args.push("--input", testInput || "{}");
  }

  if (includeScriptArgs) {
    const scriptArgs = Deno.args.slice(
      Deno.args.findIndex((arg) => arg === "--") + 1,
    );
    args.push(...scriptArgs);
  }

  const command = new Deno.Command(Deno.execPath(), {
    args,
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
  });
  await command.output();
}

export function pdRunWith(
  wrapperName: string,
  scriptName: string,
  testInput: string,
) {
  return pdRun({ scriptName, testInput, entryPoint: `${wrapperName}.ts` });
}

/**
 * Launch a pipe as an HTTP server.
 *
 * @param scriptName - The pipe name (markdown filename without .md)
 * @param testInput - JSON string to pass as initial input
 * @param entryPoint - Template entry point: "server.ts" (production, default)
 *                     or "devServer.ts" (development with hot reload + tracing).
 *                     In dev mode the devServer handles its own file watching,
 *                     so Deno's --watch is only used for the production template.
 * Ref: templates/server.ts, templates/devServer.ts
 */
export function pdServe(
  scriptName: string,
  testInput: string,
  entryPoint = "server.ts",
) {
  // The devServer.ts template manages its own file watching and rebuilding
  // via Deno.watchFs, so we only enable Deno's --watch for the production
  // server template (which needs it to restart on .pd/ file changes).
  const useWatch = entryPoint === "server.ts";

  return pdRun({
    scriptName,
    testInput,
    entryPoint,
    watch: useWatch,
    rawInput: true,
    includeScriptArgs: false,
  });
}

export async function pdRepl() {
  const command = new Deno.Command(Deno.execPath(), {
    args: ["repl", ...commonArgs, "--eval-file=./.pd/replEval.ts"],
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
