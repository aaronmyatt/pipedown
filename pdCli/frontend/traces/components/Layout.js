// Traces Layout component
PD.components.Layout = {
  view: function () {
    const collapsed = !PD.state.sidebarOpen;

    return m("div.layout", {
      class: collapsed ? "sidebar-collapsed" : "",
    }, [
      m("div.topbar", [
        // ── Sidebar toggle button ──
        m("button.sidebar-toggle", {
          onclick: function () {
            PD.state.sidebarOpen = !PD.state.sidebarOpen;
          },
          title: PD.state.sidebarOpen ? "Hide sidebar" : "Show sidebar",
        }, PD.state.sidebarOpen ? "\u25C0" : "\u2630"),
        m("h1", m("a", { href: "/" }, "Pipedown Traces")),
        m("a", { href: "/" }, "Home"),
        m("a", { href: "/projects" }, "Projects"),
        m("span", { style: "flex:1" }),
        // ── Theme toggle ──
        m(
          "button.theme-toggle",
          {
            onclick: function () {
              pd.theme.toggle();
            },
            title: "Theme: " + (pd.theme ? pd.theme.preference : "auto"),
          },
          pd.theme
            ? (pd.theme.preference === "light"
              ? "\u2600"
              : pd.theme.preference === "dark"
              ? "\u263E"
              : "\u25D0")
            : "\u25D0",
        ),
      ]),
      m(PD.components.Sidebar),
      m(PD.components.Detail),
    ]);
  },
};
