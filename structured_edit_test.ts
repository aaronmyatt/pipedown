/**
 * structured_edit_test.ts — Tests for Phase 2 structured editing primitives.
 *
 * Covers:
 *   1. Pipe-level edit: update pipeDescription in index.json
 *   2. Step-level edit: update step code, verify fingerprint changes
 *   3. Step-level edit: verify workspace becomes "json_dirty" after edit
 *   4. Stale propagation: editing step N means downstream fingerprints
 *      should differ from original (step changed → can be detected)
 *   5. Step insertion: insert a step, verify indices shift correctly
 *   6. Step deletion: delete a step, verify remaining steps reindex
 *   7. Step reordering: move a step, verify new order
 *   8. Sync round-trip: edit → sync → rebuild → verify clean state
 *      and edits preserved in markdown
 *
 * Tests operate on in-memory Pipe objects and temp directories (following
 * the workspace_test.ts pattern). No HTTP routes are tested — only the
 * underlying edit/sync logic from structuredEdit.ts.
 *
 * Run with:
 *   ~/.deno/bin/deno test --no-check -A structured_edit_test.ts
 *
 * Ref: WEB_FIRST_WORKFLOW_PLAN.md §2 — Phase 2 checklist
 * Ref: pipedown.d.ts — Pipe, Step, WorkspaceMetadata, SyncState
 */

import {
  assertEquals,
  assertExists,
  assertNotEquals,
  assert,
} from "jsr:@std/assert";
import { join } from "jsr:@std/path@1.0.7";

import {
  editPipeFields,
  editStepFields,
  insertStep,
  deleteStep,
  reorderStep,
  syncPipeToMarkdown,
  rebuildPipeFromMarkdown,
  readPipeData,
  writePipeData,
} from "./pdCli/structuredEdit.ts";
import { computeStepFingerprint } from "./pdBuild.ts";
import { pdBuild } from "./pdBuild.ts";
import type { Pipe, Step, BuildInput, WorkspaceMetadata } from "./pipedown.d.ts";

// ── Test Helpers ──

/**
 * Creates a minimal Pipe object for testing.
 * Includes workspace metadata and two steps with fingerprints.
 */
async function createTestPipe(): Promise<Pipe> {
  const step1: Step = {
    stepId: "step-1-id",
    name: "Fetch Data",
    funcName: "FetchData",
    code: 'input.data = "hello";',
    range: [0, 0],
    inList: false,
    headingLevel: 2,
    language: "ts",
    description: "Fetches data from somewhere.",
  };
  step1.fingerprint = await computeStepFingerprint(step1);

  const step2: Step = {
    stepId: "step-2-id",
    name: "Process Data",
    funcName: "ProcessData",
    code: 'input.result = input.data.toUpperCase();',
    range: [0, 0],
    inList: false,
    headingLevel: 2,
    language: "ts",
    description: "Transforms the data.",
  };
  step2.fingerprint = await computeStepFingerprint(step2);

  const pipe: Pipe = {
    name: "Test Pipe",
    cleanName: "testPipe",
    steps: [step1, step2],
    mdPath: "/tmp/test-pipe.md",
    config: {},
    dir: ".pd/testPipe",
    absoluteDir: "/tmp/.pd/testPipe",
    fileName: "testPipe",
    pipeDescription: "A test pipeline.",
    workspace: {
      syncState: "clean",
      lastBuiltAt: new Date().toISOString(),
      lastModifiedBy: "build",
    },
  };

  return pipe;
}

/**
 * Scaffolds a temp project directory with a markdown file and runs pdBuild
 * to generate index.json. Returns the project path and pipe name.
 */
async function scaffoldTempProject(): Promise<{ projectPath: string; pipeName: string }> {
  const tmpDir = await Deno.makeTempDir({ prefix: "pd-edit-test-" });

  // Write a simple markdown pipe file
  const markdown = `# Edit Test Pipe

A pipe for testing structured edits.

## Fetch Data

Fetches data from the API.

\`\`\`ts
input.data = "hello world";
\`\`\`

## Transform Data

Transforms the fetched data.

\`\`\`ts
input.result = input.data.toUpperCase();
\`\`\`
`;
  await Deno.writeTextFile(join(tmpDir, "edit-test-pipe.md"), markdown);

  // Run pdBuild to generate .pd/editTestPipe/index.json
  await pdBuild({
    cwd: tmpDir,
    errors: [],
  } as unknown as BuildInput);

  return { projectPath: tmpDir, pipeName: "editTestPipe" };
}

// ═══════════════════════════════════════════════════════════════════════
// ── Test 1: Pipe-level edit — update pipeDescription ──
// ═══════════════════════════════════════════════════════════════════════
Deno.test("editPipeFields updates pipeDescription and marks dirty", async () => {
  const pipe = await createTestPipe();

  // Verify initial state is clean
  assertEquals(pipe.workspace?.syncState, "clean");
  assertEquals(pipe.pipeDescription, "A test pipeline.");

  // Edit the description
  editPipeFields(pipe, { pipeDescription: "An updated test pipeline." });

  // Verify the update took effect
  assertEquals(pipe.pipeDescription, "An updated test pipeline.");
  // Workspace should now be "json_dirty"
  assertEquals(pipe.workspace?.syncState, "json_dirty");
  assertEquals(pipe.workspace?.lastModifiedBy, "web_edit");
});

// ═══════════════════════════════════════════════════════════════════════
// ── Test 2: Pipe-level edit — update schema ──
// ═══════════════════════════════════════════════════════════════════════
Deno.test("editPipeFields updates schema and marks dirty", async () => {
  const pipe = await createTestPipe();

  editPipeFields(pipe, { schema: 'z.object({ data: z.string() })' });

  assertEquals(pipe.schema, 'z.object({ data: z.string() })');
  assertEquals(pipe.workspace?.syncState, "json_dirty");
});

// ═══════════════════════════════════════════════════════════════════════
// ── Test 3: Step-level edit — update code, verify fingerprint changes ──
// ═══════════════════════════════════════════════════════════════════════
Deno.test("editStepFields updates code and changes fingerprint", async () => {
  const pipe = await createTestPipe();
  const originalFingerprint = pipe.steps[0].fingerprint;
  assertExists(originalFingerprint, "Step should have an initial fingerprint");

  // Edit the step's code
  const updatedStep = await editStepFields(pipe, 0, {
    code: 'input.data = "updated hello";',
  });

  assertExists(updatedStep, "Should return the updated step");
  assertEquals(updatedStep!.code, 'input.data = "updated hello";');
  // Fingerprint should change because the code changed
  assertNotEquals(
    updatedStep!.fingerprint,
    originalFingerprint,
    "Fingerprint should change after code edit",
  );
});

// ═══════════════════════════════════════════════════════════════════════
// ── Test 4: Step-level edit — workspace becomes "json_dirty" ──
// ═══════════════════════════════════════════════════════════════════════
Deno.test("editStepFields marks workspace as json_dirty", async () => {
  const pipe = await createTestPipe();
  assertEquals(pipe.workspace?.syncState, "clean");

  await editStepFields(pipe, 0, { description: "A new description." });

  assertEquals(pipe.workspace?.syncState, "json_dirty");
  assertEquals(pipe.workspace?.lastModifiedBy, "web_edit");
});

// ═══════════════════════════════════════════════════════════════════════
// ── Test 5: Step-level edit — out of bounds returns null ──
// ═══════════════════════════════════════════════════════════════════════
Deno.test("editStepFields returns null for out-of-bounds index", async () => {
  const pipe = await createTestPipe();

  const result = await editStepFields(pipe, 99, { name: "Won't Work" });
  assertEquals(result, null);
  // Workspace should NOT be marked dirty because no edit actually occurred
  // (the stamp happens inside editStepFields only when the step exists)
  assertEquals(pipe.workspace?.syncState, "clean");
});

// ═══════════════════════════════════════════════════════════════════════
// ── Test 6: Stale propagation awareness ──
// After editing step 0, its fingerprint changes. Step 1's fingerprint
// remains the same, but the session layer can compare fingerprints to
// detect that step 0 changed and mark step 1 as stale for re-execution.
// ═══════════════════════════════════════════════════════════════════════
Deno.test("stale propagation: editing step changes its fingerprint, downstream detectable", async () => {
  const pipe = await createTestPipe();
  const step0FingerprintBefore = pipe.steps[0].fingerprint;
  const step1FingerprintBefore = pipe.steps[1].fingerprint;

  // Edit step 0's code
  await editStepFields(pipe, 0, { code: 'input.data = "changed";' });

  // Step 0's fingerprint should have changed
  assertNotEquals(pipe.steps[0].fingerprint, step0FingerprintBefore);
  // Step 1's fingerprint stays the same (its content didn't change),
  // but the session layer knows step 0 changed and can mark step 1 stale.
  assertEquals(pipe.steps[1].fingerprint, step1FingerprintBefore);
});

// ═══════════════════════════════════════════════════════════════════════
// ── Test 7: Step insertion — indices shift correctly ──
// ═══════════════════════════════════════════════════════════════════════
Deno.test("insertStep adds step at correct position", async () => {
  const pipe = await createTestPipe();
  assertEquals(pipe.steps.length, 2);

  const originalStep1Name = pipe.steps[1].name;

  // Insert after step 0
  const newStep = await insertStep(pipe, 0, {
    name: "Middle Step",
    code: 'input.middle = true;',
    description: "Inserted in the middle.",
  });

  // Pipe should now have 3 steps
  assertEquals(pipe.steps.length, 3);
  // New step should be at index 1
  assertEquals(pipe.steps[1].name, "Middle Step");
  assertEquals(pipe.steps[1].code, 'input.middle = true;');
  // The old step 1 should now be at index 2
  assertEquals(pipe.steps[2].name, originalStep1Name);
  // New step should have a UUID
  assertExists(newStep.stepId);
  // New step should have a fingerprint
  assertExists(newStep.fingerprint);
  // Workspace should be dirty
  assertEquals(pipe.workspace?.syncState, "json_dirty");
});

// ═══════════════════════════════════════════════════════════════════════
// ── Test 8: Step insertion at the beginning ──
// ═══════════════════════════════════════════════════════════════════════
Deno.test("insertStep with afterIndex=-1 prepends at start", async () => {
  const pipe = await createTestPipe();
  const originalFirstName = pipe.steps[0].name;

  await insertStep(pipe, -1, {
    name: "Prepended Step",
    code: '// first',
  });

  assertEquals(pipe.steps.length, 3);
  assertEquals(pipe.steps[0].name, "Prepended Step");
  assertEquals(pipe.steps[1].name, originalFirstName);
});

// ═══════════════════════════════════════════════════════════════════════
// ── Test 9: Step deletion — remaining steps reindex ──
// ═══════════════════════════════════════════════════════════════════════
Deno.test("deleteStep removes step and remaining indices shift", async () => {
  const pipe = await createTestPipe();
  const step2Name = pipe.steps[1].name;

  // Delete step 0
  const removed = deleteStep(pipe, 0);

  assertExists(removed);
  assertEquals(removed!.name, "Fetch Data");
  assertEquals(pipe.steps.length, 1);
  // The former step 1 is now at index 0
  assertEquals(pipe.steps[0].name, step2Name);
  // Workspace should be dirty
  assertEquals(pipe.workspace?.syncState, "json_dirty");
});

// ═══════════════════════════════════════════════════════════════════════
// ── Test 10: Step deletion — out of bounds returns null ──
// ═══════════════════════════════════════════════════════════════════════
Deno.test("deleteStep returns null for out-of-bounds index", async () => {
  const pipe = await createTestPipe();
  const removed = deleteStep(pipe, 5);
  assertEquals(removed, null);
  assertEquals(pipe.steps.length, 2);
});

// ═══════════════════════════════════════════════════════════════════════
// ── Test 11: Step reordering ──
// ═══════════════════════════════════════════════════════════════════════
Deno.test("reorderStep moves step from one position to another", async () => {
  const pipe = await createTestPipe();
  assertEquals(pipe.steps[0].name, "Fetch Data");
  assertEquals(pipe.steps[1].name, "Process Data");

  // Move step 1 to position 0
  const success = reorderStep(pipe, 1, 0);

  assert(success);
  assertEquals(pipe.steps[0].name, "Process Data");
  assertEquals(pipe.steps[1].name, "Fetch Data");
  assertEquals(pipe.workspace?.syncState, "json_dirty");
});

// ═══════════════════════════════════════════════════════════════════════
// ── Test 12: Step reordering — invalid indices ──
// ═══════════════════════════════════════════════════════════════════════
Deno.test("reorderStep returns false for invalid indices", async () => {
  const pipe = await createTestPipe();

  const success = reorderStep(pipe, 0, 5);
  assertEquals(success, false);
  // Steps should be unchanged
  assertEquals(pipe.steps[0].name, "Fetch Data");
});

// ═══════════════════════════════════════════════════════════════════════
// ── Test 13: Sync round-trip — edit → sync → rebuild → clean ──
// Uses a real temp directory with pdBuild to verify the full cycle.
// ═══════════════════════════════════════════════════════════════════════
Deno.test("sync round-trip: edit → sync → rebuild → clean state", async () => {
  const { projectPath, pipeName } = await scaffoldTempProject();

  try {
    // 1. Read the built pipe data
    const pipeData = await readPipeData(projectPath, pipeName);
    assertExists(pipeData);
    assertEquals(pipeData.workspace?.syncState, "clean");

    // 2. Edit a step's code via structured edit
    const originalCode = pipeData.steps[0].code;
    await editStepFields(pipeData, 0, {
      code: 'input.data = "sync test edited";',
    });
    assertEquals(pipeData.workspace?.syncState, "json_dirty");

    // 3. Write the dirty pipe data back
    await writePipeData(projectPath, pipeName, pipeData);

    // 4. Sync: index.json → markdown → rebuild
    const result = await syncPipeToMarkdown(projectPath, pipeName);
    assert(result.success, "Sync should succeed");
    assertEquals(result.syncState, "clean");

    // 5. Read the rebuilt pipe data — should be clean
    const rebuiltPipe = await readPipeData(projectPath, pipeName);
    assertEquals(rebuiltPipe.workspace?.syncState, "clean");
    assertEquals(rebuiltPipe.workspace?.lastModifiedBy, "sync");

    // 6. Verify the edited code survived the round-trip
    // The rebuilt pipe's step code should contain the edited text
    assert(
      rebuiltPipe.steps[0].code.includes("sync test edited"),
      "Edited code should be preserved in rebuilt pipe",
    );
    assertNotEquals(
      rebuiltPipe.steps[0].code,
      originalCode,
      "Code should differ from original",
    );

    // 7. Verify the markdown file contains the edited code
    const mdContent = await Deno.readTextFile(join(projectPath, "edit-test-pipe.md"));
    assert(
      mdContent.includes("sync test edited"),
      "Edited code should appear in the markdown file",
    );
  } finally {
    // Cleanup temp directory
    await Deno.remove(projectPath, { recursive: true });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// ── Test 14: Edit pipe description → sync → verify in markdown ──
// ═══════════════════════════════════════════════════════════════════════
Deno.test("pipe description edit → sync → appears in markdown", async () => {
  const { projectPath, pipeName } = await scaffoldTempProject();

  try {
    const pipeData = await readPipeData(projectPath, pipeName);

    // Edit the pipe description
    editPipeFields(pipeData, { pipeDescription: "Updated description for testing." });
    await writePipeData(projectPath, pipeName, pipeData);

    // Sync to markdown
    const result = await syncPipeToMarkdown(projectPath, pipeName);
    assert(result.success);

    // Verify markdown contains the new description
    const mdContent = await Deno.readTextFile(join(projectPath, "edit-test-pipe.md"));
    assert(
      mdContent.includes("Updated description for testing."),
      "Updated description should appear in markdown",
    );
  } finally {
    await Deno.remove(projectPath, { recursive: true });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// ── Test 15: Rebuild from markdown restores clean state ──
// ═══════════════════════════════════════════════════════════════════════
Deno.test("rebuildPipeFromMarkdown restores clean state", async () => {
  const { projectPath, pipeName } = await scaffoldTempProject();

  try {
    // Dirty the workspace
    const pipeData = await readPipeData(projectPath, pipeName);
    editPipeFields(pipeData, { pipeDescription: "Dirty description" });
    await writePipeData(projectPath, pipeName, pipeData);
    assertEquals(pipeData.workspace?.syncState, "json_dirty");

    // Rebuild from markdown (overwriting the dirty index.json)
    const success = await rebuildPipeFromMarkdown(projectPath);
    assert(success, "Rebuild should succeed");

    // Read the rebuilt pipe — should be clean
    const rebuiltPipe = await readPipeData(projectPath, pipeName);
    assertEquals(rebuiltPipe.workspace?.syncState, "clean");
    assertEquals(rebuiltPipe.workspace?.lastModifiedBy, "build");
    // The dirty description should be lost because rebuild reads from markdown
    assertNotEquals(
      rebuiltPipe.pipeDescription,
      "Dirty description",
      "Rebuild should replace dirty structured state with markdown source",
    );
  } finally {
    await Deno.remove(projectPath, { recursive: true });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// ── Test 16: Insert + delete round-trip ──
// ═══════════════════════════════════════════════════════════════════════
Deno.test("insert then delete returns to original step count", async () => {
  const pipe = await createTestPipe();
  const originalCount = pipe.steps.length;

  // Insert a step
  await insertStep(pipe, 0, { name: "Temp Step", code: "// temp" });
  assertEquals(pipe.steps.length, originalCount + 1);

  // Delete the inserted step (it's at index 1)
  deleteStep(pipe, 1);
  assertEquals(pipe.steps.length, originalCount);
});

// ═══════════════════════════════════════════════════════════════════════
// ── Test 17: Edit step name ──
// ═══════════════════════════════════════════════════════════════════════
Deno.test("editStepFields updates step name", async () => {
  const pipe = await createTestPipe();

  await editStepFields(pipe, 0, { name: "Renamed Step" });

  assertEquals(pipe.steps[0].name, "Renamed Step");
  assertEquals(pipe.workspace?.syncState, "json_dirty");
});

// ═══════════════════════════════════════════════════════════════════════
// ── Test 18: Multiple edits accumulate dirty state ──
// ═══════════════════════════════════════════════════════════════════════
Deno.test("multiple edits keep workspace dirty", async () => {
  const pipe = await createTestPipe();

  editPipeFields(pipe, { pipeDescription: "Edit 1" });
  assertEquals(pipe.workspace?.syncState, "json_dirty");

  await editStepFields(pipe, 0, { code: "// edit 2" });
  assertEquals(pipe.workspace?.syncState, "json_dirty");

  await insertStep(pipe, 0, { name: "Edit 3", code: "// edit 3" });
  assertEquals(pipe.workspace?.syncState, "json_dirty");

  // Workspace should still be dirty after multiple edits
  assertEquals(pipe.workspace?.lastModifiedBy, "web_edit");
});
