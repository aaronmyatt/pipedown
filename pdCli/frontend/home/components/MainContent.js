// ── Home MainContent component ──
// Renders the pipe toolbar and markdown source. Output from runs and other
// operations is now displayed in the RunDrawer (right-hand sliding panel),
// so this component always shows the markdown view — no more view-mode
// tab switching.
PD.components.MainContent = {
  oncreate: function(vnode) {
    if (PD.state.markdownHtml && PD.state.pipeData) {
      var viewer = vnode.dom.querySelector(".md-viewer");
      if (viewer) PD.utils.injectStepToolbars(viewer);
    }
  },
  onupdate: function(vnode) {
    if (PD.state.markdownHtml && PD.state.pipeData) {
      var viewer = vnode.dom.querySelector(".md-viewer");
      if (viewer) PD.utils.injectStepToolbars(viewer);
    }
  },
  view: function() {
    if (!PD.state.selectedPipe) {
      return m("div.detail", m("div.empty-state", [
        m("p", "Select a pipe to view")
      ]));
    }

    return m("div.detail", [
      m(PD.components.PipeToolbar),
      m(PD.components.MarkdownRenderer)
    ]);
  }
};
