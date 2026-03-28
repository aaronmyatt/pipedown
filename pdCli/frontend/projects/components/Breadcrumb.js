// Projects Breadcrumb component
PD.components.Breadcrumb = {
  view: function() {
    var items = [
      m("a", { onclick: PD.actions.goHome }, "Projects")
    ];
    if (PD.state.focusedProject) {
      items.push(m("span.sep", "\u203A"));
      if (PD.state.viewingPipe) {
        items.push(m("a", { onclick: PD.actions.goToProject }, PD.state.focusedProject.name));
      } else {
        items.push(m("span", PD.state.focusedProject.name));
      }
    }
    if (PD.state.viewingPipe) {
      items.push(m("span.sep", "\u203A"));
      items.push(m("span", PD.state.viewingPipe.name));
    }
    return m("div.breadcrumb", items);
  }
};
