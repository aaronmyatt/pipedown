import type { pdCliInput } from "./mod.ts";
import { pd, std } from "../deps.ts";
import { PD_DIR } from "./helpers.ts";
import { cliHelpTemplate } from "../stringTemplates.ts";

const helpText = cliHelpTemplate({
  title: "Clean",
  command: "pd clean",
  sections: [
    "Removes everything generated by Pipedown.",
    `Options:
    -d, --debug   Display debug information.
    -h, --help    Display this message.`,
  ],
});

export async function cleanCommand(input: pdCliInput) {
  if (pd.$p.get(input, "/flags/help") || pd.$p.get(input, "/flags/h")) {
    console.log(helpText);
  } else {
    console.log(std.colors.brightGreen("Cleaning up..."));
    await Deno.remove(PD_DIR, { recursive: true });
    console.log(std.colors.brightGreen("Done!"));
  }
  return input;
}
