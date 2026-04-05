import type { CliInput } from "../pipedown.d.ts";
import { pd, std } from "../deps.ts";
import { PD_DIR } from "./helpers.ts";
import { pdBuild } from "../pdBuild.ts";
import { cliHelpTemplate } from "../stringTemplates.ts";
// Sends IPC events to pd-desktop via Unix socket for native notifications.
// Ref: ./notifyTauri.ts for protocol details
import { notifyTauri } from "./notifyTauri.ts";

const helpText = cliHelpTemplate({
  title: "Run Step",
  command: "pd run-step <file.md> <step-index> [options]",
  sections: [
    "Run steps 0 through N of a pipe and output the resulting input object as JSON.",
    `Examples:
    pd run-step myPipe.md 0                        # Run only step 0
    pd run-step myPipe.md 2                        # Run steps 0, 1, 2
    pd run-step myPipe.md 0 --input '{"x": 1}'     # Run step 0 with input`,
    `Options:
    --input       Initial input JSON string. Default: '{}'
    -h, --help    Display this message.`,
  ],
});

export async function runStepCommand(input: CliInput) {
  if (pd.$p.get(input, "/flags/help") || pd.$p.get(input, "/flags/h")) {
    console.log(helpText);
    return input;
  }

  const fileName = input.flags._[1] as string;
  const stepArg = input.flags._[2] as string;

  if (!fileName || stepArg === undefined) {
    console.error("Error: missing required arguments");
    console.log(helpText);
    return input;
  }

  const stepIndex = parseInt(stepArg);
  if (isNaN(stepIndex) || stepIndex < 0) {
    console.error(`Error: invalid step index "${stepArg}"`);
    return input;
  }

  await pdBuild(input);

  const pipeName = fileName.replace(/\.md$/, "").replace(/[\W_]+/g, " ").trim().replace(/\s+/g, "");
  const pipeDir = std.join(PD_DIR, pipeName);
  const indexTsPath = std.join(pipeDir, "index.ts");
  const indexJsonPath = std.join(pipeDir, "index.json");

  try {
    const pipeData = JSON.parse(await Deno.readTextFile(indexJsonPath));
    if (stepIndex >= pipeData.steps.length) {
      console.error(`Error: step index ${stepIndex} is out of range (0-${pipeData.steps.length - 1})`);
      return input;
    }

    const testInput = (input.flags.input as string) || "{}";

    const stepFuncNames = pipeData.steps
      .slice(0, stepIndex + 1)
      .map((s: { funcName: string }) => s.funcName);

    // Use absolute paths and write temp file inside .pd/ so the deno.json config resolves
    const absIndexTs = std.join(Deno.cwd(), indexTsPath);
    const absIndexJson = std.join(Deno.cwd(), indexJsonPath);
    const absConfigPath = std.join(Deno.cwd(), PD_DIR, "deno.json");

    // Escape the input JSON for embedding in source
    const escapedInput = testInput.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

    const evalScript = `
import { ${stepFuncNames.join(", ")} } from "file://${absIndexTs}";
import rawPipe from "file://${absIndexJson}" with {type: "json"};

const input = JSON.parse('${escapedInput}');
const opts = rawPipe;
const steps = [${stepFuncNames.join(", ")}];

for (const step of steps) {
  try {
    await step(input, opts);
  } catch (e) {
    input.errors = input.errors || [];
    input.errors.push({ func: step.name, message: e.message });
  }
}

console.log(JSON.stringify(input, null, 2));
`;

    // Write temp file inside .pd/ directory so config resolves correctly
    const tmpFile = std.join(Deno.cwd(), PD_DIR, `_run_step_${Date.now()}.ts`);
    await Deno.writeTextFile(tmpFile, evalScript);

    // Notify pd-desktop that a step run is starting.
    notifyTauri({
      type: "run_start",
      title: "Step Run Started",
      message: `${pipeName} (step ${stepIndex})`,
      pipe: pipeName,
      success: true,
    });

    let runSuccess = false;
    
    try {
      const command = new Deno.Command(Deno.execPath(), {
        args: [
          "run",
          "--unstable-kv",
          "-A",
          "-c",
          absConfigPath,
          "--no-check",
          tmpFile,
        ],
        stdout: "inherit",
        stderr: "inherit",
      });
      const output = await command.output();
      runSuccess = output.success;
    } finally {
      await Deno.remove(tmpFile);
    }

    // Notify pd-desktop that the step run finished.
    notifyTauri({
      type: "run_complete",
      title: runSuccess ? "Step Run Complete" : "Step Run Failed",
      message: `${pipeName} (step ${stepIndex})`,
      pipe: pipeName,
      success: runSuccess,
    });
  } catch (e) {
    console.error(`Error: ${e.message}`);
    input.errors = input.errors || [];
    input.errors.push(e);

    // Notify pd-desktop of the failure.
    notifyTauri({
      type: "run_complete",
      title: "Step Run Failed",
      message: `${fileName} (step ${stepIndex}): ${e.message}`,
      pipe: pipeName,
      success: false,
    });
  }

  return input;
}
