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
const detectImports = /import.*from.*/gm;

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
    // tracking which markdown source line each corresponds to. Lines that
    // match the import regex were hoisted to the module header by
    // pipeToScript and stripped from the function body — we advance the
    // source line counter but don't emit a mapping for them in the body.
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
      if (detectImports.test(codeLine.trim())) {
        // Reset lastIndex because we use the `g` flag — without this,
        // alternating test() calls on different strings can skip matches.
        // Ref: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp/lastIndex
        detectImports.lastIndex = 0;
        mdLine++;
        continue;
      }
      // Reset lastIndex for the same reason as above
      detectImports.lastIndex = 0;

      mapping.set(genBodyLine, mdLine);
      genBodyLine++;
      mdLine++;
    }
  }

  return mapping;
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
