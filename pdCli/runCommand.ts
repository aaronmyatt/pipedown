import type { CliInput } from "../pipedown.d.ts";
import { pdRun } from "./helpers.ts";
import { pd } from "../deps.ts";
import { pdBuild } from "../pdBuild.ts";
import { cliHelpTemplate } from "../stringTemplates.ts";

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
    pd run file.md --input '{"key": "value"}'`,
    `Options:
    -j, --json    Output the build information as JSON.
    -p, --pretty  Pretty print the JSON output.
    -h, --help    Display this message.
    -d, --debug   Display debug information.
    --input       Initial input for the pipedown file. Needs to be a JSON string.`,
  ],
});


export async function runCommand(input: CliInput) {
  if (pd.$p.get(input, "/flags/help") || pd.$p.get(input, "/flags/h")) {
    console.log(helpText);
  } else {
    const command = commandName.get(input);
    const testInput = inputRaw.get(input) || inputParam.get(input) || "{}";
    await pdBuild(input);
    await pdRun(command, testInput);
  }
  return input;
}
