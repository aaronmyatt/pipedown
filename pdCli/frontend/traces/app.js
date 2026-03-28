// Traces page mount point
m.mount(document.getElementById("app"), {
  view: function() { return m(PD.components.Layout); }
});
