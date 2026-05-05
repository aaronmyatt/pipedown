import { pd, std } from "../deps.ts";
import { cliHelpTemplate } from "../stringTemplates.ts";
import { lintProject, printLintResult } from "./lintCheck.ts";
import type { CliInput } from "../pipedown.d.ts";

const helpText = cliHelpTemplate({
  title: "Lint",
  command: "pd lint [pipe-name]",
  sections: [
    'Statically check markdown pipelines for syntax issues without running a build. Reports malformed JSON config blocks, duplicate zod schemas, typo\'d DSL directives (e.g. "chek:" → "check:"), and unknown HTTP methods.',
    `Examples:
    pd lint              # check every pipeline in the project
    pd lint auth         # check only pipes whose path matches /auth/`,
    `Options:
    --warnings-as-errors  Treat warnings as errors (non-zero exit).
    -h, --help            Display this message.`,
  ],
});

export async function lintCommand(input: CliInput) {
  if (pd.$p.get(input, "/flags/help") || pd.$p.get(input, "/flags/h")) {
    console.log(helpText);
    return input;
  }

  const matchArg = input.flags._[1] as string | undefined;
  const warningsAsErrors = Boolean(
    pd.$p.get(input, "/flags/warnings-as-errors"),
  );

  const result = await lintProject(input, {
    match: matchArg ? String(matchArg) : undefined,
  });

  printLintResult(result);

  const total = result.errors.length + result.warnings.length;
  if (total === 0) {
    console.log(
      std.colors.brightGreen(
        `✓ ${result.filesChecked} pipeline${
          result.filesChecked === 1 ? "" : "s"
        } checked, no issues found.`,
      ),
    );
    return input;
  }

  console.error(
    std.colors.dim(
      `\n${result.filesChecked} file${
        result.filesChecked === 1 ? "" : "s"
      } checked — ${result.errors.length} error${
        result.errors.length === 1 ? "" : "s"
      }, ${result.warnings.length} warning${
        result.warnings.length === 1 ? "" : "s"
      }.`,
    ),
  );

  const fail = result.errors.length > 0 ||
    (warningsAsErrors && result.warnings.length > 0);
  if (fail) Deno.exit(1);

  return input;
}
