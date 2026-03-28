import { std } from "../deps.ts";

interface TraceIndexEntry {
  project: string;
  pipe: string;
  timestamp: string;
  filePath: string;
}

export async function scanTraces(): Promise<TraceIndexEntry[]> {
  const home = Deno.env.get("HOME");
  if (!home) return [];

  const traceRoot = std.join(home, ".pipedown", "traces");
  if (!await std.exists(traceRoot)) return [];

  const entries: TraceIndexEntry[] = [];
  for await (const entry of std.walk(traceRoot, { exts: [".json"] })) {
    const rel = std.relative(traceRoot, entry.path);
    const parts = rel.split("/");
    if (parts.length >= 3) {
      entries.push({
        project: parts[0],
        pipe: parts.slice(1, -1).join("/"),
        timestamp: parts[parts.length - 1].replace(".json", ""),
        filePath: entry.path,
      });
    }
  }

  entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return entries;
}

export async function readTrace(filePath: string): Promise<unknown> {
  const content = await Deno.readTextFile(filePath);
  return JSON.parse(content);
}

export function tracePage(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Pipedown — Traces</title>
  <link rel="stylesheet" href="https://unpkg.com/open-props"/>
  <link rel="stylesheet" href="https://unpkg.com/open-props/normalize.min.css"/>
  <script src="https://unpkg.com/mithril/mithril.js"></script>
  <style>
    :root {
      --sidebar-width: 280px;
    }
    body {
      margin: 0;
      font-family: var(--font-sans);
      background: var(--surface-1);
      color: var(--text-1);
    }
    .layout {
      display: grid;
      grid-template-columns: var(--sidebar-width) 1fr;
      grid-template-rows: auto 1fr;
      min-height: 100vh;
    }
    .topbar {
      grid-column: 1 / -1;
      display: flex;
      align-items: center;
      gap: var(--size-3);
      padding: var(--size-2) var(--size-4);
      background: var(--surface-2);
      border-block-end: var(--border-size-1) solid var(--surface-3);
    }
    .topbar h1 {
      font-size: var(--font-size-3);
      margin: 0;
    }
    .topbar a {
      color: var(--link);
      text-decoration: none;
      font-size: var(--font-size-1);
    }
    .topbar a:hover { text-decoration: underline; }
    .sidebar {
      background: var(--surface-2);
      padding: var(--size-3);
      overflow-y: auto;
      border-inline-end: var(--border-size-1) solid var(--surface-3);
    }
    .sidebar h3 {
      font-size: var(--font-size-2);
      color: var(--text-2);
      margin: var(--size-3) 0 var(--size-1) 0;
      cursor: pointer;
      user-select: none;
    }
    .sidebar h3:hover { color: var(--text-1); }
    .sidebar h4 {
      font-size: var(--font-size-1);
      color: var(--text-2);
      margin: var(--size-2) 0 var(--size-1) var(--size-2);
      cursor: pointer;
      user-select: none;
    }
    .sidebar h4:hover { color: var(--text-1); }
    .trace-item {
      display: block;
      padding: var(--size-1) var(--size-2);
      margin-inline-start: var(--size-4);
      border-radius: var(--radius-2);
      cursor: pointer;
      font-size: var(--font-size-0);
      font-family: var(--font-mono);
      color: var(--text-2);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .trace-item:hover { background: var(--surface-3); color: var(--text-1); }
    .trace-item.active { background: var(--surface-4); color: var(--text-1); }
    .detail {
      padding: var(--size-4);
      overflow: auto;
      min-width: 0;
    }
    .detail-header {
      margin-block-end: var(--size-3);
    }
    .detail-header h2 {
      font-size: var(--font-size-3);
      margin: 0 0 var(--size-1) 0;
    }
    .detail-header .meta {
      font-size: var(--font-size-1);
      color: var(--text-2);
      display: flex;
      gap: var(--size-3);
      flex-wrap: wrap;
    }
    .detail-header .meta span {
      background: var(--surface-2);
      padding: var(--size-1) var(--size-2);
      border-radius: var(--radius-2);
    }
    .error-badge {
      background: var(--red-3);
      color: var(--red-9);
      padding: var(--size-1) var(--size-2);
      border-radius: var(--radius-2);
      font-size: var(--font-size-0);
      font-weight: var(--font-weight-6);
    }
    .step-list {
      list-style: none;
      padding: 0;
      margin: 0 0 var(--size-4) 0;
    }
    .step-item {
      display: grid;
      grid-template-columns: 2rem 1fr auto;
      gap: var(--size-2);
      align-items: center;
      padding: var(--size-2);
      border-radius: var(--radius-2);
      cursor: pointer;
      border-block-end: var(--border-size-1) solid var(--surface-2);
    }
    .step-item:hover { background: var(--surface-2); }
    .step-item.expanded { background: var(--surface-2); }
    .step-index {
      font-family: var(--font-mono);
      font-size: var(--font-size-0);
      color: var(--text-2);
      text-align: center;
    }
    .step-name { font-weight: var(--font-weight-5); }
    .step-duration {
      font-family: var(--font-mono);
      font-size: var(--font-size-0);
      color: var(--text-2);
    }
    .step-detail {
      grid-column: 1 / -1;
      padding: var(--size-2);
    }
    .delta-tags {
      display: flex;
      gap: var(--size-1);
      flex-wrap: wrap;
      margin-block-end: var(--size-2);
      font-size: var(--font-size-0);
    }
    .delta-tag {
      padding: 2px var(--size-1);
      border-radius: var(--radius-1);
      font-family: var(--font-mono);
    }
    .delta-added { background: var(--green-2); color: var(--green-9); }
    .delta-modified { background: var(--yellow-2); color: var(--yellow-9); }
    .delta-removed { background: var(--red-2); color: var(--red-9); }
    pre.json {
      font-family: var(--font-mono);
      font-size: var(--font-size-0);
      background: var(--surface-1);
      padding: var(--size-3);
      border-radius: var(--radius-2);
      overflow-x: auto;
      border: var(--border-size-1) solid var(--surface-3);
      white-space: pre-wrap;
      word-break: break-word;
    }
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--text-2);
      gap: var(--size-2);
    }
    .empty-state p { font-size: var(--font-size-2); }
    .tabs {
      display: flex;
      gap: var(--size-1);
      margin-block-end: var(--size-3);
    }
    .tab {
      padding: var(--size-1) var(--size-3);
      border-radius: var(--radius-2);
      cursor: pointer;
      font-size: var(--font-size-1);
      background: var(--surface-2);
      border: none;
      color: var(--text-2);
    }
    .tab:hover { background: var(--surface-3); }
    .tab.active { background: var(--surface-4); color: var(--text-1); }

    /* JSON tree viewer */
    .jt { font-family: var(--font-mono); font-size: var(--font-size-0); line-height: 1.6; max-width: 100%; }
    .jt-row {
      display: flex; align-items: baseline; gap: 0;
      border-radius: var(--radius-1); padding: 0 var(--size-1);
    }
    .jt-row.jt-clickable { cursor: pointer; user-select: none; }
    .jt-row.jt-clickable:hover { background: var(--surface-3); }
    .jt-toggle {
      width: 1.2em; flex-shrink: 0;
      color: var(--text-2); text-align: center;
    }
    .jt-key { color: var(--indigo-7); flex-shrink: 0; }
    .jt-colon { color: var(--text-2); margin: 0 0.3em; flex-shrink: 0; }
    .jt-string { color: var(--green-7); word-break: break-word; overflow-wrap: anywhere; white-space: pre-wrap; }
    .jt-number { color: var(--blue-7); }
    .jt-bool { color: var(--orange-7); }
    .jt-null { color: var(--text-2); font-style: italic; }
    .jt-preview { color: var(--text-2); font-style: italic; }
    .jt-bracket { color: var(--text-2); }
    .jt-children { padding-inline-start: 1.4em; }
  </style>
</head>
<body>
  <div id="app"></div>
  <script>
  (function() {
    var state = {
      traces: [],
      loading: true,
      expanded: {},      // { "project": true, "project/pipe": true }
      selected: null,    // { project, pipe, timestamp, filePath }
      traceData: null,
      traceLoading: false,
      expandedSteps: {}, // { stepIndex: true }
      detailTab: "steps" // "steps" | "input" | "output" | "raw"
    };

    // --- Collapsible JSON tree viewer ---
    var jtOpen = {}; // tracks open paths: { "root.key.subkey": true }
    function jtId(path, key) { return path ? path + "." + key : "" + key; }

    function jtPreview(val) {
      if (val === null) return "null";
      if (Array.isArray(val)) return "[" + val.length + " items]";
      if (typeof val === "object") {
        var keys = Object.keys(val);
        if (keys.length === 0) return "{}";
        if (keys.length <= 3) return "{ " + keys.join(", ") + " }";
        return "{ " + keys.slice(0, 3).join(", ") + ", +" + (keys.length - 3) + " }";
      }
      var s = JSON.stringify(val);
      return s.length > 60 ? s.slice(0, 57) + "..." : s;
    }

    function jtValue(val) {
      if (val === null) return m("span.jt-null", "null");
      if (typeof val === "string") return m("span.jt-string", '"' + val + '"');
      if (typeof val === "number") return m("span.jt-number", "" + val);
      if (typeof val === "boolean") return m("span.jt-bool", "" + val);
      return m("span.jt-string", "" + val);
    }

    function jtNode(key, val, path, defaultOpen) {
      var id = jtId(path, key);
      var isObj = val !== null && typeof val === "object";

      if (!isObj) {
        return m("div.jt-row", [
          m("span.jt-toggle", ""),
          key !== null ? [m("span.jt-key", "" + key), m("span.jt-colon", ":")] : null,
          jtValue(val)
        ]);
      }

      var isArr = Array.isArray(val);
      var entries = isArr ? val.map(function(v, i) { return [i, v]; }) : Object.entries(val);
      var open = jtOpen[id] !== undefined ? jtOpen[id] : !!defaultOpen;

      if (!open) {
        return m("div.jt-row.jt-clickable", { onclick: function() { jtOpen[id] = true; } }, [
          m("span.jt-toggle", "▸"),
          key !== null ? [m("span.jt-key", "" + key), m("span.jt-colon", ":")] : null,
          m("span.jt-preview",
            isArr ? "[" + val.length + " items]" : jtPreview(val))
        ]);
      }

      return m("div", [
        m("div.jt-row.jt-clickable", { onclick: function() { jtOpen[id] = false; } }, [
          m("span.jt-toggle", "▾"),
          key !== null ? [m("span.jt-key", "" + key), m("span.jt-colon", ":")] : null,
          m("span.jt-bracket", isArr ? "[" : "{")
        ]),
        m("div.jt-children", entries.map(function(pair) {
          return jtNode(pair[0], pair[1], id, false);
        })),
        m("div.jt-row", m("span.jt-bracket", isArr ? "]" : "}"))
      ]);
    }

    function jsonTree(data, rootPath) {
      if (data === null || typeof data !== "object") return jtValue(data);
      var isArr = Array.isArray(data);
      var entries = isArr ? data.map(function(v, i) { return [i, v]; }) : Object.entries(data);
      return m("div.jt", entries.map(function(pair) {
        return jtNode(pair[0], pair[1], rootPath || "root", false);
      }));
    }
    // --- end JSON tree viewer ---

    function formatTimestamp(ts) {
      // timestamps look like 2026-03-27T12-32-38-000Z
      try {
        var iso = ts.replace(/(\\d{4}-\\d{2}-\\d{2}T\\d{2})-(\\d{2})-(\\d{2})-(\\d+)Z/, "$1:$2:$3.$4Z");
        var d = new Date(iso);
        if (isNaN(d.getTime())) return ts;
        return d.toLocaleString();
      } catch(_) { return ts; }
    }

    function groupTraces(traces) {
      var grouped = {};
      traces.forEach(function(t) {
        if (!grouped[t.project]) grouped[t.project] = {};
        if (!grouped[t.project][t.pipe]) grouped[t.project][t.pipe] = [];
        grouped[t.project][t.pipe].push(t);
      });
      return grouped;
    }

    function loadTraces() {
      state.loading = true;
      m.request({ method: "GET", url: "/api/traces" }).then(function(data) {
        state.traces = data;
        state.loading = false;
      }).catch(function() {
        state.traces = [];
        state.loading = false;
      });
    }

    function selectTrace(entry) {
      state.selected = entry;
      state.traceData = null;
      state.traceLoading = true;
      state.expandedSteps = {};
      state.detailTab = "steps";
      var url = "/api/traces/" +
        encodeURIComponent(entry.project) + "/" +
        encodeURIComponent(entry.pipe) + "/" +
        encodeURIComponent(entry.timestamp + ".json");
      m.request({ method: "GET", url: url }).then(function(data) {
        state.traceData = data;
        state.traceLoading = false;
      }).catch(function() {
        state.traceData = null;
        state.traceLoading = false;
      });
    }

    function toggleExpand(key) {
      state.expanded[key] = !state.expanded[key];
    }

    function isSelected(entry) {
      return state.selected &&
        state.selected.project === entry.project &&
        state.selected.pipe === entry.pipe &&
        state.selected.timestamp === entry.timestamp;
    }

    var Sidebar = {
      oninit: function() { loadTraces(); },
      view: function() {
        if (state.loading) {
          return m("div.sidebar", m("p", { style: "color: var(--text-2)" }, "Loading traces..."));
        }
        if (state.traces.length === 0) {
          return m("div.sidebar", [
            m("p", { style: "color: var(--text-2); font-size: var(--font-size-1)" },
              "No traces found."),
            m("p", { style: "color: var(--text-2); font-size: var(--font-size-0)" },
              "Run a pipe with tracing enabled to see traces here.")
          ]);
        }
        var grouped = groupTraces(state.traces);
        var nodes = [];
        Object.keys(grouped).sort().forEach(function(project) {
          var projKey = project;
          var isOpen = state.expanded[projKey] !== false; // default open
          nodes.push(
            m("h3", { onclick: function() { toggleExpand(projKey); } },
              (isOpen ? "▾ " : "▸ ") + project)
          );
          if (isOpen) {
            Object.keys(grouped[project]).sort().forEach(function(pipe) {
              var pipeKey = project + "/" + pipe;
              var pipeOpen = state.expanded[pipeKey] !== false;
              nodes.push(
                m("h4", { onclick: function() { toggleExpand(pipeKey); } },
                  (pipeOpen ? "▾ " : "▸ ") + pipe)
              );
              if (pipeOpen) {
                grouped[project][pipe].forEach(function(entry) {
                  nodes.push(
                    m("div.trace-item" + (isSelected(entry) ? ".active" : ""), {
                      onclick: function() { selectTrace(entry); }
                    }, formatTimestamp(entry.timestamp))
                  );
                });
              }
            });
          }
        });
        return m("div.sidebar", nodes);
      }
    };

    function renderDeltaTags(delta) {
      var tags = [];
      if (delta.added && delta.added.length) {
        delta.added.forEach(function(k) {
          tags.push(m("span.delta-tag.delta-added", "+" + k));
        });
      }
      if (delta.modified && delta.modified.length) {
        delta.modified.forEach(function(k) {
          tags.push(m("span.delta-tag.delta-modified", "~" + k));
        });
      }
      if (delta.removed && delta.removed.length) {
        delta.removed.forEach(function(k) {
          tags.push(m("span.delta-tag.delta-removed", "-" + k));
        });
      }
      return tags;
    }

    function renderSteps(trace) {
      return m("ul.step-list", trace.steps.map(function(step) {
        var isExp = state.expandedSteps[step.index];
        var items = [
          m("div.step-item" + (isExp ? ".expanded" : ""), {
            onclick: function() {
              state.expandedSteps[step.index] = !state.expandedSteps[step.index];
            }
          }, [
            m("span.step-index", step.index),
            m("span.step-name", step.name || "(anonymous)"),
            m("span.step-duration", step.durationMs + "ms")
          ])
        ];
        if (isExp) {
          items.push(m("div.step-detail", [
            m("div.delta-tags", renderDeltaTags(step.delta)),
            m("details", { open: true }, [
              m("summary", "After"),
              jsonTree(step.after, "s" + step.index + "-after")
            ]),
            m("details", [
              m("summary", "Before"),
              jsonTree(step.before, "s" + step.index + "-before")
            ])
          ]));
        }
        return m("li", items);
      }));
    }

    var Detail = {
      view: function() {
        if (!state.selected) {
          return m("div.detail", m("div.empty-state", [
            m("p", "Select a trace from the sidebar")
          ]));
        }
        if (state.traceLoading) {
          return m("div.detail", m("p", "Loading trace..."));
        }
        if (!state.traceData) {
          return m("div.detail", m("p", "Failed to load trace."));
        }
        var t = state.traceData;
        var hasErrors = t.errors && t.errors.length > 0;
        return m("div.detail", [
          m("div.detail-header", [
            m("h2", [
              t.pipeName,
              hasErrors ? m("span.error-badge", { style: "margin-inline-start: var(--size-2)" }, t.errors.length + " error(s)") : null
            ]),
            m("div.meta", [
              m("span", "Project: " + t.project),
              m("span", t.stepsTotal + " steps"),
              m("span", t.durationMs + "ms total"),
              m("span", new Date(t.timestamp).toLocaleString())
            ])
          ]),
          m("div.tabs", [
            ["steps", "Steps", "input", "Input", "output", "Output", "raw", "Raw JSON"].reduce(function(acc, val, i, arr) {
              if (i % 2 === 0) {
                var key = arr[i];
                var label = arr[i + 1];
                acc.push(m("button.tab" + (state.detailTab === key ? ".active" : ""), {
                  onclick: function() { state.detailTab = key; }
                }, label));
              }
              return acc;
            }, [])
          ]),
          state.detailTab === "steps" ? renderSteps(t) : null,
          state.detailTab === "input" ? jsonTree(t.input, "tab-input") : null,
          state.detailTab === "output" ? jsonTree(t.output, "tab-output") : null,
          state.detailTab === "raw" ? jsonTree(t, "tab-raw") : null
        ]);
      }
    };

    var Layout = {
      view: function() {
        return m("div.layout", [
          m("div.topbar", [
            m("h1", "Pipedown Traces"),
            m("a", { href: "/" }, "Services"),
            m("a", { href: "/projects" }, "Projects")
          ]),
          m(Sidebar),
          m(Detail)
        ]);
      }
    };

    m.mount(document.getElementById("app"), Layout);
  })();
  </script>
</body>
</html>`;
}
