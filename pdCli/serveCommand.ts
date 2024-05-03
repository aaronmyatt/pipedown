import type { pdCliInput } from "./mod.ts";
import {pdServe} from "./helpers.ts";
import {pd} from '../deps.ts';

const commandName = pd.$p.compile('/flags/_/1')
const inputRaw = pd.$p.compile('/flags/_/2')
const inputParam = pd.$p.compile('/flags/input')

export async function serveCommand(input: pdCliInput) {
  const command = commandName.get(input);
  const testInput = inputRaw.get(input) || inputParam.get(input) || "{}";
  await pdServe(command, JSON.stringify(testInput));
  return input;
}
