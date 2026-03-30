// ── New Pipe Modal Component (Projects Page) ──
// Simplified version of the home page's NewPipeModal. Since the projects
// page always has a focused project, there's no project dropdown — the
// new pipe is created directly in the focused project.
//
// Keyboard shortcuts:
//   - Enter  → submit (create pipe)
//   - Escape → close modal
//
// Ref: PD.actions.createNewPipe in state.js for the creation flow
// Ref: POST /api/projects/{name}/files/{path} in buildandserve.ts
PD.components.NewPipeModal = {
  // ── Lifecycle: register Escape handler and focus the name input ──
  // Ref: https://mithril.js.org/lifecycle-methods.html#oncreate
  oncreate: function(vnode) {
    vnode.state._keyHandler = function(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        PD.actions.closeNewPipeModal();
        m.redraw();
      }
    };
    document.addEventListener("keydown", vnode.state._keyHandler);

    // Auto-focus the name input for immediate typing
    var input = vnode.dom.querySelector("input");
    if (input) input.focus();
  },

  // ── Lifecycle: clean up keydown listener ──
  onremove: function(vnode) {
    if (vnode.state._keyHandler) {
      document.removeEventListener("keydown", vnode.state._keyHandler);
    }
  },

  view: function() {
    // Only render when the modal is open
    if (!PD.state.showNewPipeModal) return null;

    // Show which project the pipe will be added to
    var projectName = PD.state.focusedProject
      ? PD.state.focusedProject.name
      : "Unknown";

    return m(".modal-overlay", {
      // Clicking the backdrop closes the modal
      onclick: function(e) {
        if (e.target === e.currentTarget) {
          PD.actions.closeNewPipeModal();
        }
      }
    }, [
      m(".modal-box", [
        m("h2", "New Pipe"),

        // ── Target project (read-only) ──
        m("label.modal-label", "Project"),
        m("div.modal-hint", { style: "margin-block-start: 0" }, projectName),

        // ── Pipe name input ──
        m("label.modal-label", "Pipe name"),
        m("input.modal-input", {
          type: "text",
          placeholder: "e.g. Fetch RSS Digest",
          value: PD.state.newPipeName,
          oninput: function(e) {
            PD.state.newPipeName = e.target.value;
          },
          // Enter submits the form
          onkeydown: function(e) {
            if (e.key === "Enter") {
              e.preventDefault();
              PD.actions.createNewPipe();
            }
          }
        }),

        // ── Action buttons ──
        m(".modal-actions", [
          m("button.tb-btn", {
            onclick: PD.actions.closeNewPipeModal
          }, "Cancel"),
          m("button.tb-btn.primary", {
            onclick: PD.actions.createNewPipe,
            disabled: PD.state.newPipeCreating || !PD.state.newPipeName.trim()
          }, PD.state.newPipeCreating ? "Creating..." : "Create")
        ])
      ])
    ]);
  }
};
