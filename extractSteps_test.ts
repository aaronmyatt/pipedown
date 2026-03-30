import { assertEquals, assertThrows } from "jsr:@std/assert";
import {
  toKebabCase,
  toCamelCase,
  parseStepIndices,
  buildExtractedPipe,
  buildReplacementStep,
  performExtraction,
} from "./extractSteps.ts";
import type { Pipe, Step } from "./pipedown.d.ts";

// ── Test helpers ────────────────────────────────────────────────────────────

/**
 * Build a minimal Pipe with a given number of stub steps.
 * Each step has a name like "Step 0", "Step 1", etc., with
 * sourceMap / original* fields set so we can verify they get stripped.
 *
 * @param count - Number of steps to generate
 * @returns A Pipe object suitable for extraction tests
 */
function makePipe(count: number): Pipe {
  const steps: Step[] = Array.from({ length: count }, (_, i) => ({
    name: "Step " + i,
    funcName: "Step" + i,
    code: "input.s" + i + " = true;",
    range: [i * 10, i * 10 + 5],
    inList: false,
    language: "ts",
    headingLevel: 2,
    description: "Description for step " + i,
    // Source-mapping fields that should be stripped during extraction
    // Ref: extractSteps.ts line 169-174 — these are parent-specific metadata
    sourceMap: { headingLine: i * 5, codeStartLine: i * 5 + 2, codeEndLine: i * 5 + 4 },
    originalCode: "input.s" + i + " = true;",
    originalName: "Step " + i,
    originalDescription: "Description for step " + i,
  }));

  return {
    name: "Parent Pipe",
    cleanName: "ParentPipe",
    steps,
    mdPath: "/test/parent.md",
    dir: ".pd/ParentPipe",
    absoluteDir: "/test/.pd/ParentPipe",
    fileName: "parent-pipe",
    pipeDescription: "A test parent pipe.",
    rawSource: "# Parent Pipe\n\nA test parent pipe.\n\n## Step 0\n\n```ts\ninput.s0 = true;\n```\n",
  };
}

/**
 * Build a step with conditional config for testing findFirstCheck behavior.
 *
 * @param config - Partial StepConfig overrides
 * @returns A Step with the given config applied
 */
function makeStepWithConfig(config: Step["config"]): Step {
  return {
    name: "Guarded Step",
    funcName: "GuardedStep",
    code: "input.x = 1;",
    range: [],
    inList: true,
    config,
  };
}

// ── toKebabCase ─────────────────────────────────────────────────────────────
// Ref: extractSteps.ts line 33 — converts names to file-safe kebab-case

Deno.test("toKebabCase", async (t) => {
  await t.step("converts camelCase to kebab-case", () => {
    assertEquals(toKebabCase("fetchData"), "fetch-data");
  });

  await t.step("converts PascalCase to kebab-case", () => {
    assertEquals(toKebabCase("MyModule"), "my-module");
  });

  await t.step("converts spaces to hyphens", () => {
    assertEquals(toKebabCase("My Module"), "my-module");
  });

  await t.step("handles mixed separators", () => {
    // Underscores and special chars become hyphens
    assertEquals(toKebabCase("my_cool Module"), "my-cool-module");
  });

  await t.step("trims leading and trailing hyphens", () => {
    assertEquals(toKebabCase("--hello--"), "hello");
  });

  await t.step("handles single word", () => {
    assertEquals(toKebabCase("simple"), "simple");
  });

  await t.step("handles empty string", () => {
    assertEquals(toKebabCase(""), "");
  });

  await t.step("collapses consecutive non-alphanumeric chars", () => {
    assertEquals(toKebabCase("a---b___c"), "a-b-c");
  });
});

// ── toCamelCase ─────────────────────────────────────────────────────────────
// Ref: extractSteps.ts line 57 — uses sanitizeString (PascalCase) then
// lowercases the first character

Deno.test("toCamelCase", async (t) => {
  await t.step("converts spaced name to camelCase", () => {
    assertEquals(toCamelCase("My Module"), "myModule");
  });

  await t.step("converts kebab-case to camelCase", () => {
    // sanitizeString strips hyphens and joins, then first char lowered
    assertEquals(toCamelCase("fetch-data"), "fetchdata");
  });

  await t.step("lowercases first character of single word", () => {
    assertEquals(toCamelCase("Simple"), "simple");
  });

  await t.step("handles already-camelCase input", () => {
    assertEquals(toCamelCase("fetchData"), "fetchData");
  });

  await t.step("returns empty string for empty input", () => {
    assertEquals(toCamelCase(""), "");
  });

  await t.step("returns empty string for all-special input", () => {
    // sanitizeString("!@#") → "", so toCamelCase returns ""
    assertEquals(toCamelCase("!@#"), "");
  });
});

// ── parseStepIndices ────────────────────────────────────────────────────────
// Ref: extractSteps.ts line 81 — parses "1", "2-5", "1,3,5", "0,2-4,6"

Deno.test("parseStepIndices", async (t) => {
  await t.step("parses single index", () => {
    assertEquals(parseStepIndices("2", 5), [2]);
  });

  await t.step("parses inclusive range", () => {
    // "2-5" should produce [2, 3, 4, 5]
    assertEquals(parseStepIndices("2-5", 5), [2, 3, 4, 5]);
  });

  await t.step("parses comma-separated indices", () => {
    assertEquals(parseStepIndices("1,3,5", 5), [1, 3, 5]);
  });

  await t.step("parses mixed ranges and singles", () => {
    assertEquals(parseStepIndices("0,2-4,6", 6), [0, 2, 3, 4, 6]);
  });

  await t.step("deduplicates overlapping indices", () => {
    // "1-3,2-4" produces {1,2,3,4} — no duplicates
    assertEquals(parseStepIndices("1-3,2-4", 4), [1, 2, 3, 4]);
  });

  await t.step("returns sorted output", () => {
    assertEquals(parseStepIndices("5,1,3", 5), [1, 3, 5]);
  });

  await t.step("handles zero index", () => {
    assertEquals(parseStepIndices("0", 3), [0]);
  });

  await t.step("handles whitespace in spec", () => {
    // Segments are trimmed before parsing
    assertEquals(parseStepIndices(" 1 , 3 ", 3), [1, 3]);
  });

  // ── Error cases ──

  await t.step("throws on empty spec", () => {
    assertThrows(
      () => parseStepIndices("", 5),
      Error,
      "cannot be empty",
    );
  });

  await t.step("throws on whitespace-only spec", () => {
    assertThrows(
      () => parseStepIndices("   ", 5),
      Error,
      "cannot be empty",
    );
  });

  await t.step("throws on non-numeric segment", () => {
    assertThrows(
      () => parseStepIndices("abc", 5),
      Error,
      "Must be an integer",
    );
  });

  await t.step("throws on invalid range format", () => {
    assertThrows(
      () => parseStepIndices("a-b", 5),
      Error,
      "must be integers",
    );
  });

  await t.step("throws on reversed range (start > end)", () => {
    assertThrows(
      () => parseStepIndices("5-2", 5),
      Error,
      "must be <= end",
    );
  });

  await t.step("throws on out-of-bounds index", () => {
    assertThrows(
      () => parseStepIndices("10", 5),
      Error,
      "out of range",
    );
  });

  await t.step("throws on negative index", () => {
    assertThrows(
      () => parseStepIndices("-1", 5),
      Error,
    );
  });
});

// ── buildExtractedPipe ──────────────────────────────────────────────────────
// Ref: extractSteps.ts line 153 — builds a new Pipe from selected parent steps

Deno.test("buildExtractedPipe", async (t) => {
  await t.step("creates pipe with correct name and cleanName", () => {
    const parent = makePipe(3);
    const result = buildExtractedPipe(parent, [0, 1], "Auth Module");

    assertEquals(result.name, "Auth Module");
    // sanitizeString("Auth Module") → "AuthModule"
    assertEquals(result.cleanName, "AuthModule");
  });

  await t.step("uses toKebabCase for fileName", () => {
    const parent = makePipe(3);
    const result = buildExtractedPipe(parent, [0], "Auth Module");

    assertEquals(result.fileName, "auth-module");
  });

  await t.step("extracts only the specified steps", () => {
    const parent = makePipe(5);
    const result = buildExtractedPipe(parent, [1, 3], "Sub Pipe");

    assertEquals(result.steps.length, 2);
    assertEquals(result.steps[0].name, "Step 1");
    assertEquals(result.steps[1].name, "Step 3");
  });

  await t.step("deep-clones steps (no shared references with parent)", () => {
    const parent = makePipe(2);
    const result = buildExtractedPipe(parent, [0], "Clone Test");

    // Mutating the extracted step should not affect the parent
    result.steps[0].name = "MUTATED";
    assertEquals(parent.steps[0].name, "Step 0");
  });

  await t.step("strips sourceMap from extracted steps", () => {
    const parent = makePipe(2);
    const result = buildExtractedPipe(parent, [0, 1], "Stripped");

    for (const step of result.steps) {
      assertEquals(step.sourceMap, undefined);
    }
  });

  await t.step("strips original* fields from extracted steps", () => {
    const parent = makePipe(2);
    const result = buildExtractedPipe(parent, [0], "Stripped");

    assertEquals(result.steps[0].originalCode, undefined);
    assertEquals(result.steps[0].originalName, undefined);
    assertEquals(result.steps[0].originalDescription, undefined);
  });

  await t.step("clears range to empty array", () => {
    const parent = makePipe(2);
    const result = buildExtractedPipe(parent, [0], "Range Test");

    assertEquals(result.steps[0].range, []);
  });

  await t.step("sets pipeDescription referencing parent name", () => {
    const parent = makePipe(1);
    const result = buildExtractedPipe(parent, [0], "Child");

    assertEquals(result.pipeDescription, "Extracted from Parent Pipe.");
  });

  await t.step("has no rawSource (forces lossy reconstruction path)", () => {
    const parent = makePipe(2);
    const result = buildExtractedPipe(parent, [0], "No Raw");

    // rawSource should be undefined so pipeToMarkdown uses reconstructFromFields
    assertEquals(result.rawSource, undefined);
  });

  await t.step("sets empty mdPath and dir", () => {
    const parent = makePipe(1);
    const result = buildExtractedPipe(parent, [0], "Empty Paths");

    assertEquals(result.mdPath, "");
    assertEquals(result.dir, "");
    assertEquals(result.absoluteDir, "");
  });
});

// ── buildReplacementStep ────────────────────────────────────────────────────
// Ref: extractSteps.ts line 242 — constructs the delegation step for the parent

Deno.test("buildReplacementStep", async (t) => {
  await t.step("generates correct import and process code", () => {
    const step = buildReplacementStep("Auth Module", []);

    // The code should import the sub-pipe and call process
    // Ref: extractSteps.ts line 252-254
    const lines = step.code.split("\n");
    assertEquals(lines[0], 'import { pipe as authModulePipe } from "./auth-module/index.ts";');
    assertEquals(lines[1], "input.authModule = await authModulePipe.process(input);");
  });

  await t.step("uses camelCase for variable names", () => {
    const step = buildReplacementStep("Data Fetcher", []);

    assertEquals(step.code.includes("dataFetcherPipe"), true);
    assertEquals(step.code.includes("input.dataFetcher"), true);
  });

  await t.step("uses kebab-case for import path", () => {
    const step = buildReplacementStep("Data Fetcher", []);

    assertEquals(step.code.includes("./data-fetcher/index.ts"), true);
  });

  await t.step("sets inList to true for DSL directive rendering", () => {
    const step = buildReplacementStep("Test", []);

    // inList must be true so the "- check:" directive renders in markdown
    assertEquals(step.inList, true);
  });

  await t.step("uses first check from extracted steps when available", () => {
    const stepsWithCheck = [
      makeStepWithConfig({ checks: ["/isReady"] }),
    ];
    const step = buildReplacementStep("Guarded", stepsWithCheck);

    // Should reuse the existing check, not create a new one
    assertEquals(step.config?.checks, ["/isReady"]);
  });

  await t.step("prefers check over and/or directives", () => {
    const stepsWithAnd = [
      makeStepWithConfig({ and: ["/flagA", "/flagB"] }),
    ];
    const step = buildReplacementStep("AndGuard", stepsWithAnd);

    // findFirstCheck scans checks first, then and, then or
    // Since checks is empty, it should fall through to and[0]
    assertEquals(step.config?.checks, ["/flagA"]);
  });

  await t.step("falls back to camelName flag when no checks exist", () => {
    const noChecks = [
      makeStepWithConfig({ checks: [], and: [], or: [] }),
    ];
    const step = buildReplacementStep("My Module", noChecks);

    // Default gate: "/myModule" derived from camelCase name
    assertEquals(step.config?.checks, ["/myModule"]);
  });

  await t.step("sets correct step metadata", () => {
    const step = buildReplacementStep("Auth Module", []);

    assertEquals(step.name, "Auth Module");
    assertEquals(step.funcName, "AuthModule");
    assertEquals(step.headingLevel, 2);
    assertEquals(step.language, "ts");
    assertEquals(step.range, []);
  });

  await t.step("includes descriptive description", () => {
    const step = buildReplacementStep("Auth Module", []);

    assertEquals(step.description, "Run the extracted Auth Module sub-pipeline.");
  });
});

// ── performExtraction (integration) ─────────────────────────────────────────
// Ref: extractSteps.ts line 302 — full extraction orchestrator

Deno.test("performExtraction", async (t) => {
  await t.step("returns markdown for both new pipe and modified parent", () => {
    const parent = makePipe(3);
    const result = performExtraction(parent, [1], "Extracted Step");

    // Both should be non-empty markdown strings
    assertEquals(typeof result.newPipeMarkdown, "string");
    assertEquals(typeof result.modifiedParentMarkdown, "string");
    assertEquals(result.newPipeMarkdown.length > 0, true);
    assertEquals(result.modifiedParentMarkdown.length > 0, true);
  });

  await t.step("new pipe markdown contains extracted step name", () => {
    const parent = makePipe(3);
    const result = performExtraction(parent, [1], "Extracted Step");

    // The new pipe should have the step's heading
    assertEquals(result.newPipeMarkdown.includes("Step 1"), true);
  });

  await t.step("new pipe markdown has the given name as H1", () => {
    const parent = makePipe(2);
    const result = performExtraction(parent, [0], "My Sub Pipe");

    assertEquals(result.newPipeMarkdown.includes("# My Sub Pipe"), true);
  });

  await t.step("modified parent excludes extracted steps", () => {
    const parent = makePipe(3);
    // Extract step 1 — parent should keep steps 0 and 2
    const result = performExtraction(parent, [1], "Middle Step");

    // The modified parent should still have Step 0 and Step 2
    assertEquals(result.modifiedParentMarkdown.includes("Step 0"), true);
    assertEquals(result.modifiedParentMarkdown.includes("Step 2"), true);
  });

  await t.step("modified parent includes replacement delegation step", () => {
    const parent = makePipe(3);
    const result = performExtraction(parent, [1], "Middle Step");

    // Replacement step should have an import line targeting the sub-pipe
    assertEquals(result.modifiedParentMarkdown.includes("middle-step/index.ts"), true);
  });

  await t.step("does not mutate the original parent pipe", () => {
    const parent = makePipe(3);
    const originalStepCount = parent.steps.length;
    const originalName = parent.steps[1].name;

    performExtraction(parent, [1], "Immutable Test");

    // Parent should be unmodified — performExtraction uses structuredClone
    assertEquals(parent.steps.length, originalStepCount);
    assertEquals(parent.steps[1].name, originalName);
  });

  await t.step("handles extracting multiple non-contiguous steps", () => {
    const parent = makePipe(5);
    const result = performExtraction(parent, [0, 2, 4], "Odds");

    // New pipe should have 3 steps
    assertEquals(result.newPipeMarkdown.includes("Step 0"), true);
    assertEquals(result.newPipeMarkdown.includes("Step 2"), true);
    assertEquals(result.newPipeMarkdown.includes("Step 4"), true);

    // Modified parent should retain steps 1 and 3
    assertEquals(result.modifiedParentMarkdown.includes("Step 1"), true);
    assertEquals(result.modifiedParentMarkdown.includes("Step 3"), true);
  });

  await t.step("handles extracting all steps", () => {
    const parent = makePipe(2);
    const result = performExtraction(parent, [0, 1], "Everything");

    // Modified parent should have the replacement step but no original steps
    assertEquals(result.modifiedParentMarkdown.includes("everything/index.ts"), true);
  });

  // ── Error cases ──

  await t.step("throws on empty stepIndices", () => {
    const parent = makePipe(3);
    assertThrows(
      () => performExtraction(parent, [], "Empty"),
      Error,
      "At least one step index",
    );
  });

  await t.step("throws on out-of-bounds index", () => {
    const parent = makePipe(3);
    assertThrows(
      () => performExtraction(parent, [5], "OOB"),
      Error,
      "out of range",
    );
  });

  await t.step("throws on negative index", () => {
    const parent = makePipe(3);
    assertThrows(
      () => performExtraction(parent, [-1], "Negative"),
      Error,
      "out of range",
    );
  });
});
