import { walk } from "https://deno.land/std@0.208.0/fs/mod.ts";
import { PD_DIR, colors } from "./helpers.ts";
import type { pdCliInput } from "./mod.ts";

const skip = [/__snapshots__/];

export async function listCommand(input: pdCliInput) {
  for await (const entry of walk(PD_DIR, { skip, includeFiles: false })) {
    if (entry.name.match(/^\.pd$/)) continue;
    console.log(colors.brightGreen(entry.name));
  }
  return input;
}
