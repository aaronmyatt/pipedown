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
        m("h1", "Pipedown"),
        m("a", { href: "/" }, "Home"),
        m("a", { href: "/traces" }, "Traces")
      ]),
      m(PD.components.Breadcrumb),
      m(PD.components.ProjectList),
      PD.state.viewingPipe ? m(PD.components.MarkdownViewer) : m(PD.components.FocusedProjectView)
    ]);
  }
};
