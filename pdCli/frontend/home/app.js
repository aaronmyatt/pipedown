// Home page mount point
m.mount(document.getElementById("app"), {
  view: function() { return m(PD.components.Layout); }
});

// ── SSE hot reload ──
// Watches for file changes on the server (via the /sse endpoint) and
// refreshes the pipe list + currently selected pipe. When the user is
// mid-edit in the markdown editor, we skip the re-select to avoid
// clobbering their unsaved changes — the save action will explicitly
// refresh after writing.
// Ref: buildandserve.ts watchFs() → sends "reload" event on .md changes
var eventSource = new EventSource("/sse");
eventSource.onmessage = function(event) {
  if (event.data === "reload") {
    PD.actions.loadRecentPipes();
    // Don't re-fetch and re-render while the user is editing — their
    // editBuffer would be overwritten by the stale rawMarkdown.
    if (PD.state.selectedPipe && !PD.state.editMode) {
      PD.actions.selectPipe(PD.state.selectedPipe);
    }
  }
};
