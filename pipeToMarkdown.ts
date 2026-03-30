import type { Pipe, Step, PipeConfig } from "./pipedown.d.ts";

/**
 * Converts a Pipe object back to markdown source.
 *
 * Two modes:
 * 1. **Lossless** — when `pipe.rawSource` and step `sourceMap` data are available
 *    (i.e., the Pipe was parsed from a markdown file), reconstructs by joining
 *    raw source segments. Changed titles, descriptions, and code blocks are
 *    spliced into the original source. DSL directives, formatting, blockquotes,
 *    dividers, and non-modified content are preserved verbatim.
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

/**
 * Tests whether a raw source line is a pipedown list DSL directive.
 *
 * Directives are markdown list items that control conditional step execution
 * (check, and, or, not, route, flags, stop, only, mock). They must be
 * preserved verbatim during description replacement.
 * Ref: mdToPipe.ts setupChecks() regex at line ~207
 *
 * @param line - A single line from the raw markdown source
 * @returns true if the line is a DSL directive that should be preserved
 */
function isDSLDirective(line: string): boolean {
  // Matches all pipedown list-item directives, including "method" and "type"
  // for HTTP method filtering and response content-type shorthand.
  // Ref: mdToPipe.ts setupChecks() regex for the authoritative directive list
  return /^\s*-\s*(?:check|when|if|flags|or|and|not|route|stop|only|mock|method|type)[:\s]/.test(line);
}

/**
 * Finds the end of the pipe-level description region in the header section.
 *
 * The description sits between the H1 heading and the first structural block
 * (fenced code block like ```zod or ```json, or the header end). This helper
 * scans forward from the H1 to locate the first line that begins a fenced
 * code block, returning that line index — or `headerEnd` if no structural
 * block is found.
 *
 * @param sourceLines - All lines from the raw source
 * @param h1Line      - The 0-indexed line of the H1 heading
 * @param headerEnd   - The line where the first step's section begins
 * @returns The line index of the first structural block (or headerEnd)
 */
function findHeaderDescriptionEnd(
  sourceLines: string[],
  h1Line: number,
  headerEnd: number,
): number {
  for (let i = h1Line + 1; i < headerEnd; i++) {
    if (/^\s*```/.test(sourceLines[i])) return i;
  }
  return headerEnd;
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

  // ── Header section (everything before the first step) ──
  const headerEnd = stepBoundaries[0].start;
  if (headerEnd > 0) {
    const pipeDescChanged =
      pipe.originalPipeDescription !== undefined &&
      pipe.pipeDescription !== pipe.originalPipeDescription;

    if (pipeDescChanged) {
      // Splice in the new pipe-level description while preserving the H1
      // heading, schema blocks, config blocks, and other structural content.
      //
      // Strategy: find the H1 line, then locate the description region
      // (prose between H1 and the first structural block like ```zod).
      // Replace only that region with the new description text.
      let h1Line = -1;
      for (let i = 0; i < headerEnd; i++) {
        if (/^#\s/.test(sourceLines[i])) { h1Line = i; break; }
      }

      if (h1Line >= 0) {
        // Emit everything up to and including the H1 heading
        output.push(...sourceLines.slice(0, h1Line + 1));

        // Find where the description region ends (first ``` block or headerEnd)
        const descEnd = findHeaderDescriptionEnd(sourceLines, h1Line, headerEnd);

        // Emit new description (with surrounding blank lines for readability)
        output.push("");
        if (pipe.pipeDescription) {
          output.push(pipe.pipeDescription);
          output.push("");
        }

        // Emit structural content after the description region (schema, config, etc.)
        if (descEnd < headerEnd) {
          output.push(...sourceLines.slice(descEnd, headerEnd));
        }
      } else {
        // No H1 found — fall back to emitting header verbatim
        output.push(...sourceLines.slice(0, headerEnd));
      }
    } else {
      output.push(...sourceLines.slice(0, headerEnd));
    }
  }

  // ── Each step section ──
  // Each step is divided into four regions that can be independently spliced:
  //   Region 1: Heading line (sourceMap.headingLine)
  //   Region 2: Between heading and code block (description + DSL directives)
  //   Region 3: Code block (fence-open, code content, fence-close)
  //   Region 4: Trailing content (after code block to section end)
  for (let i = 0; i < pipe.steps.length; i++) {
    const step = pipe.steps[i];
    const { start, end } = stepBoundaries[i];
    const headingLine = step.sourceMap?.headingLine;
    const codeStart = step.sourceMap!.codeStartLine!;
    const codeEnd = step.sourceMap!.codeEndLine!;

    // Detect which fields have changed since parse time
    const nameChanged =
      step.originalName !== undefined && step.name !== step.originalName;
    const descChanged =
      step.originalDescription !== undefined
        ? step.description !== step.originalDescription
        // When originalDescription is undefined but description is now set,
        // a new description has been added (e.g., LLM generated one where
        // none existed before)
        : step.description !== undefined && step.description !== step.originalDescription;
    const codeChanged =
      step.originalCode !== undefined && step.code !== step.originalCode;

    // Fast path: nothing changed — copy entire section verbatim
    if (!nameChanged && !descChanged && !codeChanged) {
      output.push(...sourceLines.slice(start, end));
      continue;
    }

    // ── Region 1: Heading line ──
    if (headingLine !== undefined) {
      if (nameChanged) {
        // Replace the heading line with the new title, preserving the level
        const level = step.headingLevel || 2;
        output.push(`${"#".repeat(level)} ${step.name}`);
      } else {
        output.push(sourceLines[headingLine]);
      }

      // ── Region 2: Between heading and code block ──
      // This region may contain: blank lines, description prose, and DSL
      // directive list items (- check:, - and:, etc.). When the description
      // has changed, we replace all non-directive lines with the new text
      // while preserving directive lines in their original form.
      if (descChanged) {
        // Collect DSL directive lines from the original region — these must
        // be preserved regardless of description changes.
        const directives: string[] = [];
        for (let j = headingLine + 1; j < codeStart; j++) {
          if (isDSLDirective(sourceLines[j])) {
            directives.push(sourceLines[j]);
          }
        }

        // Emit the new description with clean formatting
        output.push("");
        if (step.description) {
          output.push(step.description);
          output.push("");
        }

        // Re-emit preserved DSL directives (these control conditional
        // execution and must survive description replacement)
        for (const d of directives) {
          output.push(d);
        }
      } else {
        // Description unchanged — emit original lines between heading and code
        output.push(...sourceLines.slice(headingLine + 1, codeStart));
      }
    } else {
      // No heading — emit everything from section start up to the code block
      output.push(...sourceLines.slice(start, codeStart));
    }

    // ── Region 3: Code block ──
    if (codeChanged) {
      // Emit the fence-open line verbatim (preserves language tag and indent)
      output.push(sourceLines[codeStart]);

      // Detect indentation from the original content lines (for list-indented blocks)
      const codeIndent = detectCodeIndent(sourceLines, codeStart, codeEnd, step.originalCode!);

      // Emit new code with proper indentation
      const newCodeLines = step.code.trimEnd().split("\n");
      for (const codeLine of newCodeLines) {
        output.push(codeIndent + codeLine);
      }

      // Emit fence-close line (codeEnd is exclusive, so codeEnd - 1 is the ``` line)
      output.push(sourceLines[codeEnd - 1]);

      // ── Region 4: Trailing content after code block ──
      output.push(...sourceLines.slice(codeEnd, end));
    } else {
      // Code unchanged — emit original code block and trailing content
      output.push(...sourceLines.slice(codeStart, end));
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

  // HTTP method guard — emit one directive per allowed method.
  // Ref: pdPipe/pdUtils.ts funcWrapper() for runtime evaluation
  for (const method of (config as Record<string, unknown>).methods as string[] || []) {
    directives.push(`method: ${method}`);
  }

  // Response content-type shorthand — supports names like "html", "json"
  // or raw MIME types like "image/png".
  // Ref: pdPipe/pdUtils.ts CONTENT_TYPE_MAP for shorthand resolution
  if ((config as Record<string, unknown>).contentType) {
    directives.push(`type: ${(config as Record<string, unknown>).contentType}`);
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
