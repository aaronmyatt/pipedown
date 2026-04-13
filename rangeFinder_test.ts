// deno-lint-ignore no-import-prefix no-unversioned-import
import { assertEquals } from "jsr:@std/assert";
import { rangeFinder } from "./rangeFinder.ts";
// deno-lint-ignore no-import-prefix
import MarkdownIt from "npm:markdown-it@14.1.0";
import type { RangeFinderInput, Token } from "./pipedown.d.ts";

const md = new MarkdownIt();

async function findAllRanges(markdown: string): Promise<RangeFinderInput> {
  const tokens = md.parse(markdown, {});
  const input = {} as RangeFinderInput;

  // Initialize ranges
  const initOutput = await rangeFinder(input);
  input.ranges = initOutput.ranges;

  // Process all tokens (matches mdToPipe's findRanges pattern)
  for (const [index, token] of tokens.entries()) {
    input.ranges.token = token as Token;
    input.ranges.index = index;
    const { ranges } = await rangeFinder(input);
    input.ranges = ranges;
  }

  return input;
}

Deno.test("rangeFinder", async (t) => {
  await t.step("detects ts code blocks", async () => {
    const result = await findAllRanges("```ts\nconsole.log('hello');\n```");
    assertEquals(result.ranges.codeBlocks.length, 1);
  });

  await t.step("detects js code blocks", async () => {
    const result = await findAllRanges("```js\nconsole.log('hello');\n```");
    assertEquals(result.ranges.codeBlocks.length, 1);
  });

  await t.step("detects typescript code blocks", async () => {
    const result = await findAllRanges(
      "```typescript\nconsole.log('hello');\n```",
    );
    assertEquals(result.ranges.codeBlocks.length, 1);
  });

  await t.step("detects javascript code blocks", async () => {
    const result = await findAllRanges(
      "```javascript\nconsole.log('hello');\n```",
    );
    assertEquals(result.ranges.codeBlocks.length, 1);
  });

  await t.step("detects multiple code blocks", async () => {
    const result = await findAllRanges(
      "```ts\nfirst\n```\n\n```js\nsecond\n```",
    );
    assertEquals(result.ranges.codeBlocks.length, 2);
  });

  await t.step("ignores bash code blocks", async () => {
    const result = await findAllRanges("```bash\necho hello\n```");
    assertEquals(result.ranges.codeBlocks.length, 0);
  });

  await t.step("ignores python code blocks", async () => {
    const result = await findAllRanges("```python\nprint('hello')\n```");
    assertEquals(result.ranges.codeBlocks.length, 0);
  });

  await t.step("ignores unmarked code blocks", async () => {
    const result = await findAllRanges("```\nno language\n```");
    assertEquals(result.ranges.codeBlocks.length, 0);
  });

  await t.step("detects json meta blocks", async () => {
    const result = await findAllRanges('```json\n{"key": "value"}\n```');
    assertEquals(result.ranges.metaBlocks.length, 1);
    assertEquals(result.ranges.codeBlocks.length, 0);
  });

  await t.step("detects yaml meta blocks", async () => {
    const result = await findAllRanges("```yaml\nkey: value\n```");
    assertEquals(result.ranges.metaBlocks.length, 1);
  });

  await t.step("detects yml meta blocks", async () => {
    const result = await findAllRanges("```yml\nkey: value\n```");
    assertEquals(result.ranges.metaBlocks.length, 1);
  });

  await t.step("detects headings", async () => {
    const result = await findAllRanges("# Heading 1\n\n## Heading 2");
    assertEquals(result.ranges.headings.length, 2);
    // Each heading should have start and end indices
    for (const heading of result.ranges.headings) {
      assertEquals(heading.length, 2);
    }
  });

  await t.step("detects lists", async () => {
    const result = await findAllRanges("- item 1\n- item 2\n- item 3");
    assertEquals(result.ranges.lists.length, 1);
    // List should have start and end indices
    assertEquals(result.ranges.lists[0].length, 2);
  });

  await t.step("detects multiple lists", async () => {
    const result = await findAllRanges(
      "- list 1 item\n\nparagraph\n\n- list 2 item",
    );
    assertEquals(result.ranges.lists.length, 2);
  });

  await t.step("handles empty document", async () => {
    const result = await findAllRanges("");
    assertEquals(result.ranges.codeBlocks.length, 0);
    assertEquals(result.ranges.headings.length, 0);
    assertEquals(result.ranges.metaBlocks.length, 0);
    assertEquals(result.ranges.lists.length, 0);
  });

  await t.step("separates code blocks from meta blocks correctly", async () => {
    const result = await findAllRanges(
      '```ts\ncode here\n```\n\n```json\n{"config": true}\n```',
    );
    assertEquals(result.ranges.codeBlocks.length, 1);
    assertEquals(result.ranges.metaBlocks.length, 1);
  });

  await t.step("detects zod schema blocks", async () => {
    const result = await findAllRanges(
      "```zod\nexport const schema = z.object({});\n```",
    );
    assertEquals(result.ranges.schemaBlocks.length, 1);
    assertEquals(result.ranges.codeBlocks.length, 0);
    assertEquals(result.ranges.metaBlocks.length, 0);
  });

  await t.step("excludes code blocks with skip attribute", async () => {
    const result = await findAllRanges(
      "```js skip\nimport { pipe } from './foo.js';\n```",
    );
    assertEquals(result.ranges.codeBlocks.length, 0);
  });

  await t.step("excludes ts code blocks with skip attribute", async () => {
    const result = await findAllRanges(
      "```ts skip\nconsole.log('skipped');\n```",
    );
    assertEquals(result.ranges.codeBlocks.length, 0);
  });

  await t.step(
    "skip attribute does not affect non-skip code blocks",
    async () => {
      const result = await findAllRanges(
        "```js skip\nskipped\n```\n\n```js\nkept\n```",
      );
      assertEquals(result.ranges.codeBlocks.length, 1);
    },
  );

  await t.step("skip attribute does not affect meta blocks", async () => {
    const result = await findAllRanges(
      '```json\n{"key": "value"}\n```\n\n```ts skip\nskipped\n```',
    );
    assertEquals(result.ranges.metaBlocks.length, 1);
    assertEquals(result.ranges.codeBlocks.length, 0);
  });

  await t.step("handles mixed content", async () => {
    const markdown = `# Title

## Step One

Some description.

- check: /flag

\`\`\`ts
input.value = 1;
\`\`\`

\`\`\`json
{"inputs": []}
\`\`\`

## Step Two

\`\`\`js
input.other = 2;
\`\`\``;

    const result = await findAllRanges(markdown);
    assertEquals(result.ranges.headings.length, 3); // Title, Step One, Step Two
    assertEquals(result.ranges.codeBlocks.length, 2); // ts and js blocks
    assertEquals(result.ranges.metaBlocks.length, 1); // json block
    assertEquals(result.ranges.lists.length, 1); // check list
  });
});
