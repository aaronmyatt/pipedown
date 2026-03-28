import { std } from "../deps.ts";
import { readProjectsRegistry, scanProjectPipes } from "./projectsDashboard.ts";
import { scanTraces, readTrace } from "./traceDashboard.ts";

export interface RecentPipe {
  projectName: string;
  projectPath: string;
  pipeName: string;
  pipePath: string;
  mtime: string | null;
}

export async function scanRecentPipes(): Promise<RecentPipe[]> {
  const projects = await readProjectsRegistry();
  const allPipes: RecentPipe[] = [];

  for (const project of projects) {
    try {
      await Deno.stat(project.path);
    } catch {
      continue;
    }

    const pipes = await scanProjectPipes(project.path);
    for (const pipe of pipes) {
      allPipes.push({
        projectName: project.name,
        projectPath: project.path,
        pipeName: pipe.name,
        pipePath: pipe.path,
        mtime: pipe.mtime,
      });
    }
  }

  allPipes.sort((a, b) => (b.mtime || "").localeCompare(a.mtime || ""));
  return allPipes;
}

export async function readPipeIndex(projectPath: string, pipeName: string): Promise<unknown> {
  const indexPath = std.join(projectPath, ".pd", pipeName, "index.json");
  try {
    const raw = await Deno.readTextFile(indexPath);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function recentStepTraces(
  projectName: string,
  pipeName: string,
  stepIndex: number,
  limit = 5,
): Promise<unknown[]> {
  const traces = await scanTraces();
  const matching = traces.filter(
    (t) => t.project === projectName && t.pipe === pipeName,
  ).slice(0, limit);

  const results: unknown[] = [];
  for (const entry of matching) {
    try {
      const trace = (await readTrace(entry.filePath)) as {
        steps?: { index: number; before: unknown; after: unknown; delta: unknown; durationMs: number }[];
      };
      if (trace.steps) {
        const step = trace.steps.find((s) => s.index === stepIndex);
        if (step) {
          results.push({ timestamp: entry.timestamp, step });
        }
      }
    } catch { /* skip unreadable traces */ }
  }
  return results;
}

export function homePage(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Pipedown</title>
  <link rel="stylesheet" href="https://unpkg.com/open-props"/>
  <link rel="stylesheet" href="https://unpkg.com/open-props/normalize.min.css"/>
  <script src="https://unpkg.com/mithril/mithril.js"></script>
  <script src="https://unpkg.com/markdown-it/dist/markdown-it.min.js"></script>
  <link rel="stylesheet" href="https://unpkg.com/@highlightjs/cdn-assets@11.9.0/styles/github.min.css"/>
  <script src="https://unpkg.com/@highlightjs/cdn-assets@11.9.0/highlight.min.js"></script>
  <style>
    body {
      margin: 0;
      font-family: var(--font-sans);
      background: var(--surface-1);
      color: var(--text-1);
    }
    .layout {
      display: grid;
      grid-template-columns: 300px 1fr;
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
    .topbar h1 { font-size: var(--font-size-3); margin: 0; }
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
    .search-input {
      width: 100%;
      padding: var(--size-2);
      border-radius: var(--radius-2);
      border: var(--border-size-1) solid var(--surface-4);
      background: var(--surface-1);
      color: var(--text-1);
      font-size: var(--font-size-1);
      font-family: var(--font-sans);
      margin-block-end: var(--size-3);
      box-sizing: border-box;
    }
    .search-input::placeholder { color: var(--text-2); }
    .pipe-card {
      padding: var(--size-2);
      border-radius: var(--radius-2);
      margin-block-end: var(--size-1);
      cursor: pointer;
      display: flex;
      flex-direction: column;
      gap: var(--size-1);
    }
    .pipe-card:hover { background: var(--surface-3); }
    .pipe-card.active { background: var(--surface-4); }
    .pipe-card-name {
      font-family: var(--font-mono);
      font-size: var(--font-size-1);
      font-weight: var(--font-weight-6);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .pipe-card-meta {
      display: flex;
      gap: var(--size-2);
      font-size: var(--font-size-0);
      color: var(--text-2);
    }
    .badge {
      padding: 1px var(--size-1);
      border-radius: var(--radius-1);
      background: var(--surface-3);
      font-size: var(--font-size-00);
      font-family: var(--font-mono);
    }
    .badge-project {
      background: var(--indigo-2);
      color: var(--indigo-9);
    }
    .detail {
      padding: var(--size-4);
      overflow: auto;
      min-width: 0;
      position: relative;
    }

    /* View mode tabs */
    .view-tabs {
      display: flex;
      gap: var(--size-1);
      margin-block-end: var(--size-3);
    }
    .view-tab {
      padding: var(--size-1) var(--size-3);
      border-radius: var(--radius-2);
      cursor: pointer;
      font-size: var(--font-size-1);
      background: var(--surface-2);
      border: none;
      color: var(--text-2);
    }
    .view-tab:hover { background: var(--surface-3); }
    .view-tab.active { background: var(--surface-4); color: var(--text-1); }

    /* Markdown viewer */
    .md-viewer {
      max-width: 80ch;
      line-height: 1.7;
      font-size: var(--font-size-1);
      position: relative;
    }
    .md-viewer h1 { font-size: var(--font-size-5); margin: var(--size-4) 0 var(--size-2) 0; }
    .md-viewer h2 { font-size: var(--font-size-4); margin: var(--size-4) 0 var(--size-2) 0; border-block-end: var(--border-size-1) solid var(--surface-3); padding-block-end: var(--size-2); }
    .md-viewer h3 { font-size: var(--font-size-3); margin: var(--size-3) 0 var(--size-2) 0; }
    .md-viewer p { margin: var(--size-2) 0; }
    .md-viewer pre {
      background: var(--surface-2);
      padding: var(--size-3);
      border-radius: var(--radius-2);
      overflow-x: auto;
      border: var(--border-size-1) solid var(--surface-3);
    }
    .md-viewer code {
      font-family: var(--font-mono);
      font-size: var(--font-size-0);
    }
    .md-viewer :not(pre) > code {
      background: var(--surface-2);
      padding: 2px var(--size-1);
      border-radius: var(--radius-1);
    }
    .md-viewer ul, .md-viewer ol { padding-inline-start: var(--size-5); }
    .md-viewer li { margin-block-end: var(--size-1); }
    .md-viewer blockquote {
      border-inline-start: 3px solid var(--surface-4);
      margin: var(--size-2) 0;
      padding: var(--size-1) var(--size-3);
      color: var(--text-2);
    }
    .md-viewer table { border-collapse: collapse; width: 100%; margin: var(--size-3) 0; }
    .md-viewer th, .md-viewer td {
      border: var(--border-size-1) solid var(--surface-3);
      padding: var(--size-1) var(--size-2);
      text-align: left;
    }
    .md-viewer th { background: var(--surface-2); font-weight: var(--font-weight-6); }
    .md-viewer a { color: var(--link); }

    /* Heading wrappers for toolbar positioning */
    .heading-wrapper {
      position: relative;
    }
    .heading-wrapper:hover .toolbar-overlay {
      opacity: 1;
      pointer-events: all;
    }

    /* Toolbar overlays */
    .toolbar-overlay {
      position: absolute;
      top: 50%;
      right: 0;
      transform: translateY(-50%);
      display: flex;
      gap: var(--size-1);
      background: color-mix(in srgb, var(--surface-2) 90%, transparent);
      backdrop-filter: blur(4px);
      padding: var(--size-1) var(--size-2);
      border-radius: var(--radius-2);
      opacity: 0;
      transition: opacity 0.15s;
      pointer-events: none;
      z-index: 10;
      box-shadow: var(--shadow-2);
    }
    .toolbar-overlay:hover {
      opacity: 1;
      pointer-events: all;
    }
    .tb-btn {
      padding: var(--size-1) var(--size-2);
      border-radius: var(--radius-2);
      border: var(--border-size-1) solid var(--surface-4);
      background: var(--surface-1);
      color: var(--text-1);
      cursor: pointer;
      font-size: var(--font-size-00);
      font-family: var(--font-sans);
      white-space: nowrap;
    }
    .tb-btn:hover { background: var(--surface-3); }
    .tb-btn.primary {
      background: var(--indigo-3);
      color: var(--indigo-9);
      border-color: var(--indigo-4);
    }
    .tb-btn.primary:hover { background: var(--indigo-4); }

    /* Dropdown */
    .dropdown-wrapper { position: relative; display: inline-block; }
    .dropdown-menu {
      position: absolute;
      top: 100%;
      right: 0;
      margin-top: var(--size-1);
      background: var(--surface-2);
      border: var(--border-size-1) solid var(--surface-3);
      border-radius: var(--radius-2);
      box-shadow: var(--shadow-3);
      z-index: 20;
      min-width: 140px;
    }
    .dropdown-item {
      display: block;
      width: 100%;
      padding: var(--size-1) var(--size-2);
      border: none;
      background: none;
      color: var(--text-1);
      font-size: var(--font-size-0);
      font-family: var(--font-sans);
      cursor: pointer;
      text-align: left;
    }
    .dropdown-item:hover { background: var(--surface-3); }

    /* DSL directive display */
    .dsl-block {
      background: var(--surface-2);
      border: var(--border-size-1) solid var(--surface-3);
      border-radius: var(--radius-2);
      padding: var(--size-2) var(--size-3);
      margin: var(--size-1) 0 var(--size-2) 0;
      font-family: var(--font-mono);
      font-size: var(--font-size-0);
      color: var(--text-2);
    }
    .dsl-block .dsl-line { margin: var(--size-1) 0; }
    .dsl-key { color: var(--indigo-7); }
    .dsl-val { color: var(--green-7); }

    /* Output view */
    .output-view pre {
      font-family: var(--font-mono);
      font-size: var(--font-size-1);
      background: var(--surface-2);
      padding: var(--size-3);
      border-radius: var(--radius-2);
      overflow-x: auto;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .output-view iframe {
      width: 100%;
      height: calc(100vh - 140px);
      border: none;
      border-radius: var(--radius-2);
    }

    /* Operation panel */
    .op-panel {
      position: fixed;
      bottom: 0;
      right: 0;
      width: calc(100% - 300px);
      max-height: 300px;
      background: var(--surface-2);
      border-block-start: var(--border-size-2) solid var(--surface-4);
      overflow-y: auto;
      z-index: 30;
      display: flex;
      flex-direction: column;
    }
    .op-panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--size-1) var(--size-3);
      background: var(--surface-3);
      position: sticky;
      top: 0;
    }
    .op-panel-header span {
      font-size: var(--font-size-0);
      font-weight: var(--font-weight-6);
    }
    .op-panel-close {
      background: none;
      border: none;
      color: var(--text-2);
      cursor: pointer;
      font-size: var(--font-size-2);
      padding: 0 var(--size-1);
    }
    .op-panel-close:hover { color: var(--text-1); }
    .op-panel-body {
      padding: var(--size-2) var(--size-3);
      font-family: var(--font-mono);
      font-size: var(--font-size-0);
      white-space: pre-wrap;
      word-break: break-word;
      flex: 1;
    }
    .op-panel-body .spinner { color: var(--text-2); }

    /* Step traces popover */
    .step-traces {
      background: var(--surface-2);
      border: var(--border-size-1) solid var(--surface-3);
      border-radius: var(--radius-2);
      padding: var(--size-2) var(--size-3);
      margin: var(--size-1) 0 var(--size-2) 0;
      max-height: 400px;
      overflow-y: auto;
    }
    .step-traces summary {
      cursor: pointer;
      font-size: var(--font-size-0);
      color: var(--text-2);
      font-weight: var(--font-weight-5);
      margin-block-end: var(--size-1);
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

    /* JSON tree viewer */
    .jt { font-family: var(--font-mono); font-size: var(--font-size-0); line-height: 1.6; max-width: 100%; }
    .jt-row {
      display: flex; align-items: baseline; gap: 0;
      border-radius: var(--radius-1); padding: 0 var(--size-1);
    }
    .jt-row.jt-clickable { cursor: pointer; user-select: none; }
    .jt-row.jt-clickable:hover { background: var(--surface-3); }
    .jt-toggle { width: 1.2em; flex-shrink: 0; color: var(--text-2); text-align: center; }
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
      recentPipes: [],
      loading: true,
      searchQuery: "",
      selectedPipe: null,
      pipeData: null,
      rawMarkdown: null,
      markdownHtml: null,
      markdownLoading: false,
      viewMode: "markdown",   // "markdown" | "output"
      runOutput: null,
      runOutputType: null,    // "json" | "html" | "stream"
      // Toolbar
      pipeDropdownOpen: false,
      // Operations
      activeOp: null,         // { type, status, output }
      // Step features
      showListDSL: {},        // { stepIndex: true }
      stepTraces: {},         // { stepIndex: [...] }
      showStepTraces: null    // stepIndex or null
    };

    var mdRenderer = window.markdownit({
      html: false,
      linkify: true,
      typographer: true,
      highlight: function(str, lang) {
        if (lang && hljs.getLanguage(lang)) {
          try {
            return '<pre class="hljs"><code>' +
              hljs.highlight(str, { language: lang, ignoreIllegals: true }).value +
              '</code></pre>';
          } catch (_) {}
        }
        return '<pre class="hljs"><code>' +
          mdRenderer.utils.escapeHtml(str) +
          '</code></pre>';
      }
    });

    // --- JSON tree viewer (from traceDashboard pattern) ---
    var jtOpen = {};
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
          m("span.jt-toggle", "\\u25B8"),
          key !== null ? [m("span.jt-key", "" + key), m("span.jt-colon", ":")] : null,
          m("span.jt-preview", isArr ? "[" + val.length + " items]" : jtPreview(val))
        ]);
      }
      return m("div", [
        m("div.jt-row.jt-clickable", { onclick: function() { jtOpen[id] = false; } }, [
          m("span.jt-toggle", "\\u25BE"),
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

    function relativeTime(iso) {
      if (!iso) return "";
      var d = new Date(iso);
      var now = new Date();
      var diffMs = now - d;
      var diffMin = Math.floor(diffMs / 60000);
      if (diffMin < 1) return "just now";
      if (diffMin < 60) return diffMin + "m ago";
      var diffH = Math.floor(diffMin / 60);
      if (diffH < 24) return diffH + "h ago";
      var diffD = Math.floor(diffH / 24);
      if (diffD < 30) return diffD + "d ago";
      return d.toLocaleDateString();
    }

    // --- Data fetching ---
    function loadRecentPipes() {
      state.loading = true;
      m.request({ method: "GET", url: "/api/recent-pipes" }).then(function(data) {
        state.recentPipes = data;
        state.loading = false;
      }).catch(function() {
        state.recentPipes = [];
        state.loading = false;
      });
    }

    function selectPipe(pipe) {
      state.selectedPipe = pipe;
      state.markdownLoading = true;
      state.markdownHtml = null;
      state.pipeData = null;
      state.rawMarkdown = null;
      state.viewMode = "markdown";
      state.runOutput = null;
      state.showListDSL = {};
      state.stepTraces = {};
      state.showStepTraces = null;
      state.pipeDropdownOpen = false;

      // Fetch markdown and pipe index in parallel
      var mdUrl = "/api/projects/" +
        encodeURIComponent(pipe.projectName) +
        "/files/" + encodeURIComponent(pipe.pipePath);

      var indexUrl = "/api/projects/" +
        encodeURIComponent(pipe.projectName) +
        "/pipes/" + encodeURIComponent(pipe.pipeName) + "/index";

      Promise.all([
        m.request({ method: "GET", url: mdUrl, extract: function(xhr) { return xhr.responseText; } }),
        m.request({ method: "GET", url: indexUrl }).catch(function() { return null; })
      ]).then(function(results) {
        state.rawMarkdown = results[0];
        state.pipeData = results[1];
        state.markdownHtml = renderMarkdownWithAnnotations(results[0], results[1]);
        state.markdownLoading = false;
      }).catch(function() {
        state.markdownHtml = null;
        state.markdownLoading = false;
      });
    }

    function renderMarkdownWithAnnotations(raw, pipeData) {
      if (!raw) return null;
      var tokens = mdRenderer.parse(raw, {});

      if (pipeData && pipeData.steps) {
        var stepsByLine = {};
        pipeData.steps.forEach(function(step, i) {
          if (step.sourceMap && step.sourceMap.headingLine !== undefined) {
            stepsByLine[step.sourceMap.headingLine] = i;
          }
        });

        tokens.forEach(function(token) {
          if (token.type === "heading_open" && token.map) {
            var line = token.map[0];
            if (stepsByLine[line] !== undefined) {
              token.attrSet("data-step-index", "" + stepsByLine[line]);
              token.attrJoin("class", "pd-step-heading");
            }
            if (token.tag === "h1") {
              token.attrJoin("class", "pd-pipe-heading");
            }
          }
        });
      }

      return mdRenderer.renderer.render(tokens, mdRenderer.options, {});
    }

    // --- API action helpers ---
    function startOp(type, label) {
      state.activeOp = { type: type, label: label, status: "running", output: "" };
      m.redraw();
    }

    function streamResponse(response, onDone) {
      var reader = response.body.getReader();
      var decoder = new TextDecoder();
      function read() {
        reader.read().then(function(result) {
          if (result.done) {
            if (state.activeOp) state.activeOp.status = "done";
            if (onDone) onDone(state.activeOp ? state.activeOp.output : "");
            m.redraw();
            return;
          }
          if (state.activeOp) state.activeOp.output += decoder.decode(result.value);
          m.redraw();
          read();
        }).catch(function(err) {
          if (state.activeOp) {
            state.activeOp.status = "error";
            state.activeOp.output += "\\nError: " + err.message;
          }
          m.redraw();
        });
      }
      read();
    }

    function postAction(url, body, label, onDone) {
      startOp(label, label);
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      }).then(function(res) {
        if (res.headers.get("content-type") && res.headers.get("content-type").includes("application/json")) {
          return res.json().then(function(data) {
            if (state.activeOp) {
              state.activeOp.output = JSON.stringify(data, null, 2);
              state.activeOp.status = "done";
            }
            if (onDone) onDone(data);
            m.redraw();
          });
        }
        streamResponse(res, onDone);
      }).catch(function(err) {
        if (state.activeOp) {
          state.activeOp.status = "error";
          state.activeOp.output = "Error: " + err.message;
        }
        m.redraw();
      });
    }

    function llmAction(action, extraBody) {
      if (!state.selectedPipe) return;
      var body = Object.assign({
        action: action,
        project: state.selectedPipe.projectName,
        pipe: state.selectedPipe.pipeName
      }, extraBody || {});
      postAction("/api/llm", body, "LLM: " + action, function() {
        // Refresh markdown after LLM writes
        selectPipe(state.selectedPipe);
      });
    }

    function runPipe() {
      if (!state.selectedPipe) return;
      postAction("/api/run", {
        project: state.selectedPipe.projectName,
        pipe: state.selectedPipe.pipeName
      }, "Running pipe", function(output) {
        try {
          var parsed = typeof output === "string" ? JSON.parse(output) : output;
          state.runOutput = JSON.stringify(parsed, null, 2);
          state.runOutputType = "json";
        } catch (_) {
          state.runOutput = typeof output === "string" ? output : JSON.stringify(output, null, 2);
          state.runOutputType = "stream";
        }
        state.viewMode = "output";
        m.redraw();
      });
    }

    function runToStep(stepIndex) {
      if (!state.selectedPipe) return;
      postAction("/api/run-step", {
        project: state.selectedPipe.projectName,
        pipe: state.selectedPipe.pipeName,
        stepIndex: stepIndex
      }, "Running to step " + stepIndex);
    }

    function openEditor() {
      if (!state.selectedPipe) return;
      fetch("/api/open-editor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filePath: state.selectedPipe.projectPath + "/" + state.selectedPipe.pipePath
        })
      });
    }

    function runTests() {
      if (!state.selectedPipe) return;
      postAction("/api/test", {
        project: state.selectedPipe.projectName
      }, "Running tests");
    }

    function runPack() {
      if (!state.selectedPipe) return;
      postAction("/api/pack", {
        project: state.selectedPipe.projectName
      }, "Running pd pack");
    }

    function toggleDSL(stepIndex) {
      state.showListDSL[stepIndex] = !state.showListDSL[stepIndex];
    }

    function loadStepTraces(stepIndex) {
      if (state.showStepTraces === stepIndex) {
        state.showStepTraces = null;
        return;
      }
      state.showStepTraces = stepIndex;
      if (state.stepTraces[stepIndex]) return; // cached
      var url = "/api/projects/" +
        encodeURIComponent(state.selectedPipe.projectName) +
        "/pipes/" + encodeURIComponent(state.selectedPipe.pipeName) +
        "/traces?step=" + stepIndex + "&limit=5";
      m.request({ method: "GET", url: url }).then(function(data) {
        state.stepTraces[stepIndex] = data;
      }).catch(function() {
        state.stepTraces[stepIndex] = [];
      });
    }

    // --- Components ---
    var SearchBar = {
      view: function() {
        return m("input.search-input", {
          type: "text",
          placeholder: "Search pipes...",
          value: state.searchQuery,
          oninput: function(e) { state.searchQuery = e.target.value; }
        });
      }
    };

    var Sidebar = {
      oninit: function() { loadRecentPipes(); },
      view: function() {
        if (state.loading) {
          return m("div.sidebar", m("p", { style: "color: var(--text-2)" }, "Loading pipes..."));
        }
        var pipes = state.recentPipes;
        if (state.searchQuery) {
          var q = state.searchQuery.toLowerCase();
          pipes = pipes.filter(function(p) {
            return p.pipeName.toLowerCase().includes(q) ||
              p.projectName.toLowerCase().includes(q) ||
              p.pipePath.toLowerCase().includes(q);
          });
        }
        if (pipes.length === 0) {
          return m("div.sidebar", [
            m(SearchBar),
            m("p", { style: "color: var(--text-2); font-size: var(--font-size-1)" },
              state.searchQuery ? "No matching pipes." : "No pipes found. Register a project first.")
          ]);
        }
        return m("div.sidebar", [
          m(SearchBar),
          pipes.map(function(pipe) {
            var isActive = state.selectedPipe &&
              state.selectedPipe.projectName === pipe.projectName &&
              state.selectedPipe.pipePath === pipe.pipePath;
            return m("div.pipe-card" + (isActive ? ".active" : ""), {
              onclick: function() { selectPipe(pipe); }
            }, [
              m("div.pipe-card-name", pipe.pipeName),
              m("div.pipe-card-meta", [
                m("span.badge.badge-project", pipe.projectName),
                pipe.mtime ? m("span.badge", relativeTime(pipe.mtime)) : null
              ])
            ]);
          })
        ]);
      }
    };

    function buildDSLLines(config) {
      if (!config) return [];
      var lines = [];
      if (config.checks) config.checks.forEach(function(c) { lines.push(["check", c]); });
      if (config.or) config.or.forEach(function(c) { lines.push(["or", c]); });
      if (config.and) config.and.forEach(function(c) { lines.push(["and", c]); });
      if (config.not) config.not.forEach(function(c) { lines.push(["not", c]); });
      if (config.routes) config.routes.forEach(function(r) { lines.push(["route", r]); });
      if (config.flags) config.flags.forEach(function(f) { lines.push(["flag", f]); });
      if (config.stop !== undefined) lines.push(["stop", "" + config.stop]);
      if (config.only !== undefined) lines.push(["only", "" + config.only]);
      return lines;
    }

    var MarkdownRenderer = {
      oncreate: function(vnode) { decorateHeadings(vnode.dom); },
      onupdate: function(vnode) { decorateHeadings(vnode.dom); },
      view: function() {
        if (state.markdownLoading) return m("p", "Loading...");
        if (!state.markdownHtml) return m("p", "Failed to load file.");
        return m("div.md-viewer", m.trust(state.markdownHtml));
      }
    };

    function decorateHeadings(container) {
      // Wrap each annotated heading in a heading-wrapper for toolbar positioning
      container.querySelectorAll("[data-step-index]").forEach(function(el) {
        if (el.parentNode.classList && el.parentNode.classList.contains("heading-wrapper")) return;
        var wrapper = document.createElement("div");
        wrapper.className = "heading-wrapper";
        el.parentNode.insertBefore(wrapper, el);
        wrapper.appendChild(el);
      });
      // Same for pipe heading
      var h1 = container.querySelector(".pd-pipe-heading");
      if (h1 && !(h1.parentNode.classList && h1.parentNode.classList.contains("heading-wrapper"))) {
        var wrapper = document.createElement("div");
        wrapper.className = "heading-wrapper";
        h1.parentNode.insertBefore(wrapper, h1);
        wrapper.appendChild(h1);
      }
    }

    var PipeToolbar = {
      view: function() {
        if (!state.pipeData || !state.selectedPipe) return null;
        return m(".toolbar-overlay", { style: "position: relative; opacity: 1; pointer-events: all; top: auto; right: auto; transform: none; margin-block-end: var(--size-3);" }, [
          m("button.tb-btn", { onclick: function() { llmAction("description"); } }, "Description"),
          m("button.tb-btn", { onclick: function() { llmAction("schema"); } }, "Schema"),
          m("button.tb-btn", { onclick: function() { llmAction("tests"); } }, "Tests"),
          m("button.tb-btn.primary", { onclick: runPipe }, "Run"),
          m("button.tb-btn", { onclick: openEditor }, "Edit"),
          m(".dropdown-wrapper", [
            m("button.tb-btn", {
              onclick: function(e) {
                e.stopPropagation();
                state.pipeDropdownOpen = !state.pipeDropdownOpen;
              }
            }, "More..."),
            state.pipeDropdownOpen ? m(".dropdown-menu", [
              m("button.dropdown-item", { onclick: function() { state.pipeDropdownOpen = false; runTests(); } }, "Run Tests"),
              m("button.dropdown-item", { onclick: function() { state.pipeDropdownOpen = false; runPack(); } }, "Pack"),
              m("a.dropdown-item", { href: "/traces", style: "text-decoration: none; color: var(--text-1);" }, "See Traces")
            ]) : null
          ])
        ]);
      }
    };

    var StepToolbars = {
      view: function() {
        if (!state.pipeData || !state.pipeData.steps) return null;
        return state.pipeData.steps.map(function(step, idx) {
          var dslLines = buildDSLLines(step.config);
          return m("div", { key: "step-toolbar-" + idx, style: "display: none;" }, [
            // DSL display (rendered inline, toggled by state)
            state.showListDSL[idx] && dslLines.length > 0 ?
              m(".dsl-block", dslLines.map(function(line) {
                return m(".dsl-line", [
                  m("span.dsl-key", "- " + line[0] + ": "),
                  m("span.dsl-val", line[1])
                ]);
              }))
            : null,
            // Step traces
            state.showStepTraces === idx ?
              m(".step-traces", [
                state.stepTraces[idx] ?
                  (state.stepTraces[idx].length === 0 ?
                    m("p", { style: "color: var(--text-2); font-size: var(--font-size-0)" }, "No traces found for this step.")
                    : state.stepTraces[idx].map(function(t, ti) {
                      return m("details", { key: ti }, [
                        m("summary", t.timestamp),
                        t.step ? [
                          m("div", { style: "margin: var(--size-1) 0" }, [
                            m("strong", { style: "font-size: var(--font-size-0)" }, "After:"),
                            jsonTree(t.step.after || t.step, "trace-" + idx + "-" + ti + "-after")
                          ]),
                          m("div", { style: "margin: var(--size-1) 0" }, [
                            m("strong", { style: "font-size: var(--font-size-0)" }, "Before:"),
                            jsonTree(t.step.before || {}, "trace-" + idx + "-" + ti + "-before")
                          ])
                        ] : m("p", "No data")
                      ]);
                    })
                  )
                : m("p.spinner", "Loading traces...")
              ])
            : null
          ]);
        });
      }
    };

    // Inject step toolbars into the DOM after markdown renders
    function injectStepToolbars(container) {
      if (!state.pipeData || !state.pipeData.steps) return;
      container.querySelectorAll("[data-step-index]").forEach(function(heading) {
        var idx = parseInt(heading.getAttribute("data-step-index"));
        if (isNaN(idx)) return;
        var step = state.pipeData.steps[idx];
        if (!step) return;

        // Check if toolbar already exists
        var wrapper = heading.parentNode;
        if (wrapper.querySelector(".toolbar-overlay")) return;

        var toolbar = document.createElement("div");
        toolbar.className = "toolbar-overlay";
        toolbar.innerHTML = "";
        wrapper.appendChild(toolbar);

        // Render toolbar buttons with mithril
        m.render(toolbar, [
          m("button.tb-btn", { onclick: function() { llmAction("step-title", { stepIndex: idx }); } }, "Title"),
          m("button.tb-btn", { onclick: function() { llmAction("step-description", { stepIndex: idx }); } }, "Describe"),
          m("button.tb-btn", { onclick: function() { llmAction("step-code", { stepIndex: idx }); } }, "Code"),
          m("button.tb-btn.primary", { onclick: function() { runToStep(idx); } }, "Run to here"),
          m("button.tb-btn", {
            onclick: function() { toggleDSL(idx); m.redraw(); },
            style: buildDSLLines(step.config).length === 0 ? "opacity: 0.4; pointer-events: none;" : ""
          }, "DSL"),
          m("button.tb-btn", { onclick: function() { loadStepTraces(idx); m.redraw(); } }, "I/O")
        ]);

        // Inject DSL and traces containers after the heading wrapper
        var extraId = "step-extra-" + idx;
        var existing = document.getElementById(extraId);
        if (!existing) {
          var extra = document.createElement("div");
          extra.id = extraId;
          wrapper.parentNode.insertBefore(extra, wrapper.nextSibling);
        }
      });

      // Update DSL/trace displays
      state.pipeData.steps.forEach(function(step, idx) {
        var extraEl = document.getElementById("step-extra-" + idx);
        if (!extraEl) return;
        var children = [];
        if (state.showListDSL[idx]) {
          var dslLines = buildDSLLines(step.config);
          if (dslLines.length > 0) {
            children.push(
              m(".dsl-block", dslLines.map(function(line) {
                return m(".dsl-line", [
                  m("span.dsl-key", "- " + line[0] + ": "),
                  m("span.dsl-val", line[1])
                ]);
              }))
            );
          }
        }
        if (state.showStepTraces === idx) {
          var traces = state.stepTraces[idx];
          if (traces) {
            if (traces.length === 0) {
              children.push(m(".step-traces", m("p", { style: "color: var(--text-2); font-size: var(--font-size-0)" }, "No traces found.")));
            } else {
              children.push(m(".step-traces", traces.map(function(t, ti) {
                return m("details", { key: ti }, [
                  m("summary", t.timestamp),
                  t.step ? [
                    m("div", { style: "margin: var(--size-1) 0" }, [
                      m("strong", { style: "font-size: var(--font-size-0)" }, "After:"),
                      jsonTree(t.step.after || t.step, "trace-" + idx + "-" + ti + "-after")
                    ]),
                    m("div", { style: "margin: var(--size-1) 0" }, [
                      m("strong", { style: "font-size: var(--font-size-0)" }, "Before:"),
                      jsonTree(t.step.before || {}, "trace-" + idx + "-" + ti + "-before")
                    ])
                  ] : m("p", "No data")
                ]);
              })));
            }
          } else {
            children.push(m(".step-traces", m("p.spinner", "Loading traces...")));
          }
        }
        m.render(extraEl, children);
      });
    }

    var MainContent = {
      oncreate: function(vnode) {
        if (state.markdownHtml && state.pipeData) {
          var viewer = vnode.dom.querySelector(".md-viewer");
          if (viewer) injectStepToolbars(viewer);
        }
      },
      onupdate: function(vnode) {
        if (state.markdownHtml && state.pipeData && state.viewMode === "markdown") {
          var viewer = vnode.dom.querySelector(".md-viewer");
          if (viewer) injectStepToolbars(viewer);
        }
      },
      view: function() {
        if (!state.selectedPipe) {
          return m("div.detail", m("div.empty-state", [
            m("p", "Select a pipe to view")
          ]));
        }

        var viewTabs = null;
        if (state.runOutput) {
          viewTabs = m(".view-tabs", [
            m("button.view-tab" + (state.viewMode === "markdown" ? ".active" : ""), {
              onclick: function() { state.viewMode = "markdown"; }
            }, "Source"),
            m("button.view-tab" + (state.viewMode === "output" ? ".active" : ""), {
              onclick: function() { state.viewMode = "output"; }
            }, "Output")
          ]);
        }

        var content;
        if (state.viewMode === "output" && state.runOutput) {
          if (state.runOutputType === "html") {
            content = m("div.output-view", m("iframe", {
              sandbox: "allow-scripts allow-same-origin",
              allow: "fullscreen",
              srcdoc: state.runOutput
            }));
          } else {
            content = m("div.output-view", m("pre", state.runOutput));
          }
        } else {
          content = [
            m(PipeToolbar),
            m(MarkdownRenderer)
          ];
        }

        return m("div.detail", [
          viewTabs,
          content
        ]);
      }
    };

    var OperationPanel = {
      view: function() {
        if (!state.activeOp) return null;
        return m(".op-panel", [
          m(".op-panel-header", [
            m("span", [
              state.activeOp.label,
              state.activeOp.status === "running" ? " ..." : "",
              state.activeOp.status === "done" ? " (done)" : "",
              state.activeOp.status === "error" ? " (error)" : ""
            ]),
            m("button.op-panel-close", {
              onclick: function() { state.activeOp = null; }
            }, "\\u00D7")
          ]),
          m(".op-panel-body", state.activeOp.output || (state.activeOp.status === "running" ? "Running..." : ""))
        ]);
      }
    };

    var Layout = {
      view: function() {
        return m("div.layout", {
          onclick: function() { state.pipeDropdownOpen = false; }
        }, [
          m("div.topbar", [
            m("h1", "Pipedown"),
            m("a", { href: "/projects" }, "Projects"),
            m("a", { href: "/traces" }, "Traces")
          ]),
          m(Sidebar),
          m(MainContent),
          m(OperationPanel)
        ]);
      }
    };

    m.mount(document.getElementById("app"), Layout);

    // SSE hot reload
    var eventSource = new EventSource("/sse");
    eventSource.onmessage = function(event) {
      if (event.data === "reload") {
        loadRecentPipes();
        if (state.selectedPipe) {
          selectPipe(state.selectedPipe);
        }
      }
    };
  })();
  </script>
</body>
</html>`;
}
