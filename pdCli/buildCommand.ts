import { pdBuild } from "../pdBuild.ts";
import type { pdCliInput } from "./mod.ts";

export  async function buildCommand(input: pdCliInput) {
  return Object.assign(input, await pdBuild(input));
}
