// Integration test for cross-pipe stack-trace fidelity.
//
// Asserts that when a sub-pipe step throws and the entry pipe propagates
// the result via Object.assign, the captured stack trace surfaces both
// the sub-pipe's markdown line AND the entry pipe's markdown line —
// i.e. that source maps for imported pipes are not lost.
//
// Also asserts that the runtime cli.ts template:
//   - prints the stack to stderr (instead of burying it in console.log)
//   - exits with a non-zero status (so CI / `pd run` propagates failure)
//
// Ref: templates/cli.ts, templates/trace.ts

// deno-lint-ignore no-import-prefix no-unversioned-import
import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { std } from "../deps.ts";

const PD_CLI = new URL("./mod.ts", import.meta.url).pathname;

async function runCli(
  files: Record<string, string>,
  args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  const dir = await Deno.makeTempDir({ prefix: "pdsubpipe-stack-" });
  try {
    for (const [name, content] of Object.entries(files)) {
      await Deno.writeTextFile(std.join(dir, name), content);
    }
    const cmd = new Deno.Command(Deno.execPath(), {
      args: ["run", "--allow-all", PD_CLI, ...args],
      cwd: dir,
      stdout: "piped",
      stderr: "piped",
    });
    const out = await cmd.output();
    return {
      code: out.code,
      stdout: new TextDecoder().decode(out.stdout),
      stderr: new TextDecoder().decode(out.stderr),
    };
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
}

Deno.test("cross-pipe stack-trace fidelity", async (t) => {
  const subPipe = `# SubPipeThrower

## Step One
\`\`\`ts
input.subPipeStep1 = true;
\`\`\`

## Throwing Step
\`\`\`ts
input.about = "throwing on next line";
throw new Error("sub-pipe boom");
\`\`\`
`;

  const callerPipe = `# SubPipeCaller

## Call Sub-Pipe
\`\`\`ts
import subPipeThrower from "subPipeThrower";
Object.assign(input, await subPipeThrower.process(input));
\`\`\`
`;

  const cleanPipe = `# CleanPipe

## Just Works
\`\`\`ts
input.ok = true;
\`\`\`
`;

  await t.step(
    "sub-pipe throw produces stack with both sub-pipe and entry markdown lines",
    async () => {
      const { code, stderr } = await runCli(
        { "subPipeThrower.md": subPipe, "subPipeCaller.md": callerPipe },
        ["run", "subPipeCaller.md", "--no-trace"],
      );

      // Templates now exit non-zero when output.errors is populated, and
      // pdRun propagates the child's exit code so `pd run` surfaces the
      // failure.
      assertEquals(code, 1, "expected non-zero exit; stderr: " + stderr);

      // The captured stack must reference BOTH the sub-pipe markdown
      // (where the throw happened) AND the entry pipe markdown (where
      // the sub-pipe was invoked). Earlier versions buried the stack
      // inside Deno's truncated console.log of the output object, and
      // some users perceived only the entry pipe line as visible.
      assertStringIncludes(stderr, "subPipeThrower.md");
      assertStringIncludes(stderr, "subPipeCaller.md");
      assertStringIncludes(stderr, "sub-pipe boom");
    },
  );

  await t.step("clean pipe still exits 0", async () => {
    const { code, stderr } = await runCli(
      { "clean.md": cleanPipe },
      ["run", "clean.md", "--no-trace"],
    );
    assertEquals(
      code,
      0,
      "expected zero exit on clean pipe; stderr: " + stderr,
    );
  });
});
