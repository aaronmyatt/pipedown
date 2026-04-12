/**
 * session_test.ts — Comprehensive tests for the session manager.
 *
 * Covers:
 *   1. Session creation — fields populated, UUID format, status "created"
 *   2. Session persistence — write/read round-trip
 *   3. Full session execution — all steps "done", overall "completed"
 *   4. Partial session (to_step) — run to step N, verify partial done
 *   5. Session step snapshots — before/after captured per step
 *   6. Session step deltas — added/modified/removed key detection
 *   7. Session continue — resume from last completed step
 *   8. Session list — multiple sessions, sorted by createdAt desc
 *
 * For tests, we create a temp dir with a simple 2-3 step markdown pipe,
 * run pdBuild to produce index.ts/index.json, then test session operations
 * against the built pipe.
 *
 * Run with:
 *   ~/.deno/bin/deno test --no-check -A session_test.ts
 *
 * Ref: WEB_FIRST_WORKFLOW_PLAN.md §4.1-E (RunSession type)
 * Ref: WEB_FIRST_WORKFLOW_PLAN.md §8 (Execution and Session Model)
 */

import {
  assertEquals,
  assertExists,
  assertMatch,
  assertNotEquals,
  assert,
} from "jsr:@std/assert";
import { join } from "jsr:@std/path@1.0.7";
import { pdBuild } from "./pdBuild.ts";
import type { BuildInput, Pipe, RunSession } from "./pipedown.d.ts";
import {
  createSession,
  persistSession,
  readSession,
  listSessions,
  executeSession,
  computeStepsToExecute,
  safeSnapshot,
  computeDelta,
} from "./pdCli/sessionManager.ts";

// ── Helpers ──

/**
 * UUID v4 regex for validating sessionId format.
 * crypto.randomUUID() returns lowercase hex in 8-4-4-4-12 format.
 * Ref: https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * ISO-8601 datetime regex for validating timestamps.
 * Matches strings like "2026-04-12T10:30:00.000Z"
 */
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

// ── Markdown Fixtures ──
// Simple multi-step pipes for testing. Each step mutates `input` by
// setting a property, making it easy to verify execution via snapshots.

/**
 * A 3-step pipe where:
 *   - Step 1 sets `input.alpha = "hello"`
 *   - Step 2 sets `input.beta = input.alpha + " world"`
 *   - Step 3 sets `input.gamma = 42` (adds a new numeric field)
 *
 * This design ensures:
 *   - Added keys are detectable (alpha, beta, gamma)
 *   - Dependencies between steps exist (step 2 reads step 1's output)
 *   - Different data types appear (string, number)
 */
const THREE_STEP_MD = `# SessionTest

## Set Alpha

\`\`\`ts
input.alpha = "hello";
\`\`\`

## Set Beta

\`\`\`ts
input.beta = (input.alpha || "") + " world";
\`\`\`

## Set Gamma

\`\`\`ts
input.gamma = 42;
\`\`\`
`;

/**
 * A 2-step pipe for simpler tests:
 *   - Step 1 sets `input.x = 1`
 *   - Step 2 sets `input.y = 2` and modifies `input.x = 10`
 *
 * This creates both "added" and "modified" delta entries for step 2.
 */
const TWO_STEP_DELTA_MD = `# DeltaTest

## Init X

\`\`\`ts
input.x = 1;
\`\`\`

## Add Y Modify X

\`\`\`ts
input.y = 2;
input.x = 10;
\`\`\`
`;

/**
 * Builds a pipe from markdown in a temp directory using pdBuild.
 *
 * Creates the .md file, runs the full build pipeline, and returns the
 * built pipe data (index.json) needed for session testing.
 *
 * @param tmpDir   - Temp directory to use as the project root
 * @param markdown - Markdown content for the pipe
 * @param fileName - Filename for the .md file (without .md extension will be the pipe name)
 * @returns The parsed Pipe object from the built index.json
 */
async function buildPipeInDir(tmpDir: string, markdown: string, fileName: string): Promise<Pipe> {
  // Write the markdown file to the temp directory
  const mdPath = join(tmpDir, fileName);
  await Deno.writeTextFile(mdPath, markdown);

  // Run the full pdBuild pipeline, which:
  //   1. Walks for .md files
  //   2. Parses markdown → Pipe objects
  //   3. Assigns stepIds and fingerprints
  //   4. Writes index.json, index.ts, and templates
  //
  // The `cwd` field tells pdBuild where to look for .md files and write .pd/.
  // Ref: pdBuild.ts — the build pipeline
  const buildInput: BuildInput = {
    cwd: tmpDir,
    flags: { _: [] },
    globalConfig: {},
    projectPipes: [],
    output: {},
    debug: false,
  } as BuildInput;

  await pdBuild(buildInput);

  // Read the generated index.json.
  // The pipe name is derived from the .md filename by pdBuild (strips .md,
  // sanitizes whitespace/special chars). For simple names like "SessionTest.md"
  // the directory will be "SessionTest".
  const pipeDirName = fileName.replace(/\.md$/, "").replace(/[\W_]+/g, " ").trim().replace(/\s+/g, "");
  const indexJsonPath = join(tmpDir, ".pd", pipeDirName, "index.json");
  const content = await Deno.readTextFile(indexJsonPath);
  return JSON.parse(content) as Pipe;
}

// ── Test Suite ──

// ── 1. Session Creation ──

Deno.test("session: creation populates all fields correctly", async (t) => {
  await t.step("session has UUID, correct status, and step records", async () => {
    const tmpDir = await Deno.makeTempDir({ prefix: "pd_session_" });

    try {
      const pipeData = await buildPipeInDir(tmpDir, THREE_STEP_MD, "SessionTest.md");
      const inputValue = { message: "test" };

      const session = createSession("test-project", pipeData, inputValue, "full");

      // ── Verify session fields ──
      // sessionId should be a valid UUID v4
      assertMatch(session.sessionId, UUID_REGEX, "sessionId should be a valid UUID");

      // Status should be "created" — not yet running
      assertEquals(session.status, "created", "Initial status should be 'created'");

      // Project and pipe names should be populated from the pipe data
      assertEquals(session.projectName, "test-project");
      assertEquals(session.pipeName, pipeData.fileName || pipeData.cleanName || pipeData.name);

      // VersionId should be derived from workspace metadata
      assertExists(session.versionId, "versionId should be set");

      // Mode should match what was passed
      assertEquals(session.mode, "full");

      // Input value should be stored
      assertEquals(session.inputValue, inputValue);

      // createdAt should be a valid ISO timestamp
      assertMatch(session.createdAt, ISO_DATE_REGEX, "createdAt should be ISO format");

      // completedAt should not be set yet
      assertEquals(session.completedAt, undefined, "completedAt should be undefined on creation");

      // traceRefs should be an empty array initially
      assertEquals(session.traceRefs, [], "traceRefs should be empty initially");

      // ── Verify step records ──
      // Should have one record per pipe step, all in "pending" status
      assertEquals(session.steps.length, 3, "Should have 3 step records (one per pipe step)");
      for (let i = 0; i < session.steps.length; i++) {
        const step = session.steps[i];
        assertEquals(step.sessionId, session.sessionId, "Step sessionId should match parent");
        assertEquals(step.stepIndex, i, `Step ${i} should have correct index`);
        assertEquals(step.status, "pending", `Step ${i} should start as 'pending'`);
        assertExists(step.stepId, `Step ${i} should have a stepId from the pipe`);
        assertExists(step.stepFingerprint, `Step ${i} should have a fingerprint from the pipe`);
      }
    } finally {
      await Deno.remove(tmpDir, { recursive: true });
    }
  });
});

// ── 2. Session Persistence ──

Deno.test("session: persist and read round-trip", async (t) => {
  await t.step("written session reads back identically", async () => {
    const tmpDir = await Deno.makeTempDir({ prefix: "pd_session_persist_" });

    try {
      const pipeData = await buildPipeInDir(tmpDir, THREE_STEP_MD, "SessionTest.md");
      const session = createSession("test-project", pipeData, { x: 1 }, "full");
      const pipeName = session.pipeName;

      // Persist the session to disk
      await persistSession(tmpDir, session);

      // Read it back
      const loaded = await readSession(tmpDir, pipeName, session.sessionId);

      // Verify the round-trip is faithful
      assertExists(loaded, "Session should be readable after persistence");
      assertEquals(loaded!.sessionId, session.sessionId);
      assertEquals(loaded!.projectName, session.projectName);
      assertEquals(loaded!.pipeName, session.pipeName);
      assertEquals(loaded!.status, session.status);
      assertEquals(loaded!.mode, session.mode);
      assertEquals(loaded!.createdAt, session.createdAt);
      assertEquals(loaded!.steps.length, session.steps.length);
      assertEquals(loaded!.inputValue, session.inputValue);

      // Verify step records survived the round-trip
      for (let i = 0; i < session.steps.length; i++) {
        assertEquals(loaded!.steps[i].stepIndex, session.steps[i].stepIndex);
        assertEquals(loaded!.steps[i].status, session.steps[i].status);
        assertEquals(loaded!.steps[i].stepId, session.steps[i].stepId);
      }
    } finally {
      await Deno.remove(tmpDir, { recursive: true });
    }
  });
});

// ── 3. Full Session Execution ──

Deno.test("session: full execution completes all steps", async (t) => {
  await t.step("all steps become 'done', session becomes 'completed'", async () => {
    const tmpDir = await Deno.makeTempDir({ prefix: "pd_session_exec_" });

    try {
      const pipeData = await buildPipeInDir(tmpDir, THREE_STEP_MD, "SessionTest.md");
      const session = createSession("test-project", pipeData, {}, "full");

      // Execute the session — this runs all 3 steps
      const { session: completed, output } = await executeSession(tmpDir, session, pipeData);

      // Overall session should be "completed"
      assertEquals(completed.status, "completed", "Session should be completed");
      assertExists(completed.completedAt, "completedAt should be set");

      // All steps should be "done"
      for (let i = 0; i < completed.steps.length; i++) {
        assertEquals(
          completed.steps[i].status,
          "done",
          `Step ${i} should be 'done'`
        );
        assertExists(completed.steps[i].durationMs, `Step ${i} should have timing`);
        assertExists(completed.steps[i].startedAt, `Step ${i} should have startedAt`);
        assertExists(completed.steps[i].completedAt, `Step ${i} should have completedAt`);
      }

      // Verify the output has all the mutations from all 3 steps
      // deno-lint-ignore no-explicit-any
      const out = output as any;
      assertEquals(out.alpha, "hello", "Step 1 should have set alpha");
      assertEquals(out.beta, "hello world", "Step 2 should have set beta (dependent on step 1)");
      assertEquals(out.gamma, 42, "Step 3 should have set gamma");
    } finally {
      await Deno.remove(tmpDir, { recursive: true });
    }
  });
});

// ── 4. Partial Session (to_step) ──

Deno.test("session: to_step executes only steps 0..N", async (t) => {
  await t.step("stops after target step, remaining steps stay pending", async () => {
    const tmpDir = await Deno.makeTempDir({ prefix: "pd_session_partial_" });

    try {
      const pipeData = await buildPipeInDir(tmpDir, THREE_STEP_MD, "SessionTest.md");

      // Create a session that runs only to step 1 (indices 0 and 1)
      const session = createSession("test-project", pipeData, {}, "to_step", {
        targetStepIndex: 1,
      });

      const { session: partial, output } = await executeSession(tmpDir, session, pipeData);

      // Session should be "completed" (it completed all requested steps)
      assertEquals(partial.status, "completed", "Session should be completed");

      // Steps 0 and 1 should be "done"
      assertEquals(partial.steps[0].status, "done", "Step 0 should be done");
      assertEquals(partial.steps[1].status, "done", "Step 1 should be done");

      // Step 2 should remain "pending" — it was not in the execution range
      assertEquals(partial.steps[2].status, "pending", "Step 2 should be pending");

      // Output should have alpha and beta but NOT gamma
      // deno-lint-ignore no-explicit-any
      const out = output as any;
      assertEquals(out.alpha, "hello", "Step 0 output should be present");
      assertEquals(out.beta, "hello world", "Step 1 output should be present");
      assertEquals(out.gamma, undefined, "Step 2 output should NOT be present");
    } finally {
      await Deno.remove(tmpDir, { recursive: true });
    }
  });
});

// ── 5. Session Step Snapshots ──

Deno.test("session: step snapshots are captured correctly", async (t) => {
  await t.step("before/after snapshots reflect step mutations", async () => {
    const tmpDir = await Deno.makeTempDir({ prefix: "pd_session_snap_" });

    try {
      const pipeData = await buildPipeInDir(tmpDir, THREE_STEP_MD, "SessionTest.md");
      const session = createSession("test-project", pipeData, {}, "full");

      const { session: completed } = await executeSession(tmpDir, session, pipeData);

      // ── Step 0: sets alpha ──
      // Before: {} (empty input)
      // After: { alpha: "hello" }
      const step0 = completed.steps[0];
      assertExists(step0.beforeSnapshotRef, "Step 0 should have a before snapshot");
      assertExists(step0.afterSnapshotRef, "Step 0 should have an after snapshot");

      const before0 = JSON.parse(step0.beforeSnapshotRef!);
      const after0 = JSON.parse(step0.afterSnapshotRef!);

      // Before step 0, alpha should not exist
      assertEquals(before0.alpha, undefined, "Before step 0: alpha should not exist");
      // After step 0, alpha should be set
      assertEquals(after0.alpha, "hello", "After step 0: alpha should be 'hello'");

      // ── Step 1: reads alpha, sets beta ──
      const step1 = completed.steps[1];
      const before1 = JSON.parse(step1.beforeSnapshotRef!);
      const after1 = JSON.parse(step1.afterSnapshotRef!);

      // Before step 1: alpha exists from step 0
      assertEquals(before1.alpha, "hello", "Before step 1: alpha should carry over");
      assertEquals(before1.beta, undefined, "Before step 1: beta should not exist yet");
      // After step 1: both alpha and beta should exist
      assertEquals(after1.alpha, "hello", "After step 1: alpha unchanged");
      assertEquals(after1.beta, "hello world", "After step 1: beta should be set");

      // ── Step 2: sets gamma ──
      const step2 = completed.steps[2];
      const after2 = JSON.parse(step2.afterSnapshotRef!);
      assertEquals(after2.gamma, 42, "After step 2: gamma should be 42");
    } finally {
      await Deno.remove(tmpDir, { recursive: true });
    }
  });
});

// ── 6. Session Step Deltas ──

Deno.test("session: step deltas detect added/modified/removed keys", async (t) => {
  await t.step("delta correctly classifies key changes", async () => {
    const tmpDir = await Deno.makeTempDir({ prefix: "pd_session_delta_" });

    try {
      const pipeData = await buildPipeInDir(tmpDir, TWO_STEP_DELTA_MD, "DeltaTest.md");
      const session = createSession("test-project", pipeData, {}, "full");

      const { session: completed } = await executeSession(tmpDir, session, pipeData);

      // ── Step 0: adds "x" to empty input ──
      const delta0 = JSON.parse(completed.steps[0].deltaRef!);
      assert(delta0.added.includes("x"), "Step 0 delta should show 'x' as added");
      assertEquals(delta0.modified.length, 0, "Step 0 should have no modifications");
      assertEquals(delta0.removed.length, 0, "Step 0 should have no removals");

      // ── Step 1: adds "y" and modifies "x" ──
      const delta1 = JSON.parse(completed.steps[1].deltaRef!);
      assert(delta1.added.includes("y"), "Step 1 delta should show 'y' as added");
      assert(delta1.modified.includes("x"), "Step 1 delta should show 'x' as modified");
      assertEquals(delta1.removed.length, 0, "Step 1 should have no removals");
    } finally {
      await Deno.remove(tmpDir, { recursive: true });
    }
  });
});

// ── 7. Session Continue ──

Deno.test("session: continue resumes from last completed step", async (t) => {
  await t.step("partial run + continue completes all steps", async () => {
    const tmpDir = await Deno.makeTempDir({ prefix: "pd_session_continue_" });

    try {
      const pipeData = await buildPipeInDir(tmpDir, THREE_STEP_MD, "SessionTest.md");

      // ── Phase 1: Run to step 1 only ──
      const session = createSession("test-project", pipeData, {}, "to_step", {
        targetStepIndex: 1,
      });
      await executeSession(tmpDir, session, pipeData);

      // Verify partial state: steps 0-1 done, step 2 pending
      assertEquals(session.steps[0].status, "done");
      assertEquals(session.steps[1].status, "done");
      assertEquals(session.steps[2].status, "pending");

      // ── Phase 2: Switch to "continue" mode and execute again ──
      // Change the mode to "continue" so the executor resumes from step 2.
      session.mode = "continue";
      session.status = "created"; // Reset status for re-execution

      const { session: resumed, output } = await executeSession(tmpDir, session, pipeData);

      // Now all steps should be "done"
      assertEquals(resumed.status, "completed", "Resumed session should be completed");
      assertEquals(resumed.steps[0].status, "done", "Step 0 should still be done");
      assertEquals(resumed.steps[1].status, "done", "Step 1 should still be done");
      assertEquals(resumed.steps[2].status, "done", "Step 2 should now be done");

      // Verify the output includes gamma from step 2.
      // Step 2 sets `input.gamma = 42`, but it does NOT depend on step 0/1
      // output (it just sets a new key). The continue execution picks up
      // the input from step 1's afterSnapshot, which already has alpha/beta.
      // deno-lint-ignore no-explicit-any
      const out = output as any;
      assertEquals(out.gamma, 42, "Step 2 should have set gamma");
      // alpha and beta should also be present from the snapshot
      assertEquals(out.alpha, "hello", "alpha should carry through from snapshot");
      assertEquals(out.beta, "hello world", "beta should carry through from snapshot");
    } finally {
      await Deno.remove(tmpDir, { recursive: true });
    }
  });
});

// ── 8. Session List ──

Deno.test("session: list returns sessions sorted by createdAt desc", async (t) => {
  await t.step("two sessions are listed newest-first", async () => {
    const tmpDir = await Deno.makeTempDir({ prefix: "pd_session_list_" });

    try {
      const pipeData = await buildPipeInDir(tmpDir, THREE_STEP_MD, "SessionTest.md");
      const pipeName = pipeData.fileName || pipeData.cleanName || pipeData.name;

      // Create and persist two sessions with a small delay between them
      // to ensure distinct createdAt timestamps.
      const session1 = createSession("test-project", pipeData, { seq: 1 }, "full");
      await persistSession(tmpDir, session1);

      // Small delay to ensure distinct timestamps
      await new Promise((r) => setTimeout(r, 10));

      const session2 = createSession("test-project", pipeData, { seq: 2 }, "full");
      await persistSession(tmpDir, session2);

      // List sessions
      const listed = await listSessions(tmpDir, pipeName);

      // Should have exactly 2
      assertEquals(listed.length, 2, "Should have 2 sessions");

      // Newest first: session2 was created after session1
      assertEquals(
        listed[0].sessionId,
        session2.sessionId,
        "First in list should be the newest session"
      );
      assertEquals(
        listed[1].sessionId,
        session1.sessionId,
        "Second in list should be the oldest session"
      );

      // Verify createdAt ordering
      assert(
        listed[0].createdAt >= listed[1].createdAt,
        "Sessions should be sorted by createdAt desc"
      );
    } finally {
      await Deno.remove(tmpDir, { recursive: true });
    }
  });
});

// ── Utility Tests ──

Deno.test("session: safeSnapshot handles non-cloneable values", async (t) => {
  await t.step("excludes request/response, handles normal values", () => {
    // safeSnapshot should handle excluded keys (request, response) gracefully
    // and deep-clone normal values.
    const input = {
      alpha: "hello",
      nested: { deep: [1, 2, 3] },
      request: new Request("http://example.com"),
      response: new Response("ok"),
    };

    const snap = safeSnapshot(input as Record<string, unknown>);

    assertEquals(snap.alpha, "hello", "Normal string should pass through");
    assertEquals(
      (snap.nested as { deep: number[] }).deep,
      [1, 2, 3],
      "Nested objects should be cloned"
    );
    assertEquals(snap.request, "[object]", "Request should be replaced with type placeholder");
    assertEquals(snap.response, "[object]", "Response should be replaced with type placeholder");
  });
});

Deno.test("session: computeDelta identifies all change types", async (t) => {
  await t.step("detects added, modified, and removed keys", () => {
    const before = { kept: 1, modified: "old", removed: true };
    const after = { kept: 1, modified: "new", added: "fresh" };

    const delta = computeDelta(
      before as Record<string, unknown>,
      after as Record<string, unknown>,
    );

    assert(delta.added.includes("added"), "'added' should be in added list");
    assert(delta.modified.includes("modified"), "'modified' should be in modified list");
    assert(delta.removed.includes("removed"), "'removed' should be in removed list");
    assertEquals(delta.added.length, 1, "Should have exactly 1 added key");
    assertEquals(delta.modified.length, 1, "Should have exactly 1 modified key");
    assertEquals(delta.removed.length, 1, "Should have exactly 1 removed key");
  });
});

Deno.test("session: computeStepsToExecute returns correct ranges", async (t) => {
  // Test the step range computation without needing a real pipe.
  // Uses a mock session with 5 steps.

  const makeSession = (mode: string, overrides = {}): RunSession => ({
    sessionId: "test",
    projectName: "test",
    pipeName: "test",
    versionId: "v1",
    inputValue: {},
    mode: mode as RunSession["mode"],
    status: "created",
    createdAt: new Date().toISOString(),
    traceRefs: [],
    steps: Array.from({ length: 5 }, (_, i) => ({
      sessionId: "test",
      stepIndex: i,
      status: "pending" as const,
    })),
    ...overrides,
  });

  await t.step("full mode returns all indices", () => {
    const session = makeSession("full");
    assertEquals(computeStepsToExecute(session, 5), [0, 1, 2, 3, 4]);
  });

  await t.step("to_step returns 0..targetStepIndex", () => {
    const session = makeSession("to_step", { targetStepIndex: 2 });
    assertEquals(computeStepsToExecute(session, 5), [0, 1, 2]);
  });

  await t.step("from_step returns startStepIndex..end", () => {
    const session = makeSession("from_step", { startStepIndex: 3 });
    assertEquals(computeStepsToExecute(session, 5), [3, 4]);
  });

  await t.step("single_step returns just the target", () => {
    const session = makeSession("single_step", { targetStepIndex: 2 });
    assertEquals(computeStepsToExecute(session, 5), [2]);
  });

  await t.step("continue returns from first non-done step", () => {
    const session = makeSession("continue");
    // Mark steps 0 and 1 as done
    session.steps[0].status = "done";
    session.steps[1].status = "done";
    assertEquals(computeStepsToExecute(session, 5), [2, 3, 4]);
  });

  await t.step("continue returns empty when all done", () => {
    const session = makeSession("continue");
    session.steps.forEach((s) => (s.status = "done"));
    assertEquals(computeStepsToExecute(session, 5), []);
  });
});

// ── Session Persistence Edge Cases ──

Deno.test("session: readSession returns null for nonexistent session", async (t) => {
  await t.step("nonexistent session returns null", async () => {
    const tmpDir = await Deno.makeTempDir({ prefix: "pd_session_null_" });
    try {
      const result = await readSession(tmpDir, "fakePipe", "00000000-0000-0000-0000-000000000000");
      assertEquals(result, null, "Should return null for nonexistent session");
    } finally {
      await Deno.remove(tmpDir, { recursive: true });
    }
  });
});

Deno.test("session: listSessions returns empty for pipe with no sessions", async (t) => {
  await t.step("empty list for nonexistent pipe", async () => {
    const tmpDir = await Deno.makeTempDir({ prefix: "pd_session_empty_" });
    try {
      const result = await listSessions(tmpDir, "nonexistentPipe");
      assertEquals(result, [], "Should return empty array for pipe with no sessions");
    } finally {
      await Deno.remove(tmpDir, { recursive: true });
    }
  });
});
