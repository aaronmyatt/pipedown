// Home Layout component
PD.components.Layout = {
  view: function() {
    // ── Sidebar toggle ──
    // When sidebarOpen is false the CSS class .sidebar-collapsed collapses
    // the first grid column to 0px with a transition.
    var collapsed = !PD.state.sidebarOpen;

    return m("div.layout", {
      class: collapsed ? "sidebar-collapsed" : "",
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
        // ── Sidebar toggle button ──
        // Hamburger icon (☰) when sidebar is collapsed, chevron (◀) when open.
        // Flips PD.state.sidebarOpen on click.
        m("button.sidebar-toggle", {
          onclick: function(e) {
            e.stopPropagation();
            PD.state.sidebarOpen = !PD.state.sidebarOpen;
          },
          title: PD.state.sidebarOpen ? "Hide sidebar" : "Show sidebar"
        }, PD.state.sidebarOpen ? "\u25C0" : "\u2630"),
        m("h1", m("a", { href: "/" }, "Pipedown")),
        m("a", { href: "/traces" }, "Traces"),
        // ── Spacer ──
        // Pushes the theme toggle to the far right of the topbar.
        m("span", { style: "flex:1" }),
        // ── Theme toggle button ──
        // Cycles auto → light → dark → auto via pd.theme.toggle().
        // Icon: auto = circle-half (◐), light = sun (☀), dark = moon (☾).
        // Ref: theme.js — pdCli/frontend/shared/theme.js
        m("button.theme-toggle", {
          onclick: function(e) {
            e.stopPropagation();
            pd.theme.toggle();
          },
          title: "Theme: " + (pd.theme ? pd.theme.preference : "auto")
        }, pd.theme ? (pd.theme.preference === "light" ? "\u2600" : pd.theme.preference === "dark" ? "\u263E" : "\u25D0") : "\u25D0")
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
