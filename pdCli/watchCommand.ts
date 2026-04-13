import type { CliInput } from "../pipedown.d.ts";
import { pd, std } from "../deps.ts";
import { pdBuild } from "../pdBuild.ts";
import { commonArgs } from "./helpers.ts";
import { cliHelpTemplate } from "../stringTemplates.ts";

const helpText = cliHelpTemplate({
  title: "Watch",
  command: "pd watch [options]",
  sections: [
    "Watch .md files for changes and run pd-assist to identify incomplete steps.",
    `Examples:
    pd watch                                    # Watch current directory
    pd watch --assist /path/to/assist.md        # Specify assist pipe location`,
    `Options:
    --assist      Path to the pd-assist markdown file
    -h, --help    Display this message`,
  ],
});

export async function watchCommand(input: CliInput) {
  if (pd.$p.get(input, "/flags/help") || pd.$p.get(input, "/flags/h")) {
    console.log(helpText);
    return input;
  }

  const assistPath = (input.flags.assist as string) || "";

  console.log(std.colors.brightCyan("Watching for .md file changes..."));
  if (assistPath) {
    console.log(std.colors.brightCyan(`Using assist pipe: ${assistPath}`));
  }
  console.log(std.colors.brightCyan("Press Ctrl+C to stop.\n"));

  // Initial build
  await pdBuild(input);

  const pathRegex =
    /\.pd|deno|dist|\.git|\.vscode|\.github|\.cache|\.history|\.log|\.lock|\.swp/;
  const lazyProcess = std.debounce(async (filePath: string) => {
    console.log(std.colors.brightGreen(`\nFile changed: ${filePath}`));

    // Rebuild
    try {
      await pdBuild(Object.assign({}, input, { match: filePath }));
    } catch (e) {
      // Cast `e` from unknown to Error — TS strict catch handling.
      console.error(
        std.colors.brightRed(`Build error: ${(e as Error).message}`),
      );
      return;
    }

    if (assistPath) {
      // Run pd-assist against the changed file
      try {
        const assistInput = JSON.stringify({ file: filePath });
        const command = new Deno.Command(Deno.execPath(), {
          args: [
            "run",
            ...commonArgs,
            "--no-check",
            `.pd/${std.basename(assistPath).replace(/\.md$/, "")}/cli.ts`,
            "--input",
            assistInput,
            "--json",
          ],
          stdout: "piped",
          stderr: "inherit",
        });
        const { stdout } = await command.output();
        const output = new TextDecoder().decode(stdout);

        try {
          const parsed = JSON.parse(output);
          const body = parsed.body || parsed;

          if (body.stubCount > 0) {
            console.log(std.colors.brightYellow(
              `\n${body.stubCount} incomplete step(s) found in ${body.pipeName}:`,
            ));
            for (const stub of body.stubs || []) {
              console.log(
                std.colors.brightYellow(
                  `  - [line ${stub.lineNumber}] ${stub.heading}`,
                ),
              );
              console.log(std.colors.white(`    "${stub.description}"`));
            }
            console.log(std.colors.brightCyan(
              `\nRun: pd run ${assistPath} --input '${
                JSON.stringify({ file: filePath })
              }' -- --json`,
            ));
          } else {
            console.log(std.colors.brightGreen("All steps are complete."));
          }
        } catch (_e) {
          // If output isn't valid JSON, just print it
          if (output.trim()) console.log(output);
        }
      } catch (e) {
        // Cast `e` from unknown to Error — TS strict catch handling.
        console.error(
          std.colors.brightRed(`Assist error: ${(e as Error).message}`),
        );
      }
    } else {
      // No assist pipe — just report the change
      console.log(
        std.colors.brightCyan(
          `Rebuilt. Use --assist to enable stub detection.`,
        ),
      );
    }
  }, 300);

  for await (const event of Deno.watchFs(Deno.cwd(), { recursive: true })) {
    const notInProtectedDir = event.paths.every((path) =>
      !path.match(pathRegex)
    );
    const hasValidExtension = event.paths.every((path) => path.endsWith(".md"));

    if (
      event.kind === "modify" &&
      event.paths.length === 1 &&
      notInProtectedDir &&
      hasValidExtension
    ) {
      lazyProcess(event.paths[0]);
    }
  }

  return input;
}
