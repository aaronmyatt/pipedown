import type { CliInput, Pipe } from "../pipedown.d.ts";
import { pd, std } from "../deps.ts";
import { pdBuild } from "../pdBuild.ts";
import { commonArgs, PD_DIR, resolvePipeWatchPaths } from "./helpers.ts";
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

  // ── Dependency-aware watch set ──
  // After the initial build, read each pipe's index.json to build a map of
  // watched file paths → pipe mdPaths. When a file changes we look up which
  // pipes depend on it and rebuild those specifically.
  // Falls back to rebuilding the changed file directly if not in the dep map
  // (the file itself might be a pipe .md).
  //
  // The watch set is rebuilt after every successful build so new dependencies
  // are picked up automatically.
  // Ref: helpers.ts resolvePipeWatchPaths()
  type WatchMap = Map<string, Set<string>>;
  async function buildWatchMap(): Promise<WatchMap> {
    const map: WatchMap = new Map();
    try {
      for await (
        const entry of std.walk(PD_DIR, {
          exts: [".json"],
          match: [/index\.json$/],
        })
      ) {
        const content = await Deno.readTextFile(entry.path);
        const pipe = JSON.parse(content) as Pipe;
        const watchPaths = await resolvePipeWatchPaths(pipe);
        for (const wp of watchPaths) {
          if (!map.has(wp)) map.set(wp, new Set());
          map.get(wp)!.add(pipe.mdPath);
        }
      }
    } catch {
      // .pd/ may not exist yet on first run — that's fine
    }
    return map;
  }

  let watchMap = await buildWatchMap();

  const pathRegex =
    /\.pd|deno|dist|\.git|\.vscode|\.github|\.cache|\.history|\.log|\.lock|\.swp/;
  const lazyProcess = std.debounce(async (filePath: string) => {
    // Find which pipe(s) are affected by this file change.
    // If the file is in the watch map, rebuild the pipes that depend on it.
    // Otherwise fall back to matching the changed file itself (it might be
    // a pipe .md that just hasn't been built yet).
    const affectedPipePaths = watchMap.get(filePath);
    const matchPattern = affectedPipePaths && affectedPipePaths.size > 0
      ? [...affectedPipePaths].join("|")
      : filePath;

    console.log(std.colors.brightGreen(`\nFile changed: ${filePath}`));

    // Rebuild
    try {
      await pdBuild(Object.assign({}, input, { match: matchPattern }));
      // Refresh the watch map so new dependencies are picked up
      watchMap = await buildWatchMap();
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
    // Watch .md files (pipe sources) and any files tracked as local
    // dependencies in the watch map (e.g. ./helpers.ts imported by a step).
    const isRelevantFile = event.paths.every((path) =>
      path.endsWith(".md") || watchMap.has(path)
    );

    if (
      event.kind === "modify" &&
      event.paths.length === 1 &&
      notInProtectedDir &&
      isRelevantFile
    ) {
      lazyProcess(event.paths[0]);
    }
  }

  return input;
}
