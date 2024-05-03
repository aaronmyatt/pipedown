import { std } from "../deps.ts";
import { PD_DIR } from "./helpers.ts";
import type { pdCliInput } from "./mod.ts";

const skip = [/__snapshots__/];

export async function listCommand(input: pdCliInput) {
  for await (const entry of std.walk(PD_DIR, { skip, includeFiles: false })) {
    if (entry.name.match(/^\.pd$/)) continue;
    console.log(std.colors.brightGreen(entry.name));
  }
  return input;
}
