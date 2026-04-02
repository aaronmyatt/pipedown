// Traces Sidebar component
// Renders a two-level collapsible tree: Project → Pipe → Trace entries.
// Projects and pipes default to collapsed; the user's expand/collapse
// preferences are persisted to localStorage via PD.actions.toggleExpand.
//
// Uses the same button + caret pattern as the home page Sidebar for
// visual consistency across pages.
// Ref: home/components/Sidebar.js — project-group rendering

PD.components.Sidebar = {
  oncreate: function() { PD.actions.loadTraces(); },
  view: function() {
    if (PD.state.loading) {
      return m("div.sidebar", m("p", { style: "color: var(--text-2)" }, "Loading traces..."));
    }
    if (PD.state.traces.length === 0) {
      return m("div.sidebar", [
        m("p", { style: "color: var(--text-2); font-size: var(--font-size-1)" },
          "No traces found."),
        m("p", { style: "color: var(--text-2); font-size: var(--font-size-0)" },
          "Run a pipe with tracing enabled to see traces here.")
      ]);
    }

    var grouped = PD.utils.groupTraces(PD.state.traces);
    var nodes = [];

    Object.keys(grouped).sort().forEach(function(project) {
      var projKey = project;
      // Absent key or `true` → collapsed; explicit `false` → expanded.
      // Matches the home page's collapsed-by-default behaviour.
      var isProjectOpen = PD.state.expanded[projKey] === false;

      // ── Project group ──
      // Wraps the header + children in a .project-group div for consistent
      // spacing and styling with the home page.
      var projectChildren = [
        // ── Project heading ──
        // Clickable button row with caret, name, and pipe count badge.
        // Uses the same .project-group-header class as the home page.
        m("button.project-group-header", {
          onclick: function(e) {
            e.stopPropagation();
            PD.actions.toggleExpand(projKey);
          }
        }, [
          // Unicode right-pointing triangle (U+25B8) — rotated via CSS
          // when the group is expanded.
          // Ref: styles.css .project-group-caret--expanded
          m("span.project-group-caret" + (isProjectOpen ? ".project-group-caret--expanded" : ""), "\u25B8"),
          m("span", project),
          m("span.project-group-count", Object.keys(grouped[project]).length)
        ])
      ];

      if (isProjectOpen) {
        Object.keys(grouped[project]).sort().forEach(function(pipe) {
          var pipeKey = project + "/" + pipe;
          // Same collapsed-by-default semantics for pipe sub-groups
          var isPipeOpen = PD.state.expanded[pipeKey] === false;

          // ── Pipe sub-group heading ──
          // Nested one level deeper; uses .pipe-group-header for the
          // indented styling.
          projectChildren.push(
            m("button.pipe-group-header", {
              onclick: function(e) {
                e.stopPropagation();
                PD.actions.toggleExpand(pipeKey);
              }
            }, [
              m("span.project-group-caret" + (isPipeOpen ? ".project-group-caret--expanded" : ""), "\u25B8"),
              m("span", pipe),
              m("span.project-group-count", grouped[project][pipe].length)
            ])
          );

          if (isPipeOpen) {
            // ── Trace entries ──
            // Individual trace timestamps under the pipe heading.
            projectChildren.push(
              m("div.project-group-pipes",
                grouped[project][pipe].map(function(entry) {
                  return m("div.trace-item" + (PD.utils.isSelected(entry) ? ".active" : ""), {
                    onclick: function() { PD.actions.selectTrace(entry); }
                  }, PD.utils.formatTimestamp(entry.timestamp));
                })
              )
            );
          }
        });
      }

      nodes.push(m("div.project-group", { key: project }, projectChildren));
    });

    return m("div.sidebar", nodes);
  }
};
