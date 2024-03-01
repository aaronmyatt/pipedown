import type { pdCliInput } from "./mod.ts";
import { pdRun } from "./helpers.ts";
import {$p} from "../jsonPointers.ts";

const commandName = $p.compile('/flags/_/1')
const inputRaw = $p.compile('/flags/_/2')
const inputParam = $p.compile('/flags/input')

export async function runCommand(input: pdCliInput) {
  const command = commandName.get(input);
  const testInput = inputRaw.get(input) || inputParam.get(input) || "{}";
  await pdRun(command, JSON.stringify(testInput));
  return input;
}