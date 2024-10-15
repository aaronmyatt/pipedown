import type { pdCliInput } from "./mod.ts";
import { pdRepl, pdRun } from "./helpers.ts";
import { pd, std } from "../deps.ts";
import { pdBuild } from "../pdBuild.ts";
import { cliHelpTemplate } from "../stringTemplates.ts";

const commandName = pd.$p.compile("/flags/_/1");
const inputRaw = pd.$p.compile("/flags/_/2");
const inputParam = pd.$p.compile("/flags/input");

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
