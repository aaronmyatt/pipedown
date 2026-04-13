/**
 * integration_test.ts — Integration tests for the full web-first workflow.
 *
 * These tests exercise the complete lifecycle of the workspace system:
 *   1. Edit → sync → rebuild → clean state
 *   2. Sync failure recovery (invalid mdPath)
 *   3. Last-write-wins: raw markdown overwrites structured edits
 *   4. Full loop: edit → run session → sync
 *
 * Each test creates a fresh temp directory with a markdown file, builds it
 * via pdBuild, then exercises the structuredEdit / sessionManager / sync
 * functions to verify end-to-end correctness.
 *
 * Run with:
 *   ~/.deno/bin/deno test --no-check -A integration_test.ts
 *
 * Ref: WEB_FIRST_WORKFLOW_PLAN.md Phase 4 & 5 — integration test checklists
 * Ref: structured_edit_test.ts — lower-level structuredEdit tests
 * Ref: session_test.ts — lower-level session tests
 * Ref: workspace_test.ts — lower-level workspace metadata tests
 */

import {
  assertEquals,
  assertExists,
  assertNotEquals,
  assert,
  assertStringIncludes,
} from "jsr:@std/assert";
import { join } from "jsr:@std/path@1.0.7";
import { exists } from "jsr:@std/fs@1.0.5";

// ── Import core modules ──
// pdBuild: markdown → index.json builder
// Ref: pdBuild.ts — pdBuild(), computeStepFingerprint()
import { pdBuild, computeStepFingerprint } from "./pdBuild.ts";

// structuredEdit: pure edit functions for index.json
// Ref: pdCli/structuredEdit.ts
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

// sessionManager: session CRUD + execution
// Ref: pdCli/sessionManager.ts
import {
  createSession,
  persistSession,
  readSession,
  listSessions,
  executeSession,
} from "./pdCli/sessionManager.ts";

// pipeToMarkdown: structured data → markdown reconstruction
// Ref: pipeToMarkdown.ts
import { pipeToMarkdown } from "./pipeToMarkdown.ts";

import type { Pipe, BuildInput, WorkspaceMetadata } from "./pipedown.d.ts";

// ── Helper: scaffold a temp project with a markdown pipe ──

/**
 * Creates a temporary directory with a markdown pipe file and runs pdBuild
 * to generate index.json and compiled TypeScript.
 *
 * The pipe has two simple steps:
 *   1. "Set Greeting" — sets input.greeting
 *   2. "Uppercase" — uppercases input.greeting into input.result
 *
 * @returns Object with projectPath, pipeName, and mdPath
 */
async function scaffoldProject(): Promise<{
  projectPath: string;
  pipeName: string;
  mdPath: string;
}> {
  const tmpDir = await Deno.makeTempDir({ prefix: "pd-integration-" });

  // Create a simple 2-step pipe.
  // Step 1 writes a greeting, Step 2 uppercases it.
  // Both are valid TypeScript that pdBuild will compile to index.ts.
  const markdown = `# Integration Test Pipe

A pipe for integration testing.

## Set Greeting

Sets a greeting on the input object.

\`\`\`ts
input.greeting = "hello world";
\`\`\`

## Uppercase

Uppercases the greeting.

\`\`\`ts
input.result = (input.greeting || "").toUpperCase();
\`\`\`
`;
  const mdPath = join(tmpDir, "integration-test-pipe.md");
  await Deno.writeTextFile(mdPath, markdown);

  // Run pdBuild to generate .pd/integrationTestPipe/index.json
  // Ref: pdBuild.ts — pdBuild() processes all .md files in the project
  await pdBuild({
    cwd: tmpDir,
    errors: [],
  } as unknown as BuildInput);

  return {
    projectPath: tmpDir,
    pipeName: "integrationTestPipe",
    mdPath,
  };
}

/**
 * Cleanup helper — removes the temp directory after each test.
 * Uses Deno.remove with recursive: true to handle nested directories.
 *
 * @param projectPath - The temporary project directory to remove
 * Ref: https://docs.deno.com/api/deno/~/Deno.remove
 */
async function cleanup(projectPath: string): Promise<void> {
  try {
    await Deno.remove(projectPath, { recursive: true });
  } catch {
    // Ignore cleanup errors — temp directories will be cleaned up
    // by the OS eventually if manual removal fails.
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Test 1: Edit → sync → rebuild → clean state
// ═══════════════════════════════════════════════════════════════════════

Deno.test("integration: edit → sync → rebuild → clean state", async () => {
  const { projectPath, pipeName, mdPath } = await scaffoldProject();

  try {
    // ── Step 1: Read the built pipe and verify clean state ──
    const pipeData = await readPipeData(projectPath, pipeName);
    assertExists(pipeData, "pipeData should exist after build");
    assertEquals(pipeData.steps.length, 2, "should have 2 steps");

    // Workspace should be clean after initial build.
    // Note: pdBuild may or may not set workspace metadata on first build.
    // The key invariant is that after edit → sync → rebuild, it's clean.

    // ── Step 2: Make a structured edit ──
    // Edit step 0's code to change the greeting.
    const updatedStep = await editStepFields(pipeData, 0, {
      code: 'input.greeting = "hello integration test";',
    });
    assertExists(updatedStep, "editStepFields should return the updated step");
    assert(
      pipeData.workspace?.syncState === "json_dirty",
      "workspace should be json_dirty after edit",
    );

    // Persist the edited pipeData to index.json.
    await writePipeData(projectPath, pipeName, pipeData);

    // ── Step 3: Verify the edit is in index.json but NOT in markdown ──
    const editedPipe = await readPipeData(projectPath, pipeName);
    assertStringIncludes(
      editedPipe.steps[0].code,
      "hello integration test",
      "edited code should be in index.json",
    );

    const mdContent = await Deno.readTextFile(mdPath);
    assertStringIncludes(
      mdContent,
      "hello world",
      "original markdown should still have 'hello world'",
    );
    assert(
      !mdContent.includes("hello integration test"),
      "markdown should NOT contain the edit yet",
    );

    // ── Step 4: Sync structured changes to markdown ──
    const syncResult = await syncPipeToMarkdown(projectPath, pipeName);
    assertEquals(syncResult.success, true, "sync should succeed");
    assertEquals(syncResult.syncState, "clean", "sync state should be clean after sync");

    // ── Step 5: Verify the markdown now contains the edit ──
    const syncedMd = await Deno.readTextFile(mdPath);
    assertStringIncludes(
      syncedMd,
      "hello integration test",
      "synced markdown should contain the edited code",
    );

    // ── Step 6: Verify index.json is clean after sync + rebuild ──
    const cleanPipe = await readPipeData(projectPath, pipeName);
    assertEquals(
      cleanPipe.workspace?.syncState,
      "clean",
      "workspace should be clean after sync + rebuild",
    );

    // The edit should be preserved in both markdown and index.json.
    assertStringIncludes(
      cleanPipe.steps[0].code,
      "hello integration test",
      "edit should be preserved in index.json after sync + rebuild",
    );
  } finally {
    await cleanup(projectPath);
  }
});

// ═══════════════════════════════════════════════════════════════════════
// Test 2: Sync failure recovery — invalid mdPath
// ═══════════════════════════════════════════════════════════════════════

Deno.test("integration: sync failure recovery with invalid mdPath", async () => {
  const { projectPath, pipeName } = await scaffoldProject();

  try {
    // ── Step 1: Edit a step to make the workspace dirty ──
    const pipeData = await readPipeData(projectPath, pipeName);
    await editStepFields(pipeData, 0, {
      code: 'input.greeting = "will fail sync";',
    });

    // ── Step 2: Corrupt the mdPath to simulate a missing file ──
    pipeData.mdPath = "/nonexistent/path/to/file.md";
    await writePipeData(projectPath, pipeName, pipeData);

    // ── Step 3: Attempt sync — should fail gracefully ──
    const syncResult = await syncPipeToMarkdown(projectPath, pipeName);
    assertEquals(syncResult.success, false, "sync should fail with bad mdPath");
    assertEquals(
      syncResult.syncState,
      "json_dirty",
      "workspace should remain dirty after failed sync",
    );

    // ── Step 4: Verify the workspace is still recoverable ──
    // The edited data should still be in index.json.
    const recoveredPipe = await readPipeData(projectPath, pipeName);
    assertStringIncludes(
      recoveredPipe.steps[0].code,
      "will fail sync",
      "edits should be preserved after failed sync",
    );
    assertEquals(
      recoveredPipe.workspace?.syncState,
      "json_dirty",
      "workspace should still be dirty after failed sync",
    );

    // ── Step 5: Fix the mdPath and retry sync ──
    const fixedMdPath = join(projectPath, "integration-test-pipe.md");
    recoveredPipe.mdPath = fixedMdPath;
    await writePipeData(projectPath, pipeName, recoveredPipe);

    const retryResult = await syncPipeToMarkdown(projectPath, pipeName);
    assertEquals(retryResult.success, true, "retry sync should succeed");
    assertEquals(retryResult.syncState, "clean", "workspace should be clean after retry");
  } finally {
    await cleanup(projectPath);
  }
});

// ═══════════════════════════════════════════════════════════════════════
// Test 3: Last-write-wins — raw markdown overwrites structured edits
// ═══════════════════════════════════════════════════════════════════════

Deno.test("integration: last-write-wins — raw markdown overwrites structured edits", async () => {
  const { projectPath, pipeName, mdPath } = await scaffoldProject();

  try {
    // ── Step 1: Make a structured edit (dirty workspace) ──
    const pipeData = await readPipeData(projectPath, pipeName);
    await editStepFields(pipeData, 0, {
      code: 'input.greeting = "structured edit";',
    });
    await writePipeData(projectPath, pipeName, pipeData);

    // Verify workspace is dirty.
    const dirtyPipe = await readPipeData(projectPath, pipeName);
    assertEquals(dirtyPipe.workspace?.syncState, "json_dirty");
    assertStringIncludes(dirtyPipe.steps[0].code, "structured edit");

    // ── Step 2: Write new markdown directly (simulating raw markdown save) ──
    // This should overwrite the structured edit when rebuilt.
    const newMarkdown = `# Integration Test Pipe

A pipe for integration testing.

## Set Greeting

Sets a different greeting via raw markdown.

\`\`\`ts
input.greeting = "raw markdown wins";
\`\`\`

## Uppercase

Uppercases the greeting.

\`\`\`ts
input.result = (input.greeting || "").toUpperCase();
\`\`\`
`;
    await Deno.writeTextFile(mdPath, newMarkdown);

    // ── Step 3: Rebuild from markdown ──
    // This regenerates index.json from the updated markdown, overwriting
    // the structured edit. This is the "last-write-wins" behaviour.
    // Ref: WEB_FIRST_WORKFLOW_PLAN.md §7.4 — saving raw markdown rebuilds
    const rebuilt = await rebuildPipeFromMarkdown(projectPath);
    assertEquals(rebuilt, true, "rebuild should succeed");

    // ── Step 4: Verify the structured edit is gone ──
    const rebuiltPipe = await readPipeData(projectPath, pipeName);
    assertStringIncludes(
      rebuiltPipe.steps[0].code,
      "raw markdown wins",
      "rebuilt pipe should have the raw markdown code",
    );
    assert(
      !rebuiltPipe.steps[0].code.includes("structured edit"),
      "structured edit should be overwritten by rebuild",
    );

    // ── Step 5: Verify the description change from raw markdown is reflected ──
    assertStringIncludes(
      rebuiltPipe.steps[0].description || "",
      "different greeting via raw markdown",
      "rebuilt pipe should have the new description from raw markdown",
    );
  } finally {
    await cleanup(projectPath);
  }
});

// ═══════════════════════════════════════════════════════════════════════
// Test 4: Full loop — edit → run session → sync
// ═══════════════════════════════════════════════════════════════════════

Deno.test("integration: full loop — edit → run session → sync", async () => {
  const { projectPath, pipeName, mdPath } = await scaffoldProject();

  try {
    // ── Step 1: Read the built pipe ──
    const pipeData = await readPipeData(projectPath, pipeName);
    assertExists(pipeData);
    assertEquals(pipeData.steps.length, 2);

    // ── Step 2: Make a structured edit ──
    await editStepFields(pipeData, 0, {
      code: 'input.greeting = "session test";',
    });
    await writePipeData(projectPath, pipeName, pipeData);

    // Need to rebuild so the compiled index.ts reflects the edit
    // (session execution imports the compiled module).
    // First sync the edit to markdown...
    const syncResult = await syncPipeToMarkdown(projectPath, pipeName);
    assertEquals(syncResult.success, true, "sync should succeed");

    // ── Step 3: Read the synced+rebuilt pipe for session creation ──
    const syncedPipe = await readPipeData(projectPath, pipeName);

    // ── Step 4: Create and execute a full session ──
    const session = createSession(
      "test-project",
      syncedPipe,
      {}, // empty initial input
      "full",
    );
    assertExists(session.sessionId, "session should have an ID");
    assertEquals(session.mode, "full");
    assertEquals(session.steps.length, 2);

    // Persist before execution (required for executeSession to write updates).
    await persistSession(projectPath, session);

    // Execute the session — this imports the compiled pipe module and
    // runs each step function in sequence.
    const result = await executeSession(projectPath, session, syncedPipe);

    // ── Step 5: Verify session execution results ──
    assertEquals(
      result.session.status,
      "completed",
      "session should complete successfully",
    );

    // All steps should be "done".
    result.session.steps.forEach(function(step, i) {
      assertEquals(
        step.status,
        "done",
        "step " + i + " should be done",
      );
    });

    // Step 0 should have set greeting, step 1 should have uppercased it.
    // The final output should contain the uppercased greeting.
    const output = result.output as Record<string, unknown>;
    assertEquals(
      output.greeting,
      "session test",
      "step 0 should have set the greeting",
    );
    assertEquals(
      output.result,
      "SESSION TEST",
      "step 1 should have uppercased the greeting",
    );

    // ── Step 6: Verify step snapshots are captured ──
    // Each step should have before/after snapshots and a delta.
    result.session.steps.forEach(function(step, i) {
      assertExists(
        step.beforeSnapshotRef,
        "step " + i + " should have beforeSnapshotRef",
      );
      assertExists(
        step.afterSnapshotRef,
        "step " + i + " should have afterSnapshotRef",
      );
      assertExists(
        step.deltaRef,
        "step " + i + " should have deltaRef",
      );
    });

    // ── Step 7: Verify the markdown reflects the edit after sync ──
    const finalMd = await Deno.readTextFile(mdPath);
    assertStringIncludes(
      finalMd,
      "session test",
      "synced markdown should contain the edited code",
    );

    // ── Step 8: Verify clean workspace state ──
    const finalPipe = await readPipeData(projectPath, pipeName);
    assertEquals(
      finalPipe.workspace?.syncState,
      "clean",
      "workspace should be clean after sync",
    );
  } finally {
    await cleanup(projectPath);
  }
});

// ═══════════════════════════════════════════════════════════════════════
// Test 5: Edit pipe-level fields → sync → verify in markdown
// ═══════════════════════════════════════════════════════════════════════

Deno.test("integration: edit pipe description → sync → verify in markdown", async () => {
  const { projectPath, pipeName, mdPath } = await scaffoldProject();

  try {
    // ── Step 1: Edit the pipe description ──
    const pipeData = await readPipeData(projectPath, pipeName);
    editPipeFields(pipeData, {
      pipeDescription: "Updated description from integration test.",
    });
    await writePipeData(projectPath, pipeName, pipeData);

    assertEquals(pipeData.workspace?.syncState, "json_dirty");

    // ── Step 2: Sync to markdown ──
    const syncResult = await syncPipeToMarkdown(projectPath, pipeName);
    assertEquals(syncResult.success, true);

    // ── Step 3: Verify the description appears in markdown ──
    const md = await Deno.readTextFile(mdPath);
    assertStringIncludes(
      md,
      "Updated description from integration test",
      "pipe description should appear in synced markdown",
    );

    // ── Step 4: Verify clean state ──
    const cleanPipe = await readPipeData(projectPath, pipeName);
    assertEquals(cleanPipe.workspace?.syncState, "clean");
  } finally {
    await cleanup(projectPath);
  }
});

// ═══════════════════════════════════════════════════════════════════════
// Test 6: Insert step → sync → rebuild → verify step count
// ═══════════════════════════════════════════════════════════════════════

Deno.test("integration: insert step → sync → rebuild → verify", async () => {
  const { projectPath, pipeName, mdPath } = await scaffoldProject();

  try {
    // ── Step 1: Insert a new step ──
    const pipeData = await readPipeData(projectPath, pipeName);
    const originalCount = pipeData.steps.length;

    const newStep = await insertStep(pipeData, 0, {
      name: "Log Input",
      code: 'input.logged = true;',
      description: "Logs that the input was processed.",
    });
    assertExists(newStep.stepId, "new step should have a stepId");
    assertEquals(pipeData.steps.length, originalCount + 1);

    await writePipeData(projectPath, pipeName, pipeData);

    // ── Step 2: Sync and rebuild ──
    const syncResult = await syncPipeToMarkdown(projectPath, pipeName);
    assertEquals(syncResult.success, true);

    // ── Step 3: Verify the new step appears in markdown ──
    const md = await Deno.readTextFile(mdPath);
    assertStringIncludes(md, "Log Input", "new step heading should appear in markdown");
    assertStringIncludes(md, "input.logged = true", "new step code should appear in markdown");

    // ── Step 4: Verify the rebuilt pipe has the correct step count ──
    const rebuiltPipe = await readPipeData(projectPath, pipeName);
    assertEquals(
      rebuiltPipe.steps.length,
      originalCount + 1,
      "rebuilt pipe should have the inserted step",
    );
  } finally {
    await cleanup(projectPath);
  }
});
