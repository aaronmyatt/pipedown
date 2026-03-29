// Home Sidebar component
// Renders two sections:
//   1. "Recent" — the 10 most recently edited pipes (mtime-sorted)
//   2. "Projects" — all pipes grouped by project with collapsible headers
// Both sections share the same search filter and pipe card rendering.
// Ref: state.js PD.actions.loadRecentPipes, PD.utils.groupPipesByProject

// ── renderPipeCard ──
// Shared vnode factory for a single pipe entry in either sidebar section.
// Compares by projectName + pipePath to handle duplicate pipe names across
// projects correctly.
// @param {object} pipe — a RecentPipe object from PD.state.recentPipes
// @return {object} — Mithril vnode for the pipe card
// Ref: state.js PD.actions.selectPipe
function renderPipeCard(pipe) {
  var isActive = PD.state.selectedPipe &&
    PD.state.selectedPipe.projectName === pipe.projectName &&
    PD.state.selectedPipe.pipePath === pipe.pipePath;
  return m("div.pipe-card" + (isActive ? ".active" : ""), {
    key: pipe.projectName + "/" + pipe.pipePath,
    onclick: function() { PD.actions.selectPipe(pipe); }
  }, [
    m("div.pipe-card-name", pipe.pipeName),
    m("div.pipe-card-meta", [
      // Project badge omitted in the "Projects" section since the project
      // heading already provides that context, but kept here for "Recent"
      // where pipes from different projects are interleaved.
      m("span.badge.badge-project", pipe.projectName),
      pipe.mtime ? m("span.badge", pd.relativeTime(pipe.mtime)) : null
    ])
  ]);
}

PD.components.Sidebar = {
  // ── oncreate ──
  // Triggers the initial data fetch when the sidebar first mounts.
  // Ref: https://mithril.js.org/lifecycle-methods.html#oncreate
  oncreate: function() { PD.actions.loadRecentPipes(); },
  view: function() {
    if (PD.state.loading) {
      return m("div.sidebar", m("p", { style: "color: var(--text-2)" }, "Loading pipes..."));
    }

    // ── Search filtering ──
    // Applies the same client-side filter as before. Both sections
    // derive their content from this filtered array.
    // Ref: PD.state.searchQuery bound by SearchBar.js
    var pipes = PD.state.recentPipes;
    if (PD.state.searchQuery) {
      var q = PD.state.searchQuery.toLowerCase();
      pipes = pipes.filter(function(p) {
        return p.pipeName.toLowerCase().includes(q) ||
          p.projectName.toLowerCase().includes(q) ||
          p.pipePath.toLowerCase().includes(q);
      });
    }

    // ── Empty state ──
    // When no pipes match (either no data at all, or search has no hits),
    // show a helpful message and always keep the "+ New Pipe" button.
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

    // ── Derive section data ──
    // "Recent" takes the first 10 from the mtime-sorted, filtered list.
    // "Projects" groups the full filtered list by projectName.
    // Ref: state.js PD.utils.groupPipesByProject
    var recentPipes = pipes.slice(0, 10);
    var projectGroups = PD.utils.groupPipesByProject(pipes);

    return m("div.sidebar", [
      m(PD.components.SearchBar),
      // ── New Pipe button ──
      // Creates a new pipe markdown file via a modal dialog. Placed between
      // the search bar and the pipe list so it's always visible.
      // Ref: PD.actions.openNewPipeModal in state.js
      m("button.new-pipe-btn", { onclick: PD.actions.openNewPipeModal }, "+ New Pipe"),

      // ── "Recent" section ──
      // Shows the 10 most recently modified pipes (after search filtering).
      // Mirrors VS Code's "Recently Opened" pattern — quick access to active work.
      m("div.sidebar-section", [
        m("h3.sidebar-section-header", "Recent"),
        recentPipes.map(renderPipeCard)
      ]),

      // ── "Projects" section ──
      // All pipes grouped under collapsible project headings, sorted
      // alphabetically by project name. A pipe may appear in both sections
      // (intentional — same as VS Code's Recent + Explorer pattern).
      // Ref: state.js PD.state.collapsedProjects, PD.actions.toggleProjectCollapse
      m("div.sidebar-section", [
        m("h3.sidebar-section-header", "Projects"),
        projectGroups.map(function(group) {
          var isCollapsed = PD.state.collapsedProjects[group.projectName];
          return m("div.project-group", { key: group.projectName }, [
            // ── Project heading ──
            // Clickable row that toggles the pipe list visibility.
            // Shows a rotation caret, the project name, and a pipe count.
            m("button.project-group-header", {
              onclick: function(e) {
                e.stopPropagation();
                PD.actions.toggleProjectCollapse(group.projectName);
              }
            }, [
              // Unicode right-pointing triangle (U+25B8) — rotated via CSS
              // when the group is expanded.
              // Ref: styles.css .project-group-caret--expanded
              m("span.project-group-caret" + (isCollapsed ? "" : ".project-group-caret--expanded"), "\u25B8"),
              m("span", group.projectName),
              m("span.project-group-count", group.pipes.length)
            ]),
            // ── Pipe list ──
            // Only rendered when the group is not collapsed.
            !isCollapsed ? m("div.project-group-pipes",
              group.pipes.map(renderPipeCard)
            ) : null
          ]);
        })
      ])
    ]);
  }
};
