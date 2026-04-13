// Home page mount point
m.mount(document.getElementById("app"), {
  view: function() { return m(PD.components.Layout); }
});

// ── Global Keyboard Shortcuts ──
// Registers keyboard shortcuts for common actions so power users can
// drive the workspace without reaching for toolbar buttons.
//
// Shortcuts use Cmd (macOS) / Ctrl (other) as the modifier key combined
// with Shift to avoid clashing with browser-native shortcuts.
//
// Ref: https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent
// Ref: WEB_FIRST_WORKFLOW_PLAN.md Phase 5 — keyboard shortcuts
document.addEventListener("keydown", function(e) {
  var mod = e.metaKey || e.ctrlKey;

  // ── Cmd/Ctrl + Shift + R → Run pipe (createAndRunSession) ──
  // Creates a new full session and executes all steps.
  // Ref: state.js — PD.actions.createAndRunSession
  if (mod && e.shiftKey && e.key === "R") {
    e.preventDefault();
    if (PD.state.selectedPipe) {
      PD.actions.createAndRunSession("full");
      m.redraw();
    }
    return;
  }

  // ── Cmd/Ctrl + Shift + N → Run next step ──
  // Finds the first pending step and runs it as a single_step session.
  // Ref: state.js — PD.actions.runNextStep
  if (mod && e.shiftKey && e.key === "N") {
    e.preventDefault();
    if (PD.state.selectedPipe) {
      PD.actions.runNextStep();
      m.redraw();
    }
    return;
  }

  // ── Cmd/Ctrl + Shift + S → Sync to markdown ──
  // Triggers structured-to-markdown sync when workspace is dirty.
  // Ref: state.js — PD.actions.syncToMarkdown
  if (mod && e.shiftKey && e.key === "S") {
    e.preventDefault();
    if (PD.state.selectedPipe && PD.state.syncState === "json_dirty") {
      PD.actions.syncToMarkdown();
      m.redraw();
    }
    return;
  }

  // ── Escape → Close drawer / close any open editor ──
  // The RunDrawer already has its own Escape handler, but this catches
  // the case where the drawer isn't open but a step/pipe editor is.
  // Ref: state.js — PD.actions.cancelStepEdit, PD.actions.cancelPipeFieldEdit
  if (e.key === "Escape") {
    // Close structured editors if open.
    if (PD.state.editingStep !== null) {
      PD.actions.cancelStepEdit();
      m.redraw();
      return;
    }
    if (PD.state.editingPipeField !== null) {
      PD.actions.cancelPipeFieldEdit();
      m.redraw();
      return;
    }
    // Close sync preview if open.
    if (PD.state.syncPreviewOpen) {
      PD.state.syncPreviewOpen = false;
      m.redraw();
      return;
    }
  }
});

// ── SSE hot reload + auto-focus ──
// Watches for server-sent events via the /sse endpoint. Two event types:
//
// 1. Legacy "reload" (plain string) — file watcher detected an .md change.
//    Refreshes the pipe list and the currently-selected pipe.
//
// 2. Structured JSON events — richer notifications from API endpoints.
//    Currently supported:
//      { type: "pipe_executed", project: "name", pipe: "name" }
//    Sent after /api/run and /api/run-step complete. The frontend uses this
//    to auto-focus the most recently executed pipe so the user can inspect
//    its output immediately — especially useful when runs are triggered by
//    the pd-desktop Tauri app or another browser tab.
//
// Ref: buildandserve.ts — broadcastSSE() helper, _controller SSE stream
// Ref: https://developer.mozilla.org/en-US/docs/Web/API/EventSource
const eventSource = new EventSource("/sse");
eventSource.onmessage = function(event) {
  // ── Try to parse as structured JSON event ──
  // The server sends either plain "reload" strings or JSON objects with a
  // `type` field. We attempt JSON parse first; if it fails, fall through
  // to the legacy string-based check.
  let parsed = null;
  try {
    parsed = JSON.parse(event.data);
  } catch (_) {
    // Not JSON — handle as legacy plain-text event below.
  }

  // ── Session-level SSE events ──
  // These events are broadcast by the session execution engine in
  // buildandserve.ts after each step completes or the session finishes.
  // We use them to refresh the active session's step statuses in real-time
  // so the UI badges update without manual polling.
  //
  // Event types:
  //   session_step_updated — a single step changed status (done/failed)
  //   session_updated      — the overall session status changed
  //
  // Ref: buildandserve.ts — broadcastSSE() calls in POST /api/sessions handler
  // Ref: state.js — PD.actions.refreshActiveSession
  if (parsed?.type === "session_step_updated" || parsed?.type === "session_updated") {
    // Only refresh if the event is for our currently active session.
    // This avoids unnecessary fetches when other pipes' sessions complete.
    if (PD.state.activeSession &&
        PD.state.activeSession.sessionId === parsed.sessionId) {
      PD.actions.refreshActiveSession();
    }
    // Don't return — fall through so pipe_executed handling can also fire
    // if the server sends both event types.
    if (parsed.type === "session_step_updated" || parsed.type === "session_updated") {
      return;
    }
  }

  // ── Workspace/sync SSE events ──
  // These events are broadcast by the structured edit endpoints when
  // index.json is modified or when a sync/rebuild changes the state.
  //
  // Event types:
  //   workspace_changed   — pipe/step data was modified in index.json
  //   sync_state_changed  — sync state transitioned (e.g. json_dirty → clean)
  //
  // Ref: buildandserve.ts — broadcastSSE() calls in PATCH/POST endpoints
  // Ref: state.js — PD.state.syncState
  if (parsed?.type === "workspace_changed") {
    // Refresh the pipe data if the event is for the currently selected pipe.
    // This picks up any changes made by other tabs or the sync process.
    if (PD.state.selectedPipe &&
        PD.state.selectedPipe.pipeName === parsed.pipe) {
      PD.actions.refreshPipe();
    }
    return;
  }

  if (parsed?.type === "sync_state_changed") {
    // Update the sync state directly if the event is for the current pipe.
    if (PD.state.selectedPipe &&
        PD.state.selectedPipe.pipeName === parsed.pipe) {
      PD.state.syncState = parsed.syncState || "clean";
      m.redraw();
    }
    return;
  }

  if (parsed?.type === "pipe_executed") {
    // ── Auto-focus the executed pipe ──
    // Refresh the pipe list first (the executed pipe's mtime will have
    // changed, so it will sort to the top of "Recent"). Then find the
    // matching pipe in the updated list and select it — unless the user
    // is mid-edit, in which case we skip to avoid clobbering their work.
    // Ref: state.js — PD.actions.loadRecentPipes, PD.actions.selectPipe
    PD.actions.loadRecentPipes();
    // Also refresh the full pipe list so the "Projects" section stays current.
    PD.actions.loadAllPipes();

    if (!PD.state.editMode) {
      // ── Find and focus the executed pipe ──
      // The pipe likely already exists in recentPipes (it was listed before
      // being run). We search immediately to avoid unnecessary delay. If the
      // pipe isn't found (edge case: brand-new pipe not yet loaded), we retry
      // once after a short delay to let loadRecentPipes finish its fetch.
      //
      // Helper: searches recentPipes and selects or refreshes the match.
      // Ref: state.js — PD.actions.selectPipe, PD.actions.refreshPipe
      const focusPipe = function() {
        const match = PD.state.recentPipes.find(function(p) {
          return p.projectName === parsed.project && p.pipeName === parsed.pipe;
        });
        if (!match) return false;

        // If the user already has this pipe open, use refreshPipe() to
        // preserve scroll position. Otherwise, do a full selectPipe().
        const current = PD.state.selectedPipe;
        if (current && current.projectName === match.projectName && current.pipeName === match.pipeName) {
          PD.actions.refreshPipe();
        } else {
          PD.actions.selectPipe(match);
        }
        return true;
      };

      // Try immediately — works when the pipe is already in the list.
      if (!focusPipe()) {
        // Retry after 500ms to let loadRecentPipes finish its network fetch.
        // Ref: https://developer.mozilla.org/en-US/docs/Web/API/setTimeout
        setTimeout(focusPipe, 500);
      }
    }
    return;
  }

  // ── Legacy plain-text "reload" event ──
  // Fired by the file watcher when .md files change on disk.
  if (event.data === "reload") {
    PD.actions.loadRecentPipes();
    // Keep the "Projects" section in sync with the file watcher too.
    PD.actions.loadAllPipes();
    // Don't re-fetch and re-render while the user is editing — their
    // editBuffer would be overwritten by the stale rawMarkdown.
    // Use refreshPipe() instead of selectPipe() to preserve the user's
    // scroll position in the .detail container.
    if (PD.state.selectedPipe && !PD.state.editMode) {
      PD.actions.refreshPipe();
    }
  }
};

// ── Hash-based selection restoration ──
// After the initial data fetch completes, check the URL hash for a
// previously selected pipe and re-select it. This makes selections
// survive page refreshes and enables bookmarkable pipe URLs.
//
// We override the original loadRecentPipes success path by wrapping
// the action: once pipes load, attempt to restore from hash.
// Ref: shared/hashRouter.js — pd.hashRouter.getSegments()
// Ref: state.js — PD.actions.restoreFromHash()
(function() {
  // Kick off both fetches in parallel: the 10 most recent (for "Recent"
  // section) and the full list (for "Projects" section).
  PD.actions.loadAllPipes();
  PD.actions.loadRecentPipes()
  .then(function() {
    // After loadRecentPipes completes, attempt to restore
    // selection from the URL hash. This handles the case where the user
    // refreshes the page with a pipe selected — we want to re-select it
    // after reload.
    PD.actions.restoreFromHash();
  });
})();

// ── hashchange listener ──
// When the user navigates with browser back/forward buttons, the hash
// changes. Re-read it and update the selection accordingly.
// Ref: https://developer.mozilla.org/en-US/docs/Web/API/Window/hashchange_event
pd.hashRouter.onHashChange(function() {
  var segments = pd.hashRouter.getSegments();
  if (segments.length === 2) {
    // Hash has a pipe selection — restore it
    PD.actions.restoreFromHash();
  } else if (segments.length === 0 && PD.state.selectedPipe) {
    // Hash was cleared (e.g. user pressed back to deselect) — clear selection.
    PD.state.selectedPipe = null;
    PD.state.markdownHtml = null;
    PD.state.pipeData = null;
    PD.state.rawMarkdown = null;
    m.redraw();
  }
});
