// ── Projects ProjectList component (sidebar) ──
// Lists all registered projects with search filtering. Includes a
// "+ New Project" button at the top for creating new projects from the
// dashboard. Each project card shows name, pipe count, and recency.
// Ref: PD.actions.focusProject in state.js for project selection
// Ref: PD.actions.openNewProjectModal in state.js for project creation
PD.components.ProjectList = {
  view: function() {
    if (PD.state.loading) {
      return m("div.sidebar", m("p", { style: "color: var(--text-2)" }, "Loading projects..."));
    }
    var filtered = PD.state.projects.filter(PD.utils.matchesSearch);

    // Empty state — show the New Project button even when no projects exist
    // so users can bootstrap their first project from the dashboard.
    if (filtered.length === 0) {
      return m("div.sidebar", [
        m(PD.components.SearchBar),
        m("button.new-pipe-btn", { onclick: PD.actions.openNewProjectModal }, "+ New Project"),
        m("p", { style: "color: var(--text-2); font-size: var(--font-size-1)" },
          PD.state.searchQuery ? "No matching projects." : "No projects registered yet.")
      ]);
    }
    return m("div.sidebar", [
      m(PD.components.SearchBar),
      // ── New Project button ──
      // Uses the shared .new-pipe-btn style (dashed green border) to
      // signal a creation affordance in the sidebar.
      m("button.new-pipe-btn", { onclick: PD.actions.openNewProjectModal }, "+ New Project"),
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
