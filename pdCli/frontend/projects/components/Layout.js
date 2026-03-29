// Projects Layout component
PD.components.Layout = {
  oncreate: function() {
    m.request({ method: "GET", url: "/api/projects" }).then(function(data) {
      PD.state.projects = data;
      PD.state.loading = false;
    }).catch(function() {
      PD.state.projects = [];
      PD.state.loading = false;
    }).then(function() { m.redraw.sync(); });
  },
  view: function() {
    return m("div.layout", [
      m("div.topbar", [
        m("h1", m("a", { href: "/" }, "Pipedown")),
        m("a", { href: "/" }, "Home"),
        m("a", { href: "/traces" }, "Traces"),
        m("span", { style: "flex:1" }),
        // ── Theme toggle ──
        m("button.theme-toggle", {
          onclick: function() { pd.theme.toggle(); },
          title: "Theme: " + (pd.theme ? pd.theme.preference : "auto")
        }, pd.theme ? (pd.theme.preference === "light" ? "\u2600" : pd.theme.preference === "dark" ? "\u263E" : "\u25D0") : "\u25D0")
      ]),
      m(PD.components.Breadcrumb),
      m(PD.components.ProjectList),
      PD.state.viewingPipe ? m(PD.components.MarkdownViewer) : m(PD.components.FocusedProjectView)
    ]);
  }
};
