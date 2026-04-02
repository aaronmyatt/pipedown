// Traces page state and data-fetching
window.PD = {
  state: {
    // ── Sidebar visibility ──
    // Toggled by the hamburger button in the topbar.
    sidebarOpen: true,

    traces: [],
    loading: true,

    // ── Sidebar collapsible groups ──
    // Tracks which project/pipe headings in the sidebar are expanded.
    // Keys are project names or "project/pipe" paths; value `false` = expanded,
    // `true` or absent = collapsed. Persisted to localStorage so the user's
    // preferred expand/collapse state survives page reloads.
    // Ref: https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage
    expanded: (function() {
      try {
        var saved = localStorage.getItem("pd-traces-expanded");
        if (saved) return JSON.parse(saved);
      } catch(e) { /* ignore — localStorage unavailable or corrupted JSON */ }
      return {};  // first visit — no preferences yet; Sidebar treats absent keys as collapsed
    })(),
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

// ── toggleExpand ──
// Toggles the collapsed/expanded state of a project or pipe group in the
// traces sidebar. Persists to localStorage so the preference survives
// page reloads.
//
// Semantics: absent key or `true` = collapsed; `false` = expanded.
// This makes "collapsed" the default for groups the user hasn't
// interacted with yet.
//
// @param {string} key — project name or "project/pipe" path to toggle
// Ref: Sidebar.js — group header onclick
// Ref: https://developer.mozilla.org/en-US/docs/Web/API/Storage/setItem
PD.actions.toggleExpand = function(key) {
  var current = PD.state.expanded[key];
  // absent or true → expand (false); false → collapse (true)
  PD.state.expanded[key] = current === false ? true : false;
  // Persist the full map so every group the user has touched is remembered.
  // Uses the same try-catch pattern as the theme manager (shared/theme.js).
  try {
    localStorage.setItem("pd-traces-expanded",
      JSON.stringify(PD.state.expanded));
  } catch(e) { /* ignore — localStorage full or unavailable */ }
};

PD.utils.isSelected = function(entry) {
  return PD.state.selected &&
    PD.state.selected.project === entry.project &&
    PD.state.selected.pipe === entry.pipe &&
    PD.state.selected.timestamp === entry.timestamp;
};
