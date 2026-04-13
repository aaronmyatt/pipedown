// ── SyncStatusBar Component ──
// A status bar below the pipe toolbar showing the current sync state
// between index.json (structured workspace) and the markdown file on disk,
// plus timestamps and an expandable sync preview panel.
//
// States:
//   - "clean"      → green dot + "In sync"
//   - "json_dirty" → orange dot + "Unsaved changes" + [Sync] + [Preview] + [Rebuild]
//   - "syncing"    → spinner + "Syncing..."
//
// Phase 4 enhancements:
//   - Sync preview: expandable panel showing generated markdown before sync
//   - Timestamps: lastSyncedAt, lastBuiltAt, lastModifiedBy from workspace metadata
//   - Rebuild action: one-click rebuild from markdown
//
// The sync state is read from PD.state.syncState, which is populated when
// pipe data loads (from pipeData.workspace.syncState) and updated by SSE
// events (workspace_changed, sync_state_changed).
//
// Ref: WEB_FIRST_WORKFLOW_PLAN.md §7.3 — sync state model
// Ref: WEB_FIRST_WORKFLOW_PLAN.md Phase 4 — sync preview panel
// Ref: state.js — PD.state.syncState, PD.actions.syncToMarkdown, PD.actions.loadSyncPreview

PD.components.SyncStatusBar = {
  view: function() {
    // Only render when a pipe is selected and pipeData is loaded.
    if (!PD.state.pipeData || !PD.state.selectedPipe) return null;

    var syncState = PD.state.syncState || "clean";
    var workspace = PD.state.pipeData.workspace || {};

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

    // ── Timestamp display ──
    // Shows last synced/built times using the shared pd.relativeTime() utility,
    // and which mode last wrote the workspace (build/sync/web_edit/pi_patch).
    // Ref: pdCli/frontend/shared/relativeTime.js — pd.relativeTime()
    var timestampParts = [];
    if (workspace.lastSyncedAt) {
      timestampParts.push("Synced " + pd.relativeTime(workspace.lastSyncedAt));
    }
    if (workspace.lastBuiltAt) {
      timestampParts.push("Built " + pd.relativeTime(workspace.lastBuiltAt));
    }
    if (workspace.lastModifiedBy) {
      // Display the provenance source in a human-friendly label.
      // Possible values: "build", "sync", "web_edit", "pi_patch"
      var modLabel = workspace.lastModifiedBy
        .replace(/_/g, " ")
        .replace(/^\w/, function(c) { return c.toUpperCase(); });
      timestampParts.push("Modified by: " + modLabel);
    }

    var children = [
      // Status indicator dot
      m("span", {
        style: dotStyle + " font-size: 0.75rem; line-height: 1;",
        "aria-hidden": "true"
      }, dotChar),

      // Status label
      m("span", {
        style: "color: var(--text-2);"
      }, label),

      // ── Timestamp info — shown as subdued secondary text ──
      timestampParts.length > 0 ? m("span", {
        style: "color: var(--text-2); opacity: 0.7; font-size: var(--font-size-00); margin-inline-start: var(--size-1);"
      }, timestampParts.join(" · ")) : null,

      // ── "Preview sync" button — visible only when dirty ──
      // Fetches the generated markdown from the sync-preview API
      // and toggles an expandable panel below the bar.
      // Ref: state.js — PD.actions.loadSyncPreview
      syncState === "json_dirty" ? m("button.tb-btn", {
        style: [
          "margin-inline-start: auto;",
          "font-size: var(--font-size-00);",
          "padding: var(--size-00) var(--size-2);",
          "border-radius: var(--radius-2);"
        ].join(" "),
        onclick: function(e) {
          e.stopPropagation();
          if (PD.state.syncPreviewOpen) {
            // Toggle off — just close the panel.
            PD.state.syncPreviewOpen = false;
          } else {
            // Toggle on — fetch preview and open.
            PD.state.syncPreviewOpen = true;
            PD.actions.loadSyncPreview();
          }
        },
        disabled: PD.state.syncPreviewLoading
      }, PD.state.syncPreviewLoading ? "Loading\u2026" : (PD.state.syncPreviewOpen ? "Hide preview" : "Preview sync")) : null,

      // ── "Sync to markdown" button — visible only when dirty ──
      // Triggers POST /api/workspaces/:project/:pipe/sync via
      // PD.actions.syncToMarkdown(), which writes index.json changes
      // back to the .md file and rebuilds.
      // Ref: state.js — PD.actions.syncToMarkdown
      syncState === "json_dirty" ? m("button.tb-btn", {
        style: [
          "font-size: var(--font-size-00);",
          "padding: var(--size-00) var(--size-2);",
          "border-radius: var(--radius-2);"
        ].join(" "),
        onclick: function(e) {
          e.stopPropagation();
          PD.actions.syncToMarkdown();
        }
      }, "Sync to markdown") : null,

      // ── "Rebuild from markdown" button — visible when dirty ──
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
      }, "Rebuild from .md") : null,

      // ── "Rebuild from markdown" button — visible when clean ──
      // Available as a secondary action even when clean for manual rebuilds.
      // Ref: WEB_FIRST_WORKFLOW_PLAN.md Phase 4 — explicit rebuild action
      syncState === "clean" ? m("button.tb-btn", {
        style: [
          "margin-inline-start: auto;",
          "font-size: var(--font-size-00);",
          "padding: var(--size-00) var(--size-2);",
          "border-radius: var(--radius-2);",
          "opacity: 0.6;"
        ].join(" "),
        onclick: function(e) {
          e.stopPropagation();
          PD.actions.rebuildFromMarkdown();
        },
        title: "Rebuild index.json from the markdown source file"
      }, "\u21BB Rebuild") : null
    ];

    var barAndPreview = [
      // ── Main status bar ──
      m("div.sync-status-bar", {
        style: [
          "display: flex;",
          "align-items: center;",
          "gap: var(--size-2);",
          "padding: var(--size-1) var(--size-3);",
          "font-size: var(--font-size-0);",
          "background: var(--surface-2);",
          "border-bottom: 1px solid var(--surface-4);",
          "min-height: 28px;",
          "flex-wrap: wrap;"
        ].join(" ")
      }, children)
    ];

    // ── Sync Preview Panel ──
    // Expandable section below the bar showing the generated markdown
    // that would be written on sync. Fetched from the sync-preview API.
    // Ref: WEB_FIRST_WORKFLOW_PLAN.md Phase 4 — sync preview panel
    if (PD.state.syncPreviewOpen && syncState === "json_dirty") {
      var previewContent;
      if (PD.state.syncPreviewLoading) {
        previewContent = m("div", {
          style: "text-align: center; padding: var(--size-3); color: var(--text-2);"
        }, "Loading sync preview\u2026");
      } else if (PD.state.syncPreview) {
        previewContent = [
          m("div", {
            style: "display: flex; justify-content: space-between; align-items: center; margin-block-end: var(--size-2);"
          }, [
            m("strong", { style: "font-size: var(--font-size-0);" }, "Generated Markdown Preview"),
            m("button.tb-btn.primary", {
              style: "font-size: var(--font-size-00); padding: var(--size-00) var(--size-2);",
              onclick: function(e) {
                e.stopPropagation();
                PD.actions.syncToMarkdown();
                PD.state.syncPreviewOpen = false;
              }
            }, "Sync now")
          ]),
          // Scrollable <pre> block showing the generated markdown.
          // max-height prevents it from dominating the viewport.
          m("pre", {
            style: [
              "max-height: 400px;",
              "overflow-y: auto;",
              "padding: var(--size-2);",
              "background: var(--surface-1);",
              "border: 1px solid var(--surface-3);",
              "border-radius: var(--radius-2);",
              "font-family: var(--font-mono);",
              "font-size: var(--font-size-00);",
              "white-space: pre-wrap;",
              "word-break: break-word;"
            ].join(" ")
          }, PD.state.syncPreview)
        ];
      } else {
        previewContent = m("div", {
          style: "padding: var(--size-2); color: var(--text-2);"
        }, "No preview available.");
      }

      barAndPreview.push(
        m("div.sync-preview-panel", {
          style: [
            "padding: var(--size-2) var(--size-3);",
            "background: var(--surface-1);",
            "border-bottom: 1px solid var(--surface-4);"
          ].join(" ")
        }, previewContent)
      );
    }

    return m("div", barAndPreview);
  }
};
