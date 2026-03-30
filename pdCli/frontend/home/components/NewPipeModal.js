// ── New Pipe Modal Component ──
// A simple overlay dialog for creating a new pipe markdown file from the
// dashboard. The user enters a pipe name, picks a target project, and clicks
// "Create". The action sanitises the name, generates a template .md file,
// POSTs it to the server, and auto-selects the new pipe in edit mode.
//
// Keyboard shortcuts:
//   - Enter  → submit (create pipe)
//   - Escape → close modal
//
// Ref: PD.actions.createNewPipe in state.js for the creation flow
// Ref: PD.actions.openNewPipeModal / closeNewPipeModal for state management
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

    // Auto-focus the name input for immediate typing.
    var input = vnode.dom.querySelector("input");
    if (input) input.focus();
  },

  // ── Lifecycle: clean up ──
  onremove: function(vnode) {
    if (vnode.state._keyHandler) {
      document.removeEventListener("keydown", vnode.state._keyHandler);
    }
  },

  view: function() {
    // Only render when the modal is open. Returning null removes the
    // component from the DOM entirely (and triggers onremove/oncreate
    // on the next open).
    if (!PD.state.showNewPipeModal) return null;

    // Build the list of unique project names by merging allProjects
    // (which includes empty/newly-created projects) with recentPipes
    // (which captures any project names that may not be in allProjects yet).
    // This ensures newly created projects appear in the dropdown even
    // before they have any pipes.
    // Ref: PD.actions.loadAllProjects in state.js
    var seen = {};
    // Primary source: allProjects (from GET /api/projects)
    PD.state.allProjects.forEach(function(p) { seen[p.name] = true; });
    // Fallback: recentPipes — covers edge cases where allProjects hasn't loaded
    PD.state.recentPipes.forEach(function(p) { seen[p.projectName] = true; });
    var projectNames = Object.keys(seen).sort();

    return m(".modal-overlay", {
      // Clicking the backdrop (outside the modal box) closes the modal.
      onclick: function(e) {
        if (e.target === e.currentTarget) {
          PD.actions.closeNewPipeModal();
        }
      }
    }, [
      m(".modal-box", [
        m("h2", "New Pipe"),

        // ── Pipe name input ──
        m("label.modal-label", "Pipe name"),
        m("input.modal-input", {
          type: "text",
          placeholder: "e.g. Fetch RSS Digest",
          value: PD.state.newPipeName,
          oninput: function(e) {
            PD.state.newPipeName = e.target.value;
          },
          // Enter submits the form — standard modal UX.
          onkeydown: function(e) {
            if (e.key === "Enter") {
              e.preventDefault();
              PD.actions.createNewPipe();
            }
          }
        }),

        // ── Project selector ──
        // Lets the user choose which project directory receives the new file.
        // Only shown when there are multiple projects; otherwise the sole
        // project is preselected and no dropdown is needed.
        projectNames.length > 1
          ? [
              m("label.modal-label", "Project"),
              m("select.modal-input", {
                value: PD.state.newPipeProject || "",
                onchange: function(e) {
                  PD.state.newPipeProject = e.target.value;
                }
              }, projectNames.map(function(name) {
                return m("option", { value: name }, name);
              }))
            ]
          : null,

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
