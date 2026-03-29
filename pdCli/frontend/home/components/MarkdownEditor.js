// ── Markdown Editor Component ──
// Provides an in-browser textarea for editing raw pipe markdown. Displayed
// when PD.state.editMode is true, replacing the rendered MarkdownRenderer.
//
// Keyboard shortcuts:
//   - Cmd/Ctrl+S → save edits (prevents browser's native save dialog)
//   - Escape     → exit edit mode (discard unsaved changes)
//   - Tab        → insert 2 spaces (overrides default focus-shift)
//
// The textarea value is bound to PD.state.editBuffer — changes only persist
// to disk when the user explicitly saves via the PipeToolbar "Save" button
// or the Cmd+S shortcut.
// Ref: PD.actions.saveEdit in state.js for the save flow
PD.components.MarkdownEditor = {
  // ── Lifecycle: register keyboard shortcut handler ──
  // We attach to the textarea's own keydown so shortcuts only fire while
  // the editor is focused. Follows the same pattern RunDrawer.js uses for
  // its Escape handler.
  // Ref: https://mithril.js.org/lifecycle-methods.html#oncreate
  oncreate: function(vnode) {
    var textarea = vnode.dom.querySelector("textarea");
    if (!textarea) return;

    vnode.state._keyHandler = function(e) {
      // ── Cmd/Ctrl+S — save ──
      // Ref: https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/metaKey
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        PD.actions.saveEdit();
        return;
      }

      // ── Escape — exit edit mode ──
      if (e.key === "Escape") {
        e.preventDefault();
        PD.actions.exitEditMode();
        m.redraw();
        return;
      }

      // ── Tab — insert 2 spaces instead of shifting focus ──
      // This is a standard UX improvement for code-oriented textareas.
      // Ref: https://developer.mozilla.org/en-US/docs/Web/API/HTMLTextAreaElement/setSelectionRange
      if (e.key === "Tab") {
        e.preventDefault();
        var start = textarea.selectionStart;
        var end = textarea.selectionEnd;
        var val = textarea.value;
        // Insert two spaces at the caret position.
        textarea.value = val.substring(0, start) + "  " + val.substring(end);
        // Move the caret past the inserted spaces.
        textarea.selectionStart = textarea.selectionEnd = start + 2;
        // Sync the buffer with the new value.
        PD.state.editBuffer = textarea.value;
        PD.state.editDirty = true;
        m.redraw();
      }
    };

    textarea.addEventListener("keydown", vnode.state._keyHandler);

    // Auto-focus the textarea so the user can start typing immediately.
    textarea.focus();
  },

  // ── Lifecycle: clean up the keydown listener ──
  // Ref: https://mithril.js.org/lifecycle-methods.html#onremove
  onremove: function(vnode) {
    var textarea = vnode.dom.querySelector("textarea");
    if (textarea && vnode.state._keyHandler) {
      textarea.removeEventListener("keydown", vnode.state._keyHandler);
    }
  },

  view: function() {
    return m("div.md-editor-wrapper", [
      // ── Dirty indicator ──
      // Shows a subtle hint when the buffer has unsaved changes, so the user
      // knows at a glance whether they need to save.
      PD.state.editDirty
        ? m("div.md-editor-status", "Unsaved changes — Cmd+S to save")
        : m("div.md-editor-status", "Editing — Cmd+S to save, Escape to cancel"),

      // ── Textarea ──
      // The textarea is the core editing surface. Its value is bound to
      // PD.state.editBuffer via oninput, and editDirty is set on any change.
      m("textarea.md-editor", {
        value: PD.state.editBuffer || "",
        oninput: function(e) {
          PD.state.editBuffer = e.target.value;
          PD.state.editDirty = true;
        },
        // spellcheck off for code/markdown editing — reduces visual noise.
        spellcheck: false,
        // Disable autocomplete/autocorrect for the same reason.
        autocomplete: "off",
        autocorrect: "off",
        autocapitalize: "off",
        placeholder: "Write your pipe markdown here..."
      })
    ]);
  }
};
