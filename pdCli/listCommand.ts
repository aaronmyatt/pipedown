import { pd, std } from "../deps.ts";
import { fileDir } from "../pdUtils.ts";
import { cliHelpTemplate } from "../stringTemplates.ts";
import { PD_DIR } from "./helpers.ts";
import type { pdCliInput } from "./mod.ts";

const helpText = cliHelpTemplate({
  title: "List",
  command: "pd list",
  sections: [
    "List all processed markdown files in the current directory.",
    `Options:
    -d, --debug   Display debug information.
    -h, --help    Display this message.`,
  ],
});

const skip = [/__snapshots__/];

export async function listCommand(input: pdCliInput) {
  if (pd.$p.get(input, "/flags/help") || pd.$p.get(input, "/flags/h")) {
    console.log(helpText);
  } else {
    for await (const entry of std.walk(PD_DIR, { skip, exts: [".md"] })) {
      console.log(std.colors.brightGreen(fileDir(entry.path)));
    }
  }

  return input;
}
