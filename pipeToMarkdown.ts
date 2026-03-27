import type { Pipe, Step, PipeConfig } from "./pipedown.d.ts";

/**
 * Converts a Pipe object back to markdown source.
 *
 * Two modes:
 * 1. **Lossless** — when `pipe.rawSource` and step `sourceMap` data are available
 *    (i.e., the Pipe was parsed from a markdown file), reconstructs by joining
 *    raw source segments. Only code blocks that have changed are spliced in.
 *    All prose, formatting, blockquotes, dividers, and non-code content are
 *    preserved verbatim.
 *
 * 2. **Lossy fallback** — when raw source data is absent (e.g., Pipe was constructed
 *    programmatically or loaded from index.json without rawSource), reconstructs
 *    from structured fields. This is the original behavior.
 */
export function pipeToMarkdown(pipe: Pipe): string {
  if (canReconstructLosslessly(pipe)) {
    return losslessReconstruct(pipe);
  }
  return reconstructFromFields(pipe);
}

// ---------------------------------------------------------------------------
// Lossless reconstruction
// ---------------------------------------------------------------------------

function canReconstructLosslessly(pipe: Pipe): boolean {
  if (!pipe.rawSource) return false;
  if (pipe.steps.length === 0) return true; // header-only pipe
  // Need at least code block line ranges for all steps
  return pipe.steps.every(
    (s) => s.sourceMap?.codeStartLine != null && s.sourceMap?.codeEndLine != null,
  );
}

function losslessReconstruct(pipe: Pipe): string {
  const sourceLines = pipe.rawSource!.split("\n");
  const output: string[] = [];

  if (pipe.steps.length === 0) {
    // No steps — return raw source as-is
    return pipe.rawSource!;
  }

  // Determine step section boundaries.
  // Each step's section starts at its heading line (or code block line if no heading).
  // The section ends where the next step's section begins, or at EOF.
  const stepBoundaries: Array<{ start: number; end: number }> = [];
  for (let i = 0; i < pipe.steps.length; i++) {
    const step = pipe.steps[i];
    const start = step.sourceMap?.headingLine ?? step.sourceMap?.codeStartLine ?? 0;
    const nextStep = pipe.steps[i + 1];
    const end = nextStep
      ? (nextStep.sourceMap?.headingLine ?? nextStep.sourceMap?.codeStartLine ?? sourceLines.length)
      : sourceLines.length;
    stepBoundaries.push({ start, end });
  }

  // Header: everything before the first step's section
  const headerEnd = stepBoundaries[0].start;
  if (headerEnd > 0) {
    output.push(...sourceLines.slice(0, headerEnd));
  }

  // Each step section
  for (let i = 0; i < pipe.steps.length; i++) {
    const step = pipe.steps[i];
    const { start, end } = stepBoundaries[i];
    const codeStart = step.sourceMap!.codeStartLine!;
    const codeEnd = step.sourceMap!.codeEndLine!;

    const codeChanged =
      step.originalCode !== undefined && step.code !== step.originalCode;

    if (codeChanged) {
      // Emit everything from step start up to and including the fence-open line
      output.push(...sourceLines.slice(start, codeStart + 1));

      // Detect indentation from the original content lines (for list-indented blocks)
      const codeIndent = detectCodeIndent(sourceLines, codeStart, codeEnd, step.originalCode!);

      // Emit new code with proper indentation
      const newCodeLines = step.code.trimEnd().split("\n");
      for (const codeLine of newCodeLines) {
        output.push(codeIndent + codeLine);
      }

      // Emit fence-close line and everything after it until the next step
      // codeEnd is exclusive (line after fence-close), so codeEnd - 1 is the fence-close line
      output.push(...sourceLines.slice(codeEnd - 1, end));
    } else {
      // Unchanged: copy the entire section verbatim
      output.push(...sourceLines.slice(start, end));
    }
  }

  return output.join("\n");
}

/**
 * Detect the indentation prefix used for code lines inside a fenced block.
 * Compares the first raw content line with the first line of parsed code
 * to determine any leading whitespace added by list nesting.
 */
function detectCodeIndent(
  sourceLines: string[],
  codeStartLine: number,
  codeEndLine: number,
  originalCode: string,
): string {
  // The first content line is the line after the fence-open
  const firstRawContentLine = sourceLines[codeStartLine + 1];
  if (!firstRawContentLine || codeStartLine + 1 >= codeEndLine - 1) return "";

  const firstParsedLine = originalCode.split("\n")[0];
  if (!firstParsedLine) return "";

  // Find where the parsed code starts within the raw line
  const idx = firstRawContentLine.indexOf(firstParsedLine);
  if (idx > 0) return firstRawContentLine.substring(0, idx);
  return "";
}

// ---------------------------------------------------------------------------
// Lossy fallback (original reconstruction from structured fields)
// ---------------------------------------------------------------------------

function reconstructFromFields(pipe: Pipe): string {
  const lines: string[] = [];

  // H1 heading
  lines.push(`# ${pipe.name}`);
  lines.push("");

  // Pipe-level description
  if (pipe.pipeDescription) {
    lines.push(pipe.pipeDescription);
    lines.push("");
  }

  // Schema block (if present)
  if (pipe.schema) {
    lines.push("```zod");
    lines.push(pipe.schema.trimEnd());
    lines.push("```");
    lines.push("");
  }

  // JSON config block (inputs and other meaningful config)
  const configBlock = buildConfigBlock(pipe.config);
  if (configBlock) {
    lines.push("```json");
    lines.push(configBlock);
    lines.push("```");
    lines.push("");
  }

  // Steps
  for (const step of pipe.steps) {
    renderStep(step, lines);
  }

  return lines.join("\n").trimEnd() + "\n";
}

function renderStep(step: Step, lines: string[]): void {
  const level = step.headingLevel || 2;
  const hashes = "#".repeat(level);

  // Heading
  lines.push(`${hashes} ${step.name}`);
  lines.push("");

  // Description
  if (step.description) {
    lines.push(step.description);
    lines.push("");
  }

  // Conditional directives
  if (step.inList && step.config) {
    const directives = buildDirectives(step.config);
    if (directives.length > 0) {
      for (const directive of directives) {
        lines.push(`- ${directive}`);
      }
    }
  }

  // Code block
  const lang = step.language || "ts";
  if (step.inList && step.config) {
    // Indented inside list
    lines.push(`- \`\`\`${lang}`);
    const codeLines = step.code.trimEnd().split("\n");
    for (const codeLine of codeLines) {
      lines.push(`  ${codeLine}`);
    }
    lines.push("  ```");
  } else {
    lines.push(`\`\`\`${lang}`);
    lines.push(step.code.trimEnd());
    lines.push("```");
  }
  lines.push("");
}

function buildDirectives(config: Step["config"]): string[] {
  const directives: string[] = [];
  if (!config) return directives;

  for (const check of config.checks || []) {
    // Skip flags checks (they have /flags/ prefix, handled separately)
    if (check.startsWith("/flags/")) continue;
    directives.push(`check: ${check}`);
  }

  for (const check of config.checks || []) {
    if (check.startsWith("/flags/")) {
      directives.push(`flags: ${check.replace("/flags", "")}`);
    }
  }

  for (const path of config.and || []) {
    directives.push(`and: ${path}`);
  }

  for (const path of config.not || []) {
    directives.push(`not: ${path}`);
  }

  for (const path of config.or || []) {
    directives.push(`or: ${path}`);
  }

  for (const route of config.routes || []) {
    directives.push(`route: ${route}`);
  }

  if (config.stop !== undefined) {
    directives.push("stop:");
  }

  if (config.only !== undefined) {
    directives.push("only:");
  }

  return directives;
}

function buildConfigBlock(config?: PipeConfig): string | null {
  if (!config) return null;

  // Extract only the user-meaningful config (not internal/system fields)
  const meaningful: Record<string, unknown> = {};

  if (config.inputs && config.inputs.length > 0) {
    meaningful.inputs = config.inputs;
  }

  if (config.build && config.build.length > 0) {
    meaningful.build = config.build;
  }

  // Include custom config keys (not internal ones)
  const internalKeys = new Set([
    "inputs", "build", "templates", "skip", "exclude",
    "checks", "or", "and", "not", "routes", "flags",
    "only", "stop", "name", "inGlobal",
  ]);
  for (const [key, value] of Object.entries(config)) {
    if (!internalKeys.has(key) && value !== undefined) {
      meaningful[key] = value;
    }
  }

  if (Object.keys(meaningful).length === 0) return null;

  return JSON.stringify(meaningful, null, 2);
}
