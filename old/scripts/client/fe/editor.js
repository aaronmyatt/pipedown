import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import "monaco-editor/min/vs/editor/editor.main.css";

export default function setupEditor(Alpine) {
  Alpine.data("editor", () => ({
    initEditor(el, opts = { language: "javascript" }) {
      if (window.editor) return;
      window.editor = this.newEditor(el, opts);

      const logit = Alpine.debounce(
        (context, args) => console.log(window.editor.getValue()),
        1000,
      );
      window.editor.getModel().onDidChangeContent((e) => {
        logit(e);
      });
    },
    newEditor(el, opts) {
      opts.formatOnPaste = true;
      opts.formatOnType = true;
      opts.lineNumbers = "on";
      return monaco.editor.create(el, opts);
    },
  }));

  Alpine.store("editor", {
    isOpen: false,
    currentlyEditing: null,
    close() {
      document.querySelector('[x-ref="editorDialog"]').close();
      this.isOpen = false;
    },
    open(opts) {
      document.querySelector('[x-ref="editorDialog"]').showModal();
      this.isOpen = true;
    },
    load(content) {
      const interval = setInterval(() => {
        if (!content) {
          clearInterval(interval);
        } else if (window.editor) {
          window.editor.setValue(content);
          clearInterval(interval);
        }
      });
    },
  });
}
