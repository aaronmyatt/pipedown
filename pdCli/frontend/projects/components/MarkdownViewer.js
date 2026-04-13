// Projects MarkdownViewer component
PD.components.MarkdownViewer = {
  view: function () {
    if (PD.state.markdownLoading) {
      return m("div.detail", m("p", "Loading markdown..."));
    }
    if (!PD.state.markdownHtml) {
      return m("div.detail", m("p", "Failed to load file."));
    }
    return m("div.detail", m("div.md-viewer", m.trust(PD.state.markdownHtml)));
  },
};
