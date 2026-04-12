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
import { assignStepIds, computeStepFingerprint } from "./pdBuild.ts";
import { pdBuild } from "./pdBuild.ts";
import { pipeToMarkdown } from "./pipeToMarkdown.ts";
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

/**
 * Two-step pipe where "Step Alpha" has been renamed to "Step AlphaRenamed".
 * The funcName changes, so stepId should NOT be preserved (it's a different step).
 */
const TWO_STEP_RENAMED_MD = `# Test Pipe

## Step AlphaRenamed

\`\`\`ts
input.alpha = true;
\`\`\`

## Step Beta

\`\`\`ts
input.beta = true;
\`\`\`
`;

/**
 * Two-step pipe with different code in Step Alpha (for fingerprint testing).
 * The funcName stays the same but the code logic changes.
 */
const TWO_STEP_CHANGED_CODE_MD = `# Test Pipe

## Step Alpha

\`\`\`ts
input.alpha = "changed";
input.extra = 42;
\`\`\`

## Step Beta

\`\`\`ts
input.beta = true;
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

// ── Sync-State Transition Tests ──
// Verify the workspace syncState lifecycle:
//   build → "clean", simulated structured edit → "json_dirty", sync → "clean"
// Ref: WEB_FIRST_WORKFLOW_PLAN.md §7.3

Deno.test("workspace: sync-state transitions (clean → json_dirty → clean)", async (t) => {
  await t.step("build sets clean, structured edit sets json_dirty, sync restores clean", async () => {
    const tmpDir = await Deno.makeTempDir({ prefix: "pd_test_sync_" });

    try {
      // ── Step 1: Initial build → syncState should be "clean" ──
      const mdPath = join(tmpDir, "testPipe.md");
      await Deno.writeTextFile(mdPath, TWO_STEP_MD);

      const buildInput: BuildInput = {
        cwd: tmpDir,
        flags: { _: [] },
        globalConfig: {},
        projectPipes: [],
        output: {},
        debug: false,
      } as BuildInput;

      await pdBuild(buildInput);

      const indexJsonPath = join(tmpDir, ".pd", "testPipe", "index.json");
      let pipeData: Pipe = JSON.parse(await Deno.readTextFile(indexJsonPath));

      assertEquals(
        pipeData.workspace?.syncState,
        "clean",
        "After build, syncState should be 'clean'"
      );

      // ── Step 2: Simulate a structured edit ──
      // In the web-first workflow, the web UI or Pi would mutate index.json
      // directly and set syncState to "json_dirty". We simulate this by
      // reading, modifying, and writing index.json.
      pipeData.steps[0].code = 'input.alpha = "modified";';
      pipeData.workspace = {
        ...pipeData.workspace!,
        syncState: "json_dirty",
        lastModifiedBy: "web_edit",
      };
      await Deno.writeTextFile(indexJsonPath, JSON.stringify(pipeData, null, 2));

      // Re-read and verify the dirty state persisted
      pipeData = JSON.parse(await Deno.readTextFile(indexJsonPath));
      assertEquals(
        pipeData.workspace?.syncState,
        "json_dirty",
        "After structured edit, syncState should be 'json_dirty'"
      );
      assertEquals(
        pipeData.workspace?.lastModifiedBy,
        "web_edit",
        "lastModifiedBy should reflect the web edit"
      );

      // ── Step 3: Simulate sync ──
      // `pd sync` regenerates markdown from index.json, writes it, then
      // rebuilds. We simulate this by calling pipeToMarkdown, writing the
      // result, and running pdBuild again (the same steps syncCommand does).
      const markdown = pipeToMarkdown(pipeData);
      await Deno.writeTextFile(mdPath, markdown);

      // Rebuild (same as sync's auto-rebuild step)
      await pdBuild(buildInput);

      // Re-read the rebuilt index.json
      pipeData = JSON.parse(await Deno.readTextFile(indexJsonPath));
      assertEquals(
        pipeData.workspace?.syncState,
        "clean",
        "After sync + rebuild, syncState should be 'clean'"
      );
      assertEquals(
        pipeData.workspace?.lastModifiedBy,
        "build",
        "lastModifiedBy should be 'build' after rebuild"
      );
    } finally {
      await Deno.remove(tmpDir, { recursive: true });
    }
  });
});

// ── Step Rename → New ID Test ──
// When a step is renamed (funcName changes), the matching logic cannot find
// a prior step with the same funcName, so the step should get a new UUID.
// Ref: WEB_FIRST_WORKFLOW_PLAN.md §4.1-C — "if a step cannot be matched
// confidently, generate a new stepId"

Deno.test("workspace: renamed step gets a new stepId", async (t) => {
  await t.step("renaming a step heading produces a different stepId", async () => {
    const tmpDir = await Deno.makeTempDir({ prefix: "pd_test_rename_" });
    const pdDir = join(tmpDir, ".pd");

    try {
      // ── First build (original names) ──
      const pipe1 = await parsePipe(TWO_STEP_MD, "testPipe", pdDir);
      const input1 = makeBuildInput([pipe1]);
      await assignStepIds(input1);

      const originalAlphaId = pipe1.steps[0].stepId!;
      const originalBetaId = pipe1.steps[1].stepId!;

      // Write index.json for the second build to read
      const pipeDir = join(pdDir, "testPipe");
      await Deno.mkdir(pipeDir, { recursive: true });
      await Deno.writeTextFile(
        join(pipeDir, "index.json"),
        JSON.stringify(pipe1, null, 2)
      );

      // ── Second build (Alpha renamed to AlphaRenamed) ──
      const pipe2 = await parsePipe(TWO_STEP_RENAMED_MD, "testPipe", pdDir);
      const input2 = makeBuildInput([pipe2]);
      await assignStepIds(input2);

      // "StepAlphaRenamed" has a different funcName — no match in prior steps.
      // It should get a brand-new stepId.
      assertEquals(pipe2.steps[0].funcName, "StepAlphaRenamed");
      assertMatch(pipe2.steps[0].stepId!, UUID_REGEX, "Renamed step should have a valid UUID");
      assertNotEquals(
        pipe2.steps[0].stepId,
        originalAlphaId,
        "Renamed step should NOT reuse the original Alpha stepId"
      );

      // Beta was not renamed — it should keep its original ID.
      assertEquals(pipe2.steps[1].funcName, "StepBeta");
      assertEquals(
        pipe2.steps[1].stepId,
        originalBetaId,
        "Unrenamed StepBeta should keep its original stepId"
      );
    } finally {
      await Deno.remove(tmpDir, { recursive: true });
    }
  });
});

// ── Step Fingerprint Tests ──
// Fingerprints are SHA-256 hashes of a step's meaningful content (code,
// funcName, config). They enable the session layer to detect stale steps
// and decide which upstream snapshots can be safely reused.
//
// Ref: WEB_FIRST_WORKFLOW_PLAN.md §4.1-C (fingerprint field)
// Ref: WEB_FIRST_WORKFLOW_PLAN.md §8.3 (snapshot reuse model)

/** Hex SHA-256 hash is exactly 64 lowercase hex characters. */
const SHA256_HEX_REGEX = /^[0-9a-f]{64}$/;

Deno.test("workspace: step fingerprints computed during build", async (t) => {
  await t.step("all steps have valid SHA-256 fingerprints after assignStepIds", async () => {
    const tmpDir = await Deno.makeTempDir({ prefix: "pd_test_fp_" });
    const pdDir = join(tmpDir, ".pd");

    try {
      const pipe = await parsePipe(TWO_STEP_MD, "testPipe", pdDir);
      const input = makeBuildInput([pipe]);
      await assignStepIds(input);

      for (const step of pipe.steps) {
        assertExists(step.fingerprint, `Step "${step.funcName}" should have a fingerprint`);
        assertMatch(
          step.fingerprint!,
          SHA256_HEX_REGEX,
          `Fingerprint should be a 64-char hex string`
        );
      }

      // Two different steps should have different fingerprints
      // (they have different code and funcNames).
      assertNotEquals(
        pipe.steps[0].fingerprint,
        pipe.steps[1].fingerprint,
        "Different steps should have different fingerprints"
      );
    } finally {
      await Deno.remove(tmpDir, { recursive: true });
    }
  });
});

Deno.test("workspace: identical code produces identical fingerprint", async (t) => {
  // Building the same markdown twice should produce the same fingerprint
  // for each step, because the code/funcName/config haven't changed.

  await t.step("fingerprints are stable across identical rebuilds", async () => {
    const tmpDir = await Deno.makeTempDir({ prefix: "pd_test_fp_stable_" });
    const pdDir = join(tmpDir, ".pd");

    try {
      // First build
      const pipe1 = await parsePipe(TWO_STEP_MD, "testPipe", pdDir);
      const input1 = makeBuildInput([pipe1]);
      await assignStepIds(input1);
      const fp1 = pipe1.steps.map((s) => s.fingerprint);

      // Second build (identical markdown)
      const pipe2 = await parsePipe(TWO_STEP_MD, "testPipe", pdDir);
      const input2 = makeBuildInput([pipe2]);
      await assignStepIds(input2);
      const fp2 = pipe2.steps.map((s) => s.fingerprint);

      assertEquals(fp1, fp2, "Fingerprints should be identical for identical source");
    } finally {
      await Deno.remove(tmpDir, { recursive: true });
    }
  });
});

Deno.test("workspace: code change produces different fingerprint", async (t) => {
  // When a step's code changes, its fingerprint should change.
  // Steps whose code did NOT change should keep the same fingerprint.

  await t.step("changed step gets new fingerprint, unchanged step keeps old", async () => {
    const tmpDir = await Deno.makeTempDir({ prefix: "pd_test_fp_change_" });
    const pdDir = join(tmpDir, ".pd");

    try {
      // Build with original code
      const pipe1 = await parsePipe(TWO_STEP_MD, "testPipe", pdDir);
      const input1 = makeBuildInput([pipe1]);
      await assignStepIds(input1);
      const alphaFp1 = pipe1.steps[0].fingerprint!;
      const betaFp1 = pipe1.steps[1].fingerprint!;

      // Build with changed code in Step Alpha
      const pipe2 = await parsePipe(TWO_STEP_CHANGED_CODE_MD, "testPipe", pdDir);
      const input2 = makeBuildInput([pipe2]);
      await assignStepIds(input2);
      const alphaFp2 = pipe2.steps[0].fingerprint!;
      const betaFp2 = pipe2.steps[1].fingerprint!;

      // Alpha's code changed → fingerprint should differ
      assertNotEquals(
        alphaFp1,
        alphaFp2,
        "Step Alpha fingerprint should change when code changes"
      );

      // Beta's code is identical → fingerprint should be the same
      assertEquals(
        betaFp1,
        betaFp2,
        "Step Beta fingerprint should stay the same when code is unchanged"
      );
    } finally {
      await Deno.remove(tmpDir, { recursive: true });
    }
  });
});

Deno.test("workspace: computeStepFingerprint is deterministic", async (t) => {
  // Calling computeStepFingerprint multiple times on the same step
  // should always produce the same hash.

  await t.step("same step produces same fingerprint on repeated calls", async () => {
    const step: Step = {
      code: 'input.x = 42;',
      funcName: "TestStep",
      name: "Test Step",
      range: [0, 1],
      inList: false,
      config: { checks: ["/x"] },
    };

    const fp1 = await computeStepFingerprint(step);
    const fp2 = await computeStepFingerprint(step);
    const fp3 = await computeStepFingerprint(step);

    assertEquals(fp1, fp2, "First and second call should match");
    assertEquals(fp2, fp3, "Second and third call should match");
    assertMatch(fp1, SHA256_HEX_REGEX, "Should be valid SHA-256 hex");
  });
});

Deno.test("workspace: fingerprints persisted in index.json via full pdBuild", async (t) => {
  // Integration test: verify fingerprints appear in the written index.json
  // alongside stepIds and workspace metadata.

  await t.step("index.json contains fingerprints after full build", async () => {
    const tmpDir = await Deno.makeTempDir({ prefix: "pd_test_fp_build_" });

    try {
      const mdPath = join(tmpDir, "testPipe.md");
      await Deno.writeTextFile(mdPath, TWO_STEP_MD);

      const buildInput: BuildInput = {
        cwd: tmpDir,
        flags: { _: [] },
        globalConfig: {},
        projectPipes: [],
        output: {},
        debug: false,
      } as BuildInput;

      await pdBuild(buildInput);

      const indexJsonPath = join(tmpDir, ".pd", "testPipe", "index.json");
      const pipeData: Pipe = JSON.parse(await Deno.readTextFile(indexJsonPath));

      assertEquals(pipeData.steps.length, 2, "Should have 2 steps");
      for (const step of pipeData.steps) {
        assertExists(
          step.fingerprint,
          `Step "${step.funcName}" should have a fingerprint in index.json`
        );
        assertMatch(
          step.fingerprint!,
          SHA256_HEX_REGEX,
          "fingerprint should be a 64-char hex SHA-256 string"
        );
      }
    } finally {
      await Deno.remove(tmpDir, { recursive: true });
    }
  });
});

// ── Raw Markdown Overwrite Test ──
// When a user saves raw markdown (e.g. via an editor), the next pdBuild
// should treat the markdown as the source of truth, discarding any
// unsynchronised structured edits in index.json. This is the "markdown
// wins" rule: markdown is always canonical until explicitly synced.
//
// Ref: WEB_FIRST_WORKFLOW_PLAN.md §7 — "markdown overwrite" scenario

/** Alternate two-step pipe with completely different content for overwrite testing. */
const OVERWRITE_MD = `# Test Pipe

## Step One

\`\`\`ts
input.one = "from_markdown";
\`\`\`

## Step Two

\`\`\`ts
input.two = "from_markdown";
\`\`\`
`;

Deno.test("workspace: raw markdown save replaces unsynced structured state", async (t) => {
  // Scenario: a structured edit (json_dirty) exists in index.json, but
  // the user then overwrites the .md file with completely different content.
  // On the next pdBuild, the markdown content should win — the structured
  // edit is discarded because the markdown is always the canonical source.

  await t.step("rebuild after raw markdown save overwrites structured edits", async () => {
    const tmpDir = await Deno.makeTempDir({ prefix: "pd_test_overwrite_" });

    try {
      // ── Step 1: Initial build from TWO_STEP_MD ──
      // This creates index.json with StepAlpha and StepBeta, syncState "clean".
      const mdPath = join(tmpDir, "testPipe.md");
      await Deno.writeTextFile(mdPath, TWO_STEP_MD);

      const buildInput: BuildInput = {
        cwd: tmpDir,
        flags: { _: [] },
        globalConfig: {},
        projectPipes: [],
        output: {},
        debug: false,
      } as BuildInput;

      await pdBuild(buildInput);

      const indexJsonPath = join(tmpDir, ".pd", "testPipe", "index.json");
      let pipeData: Pipe = JSON.parse(await Deno.readTextFile(indexJsonPath));

      // Sanity check: initial build is clean with expected steps
      assertEquals(pipeData.workspace?.syncState, "clean");
      assertEquals(pipeData.steps.length, 2);
      assertEquals(pipeData.steps[0].funcName, "StepAlpha");

      // ── Step 2: Simulate a structured edit ──
      // Pretend the web UI modified StepAlpha's code and marked the
      // workspace as "json_dirty" — this edit has NOT been synced to markdown.
      pipeData.steps[0].code = 'input.alpha = "structured_edit";';
      pipeData.workspace = {
        ...pipeData.workspace!,
        syncState: "json_dirty",
        lastModifiedBy: "web_edit",
      };
      await Deno.writeTextFile(indexJsonPath, JSON.stringify(pipeData, null, 2));

      // ── Step 3: Overwrite the markdown with completely different content ──
      // This simulates a user editing the .md file directly in their editor.
      // The markdown has different step names (StepOne, StepTwo) and different code.
      await Deno.writeTextFile(mdPath, OVERWRITE_MD);

      // ── Step 4: Rebuild ──
      // pdBuild re-parses the markdown file on disk, so it picks up the
      // new OVERWRITE_MD content — not the structured edit in index.json.
      await pdBuild(buildInput);

      // ── Step 5: Verify the NEW markdown content won ──
      pipeData = JSON.parse(await Deno.readTextFile(indexJsonPath));

      // The rebuild should reflect the OVERWRITE_MD steps, not the old ones
      assertEquals(pipeData.steps.length, 2, "Should have 2 steps from new markdown");
      assertEquals(
        pipeData.steps[0].funcName,
        "StepOne",
        "First step should be StepOne from the overwritten markdown"
      );
      assertEquals(
        pipeData.steps[1].funcName,
        "StepTwo",
        "Second step should be StepTwo from the overwritten markdown"
      );

      // Verify the code comes from the new markdown, not the structured edit
      assertMatch(
        pipeData.steps[0].code!,
        /from_markdown/,
        "StepOne code should contain 'from_markdown', not the structured edit"
      );

      // ── Step 6: Verify workspace is clean after rebuild ──
      assertEquals(
        pipeData.workspace?.syncState,
        "clean",
        "syncState should be 'clean' after rebuild"
      );
      assertEquals(
        pipeData.workspace?.lastModifiedBy,
        "build",
        "lastModifiedBy should be 'build' after rebuild"
      );

      // ── Step 7: The structured edit is gone ──
      // The old StepAlpha with "structured_edit" code no longer exists;
      // it was completely replaced by the markdown-derived steps.
      const allCode = pipeData.steps.map((s) => s.code).join(" ");
      assertEquals(
        allCode.includes("structured_edit"),
        false,
        "The structured edit code should be gone — markdown wins"
      );
    } finally {
      await Deno.remove(tmpDir, { recursive: true });
    }
  });
});

// ── Sync Dry-Run Preview Test ──
// `pd sync --dry-run` should show what the synced markdown would look like
// without actually writing anything. This is implemented by calling
// pipeToMarkdown() on the modified index.json data — a pure function that
// returns a string but has no side effects on disk.
//
// Ref: WEB_FIRST_WORKFLOW_PLAN.md §7.3 — dry-run preview behaviour
// Ref: pipeToMarkdown.ts — pure Pipe→markdown converter

Deno.test("workspace: pd sync dry-run preview does not mutate files", async (t) => {
  // Scenario: a structured edit has been made (json_dirty). Calling
  // pipeToMarkdown() generates a preview of what sync *would* write,
  // but neither the markdown file nor index.json should be modified.

  await t.step("dry-run preview reflects edits but leaves disk unchanged", async () => {
    const tmpDir = await Deno.makeTempDir({ prefix: "pd_test_dryrun_" });

    try {
      // ── Step 1: Initial build ──
      const mdPath = join(tmpDir, "testPipe.md");
      await Deno.writeTextFile(mdPath, TWO_STEP_MD);

      const buildInput: BuildInput = {
        cwd: tmpDir,
        flags: { _: [] },
        globalConfig: {},
        projectPipes: [],
        output: {},
        debug: false,
      } as BuildInput;

      await pdBuild(buildInput);

      const indexJsonPath = join(tmpDir, ".pd", "testPipe", "index.json");
      let pipeData: Pipe = JSON.parse(await Deno.readTextFile(indexJsonPath));

      // ── Step 2: Simulate a structured edit ──
      // Modify StepAlpha's code and mark as json_dirty — this is what the
      // web UI would do when a user edits a step in the browser.
      const modifiedCode = 'input.alpha = "dry_run_preview";';
      pipeData.steps[0].code = modifiedCode;
      pipeData.workspace = {
        ...pipeData.workspace!,
        syncState: "json_dirty",
        lastModifiedBy: "web_edit",
      };
      await Deno.writeTextFile(indexJsonPath, JSON.stringify(pipeData, null, 2));

      // Snapshot the file contents BEFORE the dry-run, so we can verify
      // nothing changes afterward.
      const mdContentBefore = await Deno.readTextFile(mdPath);
      const indexJsonBefore = await Deno.readTextFile(indexJsonPath);

      // ── Step 3: Generate the dry-run preview ──
      // pipeToMarkdown is a pure function: Pipe → string.
      // It does not write to disk — it just returns what the synced
      // markdown would look like. This is exactly what `pd sync --dry-run`
      // would display to the user.
      const preview = pipeToMarkdown(pipeData);

      // ── Step 4: Verify the preview contains the modified code ──
      // The preview should include our structured edit, because we're
      // generating markdown from the modified pipeData.
      assertEquals(
        preview.includes("dry_run_preview"),
        true,
        "Preview markdown should contain the modified code from the structured edit"
      );

      // ── Step 5: Verify the original markdown file is UNCHANGED ──
      // Dry-run must not write to disk. The .md file should still have
      // the original TWO_STEP_MD content (with `input.alpha = true`).
      const mdContentAfter = await Deno.readTextFile(mdPath);
      assertEquals(
        mdContentAfter,
        mdContentBefore,
        "Markdown file on disk should be unchanged after dry-run"
      );
      assertEquals(
        mdContentAfter.includes("dry_run_preview"),
        false,
        "Original markdown should NOT contain the dry-run edit"
      );

      // ── Step 6: Verify index.json is UNCHANGED ──
      // The dry-run should not alter workspace state (e.g. should not
      // flip syncState to "clean" or change lastModifiedBy).
      const indexJsonAfter = await Deno.readTextFile(indexJsonPath);
      assertEquals(
        indexJsonAfter,
        indexJsonBefore,
        "index.json should be unchanged after dry-run"
      );

      // Double-check: re-parse and verify the dirty state is still there
      const pipeDataAfter: Pipe = JSON.parse(indexJsonAfter);
      assertEquals(
        pipeDataAfter.workspace?.syncState,
        "json_dirty",
        "syncState should still be 'json_dirty' — dry-run does not sync"
      );
      assertEquals(
        pipeDataAfter.workspace?.lastModifiedBy,
        "web_edit",
        "lastModifiedBy should still be 'web_edit' — dry-run does not rebuild"
      );
    } finally {
      await Deno.remove(tmpDir, { recursive: true });
    }
  });
});
