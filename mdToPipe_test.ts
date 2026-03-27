import { assertEquals, assertExists } from "jsr:@std/assert";
import { mdToPipe } from "./mdToPipe.ts";
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

Deno.test("mdToPipe", async (t) => {
  // --- Pipe Name ---

  await t.step("extracts H1 as pipe name", async () => {
    const result = await parse("# My Pipeline\n\n## Step\n\n```ts\ninput.x = 1;\n```");
    assertEquals(result.pipe.name, "My Pipeline");
  });

  await t.step("uses first heading as pipe name when no H1", async () => {
    // Note: findPipeName checks token.level (nesting level, not heading level)
    // so H2 at top-level (level=0) is treated as pipe name
    const result = await parse("## Step\n\n```ts\ninput.x = 1;\n```");
    assertEquals(result.pipe.name, "Step");
  });

  await t.step("generates cleanName from pipe name", async () => {
    const result = await parse("# My Cool Pipeline!\n\n## Step\n\n```ts\ninput.x = 1;\n```");
    assertEquals(result.pipe.cleanName, "MyCoolPipeline");
  });

  // --- Steps ---

  await t.step("extracts ts code blocks as steps", async () => {
    const result = await parse(`# Test

## First

\`\`\`ts
input.a = 1;
\`\`\`

## Second

\`\`\`ts
input.b = 2;
\`\`\`
`);
    assertEquals(result.pipe.steps.length, 2);
    assertEquals(result.pipe.steps[0].code.trim(), "input.a = 1;");
    assertEquals(result.pipe.steps[1].code.trim(), "input.b = 2;");
  });

  await t.step("extracts js code blocks as steps", async () => {
    const result = await parse("# Test\n\n## Step\n\n```js\ninput.x = 1;\n```");
    assertEquals(result.pipe.steps.length, 1);
  });

  await t.step("extracts javascript code blocks as steps", async () => {
    const result = await parse("# Test\n\n## Step\n\n```javascript\ninput.x = 1;\n```");
    assertEquals(result.pipe.steps.length, 1);
  });

  await t.step("extracts typescript code blocks as steps", async () => {
    const result = await parse("# Test\n\n## Step\n\n```typescript\ninput.x = 1;\n```");
    assertEquals(result.pipe.steps.length, 1);
  });

  await t.step("ignores non-executable code blocks", async () => {
    const result = await parse(`# Test

## Step

\`\`\`ts
input.x = 1;
\`\`\`

\`\`\`bash
echo hello
\`\`\`

\`\`\`python
print("hi")
\`\`\`
`);
    assertEquals(result.pipe.steps.length, 1);
  });

  await t.step("names steps from preceding headings", async () => {
    const result = await parse(`# Test

## Fetch Data

\`\`\`ts
input.data = [];
\`\`\`

## Process Results

\`\`\`ts
input.processed = true;
\`\`\`
`);
    assertEquals(result.pipe.steps[0].name, "Fetch Data");
    assertEquals(result.pipe.steps[1].name, "Process Results");
  });

  await t.step("generates funcName from step name", async () => {
    const result = await parse(`# Test

## Fetch Data

\`\`\`ts
input.data = [];
\`\`\`
`);
    assertEquals(result.pipe.steps[0].funcName, "FetchData");
  });

  await t.step("uses H1 as step name when no H2 precedes code block", async () => {
    // When a code block has no H2+ heading before it, findSteps falls back
    // to the nearest heading (including H1)
    const result = await parse("# Test\n\n```ts\ninput.x = 1;\n```");
    assertEquals(result.pipe.steps[0].name, "Test");
  });

  await t.step("assigns anonymous name when no heading at all", async () => {
    const result = await parse("```ts\ninput.x = 1;\n```");
    assertEquals(typeof result.pipe.steps[0].name, "string");
    assertEquals(result.pipe.steps[0].name.startsWith("anonymous"), true);
  });

  await t.step("handles steps with special characters in heading", async () => {
    const result = await parse(`# Test

## Step: With (Special) Chars!

\`\`\`ts
input.x = 1;
\`\`\`
`);
    // funcName should be sanitized
    assertEquals(result.pipe.steps[0].funcName.includes(":"), false);
    assertEquals(result.pipe.steps[0].funcName.includes("("), false);
    assertEquals(result.pipe.steps[0].funcName.includes("!"), false);
  });

  // --- JSON Config ---

  await t.step("parses JSON config blocks", async () => {
    const result = await parse(`# Test

\`\`\`json
{
  "apiKey": "test-key",
  "maxRetries": 3
}
\`\`\`

## Step

\`\`\`ts
input.x = 1;
\`\`\`
`);
    assertEquals(result.pipe.config?.apiKey, "test-key");
    assertEquals(result.pipe.config?.maxRetries, 3);
  });

  await t.step("merges multiple JSON config blocks", async () => {
    const result = await parse(`# Test

\`\`\`json
{
  "key1": "value1"
}
\`\`\`

\`\`\`json
{
  "key2": "value2"
}
\`\`\`

## Step

\`\`\`ts
input.x = 1;
\`\`\`
`);
    assertEquals(result.pipe.config?.key1, "value1");
    assertEquals(result.pipe.config?.key2, "value2");
  });

  await t.step("parses inputs array from JSON config", async () => {
    const result = await parse(`# Test

\`\`\`json
{
  "inputs": [
    { "_name": "Case 1", "value": 10 },
    { "_name": "Case 2", "value": 20 }
  ]
}
\`\`\`

## Step

\`\`\`ts
input.x = input.value * 2;
\`\`\`
`);
    const inputs = result.pipe.config?.inputs as Array<Record<string, unknown>>;
    assertEquals(inputs?.length, 2);
    assertEquals(inputs?.[0]._name, "Case 1");
    assertEquals(inputs?.[1].value, 20);
  });

  // --- Conditionals ---

  await t.step("extracts check directive", async () => {
    const result = await parse(`# Test

## Conditional Step
- check: /user/authenticated
- \`\`\`ts
  input.access = true;
  \`\`\`
`);
    assertEquals(result.pipe.steps[0].inList, true);
    assertExists(result.pipe.steps[0].config?.checks);
    assertEquals(result.pipe.steps[0].config?.checks?.includes("/user/authenticated"), true);
  });

  await t.step("extracts if directive (alias for check)", async () => {
    const result = await parse(`# Test

## Step
- if: /flag
- \`\`\`ts
  input.x = 1;
  \`\`\`
`);
    assertExists(result.pipe.steps[0].config?.checks);
    assertEquals(result.pipe.steps[0].config?.checks?.includes("/flag"), true);
  });

  await t.step("extracts when directive (alias for check)", async () => {
    const result = await parse(`# Test

## Step
- when: /ready
- \`\`\`ts
  input.x = 1;
  \`\`\`
`);
    assertExists(result.pipe.steps[0].config?.checks);
    assertEquals(result.pipe.steps[0].config?.checks?.includes("/ready"), true);
  });

  await t.step("extracts or directive", async () => {
    const result = await parse(`# Test

## Step
- check: /admin
- or: /moderator
- \`\`\`ts
  input.x = 1;
  \`\`\`
`);
    assertExists(result.pipe.steps[0].config?.or);
    assertEquals(result.pipe.steps[0].config?.or?.includes("/moderator"), true);
  });

  await t.step("extracts and directive", async () => {
    const result = await parse(`# Test

## Step
- check: /user
- and: /verified
- \`\`\`ts
  input.x = 1;
  \`\`\`
`);
    assertExists(result.pipe.steps[0].config?.and);
    assertEquals(result.pipe.steps[0].config?.and?.includes("/verified"), true);
  });

  await t.step("extracts not directive", async () => {
    const result = await parse(`# Test

## Step
- not: /banned
- \`\`\`ts
  input.x = 1;
  \`\`\`
`);
    assertExists(result.pipe.steps[0].config?.not);
    assertEquals(result.pipe.steps[0].config?.not?.includes("/banned"), true);
  });

  await t.step("extracts route directive", async () => {
    const result = await parse(`# Test

## Handle Route
- route: /api/users/:id
- \`\`\`ts
  input.userId = input.route.pathname.groups.id;
  \`\`\`
`);
    assertExists(result.pipe.steps[0].config?.routes);
    assertEquals(result.pipe.steps[0].config?.routes?.includes("/api/users/:id"), true);
  });

  await t.step("extracts flags directive", async () => {
    const result = await parse(`# Test

## Step
- flags: /verbose
- \`\`\`ts
  console.log("verbose");
  \`\`\`
`);
    assertExists(result.pipe.steps[0].config?.checks);
    assertEquals(result.pipe.steps[0].config?.checks?.includes("/flags/verbose"), true);
  });

  await t.step("extracts multiple conditions on one step", async () => {
    const result = await parse(`# Test

## Guarded Step
- check: /auth
- and: /permission
- not: /blocked
- or: /admin
- \`\`\`ts
  input.allowed = true;
  \`\`\`
`);
    const step = result.pipe.steps[0];
    assertExists(step.config?.checks);
    assertExists(step.config?.and);
    assertExists(step.config?.not);
    assertExists(step.config?.or);
  });

  await t.step("marks steps in lists correctly", async () => {
    const result = await parse(`# Test

## Not In List

\`\`\`ts
input.a = 1;
\`\`\`

## In List
- check: /flag
- \`\`\`ts
  input.b = 2;
  \`\`\`
`);
    assertEquals(result.pipe.steps[0].inList, false);
    assertEquals(result.pipe.steps[1].inList, true);
  });

  // --- Complex scenarios ---

  await t.step("handles complete pipeline with all features", async () => {
    const result = await parse(`# User API Handler

Configuration for the pipeline:

\`\`\`json
{
  "inputs": [
    { "_name": "Get User", "userId": "123" },
    { "_name": "Invalid User", "userId": null }
  ]
}
\`\`\`

## Validate Input
- check: /userId
- \`\`\`ts
  if (!input.userId) {
    input.error = { message: "User ID required", status: 400 };
  }
  \`\`\`

## Fetch User
- not: /error
- \`\`\`ts
  input.user = { id: input.userId, name: "Test" };
  \`\`\`

## Format Response

\`\`\`ts
if (input.error) {
  input.body = { error: input.error.message };
} else {
  input.body = { user: input.user };
}
\`\`\`
`);
    assertEquals(result.pipe.name, "User API Handler");
    assertEquals(result.pipe.steps.length, 3);
    assertEquals(result.pipe.steps[0].name, "Validate Input");
    assertEquals(result.pipe.steps[0].inList, true);
    assertEquals(result.pipe.steps[1].name, "Fetch User");
    assertEquals(result.pipe.steps[1].inList, true);
    assertEquals(result.pipe.steps[2].name, "Format Response");
    assertEquals(result.pipe.steps[2].inList, false);

    const inputs = result.pipe.config?.inputs as Array<Record<string, unknown>>;
    assertEquals(inputs?.length, 2);
  });

  await t.step("handles skip modifier on code blocks", async () => {
    // Code blocks with 'skip' after language should still be parsed
    // but the skip is part of the info string
    const result = await parse(`# Test

## Skipped

\`\`\`ts skip
input.x = 1;
\`\`\`

## Not Skipped

\`\`\`ts
input.y = 2;
\`\`\`
`);
    // 'ts skip' has 'ts' as language but 'skip' as extra info
    // the rangeFinder checks language with split(' ')[0] which gets 'ts'
    // so skipped blocks ARE detected as code blocks
    // the skip handling happens at a higher level
    assertEquals(result.pipe.steps.length >= 1, true);
  });

  // --- Zod Schema ---

  await t.step("extracts zod schema from top-level zod block", async () => {
    const result = await parse(`# Test

\`\`\`zod
import { z } from "npm:zod";

export const schema = z.object({
  name: z.string(),
  result: z.string().default(""),
});
\`\`\`

## Step

\`\`\`ts
input.result = input.name;
\`\`\`
`);
    assertExists(result.pipe.schema);
    assertEquals(result.pipe.schema!.includes("z.object"), true);
    assertEquals(result.pipe.schema!.includes("z.string()"), true);
  });

  await t.step("pipe.schema is undefined when no zod block present", async () => {
    const result = await parse(`# Test

## Step

\`\`\`ts
input.x = 1;
\`\`\`
`);
    assertEquals(result.pipe.schema, undefined);
  });

  await t.step("zod block does not appear as a code step", async () => {
    const result = await parse(`# Test

\`\`\`zod
export const schema = z.object({ x: z.number() });
\`\`\`

## Step

\`\`\`ts
input.x = 1;
\`\`\`
`);
    assertEquals(result.pipe.steps.length, 1);
    assertEquals(result.pipe.steps[0].name, "Step");
  });

  await t.step("handles H3 and deeper headings as step names", async () => {
    const result = await parse(`# Test

### Deep Step

\`\`\`ts
input.x = 1;
\`\`\`
`);
    assertEquals(result.pipe.steps[0].name, "Deep Step");
  });
});
