import type { pdCliInput } from "./mod.ts";
import { pdRun } from "./helpers.ts";
import { pd } from '../deps.ts';

const commandName = pd.$p.compile('/flags/_/1')
const inputRaw = pd.$p.compile('/flags/_/2')
const inputParam = pd.$p.compile('/flags/input')

export async function runCommand(input: pdCliInput) {
  const command = commandName.get(input);
  const testInput = inputRaw.get(input) || inputParam.get(input) || "{}";
  await pdRun(command, testInput)
  return input;
}
