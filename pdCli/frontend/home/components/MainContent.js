// ── Home MainContent component ──
// Renders the pipe toolbar and either the rendered markdown view (read mode)
// or the textarea editor (edit mode). The toggle is controlled by
// PD.state.editMode — when true, MarkdownEditor replaces MarkdownRenderer.
//
// Output from runs and other operations is displayed in the RunDrawer
// (right-hand sliding panel), so this component only handles the
// markdown content area.
PD.components.MainContent = {
  // ── Lifecycle: inject step toolbars after render ──
  // Step toolbars (Title, Describe, Code, Run-to-here, etc.) are dynamically
  // injected into the DOM after markdown-it renders the HTML. We skip
  // injection in edit mode since the rendered HTML is not present.
  // Ref: PD.utils.injectStepToolbars in MarkdownRenderer.js
  oncreate: function(vnode) {
    if (PD.state.editMode) return;
    if (PD.state.markdownHtml && PD.state.pipeData) {
      var viewer = vnode.dom.querySelector(".md-viewer");
      if (viewer) PD.utils.injectStepToolbars(viewer);
    }
  },
  onupdate: function(vnode) {
    if (PD.state.editMode) return;
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
      // ── Conditional render: editor vs renderer ──
      // editMode toggles between the raw textarea and the rendered markdown.
      // Both components occupy the same layout slot.
      PD.state.editMode
        ? m(PD.components.MarkdownEditor)
        : m(PD.components.MarkdownRenderer)
    ]);
  }
};
