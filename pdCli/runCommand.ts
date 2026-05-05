import type { CliInput } from "../pipedown.d.ts";
import { pdRun } from "./helpers.ts";
import { pd } from "../deps.ts";
import { pdBuild } from "../pdBuild.ts";
import { cliHelpTemplate } from "../stringTemplates.ts";
import { interactiveRun } from "./interactiveRun.ts";
import { reportParseDiagnostics } from "./lintCheck.ts";
// Sends IPC events to pd-desktop via Unix socket for native notifications.
// Fire-and-forget — silently no-ops when the desktop app isn't running.
// Ref: ./notifyTauri.ts for protocol details
import { notifyTauri } from "./notifyTauri.ts";

const commandName = pd.$p.compile("/flags/_/1");
const inputRaw = pd.$p.compile("/flags/_/2");
const inputParam = pd.$p.compile("/flags/input");

const helpText = cliHelpTemplate({
  title: "Run",
  command: "pd run [options] [file]",
  sections: [
    "Build and run a markdown file in the current directory.",
    `Example:
    pd run file.md
    pd run file.md --input '{"key": "value"}'
    pd run file.md -i`,
    `Options:
    -j, --json    Output the build information as JSON.
    -p, --pretty  Pretty print the JSON output.
    -h, --help    Display this message.
    -d, --debug   Display debug information.
    -i, --interactive  Enter interactive mode (workflow entry point).
    --no-trace    Disable tracing (enabled by default). Also configurable via deno.json { "pipedown": { "trace": false } } or config.json { "trace": false }.
    --skip-lint   Run even if pre-flight lint reports errors. Use with care.
    --input       Initial input for the pipedown file. Needs to be a JSON string.`,
  ],
});

export async function runCommand(input: CliInput) {
  if (pd.$p.get(input, "/flags/help") || pd.$p.get(input, "/flags/h")) {
    console.log(helpText);
    return input;
  }

  // `pd run <file.md> -i` now means interactive replay mode rather than a
  // legacy input alias. Keeping the branch here preserves the existing run
  // command surface while letting interactive mode share the same build path.
  if (pd.$p.get(input, "/flags/interactive") || pd.$p.get(input, "/flags/i")) {
    return await interactiveRun(input);
  }

  const scriptName = commandName.get(input);
  const testInput = inputRaw.get(input) || inputParam.get(input) || "{}";
  const noTraceFlag = pd.$p.get(input, "/flags/no-trace");
  const configTrace = input.globalConfig?.trace;
  const traceEnabled = !noTraceFlag && configTrace !== false;
  const entryPoint = traceEnabled ? "trace.ts" : "cli.ts";
  await pdBuild(input);

  // Block the run if `pdBuild` collected parse errors that affect the
  // requested pipe. All diagnostics are printed (so unrelated broken
  // pipes are still visible), but only errors in the requested file
  // gate the run — otherwise `pd run mypipe.md` would refuse to run
  // because some other pipe in the project is broken.
  // Warnings are printed but not fatal. `--skip-lint` is the explicit
  // override for partial-build debug or migration scenarios.
  // Ref: lintCheck.ts — reportParseDiagnostics()
  if (!pd.$p.get(input, "/flags/skip-lint")) {
    const { relevantErrorCount } = reportParseDiagnostics(input, {
      scopeToFile: scriptName,
    });
    if (relevantErrorCount > 0) Deno.exit(1);
  }

  // Notify pd-desktop that a pipe run is starting — fires a native
  // macOS notification so the user knows work has begun.
  // The CLI doesn't have a project name readily available (unlike the
  // server which resolves it from the request), so `project` is omitted.
  notifyTauri({
    type: "run_start",
    title: "Pipe Run Started",
    message: scriptName,
    pipe: scriptName,
    success: true,
  });

  await pdRun({ scriptName, testInput, entryPoint });

  // Notify pd-desktop that the pipe run finished. The dashboard server
  // path handles this via the spawnAndStream onComplete callback, but
  // the CLI path spawns directly via pdRun() so we notify here.
  notifyTauri({
    type: "run_complete",
    title: "Pipe Run Complete",
    message: scriptName,
    pipe: scriptName,
    success: true,
  });

  return input;
}
