import { assertEquals } from "@std/assert";
import { encodeVLQ, encodeSegment, buildLineMapping, generateSourceMap } from "./sourceMap.ts";
import type { Pipe, Step } from "./pipedown.d.ts";

// ── VLQ Encoding Tests ──
// Ref: https://sourcemaps.info/spec.html#base64-vlq
// These expected values are well-known VLQ encodings used across
// source map implementations.

Deno.test("encodeVLQ - zero encodes to 'A'", () => {
  // 0 → unsigned 0 → 5-bit group 0 → Base64 char 'A'
  assertEquals(encodeVLQ(0), "A");
});

Deno.test("encodeVLQ - positive integers", () => {
  // 1 → unsigned 2 → 5-bit group 2 → 'C'
  assertEquals(encodeVLQ(1), "C");
  // 5 → unsigned 10 → 5-bit group 10 → Base64[10] = 'K'
  assertEquals(encodeVLQ(5), "K");
  // 15 → unsigned 30 → needs two groups: (30 & 0x1f)=30 | 0x20=62='+'
  //                                       (30>>>5)=0 → but wait, 30 is 11110
  // Actually: 15 << 1 = 30. 30 in binary = 11110.
  // First digit: 11110 & 11111 = 11110 = 30. vlq >>>= 5 → 0. No continuation.
  // 30 → Base64 char at index 30 = 'e'
  assertEquals(encodeVLQ(15), "e");
});

Deno.test("encodeVLQ - negative integers", () => {
  // -1 → unsigned (1<<1)+1=3 → 5-bit group 3 → 'D'
  assertEquals(encodeVLQ(-1), "D");
});

Deno.test("encodeVLQ - larger values require multiple Base64 characters", () => {
  // 16 → unsigned 32 → binary 100000 → needs two 5-bit groups
  // First group: 00000 | 0x20 (continuation) = 100000 = 32 → 'g'
  // Second group: 1 → 'B'
  assertEquals(encodeVLQ(16), "gB");
});

Deno.test("encodeSegment - all zeros produces 'AAAA'", () => {
  // Each of the 4 fields is 0, and encodeVLQ(0) = 'A'
  assertEquals(encodeSegment(0, 0, 0, 0), "AAAA");
});

Deno.test("encodeSegment - source line delta of 5", () => {
  // genCol=0 → 'A', srcIdx=0 → 'A', srcLine=5 → 'K', srcCol=0 → 'A'
  assertEquals(encodeSegment(0, 0, 5, 0), "AAKA");
});

// ── buildLineMapping Tests ──

/**
 * Helper to create a minimal Step with sourceMap for testing.
 *
 * @param funcName       - The sanitized function name (matches generated code)
 * @param code           - The raw code content from the markdown code block
 * @param codeStartLine  - 0-indexed markdown line of the opening fence
 * @param codeEndLine    - 0-indexed exclusive line after the closing fence
 * @param headingLine    - 0-indexed markdown line of the heading
 * @returns A Step object with the relevant fields populated
 */
function makeStep(
  funcName: string,
  code: string,
  codeStartLine: number,
  codeEndLine: number,
  headingLine: number,
): Step {
  return {
    code,
    range: [0, 0],
    name: funcName,
    funcName,
    inList: false,
    language: "ts",
    sourceMap: { codeStartLine, codeEndLine, headingLine },
  };
}

Deno.test("buildLineMapping - maps function declaration to heading line", () => {
  const step = makeStep(
    "MyStep",
    "const x = 1;\n",
    // Markdown: heading at line 10, fence at line 12, code at line 13
    12, 15, 10,
  );

  const script = [
    "// boilerplate",
    'import Pipe from "jsr:@pd/pdpipe";',
    "",
    "export async function MyStep (input, opts) {",
    "    const x = 1;",
    "}",
  ];

  const mapping = buildLineMapping(script, [step]);

  // Function declaration (line 3) → heading line (10)
  assertEquals(mapping.get(3), 10);
  // Body line (line 4) → markdown content line 13 (codeStartLine 12 + 1)
  assertEquals(mapping.get(4), 13);
  // Boilerplate lines should not be mapped
  assertEquals(mapping.has(0), false);
  assertEquals(mapping.has(1), false);
});

Deno.test("buildLineMapping - skips import lines in step code", () => {
  const code = `import { foo } from "bar";
const x = foo();
const y = x + 1;
`;
  const step = makeStep("ImportStep", code, 20, 25, 18);

  const script = [
    "// boilerplate",
    'import { foo } from "bar";',
    "",
    "export async function ImportStep (input, opts) {",
    // Note: the import line is stripped from the body, so only
    // the non-import lines appear here
    "    const x = foo();",
    "    const y = x + 1;",
    "}",
  ];

  const mapping = buildLineMapping(script, [step]);

  // Function declaration (line 3) → heading (18)
  assertEquals(mapping.get(3), 18);
  // First body line (line 4) maps to md line 22 (not 21), because the
  // import at md line 21 was skipped in the generated body
  assertEquals(mapping.get(4), 22);
  // Second body line (line 5) → md line 23
  assertEquals(mapping.get(5), 23);
});

Deno.test("buildLineMapping - multiple steps", () => {
  const step1 = makeStep("StepA", "const a = 1;\n", 5, 8, 3);
  const step2 = makeStep("StepB", "const b = 2;\n", 15, 18, 13);

  const script = [
    "// boilerplate",
    "",
    "export async function StepA (input, opts) {",
    "    const a = 1;",
    "}",
    "export async function StepB (input, opts) {",
    "    const b = 2;",
    "}",
  ];

  const mapping = buildLineMapping(script, [step1, step2]);

  // Step A: declaration (line 2) → heading 3, body (line 3) → md line 6
  assertEquals(mapping.get(2), 3);
  assertEquals(mapping.get(3), 6);
  // Step B: declaration (line 5) → heading 13, body (line 6) → md line 16
  assertEquals(mapping.get(5), 13);
  assertEquals(mapping.get(6), 16);
});

Deno.test("buildLineMapping - step without sourceMap is skipped", () => {
  const step: Step = {
    code: "const x = 1;\n",
    range: [0, 0],
    name: "NoMap",
    funcName: "NoMap",
    inList: false,
    // No sourceMap at all
  };

  const script = [
    "export async function NoMap (input, opts) {",
    "    const x = 1;",
    "}",
  ];

  const mapping = buildLineMapping(script, [step]);
  assertEquals(mapping.size, 0);
});

// ── generateSourceMap Tests ──

/**
 * Helper to create a minimal Pipe with steps for testing.
 */
function makePipe(steps: Step[], mdPath = "/project/pipe.md"): Pipe {
  return {
    name: "TestPipe",
    cleanName: "TestPipe",
    steps,
    mdPath,
    dir: "/project/.pd/TestPipe",
    absoluteDir: "/project/.pd/TestPipe",
    fileName: "TestPipe",
    rawSource: "# TestPipe\n\n## Step\n\n```ts\nconst x = 1;\n```\n",
  };
}

Deno.test("generateSourceMap - produces valid V3 JSON", () => {
  const step = makeStep("MyStep", "const x = 1;\n", 4, 7, 2);
  const pipe = makePipe([step]);

  const script = [
    "// deno-lint-ignore-file",
    'import Pipe from "jsr:@pd/pdpipe";',
    "",
    "export async function MyStep (input, opts) {",
    "    const x = 1;",
    "}",
    "",
  ].join("\n");

  const result = generateSourceMap(script, pipe);
  const parsed = JSON.parse(result);

  assertEquals(parsed.version, 3);
  assertEquals(parsed.file, "index.ts");
  // Source path should be relative from .pd/TestPipe/ to /project/pipe.md
  assertEquals(parsed.sources.length, 1);
  assertEquals(typeof parsed.sources[0], "string");
  // sourcesContent should embed the raw markdown
  assertEquals(parsed.sourcesContent[0], pipe.rawSource);
  assertEquals(parsed.names.length, 0);
  // mappings should be a semicolon-separated string
  assertEquals(typeof parsed.mappings, "string");
  // There should be as many semicolons as (lines - 1)
  const lineCount = script.split("\n").length;
  const semiCount = (parsed.mappings.match(/;/g) || []).length;
  assertEquals(semiCount, lineCount - 1);
});

Deno.test("generateSourceMap - returns empty string when no steps have sourceMap", () => {
  const step: Step = {
    code: "const x = 1;\n",
    range: [0, 0],
    name: "NoMap",
    funcName: "NoMap",
    inList: false,
  };
  const pipe = makePipe([step]);
  const script = "export async function NoMap (input, opts) {\n    const x = 1;\n}\n";

  const result = generateSourceMap(script, pipe);
  assertEquals(result, "");
});

Deno.test("generateSourceMap - mappings string has correct structure", () => {
  // A simple 1-step pipe: heading at md line 2, fence at md line 4,
  // so code content starts at md line 5
  const step = makeStep("Hello", "console.log('hi');\n", 4, 7, 2);
  const pipe = makePipe([step]);

  const script = [
    "// lint",           // line 0 — unmapped
    'import Pipe from "jsr:@pd/pdpipe";', // line 1 — unmapped
    "",                  // line 2 — unmapped
    "export async function Hello (input, opts) {", // line 3 → md line 2
    "    console.log('hi');",                       // line 4 → md line 5
    "}",                 // line 5 — unmapped
  ].join("\n");

  const result = generateSourceMap(script, pipe);
  const parsed = JSON.parse(result);
  const segments = parsed.mappings.split(";");

  // Lines 0, 1, 2 should be unmapped (empty segments)
  assertEquals(segments[0], "");
  assertEquals(segments[1], "");
  assertEquals(segments[2], "");
  // Line 3 should be mapped (non-empty segment)
  assertEquals(segments[3].length > 0, true);
  // Line 4 should be mapped (non-empty segment)
  assertEquals(segments[4].length > 0, true);
  // Line 5 should be unmapped
  assertEquals(segments[5], "");
});
