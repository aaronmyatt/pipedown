// deno-lint-ignore no-import-prefix no-unversioned-import
import { assertEquals } from "jsr:@std/assert";
import { std } from "../deps.ts";
import {
  formatLintEntry,
  lintProject,
  reportParseDiagnostics,
} from "./lintCheck.ts";
import type { CliInput, PDError } from "../pipedown.d.ts";

function fakeInput(cwd: string): CliInput {
  return {
    flags: { _: [] } as unknown as CliInput["flags"],
    globalConfig: {},
    projectPipes: [],
    errors: [],
    output: { errors: [] },
    debug: false,
    cwd,
  } as CliInput;
}

async function withTempProject(
  files: Record<string, string>,
  fn: (dir: string) => Promise<void>,
) {
  const dir = await Deno.makeTempDir({ prefix: "pdlint-" });
  try {
    for (const [name, content] of Object.entries(files)) {
      await Deno.writeTextFile(std.join(dir, name), content);
    }
    await fn(dir);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
}

Deno.test("lintProject", async (t) => {
  await t.step(
    "returns no errors or warnings for clean project",
    async () => {
      await withTempProject({
        "clean.md": `# Clean

## Step
\`\`\`ts
input.x = 1;
\`\`\`
`,
      }, async (dir) => {
        const result = await lintProject(fakeInput(dir));
        assertEquals(result.errors.length, 0);
        assertEquals(result.warnings.length, 0);
        assertEquals(result.filesChecked, 1);
      });
    },
  );

  await t.step("collects warnings from typo'd directives", async () => {
    await withTempProject({
      "typo.md": `# Typo

## Step
- chek: /flag
- \`\`\`ts
  input.x = 1;
  \`\`\`
`,
    }, async (dir) => {
      const result = await lintProject(fakeInput(dir));
      assertEquals(result.errors.length, 0);
      assertEquals(result.warnings.length, 1);
      assertEquals(result.warnings[0].message.includes("chek"), true);
    });
  });

  await t.step("collects errors from malformed JSON config block", async () => {
    await withTempProject({
      "broken.md": `# Broken

\`\`\`json
{ "inputs": [ { broken
\`\`\`

## Step
\`\`\`ts
input.x = 1;
\`\`\`
`,
    }, async (dir) => {
      const result = await lintProject(fakeInput(dir));
      assertEquals(result.errors.length >= 1, true);
    });
  });

  await t.step("scopes lint to a single pipe via match", async () => {
    await withTempProject({
      "good.md": `# Good

## Step
\`\`\`ts
input.x = 1;
\`\`\`
`,
      "bad.md": `# Bad

## Step
- chek: /flag
- \`\`\`ts
  input.x = 1;
  \`\`\`
`,
    }, async (dir) => {
      const onlyGood = await lintProject(fakeInput(dir), {
        match: "good\\.md",
      });
      assertEquals(onlyGood.warnings.length, 0);
      assertEquals(onlyGood.filesChecked, 1);

      const onlyBad = await lintProject(fakeInput(dir), { match: "bad\\.md" });
      assertEquals(onlyBad.warnings.length, 1);
      assertEquals(onlyBad.filesChecked, 1);
    });
  });
});

Deno.test("formatLintEntry", () => {
  const err = Object.assign(new Error("oops"), {
    func: "setupChecks",
    severity: "warning" as const,
    filePath: "auth.md",
    line: 42,
    column: 3,
  }) as PDError;
  assertEquals(formatLintEntry(err), "auth.md:42:3 warning: oops");

  const err2 = Object.assign(new Error("kaboom"), {
    func: "mergeMetaConfig",
    severity: "error" as const,
    filePath: "broken.md",
    line: 7,
  }) as PDError;
  assertEquals(formatLintEntry(err2), "broken.md:7:1 error: kaboom");

  const err3 = Object.assign(new Error("no info"), {
    func: "x",
  }) as PDError;
  assertEquals(formatLintEntry(err3), "<unknown>:1:1 error: no info");
});

Deno.test("reportParseDiagnostics", async (t) => {
  function makeError(
    filePath: string,
    severity: "error" | "warning" = "error",
  ): PDError {
    return Object.assign(new Error(`oops in ${filePath}`), {
      func: "test",
      severity,
      filePath,
      line: 3,
    }) as PDError;
  }

  await t.step(
    "scopeToFile narrows gate decision but prints all diagnostics",
    () => {
      const input = {
        flags: { _: [] } as unknown as CliInput["flags"],
        globalConfig: {},
        projectPipes: [],
        errors: [
          makeError("/abs/clean.md"),
          makeError("/abs/broken.md"),
          makeError("/abs/typo.md", "warning"),
        ],
        output: { errors: [] },
        debug: false,
      } as CliInput;

      const result = reportParseDiagnostics(input, {
        scopeToFile: "clean.md",
      });
      assertEquals(result.errorCount, 2);
      assertEquals(result.warningCount, 1);
      assertEquals(result.relevantErrorCount, 1);
    },
  );

  await t.step(
    "scopeToFile does not match different file with similar suffix",
    () => {
      const input = {
        flags: { _: [] } as unknown as CliInput["flags"],
        globalConfig: {},
        projectPipes: [],
        errors: [makeError("/abs/superfoo.md")],
        output: { errors: [] },
        debug: false,
      } as CliInput;

      const result = reportParseDiagnostics(input, {
        scopeToFile: "foo.md",
      });
      assertEquals(result.errorCount, 1);
      assertEquals(result.relevantErrorCount, 0);
    },
  );

  await t.step("no scope means all errors are relevant", () => {
    const input = {
      flags: { _: [] } as unknown as CliInput["flags"],
      globalConfig: {},
      projectPipes: [],
      errors: [
        makeError("/abs/a.md"),
        makeError("/abs/b.md"),
      ],
      output: { errors: [] },
      debug: false,
    } as CliInput;

    const result = reportParseDiagnostics(input);
    assertEquals(result.errorCount, 2);
    assertEquals(result.relevantErrorCount, 2);
  });
});
