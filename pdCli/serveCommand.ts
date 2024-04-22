import type { pdCliInput } from "./mod.ts";
import {pdServe} from "./helpers.ts";
import {$p} from "jsr:@pd/pointers@0.1.1";

const commandName = $p.compile('/flags/_/1')
const inputRaw = $p.compile('/flags/_/2')
const inputParam = $p.compile('/flags/input')

export async function serveCommand(input: pdCliInput) {
  const command = commandName.get(input);
  const testInput = inputRaw.get(input) || inputParam.get(input) || "{}";
  await pdServe(command, JSON.stringify(testInput));
  return input;
}
