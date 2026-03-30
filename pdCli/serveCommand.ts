import type { CliInput } from "../pipedown.d.ts";
import { pdServe } from "./helpers.ts";
import { pd } from "../deps.ts";
import { pdBuild } from "../pdBuild.ts";
import { cliHelpTemplate } from "../stringTemplates.ts";

const commandName = pd.$p.compile("/flags/_/1");
const inputRaw = pd.$p.compile("/flags/_/2");
const inputParam = pd.$p.compile("/flags/input");

const helpText = cliHelpTemplate({
  title: "Serve",
  command: "pd serve [options] [file]",
  sections: [
    "Run a pipe as a server.",
    `Example:
    pd serve file.md
    pd serve file.md --dev`,
    `Options:
    --dev         Run in development mode with hot reload, verbose logging, and trace writing.
    --no-trace    Disable trace writing in dev mode.
    -j, --json    Output the build information as JSON.
    -p, --pretty  Pretty print the JSON output.
    -h, --help    Display this message.
    -d, --debug   Display debug information.
    --input       Initial input for the pipedown file. Needs to be a JSON string.`,
  ],
});

/**
 * pd serve <file> [--dev]
 *
 * Without --dev: builds once, then spawns the production server.ts with
 * Deno's --watch flag (restarts on .pd/ file changes).
 *
 * With --dev: builds once, then spawns devServer.ts which watches .md files,
 * auto-rebuilds, hot-reloads the pipe module, pushes SSE reload events,
 * logs every request/response cycle, and writes traces to
 * $HOME/.pipedown/traces/.
 *
 * Ref: templates/server.ts (production), templates/devServer.ts (development)
 */
export async function serveCommand(input: CliInput) {
  if (pd.$p.get(input, "/flags/help") || pd.$p.get(input, "/flags/h")) {
    console.log(helpText);
  } else {
    const command = commandName.get(input);
    const testInput = inputRaw.get(input) || inputParam.get(input) || "{}";

    // Always build first so .pd/ is up to date.
    await pdBuild(input);

    const isDev = pd.$p.get(input, "/flags/dev");

    if (isDev) {
      // Dev mode: use devServer.ts which handles watching, rebuilding,
      // hot reload, SSE, verbose logging, and trace writing in-process.
      await pdServe(command, testInput, "devServer.ts");
    } else {
      // Production mode: use server.ts with Deno's --watch flag.
      await pdServe(command, testInput);
    }
  }
  return input;
}
