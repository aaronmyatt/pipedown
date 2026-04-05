// Projects page mount point
// Wrap Layout so lifecycle hooks (oncreate) fire correctly
m.mount(document.getElementById("app"), {
  view: function() { return m(PD.components.Layout); }
});

// ── hashchange listener ──
// When the user navigates with browser back/forward buttons, re-read
// the hash and update the project/pipe selection accordingly.
// Ref: https://developer.mozilla.org/en-US/docs/Web/API/Window/hashchange_event
// Ref: shared/hashRouter.js
pd.hashRouter.onHashChange(function() {
  var segments = pd.hashRouter.getSegments();
  if (segments.length > 0) {
    PD.actions.restoreFromHash();
  } else if (PD.state.focusedProject) {
    // Hash was cleared — return to the project list
    PD.actions.goHome();
    m.redraw();
  }
});
