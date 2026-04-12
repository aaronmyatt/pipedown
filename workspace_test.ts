/**
 * workspace_test.ts — Tests for Phase 0 web-first workflow primitives.
 *
 * Covers:
 *   1. stepId assignment on first build
 *   2. stepId preservation across identical rebuilds
 *   3. stepId preservation when steps reorder
 *   4. stepId regeneration for new steps
 *   5. workspace metadata presence and correctness
 *   6. workspace metadata persisted in index.json output
 *
 * Uses the same test patterns as pdBuild_test.ts: in-memory markdown where
 * possible, Deno.makeTempDir for filesystem-dependent tests, with cleanup.
 *
 * Run with:
 *   ~/.deno/bin/deno test --no-check -A workspace_test.ts
 *
 * Ref: WEB_FIRST_WORKFLOW_PLAN.md §0 — Phase 0 checklist
 * Ref: pipedown.d.ts — Step.stepId, WorkspaceMetadata, SyncState
 */

import {
  assertEquals,
  assertExists,
  assertNotEquals,
  assertMatch,
} from "jsr:@std/assert";
import { join } from "jsr:@std/path@1.0.7";
import { exists } from "jsr:@std/fs@1.0.5";
import { mdToPipe } from "./mdToPipe.ts";
import { assignStepIds } from "./pdBuild.ts";
import { pdBuild } from "./pdBuild.ts";
import type { Input, Pipe, BuildInput, Step, WorkspaceMetadata } from "./pipedown.d.ts";

// ── Helpers ──

/**
 * UUID v4 regex for validating stepId format.
 * crypto.randomUUID() returns lowercase hex in 8-4-4-4-12 format.
 * Ref: https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * ISO-8601 datetime regex for validating timestamps.
 * Matches strings like "2026-04-12T10:30:00.000Z"
 */
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

/**
 * Parses markdown into a Pipe using mdToPipe, configured for testing
 * with a given pipe name and .pd directory path.
 *
 * @param markdown - Raw markdown source string
 * @param pipeName - Name for the output pipe directory
 * @param pdDir    - Path to the .pd directory (for dir/absoluteDir fields)
 * @returns Parsed Pipe object
 */
async function parsePipe(markdown: string, pipeName: string, pdDir: string): Promise<Pipe> {
  const dir = join(pdDir, pipeName);
  const output = await mdToPipe({
    markdown,
    pipe: {
      name: "",
      cleanName: "",
      steps: [],
      dir,
      absoluteDir: dir,
      fileName: pipeName,
      mdPath: join(pdDir, "..", `${pipeName}.md`),
      config: {},
    },
  } as { markdown: string; pipe: Pipe } & Input);
  return output.pipe as Pipe;
}

/**
 * Creates a minimal BuildInput that can be passed to assignStepIds.
 * The pipes array should already be populated with parsed Pipe objects.
 *
 * @param pipes - Array of parsed Pipe objects
 * @returns A BuildInput suitable for assignStepIds
 */
function makeBuildInput(pipes: Pipe[]): BuildInput {
  return {
    pipes,
    flags: { _: [] },
    globalConfig: {},
    projectPipes: [],
    output: {},
    debug: false,
  } as BuildInput;
}

// ── Sample Markdown Fixtures ──

/** A simple two-step pipe for basic testing. */
const TWO_STEP_MD = `# Test Pipe

## Step Alpha

\`\`\`ts
input.alpha = true;
\`\`\`

## Step Beta

\`\`\`ts
input.beta = true;
\`\`\`
`;

/** Same pipe with steps in reversed order (Beta before Alpha). */
const TWO_STEP_REVERSED_MD = `# Test Pipe

## Step Beta

\`\`\`ts
input.beta = true;
\`\`\`

## Step Alpha

\`\`\`ts
input.alpha = true;
\`\`\`
`;

/** Three-step pipe — the third step is new relative to TWO_STEP_MD. */
const THREE_STEP_MD = `# Test Pipe

## Step Alpha

\`\`\`ts
input.alpha = true;
\`\`\`

## Step Beta

\`\`\`ts
input.beta = true;
\`\`\`

## Step Gamma

\`\`\`ts
input.gamma = true;
\`\`\`
`;

// ── Test Suite ──

Deno.test("workspace: stepId assignment on first build", async (t) => {
  // On a fresh build with no prior index.json, every step should get
  // a newly generated UUID stepId.

  await t.step("all steps receive UUID stepIds", async () => {
    const tmpDir = await Deno.makeTempDir({ prefix: "pd_test_" });
    const pdDir = join(tmpDir, ".pd");

    try {
      const pipe = await parsePipe(TWO_STEP_MD, "testPipe", pdDir);
      const input = makeBuildInput([pipe]);

      // Run assignStepIds — no prior index.json exists, so all IDs are new.
      await assignStepIds(input);

      // Verify each step has a valid UUID stepId
      assertEquals(pipe.steps.length, 2, "Should have 2 steps");
      for (const step of pipe.steps) {
        assertExists(step.stepId, `Step "${step.funcName}" should have a stepId`);
        assertMatch(step.stepId!, UUID_REGEX, `stepId should be a valid UUID`);
      }

      // Verify the two stepIds are different
      assertNotEquals(
        pipe.steps[0].stepId,
        pipe.steps[1].stepId,
        "Each step should have a unique stepId"
      );
    } finally {
      // Clean up temp directory
      await Deno.remove(tmpDir, { recursive: true });
    }
  });
});

Deno.test("workspace: stepId preservation across identical rebuild", async (t) => {
  // When the same markdown is built twice, stepIds should be preserved
  // because funcNames match at the same indices.

  await t.step("stepIds are unchanged after rebuild with same markdown", async () => {
    const tmpDir = await Deno.makeTempDir({ prefix: "pd_test_" });
    const pdDir = join(tmpDir, ".pd");

    try {
      // ── First build ──
      const pipe1 = await parsePipe(TWO_STEP_MD, "testPipe", pdDir);
      const input1 = makeBuildInput([pipe1]);
      await assignStepIds(input1);

      // Capture first-build stepIds
      const firstBuildIds = pipe1.steps.map((s) => s.stepId);

      // Write index.json so the second build can read prior stepIds.
      // assignStepIds reads from pipe.dir/index.json.
      const pipeDir = join(pdDir, "testPipe");
      await Deno.mkdir(pipeDir, { recursive: true });
      await Deno.writeTextFile(
        join(pipeDir, "index.json"),
        JSON.stringify(pipe1, null, 2)
      );

      // ── Second build (identical markdown) ──
      const pipe2 = await parsePipe(TWO_STEP_MD, "testPipe", pdDir);
      const input2 = makeBuildInput([pipe2]);
      await assignStepIds(input2);

      // Verify stepIds are preserved
      assertEquals(pipe2.steps.length, 2);
      assertEquals(pipe2.steps[0].stepId, firstBuildIds[0], "StepAlpha ID should be preserved");
      assertEquals(pipe2.steps[1].stepId, firstBuildIds[1], "StepBeta ID should be preserved");
    } finally {
      await Deno.remove(tmpDir, { recursive: true });
    }
  });
});

Deno.test("workspace: stepId preservation when steps reorder", async (t) => {
  // When steps are reordered in markdown, stepIds should follow by funcName
  // (name-match), not by array index.

  await t.step("stepIds follow funcName when steps swap positions", async () => {
    const tmpDir = await Deno.makeTempDir({ prefix: "pd_test_" });
    const pdDir = join(tmpDir, ".pd");

    try {
      // ── First build (Alpha, Beta order) ──
      const pipe1 = await parsePipe(TWO_STEP_MD, "testPipe", pdDir);
      const input1 = makeBuildInput([pipe1]);
      await assignStepIds(input1);

      const alphaId = pipe1.steps[0].stepId!;
      const betaId = pipe1.steps[1].stepId!;

      // Write index.json for the second build to read
      const pipeDir = join(pdDir, "testPipe");
      await Deno.mkdir(pipeDir, { recursive: true });
      await Deno.writeTextFile(
        join(pipeDir, "index.json"),
        JSON.stringify(pipe1, null, 2)
      );

      // ── Second build (Beta, Alpha order — reversed) ──
      const pipe2 = await parsePipe(TWO_STEP_REVERSED_MD, "testPipe", pdDir);
      const input2 = makeBuildInput([pipe2]);
      await assignStepIds(input2);

      // After reorder: Beta is now at index 0, Alpha at index 1.
      // Their stepIds should follow by funcName, not by position.
      assertEquals(pipe2.steps[0].funcName, "StepBeta");
      assertEquals(pipe2.steps[1].funcName, "StepAlpha");

      assertEquals(
        pipe2.steps[0].stepId,
        betaId,
        "StepBeta should keep its original stepId despite moving to index 0"
      );
      assertEquals(
        pipe2.steps[1].stepId,
        alphaId,
        "StepAlpha should keep its original stepId despite moving to index 1"
      );
    } finally {
      await Deno.remove(tmpDir, { recursive: true });
    }
  });
});

Deno.test("workspace: stepId regeneration for new steps", async (t) => {
  // When a new step is added, existing steps keep their IDs and the new
  // step gets a fresh UUID.

  await t.step("old steps keep IDs, new step gets a new ID", async () => {
    const tmpDir = await Deno.makeTempDir({ prefix: "pd_test_" });
    const pdDir = join(tmpDir, ".pd");

    try {
      // ── First build (two steps) ──
      const pipe1 = await parsePipe(TWO_STEP_MD, "testPipe", pdDir);
      const input1 = makeBuildInput([pipe1]);
      await assignStepIds(input1);

      const alphaId = pipe1.steps[0].stepId!;
      const betaId = pipe1.steps[1].stepId!;

      // Write index.json
      const pipeDir = join(pdDir, "testPipe");
      await Deno.mkdir(pipeDir, { recursive: true });
      await Deno.writeTextFile(
        join(pipeDir, "index.json"),
        JSON.stringify(pipe1, null, 2)
      );

      // ── Second build (three steps — Gamma is new) ──
      const pipe2 = await parsePipe(THREE_STEP_MD, "testPipe", pdDir);
      const input2 = makeBuildInput([pipe2]);
      await assignStepIds(input2);

      assertEquals(pipe2.steps.length, 3);

      // Alpha and Beta should keep their original IDs
      assertEquals(pipe2.steps[0].stepId, alphaId, "StepAlpha should keep its ID");
      assertEquals(pipe2.steps[1].stepId, betaId, "StepBeta should keep its ID");

      // Gamma should have a new, different UUID
      const gammaId = pipe2.steps[2].stepId!;
      assertMatch(gammaId, UUID_REGEX, "StepGamma should have a valid UUID");
      assertNotEquals(gammaId, alphaId, "Gamma's ID should differ from Alpha's");
      assertNotEquals(gammaId, betaId, "Gamma's ID should differ from Beta's");
    } finally {
      await Deno.remove(tmpDir, { recursive: true });
    }
  });
});

Deno.test("workspace: metadata presence after build", async (t) => {
  // After assignStepIds runs, each pipe should have workspace metadata
  // with syncState "clean", a valid lastBuiltAt timestamp, and
  // lastModifiedBy "build".

  await t.step("workspace metadata has correct initial values", async () => {
    const tmpDir = await Deno.makeTempDir({ prefix: "pd_test_" });
    const pdDir = join(tmpDir, ".pd");

    try {
      const pipe = await parsePipe(TWO_STEP_MD, "testPipe", pdDir);
      const input = makeBuildInput([pipe]);

      // Capture time before and after to bracket the timestamp
      const before = new Date().toISOString();
      await assignStepIds(input);
      const after = new Date().toISOString();

      // Verify workspace metadata exists
      assertExists(pipe.workspace, "Pipe should have workspace metadata");

      const ws = pipe.workspace!;

      // syncState should be "clean" after a build
      assertEquals(ws.syncState, "clean", "syncState should be 'clean' after build");

      // lastBuiltAt should be a valid ISO timestamp between before and after
      assertExists(ws.lastBuiltAt, "lastBuiltAt should be set");
      assertMatch(ws.lastBuiltAt!, ISO_DATE_REGEX, "lastBuiltAt should be ISO format");

      // The timestamp should fall within our bracket
      const builtAt = ws.lastBuiltAt!;
      assertEquals(
        builtAt >= before && builtAt <= after,
        true,
        `lastBuiltAt (${builtAt}) should be between ${before} and ${after}`
      );

      // lastModifiedBy should be "build"
      assertEquals(ws.lastModifiedBy, "build", "lastModifiedBy should be 'build'");

      // contentHash is intentionally undefined in the first cut
      assertEquals(ws.contentHash, undefined, "contentHash should be undefined for now");
    } finally {
      await Deno.remove(tmpDir, { recursive: true });
    }
  });
});

Deno.test("workspace: metadata persisted in index.json via full pdBuild", async (t) => {
  // Integration test: run the full pdBuild pipeline with a real temp
  // directory and verify that the written index.json contains both
  // stepIds and workspace metadata.

  await t.step("index.json contains stepIds and workspace after full build", async () => {
    const tmpDir = await Deno.makeTempDir({ prefix: "pd_test_build_" });

    try {
      // Write a markdown file in the temp directory
      const mdPath = join(tmpDir, "testPipe.md");
      await Deno.writeTextFile(mdPath, TWO_STEP_MD);

      // Run the full build pipeline pointing at the temp directory.
      // pdBuild walks the cwd for .md files, parses them, and writes
      // to .pd/ under the same root.
      const buildInput: BuildInput = {
        cwd: tmpDir,
        flags: { _: [] },
        globalConfig: {},
        projectPipes: [],
        output: {},
        debug: false,
      } as BuildInput;

      await pdBuild(buildInput);

      // Read the generated index.json
      const indexJsonPath = join(tmpDir, ".pd", "testPipe", "index.json");
      assertEquals(
        await exists(indexJsonPath),
        true,
        "index.json should exist after build"
      );

      const pipeData: Pipe = JSON.parse(await Deno.readTextFile(indexJsonPath));

      // Verify stepIds are present and valid
      assertEquals(pipeData.steps.length, 2, "Should have 2 steps");
      for (const step of pipeData.steps) {
        assertExists(step.stepId, `Step "${step.funcName}" should have a stepId in index.json`);
        assertMatch(step.stepId!, UUID_REGEX, "stepId should be a valid UUID");
      }

      // Verify workspace metadata is present
      assertExists(pipeData.workspace, "workspace metadata should be in index.json");
      assertEquals(pipeData.workspace!.syncState, "clean");
      assertExists(pipeData.workspace!.lastBuiltAt);
      assertMatch(pipeData.workspace!.lastBuiltAt!, ISO_DATE_REGEX);
      assertEquals(pipeData.workspace!.lastModifiedBy, "build");
    } finally {
      await Deno.remove(tmpDir, { recursive: true });
    }
  });
});
