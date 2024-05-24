import { pd, std } from "../deps.ts";
import { pdBuild } from "../pdBuild.ts";
import { cliHelpTemplate } from "../stringTemplates.ts";
import type { pdCliInput } from "./mod.ts";

const helpText = cliHelpTemplate({
  title: "Build",
  command: "pd build",
  sections: [
    "The build command reads all markdown files in the current directory and generates corresponding executable files in the .pd directory.",
    `Options:
    -d, --debug   Display debug information.
    -h, --help    Display this message.`,
  ],
});

export async function buildCommand(input: pdCliInput) {
  if (pd.$p.get(input, "/flags/help") || pd.$p.get(input, "/flags/h")) {
    console.log(helpText);
  } else {
    return Object.assign(input, await pdBuild(input));
  }
  return input;
}
