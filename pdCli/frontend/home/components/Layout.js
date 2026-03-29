// Home Layout component
PD.components.Layout = {
  view: function() {
    return m("div.layout", {
      // ── Click-outside handler ──
      // Clicking anywhere on the layout backdrop closes all open dropdowns
      // (pipe "More...", pipe input dropdown, and step input dropdowns).
      // Individual dropdowns use e.stopPropagation() so clicks inside
      // them don't reach this handler.
      // Ref: PD.state.pipeDropdownOpen, inputDropdownOpen, inputDropdownStep
      onclick: function() {
        PD.state.pipeDropdownOpen = false;
        PD.actions.closeInputDropdowns();
      }
    }, [
      m("div.topbar", [
        m("h1", "Pipedown"),
        m("a", { href: "/projects" }, "Projects"),
        m("a", { href: "/traces" }, "Traces")
      ]),
      m(PD.components.Sidebar),
      m(PD.components.MainContent),
      m(PD.components.RunDrawer),
      // ── New Pipe Modal ──
      // Renders as a fixed overlay when PD.state.showNewPipeModal is true.
      // Placed outside the layout flow so it covers the entire viewport.
      // Ref: PD.actions.openNewPipeModal in state.js
      m(PD.components.NewPipeModal)
    ]);
  }
};
