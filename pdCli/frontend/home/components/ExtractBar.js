// ── Extract Bar Component ──
// A fixed-position floating action bar that appears at the bottom of the
// viewport when extract mode is active (PD.state.extractMode === true).
//
// The bar shows:
// - Count of selected steps
// - Text input for the new sub-pipe name
// - "Extract" button (disabled when nothing selected or name is empty)
// - "Cancel" button
//
// Keyboard shortcuts:
//   - Enter  → submit (perform extraction)
//   - Escape → cancel and exit extract mode
//
// Ref: PD.actions.enterExtractMode / exitExtractMode / performExtract in state.js
// Ref: POST /api/extract in buildandserve.ts
// Ref: MarkdownRenderer.js — step toolbars switch to checkboxes in extract mode
PD.components.ExtractBar = {
  // ── Lifecycle: register Escape handler and auto-focus the name input ──
  // Ref: https://mithril.js.org/lifecycle-methods.html#oncreate
  oncreate: function(vnode) {
    vnode.state._keyHandler = function(e) {
      if (e.key === "Escape" && PD.state.extractMode) {
        e.preventDefault();
        PD.actions.exitExtractMode();
      }
    };
    document.addEventListener("keydown", vnode.state._keyHandler);

    // Auto-focus the name input for immediate typing when the bar appears.
    var input = vnode.dom.querySelector(".extract-name-input");
    if (input) input.focus();
  },

  // ── Lifecycle: re-focus input when the component is re-rendered ──
  // The bar appears/disappears based on extractMode, so we re-focus
  // the input each time it becomes visible.
  // Ref: https://mithril.js.org/lifecycle-methods.html#onupdate
  onupdate: function(vnode) {
    if (PD.state.extractMode) {
      var input = vnode.dom.querySelector(".extract-name-input");
      // Only focus if no other element inside the bar has focus already
      // (prevents stealing focus from Cancel button etc.)
      if (input && !vnode.dom.contains(document.activeElement)) {
        input.focus();
      }
    }
  },

  // ── Lifecycle: clean up keyboard handler ──
  onremove: function(vnode) {
    if (vnode.state._keyHandler) {
      document.removeEventListener("keydown", vnode.state._keyHandler);
    }
  },

  view: function() {
    // Only render when extract mode is active. Returning null removes the
    // bar from the DOM entirely.
    if (!PD.state.extractMode) return null;

    // Count selected steps for the label
    var selectedCount = Object.keys(PD.state.extractSelected)
      .filter(function(k) { return PD.state.extractSelected[k]; })
      .length;

    var canExtract = selectedCount > 0 &&
      PD.state.extractName.trim().length > 0 &&
      !PD.state.extracting;

    return m(".extract-bar", [
      // ── Selected count label ──
      m("span.extract-count",
        selectedCount + " step" + (selectedCount !== 1 ? "s" : "") + " selected"
      ),

      // ── Name input ──
      // The user types the name for the new sub-pipe (e.g. "validation").
      // Enter submits, Escape is handled by the document-level keydown handler.
      m("input.extract-name-input", {
        type: "text",
        placeholder: "New pipe name...",
        value: PD.state.extractName,
        oninput: function(e) {
          PD.state.extractName = e.target.value;
        },
        onkeydown: function(e) {
          if (e.key === "Enter" && canExtract) {
            e.preventDefault();
            PD.actions.performExtract();
          }
        }
      }),

      // ── Extract button ──
      m("button.tb-btn.primary", {
        onclick: PD.actions.performExtract,
        disabled: !canExtract
      }, PD.state.extracting ? "Extracting..." : "Extract"),

      // ── Cancel button ──
      m("button.tb-btn", {
        onclick: PD.actions.exitExtractMode
      }, "Cancel")
    ]);
  }
};
