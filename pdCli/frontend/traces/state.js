// Traces page state and data-fetching
globalThis.PD = {
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
      const saved = localStorage.getItem("pd-traces-expanded");
      if (saved) return JSON.parse(saved);
    })(),
    selected: null,
    traceData: null,
    traceLoading: false,
    // ── Expanded steps ──
    // Tracks which trace steps are expanded in the detail view.
    // Restored from localStorage so the user's drill-down survives reloads.
    // Ref: https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage
    expandedSteps: (function() {
      const saved = localStorage.getItem("pd-traces-expandedSteps");
      if (saved) return JSON.parse(saved);
    })(),

    // ── Active detail tab ──
    // Which tab (steps/input/output/raw) is active in the trace detail pane.
    // Persisted so navigating away and back keeps the user's preferred view.
    detailTab: (function() {
      const saved = localStorage.getItem("pd-traces-detailTab");
      if (saved && ["steps","input","output","raw"].indexOf(saved) !== -1) return saved;
      return "steps";
    })()
  },
  actions: {},
  utils: {},
  components: {}
};

PD.utils.formatTimestamp = function(ts) {
  try {
    // TODO: this regex is a band-aid for an ISO formatting quirk in our backend;
    const iso = ts.replace(/(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d+)Z/, "$1:$2:$3.$4Z");
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return ts;
    return d.toLocaleString();
  } catch(_) { return ts; }
};

PD.utils.groupTraces = function(traces) {
  const grouped = {};
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
  })
};

PD.actions.selectTrace = function(entry) {
  PD.state.selected = entry;
  PD.state.traceData = null;
  PD.state.traceLoading = true;
  // Reset step expansions for the new trace and clear persisted state.
  // The detail tab is intentionally NOT reset — the user's preferred tab
  // (e.g. "raw") should carry over between traces.
  PD.state.expandedSteps = {};
  localStorage.removeItem("pd-traces-expandedSteps");

  m.request({ 
    method: "GET", 
    url: "/api/traces/:project/:pipe/:timestamp",
    params: {
      project: entry.project,
      pipe: entry.pipe,
      timestamp: entry.timestamp + ".json"
    }
  }).then(function(data) {
    PD.state.traceData = data;
    PD.state.traceLoading = false;
  }).catch(function() {
    PD.state.traceData = null;
    PD.state.traceLoading = false;
  });
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
  const current = PD.state.expanded[key];
  // absent or true → expand (false); false → collapse (true)
  PD.state.expanded[key] = current === false;
  // Persist the full map so every group the user has touched is remembered.
  localStorage.setItem("pd-traces-expanded",
    JSON.stringify(PD.state.expanded));
};

PD.utils.isSelected = function(entry) {
  return PD.state.selected &&
    PD.state.selected.project === entry.project &&
    PD.state.selected.pipe === entry.pipe &&
    PD.state.selected.timestamp === entry.timestamp;
};
