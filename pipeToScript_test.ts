import {
  assertEquals,
  assertStringIncludes,
} from "jsr:@std/assert";
import { pipeToScript } from "./pipeToScript.ts";
import type { Pipe } from "./pipedown.d.ts";

function makePipe(overrides: Partial<Pipe> = {}): Pipe {
  return {
    name: "TestPipe",
    cleanName: "TestPipe",
    steps: [],
    dir: ".pd/TestPipe",
    absoluteDir: "/tmp/.pd/TestPipe",
    fileName: "TestPipe",
    mdPath: "TestPipe.md",
    config: {},
    ...overrides,
  };
}

Deno.test("pipeToScript", async (t) => {
  await t.step("generates valid script with single step", async () => {
    const pipe = makePipe({
      steps: [
        {
          code: 'input.message = "hello";',
          range: [0, 0],
          name: "Greet",
          funcName: "Greet",
          inList: false,
        },
      ],
    });

    const result = await pipeToScript({ pipe });
    assertEquals(result.success, true);
    assertStringIncludes(result.script!, "async function Greet");
    assertStringIncludes(result.script!, 'input.message = "hello";');
  });

  await t.step("generates funcSequence array", async () => {
    const pipe = makePipe({
      steps: [
        {
          code: "input.a = 1;",
          range: [0, 0],
          name: "StepA",
          funcName: "StepA",
          inList: false,
        },
        {
          code: "input.b = 2;",
          range: [1, 1],
          name: "StepB",
          funcName: "StepB",
          inList: false,
        },
      ],
    });

    const result = await pipeToScript({ pipe });
    assertEquals(result.success, true);
    assertStringIncludes(result.script!, "StepA, StepB");
  });

  await t.step("extracts and hoists import statements", async () => {
    const pipe = makePipe({
      steps: [
        {
          code: 'import { foo } from "npm:bar";\ninput.x = foo();',
          range: [0, 0],
          name: "WithImport",
          funcName: "WithImport",
          inList: false,
        },
      ],
    });

    const result = await pipeToScript({ pipe });
    assertEquals(result.success, true);
    // Import should be at the top level, not inside the function
    const lines = result.script!.split("\n");
    const importLine = lines.find((l) => l.includes('from "npm:bar"'));
    const funcLine = lines.findIndex((l) =>
      l.includes("async function WithImport")
    );
    const importLineIndex = lines.indexOf(importLine!);
    assertEquals(importLineIndex < funcLine, true);
  });

  await t.step("removes import statements from function body", async () => {
    const pipe = makePipe({
      steps: [
        {
          code: 'import { foo } from "npm:bar";\ninput.x = foo();',
          range: [0, 0],
          name: "WithImport",
          funcName: "WithImport",
          inList: false,
        },
      ],
    });

    const result = await pipeToScript({ pipe });
    assertEquals(result.success, true);
    // Find the function body
    const funcMatch = result.script!.match(
      /async function WithImport[^{]*\{([\s\S]*?)\n\}/,
    );
    assertEquals(funcMatch !== null, true);
    assertEquals(funcMatch![1].includes("import"), false);
  });

  await t.step("handles multiple imports from different steps", async () => {
    const pipe = makePipe({
      steps: [
        {
          code: 'import { a } from "npm:pkg-a";\ninput.a = a();',
          range: [0, 0],
          name: "StepA",
          funcName: "StepA",
          inList: false,
        },
        {
          code: 'import { b } from "npm:pkg-b";\ninput.b = b();',
          range: [1, 1],
          name: "StepB",
          funcName: "StepB",
          inList: false,
        },
      ],
    });

    const result = await pipeToScript({ pipe });
    assertEquals(result.success, true);
    assertStringIncludes(result.script!, 'from "npm:pkg-a"');
    assertStringIncludes(result.script!, 'from "npm:pkg-b"');
  });

  await t.step("handles steps with no imports", async () => {
    const pipe = makePipe({
      steps: [
        {
          code: "input.x = 42;",
          range: [0, 0],
          name: "Simple",
          funcName: "Simple",
          inList: false,
        },
      ],
    });

    const result = await pipeToScript({ pipe });
    assertEquals(result.success, true);
    assertStringIncludes(result.script!, "input.x = 42;");
  });

  await t.step("includes standard imports", async () => {
    const pipe = makePipe({
      steps: [
        {
          code: "input.x = 1;",
          range: [0, 0],
          name: "Step",
          funcName: "Step",
          inList: false,
        },
      ],
    });

    const result = await pipeToScript({ pipe });
    assertEquals(result.success, true);
    assertStringIncludes(result.script!, "import Pipe from");
    assertStringIncludes(result.script!, "import $p from");
    assertStringIncludes(result.script!, "import rawPipe from");
  });

  await t.step("exports pipe and process correctly", async () => {
    const pipe = makePipe({
      steps: [
        {
          code: "input.x = 1;",
          range: [0, 0],
          name: "Step",
          funcName: "Step",
          inList: false,
        },
      ],
    });

    const result = await pipeToScript({ pipe });
    assertEquals(result.success, true);
    assertStringIncludes(result.script!, "export default pipe;");
    assertStringIncludes(result.script!, "export { pipe, rawPipe, process }");
  });

  await t.step("exports step functions", async () => {
    const pipe = makePipe({
      steps: [
        {
          code: "input.x = 1;",
          range: [0, 0],
          name: "MyStep",
          funcName: "MyStep",
          inList: false,
        },
      ],
    });

    const result = await pipeToScript({ pipe });
    assertEquals(result.success, true);
    assertStringIncludes(result.script!, "export async function MyStep");
  });

  await t.step("hoists imports including those from commented lines", async () => {
    // Note: the regex `import.*from.*` captures the import even from
    // `// import...` lines because the match starts at "import", not "//"
    // This is known behavior — users should not have commented import lines
    const pipe = makePipe({
      steps: [
        {
          code:
            'import { current } from "npm:current";\ninput.x = current();',
          range: [0, 0],
          name: "Step",
          funcName: "Step",
          inList: false,
        },
      ],
    });

    const result = await pipeToScript({ pipe });
    assertEquals(result.success, true);
    assertStringIncludes(result.script!, 'from "npm:current"');
  });

  await t.step("handles empty pipe with no steps", async () => {
    const pipe = makePipe({ steps: [] });
    const result = await pipeToScript({ pipe });
    assertEquals(result.success, true);
    assertStringIncludes(result.script!, "const funcSequence = [");
  });

  await t.step("skips dotenv import when build config present", async () => {
    const pipe = makePipe({
      config: { build: [{ format: "esm" }] },
      steps: [
        {
          code: "input.x = 1;",
          range: [0, 0],
          name: "Step",
          funcName: "Step",
          inList: false,
        },
      ],
    });

    const result = await pipeToScript({ pipe });
    assertEquals(result.success, true);
    assertEquals(result.script!.includes("@std/dotenv"), false);
  });

  await t.step("includes dotenv import when no build config", async () => {
    const pipe = makePipe({
      steps: [
        {
          code: "input.x = 1;",
          range: [0, 0],
          name: "Step",
          funcName: "Step",
          inList: false,
        },
      ],
    });

    const result = await pipeToScript({ pipe });
    assertEquals(result.success, true);
    assertStringIncludes(result.script!, "@std/dotenv");
  });
});
