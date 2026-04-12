// ── SyncStatusBar Component ──
// A thin status bar below the pipe toolbar showing the current sync state
// between index.json (structured workspace) and the markdown file on disk.
//
// States:
//   - "clean"      → green dot + "In sync"
//   - "json_dirty" → orange dot + "Unsaved changes" + [Sync to markdown] button
//   - "syncing"    → spinner + "Syncing..."
//
// The sync state is read from PD.state.syncState, which is populated when
// pipe data loads (from pipeData.workspace.syncState) and updated by SSE
// events (workspace_changed, sync_state_changed).
//
// Ref: WEB_FIRST_WORKFLOW_PLAN.md §7.3 — sync state model
// Ref: state.js — PD.state.syncState, PD.actions.syncToMarkdown

PD.components.SyncStatusBar = {
  view: function() {
    // Only render when a pipe is selected and pipeData is loaded.
    if (!PD.state.pipeData || !PD.state.selectedPipe) return null;

    var syncState = PD.state.syncState || "clean";

    // ── Status dot + label ──
    // Each sync state gets a distinct colour and label so the user
    // can immediately tell whether markdown is in sync.
    var dotStyle = "";
    var label = "";
    var dotChar = "\u25CF"; // ● filled circle

    if (syncState === "clean") {
      // Green dot — markdown and index.json are consistent.
      dotStyle = "color: var(--green-6, #2b8a3e);";
      label = "In sync";
    } else if (syncState === "json_dirty") {
      // Orange dot — structured edits exist that haven't been synced.
      dotStyle = "color: var(--orange-6, #e8590c);";
      label = "Unsaved changes";
    } else if (syncState === "syncing") {
      // Spinner replaces the dot during sync operations.
      dotChar = "\u25CC"; // ◌ dotted circle (spinner-like)
      dotStyle = "color: var(--blue-6, #1971c2); animation: spin 1s linear infinite;";
      label = "Syncing\u2026";
    }

    return m("div.sync-status-bar", {
      style: [
        "display: flex;",
        "align-items: center;",
        "gap: var(--size-2);",
        "padding: var(--size-1) var(--size-3);",
        "font-size: var(--font-size-0);",
        "background: var(--surface-2);",
        "border-bottom: 1px solid var(--surface-4);",
        "min-height: 28px;"
      ].join(" ")
    }, [
      // Status indicator dot
      m("span", {
        style: dotStyle + " font-size: 0.75rem; line-height: 1;",
        "aria-hidden": "true"
      }, dotChar),

      // Status label
      m("span", {
        style: "color: var(--text-2);"
      }, label),

      // ── "Sync to markdown" button — visible only when dirty ──
      // Triggers POST /api/workspaces/:project/:pipe/sync via
      // PD.actions.syncToMarkdown(), which writes index.json changes
      // back to the .md file and rebuilds.
      // Ref: state.js — PD.actions.syncToMarkdown
      syncState === "json_dirty" ? m("button.tb-btn", {
        style: [
          "margin-inline-start: var(--size-1);",
          "font-size: var(--font-size-00);",
          "padding: var(--size-00) var(--size-2);",
          "border-radius: var(--radius-2);"
        ].join(" "),
        onclick: function(e) {
          e.stopPropagation();
          PD.actions.syncToMarkdown();
        }
      }, "Sync to markdown") : null,

      // ── "Rebuild from markdown" button — also visible when dirty ──
      // Discards structured edits and rebuilds index.json from markdown.
      // Ref: state.js — PD.actions.rebuildFromMarkdown
      syncState === "json_dirty" ? m("button.tb-btn", {
        style: [
          "font-size: var(--font-size-00);",
          "padding: var(--size-00) var(--size-2);",
          "border-radius: var(--radius-2);",
          "opacity: 0.7;"
        ].join(" "),
        onclick: function(e) {
          e.stopPropagation();
          if (confirm("Discard structured edits and rebuild from markdown?")) {
            PD.actions.rebuildFromMarkdown();
          }
        },
        title: "Discard structured edits and rebuild from the .md file"
      }, "Rebuild from .md") : null
    ]);
  }
};
