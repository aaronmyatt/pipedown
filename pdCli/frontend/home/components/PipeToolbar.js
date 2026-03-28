// Home PipeToolbar component
// Renders pipe-level action buttons and an optional I/O panel that displays
// the whole-pipeline input/output from the most recent trace files.
// Ref: state.js PD.actions.loadPipeTraces, homeDashboard.ts recentPipeTraces
PD.components.PipeToolbar = {
  view: function() {
    if (!PD.state.pipeData || !PD.state.selectedPipe) return null;
    return m("div", [
      // ── Action buttons ──
      m(".toolbar-overlay", { style: "position: relative; opacity: 1; pointer-events: all; top: auto; right: auto; transform: none; margin-block-end: var(--size-3);" }, [
        m("button.tb-btn", { onclick: function() { PD.actions.llmAction("description"); } }, "Description"),
        m("button.tb-btn", { onclick: function() { PD.actions.llmAction("schema"); } }, "Schema"),
        m("button.tb-btn", { onclick: function() { PD.actions.llmAction("tests"); } }, "Tests"),
        m("button.tb-btn.primary", { onclick: PD.actions.runPipe }, "Run"),
        m("button.tb-btn", { onclick: PD.actions.openEditor }, "Edit"),
        // I/O button — toggles pipe-level trace display below.
        // Ref: state.js PD.actions.loadPipeTraces
        m("button.tb-btn", { onclick: PD.actions.loadPipeTraces }, "I/O"),
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
      ]),

      // ── Pipe-level I/O trace panel ──
      // Shows the whole-pipeline input and output from the most recent trace
      // files. Uses the shared pd.jsonTree component for collapsible display.
      // Ref: shared/jsonTree.js pd.jsonTree
      PD.state.showPipeTraces ? m(".step-traces", { style: "margin-block-end: var(--size-3);" }, [
        PD.state.pipeTraces ?
          (PD.state.pipeTraces.length === 0 ?
            m("p", { style: "color: var(--text-2); font-size: var(--font-size-0)" }, "No traces found for this pipe.")
            : PD.state.pipeTraces.map(function(t, ti) {
                return m("details", { key: ti, open: ti === 0 }, [
                  m("summary", t.timestamp + (t.durationMs != null ? " (" + t.durationMs.toFixed(1) + "ms, " + (t.stepsTotal || "?") + " steps)" : "")),
                  m("div", { style: "margin: var(--size-1) 0" }, [
                    m("strong", { style: "font-size: var(--font-size-0)" }, "Input:"),
                    pd.jsonTree(t.input || {}, "pipe-trace-" + ti + "-input")
                  ]),
                  m("div", { style: "margin: var(--size-1) 0" }, [
                    m("strong", { style: "font-size: var(--font-size-0)" }, "Output:"),
                    pd.jsonTree(t.output || {}, "pipe-trace-" + ti + "-output")
                  ])
                ]);
              })
          )
        : m("p.spinner", "Loading traces...")
      ]) : null
    ]);
  }
};
