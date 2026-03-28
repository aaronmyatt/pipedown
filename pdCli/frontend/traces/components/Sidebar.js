// Traces Sidebar component
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
      var isOpen = PD.state.expanded[projKey] !== false;
      nodes.push(
        m("h3", { onclick: function() { PD.actions.toggleExpand(projKey); } },
          (isOpen ? "\u25BE " : "\u25B8 ") + project)
      );
      if (isOpen) {
        Object.keys(grouped[project]).sort().forEach(function(pipe) {
          var pipeKey = project + "/" + pipe;
          var pipeOpen = PD.state.expanded[pipeKey] !== false;
          nodes.push(
            m("h4", { onclick: function() { PD.actions.toggleExpand(pipeKey); } },
              (pipeOpen ? "\u25BE " : "\u25B8 ") + pipe)
          );
          if (pipeOpen) {
            grouped[project][pipe].forEach(function(entry) {
              nodes.push(
                m("div.trace-item" + (PD.utils.isSelected(entry) ? ".active" : ""), {
                  onclick: function() { PD.actions.selectTrace(entry); }
                }, PD.utils.formatTimestamp(entry.timestamp))
              );
            });
          }
        });
      }
    });
    return m("div.sidebar", nodes);
  }
};
