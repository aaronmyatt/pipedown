// Traces page mount point
m.mount(document.getElementById("app"), {
  view: function() { return m(PD.components.Layout); }
});

// ── Hash-based selection restoration ──
// After the trace list loads, check the URL hash for a previously selected
// trace and re-select it. This makes selections survive page refreshes
// and enables bookmarkable trace URLs.
//
// We wrap loadTraces so that after the data arrives we can attempt
// restoration from the hash.
// Ref: shared/hashRouter.js — pd.hashRouter.getSegments()
// Ref: state.js — PD.actions.restoreFromHash()
(function() {
  const originalLoad = PD.actions.loadTraces;

  PD.actions.loadTraces = function() {
    const loadPromise = originalLoad.apply(this, arguments);

    return Promise.resolve(loadPromise).then(function(result) {
      PD.actions.restoreFromHash();
      return result;
    });
  };
})();

// ── hashchange listener ──
// When the user navigates with browser back/forward buttons, re-read
// the hash and update the trace selection accordingly.
// Ref: https://developer.mozilla.org/en-US/docs/Web/API/Window/hashchange_event
pd.hashRouter.onHashChange(function() {
  const segments = pd.hashRouter.getSegments();
  if (segments.length === 3) {
    PD.actions.restoreFromHash();
  } else if (segments.length === 0 && PD.state.selected) {
    // Hash was cleared — deselect the current trace
    PD.state.selected = null;
    PD.state.traceData = null;
    m.redraw();
  }
});
