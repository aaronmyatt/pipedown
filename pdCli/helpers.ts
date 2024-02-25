import { pdBuild } from "../pdBuild.ts";
import { basename } from "https://deno.land/std@0.208.0/path/mod.ts";
import { debounce } from "https://deno.land/std@0.208.0/async/debounce.ts";
import * as colors from "https://deno.land/x/std@0.208.0/fmt/colors.ts";
export { colors };

const HOME = Deno.env.get("HOME");
export const PD_DIR = `./.pd`;

export const lazyBuild = debounce(pdBuild, 100);
const lazyRun = debounce(async (fileName) => {
  console.log(colors.brightGreen(`Running... ${fileName}`));
  await pdRun(basename(fileName, ".md"), "{}");
}, 100);
export const lazyLint = debounce(async () => {
  const lint = new Deno.Command(Deno.execPath(), {
    args: ["lint", PD_DIR, "-q"],
  });
  await lint.output();
}, 100);
export const lazyFmt = debounce(async () => {
  const fmt = new Deno.Command(Deno.execPath(), {
    args: ["fmt", PD_DIR, "-q"],
  });
  await fmt.output();
}, 100);
export const lazyTest = debounce(async () => {
  const test = new Deno.Command(Deno.execPath(), {
    args: ["test", "-A", `--config=${PD_DIR}/deno.json`, "--no-check"],
    stdout: "inherit",
    stderr: "inherit",
  });
  await test.output();
}, 100);
export async function pdRun(scriptName: string, testInput: string) {
  const pipeDir = `${PD_DIR}/${basename(scriptName, ".md")}`;
  const scriptPath = `${pipeDir}/cli.ts`;
  const command = new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "-A",
      scriptPath,
      testInput || "{}",
    ],
    stdout: "inherit",
    stderr: "inherit",
  });
  await command.output();
}

export function mergeErrors<I extends Input>(input: I, output: I) {
  if (output.errors) {
    input.errors = input.errors || [];
    input.errors = input.errors.concat(output.errors);
  }
  return input;
}

export const objectEmpty = (obj: object) => {
  return Object.keys(obj).length === 0
}
