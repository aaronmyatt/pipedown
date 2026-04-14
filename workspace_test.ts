/**
 * workspace_test.ts — Tests for stepId assignment and step fingerprinting.
 *
 * Covers:
 *   1. stepId assignment on first build
 *   2. stepId preservation across identical rebuilds
 *   3. stepId preservation when steps reorder
 *   4. stepId regeneration for new steps
 *   5. renamed step gets a new stepId
 *   6. step fingerprints computed during build
 *   7. identical code produces identical fingerprint
 *   8. code change produces different fingerprint
 *   9. computeStepFingerprint is deterministic
 *  10. stepIds and fingerprints persisted in index.json via full pdBuild
 *
 * Uses the same test patterns as pdBuild_test.ts: in-memory markdown where
 * possible, Deno.makeTempDir for filesystem-dependent tests, with cleanup.
 *
 * Run with:
 *   ~/.deno/bin/deno test --no-check -A workspace_test.ts
 *
 * Ref: pipedown.d.ts — Step.stepId, Step.fingerprint
 * Ref: https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID
 * Ref: https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest
 */

import {
  assertEquals,
  assertExists,
  assertMatch,
  assertNotEquals,
  // deno-lint-ignore no-import-prefix no-unversioned-import
} from "jsr:@std/assert";
// deno-lint-ignore no-import-prefix
import { join } from "jsr:@std/path@1.0.7";
// deno-lint-ignore no-import-prefix
import { exists } from "jsr:@std/fs@1.0.5";
import { mdToPipe } from "./mdToPipe.ts";
import { assignStepIds, computeStepFingerprint, pdBuild } from "./pdBuild.ts";
import type { BuildInput, Input, Pipe, Step } from "./pipedown.d.ts";

// ── Helpers ──

/**
 * UUID v4 regex for validating stepId format.
 * crypto.randomUUID() returns lowercase hex in 8-4-4-4-12 format.
 * Ref: https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID
 */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Parses markdown into a Pipe using mdToPipe, configured for testing
 * with a given pipe name and .pd directory path.
 *
 * @param markdown - Raw markdown source string
 * @param pipeName - Name for the output pipe directory
 * @param pdDir    - Path to the .pd directory (for dir/absoluteDir fields)
 * @returns Parsed Pipe object
 */
async function parsePipe(
  markdown: string,
  pipeName: string,
  pdDir: string,
): Promise<Pipe> {
  const dir = join(pdDir, pipeName);
  const output = await mdToPipe(
    {
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
    } as { markdown: string; pipe: Pipe } & Input,
  );
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

// ── Step ID Tests ──

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
        assertExists(
          step.stepId,
          `Step "${step.funcName}" should have a stepId`,
        );
        assertMatch(step.stepId!, UUID_REGEX, `stepId should be a valid UUID`);
      }

      // Verify the two stepIds are different
      assertNotEquals(
        pipe.steps[0].stepId,
        pipe.steps[1].stepId,
        "Each step should have a unique stepId",
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

  await t.step(
    "stepIds are unchanged after rebuild with same markdown",
    async () => {
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
          JSON.stringify(pipe1, null, 2),
        );

        // ── Second build (identical markdown) ──
        const pipe2 = await parsePipe(TWO_STEP_MD, "testPipe", pdDir);
        const input2 = makeBuildInput([pipe2]);
        await assignStepIds(input2);

        // Verify stepIds are preserved
        assertEquals(pipe2.steps.length, 2);
        assertEquals(
          pipe2.steps[0].stepId,
          firstBuildIds[0],
          "StepAlpha ID should be preserved",
        );
        assertEquals(
          pipe2.steps[1].stepId,
          firstBuildIds[1],
          "StepBeta ID should be preserved",
        );
      } finally {
        await Deno.remove(tmpDir, { recursive: true });
      }
    },
  );
});

Deno.test("workspace: stepId preservation when steps reorder", async (t) => {
  // When steps are reordered in markdown, stepIds should follow by funcName
  // (name-match), not by array index.

  await t.step(
    "stepIds follow funcName when steps swap positions",
    async () => {
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
          JSON.stringify(pipe1, null, 2),
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
          "StepBeta should keep its original stepId despite moving to index 0",
        );
        assertEquals(
          pipe2.steps[1].stepId,
          alphaId,
          "StepAlpha should keep its original stepId despite moving to index 1",
        );
      } finally {
        await Deno.remove(tmpDir, { recursive: true });
      }
    },
  );
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
        JSON.stringify(pipe1, null, 2),
      );

      // ── Second build (three steps — Gamma is new) ──
      const pipe2 = await parsePipe(THREE_STEP_MD, "testPipe", pdDir);
      const input2 = makeBuildInput([pipe2]);
      await assignStepIds(input2);

      assertEquals(pipe2.steps.length, 3);

      // Alpha and Beta should keep their original IDs
      assertEquals(
        pipe2.steps[0].stepId,
        alphaId,
        "StepAlpha should keep its ID",
      );
      assertEquals(
        pipe2.steps[1].stepId,
        betaId,
        "StepBeta should keep its ID",
      );

      // Gamma should have a new, different UUID
      const gammaId = pipe2.steps[2].stepId!;
      assertMatch(gammaId, UUID_REGEX, "StepGamma should have a valid UUID");
      assertNotEquals(
        gammaId,
        alphaId,
        "Gamma's ID should differ from Alpha's",
      );
      assertNotEquals(gammaId, betaId, "Gamma's ID should differ from Beta's");
    } finally {
      await Deno.remove(tmpDir, { recursive: true });
    }
  });
});

Deno.test("workspace: renamed step gets a new stepId", async (t) => {
  // When a step is renamed (funcName changes), the matching logic cannot find
  // a prior step with the same funcName, so the step should get a new UUID.
  // Ref: https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID

  await t.step(
    "renaming a step heading produces a different stepId",
    async () => {
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
          JSON.stringify(pipe1, null, 2),
        );

        // ── Second build (Alpha renamed to AlphaRenamed) ──
        const pipe2 = await parsePipe(TWO_STEP_RENAMED_MD, "testPipe", pdDir);
        const input2 = makeBuildInput([pipe2]);
        await assignStepIds(input2);

        // "StepAlphaRenamed" has a different funcName — no match in prior steps.
        // It should get a brand-new stepId.
        assertEquals(pipe2.steps[0].funcName, "StepAlphaRenamed");
        assertMatch(
          pipe2.steps[0].stepId!,
          UUID_REGEX,
          "Renamed step should have a valid UUID",
        );
        assertNotEquals(
          pipe2.steps[0].stepId,
          originalAlphaId,
          "Renamed step should NOT reuse the original Alpha stepId",
        );

        // Beta was not renamed — it should keep its original ID.
        assertEquals(pipe2.steps[1].funcName, "StepBeta");
        assertEquals(
          pipe2.steps[1].stepId,
          originalBetaId,
          "Unrenamed StepBeta should keep its original stepId",
        );
      } finally {
        await Deno.remove(tmpDir, { recursive: true });
      }
    },
  );
});

// ── Step Fingerprint Tests ──
// Fingerprints are SHA-256 hashes of a step's meaningful content (code,
// funcName, config). They enable the session layer to detect stale steps
// and decide which upstream snapshots can be safely reused.
//
// Ref: https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest

/** Hex SHA-256 hash is exactly 64 lowercase hex characters. */
const SHA256_HEX_REGEX = /^[0-9a-f]{64}$/;

Deno.test("workspace: step fingerprints computed during build", async (t) => {
  await t.step(
    "all steps have valid SHA-256 fingerprints after assignStepIds",
    async () => {
      const tmpDir = await Deno.makeTempDir({ prefix: "pd_test_fp_" });
      const pdDir = join(tmpDir, ".pd");

      try {
        const pipe = await parsePipe(TWO_STEP_MD, "testPipe", pdDir);
        const input = makeBuildInput([pipe]);
        await assignStepIds(input);

        for (const step of pipe.steps) {
          assertExists(
            step.fingerprint,
            `Step "${step.funcName}" should have a fingerprint`,
          );
          assertMatch(
            step.fingerprint!,
            SHA256_HEX_REGEX,
            `Fingerprint should be a 64-char hex string`,
          );
        }

        // Two different steps should have different fingerprints
        // (they have different code and funcNames).
        assertNotEquals(
          pipe.steps[0].fingerprint,
          pipe.steps[1].fingerprint,
          "Different steps should have different fingerprints",
        );
      } finally {
        await Deno.remove(tmpDir, { recursive: true });
      }
    },
  );
});

Deno.test("workspace: identical code produces identical fingerprint", async (t) => {
  // Building the same markdown twice should produce the same fingerprint
  // for each step, because the code/funcName/config haven't changed.

  await t.step(
    "fingerprints are stable across identical rebuilds",
    async () => {
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

        assertEquals(
          fp1,
          fp2,
          "Fingerprints should be identical for identical source",
        );
      } finally {
        await Deno.remove(tmpDir, { recursive: true });
      }
    },
  );
});

Deno.test("workspace: code change produces different fingerprint", async (t) => {
  // When a step's code changes, its fingerprint should change.
  // Steps whose code did NOT change should keep the same fingerprint.

  await t.step(
    "changed step gets new fingerprint, unchanged step keeps old",
    async () => {
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
        const pipe2 = await parsePipe(
          TWO_STEP_CHANGED_CODE_MD,
          "testPipe",
          pdDir,
        );
        const input2 = makeBuildInput([pipe2]);
        await assignStepIds(input2);
        const alphaFp2 = pipe2.steps[0].fingerprint!;
        const betaFp2 = pipe2.steps[1].fingerprint!;

        // Alpha's code changed → fingerprint should differ
        assertNotEquals(
          alphaFp1,
          alphaFp2,
          "Step Alpha fingerprint should change when code changes",
        );

        // Beta's code is identical → fingerprint should be the same
        assertEquals(
          betaFp1,
          betaFp2,
          "Step Beta fingerprint should stay the same when code is unchanged",
        );
      } finally {
        await Deno.remove(tmpDir, { recursive: true });
      }
    },
  );
});

Deno.test("workspace: computeStepFingerprint is deterministic", async (t) => {
  // Calling computeStepFingerprint multiple times on the same step
  // should always produce the same hash.

  await t.step(
    "same step produces same fingerprint on repeated calls",
    async () => {
      const step: Step = {
        code: "input.x = 42;",
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
    },
  );
});

// ── Integration Tests ──
// These run the full pdBuild pipeline with a real temp directory and
// verify that stepIds and fingerprints appear in the written index.json.

Deno.test("workspace: stepIds and fingerprints persisted in index.json via full pdBuild", async (t) => {
  // Integration test: run the full pdBuild pipeline with a real temp
  // directory and verify that the written index.json contains both
  // stepIds and fingerprints.

  await t.step(
    "index.json contains stepIds and fingerprints after full build",
    async () => {
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
          "index.json should exist after build",
        );

        const pipeData: Pipe = JSON.parse(
          await Deno.readTextFile(indexJsonPath),
        );

        // Verify stepIds are present and valid
        assertEquals(pipeData.steps.length, 2, "Should have 2 steps");
        for (const step of pipeData.steps) {
          assertExists(
            step.stepId,
            `Step "${step.funcName}" should have a stepId in index.json`,
          );
          assertMatch(
            step.stepId!,
            UUID_REGEX,
            "stepId should be a valid UUID",
          );
        }

        // Verify fingerprints are present and valid
        for (const step of pipeData.steps) {
          assertExists(
            step.fingerprint,
            `Step "${step.funcName}" should have a fingerprint in index.json`,
          );
          assertMatch(
            step.fingerprint!,
            SHA256_HEX_REGEX,
            "fingerprint should be a 64-char hex SHA-256 string",
          );
        }
      } finally {
        await Deno.remove(tmpDir, { recursive: true });
      }
    },
  );
});
