import { assert, assertEquals } from "@std/assert";
import { pdBuild } from "./pdBuild.ts";
import type { BuildInput, Pipe } from "./pipedown.d.ts";
import { std } from "./deps.ts";

// ── Integration fixtures ──
// These tests exercise the *real* pdBuild pipeline (including
// defaultTemplateFiles + resolveDependencies + writePipeJson) so we can catch
// end-to-end regression bugs that unit-level regex tests miss.

/**
 * Create a minimal temporary project containing two pipes:
 *
 *   1) authModule.md  -> exported pipe name "authModule"
 *   2) main.md        -> imports "authModule" and "./helpers.ts"
 *
 * This gives us one inter-pipe dependency plus one local-file dependency.
 *
 * @returns Absolute path to the temporary project root
 */
async function createFixtureProject(): Promise<string> {
  // Deno.makeTempDir() creates an isolated test workspace that is safe to
  // mutate freely and delete at the end of the test.
  // Ref: https://docs.deno.com/api/deno/~/Deno.makeTempDir
  const root = await Deno.makeTempDir({ prefix: "pd-resolve-deps-" });

  await Deno.writeTextFile(
    std.join(root, "authModule.md"),
    `# Auth Module

## Make Auth

\`\`\`ts
input.auth = { token: "fixture-token" };
\`\`\`
`,
  );

  await Deno.writeTextFile(
    std.join(root, "main.md"),
    `# Main

## Compose

\`\`\`ts
import authModule from "authModule";
import { helper } from "./helpers.ts";

const auth = await authModule.process(input);
input.result = helper(auth);
\`\`\`
`,
  );

  await Deno.writeTextFile(
    std.join(root, "helpers.ts"),
    `export function helper(value: unknown): unknown {
  return value;
}
`,
  );

  return root;
}

/**
 * Read and parse a generated pipe JSON file from .pd/<pipeName>/index.json.
 *
 * @param projectRoot - Fixture project root
 * @param pipeName - Pipe directory name under .pd/
 * @returns Parsed Pipe object
 */
async function readGeneratedPipe(
  projectRoot: string,
  pipeName: string,
): Promise<Pipe> {
  const path = std.join(projectRoot, ".pd", pipeName, "index.json");
  const content = await Deno.readTextFile(path);
  return JSON.parse(content) as Pipe;
}

Deno.test("pdBuild: resolveDependencies persists pipe + local file deps into index.json", async () => {
  const projectRoot = await createFixtureProject();

  try {
    // Build from an explicit cwd override. This is the same code path used by
    // dashboard/server builds that target a project different from Deno.cwd().
    await pdBuild({ cwd: projectRoot } as BuildInput);

    const mainPipe = await readGeneratedPipe(projectRoot, "main");

    // Ensure inter-pipe import classification is persisted.
    assertEquals(mainPipe.dependencies?.pipes, ["authModule"]);

    // Ensure relative local file imports are persisted for file watchers.
    assertEquals(mainPipe.dependencies?.localFiles, ["./helpers.ts"]);
  } finally {
    // Always clean up temp fixtures, even when assertions fail.
    // Ref: https://docs.deno.com/api/deno/~/Deno.remove
    await Deno.remove(projectRoot, { recursive: true });
  }
});

Deno.test("pdBuild: defaultTemplateFiles honors input.cwd and writes import map for target project", async () => {
  const projectRoot = await createFixtureProject();

  try {
    await pdBuild({ cwd: projectRoot } as BuildInput);

    const denoJsonPath = std.join(projectRoot, ".pd", "deno.json");
    assert(await std.exists(denoJsonPath));

    const denoConfig = JSON.parse(
      await Deno.readTextFile(denoJsonPath),
    ) as {
      imports: Record<string, string>;
    };

    // These entries prove the import map was generated from the fixture's
    // .pd directory, not from the command process cwd.
    assertEquals(denoConfig.imports.authModule, "./authModule/index.ts");
    assertEquals(denoConfig.imports.main, "./main/index.ts");

    // Guard against the previous bug: when defaultTemplateFiles walked the
    // command cwd's .pd folder, unrelated keys like "LLM" leaked in here.
    assertEquals("LLM" in denoConfig.imports, false);
  } finally {
    await Deno.remove(projectRoot, { recursive: true });
  }
});
