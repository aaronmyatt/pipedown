import type { Pipe, Step } from "./pipedown.d.ts";
import { std } from "./deps.ts";

// ── VLQ Encoding ──
// Source Map V3 uses Base64-VLQ to encode position deltas compactly.
// Each integer is broken into 5-bit groups, with bit 5 as a continuation
// flag. The least significant group carries the sign in bit 0.
// Ref: https://sourcemaps.info/spec.html#base64-vlq

const BASE64_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/**
 * Encode a signed integer as a Base64-VLQ string.
 *
 * VLQ uses variable-length encoding: each 5-bit group is mapped to a
 * Base64 character. Bit 5 (0x20) is the continuation flag — set on every
 * group except the last. The first group encodes the sign in bit 0.
 *
 * Ref: https://en.wikipedia.org/wiki/Variable-length_quantity
 *
 * @param value - The signed integer to encode
 * @returns The VLQ-encoded string (1+ Base64 characters)
 */
export function encodeVLQ(value: number): string {
  // Convert signed value to an unsigned representation where bit 0 is the
  // sign bit (0 = positive, 1 = negative). This lets us encode negatives
  // without a separate sign indicator.
  let vlq = value < 0 ? ((-value) << 1) + 1 : (value << 1);

  let encoded = "";
  do {
    // Extract the lowest 5 bits as this digit's payload
    let digit = vlq & 0x1f;
    vlq >>>= 5;
    // If more digits remain, set the continuation bit (bit 5)
    if (vlq > 0) digit |= 0x20;
    encoded += BASE64_CHARS[digit];
  } while (vlq > 0);

  return encoded;
}

/**
 * Encode a single source map segment (one mapping entry on a generated line).
 *
 * Source Map V3 segments contain 1, 4, or 5 VLQ-encoded fields. We always
 * emit 4 fields (no name index): [genColumn, sourceIndex, sourceLine, sourceColumn].
 * All values are deltas relative to the previous segment's state.
 *
 * Ref: https://sourcemaps.info/spec.html#mappings-structure
 *
 * @param genColumn    - Column delta in the generated file (always 0 for us)
 * @param sourceIndex  - Source file index delta (always 0 — single source)
 * @param sourceLine   - Source line delta (relative to last mapped source line)
 * @param sourceColumn - Source column delta (always 0 for line-level mapping)
 * @returns VLQ-encoded segment string
 */
export function encodeSegment(
  genColumn: number,
  sourceIndex: number,
  sourceLine: number,
  sourceColumn: number,
): string {
  return encodeVLQ(genColumn) +
    encodeVLQ(sourceIndex) +
    encodeVLQ(sourceLine) +
    encodeVLQ(sourceColumn);
}

// Regex matching single-line import statements — same pattern used by
// pipeToScript.ts to hoist imports from step code to the module header.
//
// We intentionally keep this broad (`import.*from.*`) to preserve historical
// behavior where even commented import lines are treated as hoist candidates.
// The regex is non-global so repeated `.test()` calls are stateless.
const detectImportLine = /import.*from.*/;

/**
 * Detect whether a step code line is treated as a hoisted import.
 *
 * This helper centralizes the rule shared by script generation and source-map
 * generation so both phases make *identical* include/exclude decisions.
 * Keeping those rules in lock-step prevents mapping drift.
 *
 * Ref: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/import
 *
 * @param codeLine - One line from a markdown step code block
 * @returns True when the line is treated as a hoisted import line
 */
export function isHoistedImportLine(codeLine: string): boolean {
  return detectImportLine.test(codeLine.trim());
}

/**
 * Remove hoisted import lines from a step code block.
 *
 * The generated step function body should not contain the original import
 * lines once those imports have been moved to the module header. We remove
 * the full line (not just the matched substring) so we do not leave behind
 * blank placeholder lines that would shift runtime line numbers.
 *
 * Ref: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/split
 *
 * @param stepCode - Raw code from the markdown fenced block
 * @returns Step code with hoisted import lines removed
 */
export function stripHoistedImportsFromStepCode(stepCode: string): string {
  return stepCode
    .split("\n")
    .filter((line) => !isHoistedImportLine(line))
    .join("\n");
}

/**
 * Build a mapping from generated line numbers to markdown source lines.
 *
 * Walks the generated script to find each `export async function <funcName>`
 * block, then maps its declaration line to the step's heading line and each
 * body line to the corresponding markdown code block line (skipping lines
 * that were hoisted imports).
 *
 * @param scriptLines - The generated index.ts split into lines
 * @param steps       - Steps with sourceMap data from markdown parsing
 * @returns Map from 0-indexed generated line number → 0-indexed markdown line number
 */
export function buildLineMapping(
  scriptLines: string[],
  steps: Step[],
): Map<number, number> {
  const mapping = new Map<number, number>();

  for (const step of steps) {
    // Steps without sourceMap data (e.g. extracted sub-pipes) can't be mapped
    if (!step.sourceMap || step.sourceMap.codeStartLine == null) continue;

    // Find the generated line that declares this step's function.
    // The format is: `export async function <funcName> (input, opts) {`
    const funcDeclPrefix = `export async function ${step.funcName} `;
    const genDeclLine = scriptLines.findIndex((line) =>
      line.startsWith(funcDeclPrefix)
    );
    if (genDeclLine === -1) continue;

    // Map the function declaration to the heading line in markdown
    if (step.sourceMap.headingLine != null) {
      mapping.set(genDeclLine, step.sourceMap.headingLine);
    }

    // The code content in the markdown starts on the line after the
    // opening fence (```). codeStartLine is the fence line itself.
    const mdContentStart = step.sourceMap.codeStartLine + 1;

    // Split the step's original code into lines and walk through them,
    // tracking which markdown source line each corresponds to.
    //
    // Import lines are hoisted to the module header and removed from the
    // generated function body. We therefore advance markdown line counters for
    // those lines, but we do not allocate generated-body line mappings for
    // them. This keeps generated-line and markdown-line progression aligned.
    //
    // markdown-it token.content always ends with a trailing newline, which
    // produces an empty string when split. Drop it so we don't generate a
    // spurious mapping for the closing fence line.
    const codeLines = step.code.split("\n");
    if (codeLines.length > 0 && codeLines[codeLines.length - 1] === "") {
      codeLines.pop();
    }

    let mdLine = mdContentStart;
    // genBodyLine starts on the line after the function declaration
    // (which itself has a 4-space indent prefix in the generated output)
    let genBodyLine = genDeclLine + 1;

    for (const codeLine of codeLines) {
      if (isHoistedImportLine(codeLine)) {
        mdLine++;
        continue;
      }

      mapping.set(genBodyLine, mdLine);
      genBodyLine++;
      mdLine++;
    }
  }

  return mapping;
}

// ── Source Map Decoding / Composition Helpers ──
// Deno executes transpiled JavaScript for .ts modules. When an external map is
// attached to a TypeScript file, V8 stack traces use *runtime JS* line numbers.
// We therefore compose:
//   runtime JS line -> generated TS line -> markdown line.
//
// Ref: https://docs.deno.com/runtime/fundamentals/debugging/
// Ref: https://sourcemaps.info/spec.html#mappings-structure

/**
 * Decode one Base64-VLQ value from a segment string.
 *
 * Ref: https://sourcemaps.info/spec.html#base64-vlq
 *
 * @param encoded - The segment string being decoded
 * @param start   - Start index within `encoded`
 * @returns Decoded signed value and the next unread index
 */
function decodeVLQ(
  encoded: string,
  start: number,
): { value: number; nextIndex: number } {
  let result = 0;
  let shift = 0;
  let index = start;
  let continuation = false;

  do {
    const char = encoded[index++];
    const charIndex = BASE64_CHARS.indexOf(char);
    if (charIndex < 0) {
      throw new Error(`Invalid Base64-VLQ character: ${char}`);
    }

    continuation = (charIndex & 0x20) !== 0;
    const digit = charIndex & 0x1f;
    result += digit << shift;
    shift += 5;
  } while (continuation);

  const isNegative = (result & 1) === 1;
  const value = result >> 1;
  return { value: isNegative ? -value : value, nextIndex: index };
}

/**
 * Build a generated-line → source-line mapping from a Source Map V3 JSON.
 *
 * We keep the first source-bearing segment on each generated line. For runtime
 * stack traces this is sufficient because we emit line-level markdown mappings
 * (column 0 only) and only need stable line correspondence.
 *
 * Ref: https://sourcemaps.info/spec.html#mappings-structure
 *
 * @param sourceMapJSON       - The V3 source map JSON string to decode
 * @param expectedSourceIndex - Optional source index to include (default 0)
 * @returns Map from 0-indexed generated line number → 0-indexed source line
 */
export function buildGeneratedToSourceLineMappingFromSourceMap(
  sourceMapJSON: string,
  expectedSourceIndex = 0,
): Map<number, number> {
  const parsed = JSON.parse(sourceMapJSON) as { mappings: string };
  const generatedToSource = new Map<number, number>();

  let previousSourceIndex = 0;
  let previousSourceLine = 0;

  const generatedLines = parsed.mappings.split(";");

  for (
    let generatedLine = 0;
    generatedLine < generatedLines.length;
    generatedLine++
  ) {
    const lineSegments = generatedLines[generatedLine];
    if (!lineSegments) continue;

    for (const segment of lineSegments.split(",")) {
      if (!segment) continue;

      let cursor = 0;

      // Field 1: generated column delta (always present)
      const generatedColumnDecoded = decodeVLQ(segment, cursor);
      cursor = generatedColumnDecoded.nextIndex;

      // 1-field segments have no source info (unmapped segment)
      if (cursor >= segment.length) continue;

      // Fields 2-4: source index, source line, source column (all deltas)
      const sourceIndexDecoded = decodeVLQ(segment, cursor);
      previousSourceIndex += sourceIndexDecoded.value;
      cursor = sourceIndexDecoded.nextIndex;

      const sourceLineDecoded = decodeVLQ(segment, cursor);
      previousSourceLine += sourceLineDecoded.value;
      cursor = sourceLineDecoded.nextIndex;

      const sourceColumnDecoded = decodeVLQ(segment, cursor);
      cursor = sourceColumnDecoded.nextIndex;

      // Field 5 (name index) is optional and irrelevant for line mapping.
      if (cursor < segment.length) {
        const nameDecoded = decodeVLQ(segment, cursor);
        cursor = nameDecoded.nextIndex;
      }

      // Keep the first source-bearing segment for the line.
      if (
        previousSourceIndex === expectedSourceIndex &&
        !generatedToSource.has(generatedLine)
      ) {
        generatedToSource.set(generatedLine, previousSourceLine);
      }
    }
  }

  return generatedToSource;
}

/**
 * Generate a runtime-accurate source map for Deno TypeScript execution.
 *
 * Deno stack traces for `.ts` modules are reported using transpiled JavaScript
 * line numbers. To map those back to markdown lines, we compose:
 *
 *   transpiled JS line -> generated TS line -> markdown line
 *
 * The final emitted map still references the markdown source only, preserving
 * the existing contract that framework/template boilerplate remains unmapped.
 *
 * Ref: https://docs.deno.com/runtime/fundamentals/debugging/
 * Ref: https://sourcemaps.info/spec.html
 *
 * @param script                  - Generated TypeScript source (`index.ts`)
 * @param transpiledScript        - Transpiled JavaScript produced from script
 * @param transpiledSourceMapJSON - Source map from transpiled JS -> TS
 * @param pipe                    - Pipe metadata and markdown source
 * @returns JSON string of a V3 map for runtime JS lines -> markdown lines
 */
export function generateRuntimeSourceMap(
  script: string,
  transpiledScript: string,
  transpiledSourceMapJSON: string,
  pipe: Pipe,
): string {
  const tsLineToMarkdown = buildLineMapping(script.split("\n"), pipe.steps);
  if (tsLineToMarkdown.size === 0) return "";

  const runtimeLineToTsLine = buildGeneratedToSourceLineMappingFromSourceMap(
    transpiledSourceMapJSON,
    0,
  );

  const runtimeLineToMarkdown = new Map<number, number>();
  for (const [runtimeLine, tsLine] of runtimeLineToTsLine.entries()) {
    const markdownLine = tsLineToMarkdown.get(tsLine);
    if (markdownLine != null) {
      runtimeLineToMarkdown.set(runtimeLine, markdownLine);
    }
  }

  if (runtimeLineToMarkdown.size === 0) return "";

  const sourcePath = std.relative(pipe.absoluteDir || pipe.dir, pipe.mdPath);
  const runtimeLines = transpiledScript.split("\n");

  let lastSourceLine = 0;
  const mappingParts: string[] = [];

  for (let runtimeLine = 0; runtimeLine < runtimeLines.length; runtimeLine++) {
    const sourceLine = runtimeLineToMarkdown.get(runtimeLine);
    if (sourceLine != null) {
      const sourceLineDelta = sourceLine - lastSourceLine;
      mappingParts.push(encodeSegment(0, 0, sourceLineDelta, 0));
      lastSourceLine = sourceLine;
    } else {
      mappingParts.push("");
    }
  }

  const sourceMap = {
    version: 3,
    file: "index.ts",
    sources: [sourcePath],
    sourcesContent: [pipe.rawSource ?? null],
    names: [],
    mappings: mappingParts.join(";"),
  };

  return JSON.stringify(sourceMap);
}

/**
 * Generate a V3 source map JSON string for a generated index.ts script.
 *
 * The source map maps lines in the generated TypeScript back to their
 * origin lines in the markdown (.md) source file. This lets Deno rewrite
 * stack traces to point at the markdown code blocks where the developer
 * actually authored the code.
 *
 * Ref: https://sourcemaps.info/spec.html (Source Map V3 specification)
 * Ref: https://docs.deno.com/runtime/fundamentals/debugging/ (Deno source map support)
 *
 * @param script - The full generated index.ts content
 * @param pipe   - The Pipe object with steps, mdPath, and rawSource
 * @returns JSON string of the V3 source map, or empty string if no mappings possible
 */
export function generateSourceMap(script: string, pipe: Pipe): string {
  const scriptLines = script.split("\n");
  const lineMapping = buildLineMapping(scriptLines, pipe.steps);

  // If no lines could be mapped, skip source map generation entirely
  if (lineMapping.size === 0) return "";

  // Compute the relative path from the .pd/<pipe>/ output directory back
  // to the source .md file. This is what Deno resolves when reading the
  // source map at runtime.
  const sourcePath = std.relative(pipe.absoluteDir || pipe.dir, pipe.mdPath);

  // ── Build the V3 mappings string ──
  // Each generated line gets a semicolon-separated entry. Mapped lines get
  // a 4-field VLQ segment [genCol=0, srcIdx=0, srcLine=delta, srcCol=0].
  // Unmapped lines are empty (just the semicolon separator).
  //
  // VLQ fields are deltas from the previous segment's values, so we track
  // the last emitted source line to compute the delta for each new mapping.
  let lastSourceLine = 0;
  const mappingParts: string[] = [];

  for (let genLine = 0; genLine < scriptLines.length; genLine++) {
    const sourceLine = lineMapping.get(genLine);
    if (sourceLine != null) {
      const sourceLineDelta = sourceLine - lastSourceLine;
      // Segment: genColumn=0, sourceIndex=0, sourceLine=delta, sourceColumn=0
      mappingParts.push(encodeSegment(0, 0, sourceLineDelta, 0));
      lastSourceLine = sourceLine;
    } else {
      // No mapping for this generated line — empty entry
      mappingParts.push("");
    }
  }

  // The V3 source map object.
  // Ref: https://sourcemaps.info/spec.html#h-source-map-format
  const sourceMap = {
    version: 3,
    // The generated file this map applies to
    file: "index.ts",
    // Source files referenced by the mappings (just the one .md file)
    sources: [sourcePath],
    // Embed the original markdown so the source map is self-contained —
    // tools and debuggers can show the source even if the .md isn't
    // accessible from the .pd/ directory.
    sourcesContent: [pipe.rawSource ?? null],
    // No symbol names needed for line-level mapping
    names: [],
    // Semicolon-separated VLQ-encoded line mappings
    mappings: mappingParts.join(";"),
  };

  return JSON.stringify(sourceMap);
}
