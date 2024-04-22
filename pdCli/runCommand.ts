import type { pdCliInput } from "./mod.ts";
import { pdRun } from "./helpers.ts";
import {$p} from "jsr:@pd/pointers@0.1.1";

const commandName = $p.compile('/flags/_/1')
const inputRaw = $p.compile('/flags/_/2')
const inputParam = $p.compile('/flags/input')

export async function runCommand(input: pdCliInput) {
  const command = commandName.get(input);
  const testInput = inputRaw.get(input) || inputParam.get(input) || "{}";

  // dispatchRunStartEvent(input);
  await pdRun(command, testInput)
  // dispatchRunEndEvent(input);
  return input;
}

function dispatchRunStartEvent(input: pdCliInput){
  const event = new CustomEvent('pdrunstart', {detail: input})
  dispatchEvent(event)
}

function dispatchRunEndEvent(input: pdCliInput){
  const event = new CustomEvent('pdrunend', {detail: input})
  dispatchEvent(event)
}
