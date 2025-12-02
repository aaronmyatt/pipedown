import type { CliInput } from "../pipedown.d.ts";
import { pdRepl, getProjectName } from "./helpers.ts";
import { pd } from "../deps.ts";
import { pdBuild } from "../pdBuild.ts";
import { cliHelpTemplate } from "../stringTemplates.ts";

const helpText = cliHelpTemplate({
  title: "REPL",
  command: "pd repl",
  sections: [
    "Run the `deno repl` with your project pipes preloaded. ",
    `Example:
    pd repl`
  ],
});


export async function replCommand(input: CliInput) {
  if (pd.$p.get(input, "/flags/help") || pd.$p.get(input, "/flags/h")) {
    console.log(helpText);
  } else {
    const projectName = getProjectName(input.globalConfig);
    await pdBuild(input);
    await pdRepl(projectName);
  }
  return input;
}
