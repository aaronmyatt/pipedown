// Home page mount point
m.mount(document.getElementById("app"), {
  view: function() { return m(PD.components.Layout); }
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

  if (parsed?.type === "pipe_executed") {
    // ── Auto-focus the executed pipe ──
    // Refresh the pipe list first (the executed pipe's mtime will have
    // changed, so it will sort to the top of "Recent"). Then find the
    // matching pipe in the updated list and select it — unless the user
    // is mid-edit, in which case we skip to avoid clobbering their work.
    // Ref: state.js — PD.actions.loadRecentPipes, PD.actions.selectPipe
    PD.actions.loadRecentPipes();

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
    // Don't re-fetch and re-render while the user is editing — their
    // editBuffer would be overwritten by the stale rawMarkdown.
    // Use refreshPipe() instead of selectPipe() to preserve the user's
    // scroll position in the .detail container.
    if (PD.state.selectedPipe && !PD.state.editMode) {
      PD.actions.refreshPipe();
    }
  }
};
