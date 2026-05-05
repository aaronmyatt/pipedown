import { std } from "../deps.ts";
import { mdToPipe } from "../mdToPipe.ts";
import * as utils from "../pdUtils.ts";
import type { CliInput, PDError, WalkOptions } from "../pipedown.d.ts";

const _walkOpts: WalkOptions = {
  exts: [".md"],
  skip: [
    /node_modules/,
    /\.pd/,
    /^readme\.md\/*$/,
    /^README\.md\/*$/,
    /deno.*/,
  ],
};

/** Result of running lint over a project's markdown pipelines. */
export type LintResult = {
  /** Diagnostics with severity "error" — should fail builds/runs. */
  errors: PDError[];
  /** Diagnostics with severity "warning" — printed but non-fatal by default. */
  warnings: PDError[];
  /** Number of markdown files actually parsed. */
  filesChecked: number;
};

/**
 * Parse every project markdown file (or just the one matched) with mdToPipe
 * and bucket the resulting diagnostics by severity. No codegen, no disk
 * writes — purely structural validation of the markdown DSL.
 *
 * The discovery loop mirrors pdBuild.ts/parseMdFiles so a `pd lint` pass
 * sees the same files a `pd build` would.
 *
 * @param input - The CLI input (used for cwd resolution).
 * @param opts.match - Optional regex string to filter to a single pipe.
 */
export async function lintProject(
  input: CliInput,
  opts: { match?: string } = {},
): Promise<LintResult> {
  const rootDir = (input as { cwd?: string }).cwd || Deno.cwd();
  const walkOpts: WalkOptions = { ..._walkOpts };
  if (opts.match) walkOpts.match = [new RegExp(opts.match)];

  const errors: PDError[] = [];
  const warnings: PDError[] = [];
  let filesChecked = 0;

  for await (const entry of std.walk(rootDir, walkOpts)) {
    const markdown = await Deno.readTextFile(entry.path);
    if (markdown === "") continue;
    filesChecked++;

    const fileName = utils.fileName(entry.path);
    const output = await mdToPipe({
      markdown,
      pipe: {
        mdPath: entry.path,
        fileName,
        dir: "",
        absoluteDir: "",
        config: {},
        name: "",
        cleanName: "",
        steps: [],
      },
    });

    if (output.errors) {
      for (const err of output.errors) {
        if (err.severity === "warning") warnings.push(err);
        else errors.push(err);
      }
    }
  }

  return { errors, warnings, filesChecked };
}

/**
 * Format a single PDError as `path:line:col level: message`. Mirrors the
 * TypeScript compiler's diagnostic format so editor problem matchers can
 * consume the output verbatim.
 */
export function formatLintEntry(err: PDError): string {
  const file = err.filePath || "<unknown>";
  const line = err.line ?? 1;
  const col = err.column ?? 1;
  const level = err.severity === "warning" ? "warning" : "error";
  return `${file}:${line}:${col} ${level}: ${err.message}`;
}

/** Print warnings (yellow) and errors (red) to stderr. */
export function printLintResult(result: LintResult): void {
  for (const w of result.warnings) {
    console.error(std.colors.yellow(formatLintEntry(w)));
  }
  for (const e of result.errors) {
    console.error(std.colors.red(formatLintEntry(e)));
  }
}
