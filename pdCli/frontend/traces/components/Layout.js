// Traces Layout component
PD.components.Layout = {
  view: function() {
    return m("div.layout", [
      m("div.topbar", [
        m("h1", "Pipedown Traces"),
        m("a", { href: "/" }, "Home"),
        m("a", { href: "/projects" }, "Projects")
      ]),
      m(PD.components.Sidebar),
      m(PD.components.Detail)
    ]);
  }
};
