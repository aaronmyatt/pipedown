// Home OperationPanel component
PD.components.OperationPanel = {
  view: function() {
    if (!PD.state.activeOp) return null;
    return m(".op-panel", [
      m(".op-panel-header", [
        m("span", [
          PD.state.activeOp.label,
          PD.state.activeOp.status === "running" ? " ..." : "",
          PD.state.activeOp.status === "done" ? " (done)" : "",
          PD.state.activeOp.status === "error" ? " (error)" : ""
        ]),
        m("button.op-panel-close", {
          onclick: function() { PD.state.activeOp = null; }
        }, "\u00D7")
      ]),
      m(".op-panel-body", PD.state.activeOp.output || (PD.state.activeOp.status === "running" ? "Running..." : ""))
    ]);
  }
};
