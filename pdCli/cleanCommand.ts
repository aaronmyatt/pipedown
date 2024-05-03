import type { pdCliInput} from "./mod.ts";
import {std} from "../deps.ts";
import {PD_DIR} from "./helpers.ts";

export async function cleanCommand(input: pdCliInput) {
    console.log(std.colors.brightGreen("Cleaning up..."));
    await Deno.remove(PD_DIR, { recursive: true });
    console.log(std.colors.brightGreen("Done!"));
    return input;
  }
