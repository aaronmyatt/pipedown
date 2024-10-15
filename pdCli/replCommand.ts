import type { pdCliInput } from "./mod.ts";
import { pdRepl } from "./helpers.ts";
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


export async function replCommand(input: pdCliInput) {
  if (pd.$p.get(input, "/flags/help") || pd.$p.get(input, "/flags/h")) {
    console.log(helpText);
  } else {
    await pdBuild(input);
    await pdRepl();
  }
  return input;
}
