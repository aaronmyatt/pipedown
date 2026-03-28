// Home PipeToolbar component
PD.components.PipeToolbar = {
  view: function() {
    if (!PD.state.pipeData || !PD.state.selectedPipe) return null;
    return m(".toolbar-overlay", { style: "position: relative; opacity: 1; pointer-events: all; top: auto; right: auto; transform: none; margin-block-end: var(--size-3);" }, [
      m("button.tb-btn", { onclick: function() { PD.actions.llmAction("description"); } }, "Description"),
      m("button.tb-btn", { onclick: function() { PD.actions.llmAction("schema"); } }, "Schema"),
      m("button.tb-btn", { onclick: function() { PD.actions.llmAction("tests"); } }, "Tests"),
      m("button.tb-btn.primary", { onclick: PD.actions.runPipe }, "Run"),
      m("button.tb-btn", { onclick: PD.actions.openEditor }, "Edit"),
      m(".dropdown-wrapper", [
        m("button.tb-btn", {
          onclick: function(e) {
            e.stopPropagation();
            PD.state.pipeDropdownOpen = !PD.state.pipeDropdownOpen;
          }
        }, "More..."),
        PD.state.pipeDropdownOpen ? m(".dropdown-menu", [
          m("button.dropdown-item", { onclick: function() { PD.state.pipeDropdownOpen = false; PD.actions.runTests(); } }, "Run Tests"),
          m("button.dropdown-item", { onclick: function() { PD.state.pipeDropdownOpen = false; PD.actions.runPack(); } }, "Pack"),
          m("a.dropdown-item", { href: "/traces", style: "text-decoration: none; color: var(--text-1);" }, "See Traces")
        ]) : null
      ])
    ]);
  }
};
