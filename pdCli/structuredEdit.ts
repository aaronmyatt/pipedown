/**
 * structuredEdit.ts — Pure functions for structured pipe/step editing.
 *
 * These functions implement the core edit primitives for Phase 2 of the
 * web-first workflow. They read/write index.json directly and update
 * workspace metadata to reflect the dirty state.
 *
 * All functions operate on in-memory Pipe objects — the caller is
 * responsible for reading from and writing to disk. This makes the
 * logic testable without HTTP routes.
 *
 * Ref: WEB_FIRST_WORKFLOW_PLAN.md §2 — Phase 2 checklist
 * Ref: pipedown.d.ts — Pipe, Step, WorkspaceMetadata, SyncState
 *
 * Run tests with:
 *   ~/.deno/bin/deno test --no-check -A structured_edit_test.ts
 */

import type { Pipe, Step, WorkspaceMetadata, SyncResult, BuildInput } from "../pipedown.d.ts";
import { std } from "../deps.ts";
import { computeStepFingerprint } from "../pdBuild.ts";
import { pipeToMarkdown } from "../pipeToMarkdown.ts";
import { pdBuild } from "../pdBuild.ts";

// ── Pipe-Level Edit ──
// Updates top-level pipe fields (pipeDescription, schema) without touching
// steps. Marks the workspace as "json_dirty" so the user knows a sync is
// needed to push changes back to markdown.
//
// Ref: WEB_FIRST_WORKFLOW_PLAN.md §4.4 — PATCH /api/workspaces/:project/:pipe

/**
 * Applies partial updates to pipe-level fields.
 *
 * Only fields present in `updates` are modified — all other pipe data is
 * left untouched. After editing, workspace metadata is stamped with
 * syncState "json_dirty" and lastModifiedBy "web_edit".
 *
 * @param pipeData - The full Pipe object from index.json (mutated in place)
 * @param updates  - Object with optional pipeDescription and/or schema fields
 * @returns The mutated pipeData
 */
export function editPipeFields(
  pipeData: Pipe,
  updates: { pipeDescription?: string; schema?: string },
): Pipe {
  const fields = Object.keys(updates);
  console.log(`[pd:workspace] editPipeFields: updating ${fields.join(", ")} on pipe "${pipeData.name || pipeData.cleanName}"`);

  // Apply only the fields that were explicitly provided.
  // Using `hasOwnProperty` ensures we don't skip updates with empty-string values.
  if (Object.prototype.hasOwnProperty.call(updates, "pipeDescription")) {
    pipeData.pipeDescription = updates.pipeDescription;
  }
  if (Object.prototype.hasOwnProperty.call(updates, "schema")) {
    pipeData.schema = updates.schema;
  }

  // Mark the workspace as dirty — structured changes exist that haven't
  // been synced back to the markdown file yet.
  // Ref: WEB_FIRST_WORKFLOW_PLAN.md §7.3 — sync state model
  stampDirty(pipeData);

  console.log(`[pd:workspace] editPipeFields: pipe "${pipeData.name || pipeData.cleanName}" → syncState=json_dirty`);
  return pipeData;
}

// ── Step-Level Edit ──
// Updates individual step fields (name, description, code) and recomputes
// the step's fingerprint so downstream stale detection works correctly.
//
// Ref: WEB_FIRST_WORKFLOW_PLAN.md §4.4 — PATCH /api/workspaces/:project/:pipe/steps/:stepRef

/**
 * Applies partial updates to a step's fields and recomputes its fingerprint.
 *
 * The fingerprint is a SHA-256 hash of the step's code, funcName, and config.
 * Recomputing it after edits allows the session layer to detect changes and
 * mark downstream steps as stale.
 *
 * @param pipeData  - The full Pipe object (mutated in place)
 * @param stepIndex - Zero-based index of the step to edit
 * @param updates   - Object with optional name, description, and/or code fields
 * @returns The updated step, or null if stepIndex is out of bounds
 */
export async function editStepFields(
  pipeData: Pipe,
  stepIndex: number,
  updates: { name?: string; description?: string; code?: string },
): Promise<Step | null> {
  // Bounds check — API callers pass user-provided indices, so validation matters.
  if (stepIndex < 0 || stepIndex >= pipeData.steps.length) {
    return null;
  }

  const step = pipeData.steps[stepIndex];

  // Apply only the provided fields. Each field has specific round-trip
  // implications:
  //   - name: becomes the heading text in markdown
  //   - description: becomes the paragraph between heading and code block
  //   - code: becomes the content of the fenced code block
  if (Object.prototype.hasOwnProperty.call(updates, "name")) {
    step.name = updates.name!;
  }
  if (Object.prototype.hasOwnProperty.call(updates, "description")) {
    step.description = updates.description;
  }
  if (Object.prototype.hasOwnProperty.call(updates, "code")) {
    step.code = updates.code!;
  }

  // Recompute the fingerprint so the session layer can detect that this
  // step has changed and mark downstream steps as stale.
  // Ref: pdBuild.ts — computeStepFingerprint() uses code + funcName + config
  step.fingerprint = await computeStepFingerprint(step);

  // Mark workspace dirty
  stampDirty(pipeData);

  console.log(`[pd:workspace] editStepFields: step[${stepIndex}] "${step.name}" updated (fields: ${Object.keys(updates).join(", ")}) → syncState=json_dirty`);
  return step;
}

// ── Step Insertion ──
// Inserts a new step at a given position, assigns a UUID, computes fingerprint.
//
// Ref: WEB_FIRST_WORKFLOW_PLAN.md §4.4 — POST /api/workspaces/:project/:pipe/steps

/**
 * Inserts a new step into the pipe at a specified position.
 *
 * @param pipeData   - The full Pipe object (mutated in place)
 * @param afterIndex - Insert after this index (-1 or undefined = prepend at start)
 * @param stepData   - The new step's fields: name, code, description
 * @returns The newly created Step object
 */
export async function insertStep(
  pipeData: Pipe,
  afterIndex: number | undefined,
  stepData: { name: string; code: string; description?: string },
): Promise<Step> {
  // Build the new step object with sensible defaults.
  // stepId is generated as a UUID for durable cross-rebuild identity.
  // Ref: https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID
  const newStep: Step = {
    stepId: crypto.randomUUID(),
    name: stepData.name || "New Step",
    // funcName is a sanitized version of the name used in generated TypeScript.
    // Simple sanitization: lowercase, replace non-alphanumeric with underscores.
    funcName: (stepData.name || "NewStep")
      .replace(/[^a-zA-Z0-9_]/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/_+/g, "_") || "newStep",
    code: stepData.code || "// new step code",
    description: stepData.description,
    range: [0, 0],
    inList: false,
    headingLevel: 2,
    language: "ts",
  };

  // Compute the fingerprint for the new step
  newStep.fingerprint = await computeStepFingerprint(newStep);

  // Determine insertion position
  const insertAt = (afterIndex !== undefined && afterIndex >= 0)
    ? Math.min(afterIndex + 1, pipeData.steps.length)
    : 0;

  // Splice the new step into the steps array
  // Ref: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/splice
  pipeData.steps.splice(insertAt, 0, newStep);

  // Mark workspace dirty
  stampDirty(pipeData);

  console.log(`[pd:workspace] insertStep: "${newStep.name}" inserted at position ${insertAt} (stepId=${newStep.stepId})`);
  return newStep;
}

// ── Step Deletion ──
// Removes a step at a given index and marks the workspace dirty.
//
// Ref: WEB_FIRST_WORKFLOW_PLAN.md §4.4

/**
 * Deletes a step from the pipe.
 *
 * @param pipeData  - The full Pipe object (mutated in place)
 * @param stepIndex - Zero-based index of the step to remove
 * @returns The deleted step, or null if index is out of bounds
 */
export function deleteStep(
  pipeData: Pipe,
  stepIndex: number,
): Step | null {
  if (stepIndex < 0 || stepIndex >= pipeData.steps.length) {
    return null;
  }

  // Remove the step from the array
  const [removed] = pipeData.steps.splice(stepIndex, 1);

  // Mark workspace dirty
  stampDirty(pipeData);

  console.log(`[pd:workspace] deleteStep: removed step[${stepIndex}] "${removed.name}" (stepId=${removed.stepId})`);
  return removed;
}

// ── Step Reordering ──
// Moves a step from one position to another.

/**
 * Moves a step from fromIndex to toIndex.
 *
 * @param pipeData  - The full Pipe object (mutated in place)
 * @param fromIndex - Current position of the step
 * @param toIndex   - Target position
 * @returns true if reorder succeeded, false if indices are invalid
 */
export function reorderStep(
  pipeData: Pipe,
  fromIndex: number,
  toIndex: number,
): boolean {
  if (
    fromIndex < 0 || fromIndex >= pipeData.steps.length ||
    toIndex < 0 || toIndex >= pipeData.steps.length
  ) {
    return false;
  }

  // Remove the step from its current position, then insert at the new position.
  // Array.splice handles the index shifting correctly.
  const [moved] = pipeData.steps.splice(fromIndex, 1);
  pipeData.steps.splice(toIndex, 0, moved);

  // Mark workspace dirty
  stampDirty(pipeData);

  console.log(`[pd:workspace] reorderStep: moved "${moved.name}" from index ${fromIndex} → ${toIndex}`);
  return true;
}

// ── Sync: index.json → markdown ──
// Reads index.json, generates markdown via pipeToMarkdown(), writes the
// .md file, and rebuilds. This is the web UI equivalent of `pd sync`.
//
// Ref: WEB_FIRST_WORKFLOW_PLAN.md §7.2 — structured → markdown transition

/**
 * Syncs structured changes from index.json back to the markdown file,
 * then rebuilds index.json from the freshly written markdown.
 *
 * @param projectPath - Absolute path to the project root
 * @param pipeName    - Name of the pipe (matches .pd/<pipeName>/)
 * @returns A SyncResult envelope with outcome details
 */
export async function syncPipeToMarkdown(
  projectPath: string,
  pipeName: string,
): Promise<SyncResult> {
  const indexJsonPath = std.join(projectPath, ".pd", pipeName, "index.json");

  try {
    console.log(`[pd:sync] syncPipeToMarkdown: starting sync for pipe "${pipeName}" in ${projectPath}`);
    // Read the current structured pipe data
    const raw = await Deno.readTextFile(indexJsonPath);
    const pipeData: Pipe = JSON.parse(raw);

    // Generate markdown from the structured data
    // pipeToMarkdown uses lossless reconstruction when rawSource is available,
    // otherwise falls back to field-based reconstruction.
    // Ref: pipeToMarkdown.ts
    const markdown = pipeToMarkdown(pipeData);

    // Determine the markdown file path
    const mdPath = pipeData.mdPath;
    if (!mdPath) {
      return {
        success: false,
        pipeName,
        indexJsonPath,
        syncState: "json_dirty",
        error: "Pipe has no mdPath — cannot determine source file location",
      };
    }

    // Write the generated markdown to disk
    await Deno.writeTextFile(mdPath, markdown);

    // Rebuild index.json from the freshly written markdown so both
    // representations are fully consistent.
    // Ref: WEB_FIRST_WORKFLOW_PLAN.md §7.5 — auto-build after sync
    let rebuilt = false;
    try {
      await pdBuild({
        cwd: projectPath,
        errors: [],
      } as unknown as BuildInput);
      rebuilt = true;

      // After rebuild, update workspace metadata to reflect clean synced state.
      try {
        const freshRaw = await Deno.readTextFile(indexJsonPath);
        const freshPipeData: Pipe = JSON.parse(freshRaw);
        freshPipeData.workspace = {
          ...(freshPipeData.workspace || { syncState: "clean" }),
          syncState: "clean",
          lastSyncedAt: new Date().toISOString(),
          lastModifiedBy: "sync",
        } as WorkspaceMetadata;
        await Deno.writeTextFile(indexJsonPath, JSON.stringify(freshPipeData, null, 2));
      } catch {
        // Non-fatal: workspace metadata update failed but sync+rebuild succeeded.
      }
    } catch (buildErr) {
      console.error(`Warning: rebuild after sync failed: ${(buildErr as Error).message}`);
    }

    console.log(`[pd:sync] syncPipeToMarkdown: completed successfully for "${pipeName}" (rebuilt=${rebuilt})`);
    return {
      success: true,
      pipeName,
      mdPath,
      indexJsonPath,
      syncState: "clean",
      rebuilt,
    };
  } catch (e) {
    console.error(`[pd:sync] syncPipeToMarkdown: failed for "${pipeName}": ${(e as Error).message}`);
    return {
      success: false,
      pipeName,
      indexJsonPath,
      syncState: "json_dirty",
      error: (e as Error).message,
    };
  }
}

// ── Rebuild: markdown → index.json ──
// Runs pdBuild for the project, which re-parses markdown and regenerates
// index.json. The workspace returns to "clean" state.
//
// Ref: WEB_FIRST_WORKFLOW_PLAN.md §7.2 — markdown → structured transition

/**
 * Rebuilds index.json from the markdown source file for the whole project.
 *
 * @param projectPath - Absolute path to the project root
 * @returns true if rebuild succeeded, false otherwise
 */
export async function rebuildPipeFromMarkdown(
  projectPath: string,
): Promise<boolean> {
  try {
    const result = await pdBuild({
      cwd: projectPath,
      errors: [],
    } as unknown as BuildInput);

    return !result.errors || result.errors.length === 0;
  } catch {
    return false;
  }
}

// ── Read/Write helpers ──
// Encapsulate the index.json I/O so backend endpoints stay thin.

/**
 * Reads a pipe's index.json from disk and returns the parsed Pipe object.
 *
 * @param projectPath - Absolute path to the project root
 * @param pipeName    - Name of the pipe
 * @returns The parsed Pipe object
 * @throws If the file doesn't exist or can't be parsed
 */
export async function readPipeData(
  projectPath: string,
  pipeName: string,
): Promise<Pipe> {
  const indexJsonPath = std.join(projectPath, ".pd", pipeName, "index.json");
  const raw = await Deno.readTextFile(indexJsonPath);
  return JSON.parse(raw) as Pipe;
}

/**
 * Writes a Pipe object back to its index.json file.
 *
 * @param projectPath - Absolute path to the project root
 * @param pipeName    - Name of the pipe
 * @param pipeData    - The Pipe object to persist
 */
export async function writePipeData(
  projectPath: string,
  pipeName: string,
  pipeData: Pipe,
): Promise<void> {
  const indexJsonPath = std.join(projectPath, ".pd", pipeName, "index.json");
  await Deno.writeTextFile(indexJsonPath, JSON.stringify(pipeData, null, 2));
}

// ── Internal Helpers ──

/**
 * Stamps workspace metadata as "json_dirty" with "web_edit" provenance.
 * Called after every structured edit to signal that index.json has diverged
 * from the markdown file and a sync is needed.
 *
 * @param pipeData - The Pipe object to stamp (mutated in place)
 */
function stampDirty(pipeData: Pipe): void {
  pipeData.workspace = {
    ...(pipeData.workspace || { syncState: "clean" }),
    syncState: "json_dirty",
    lastModifiedBy: "web_edit",
  } as WorkspaceMetadata;
}
