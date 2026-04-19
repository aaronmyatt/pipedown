import {
  assertEquals,
  assertExists,
  assertStringIncludes,
  // deno-lint-ignore no-import-prefix no-unversioned-import
} from "jsr:@std/assert";
import { mdToPipe } from "./mdToPipe.ts";
import { pipeToScript } from "./pipeToScript.ts";
import type { Input, Pipe } from "./pipedown.d.ts";

// Integration tests that verify the full markdown → Pipe → TypeScript pipeline
// without requiring filesystem operations (no pdBuild, no .pd/ directory)

Deno.test("integration: markdown to executable script", async (t) => {
  async function fullPipeline(markdown: string): Promise<{
    pipe: Pipe;
    script: Awaited<ReturnType<typeof pipeToScript>>;
  }> {
    const parseResult = await mdToPipe(
      {
        markdown,
        pipe: {
          name: "",
          cleanName: "",
          steps: [],
          dir: "",
          absoluteDir: "",
          fileName: "",
          mdPath: "",
          config: {
            inputs: [],
            build: [],
            skip: [],
            exclude: [],
          },
        },
      } as { markdown: string; pipe: Pipe } & Input,
    );

    const scriptResult = await pipeToScript({ pipe: parseResult.pipe });
    return { pipe: parseResult.pipe as Pipe, script: scriptResult };
  }

  await t.step("simple pipeline produces valid script", async () => {
    const { pipe, script } = await fullPipeline(`# Simple Pipe

## Add Value

\`\`\`ts
input.result = (input.value || 0) + 1;
\`\`\`
`);
    assertEquals(pipe.name, "Simple Pipe");
    assertEquals(pipe.steps.length, 1);
    assertEquals(script.success, true);
    assertStringIncludes(script.script!, "async function AddValue");
  });

  await t.step("multi-step pipeline preserves step order", async () => {
    const { pipe, script } = await fullPipeline(`# Multi Step

## Step One

\`\`\`ts
input.order = [1];
\`\`\`

## Step Two

\`\`\`ts
input.order.push(2);
\`\`\`

## Step Three

\`\`\`ts
input.order.push(3);
\`\`\`
`);
    assertEquals(pipe.steps.length, 3);
    assertEquals(pipe.steps[0].funcName, "StepOne");
    assertEquals(pipe.steps[1].funcName, "StepTwo");
    assertEquals(pipe.steps[2].funcName, "StepThree");
    assertEquals(script.success, true);
    assertStringIncludes(script.script!, "StepOne, StepTwo, StepThree");
  });

  await t.step("config is parsed and available", async () => {
    const { pipe } = await fullPipeline(`# With Config

\`\`\`json
{
  "apiUrl": "https://api.example.com",
  "maxRetries": 3,
  "inputs": [
    { "_name": "test", "value": 1 }
  ]
}
\`\`\`

## Use Config

\`\`\`ts
const url = $p.get(opts, '/config/apiUrl');
\`\`\`
`);
    assertEquals(pipe.config?.apiUrl, "https://api.example.com");
    assertEquals(pipe.config?.maxRetries, 3);
    const inputs = pipe.config?.inputs as Array<Record<string, unknown>>;
    assertEquals(inputs?.length, 1);
    assertEquals(inputs?.[0]._name, "test");
  });

  await t.step("conditionals are correctly extracted", async () => {
    const { pipe } = await fullPipeline(`# Conditional Pipe

## Always Run

\`\`\`ts
input.base = true;
\`\`\`

## Only When Flag
- check: /enabled
- and: /verified
- not: /blocked
- \`\`\`ts
  input.conditional = true;
  \`\`\`

## Route Handler
- route: /api/data/:id
- \`\`\`ts
  input.routed = true;
  \`\`\`
`);
    assertEquals(pipe.steps.length, 3);

    // First step: no conditions
    assertEquals(pipe.steps[0].inList, false);

    // Second step: multiple conditions
    assertEquals(pipe.steps[1].inList, true);
    assertExists(pipe.steps[1].config?.checks);
    assertExists(pipe.steps[1].config?.and);
    assertExists(pipe.steps[1].config?.not);

    // Third step: route
    assertEquals(pipe.steps[2].inList, true);
    assertExists(pipe.steps[2].config?.routes);
  });

  await t.step("imports are hoisted in multi-step pipeline", async () => {
    const { script } = await fullPipeline(`# Import Test

## Fetch

\`\`\`ts
import { z } from "npm:zod";
const schema = z.string();
input.validated = schema.parse(input.raw || "");
\`\`\`

## Transform

\`\`\`ts
import { capitalize } from "npm:lodash";
input.result = capitalize(input.validated);
\`\`\`
`);
    assertEquals(script.success, true);
    // Both imports should be at the top
    assertStringIncludes(script.script!, 'from "npm:zod"');
    assertStringIncludes(script.script!, 'from "npm:lodash"');
  });

  await t.step(
    "duplicate imports are deduplicated in generated output",
    async () => {
      const { script } = await fullPipeline(`# Duplicate Import Test

## First

\`\`\`ts
import { shared } from "npm:shared";
input.first = shared();
\`\`\`

## Second

\`\`\`ts
import { shared } from "npm:shared";
input.second = shared();
\`\`\`
`);
      assertEquals(script.success, true);
      const importCount =
        script.script!.match(/import \{ shared \} from "npm:shared";/g)
          ?.length ?? 0;
      assertEquals(importCount, 1);
    },
  );

  await t.step(
    "skip blocks are excluded from steps and generated script",
    async () => {
      const { pipe, script } = await fullPipeline(`# Skip Test

\`\`\`js skip
import { pipe } from "./skipTest.js";
\`\`\`

## Real Step

\`\`\`ts
input.result = "done";
\`\`\`
`);
      assertEquals(pipe.steps.length, 1);
      assertEquals(pipe.steps[0].funcName, "RealStep");
      assertEquals(script.success, true);
      assertEquals(
        script.script!.includes("skipTest.js"),
        false,
        "Skip block import should not appear in generated script",
      );
      assertEquals(
        script.script!.includes("import { pipe }"),
        false,
        "Skip block import should not leak",
      );
    },
  );

  await t.step(
    "skip blocks with imports do not contaminate other steps",
    async () => {
      const { pipe, script } = await fullPipeline(`# Multi Skip

\`\`\`js skip
import { foo } from "./foo.js";
\`\`\`

## Step A

\`\`\`ts
import { bar } from "npm:bar";
input.a = bar();
\`\`\`

## Step B

\`\`\`ts
input.b = true;
\`\`\`
`);
      assertEquals(pipe.steps.length, 2);
      assertEquals(script.success, true);
      assertStringIncludes(script.script!, 'from "npm:bar"');
      assertEquals(
        script.script!.includes("foo.js"),
        false,
        "Skip block import should not appear",
      );
    },
  );

  await t.step("pipe JSON structure matches expected format", async () => {
    const { pipe } = await fullPipeline(`# JSON Structure

\`\`\`json
{
  "inputs": [{ "_name": "test" }]
}
\`\`\`

## Process

\`\`\`ts
input.done = true;
\`\`\`
`);

    // Verify the pipe structure that would be written to index.json
    assertEquals(typeof pipe.name, "string");
    assertEquals(typeof pipe.cleanName, "string");
    assertEquals(Array.isArray(pipe.steps), true);
    assertEquals(pipe.steps.length, 1);

    const step = pipe.steps[0];
    assertEquals(typeof step.code, "string");
    assertEquals(typeof step.name, "string");
    assertEquals(typeof step.funcName, "string");
    assertEquals(typeof step.inList, "boolean");
    assertEquals(Array.isArray(step.range), true);
  });
});

// Note: Cross-repo filesystem validation against a built sibling testPipes
// checkout intentionally lives in the CI compat workflow rather than the core
// `deno test` suite. Keeping this file self-contained ensures the core tests
// pass in clean CI environments where ../testPipes is not checked out.
// Ref: .github/workflows/ci.yml (testpipes-compat job)

// ── Malformed JSON Config Block Tests ──
// These tests verify that mdToPipe handles invalid JSON in ```json``` meta
// blocks gracefully: recording a PDError on the output rather than throwing,
// while still parsing the rest of the pipe correctly so downstream steps
// remain intact.

Deno.test("mdToPipe: malformed JSON config block populates errors", async (t) => {
  // Helper shared across sub-steps — wraps mdToPipe with a minimal Pipe stub.
  // @param markdown - Raw markdown string to parse.
  // @param mdPath   - Fake file path used in error messages (for assertion).
  // @return The full mdToPipe output object (pipe + errors).
  async function parseWith(markdown: string, mdPath: string) {
    return await mdToPipe(
      {
        markdown,
        pipe: {
          name: "",
          cleanName: "",
          steps: [],
          dir: "",
          absoluteDir: "",
          fileName: "",
          // mdPath is included in the PDError message so the user knows which
          // file contains the broken JSON block.
          mdPath,
          config: {
            inputs: [],
            build: [],
            skip: [],
            exclude: [],
          },
        },
      } as Parameters<typeof mdToPipe>[0],
    );
  }

  await t.step(
    "single bad JSON block records an error with file path context",
    async () => {
      const result = await parseWith(
        `# Bad Config Pipe

\`\`\`json
{ "unclosed": true, bad json syntax here
\`\`\`

## A Step

\`\`\`ts
input.done = true;
\`\`\`
`,
        "/fake/path/bad-config.md",
      );

      // The pipe should still be parsed successfully — other steps are intact.
      // mergeMetaConfig returns {} on error so the rest of the pipeline runs.
      assertEquals(result.pipe.steps.length, 1);
      assertEquals(result.pipe.steps[0].funcName, "AStep");

      // An error must have been recorded — errors is non-null and non-empty.
      assertExists(result.errors);
      assertEquals(
        result.errors!.length > 0,
        true,
        "Expected at least one error",
      );

      // The error message should pinpoint both the file and describe the cause.
      assertStringIncludes(
        result.errors![0].message,
        "Malformed JSON config block",
      );
      assertStringIncludes(result.errors![0].message, "bad-config.md");
    },
  );

  await t.step("valid JSON block does not produce errors", async () => {
    const result = await parseWith(
      `# Good Config Pipe

\`\`\`json
{ "apiUrl": "https://api.example.com" }
\`\`\`

## A Step

\`\`\`ts
input.done = true;
\`\`\`
`,
      "/fake/path/good-config.md",
    );

    // No errors should be recorded for well-formed JSON.
    assertEquals(
      result.errors == null || result.errors.length === 0,
      true,
      "Expected no errors for valid JSON",
    );

    // The parsed config value should be accessible on the pipe.
    // Ref: mergeMetaConfig in mdToPipe.ts — merges metaBlocks into pipe.config
    assertEquals(
      (result.pipe.config as Record<string, unknown>)?.apiUrl,
      "https://api.example.com",
    );
  });
});
