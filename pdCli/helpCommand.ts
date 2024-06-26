import type { pdCliInput } from "./mod.ts";

import { cliHelpTemplate } from "../stringTemplates.ts";

const helpText = cliHelpTemplate({
  title: "Pipedown",
  command: "pd [command] [options]",
  sections: [
    `Commands:
  build   Generate scripts for all markdown files in current directory
  run     Run a script generated by pd
  test    Run tests for all scripts generated by pd
  list    List all scripts generated by pd
  clean   Remove all scripts generated by pd
  help    You're reading it!`,
    `Options:
  -d, --debug   Display debug information.
  -h, --help    Display this message.`,
  ],
});

export function helpCommand(input: pdCliInput) {
  console.log(helpText);
  return input;
}
