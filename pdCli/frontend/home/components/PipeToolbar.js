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
        // ── LLM action buttons ──
        m("button.tb-btn", { onclick: function() { PD.actions.llmAction("description"); } }, "AI Desc"),
        m("button.tb-btn", { onclick: function() { PD.actions.llmAction("schema"); } }, "AI Schema"),
        m("button.tb-btn", { onclick: function() { PD.actions.llmAction("tests"); } }, "Tests"),
        // ── Structured edit buttons for pipe-level fields ──
        // These open inline textareas for directly editing the pipe's
        // description or schema. Unlike the LLM buttons above (which
        // generate content via AI), these let the user type manually.
        // Ref: state.js — PD.actions.enterPipeFieldEdit
        m("button.tb-btn", {
          onclick: function() {
            PD.actions.enterPipeFieldEdit("description");
          },
          style: PD.state.editingPipeField === "description" ? "background: var(--blue-3); color: var(--blue-9);" : ""
        }, "Edit Desc"),
        m("button.tb-btn", {
          onclick: function() {
            PD.actions.enterPipeFieldEdit("schema");
          },
          style: PD.state.editingPipeField === "schema" ? "background: var(--blue-3); color: var(--blue-9);" : ""
        }, "Edit Schema"),
        // ── Ask Pi button (pipe-scoped) ──
        // Opens a prompt dialog for the user to describe what Pi should
        // improve across the entire pipeline. Generates a pipe-scoped
        // proposal that can modify descriptions, schema, any step, or
        // insert/delete steps.
        // Ref: PD.actions.askPiForPipe in state.js
        m("button.tb-btn", {
          onclick: function() {
            var prompt = window.prompt("What should Pi improve in this pipeline?");
            if (prompt) {
              PD.actions.askPiForPipe(prompt);
            }
          },
          style: "color: var(--blue-7);"
        }, "\uD83E\uDD16 Ask Pi"),
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
      renderPipeTracesPanel(),

      // ── Inline pipe-level field editor ──
      // Renders a textarea for editing pipe description or schema when
      // PD.state.editingPipeField is set. Appears below the toolbar.
      // Ref: state.js — PD.state.editingPipeField, PD.state.editPipeBuffer
      renderPipeFieldEditor()
    ]);
  }
};

// ── Pipe-level inline field editor ──
// Renders a textarea + Save/Cancel for editing the pipe description or schema.
// Returns null when no field is being edited.
// Ref: state.js — PD.actions.savePipeFieldEdit, PD.actions.cancelPipeFieldEdit
function renderPipeFieldEditor() {
  if (!PD.state.editingPipeField) return null;

  var fieldName = PD.state.editingPipeField;
  var label = fieldName === "description" ? "Pipe Description" : "Pipe Schema";
  var rows = fieldName === "schema" ? 10 : 4;

  return m(".pipe-field-editor", {
    style: [
      "padding: var(--size-3);",
      "background: var(--surface-1);",
      "border: 1px solid var(--surface-4);",
      "border-radius: var(--radius-2);",
      "margin-block-end: var(--size-3);"
    ].join(" ")
  }, [
    m("label", {
      style: "display: block; margin-block-end: var(--size-2); font-weight: 600; font-size: var(--font-size-0);"
    }, label),
    m("textarea", {
      value: PD.state.editPipeBuffer,
      oninput: function(e) {
        PD.state.editPipeBuffer = e.target.value;
      },
      rows: rows,
      style: [
        "width: 100%;",
        "padding: var(--size-2);",
        fieldName === "schema"
          ? "font-family: var(--font-mono, 'Fira Code', 'Cascadia Code', monospace);"
          : "",
        "font-size: var(--font-size-0);",
        "border: 1px solid var(--surface-4);",
        "border-radius: var(--radius-2);",
        "background: var(--surface-2);",
        "color: var(--text-1);",
        "resize: vertical;",
        "margin-block-end: var(--size-2);"
      ].join(" ")
    }),
    m("div", { style: "display: flex; gap: var(--size-2);" }, [
      m("button.tb-btn.primary", {
        onclick: function() {
          // Build the patch based on which field is being edited
          var fields = {};
          if (fieldName === "description") {
            fields.pipeDescription = PD.state.editPipeBuffer;
          } else if (fieldName === "schema") {
            fields.schema = PD.state.editPipeBuffer;
          }
          PD.actions.savePipeFieldEdit(fields);
        }
      }, "Save"),
      m("button.tb-btn", {
        onclick: function() {
          PD.actions.cancelPipeFieldEdit();
        }
      }, "Cancel")
    ])
  ]);
}
