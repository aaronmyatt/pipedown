// Home Sidebar component
PD.components.Sidebar = {
  oncreate: function() { PD.actions.loadRecentPipes(); },
  view: function() {
    if (PD.state.loading) {
      return m("div.sidebar", m("p", { style: "color: var(--text-2)" }, "Loading pipes..."));
    }
    var pipes = PD.state.recentPipes;
    if (PD.state.searchQuery) {
      var q = PD.state.searchQuery.toLowerCase();
      pipes = pipes.filter(function(p) {
        return p.pipeName.toLowerCase().includes(q) ||
          p.projectName.toLowerCase().includes(q) ||
          p.pipePath.toLowerCase().includes(q);
      });
    }
    if (pipes.length === 0) {
      return m("div.sidebar", [
        m(PD.components.SearchBar),
        // Show the new-pipe button even in the empty state — it's the primary
        // action when no pipes exist yet.
        m("button.new-pipe-btn", { onclick: PD.actions.openNewPipeModal }, "+ New Pipe"),
        m("p", { style: "color: var(--text-2); font-size: var(--font-size-1)" },
          PD.state.searchQuery ? "No matching pipes." : "No pipes found. Register a project first.")
      ]);
    }
    return m("div.sidebar", [
      m(PD.components.SearchBar),
      // ── New Pipe button ──
      // Creates a new pipe markdown file via a modal dialog. Placed between
      // the search bar and the pipe list so it's always visible.
      // Ref: PD.actions.openNewPipeModal in state.js
      m("button.new-pipe-btn", { onclick: PD.actions.openNewPipeModal }, "+ New Pipe"),
      pipes.map(function(pipe) {
        var isActive = PD.state.selectedPipe &&
          PD.state.selectedPipe.projectName === pipe.projectName &&
          PD.state.selectedPipe.pipePath === pipe.pipePath;
        return m("div.pipe-card" + (isActive ? ".active" : ""), {
          onclick: function() { PD.actions.selectPipe(pipe); }
        }, [
          m("div.pipe-card-name", pipe.pipeName),
          m("div.pipe-card-meta", [
            m("span.badge.badge-project", pipe.projectName),
            pipe.mtime ? m("span.badge", pd.relativeTime(pipe.mtime)) : null
          ])
        ]);
      })
    ]);
  }
};
