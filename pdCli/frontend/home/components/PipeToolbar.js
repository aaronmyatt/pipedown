function renderInputDropdown() {
  if (!PD.state.inputDropdownOpen) return null;

  return m(".dropdown-menu.input-dropdown", {
    // Prevent clicks inside the dropdown from bubbling to Layout's
    // click-outside handler which would close it prematurely.
    onclick: function(e) { e.stopPropagation(); }
  }, PD.utils.renderInputDropdownItems(null));
}

function renderEditButtons() {
  if (!PD.state.editMode) {
    return m("button.tb-btn", { onclick: PD.actions.enterEditMode }, "Edit");
  }

  return [
    m("button.tb-btn.primary", {
      onclick: PD.actions.saveEdit,
      disabled: PD.state.editSaving
    }, PD.state.editSaving ? "Saving..." : "Save"),
    m("button.tb-btn", { onclick: PD.actions.exitEditMode }, "Cancel")
  ];
}

function renderPipeDropdownMenu() {
  if (!PD.state.pipeDropdownOpen) return null;

  return m(".dropdown-menu", [
    m("button.dropdown-item", { onclick: function() { PD.state.pipeDropdownOpen = false; PD.actions.runTests(); } }, "Run Tests"),
    m("button.dropdown-item", { onclick: function() { PD.state.pipeDropdownOpen = false; PD.actions.runPack(); } }, "Pack"),
    // "Open in Editor" moved here from the main toolbar — the primary
    // "Edit" button now toggles the in-browser editor instead.
    m("button.dropdown-item", { onclick: function() { PD.state.pipeDropdownOpen = false; PD.actions.openEditor(); } }, "Open in Editor"),
    m("a.dropdown-item", { href: "/traces", style: "text-decoration: none; color: var(--text-1);" }, "See Traces")
  ]);
}

function renderPipeTraceItem(trace, traceIndex) {
  let summary = trace.timestamp;

  if (trace.durationMs != null) {
    summary += " (" + trace.durationMs.toFixed(1) + "ms, " + (trace.stepsTotal || "?") + " steps)";
  }

  return m("details", { key: traceIndex, open: traceIndex === 0 }, [
    m("summary", summary),
    m("div", { style: "margin: var(--size-1) 0" }, [
      m("strong", { style: "font-size: var(--font-size-0)" }, "Input:"),
      pd.jsonTree(trace.input || {}, "pipe-trace-" + traceIndex + "-input")
    ]),
    m("div", { style: "margin: var(--size-1) 0" }, [
      m("strong", { style: "font-size: var(--font-size-0)" }, "Output:"),
      pd.jsonTree(trace.output || {}, "pipe-trace-" + traceIndex + "-output")
    ])
  ]);
}

function renderPipeTraceContent() {
  const traces = PD.state.pipeTraces;

  if (!traces) {
    return m("p.spinner", "Loading traces...");
  }

  if (traces.length === 0) {
    return m("p", { style: "color: var(--text-2); font-size: var(--font-size-0)" }, "No traces found for this pipe.");
  }

  return traces.map(function(trace, traceIndex) {
    return renderPipeTraceItem(trace, traceIndex);
  });
}

function renderPipeTracesPanel() {
  if (!PD.state.showPipeTraces) return null;

  return m(".step-traces", { style: "margin-block-end: var(--size-3);" }, renderPipeTraceContent());
}

// Home PipeToolbar component
// Renders pipe-level action buttons and an optional I/O panel that displays
// the whole-pipeline input/output from the most recent trace files.
// The "Run" button is a split button: the left half runs with no input (or
// the currently staged input), the right "▾" half opens a dropdown showing
// unique past inputs from trace history and a "Custom Input..." option that
// opens the drawer's JSON editor.
// Ref: state.js PD.actions.loadPipeTraces, PD.actions.runPipeWithInput
PD.components.PipeToolbar = {
  view: function() {
    if (!PD.state.pipeData || !PD.state.selectedPipe) return null;
    // ── Sticky wrapper ──
    // position: sticky is applied to the outer wrapper div (not the inner
    // .toolbar-overlay) because sticky elements can only stick within their
    // containing block (their parent). This wrapper is a direct child of
    // .detail (the scrolling container), so it can stick for the full
    // scroll range. Putting sticky on the inner .toolbar-overlay would fail
    // because this wrapper would be its containing block and is only as
    // tall as its own content — no room to scroll past.
    // z-index: 15 sits above step toolbar overlays (10) but below
    // dropdowns (20+).
    // Ref: https://developer.mozilla.org/en-US/docs/Web/CSS/position#sticky
    return m("div", { style: "position: sticky; top: 0; z-index: 15; background: var(--surface-2);" }, [
      // ── Action buttons ──
      m(".toolbar-overlay", { style: "position: relative; opacity: 1; pointer-events: all; right: auto; transform: none; margin-block-end: var(--size-3);" }, [
        m("button.tb-btn", { onclick: function() { PD.actions.llmAction("description"); } }, "Description"),
        m("button.tb-btn", { onclick: function() { PD.actions.llmAction("schema"); } }, "Schema"),
        m("button.tb-btn", { onclick: function() { PD.actions.llmAction("tests"); } }, "Tests"),
        // ── Split Run button ──
        // Left half: runs the pipe with no custom input (default behaviour).
        // Right half (▾): opens the input history dropdown.
        // The .split-btn-group wrapper removes inner border-radii so the
        // pair reads as one control.
        // Ref: styles.css .split-btn-group
        m(".split-btn-group", [
          m("button.tb-btn.primary", { onclick: PD.actions.runPipe }, "Run"),
          m("button.tb-btn.primary.split-toggle", {
            onclick: function(e) {
              e.stopPropagation();
              PD.state.inputDropdownOpen = !PD.state.inputDropdownOpen;
              // Close any step-level input dropdown that might be open.
              PD.state.inputDropdownStep = null;
              // Lazy-load input history on first open.
              if (PD.state.inputDropdownOpen) {
                PD.actions.loadInputHistory();
              }
            },
            title: "Run with past input or custom JSON"
          }, "\u25BE"),
          // ── Input history dropdown ──
          // Positioned below the split button via .dropdown-wrapper conventions.
          // Contains "Custom Input..." at top, divider, then unique past inputs.
          renderInputDropdown()
        ]),
        // ── Edit / Save / Cancel toggle ──
        // In read mode: "Edit" enters the textarea editor.
        // In edit mode: "Save" persists changes, "Cancel" discards them.
        // Ref: PD.actions.enterEditMode / saveEdit / exitEditMode in state.js
        renderEditButtons(),
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
          renderPipeDropdownMenu()
        ])
      ]),

      // ── Pipe-level I/O trace panel ──
      // Shows the whole-pipeline input and output from the most recent trace
      // files. Uses the shared pd.jsonTree component for collapsible display.
      // Ref: shared/jsonTree.js pd.jsonTree
      renderPipeTracesPanel()
    ]);
  }
};
