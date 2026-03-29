// Home page state, markdown renderer, data-fetching, and action helpers
window.PD = {
  state: {
    recentPipes: [],
    loading: true,
    searchQuery: "",
    selectedPipe: null,
    pipeData: null,
    rawMarkdown: null,
    markdownHtml: null,
    markdownLoading: false,
    pipeDropdownOpen: false,

    // ── Right-hand drawer panel ──
    // Unified output surface for all operations (run, run-step, LLM, tests, pack).
    // Replaces the old viewMode/runOutput/activeOp split.
    drawerOpen: false,
    drawerOutput: "",
    drawerOutputType: null, // "json" | "stream" | null
    drawerLabel: "",
    drawerStatus: "idle",   // "idle" | "running" | "done" | "error"
    drawerParsedOutput: null, // parsed JSON object from run stdout (for jsonTree)
    drawerTrace: null,        // { timestamp, input, output, durationMs, stepsTotal } from trace API

    showListDSL: {},
    stepTraces: {},
    showStepTraces: null,

    // ── Pipe-level I/O traces ──
    // Toggled by the "I/O" button in PipeToolbar; displays the whole-pipeline
    // input/output from the most recent trace files.
    showPipeTraces: false,
    pipeTraces: null
  },
  actions: {},
  utils: {},
  components: {}
};

PD.utils.mdRenderer = window.markdownit({
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
      PD.utils.mdRenderer.utils.escapeHtml(str) +
      '</code></pre>';
  }
});

// --- Data fetching ---
PD.actions.loadRecentPipes = function() {
  PD.state.loading = true;
  m.request({ method: "GET", url: "/api/recent-pipes" }).then(function(data) {
    PD.state.recentPipes = data;
    PD.state.loading = false;
  }).catch(function() {
    PD.state.recentPipes = [];
    PD.state.loading = false;
  }).then(function() { m.redraw.sync(); });
};

PD.utils.renderMarkdownWithAnnotations = function(raw, pipeData) {
  if (!raw) return null;
  var tokens = PD.utils.mdRenderer.parse(raw, {});

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

        // Mark every h2 as a step boundary — in pipedown every h2 demarcates
        // a pipeline step. Steps that are executable get the additional
        // pd-step-heading class + data-step-index; those without (skipped or
        // missing a valid language specifier) remain just pd-step-boundary,
        // which CSS uses to render them in a muted/inactive style.
        if (token.tag === "h2") {
          token.attrJoin("class", "pd-step-boundary");
        }

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

  return PD.utils.mdRenderer.renderer.render(tokens, PD.utils.mdRenderer.options, {});
};

PD.actions.selectPipe = function(pipe) {
  PD.state.selectedPipe = pipe;
  PD.state.markdownLoading = true;
  PD.state.markdownHtml = null;
  PD.state.pipeData = null;
  PD.state.rawMarkdown = null;
  PD.state.showListDSL = {};
  PD.state.stepTraces = {};
  PD.state.showStepTraces = null;
  PD.state.showPipeTraces = false;
  PD.state.pipeTraces = null;
  PD.state.pipeDropdownOpen = false;

  // Close the drawer when switching pipes so stale output doesn't linger.
  PD.state.drawerOpen = false;
  PD.state.drawerOutput = "";
  PD.state.drawerOutputType = null;
  PD.state.drawerLabel = "";
  PD.state.drawerStatus = "idle";
  PD.state.drawerParsedOutput = null;
  PD.state.drawerTrace = null;

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
    PD.state.rawMarkdown = results[0];
    PD.state.pipeData = results[1];
    PD.state.markdownHtml = PD.utils.renderMarkdownWithAnnotations(results[0], results[1]);
    PD.state.markdownLoading = false;
  }).catch(function() {
    PD.state.markdownHtml = null;
    PD.state.markdownLoading = false;
  }).then(function() { m.redraw.sync(); });
};

// ── API action helpers ──
// All operations funnel output into the right-hand drawer panel via the
// PD.state.drawer* properties. The drawer slides open automatically when
// an operation starts and streams chunks in real-time.

// closeDrawer — hides the drawer without clearing output so the user can
// re-open it later if state is preserved.
PD.actions.closeDrawer = function() {
  PD.state.drawerOpen = false;
};

// loadDrawerTrace — fetches the most recent pipe-level trace after a run
// completes. Trace data contains structured input/output plus metadata
// (duration, step count) that enriches the drawer's jsonTree display.
// Uses pipeData.name (the H1 heading) for the pipe name because trace
// directories are named after the heading, not the filename stem.
// Ref: buildandserve.ts trace API — GET /api/projects/{project}/pipes/{pipe}/traces
PD.actions.loadDrawerTrace = function() {
  if (!PD.state.selectedPipe) return;
  var pipeName = PD.state.pipeData && PD.state.pipeData.name
    ? PD.state.pipeData.name
    : PD.state.selectedPipe.pipeName;
  var url = "/api/projects/" +
    encodeURIComponent(PD.state.selectedPipe.projectName) +
    "/pipes/" + encodeURIComponent(pipeName) +
    "/traces?limit=1";
  m.request({ method: "GET", url: url }).then(function(data) {
    if (data && data.length > 0) {
      PD.state.drawerTrace = data[0];
    }
  }).catch(function() {
    // Trace fetch is best-effort — if it fails, the drawer still shows
    // the parsed stdout output or raw text.
  });
};

// startOp — opens the drawer and resets it for a new operation.
// Ref: Called by postAction before every fetch.
PD.actions.startOp = function(type, label) {
  PD.state.drawerOpen = true;
  PD.state.drawerOutput = "";
  PD.state.drawerOutputType = null;
  PD.state.drawerLabel = label;
  PD.state.drawerStatus = "running";
  PD.state.drawerParsedOutput = null;
  PD.state.drawerTrace = null;
  m.redraw();
};

// streamResponse — reads a streaming fetch Response body chunk-by-chunk
// and appends each decoded text chunk to drawerOutput.
// Ref: https://developer.mozilla.org/en-US/docs/Web/API/ReadableStreamDefaultReader/read
PD.actions.streamResponse = function(response, onDone) {
  var reader = response.body.getReader();
  var decoder = new TextDecoder();
  function read() {
    reader.read().then(function(result) {
      if (result.done) {
        PD.state.drawerStatus = "done";
        if (onDone) onDone(PD.state.drawerOutput);
        m.redraw();
        return;
      }
      PD.state.drawerOutput += decoder.decode(result.value);
      m.redraw();
      read();
    }).catch(function(err) {
      PD.state.drawerStatus = "error";
      PD.state.drawerOutput += "\nError: " + err.message;
      m.redraw();
    });
  }
  read();
};

// postAction — POST to a backend endpoint and route all output through the
// drawer. Handles both JSON and streaming response types.
PD.actions.postAction = function(url, body, label, onDone) {
  PD.actions.startOp(label, label);
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  }).then(function(res) {
    if (res.headers.get("content-type") && res.headers.get("content-type").includes("application/json")) {
      return res.json().then(function(data) {
        PD.state.drawerOutput = JSON.stringify(data, null, 2);
        PD.state.drawerParsedOutput = data;
        PD.state.drawerStatus = "done";
        if (onDone) onDone(data);
        m.redraw();
      });
    }
    PD.actions.streamResponse(res, onDone);
  }).catch(function(err) {
    PD.state.drawerStatus = "error";
    PD.state.drawerOutput = "Error: " + err.message;
    m.redraw();
  });
};

PD.actions.llmAction = function(action, extraBody) {
  if (!PD.state.selectedPipe) return;
  var body = Object.assign({
    action: action,
    project: PD.state.selectedPipe.projectName,
    pipe: PD.state.selectedPipe.pipeName
  }, extraBody || {});
  PD.actions.postAction("/api/llm", body, "LLM: " + action, function() {
    PD.actions.selectPipe(PD.state.selectedPipe);
  });
};

// runPipe — executes a full pipe run. Output streams into the drawer in
// real-time. On completion the raw output is formatted as pretty-printed JSON
// (when parseable) so the drawer shows a clean final result.
// runPipe — executes a full pipe run. Output streams into the drawer in
// real-time. On completion the output is parsed as JSON for jsonTree rendering,
// and the most recent trace is fetched for structured input/output data.
PD.actions.runPipe = function() {
  if (!PD.state.selectedPipe) return;
  PD.actions.postAction("/api/run", {
    project: PD.state.selectedPipe.projectName,
    pipe: PD.state.selectedPipe.pipeName
  }, "Running pipe", function(output) {
    // Try to parse the final output as JSON so the drawer can render it
    // with pd.jsonTree() instead of raw text.
    try {
      var parsed = typeof output === "string" ? JSON.parse(output) : output;
      PD.state.drawerOutput = JSON.stringify(parsed, null, 2);
      PD.state.drawerOutputType = "json";
      PD.state.drawerParsedOutput = parsed;
    } catch (_) {
      PD.state.drawerOutput = typeof output === "string" ? output : JSON.stringify(output, null, 2);
      PD.state.drawerOutputType = "stream";
    }
    // Fetch the most recent trace for richer input/output data.
    PD.actions.loadDrawerTrace();
    m.redraw();
  });
};

// runToStep — executes a partial pipe run up to a specific step. The
// /api/run-step endpoint outputs the final state as JSON, so we parse it
// for jsonTree rendering.
//
// Unlike a full runPipe(), the run-step eval script does NOT produce
// trace files, so we intentionally skip loadDrawerTrace() here.
// Loading traces would fetch stale data from a *previous* full run,
// overriding the correct partial output and making it look like the
// entire pipe executed.
// Ref: buildandserve.ts /api/run-step — generates a temp script that
//      imports only the selected step functions and runs them in a loop.
PD.actions.runToStep = function(stepIndex) {
  if (!PD.state.selectedPipe) return;
  PD.actions.postAction("/api/run-step", {
    project: PD.state.selectedPipe.projectName,
    pipe: PD.state.selectedPipe.pipeName,
    stepIndex: stepIndex
  }, "Running to step " + stepIndex, function(output) {
    try {
      var parsed = typeof output === "string" ? JSON.parse(output) : output;
      PD.state.drawerParsedOutput = parsed;
      PD.state.drawerOutputType = "json";
    } catch (_) { /* non-JSON output — keep raw text */ }
    // No loadDrawerTrace() — partial runs don't generate traces, so
    // fetching would return stale data from a prior full run.
    m.redraw();
  });
};

PD.actions.openEditor = function() {
  if (!PD.state.selectedPipe) return;
  fetch("/api/open-editor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filePath: PD.state.selectedPipe.projectPath + "/" + PD.state.selectedPipe.pipePath
    })
  });
};

PD.actions.runTests = function() {
  if (!PD.state.selectedPipe) return;
  PD.actions.postAction("/api/test", {
    project: PD.state.selectedPipe.projectName
  }, "Running tests");
};

PD.actions.runPack = function() {
  if (!PD.state.selectedPipe) return;
  PD.actions.postAction("/api/pack", {
    project: PD.state.selectedPipe.projectName
  }, "Running pd pack");
};

PD.actions.toggleDSL = function(stepIndex) {
  PD.state.showListDSL[stepIndex] = !PD.state.showListDSL[stepIndex];
};

PD.actions.loadStepTraces = function(stepIndex) {
  if (PD.state.showStepTraces === stepIndex) {
    PD.state.showStepTraces = null;
    return;
  }
  PD.state.showStepTraces = stepIndex;
  if (PD.state.stepTraces[stepIndex]) return;
  // Use pipeData.name (the H1 heading, e.g. "Run All The Tests") rather than
  // selectedPipe.pipeName (the filename stem, e.g. "testAll") because trace
  // directories are named after the H1 heading.
  // Ref: traceDashboard.ts scanTraces() → parts.slice(1, -1).join("/")
  var pipeName = PD.state.pipeData && PD.state.pipeData.name
    ? PD.state.pipeData.name
    : PD.state.selectedPipe.pipeName;
  var url = "/api/projects/" +
    encodeURIComponent(PD.state.selectedPipe.projectName) +
    "/pipes/" + encodeURIComponent(pipeName) +
    "/traces?step=" + stepIndex + "&limit=5";
  m.request({ method: "GET", url: url }).then(function(data) {
    PD.state.stepTraces[stepIndex] = data;
  }).catch(function() {
    PD.state.stepTraces[stepIndex] = [];
  });
};

// ── Pipe-Level Trace Loading ──
// Fetches the whole-pipeline input/output from the traces API (no ?step param).
// Toggles the PipeToolbar I/O panel on repeated clicks.
// Ref: buildandserve.ts traces endpoint, homeDashboard.ts recentPipeTraces
PD.actions.loadPipeTraces = function() {
  PD.state.showPipeTraces = !PD.state.showPipeTraces;
  if (!PD.state.showPipeTraces) return;
  if (PD.state.pipeTraces) return;
  // Use pipeData.name (H1 heading) to match trace directory naming.
  var pipeName = PD.state.pipeData && PD.state.pipeData.name
    ? PD.state.pipeData.name
    : PD.state.selectedPipe.pipeName;
  var url = "/api/projects/" +
    encodeURIComponent(PD.state.selectedPipe.projectName) +
    "/pipes/" + encodeURIComponent(pipeName) +
    "/traces?limit=5";
  m.request({ method: "GET", url: url }).then(function(data) {
    PD.state.pipeTraces = data;
  }).catch(function() {
    PD.state.pipeTraces = [];
  });
};

PD.utils.buildDSLLines = function(config) {
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
};
