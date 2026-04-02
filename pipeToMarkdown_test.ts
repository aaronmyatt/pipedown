import { assertEquals } from "jsr:@std/assert";
import { mdToPipe } from "./mdToPipe.ts";
import { pipeToMarkdown } from "./pipeToMarkdown.ts";
import type { Input, Pipe } from "./pipedown.d.ts";

function emptyPipe(): Pipe {
  return {
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
  };
}

async function parse(markdown: string): Promise<{ pipe: Pipe } & Input> {
  const result = await mdToPipe({
    markdown,
    pipe: emptyPipe(),
  } as { markdown: string; pipe: Pipe } & Input);
  return result as { pipe: Pipe } & Input;
}

Deno.test("pipeToMarkdown lossless round-trip", async (t) => {
  // --- Basic round-trip ---

  await t.step("simple pipe with heading, description, and code", async () => {
    const source = `# My Pipeline

A simple pipeline for testing.

## Step One

This step does something.

\`\`\`ts
input.x = 1;
\`\`\`

## Step Two

This step does something else.

\`\`\`ts
input.y = input.x + 1;
\`\`\`
`;
    const result = await parse(source);
    const reconstructed = pipeToMarkdown(result.pipe);
    assertEquals(reconstructed, source);
  });

  await t.step("pipe with schema block", async () => {
    const source = `# Schema Pipe

\`\`\`zod
import { z } from "npm:zod";
export const schema = z.object({
  name: z.string(),
  count: z.number().default(0),
});
\`\`\`

## Process

Process the data.

\`\`\`ts
input.count = input.count + 1;
\`\`\`
`;
    const result = await parse(source);
    const reconstructed = pipeToMarkdown(result.pipe);
    assertEquals(reconstructed, source);
  });

  await t.step("pipe with JSON config block", async () => {
    const source = `# Config Pipe

\`\`\`json
{
  "inputs": [
    { "_name": "test", "value": 42 }
  ]
}
\`\`\`

## Do Work

\`\`\`ts
input.result = input.value * 2;
\`\`\`
`;
    const result = await parse(source);
    const reconstructed = pipeToMarkdown(result.pipe);
    assertEquals(reconstructed, source);
  });

  await t.step("pipe with blockquotes and formatting preserved", async () => {
    const source = `# Rich Pipe

A **bold** description with [links](http://example.com).

## Step With Blockquote

> Note that this step has important notes.
> Multiple lines of blockquote.

Some more description.

\`\`\`ts
input.x = 1;
\`\`\`
`;
    const result = await parse(source);
    const reconstructed = pipeToMarkdown(result.pipe);
    assertEquals(reconstructed, source);
  });

  await t.step("pipe with horizontal dividers between steps", async () => {
    const source = `# Divider Pipe

## First Step

\`\`\`ts
input.a = 1;
\`\`\`

---

## Second Step

\`\`\`ts
input.b = 2;
\`\`\`
`;
    const result = await parse(source);
    const reconstructed = pipeToMarkdown(result.pipe);
    assertEquals(reconstructed, source);
  });

  await t.step("pipe with H3 headings", async () => {
    const source = `# Deep Headings

### Level Three Step

Description here.

\`\`\`ts
input.deep = true;
\`\`\`
`;
    const result = await parse(source);
    const reconstructed = pipeToMarkdown(result.pipe);
    assertEquals(reconstructed, source);
  });

  await t.step("pipe with skip code blocks preserved", async () => {
    const source = `# Skip Pipe

\`\`\`js skip
import { pipe } from "./skipPipe.js";
\`\`\`

## Actual Step

\`\`\`ts
input.x = 1;
\`\`\`
`;
    const result = await parse(source);
    const reconstructed = pipeToMarkdown(result.pipe);
    assertEquals(reconstructed, source);
  });

  await t.step("pipe with bullet lists in prose", async () => {
    const source = `# List Pipe

Some properties:

- input.wikiJson
- input.imageUrl

## Step

\`\`\`ts
input.done = true;
\`\`\`
`;
    const result = await parse(source);
    const reconstructed = pipeToMarkdown(result.pipe);
    assertEquals(reconstructed, source);
  });

  // --- Code modification ---

  await t.step("preserves prose when only code is modified", async () => {
    const source = `# Modify Pipe

A **rich** description with lots of formatting.

> Important note about this pipeline.

\`\`\`json
{
  "inputs": [{ "_name": "test" }]
}
\`\`\`

## Step One

Detailed description of what this step does.

\`\`\`ts
input.old = "original";
\`\`\`

---

## Step Two

Another detailed description.

\`\`\`ts
input.also_old = "original";
\`\`\`
`;
    const result = await parse(source);

    // Modify step 1's code
    result.pipe.steps[0].code = 'input.new = "modified";\n';

    const reconstructed = pipeToMarkdown(result.pipe);

    // The code should be changed
    const expectedModified = source.replace(
      'input.old = "original";',
      'input.new = "modified";',
    );
    assertEquals(reconstructed, expectedModified);

    // Verify the prose is still there
    assertEquals(reconstructed.includes("**rich** description"), true);
    assertEquals(reconstructed.includes("> Important note"), true);
    assertEquals(reconstructed.includes("---"), true);
  });

  // --- Fallback mode ---

  // --- Title mutations in lossless mode ---

  await t.step("lossless: splices in changed step title", async () => {
    const source = `# My Pipeline

## Original Title

\`\`\`ts
input.x = 1;
\`\`\`
`;
    const result = await parse(source);
    result.pipe.steps[0].name = "New Title";

    const reconstructed = pipeToMarkdown(result.pipe);
    assertEquals(reconstructed.includes("## New Title"), true);
    assertEquals(reconstructed.includes("## Original Title"), false);
    // Code should still be present
    assertEquals(reconstructed.includes("input.x = 1;"), true);
  });

  await t.step("lossless: preserves other steps when one title changes", async () => {
    const source = `# Pipeline

## Step One

First description.

\`\`\`ts
input.a = 1;
\`\`\`

## Step Two

Second description.

\`\`\`ts
input.b = 2;
\`\`\`
`;
    const result = await parse(source);
    // Only mutate step 1's title
    result.pipe.steps[0].name = "Renamed Step";

    const reconstructed = pipeToMarkdown(result.pipe);
    assertEquals(reconstructed.includes("## Renamed Step"), true);
    assertEquals(reconstructed.includes("## Step One"), false);
    // Step 2 should be completely unchanged
    assertEquals(reconstructed.includes("## Step Two"), true);
    assertEquals(reconstructed.includes("Second description."), true);
  });

  // --- Description mutations in lossless mode ---

  await t.step("lossless: splices in changed step description", async () => {
    const source = `# Pipeline

## Step One

Old description here.

\`\`\`ts
input.x = 1;
\`\`\`
`;
    const result = await parse(source);
    result.pipe.steps[0].description = "New LLM-generated description.";

    const reconstructed = pipeToMarkdown(result.pipe);
    assertEquals(reconstructed.includes("New LLM-generated description."), true);
    assertEquals(reconstructed.includes("Old description here."), false);
    assertEquals(reconstructed.includes("## Step One"), true);
    assertEquals(reconstructed.includes("input.x = 1;"), true);
  });

  await t.step("lossless: adds description where none existed", async () => {
    const source = `# Pipeline

## Step One

\`\`\`ts
input.x = 1;
\`\`\`
`;
    const result = await parse(source);
    // Step originally has no description — add one
    result.pipe.steps[0].description = "Newly added description.";

    const reconstructed = pipeToMarkdown(result.pipe);
    assertEquals(reconstructed.includes("Newly added description."), true);
    assertEquals(reconstructed.includes("## Step One"), true);
    assertEquals(reconstructed.includes("input.x = 1;"), true);
  });

  await t.step("lossless: description change preserves DSL directives", async () => {
    const source = `# Pipeline

## Guarded Step
- check: /auth
- and: /verified
- \`\`\`ts
  input.allowed = true;
  \`\`\`
`;
    const result = await parse(source);
    // Add a description to a step that has DSL directives but no description
    result.pipe.steps[0].description = "Only runs when authenticated and verified.";

    const reconstructed = pipeToMarkdown(result.pipe);
    assertEquals(reconstructed.includes("Only runs when authenticated and verified."), true);
    // DSL directives must be preserved
    assertEquals(reconstructed.includes("- check: /auth"), true);
    assertEquals(reconstructed.includes("- and: /verified"), true);
    assertEquals(reconstructed.includes("## Guarded Step"), true);
  });

  await t.step("lossless: description change preserves other steps formatting", async () => {
    const source = `# Rich Pipe

A **bold** description with [links](http://example.com).

## Step One

> Note that this step has important notes.
> Multiple lines of blockquote.

Some more description.

\`\`\`ts
input.x = 1;
\`\`\`

## Step Two

Another description.

\`\`\`ts
input.y = 2;
\`\`\`
`;
    const result = await parse(source);
    // Only mutate step 2's description — step 1's blockquotes must survive
    result.pipe.steps[1].description = "Replaced description.";

    const reconstructed = pipeToMarkdown(result.pipe);
    // Step 2 should have new description
    assertEquals(reconstructed.includes("Replaced description."), true);
    assertEquals(reconstructed.includes("Another description."), false);
    // Step 1's rich formatting must be preserved verbatim
    assertEquals(reconstructed.includes("> Note that this step has important notes."), true);
    assertEquals(reconstructed.includes("> Multiple lines of blockquote."), true);
    assertEquals(reconstructed.includes("Some more description."), true);
  });

  // --- Pipe-level description mutations ---

  await t.step("lossless: splices in changed pipe-level description", async () => {
    const source = `# My Pipeline

Old pipe description.

## Step One

\`\`\`ts
input.x = 1;
\`\`\`
`;
    const result = await parse(source);
    result.pipe.pipeDescription = "New LLM-generated pipe description.";

    const reconstructed = pipeToMarkdown(result.pipe);
    assertEquals(reconstructed.includes("New LLM-generated pipe description."), true);
    assertEquals(reconstructed.includes("Old pipe description."), false);
    assertEquals(reconstructed.includes("# My Pipeline"), true);
    assertEquals(reconstructed.includes("## Step One"), true);
  });

  await t.step("lossless: pipe description change preserves schema block", async () => {
    const source = `# Schema Pipe

Old pipe description.

\`\`\`zod
import { z } from "npm:zod";
export const schema = z.object({ name: z.string() });
\`\`\`

## Process

\`\`\`ts
input.count = input.count + 1;
\`\`\`
`;
    const result = await parse(source);
    result.pipe.pipeDescription = "New description.";

    const reconstructed = pipeToMarkdown(result.pipe);
    assertEquals(reconstructed.includes("New description."), true);
    assertEquals(reconstructed.includes("Old pipe description."), false);
    // Schema block must be preserved
    assertEquals(reconstructed.includes("```zod"), true);
    assertEquals(reconstructed.includes("z.object({ name: z.string() })"), true);
  });

  // --- Combined mutations ---

  await t.step("lossless: title + description + code all changed on same step", async () => {
    const source = `# Pipeline

## Old Title

Old description.

\`\`\`ts
input.old = true;
\`\`\`
`;
    const result = await parse(source);
    result.pipe.steps[0].name = "New Title";
    result.pipe.steps[0].description = "New description.";
    result.pipe.steps[0].code = "input.new = true;\n";

    const reconstructed = pipeToMarkdown(result.pipe);
    assertEquals(reconstructed.includes("## New Title"), true);
    assertEquals(reconstructed.includes("## Old Title"), false);
    assertEquals(reconstructed.includes("New description."), true);
    assertEquals(reconstructed.includes("Old description."), false);
    assertEquals(reconstructed.includes("input.new = true;"), true);
    assertEquals(reconstructed.includes("input.old = true;"), false);
    // H1 still there
    assertEquals(reconstructed.includes("# Pipeline"), true);
  });

  // --- Schema mutations in lossless mode ---

  await t.step("lossless: splices in changed schema block", async () => {
    const source = `# Schema Pipe

Old pipe description.

\`\`\`zod
z.object({ name: z.string() })
\`\`\`

## Process

\`\`\`ts
input.count = input.count + 1;
\`\`\`
`;
    const result = await parse(source);
    // Mutate the schema (simulates LLM-generated schema)
    result.pipe.schema = "z.object({ name: z.string(), age: z.number() })";

    const reconstructed = pipeToMarkdown(result.pipe);
    // New schema should be present
    assertEquals(reconstructed.includes("z.object({ name: z.string(), age: z.number() })"), true);
    // Old schema should be gone
    assertEquals(reconstructed.includes("z.object({ name: z.string() })"), false);
    // Everything else preserved
    assertEquals(reconstructed.includes("# Schema Pipe"), true);
    assertEquals(reconstructed.includes("Old pipe description."), true);
    assertEquals(reconstructed.includes("```zod"), true);
    assertEquals(reconstructed.includes("## Process"), true);
    assertEquals(reconstructed.includes("input.count = input.count + 1;"), true);
  });

  await t.step("lossless: inserts schema block when none existed", async () => {
    const source = `# No Schema Pipe

A simple pipe with no schema.

## Step One

\`\`\`ts
input.x = 1;
\`\`\`
`;
    const result = await parse(source);
    // Set schema for the first time (simulates LLM generating one)
    result.pipe.schema = "z.object({ x: z.number() })";

    const reconstructed = pipeToMarkdown(result.pipe);
    assertEquals(reconstructed.includes("```zod"), true);
    assertEquals(reconstructed.includes("z.object({ x: z.number() })"), true);
    // Existing content preserved
    assertEquals(reconstructed.includes("# No Schema Pipe"), true);
    assertEquals(reconstructed.includes("A simple pipe with no schema."), true);
    assertEquals(reconstructed.includes("## Step One"), true);
    assertEquals(reconstructed.includes("input.x = 1;"), true);
  });

  // --- Config/inputs mutations in lossless mode ---

  await t.step("lossless: splices in changed config inputs", async () => {
    const source = `# Config Pipe

\`\`\`json
{
  "inputs": [
    { "_name": "test", "value": 42 }
  ]
}
\`\`\`

## Do Work

\`\`\`ts
input.result = input.value * 2;
\`\`\`
`;
    const result = await parse(source);
    // Mutate config inputs (simulates LLM-generated test inputs)
    result.pipe.config!.inputs = [
      { _name: "happy path", value: 100 },
      { _name: "edge case", value: 0 },
    ];

    const reconstructed = pipeToMarkdown(result.pipe);
    // New inputs should be present
    assertEquals(reconstructed.includes('"happy path"'), true);
    assertEquals(reconstructed.includes('"edge case"'), true);
    // Old input gone
    assertEquals(reconstructed.includes('"value": 42'), false);
    // Structure preserved
    assertEquals(reconstructed.includes("```json"), true);
    assertEquals(reconstructed.includes("# Config Pipe"), true);
    assertEquals(reconstructed.includes("## Do Work"), true);
  });

  await t.step("lossless: inserts config block when none existed", async () => {
    const source = `# No Config Pipe

## Step One

\`\`\`ts
input.x = 1;
\`\`\`
`;
    const result = await parse(source);
    // Set config inputs for the first time
    result.pipe.config = { inputs: [{ _name: "first test", x: 5 }] };

    const reconstructed = pipeToMarkdown(result.pipe);
    assertEquals(reconstructed.includes("```json"), true);
    assertEquals(reconstructed.includes('"first test"'), true);
    // Existing content preserved
    assertEquals(reconstructed.includes("# No Config Pipe"), true);
    assertEquals(reconstructed.includes("## Step One"), true);
    assertEquals(reconstructed.includes("input.x = 1;"), true);
  });

  // --- Combined schema + config mutations ---

  await t.step("lossless: both schema and config changed simultaneously", async () => {
    const source = `# Full Pipe

A pipe with both schema and config.

\`\`\`zod
z.object({ name: z.string() })
\`\`\`

\`\`\`json
{
  "inputs": [
    { "_name": "original", "name": "Alice" }
  ]
}
\`\`\`

## Process

\`\`\`ts
input.greeting = "Hello " + input.name;
\`\`\`
`;
    const result = await parse(source);
    // Change both
    result.pipe.schema = "z.object({ name: z.string(), age: z.number() })";
    result.pipe.config!.inputs = [
      { _name: "updated", name: "Bob", age: 30 },
    ];

    const reconstructed = pipeToMarkdown(result.pipe);
    // New schema
    assertEquals(reconstructed.includes("z.object({ name: z.string(), age: z.number() })"), true);
    assertEquals(reconstructed.includes("z.object({ name: z.string() })\n```"), false);
    // New config
    assertEquals(reconstructed.includes('"updated"'), true);
    assertEquals(reconstructed.includes('"Bob"'), true);
    assertEquals(reconstructed.includes('"original"'), false);
    // Description preserved
    assertEquals(reconstructed.includes("A pipe with both schema and config."), true);
  });

  await t.step("lossless: schema changes but config is preserved verbatim", async () => {
    const source = `# Mixed Pipe

\`\`\`zod
z.object({ x: z.number() })
\`\`\`

\`\`\`json
{
  "inputs": [
    { "_name": "keep me", "x": 1 }
  ]
}
\`\`\`

## Step

\`\`\`ts
input.y = input.x + 1;
\`\`\`
`;
    const result = await parse(source);
    // Only change schema — config should stay verbatim
    result.pipe.schema = "z.object({ x: z.number(), y: z.number() })";

    const reconstructed = pipeToMarkdown(result.pipe);
    // New schema present
    assertEquals(reconstructed.includes("z.object({ x: z.number(), y: z.number() })"), true);
    // Config block preserved verbatim from original source
    assertEquals(reconstructed.includes('"keep me"'), true);
    assertEquals(reconstructed.includes('"x": 1'), true);
  });

  // --- Fallback mode ---

  await t.step("falls back to field reconstruction when no rawSource", async () => {
    const pipe: Pipe = {
      name: "Fallback Pipe",
      cleanName: "FallbackPipe",
      steps: [
        {
          code: "input.x = 1;\n",
          range: [0, 0],
          name: "Do It",
          funcName: "DoIt",
          inList: false,
          headingLevel: 2,
          language: "ts",
        },
      ],
      mdPath: "",
      dir: "",
      absoluteDir: "",
      fileName: "",
    };

    const result = pipeToMarkdown(pipe);
    assertEquals(result.includes("# Fallback Pipe"), true);
    assertEquals(result.includes("## Do It"), true);
    assertEquals(result.includes("input.x = 1;"), true);
  });
});

// --- Round-trip on actual test pipes ---

Deno.test("pipeToMarkdown round-trip on testPipes", async (t) => {
  const testPipesDir = new URL("../testPipes/", import.meta.url).pathname;
  const readPermission = await Deno.permissions.query({
    name: "read",
    path: testPipesDir,
  });

  if (readPermission.state !== "granted") {
    console.log("Skipping testPipes round-trip test: read permission not granted.");
    return;
  }

  // Read each .md file, parse it, reconstruct, and compare
  for await (const entry of Deno.readDir(testPipesDir)) {
    if (!entry.name.endsWith(".md")) continue;

    await t.step(`round-trip: ${entry.name}`, async () => {
      const filePath = testPipesDir + entry.name;
      const source = await Deno.readTextFile(filePath);
      const result = await parse(source);
      const reconstructed = pipeToMarkdown(result.pipe);
      assertEquals(
        reconstructed,
        source,
        `Round-trip failed for ${entry.name}`,
      );
    });
  }
});
