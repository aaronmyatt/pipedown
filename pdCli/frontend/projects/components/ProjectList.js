// Projects ProjectList component (sidebar)
PD.components.ProjectList = {
  view: function() {
    if (PD.state.loading) {
      return m("div.sidebar", m("p", { style: "color: var(--text-2)" }, "Loading projects..."));
    }
    var filtered = PD.state.projects.filter(PD.utils.matchesSearch);
    if (filtered.length === 0) {
      return m("div.sidebar", [
        m(PD.components.SearchBar),
        m("p", { style: "color: var(--text-2); font-size: var(--font-size-1)" },
          PD.state.searchQuery ? "No matching projects." : "No projects registered yet.")
      ]);
    }
    return m("div.sidebar", [
      m(PD.components.SearchBar),
      filtered.map(function(project, i) {
        var isActive = PD.state.focusedProject && PD.state.focusedProject.name === project.name &&
          PD.state.focusedProject.path === project.path;
        var cls = ".project-card" + (isActive ? ".active" : "") + (!project.exists ? ".stale" : "");
        return m("div" + cls, {
          onclick: function() {
            if (project.exists) PD.actions.focusProject(project);
          }
        }, [
          m("span.caret", "\u203A"),
          m("div.project-info", [
            m("div.project-name", [
              project.name,
              !project.exists ? m("span", { style: "color: var(--text-2); font-weight: normal; margin-left: var(--size-1)" }, "(not found)") : null
            ]),
            m("div.project-meta", [
              project.pipeCount > 0 ? m("span.badge", project.pipeCount + " pipes") : null,
              project.mtime ? m("span.badge" + (i === 0 ? ".badge-recent" : ""), pd.relativeTime(project.mtime)) : null
            ])
          ])
        ]);
      })
    ]);
  }
};
