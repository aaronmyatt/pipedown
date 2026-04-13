// ── New Project Modal Component ──
// Overlay dialog for creating a new project directory from the dashboard.
// The user enters a project name and clicks "Create". The action sanitises
// the name, POSTs to /api/projects, and auto-focuses the new project.
//
// Displays the resolved target directory (from ~/.pipedown/config.json
// newProjectDir) so the user knows where the project will be created.
//
// Keyboard shortcuts:
//   - Enter  → submit (create project)
//   - Escape → close modal
//
// Ref: PD.actions.createNewProject in state.js for the creation flow
// Ref: POST /api/projects in buildandserve.ts for the backend handler
PD.components.NewProjectModal = {
  // ── Lifecycle: register Escape handler and focus the name input ──
  // Ref: https://mithril.js.org/lifecycle-methods.html#oncreate
  oncreate: function (vnode) {
    vnode.state._keyHandler = function (e) {
      if (e.key === "Escape") {
        e.preventDefault();
        PD.actions.closeNewProjectModal();
        m.redraw();
      }
    };
    document.addEventListener("keydown", vnode.state._keyHandler);

    // Auto-focus the name input for immediate typing
    const input = vnode.dom.querySelector("input");
    if (input) input.focus();
  },

  // ── Lifecycle: clean up keydown listener ──
  onremove: function (vnode) {
    if (vnode.state._keyHandler) {
      document.removeEventListener("keydown", vnode.state._keyHandler);
    }
  },

  view: function () {
    // Only render when the modal is open. Returning null removes the
    // component from the DOM entirely (triggers onremove/oncreate cycle).
    if (!PD.state.showNewProjectModal) return null;

    // Resolve the display path for the new project directory.
    // Falls back to "$HOME/pipes" when config hasn't loaded yet.
    // Ref: resolveNewProjectDir in projectsDashboard.ts for the server-side equivalent
    const config = PD.state.globalConfig || {};
    const baseDir = config.newProjectDir || "$HOME/pipes";

    // Build a live preview of the sanitised directory name so the user
    // can see exactly what path will be created on disk.
    const safeName = PD.state.newProjectName.trim()
      ? PD.utils.sanitiseName(PD.state.newProjectName)
      : "";
    const previewPath = safeName
      ? baseDir + "/" + safeName + "/"
      : baseDir + "/";

    return m(".modal-overlay", {
      // Clicking the backdrop (outside the modal box) closes the modal
      onclick: function (e) {
        if (e.target === e.currentTarget) {
          PD.actions.closeNewProjectModal();
        }
      },
    }, [
      m(".modal-box", [
        m("h2", "New Project"),

        // ── Project name input ──
        m("label.modal-label", "Project name"),
        m("input.modal-input", {
          type: "text",
          placeholder: "e.g. My Data Pipeline",
          value: PD.state.newProjectName,
          oninput: function (e) {
            PD.state.newProjectName = e.target.value;
          },
          // Enter submits the form — standard modal UX
          onkeydown: function (e) {
            if (e.key === "Enter") {
              e.preventDefault();
              PD.actions.createNewProject();
            }
          },
        }),

        // ── Path preview ──
        // Shows where the project directory will be created, using the
        // sanitised name and the configured newProjectDir base path.
        m("div.modal-hint", previewPath),

        // ── Action buttons ──
        m(".modal-actions", [
          m("button.tb-btn", {
            onclick: PD.actions.closeNewProjectModal,
          }, "Cancel"),
          m("button.tb-btn.primary", {
            onclick: PD.actions.createNewProject,
            disabled: PD.state.newProjectCreating ||
              !PD.state.newProjectName.trim(),
          }, PD.state.newProjectCreating ? "Creating..." : "Create"),
        ]),
      ]),
    ]);
  },
};
