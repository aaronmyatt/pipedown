import type { CliInput } from "../pipedown.d.ts";
import { pd } from "../deps.ts";
import { cliHelpTemplate } from "../stringTemplates.ts";
import { interactiveRun } from "./interactiveRun.ts";

const helpText = cliHelpTemplate({
  title: "Interactive",
  command: "pd interactive <file.md> [options]",
  sections: [
    "Open a markdown pipe in the interactive replay workflow.",
    "Hotkeys fire immediately: r rerun, i edit input, s choose past input, e edit pipe, t latest trace, q quit.",
    `Examples:
    pd interactive myPipe.md
    pd i myPipe.md`,
    `Options:
    -h, --help   Display this message.
    --input      Not used here; interactive mode starts from the latest trace input when one exists.`,
  ],
});

export async function interactiveCommand(input: CliInput) {
  if (pd.$p.get(input, "/flags/help") || pd.$p.get(input, "/flags/h")) {
    console.log(helpText);
    return input;
  }

  return await interactiveRun(input);
}
