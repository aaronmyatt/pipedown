// Home MainContent component
PD.components.MainContent = {
  oncreate: function(vnode) {
    if (PD.state.markdownHtml && PD.state.pipeData) {
      var viewer = vnode.dom.querySelector(".md-viewer");
      if (viewer) PD.utils.injectStepToolbars(viewer);
    }
  },
  onupdate: function(vnode) {
    if (PD.state.markdownHtml && PD.state.pipeData && PD.state.viewMode === "markdown") {
      var viewer = vnode.dom.querySelector(".md-viewer");
      if (viewer) PD.utils.injectStepToolbars(viewer);
    }
  },
  view: function() {
    if (!PD.state.selectedPipe) {
      return m("div.detail", m("div.empty-state", [
        m("p", "Select a pipe to view")
      ]));
    }

    var viewTabs = null;
    if (PD.state.runOutput) {
      viewTabs = m(".view-tabs", [
        m("button.view-tab" + (PD.state.viewMode === "markdown" ? ".active" : ""), {
          onclick: function() { PD.state.viewMode = "markdown"; }
        }, "Source"),
        m("button.view-tab" + (PD.state.viewMode === "output" ? ".active" : ""), {
          onclick: function() { PD.state.viewMode = "output"; }
        }, "Output")
      ]);
    }

    var content;
    if (PD.state.viewMode === "output" && PD.state.runOutput) {
      if (PD.state.runOutputType === "html") {
        content = m("div.output-view", m("iframe", {
          sandbox: "allow-scripts allow-same-origin",
          allow: "fullscreen",
          srcdoc: PD.state.runOutput
        }));
      } else {
        content = m("div.output-view", m("pre", PD.state.runOutput));
      }
    } else {
      content = [
        m(PD.components.PipeToolbar),
        m(PD.components.MarkdownRenderer)
      ];
    }

    return m("div.detail", [
      viewTabs,
      content
    ]);
  }
};
