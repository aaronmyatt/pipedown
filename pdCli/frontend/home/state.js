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
    viewMode: "markdown",
    runOutput: null,
    runOutputType: null,
    pipeDropdownOpen: false,
    activeOp: null,
    showListDSL: {},
    stepTraces: {},
    showStepTraces: null
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
  PD.state.viewMode = "markdown";
  PD.state.runOutput = null;
  PD.state.showListDSL = {};
  PD.state.stepTraces = {};
  PD.state.showStepTraces = null;
  PD.state.pipeDropdownOpen = false;

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

// --- API action helpers ---
PD.actions.startOp = function(type, label) {
  PD.state.activeOp = { type: type, label: label, status: "running", output: "" };
  m.redraw();
};

PD.actions.streamResponse = function(response, onDone) {
  var reader = response.body.getReader();
  var decoder = new TextDecoder();
  function read() {
    reader.read().then(function(result) {
      if (result.done) {
        if (PD.state.activeOp) PD.state.activeOp.status = "done";
        if (onDone) onDone(PD.state.activeOp ? PD.state.activeOp.output : "");
        m.redraw();
        return;
      }
      if (PD.state.activeOp) PD.state.activeOp.output += decoder.decode(result.value);
      m.redraw();
      read();
    }).catch(function(err) {
      if (PD.state.activeOp) {
        PD.state.activeOp.status = "error";
        PD.state.activeOp.output += "\nError: " + err.message;
      }
      m.redraw();
    });
  }
  read();
};

PD.actions.postAction = function(url, body, label, onDone) {
  PD.actions.startOp(label, label);
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  }).then(function(res) {
    if (res.headers.get("content-type") && res.headers.get("content-type").includes("application/json")) {
      return res.json().then(function(data) {
        if (PD.state.activeOp) {
          PD.state.activeOp.output = JSON.stringify(data, null, 2);
          PD.state.activeOp.status = "done";
        }
        if (onDone) onDone(data);
        m.redraw();
      });
    }
    PD.actions.streamResponse(res, onDone);
  }).catch(function(err) {
    if (PD.state.activeOp) {
      PD.state.activeOp.status = "error";
      PD.state.activeOp.output = "Error: " + err.message;
    }
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

PD.actions.runPipe = function() {
  if (!PD.state.selectedPipe) return;
  PD.actions.postAction("/api/run", {
    project: PD.state.selectedPipe.projectName,
    pipe: PD.state.selectedPipe.pipeName
  }, "Running pipe", function(output) {
    try {
      var parsed = typeof output === "string" ? JSON.parse(output) : output;
      PD.state.runOutput = JSON.stringify(parsed, null, 2);
      PD.state.runOutputType = "json";
    } catch (_) {
      PD.state.runOutput = typeof output === "string" ? output : JSON.stringify(output, null, 2);
      PD.state.runOutputType = "stream";
    }
    PD.state.viewMode = "output";
    m.redraw();
  });
};

PD.actions.runToStep = function(stepIndex) {
  if (!PD.state.selectedPipe) return;
  PD.actions.postAction("/api/run-step", {
    project: PD.state.selectedPipe.projectName,
    pipe: PD.state.selectedPipe.pipeName,
    stepIndex: stepIndex
  }, "Running to step " + stepIndex);
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
  var url = "/api/projects/" +
    encodeURIComponent(PD.state.selectedPipe.projectName) +
    "/pipes/" + encodeURIComponent(PD.state.selectedPipe.pipeName) +
    "/traces?step=" + stepIndex + "&limit=5";
  m.request({ method: "GET", url: url }).then(function(data) {
    PD.state.stepTraces[stepIndex] = data;
  }).catch(function() {
    PD.state.stepTraces[stepIndex] = [];
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
