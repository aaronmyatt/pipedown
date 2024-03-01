import type { pdCliInput } from "./mod.ts";
import { debounce } from "https://deno.land/std@0.208.0/async/debounce.ts";
import { pdBuild } from "../pdBuild.ts";
import { reportErrors } from "./reportErrors.ts";
import { basename } from "https://deno.land/std@0.206.0/path/basename.ts";
import { colors } from "./helpers.ts";
import { testCommand } from "./testCommand.ts";

export async function defaultCommand(input: pdCliInput) {
  console.log(colors.brightGreen("Watching for changes..."));
  await pdBuild(input);

  const lazyIO = debounce(async (input: pdCliInput) => {
    Object.assign(input, await pdBuild(input));
    Object.assign(input, await testCommand(input));
    if (input.errors && input.errors.length > 0) {
      reportErrors(input);
    }
    input.errors = [];

  }, 200);

  function dispatchFileChangedEvent(input: pdCliInput){
    const event = new CustomEvent('pdfilechanged', {detail: input})
    dispatchEvent(event)
  }
  const lazyDispatchFileChanged = debounce(dispatchFileChangedEvent, 200);

  console.log([
    "r: run",
    "c: exit",
    "t: test",
    "h: help",
    "b: build",
    "l: lint",
    "f: format",
    "e: export",
  ].join(" | "));

  for await (const event of Deno.watchFs(".", { recursive: true })) {
    const notInProtectedDir = event.paths.every((path) =>
      !path.match("\.pd|deno|dist")
    );

    if (
      event.kind === "modify" && event.paths.length === 1 && notInProtectedDir
    ) {
      const fileName = basename(event.paths[0]);
      console.log(colors.brightGreen(`File changed: ${fileName}`));
      lazyIO({match: fileName, ...input});
      lazyDispatchFileChanged(input);
    }
  }

  return input;
}
