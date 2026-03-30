// ── Projects Layout component ──
// Root layout for the /projects page. Loads the project list on mount
// and renders the sidebar, detail area, and modal overlays.
// Ref: https://mithril.js.org/lifecycle-methods.html#oncreate
PD.components.Layout = {
  oncreate: function() {
    // Fetch all registered projects on first mount.
    // Ref: PD.actions.loadProjects in state.js
    PD.actions.loadProjects();
  },
  view: function() {
    return m("div.layout", [
      m("div.topbar", [
        m("h1", m("a", { href: "/" }, "Pipedown")),
        m("a", { href: "/" }, "Home"),
        m("a", { href: "/traces" }, "Traces"),
        m("span", { style: "flex:1" }),
        // ── Theme toggle ──
        // Cycles through light → dark → auto using the shared pd.theme helper.
        // Ref: theme.js — pdCli/frontend/shared/theme.js
        m("button.theme-toggle", {
          onclick: function() { pd.theme.toggle(); },
          title: "Theme: " + (pd.theme ? pd.theme.preference : "auto")
        }, pd.theme ? (pd.theme.preference === "light" ? "\u2600" : pd.theme.preference === "dark" ? "\u263E" : "\u25D0") : "\u25D0")
      ]),
      m(PD.components.Breadcrumb),
      m(PD.components.ProjectList),
      PD.state.viewingPipe ? m(PD.components.MarkdownViewer) : m(PD.components.FocusedProjectView),
      // ── Modal overlays ──
      // Rendered last so they sit above all other content (z-index: 50).
      // Each modal returns null when its showXxxModal flag is false.
      m(PD.components.NewProjectModal),
      m(PD.components.NewPipeModal)
    ]);
  }
};
