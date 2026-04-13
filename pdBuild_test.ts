import {
  assertEquals,
  assertExists,
  assertStringIncludes,
  // deno-lint-ignore no-import-prefix no-unversioned-import
} from "jsr:@std/assert";
// deno-lint-ignore no-import-prefix
import { exists } from "jsr:@std/fs@1.0.5";
// deno-lint-ignore no-import-prefix
import { join } from "jsr:@std/path@1.0.7";
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

// Test the pdBuild output if we're in a directory with testPipes
Deno.test("integration: pdBuild generates expected files", async (t) => {
  const testPipesDir = join(Deno.cwd(), "..", "testPipes");
  const pdDir = join(testPipesDir, ".pd");
  const readPermission = await Deno.permissions.query({
    name: "read",
    path: testPipesDir,
  });

  if (readPermission.state !== "granted") {
    console.log("Skipping pdBuild file tests: read permission not granted.");
    return;
  }

  const pdDirExists = await exists(pdDir);
  if (!pdDirExists) {
    console.log(
      "Skipping pdBuild file tests - .pd directory not found. Run `pd build` in testPipes/ first.",
    );
    return;
  }

  await t.step(".pd directory exists with deno.json", async () => {
    assertEquals(await exists(join(pdDir, "deno.json")), true);
  });

  await t.step("generated pipes have required files", async () => {
    // Check for at least one known pipe
    const testTestsDir = join(pdDir, "testTests");
    if (await exists(testTestsDir)) {
      assertEquals(await exists(join(testTestsDir, "index.ts")), true);
      assertEquals(await exists(join(testTestsDir, "index.json")), true);
      assertEquals(await exists(join(testTestsDir, "index.md")), true);
      assertEquals(await exists(join(testTestsDir, "test.ts")), true);
      assertEquals(await exists(join(testTestsDir, "cli.ts")), true);
      assertEquals(await exists(join(testTestsDir, "server.ts")), true);
    }
  });

  await t.step("index.json has valid pipe structure", async () => {
    const testTestsJson = join(pdDir, "testTests", "index.json");
    if (await exists(testTestsJson)) {
      const content = await Deno.readTextFile(testTestsJson);
      const pipe = JSON.parse(content);
      assertExists(pipe.name);
      assertExists(pipe.steps);
      assertEquals(Array.isArray(pipe.steps), true);
      assertEquals(pipe.steps.length > 0, true);
    }
  });

  await t.step("deno.json import map has entries for pipes", async () => {
    const denoJson = join(pdDir, "deno.json");
    const content = await Deno.readTextFile(denoJson);
    const config = JSON.parse(content);
    assertExists(config.imports);
    // Should have at least one pipe import
    const importKeys = Object.keys(config.imports);
    assertEquals(importKeys.length > 0, true);
  });
});
