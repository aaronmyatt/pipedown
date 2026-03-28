// Home Layout component
PD.components.Layout = {
  view: function() {
    return m("div.layout", {
      onclick: function() { PD.state.pipeDropdownOpen = false; }
    }, [
      m("div.topbar", [
        m("h1", "Pipedown"),
        m("a", { href: "/projects" }, "Projects"),
        m("a", { href: "/traces" }, "Traces")
      ]),
      m(PD.components.Sidebar),
      m(PD.components.MainContent),
      m(PD.components.RunDrawer)
    ]);
  }
};
