import type { CliInput, BuildInput, SyncResult, Pipe, WorkspaceMetadata } from "../pipedown.d.ts";
import { pd, std } from "../deps.ts";
import { PD_DIR } from "./helpers.ts";
import { pdBuild } from "../pdBuild.ts";
import { pipeToMarkdown } from "../pipeToMarkdown.ts";
import { cliHelpTemplate } from "../stringTemplates.ts";

// ── Help Text ──

const helpText = cliHelpTemplate({
  title: "Sync",
  command: "pd sync <pipeName>",
  sections: [
    "Sync changes from .pd/{pipeName}/index.json back to the source markdown file.",
    `Examples:
    pd sync myPipe           # Read .pd/myPipe/index.json, regenerate myPipe.md
    pd sync myPipe --dry-run # Preview the generated markdown without writing`,
  ],
});

// ── Sync Command ──
// `pd sync` is the ONLY supported structured-to-markdown write-back path.
// After successfully writing the markdown, it auto-runs `pd build` to
// re-normalise index.json, bringing the workspace back to a "clean" state.
//
// Ref: WEB_FIRST_WORKFLOW_PLAN.md §7 — "pd sync is the only structured-to-markdown path"
// Ref: WEB_FIRST_WORKFLOW_PLAN.md §7.5 — auto-build after sync

/**
 * Syncs structured changes from `.pd/<pipeName>/index.json` back to the
 * source markdown file, then auto-rebuilds to normalise state.
 *
 * After a successful sync + rebuild cycle, the workspace metadata in
 * index.json will reflect:
 *   - syncState: "clean"
 *   - lastSyncedAt: current timestamp
 *   - lastModifiedBy: "sync"
 *
 * The result is also stored on `input.syncResult` as a machine-readable
 * `SyncResult` envelope so that web UI consumers and tests can inspect
 * the outcome without parsing console output.
 *
 * @param input - CLI input containing flags, globalConfig, etc.
 * @returns The mutated input with syncResult populated
 */
export async function syncCommand(input: CliInput) {
  // ── Help flag check ──
  if (pd.$p.get(input, "/flags/help") || pd.$p.get(input, "/flags/h")) {
    console.log(helpText);
    return input;
  }

  // ── Validate pipe name argument ──
  const pipeName = input.flags._[1] as string;
  if (!pipeName) {
    console.error("Error: missing pipe name argument");
    console.log(helpText);
    return input;
  }

  const indexJsonPath = std.join(PD_DIR, pipeName, "index.json");
  const isDryRun = !!input.flags["dry-run"];

  console.log(`[pd:sync] syncCommand: starting sync for "${pipeName}" (dry-run=${isDryRun})`);
  try {
    // Read the current structured pipe data from index.json.
    // This is the machine-edit source of truth for all structured/web edits.
    const pipeData: Pipe = JSON.parse(await Deno.readTextFile(indexJsonPath));

    // pipeToMarkdown reconstructs markdown from the structured Pipe object.
    // It uses lossless reconstruction when rawSource is available, otherwise
    // falls back to field-based reconstruction.
    // Ref: pipeToMarkdown.ts — pipeToMarkdown()
    const markdown = pipeToMarkdown(pipeData);

    // ── Dry-run mode ──
    // In dry-run mode, show the generated markdown and include it in the
    // SyncResult for programmatic consumers, but don't write anything.
    if (isDryRun) {
      console.log(markdown);

      const result: SyncResult = {
        success: true,
        pipeName,
        mdPath: pipeData.mdPath,
        indexJsonPath,
        syncState: pipeData.workspace?.syncState ?? "clean",
        markdown, // Include generated markdown in dry-run for preview
        rebuilt: false,
      };
      input.syncResult = result;
      return input;
    }

    // ── Write markdown to disk ──
    const mdPath = pipeData.mdPath;
    if (!mdPath) {
      console.error("Error: pipe has no mdPath — cannot determine source file location");
      const result: SyncResult = {
        success: false,
        pipeName,
        indexJsonPath,
        syncState: pipeData.workspace?.syncState ?? "json_dirty",
        error: "pipe has no mdPath — cannot determine source file location",
      };
      input.syncResult = result;
      return input;
    }

    await Deno.writeTextFile(mdPath, markdown);
    console.log(`Synced ${indexJsonPath} → ${mdPath}`);

    // ── Auto-rebuild after sync ──
    // Re-run pdBuild to normalise index.json from the freshly written markdown.
    // This ensures markdown and index.json are fully consistent ("clean" state).
    //
    // We construct a minimal BuildInput with `cwd` set to the project root
    // (derived from the mdPath or PD_DIR location). The build will re-parse
    // the markdown, assign stepIds (preserving existing ones), and write a
    // fresh index.json.
    //
    // Ref: WEB_FIRST_WORKFLOW_PLAN.md §7.5 — "Auto-run pd build after pd sync"
    // Ref: pdCli/buildCommand.ts — shows how pdBuild is invoked from CLI
    let rebuilt = false;
    try {
      // Resolve the project root: PD_DIR is relative to cwd (`./.pd`),
      // so the project root is the current working directory.
      const projectRoot = Deno.cwd();

      const buildInput: BuildInput = {
        cwd: projectRoot,
        flags: { _: [] },
        globalConfig: input.globalConfig || {},
        projectPipes: [],
        output: {},
        debug: false,
        // Match only the pipe we just synced to avoid rebuilding everything.
        // The match pattern is used as a RegExp against file paths.
        match: pipeData.fileName ? pipeData.fileName : undefined,
      };

      await pdBuild(buildInput);
      rebuilt = true;
      console.log(`[pd:sync] syncCommand: rebuilt ${pipeName} after sync`);

      // After a successful rebuild, update workspace metadata in the
      // just-written index.json to reflect the clean synced state.
      // The rebuild itself sets lastBuiltAt and syncState "clean", but
      // we additionally stamp lastSyncedAt and lastModifiedBy "sync".
      try {
        const freshPipeData: Pipe = JSON.parse(await Deno.readTextFile(indexJsonPath));
        freshPipeData.workspace = {
          ...(freshPipeData.workspace || { syncState: "clean" }),
          syncState: "clean",
          lastSyncedAt: new Date().toISOString(),
          lastModifiedBy: "sync",
        } as WorkspaceMetadata;
        await Deno.writeTextFile(indexJsonPath, JSON.stringify(freshPipeData, null, 2));
      } catch (_metaErr) {
        // Non-fatal: workspace metadata update failed but sync+rebuild succeeded.
        // The index.json from the rebuild is still valid.
      }
    } catch (buildErr) {
      // Rebuild failure is non-fatal for the sync operation itself —
      // the markdown was already written successfully.
      console.error(`Warning: rebuild after sync failed: ${buildErr.message}`);
    }

    // ── Build SyncResult envelope ──
    const result: SyncResult = {
      success: true,
      pipeName,
      mdPath,
      indexJsonPath,
      syncState: "clean",
      rebuilt,
    };
    input.syncResult = result;

  } catch (e) {
    console.error(`[pd:sync] syncCommand: failed for "${pipeName}": ${e.message}`);
    input.errors = input.errors || [];
    input.errors.push(e);

    // Even on failure, provide a machine-readable result envelope
    const result: SyncResult = {
      success: false,
      pipeName,
      indexJsonPath,
      syncState: "json_dirty",
      error: e.message,
    };
    input.syncResult = result;
  }

  return input;
}
