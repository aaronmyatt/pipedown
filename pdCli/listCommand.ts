import { pd, std } from "../deps.ts";
import { fileDir } from "../pdUtils.ts";
import { cliHelpTemplate } from "../stringTemplates.ts";
import { PD_DIR } from "./helpers.ts";
import type { CliInput } from "../pipedown.d.ts";

const helpText = cliHelpTemplate({
  title: "List",
  command: "pd list",
  sections: [
    "List all processed markdown files in the current directory.",
    `Options:
    -j, --json    Output the build information as JSON.
    -p, --pretty  Pretty print the JSON output.
    -d, --debug   Display debug information.
    -h, --help    Display this message.`,
  ],
});

const skip = [/__snapshots__/];

export async function listCommand(input: CliInput) {
  if (pd.$p.get(input, "/flags/help") || pd.$p.get(input, "/flags/h")) {
    console.log(helpText);
  } else {
    for await (const entry of std.walk(PD_DIR, { skip, exts: [".md"] })) {
      console.log(std.colors.brightGreen(fileDir(entry.path)));
    }
  }

  return input;
}
