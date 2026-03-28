// Projects page mount point
// Wrap Layout so lifecycle hooks (oncreate) fire correctly
m.mount(document.getElementById("app"), {
  view: function() { return m(PD.components.Layout); }
});
