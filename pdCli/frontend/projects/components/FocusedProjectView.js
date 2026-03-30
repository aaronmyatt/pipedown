// ── Projects FocusedProjectView component (detail area) ──
// Shows the pipes within the focused project with a "+ New Pipe" button
// for creating new pipes directly in this project.
// Ref: PD.actions.viewPipe in state.js for pipe selection
// Ref: PD.actions.openNewPipeModal in state.js for pipe creation
PD.components.FocusedProjectView = {
  view: function() {
    if (!PD.state.focusedProject) {
      return m("div.detail", m("div.empty-state", [
        m("p", "Select a project to explore")
      ]));
    }
    if (PD.state.pipesLoading) {
      return m("div.detail", m("p", "Loading pipes..."));
    }
    var pipes = PD.state.focusedPipes;
    if (PD.state.searchQuery) {
      var q = PD.state.searchQuery.toLowerCase();
      pipes = pipes.filter(function(p) {
        return p.name.toLowerCase().includes(q) || p.path.toLowerCase().includes(q);
      });
    }
    return m("div.detail", [
      m("div.project-heading", [
        m("h2", PD.state.focusedProject.name),
        m("span.path", PD.state.focusedProject.path),
        // ── New Pipe button ──
        // Positioned in the heading row so it's always accessible when
        // a project is focused. Uses .tb-btn.primary for emphasis.
        m("button.tb-btn.primary", {
          onclick: PD.actions.openNewPipeModal,
          style: "margin-inline-start: auto"
        }, "+ New Pipe")
      ]),
      pipes.length === 0
        ? m("p", { style: "color: var(--text-2)" }, "No markdown pipes found in this project.")
        : m("ul.pipe-list", pipes.map(function(pipe) {
            return m("li.pipe-item", {
              onclick: function() { PD.actions.viewPipe(pipe); }
            }, [
              m("div", [
                m("div.pipe-item-name", pipe.name),
                m("div.pipe-item-path", pipe.path)
              ]),
              pipe.mtime ? m("span.pipe-item-mtime", pd.relativeTime(pipe.mtime)) : null
            ]);
          }))
    ]);
  }
};
