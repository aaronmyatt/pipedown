import type { pdCliInput } from "./mod.ts";
import { debounce } from "https://deno.land/std@0.208.0/async/debounce.ts";
import { pdBuild } from "../pdBuild.ts";
import { reportErrors } from "./reportErrors.ts";
import { basename } from "https://deno.land/std@0.206.0/path/basename.ts";
import { colors } from "./helpers.ts";
import { testCommand } from "./testCommand.ts";
import {firstNotNullishOf} from "https://deno.land/std@0.208.0/collections/first_not_nullish_of.ts";
import {parse as keycodeParse} from "https://deno.land/x/cliffy@v1.0.0-rc.3/keycode/key_code.ts";

const listenForKeypresses = async () => {
  addEventListener("keypress", async (e) => {
    const detail = (e as CustomEvent).detail;
    if (detail.keycode.name === "c" && detail.keycode.ctrl) {
      if(globalThis.processes && globalThis.processes.length > 0){ // @ts-expect-error helper to close any running process
        for (const process of globalThis.processes) {
          try {
            process.kill();
          } catch (e) {
            console.error(e)
          }
        }
      }
      console.log('Exiting')
      Deno.exit();
    }

    if (detail.keycode.name === "e") {
      console.log('Exporting')
    }
    console.log(detail);
  });

  // Deno.stdin.setRaw(true)
  Deno.stdin.setRaw(true, {cbreak: true})
  for await (const stdin of Deno.stdin.readable) {
    const keycode = firstNotNullishOf(keycodeParse(stdin), (k => k))
    if (keycode) {
      dispatchEvent(new CustomEvent('keypress', {detail: {keycode}}))
    }
  }
}

export async function defaultCommand(input: pdCliInput) {
  console.log(colors.brightGreen("Watching for changes..."));
  await pdBuild(input);

  const lazyIO = debounce(async (input: pdCliInput) => {
    Object.assign(input, await pdBuild(input));
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

  for await (const event of Deno.watchFs(".", { recursive: true,  })) {
    const notInProtectedDir = event.paths.every((path) =>
      !path.match("\.pd|deno|dist")
    );

    const extensions = [".md"];
    const hasValidExtension = event.paths.every((path) =>
      extensions.some((ext) => path.endsWith(ext))
    );

    if (
      event.kind === "modify" && event.paths.length === 1 && notInProtectedDir && hasValidExtension
    ) {
      const fileName = basename(event.paths[0]);
      console.log(colors.brightGreen(`File changed: ${fileName}`));
      lazyIO({match: fileName, ...input});
      //lazyDispatchFileChanged(input);
    }
  }

  return input;
}
