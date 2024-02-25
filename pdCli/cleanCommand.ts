import type { pdCliInput} from "./mod.ts";
import {colors, PD_DIR} from "./helpers.ts";

export async function cleanCommand(input: pdCliInput) {
    console.log(colors.brightGreen("Cleaning up..."));
    await Deno.remove(PD_DIR, { recursive: true });
    console.log(colors.brightGreen("Done!"));
    return input;
  }
