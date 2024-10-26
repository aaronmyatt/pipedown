import { pd } from "../deps.ts";
import { pdBuild } from "../pdBuild.ts";
import { cliHelpTemplate } from "../stringTemplates.ts";
import type { CliInput } from "../pipedown.d.ts";

const helpText = cliHelpTemplate({
  title: "Build",
  command: "pd build",
  sections: [
    "The build command reads all markdown files in the current directory and generates corresponding executable files in the .pd directory.",
    `Options:
    -j, --json    Output the build information as JSON.
    -p, --pretty  Pretty print the JSON output.
    -d, --debug   Display debug information.
    -h, --help    Display this message.`,
  ],
});

export async function buildCommand(input: CliInput) {
  if (pd.$p.get(input, "/flags/help") || pd.$p.get(input, "/flags/h")) {
    console.log(helpText);
  } else {
    return Object.assign(input, await pdBuild(input));
  }
  return input;
}
