// Traces page state and data-fetching
window.PD = {
  state: {
    // ── Sidebar visibility ──
    // Toggled by the hamburger button in the topbar.
    sidebarOpen: true,

    traces: [],
    loading: true,
    expanded: {},
    selected: null,
    traceData: null,
    traceLoading: false,
    expandedSteps: {},
    detailTab: "steps"
  },
  actions: {},
  utils: {},
  components: {}
};

PD.utils.formatTimestamp = function(ts) {
  try {
    var iso = ts.replace(/(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d+)Z/, "$1:$2:$3.$4Z");
    var d = new Date(iso);
    if (isNaN(d.getTime())) return ts;
    return d.toLocaleString();
  } catch(_) { return ts; }
};

PD.utils.groupTraces = function(traces) {
  var grouped = {};
  traces.forEach(function(t) {
    if (!grouped[t.project]) grouped[t.project] = {};
    if (!grouped[t.project][t.pipe]) grouped[t.project][t.pipe] = [];
    grouped[t.project][t.pipe].push(t);
  });
  return grouped;
};

PD.actions.loadTraces = function() {
  PD.state.loading = true;
  m.request({ method: "GET", url: "/api/traces" }).then(function(data) {
    PD.state.traces = data;
    PD.state.loading = false;
  }).catch(function() {
    PD.state.traces = [];
    PD.state.loading = false;
  }).then(function() { m.redraw.sync(); });
};

PD.actions.selectTrace = function(entry) {
  PD.state.selected = entry;
  PD.state.traceData = null;
  PD.state.traceLoading = true;
  PD.state.expandedSteps = {};
  PD.state.detailTab = "steps";
  var url = "/api/traces/" +
    encodeURIComponent(entry.project) + "/" +
    encodeURIComponent(entry.pipe) + "/" +
    encodeURIComponent(entry.timestamp + ".json");
  m.request({ method: "GET", url: url }).then(function(data) {
    PD.state.traceData = data;
    PD.state.traceLoading = false;
  }).catch(function() {
    PD.state.traceData = null;
    PD.state.traceLoading = false;
  }).then(function() { m.redraw.sync(); });
};

PD.actions.toggleExpand = function(key) {
  PD.state.expanded[key] = !PD.state.expanded[key];
};

PD.utils.isSelected = function(entry) {
  return PD.state.selected &&
    PD.state.selected.project === entry.project &&
    PD.state.selected.pipe === entry.pipe &&
    PD.state.selected.timestamp === entry.timestamp;
};
