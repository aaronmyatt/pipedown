// Home page mount point
m.mount(document.getElementById("app"), {
  view: function() { return m(PD.components.Layout); }
});

// SSE hot reload
var eventSource = new EventSource("/sse");
eventSource.onmessage = function(event) {
  if (event.data === "reload") {
    PD.actions.loadRecentPipes();
    if (PD.state.selectedPipe) {
      PD.actions.selectPipe(PD.state.selectedPipe);
    }
  }
};
