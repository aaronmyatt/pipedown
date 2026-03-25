import type { CliInput } from "../pipedown.d.ts";
import { pd, std } from "../deps.ts";
import { PD_DIR } from "./helpers.ts";
import { pdBuild } from "../pdBuild.ts";
import { cliHelpTemplate } from "../stringTemplates.ts";

const helpText = cliHelpTemplate({
  title: "Inspect",
  command: "pd inspect <file.md> [step-index]",
  sections: [
    "Output structured JSON describing a pipe's structure, steps, and config.",
    `Examples:
    pd inspect myPipe.md           # Full pipe structure
    pd inspect myPipe.md 0         # Just step 0 details
    pd inspect myPipe.md 2         # Step 2 with preceding context`,
  ],
});

export async function inspectCommand(input: CliInput) {
  if (pd.$p.get(input, "/flags/help") || pd.$p.get(input, "/flags/h")) {
    console.log(helpText);
    return input;
  }

  const fileName = input.flags._[1] as string;
  const stepArg = input.flags._[2] as string | undefined;

  if (!fileName) {
    console.error("Error: missing file argument");
    console.log(helpText);
    return input;
  }

  await pdBuild(input);

  const pipeName = fileName.replace(/\.md$/, "").replace(/[\W_]+/g, " ").trim().replace(/\s+/g, "");
  const indexJsonPath = std.join(PD_DIR, pipeName, "index.json");

  try {
    const pipeData = JSON.parse(await Deno.readTextFile(indexJsonPath));

    if (stepArg !== undefined) {
      const stepIndex = parseInt(stepArg);
      if (isNaN(stepIndex) || stepIndex < 0 || stepIndex >= pipeData.steps.length) {
        console.error(`Error: step index ${stepArg} is out of range (0-${pipeData.steps.length - 1})`);
        return input;
      }

      const step = pipeData.steps[stepIndex];
      const precedingSteps = pipeData.steps.slice(0, stepIndex).map(
        (s: { name: string; funcName: string; code: string }) => ({
          name: s.name,
          funcName: s.funcName,
          code: s.code,
        }),
      );

      const output = {
        pipeName: pipeData.name,
        stepIndex,
        step: {
          name: step.name,
          funcName: step.funcName,
          code: step.code,
          inList: step.inList,
          config: step.config || null,
        },
        precedingSteps,
      };

      console.log(JSON.stringify(output, null, 2));
    } else {
      const output = {
        name: pipeData.name,
        cleanName: pipeData.cleanName,
        config: pipeData.config,
        steps: pipeData.steps.map(
          (s: { name: string; funcName: string; code: string; inList: boolean; config?: unknown }, i: number) => ({
            index: i,
            name: s.name,
            funcName: s.funcName,
            code: s.code,
            inList: s.inList,
            config: s.config || null,
          }),
        ),
      };

      console.log(JSON.stringify(output, null, 2));
    }
  } catch (e) {
    console.error(`Error: could not read pipe data for "${pipeName}": ${e.message}`);
    input.errors = input.errors || [];
    input.errors.push(e);
  }

  return input;
}
