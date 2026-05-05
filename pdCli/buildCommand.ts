import { pd } from "../deps.ts";
import { pdBuild } from "../pdBuild.ts";
import { defaultTemplateFiles } from "../defaultTemplateFiles.ts";
import { cliHelpTemplate } from "../stringTemplates.ts";
import { reportParseDiagnostics } from "./lintCheck.ts";
import type { BuildInput, CliInput } from "../pipedown.d.ts";

const helpText = cliHelpTemplate({
  title: "Build",
  command: "pd build",
  sections: [
    "The build command reads all markdown files in the current directory and generates corresponding executable files in the .pd directory.",
    `Options:
    -j, --json    Output the build information as JSON.
    -p, --pretty  Pretty print the JSON output.
    -d, --debug   Display debug information.
    -h, --help    Display this message.`,
  ],
});

export async function buildCommand(input: CliInput) {
  if (pd.$p.get(input, "/flags/help") || pd.$p.get(input, "/flags/h")) {
    console.log(helpText);
  } else {
    const buildResult = await pdBuild(input);
    const merged = Object.assign(input, buildResult);

    // After the main build, restore any default template files (deno.json,
    // replEval.ts) that may be missing from the .pd directory. pdBuild
    // already calls defaultTemplateFiles internally, but re-running it here
    // ensures files deleted outside of a build cycle are recreated.
    // Ref: defaultTemplateFiles.ts — writes .pd/deno.json and .pd/replEval.ts
    await defaultTemplateFiles(merged as BuildInput);

    // Fail the build with a non-zero exit code if any errors were collected
    // during parsing (e.g. malformed JSON config blocks in markdown files).
    // Warnings (typo'd directives, duplicate zod blocks) are printed but
    // not fatal — they should nudge, not block. CI can opt into stricter
    // behaviour via `pd lint --warnings-as-errors`.
    // Ref: lintCheck.ts — formats parse-time PDError entries to stderr
    const { errorCount } = reportParseDiagnostics(merged);
    if (errorCount > 0) Deno.exit(1);

    return merged;
  }
  return input;
}
