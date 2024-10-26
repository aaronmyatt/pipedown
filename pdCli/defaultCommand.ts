import type { CliInput } from "../pipedown.d.ts";
import { std } from "../deps.ts";
import { serve } from "./buildandserve.ts";

// const listenForKeypresses = async () => {
//   addEventListener("keypress", async (e) => {
//     const detail = (e as CustomEvent).detail;
//     if (detail.keycode.name === "c" && detail.keycode.ctrl) {
//       if(globalThis.processes && globalThis.processes.length > 0){ // @ts-expect-error helper to close any running process
//         for (const process of globalThis.processes) {
//           try {
//             process.kill();
//           } catch (e) {
//             console.error(e)
//           }
//         }
//       }
//       console.log('Exiting')
//       Deno.exit();
//     }

//     if (detail.keycode.name === "e") {
//       console.log('Exporting')
//     }
//     console.log(detail);
//   });

// Deno.stdin.setRaw(true)
//   Deno.stdin.setRaw(true, {cbreak: true})
//   for await (const stdin of Deno.stdin.readable) {
//     const keycode = std.firstNotNullishOf(keycodeParse(stdin), (k => k))
//     if (keycode) {
//       dispatchEvent(new CustomEvent('keypress', {detail: {keycode}}))
//     }
//   }
// }

export async function defaultCommand(input: CliInput) {
  console.log(std.colors.brightGreen("Watching for changes..."));
  await serve(input);
  return input;
}
