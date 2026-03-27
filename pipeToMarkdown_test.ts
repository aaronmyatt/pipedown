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

async function parse(markdown: string) {
  const result = await mdToPipe({
    markdown,
    pipe: emptyPipe(),
  } as { markdown: string; pipe: Pipe } & Input);
  return result;
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
