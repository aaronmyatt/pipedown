// Home page state, markdown renderer, data-fetching, and action helpers
window.PD = {
  state: {
    // ── Sidebar visibility ──
    // Toggled by the hamburger button in the topbar.
    // When false the sidebar column collapses to 0px via CSS transition.
    sidebarOpen: true,

    recentPipes: [],
    loading: true,
    searchQuery: "",

    // ── Sidebar project groups ──
    // Tracks which project headings in the "Projects" sidebar section are
    // collapsed. Keys are project names; value `false` = explicitly expanded,
    // `true` or absent = collapsed. Persisted to localStorage so the user's
    // preferred expand/collapse state survives page reloads.
    // Ref: Sidebar.js — "Projects" section rendering
    // Ref: https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage
    collapsedProjects: (function() {
      try {
        var saved = localStorage.getItem("pd-collapsed-projects");
        if (saved) return JSON.parse(saved);
      } catch(e) { /* ignore — localStorage unavailable or corrupted JSON */ }
      return {};  // first visit — no preferences yet; Sidebar treats absent keys as collapsed
    })(),
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
    drawerError: null,        // { status, statusText, message } — structured error info for RunDrawer display

    showListDSL: {},
    stepTraces: {},
    showStepTraces: null,

    // ── Pipe-level I/O traces ──
    // Toggled by the "I/O" button in PipeToolbar; displays the whole-pipeline
    // input/output from the most recent trace files.
    showPipeTraces: false,
    pipeTraces: null,

    // ── Markdown editor mode ──
    // When editMode is true, the main content area shows a textarea with the
    // raw markdown instead of the rendered view. The user can edit and save
    // changes back to the .md file on disk.
    editMode: false,
    editBuffer: null,     // raw markdown text being edited (copy of rawMarkdown)
    editDirty: false,     // true when editBuffer differs from rawMarkdown
    editSaving: false,    // true while the save POST is in flight

    // ── All projects (for New Pipe modal project picker) ──
    // Full project list from /api/projects — includes empty projects that
    // don't appear in recentPipes. Loaded alongside recentPipes on init.
    allProjects: [],

    // ── New Pipe modal ──
    // Controls the "create a new pipe" dialog opened from the sidebar.
    showNewPipeModal: false,
    newPipeName: "",       // user-entered pipe name
    newPipeProject: null,  // selected project name for the new file
    newPipeCreating: false, // true while the create POST is in flight

    // ── Input history & JSON builder ──
    // The input dropdown attaches to the Run / "Run to here" split buttons,
    // showing unique past inputs from trace history plus a "Custom Input..."
    // option that opens a JSON editor in the drawer.
    // Ref: PipeToolbar.js split button, MarkdownRenderer.js step toolbar injection
    inputDropdownOpen: false,      // pipe-level Run dropdown visibility
    inputDropdownStep: null,       // step-level: which step's dropdown is open (index), null = none
    inputHistory: null,            // array of unique input objects for current pipe (deduped)
    inputHistoryLoading: false,    // trace fetch in progress

    // ── Drawer input editor mode ──
    // When drawerMode is "input", the RunDrawer shows a JSON textarea instead
    // of normal operation output. The user edits JSON, then clicks Run.
    // drawerInputTarget tracks whether the run targets the full pipe (null)
    // or a specific step (step index number).
    drawerMode: null,              // null (normal output) | "input" (JSON editor)
    drawerInputBuffer: "{}",       // JSON text being edited in the drawer textarea
    drawerInputTarget: null,       // null = full pipe run, number = step index for run-to-step

    // ── Extract mode ──
    // When extractMode is true, step toolbars show checkboxes instead of action
    // buttons. The user selects steps to extract into a new sub-pipe, names it,
    // and confirms. The extraction API creates the new .md file and modifies
    // the parent pipe to replace the extracted steps with a delegation step.
    // Ref: ExtractBar.js — floating action bar at viewport bottom
    // Ref: MarkdownRenderer.js — toolbar rendering changes in extract mode
    extractMode: false,            // true when step selection UI is active
    extractSelected: {},           // { [stepIndex]: true } — selected steps
    extractName: "",               // user-entered name for the new sub-pipe
    extracting: false              // true while the POST /api/extract is in flight
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

// ── parseErrorBody ──
// Normalises both server error response formats into a single message string.
// The /api/llm endpoint returns JSON `{ error: "..." }` while all other action
// endpoints (/api/run, /api/run-step, /api/test, /api/pack) return plain text
// prefixed with "Error: ".
// Ref: buildandserve.ts route handlers — each endpoint's catch block
PD.utils.parseErrorBody = function(bodyText) {
  // Attempt JSON parse first — handles /api/llm's `{ error: "message" }` format.
  try {
    var parsed = JSON.parse(bodyText);
    if (parsed && typeof parsed.error === "string") {
      return parsed.error;
    }
  } catch (_) {
    // Not JSON — fall through to plain text handling.
  }
  // Plain text response — return as-is (already includes "Error: " prefix from server).
  return bodyText || "Unknown error";
};

// --- Data fetching ---
PD.actions.loadRecentPipes = function() {
  PD.state.loading = true;
  m.request({ method: "GET", url: "/api/recent-pipes" }).then(function(data) {
    PD.state.recentPipes = data;
    PD.state.loading = false;
  }).catch(function(err) {
    PD.state.recentPipes = [];
    PD.state.loading = false;
    // Surface the error in the drawer so the user knows why the pipe list
    // is empty. m.request rejects with an Error whose message includes the
    // HTTP status for server errors, or a network message for fetch failures.
    // Ref: https://mithril.js.org/request.html#error-handling
    PD.state.drawerOpen = true;
    PD.state.drawerLabel = "Load pipes";
    PD.state.drawerStatus = "error";
    PD.state.drawerOutput = err.message || "Failed to load pipes";
    PD.state.drawerError = {
      status: (err.code || 0),
      statusText: "Request Failed",
      message: err.message || "Failed to load pipes"
    };
  }).then(function() { m.redraw.sync(); });
};

// loadAllProjects — fetches the full project list from /api/projects so
// that the New Pipe modal can offer newly created (empty) projects that
// have no pipes yet and wouldn't appear in recentPipes.
// Ref: GET /api/projects in buildandserve.ts
PD.actions.loadAllProjects = function() {
  m.request({ method: "GET", url: "/api/projects" }).then(function(data) {
    PD.state.allProjects = data;
  }).catch(function() {
    PD.state.allProjects = [];
  }).then(function() { m.redraw.sync(); });
};

// ── restoreFromHash ──
// Reads the URL hash and, if it encodes a pipe selection, finds the
// matching pipe in the already-loaded recentPipes list and selects it.
// Called after the initial data fetch completes and on `hashchange` events
// (browser back/forward navigation).
//
// Hash format: #/projectName/pipePath
// Both segments are URI-decoded by pd.hashRouter.getSegments().
//
// @return {boolean} — true if a pipe was restored, false otherwise
// Ref: shared/hashRouter.js
PD.actions.restoreFromHash = function() {
  var segments = pd.hashRouter.getSegments();
  // Need exactly 2 segments: [projectName, pipePath]
  if (segments.length !== 2) return false;
  var projectName = segments[0];
  var pipePath = segments[1];

  // Don't re-select if already viewing this pipe — avoids resetting
  // scroll position, drawer state, and edit mode.
  if (PD.state.selectedPipe &&
      PD.state.selectedPipe.projectName === projectName &&
      PD.state.selectedPipe.pipePath === pipePath) {
    return true;
  }

  // Search the loaded pipe list for a match. recentPipes contains all
  // pipes grouped by project, so we scan the full array.
  var match = null;
  PD.state.recentPipes.forEach(function(group) {
    // Each group has a projectName and a pipes array
    if (group.projectName === projectName) {
      // Check if the group itself matches (flat list item)
      if (group.pipePath === pipePath) {
        match = group;
        return;
      }
      // Check nested pipes array if present
      if (group.pipes) {
        group.pipes.forEach(function(p) {
          if (p.pipePath === pipePath) {
            match = p;
          }
        });
      }
    }
  });

  if (match) {
    PD.actions.selectPipe(match);
    return true;
  }
  return false;
};

// ── toggleProjectCollapse ──
// Toggles the collapsed/expanded state of a project group in the
// sidebar's "Projects" section. Persists to localStorage so the
// preference survives page reloads.
//
// Semantics: absent key or `true` = collapsed; `false` = expanded.
// This makes "collapsed" the default for projects the user hasn't
// interacted with yet.
//
// @param {string} projectName — the project group to toggle
// Ref: Sidebar.js — project-group-header onclick
// Ref: https://developer.mozilla.org/en-US/docs/Web/API/Storage/setItem
PD.actions.toggleProjectCollapse = function(projectName) {
  var current = PD.state.collapsedProjects[projectName];
  // absent or true → expand (false); false → collapse (true)
  PD.state.collapsedProjects[projectName] = current === false ? true : false;
  // Persist the full map so every project the user has touched is remembered.
  // Uses the same try-catch pattern as the theme manager (shared/theme.js).
  try {
    localStorage.setItem("pd-collapsed-projects",
      JSON.stringify(PD.state.collapsedProjects));
  } catch(e) { /* ignore — localStorage full or unavailable */ }
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
  // ── Unsaved changes guard ──
  // If the user is mid-edit with unsaved changes, confirm before switching
  // pipes. This prevents accidental loss of work.
  // Ref: https://developer.mozilla.org/en-US/docs/Web/API/Window/confirm
  if (PD.state.editMode && PD.state.editDirty) {
    if (!confirm("You have unsaved changes. Discard them?")) return;
  }
  // Reset edit mode when switching pipes — the new pipe starts in read mode.
  PD.state.editMode = false;
  PD.state.editBuffer = null;
  PD.state.editDirty = false;
  PD.state.editSaving = false;

  PD.state.selectedPipe = pipe;

  // ── Persist selection to URL hash ──
  // Encodes project name and pipe path into the fragment so the selection
  // survives page refreshes and can be bookmarked.
  // Hash format: #/projectName/pipePath
  // Ref: shared/hashRouter.js
  pd.hashRouter.setSegments([pipe.projectName, pipe.pipePath]);

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

  // Reset input history — stale when switching pipes.
  PD.state.inputDropdownOpen = false;
  PD.state.inputDropdownStep = null;
  PD.state.inputHistory = null;
  PD.state.inputHistoryLoading = false;
  PD.state.drawerMode = null;
  PD.state.drawerInputBuffer = "{}";
  PD.state.drawerInputTarget = null;

  // Close the drawer when switching pipes so stale output doesn't linger.
  PD.state.drawerOpen = false;
  PD.state.drawerOutput = "";
  PD.state.drawerOutputType = null;
  PD.state.drawerLabel = "";
  PD.state.drawerStatus = "idle";
  PD.state.drawerParsedOutput = null;
  PD.state.drawerTrace = null;
  PD.state.drawerError = null;

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
  }).catch(function(err) {
    PD.state.markdownHtml = null;
    PD.state.markdownLoading = false;
    // The markdown fetch failed — surface the error in the drawer so the user
    // understands why the pipe content area is blank.
    PD.state.drawerOpen = true;
    PD.state.drawerLabel = "Load pipe";
    PD.state.drawerStatus = "error";
    PD.state.drawerOutput = err.message || "Failed to load pipe";
    PD.state.drawerError = {
      status: (err.code || 0),
      statusText: "Request Failed",
      message: err.message || "Failed to load pipe"
    };
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
  PD.state.drawerError = null;
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
      // Stream read errors (e.g. connection dropped mid-transfer). The drawer
      // may already contain partial output from earlier chunks, so we append
      // rather than replace.
      PD.state.drawerError = {
        status: 0,
        statusText: "Stream Error",
        message: err.message
      };
      PD.state.drawerStatus = "error";
      PD.state.drawerOutput += "\nError: " + err.message;
      m.redraw();
    });
  }
  read();
};

// postAction — POST to a backend endpoint and route all output through the
// drawer. Handles both JSON and streaming response types.
//
// IMPORTANT: We check response.ok *before* content-type branching. The fetch
// API does NOT reject on HTTP errors (4xx/5xx) — it only rejects on network
// failures. Without the .ok check, a 500 response would flow through the
// success path, streaming the error text but setting drawerStatus to "done".
// Ref: https://developer.mozilla.org/en-US/docs/Web/API/Response/ok
PD.actions.postAction = function(url, body, label, onDone) {
  PD.actions.startOp(label, label);
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  }).then(function(res) {
    // ── HTTP error detection ──
    // Must come before content-type branching: a 500 with content-type
    // application/json (e.g. /api/llm errors) must be treated as an error,
    // not parsed as success data.
    if (!res.ok) {
      return res.text().then(function(bodyText) {
        var msg = PD.utils.parseErrorBody(bodyText);
        PD.state.drawerError = {
          status: res.status,
          statusText: res.statusText,
          message: msg
        };
        PD.state.drawerStatus = "error";
        PD.state.drawerOutput = msg;
        m.redraw.sync();
      });
    }
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
    // Network-level failures (DNS, connection refused, CORS, etc.) land here.
    // The fetch API only rejects for network errors, not HTTP status codes.
    // Ref: https://developer.mozilla.org/en-US/docs/Web/API/Window/fetch#exceptions
    PD.state.drawerError = {
      status: 0,
      statusText: "Network Error",
      message: err.message
    };
    PD.state.drawerStatus = "error";
    PD.state.drawerOutput = "Error: " + err.message;
    m.redraw();
  });
};

// ── refreshPipe ──
// Lightweight re-fetch of the currently selected pipe's markdown and index
// data. Unlike selectPipe(), this does NOT reset state or clear the rendered
// HTML — the existing content stays visible (no loading flash) and, critically,
// the scroll position of the .detail container is captured before the fetch and
// restored after the redraw completes.
//
// Use this instead of selectPipe() when the *same* pipe's content has changed
// on disk (e.g. after an LLM action or SSE reload) and the user should stay
// at the same scroll position.
// Ref: https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollTop
PD.actions.refreshPipe = function() {
  var pipe = PD.state.selectedPipe;
  if (!pipe) return;

  // Capture scroll position of the .detail container before re-rendering.
  // document.querySelector is safe here — there is exactly one .detail element
  // in the home page layout (rendered by MainContent).
  var detailEl = document.querySelector(".detail");
  var savedScroll = detailEl ? detailEl.scrollTop : 0;

  // Cache-bust: append a timestamp query parameter so the browser never
  // serves a stale cached response. This is a belt-and-suspenders measure
  // alongside the server's Cache-Control: no-store header — some browsers
  // or intermediary proxies may ignore no-store for XHR GET requests.
  // Ref: https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/Using_XMLHttpRequest#bypassing_the_cache
  var cacheBust = "?t=" + Date.now();

  var mdUrl = "/api/projects/" +
    encodeURIComponent(pipe.projectName) +
    "/files/" + encodeURIComponent(pipe.pipePath) + cacheBust;

  var indexUrl = "/api/projects/" +
    encodeURIComponent(pipe.projectName) +
    "/pipes/" + encodeURIComponent(pipe.pipeName) + "/index" + cacheBust;

  // Fetch both resources in parallel — same requests as selectPipe() but
  // without resetting markdownHtml/pipeData to null first.
  // Ref: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/all
  Promise.all([
    m.request({ method: "GET", url: mdUrl, extract: function(xhr) { return xhr.responseText; } }),
    m.request({ method: "GET", url: indexUrl }).catch(function() { return null; })
  ]).then(function(results) {
    PD.state.rawMarkdown = results[0];
    PD.state.pipeData = results[1];
    PD.state.markdownHtml = PD.utils.renderMarkdownWithAnnotations(results[0], results[1]);
    PD.state.markdownLoading = false;
  }).catch(function() {
    // On error, fall through — the existing content stays visible.
  }).then(function() {
    m.redraw.sync();
    // Restore scroll position after the synchronous redraw has updated the DOM.
    // The .detail element may have been replaced by Mithril's diff, so re-query it.
    var el = document.querySelector(".detail");
    if (el) el.scrollTop = savedScroll;
  });
};

PD.actions.llmAction = function(action, extraBody) {
  if (!PD.state.selectedPipe) return;
  var body = Object.assign({
    action: action,
    project: PD.state.selectedPipe.projectName,
    pipe: PD.state.selectedPipe.pipeName
  }, extraBody || {});
  // After the LLM finishes, refresh the pipe content in place (preserving
  // scroll position) rather than doing a full selectPipe() which resets
  // the view to the top.
  PD.actions.postAction("/api/llm", body, "LLM: " + action, function() {
    PD.actions.refreshPipe();
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

// ── Edit Mode Actions ──
// These actions control the read/edit toggle for in-browser markdown editing.
// The edit buffer is a copy of rawMarkdown — changes are only persisted when
// the user explicitly saves. The POST endpoint writes the file, triggers a
// rebuild, and sends an SSE reload.

// enterEditMode — switches to the textarea editor, copying the current raw
// markdown into an editable buffer.
PD.actions.enterEditMode = function() {
  PD.state.editMode = true;
  PD.state.editBuffer = PD.state.rawMarkdown || "";
  PD.state.editDirty = false;
};

// exitEditMode — discards any unsaved changes and returns to the rendered
// markdown view. Does NOT write anything to disk.
PD.actions.exitEditMode = function() {
  PD.state.editMode = false;
  PD.state.editBuffer = null;
  PD.state.editDirty = false;
  PD.state.editSaving = false;
};

// saveEdit — POSTs the edited markdown back to the server, which writes
// the file, rebuilds .pd/, and sends an SSE reload. After a successful save,
// re-selects the pipe to refresh the rendered view.
// Ref: POST /api/projects/{name}/files/{path} in buildandserve.ts
PD.actions.saveEdit = function() {
  if (PD.state.editSaving || !PD.state.selectedPipe) return;
  PD.state.editSaving = true;
  m.redraw();

  var pipe = PD.state.selectedPipe;
  var url = "/api/projects/" +
    encodeURIComponent(pipe.projectName) +
    "/files/" + encodeURIComponent(pipe.pipePath);

  // Send as plain text — the server reads the body with request.text().
  // Using text/plain avoids JSON-encoding the markdown content.
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: PD.state.editBuffer
  }).then(function(res) {
    if (!res.ok) throw new Error("Save failed: " + res.statusText);
    // Exit edit mode and re-select the pipe to refresh markdown + pipeData.
    PD.state.editMode = false;
    PD.state.editBuffer = null;
    PD.state.editDirty = false;
    PD.state.editSaving = false;
    PD.actions.selectPipe(pipe);
  }).catch(function(err) {
    PD.state.editSaving = false;
    // Surface the error in the drawer so the user knows why the save failed.
    PD.state.drawerOpen = true;
    PD.state.drawerLabel = "Save error";
    PD.state.drawerStatus = "error";
    PD.state.drawerOutput = err.message || "Failed to save";
    m.redraw();
  });
};

// ── New Pipe Modal Actions ──
// These actions control the "create new pipe" dialog and handle file creation.

// openNewPipeModal — shows the modal, defaulting the project selector to the
// currently selected pipe's project or the first available project.
PD.actions.openNewPipeModal = function() {
  PD.state.showNewPipeModal = true;
  PD.state.newPipeName = "";
  PD.state.newPipeCreating = false;
  // Default to the current pipe's project, or the first project in the list.
  if (PD.state.selectedPipe) {
    PD.state.newPipeProject = PD.state.selectedPipe.projectName;
  } else if (PD.state.recentPipes.length > 0) {
    PD.state.newPipeProject = PD.state.recentPipes[0].projectName;
  } else {
    PD.state.newPipeProject = null;
  }
};

PD.actions.closeNewPipeModal = function() {
  PD.state.showNewPipeModal = false;
  PD.state.newPipeName = "";
  PD.state.newPipeProject = null;
  PD.state.newPipeCreating = false;
};

// createNewPipe — sanitises the user-entered name, builds a template markdown
// string, POSTs it to the write endpoint, reloads the pipe list, and
// auto-selects the new pipe in edit mode so the user can start writing.
PD.actions.createNewPipe = function() {
  if (PD.state.newPipeCreating || !PD.state.newPipeName.trim() || !PD.state.newPipeProject) return;
  PD.state.newPipeCreating = true;
  m.redraw();

  // Sanitise the pipe name into a safe filename: lowercase, replace spaces
  // and non-alphanumeric chars with hyphens, collapse consecutive hyphens,
  // and strip leading/trailing hyphens.
  var displayName = PD.state.newPipeName.trim();
  var safeName = displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!safeName) safeName = "new-pipe";
  var fileName = safeName + ".md";

  // Build the template markdown. The H1 heading uses the user-provided name
  // (preserving their casing), and two placeholder steps give them a starting
  // structure to fill in.
  var template = "# " + displayName + "\n\n" +
    "Describe what this pipe does.\n\n" +
    "## Step One\n\n" +
    "Describe what this step does.\n\n" +
    "```ts\n// Your code here\n```\n\n" +
    "## Step Two\n\n" +
    "Describe what this step does.\n\n" +
    "```ts\n// Your code here\n```\n";

  var projectName = PD.state.newPipeProject;
  var url = "/api/projects/" +
    encodeURIComponent(projectName) +
    "/files/" + encodeURIComponent(fileName);

  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: template
  }).then(function(res) {
    if (!res.ok) throw new Error("Create failed: " + res.statusText);
    PD.actions.closeNewPipeModal();
    // Reload the pipe list so the new pipe appears in the sidebar.
    // After reloading, find and select the new pipe, then enter edit mode.
    PD.actions.loadRecentPipes();
    // Give the pipe list a moment to update (loadRecentPipes is async),
    // then find and select the newly created pipe.
    // Ref: setTimeout ensures we run after the m.redraw from loadRecentPipes.
    setTimeout(function() {
      var match = PD.state.recentPipes.find(function(p) {
        return p.projectName === projectName && p.pipePath === fileName;
      });
      if (match) {
        PD.actions.selectPipe(match);
        // Enter edit mode after a short delay so selectPipe's async fetches
        // have time to populate rawMarkdown.
        setTimeout(function() {
          PD.actions.enterEditMode();
          m.redraw();
        }, 300);
      }
    }, 500);
  }).catch(function(err) {
    PD.state.newPipeCreating = false;
    PD.state.drawerOpen = true;
    PD.state.drawerLabel = "Create pipe error";
    PD.state.drawerStatus = "error";
    PD.state.drawerOutput = err.message || "Failed to create pipe";
    m.redraw();
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

// ── Input History & JSON Builder ──
// These utilities and actions support the input history dropdown and the
// interactive JSON editor in the RunDrawer. Past inputs are extracted from
// trace files and deduplicated so the user can quickly re-run a pipe with
// previously used data.

// ── deduplicateInputs ──
// Takes an array of trace objects (each with an .input property) and returns
// an array of unique input objects, most recent first. Deduplication compares
// a "cleaned" version of each input — internal pipedown metadata keys (/flags,
// /mode) are stripped before comparison so two runs that differ only in runtime
// flags show as the same user input.
// Ref: templates/trace.ts — enriches input with /flags and /mode before execution
PD.utils.deduplicateInputs = function(traces) {
  if (!traces || !traces.length) return [];
  var seen = {};
  var results = [];

  traces.forEach(function(t) {
    if (!t.input || typeof t.input !== "object") return;

    // Strip internal pipedown metadata that the user didn't provide.
    // These are injected by the CLI (trace.ts) before execution and
    // aren't meaningful as "user input".
    var cleaned = {};
    Object.keys(t.input).forEach(function(k) {
      if (k !== "flags" && k !== "mode") {
        cleaned[k] = t.input[k];
      }
    });

    // Skip empty inputs — they represent the default "{}" case which the
    // user can already trigger with the plain Run button.
    if (Object.keys(cleaned).length === 0) return;

    // Deduplicate by JSON string comparison. JSON.stringify with sorted keys
    // ensures consistent ordering regardless of object property order.
    // Ref: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify#the_replacer_parameter
    var key = JSON.stringify(cleaned, Object.keys(cleaned).sort());
    if (!seen[key]) {
      seen[key] = true;
      results.push(cleaned);
    }
  });

  return results;
};

// ── inputPreview ──
// Returns a truncated single-line preview string for an input object,
// suitable for display in the dropdown menu. Keeps it short enough to
// fit in a dropdown item without wrapping.
// @param {object} obj — the input object to preview
// @param {number} [maxLen=60] — maximum character length before truncation
// @return {string} — e.g. '{ "url": "https://ex...", "count": 5 }'
PD.utils.inputPreview = function(obj, maxLen) {
  maxLen = maxLen || 60;
  var str = JSON.stringify(obj);
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + "\u2026";
};

// ── groupPipesByProject ──
// Groups a flat array of pipe objects by their projectName field.
// Returns an array of { projectName, pipes[] } objects sorted
// alphabetically by project name. Used by the Sidebar component to
// render the "Projects" section with collapsible project headings.
// @param {Array} pipes — the (optionally filtered) recentPipes array
// @return {Array} — [{ projectName: string, pipes: RecentPipe[] }, ...]
// Ref: Sidebar.js — "Projects" section
PD.utils.groupPipesByProject = function(pipes) {
  var groups = {};
  pipes.forEach(function(p) {
    if (!groups[p.projectName]) groups[p.projectName] = [];
    groups[p.projectName].push(p);
  });
  // Sort project names alphabetically for stable sidebar ordering.
  return Object.keys(groups).sort().map(function(name) {
    return { projectName: name, pipes: groups[name] };
  });
};

// ── loadInputHistory ──
// Fetches recent traces for the currently selected pipe and extracts
// unique input values. Called when the user opens the input dropdown
// for the first time (lazy loading). Results are cached in
// PD.state.inputHistory until the pipe changes.
// Ref: buildandserve.ts — GET /api/projects/{project}/pipes/{pipe}/traces
PD.actions.loadInputHistory = function() {
  if (PD.state.inputHistoryLoading || PD.state.inputHistory) return;
  if (!PD.state.selectedPipe) return;

  PD.state.inputHistoryLoading = true;

  // Use pipeData.name (H1 heading) to match trace directory naming,
  // same convention as loadPipeTraces and loadDrawerTrace.
  var pipeName = PD.state.pipeData && PD.state.pipeData.name
    ? PD.state.pipeData.name
    : PD.state.selectedPipe.pipeName;

  // Fetch more traces (20) to increase the chance of finding diverse inputs.
  var url = "/api/projects/" +
    encodeURIComponent(PD.state.selectedPipe.projectName) +
    "/pipes/" + encodeURIComponent(pipeName) +
    "/traces?limit=20";

  m.request({ method: "GET", url: url }).then(function(data) {
    PD.state.inputHistory = PD.utils.deduplicateInputs(data);
    PD.state.inputHistoryLoading = false;
  }).catch(function() {
    PD.state.inputHistory = [];
    PD.state.inputHistoryLoading = false;
  });
};

// ── runPipeWithInput ──
// Executes a full pipe run with a custom input object. Delegates to the
// same postAction/loadDrawerTrace flow as runPipe, but includes the
// input field in the POST body.
// The /api/run endpoint passes the input string as a --input CLI argument
// to the trace.ts subprocess.
// Ref: buildandserve.ts /api/run — accepts { project, pipe, input? }
// @param {object} inputObj — the JSON object to use as pipeline input
PD.actions.runPipeWithInput = function(inputObj) {
  if (!PD.state.selectedPipe) return;

  // Transition drawer from input editor mode to normal output mode.
  PD.state.drawerMode = null;

  PD.actions.postAction("/api/run", {
    project: PD.state.selectedPipe.projectName,
    pipe: PD.state.selectedPipe.pipeName,
    input: JSON.stringify(inputObj)
  }, "Running pipe", function(output) {
    // Same completion handler as runPipe — parse JSON and load trace.
    try {
      var parsed = typeof output === "string" ? JSON.parse(output) : output;
      PD.state.drawerOutput = JSON.stringify(parsed, null, 2);
      PD.state.drawerOutputType = "json";
      PD.state.drawerParsedOutput = parsed;
    } catch (_) {
      PD.state.drawerOutput = typeof output === "string" ? output : JSON.stringify(output, null, 2);
      PD.state.drawerOutputType = "stream";
    }
    PD.actions.loadDrawerTrace();
    // Invalidate cached input history so next dropdown open fetches fresh data
    // that includes the trace from this run.
    PD.state.inputHistory = null;
    m.redraw();
  });
};

// ── runToStepWithInput ──
// Executes a partial pipe run up to a specific step with custom input.
// Same as runToStep but includes the input field in the POST body.
// Ref: buildandserve.ts /api/run-step — accepts { project, pipe, stepIndex, input? }
// @param {number} stepIndex — the step to run up to
// @param {object} inputObj — the JSON object to use as pipeline input
PD.actions.runToStepWithInput = function(stepIndex, inputObj) {
  if (!PD.state.selectedPipe) return;

  // Transition drawer from input editor mode to normal output mode.
  PD.state.drawerMode = null;

  PD.actions.postAction("/api/run-step", {
    project: PD.state.selectedPipe.projectName,
    pipe: PD.state.selectedPipe.pipeName,
    stepIndex: stepIndex,
    input: JSON.stringify(inputObj)
  }, "Running to step " + stepIndex, function(output) {
    // Same completion handler as runToStep.
    try {
      var parsed = typeof output === "string" ? JSON.parse(output) : output;
      PD.state.drawerParsedOutput = parsed;
      PD.state.drawerOutputType = "json";
    } catch (_) { /* non-JSON output — keep raw text */ }
    // Invalidate cached input history.
    PD.state.inputHistory = null;
    m.redraw();
  });
};

// ── openInputEditor ──
// Opens the RunDrawer in "input" mode — a JSON textarea where the user
// can define or edit custom input before executing. Pre-fills with the
// first item from input history (if available) or empty object.
// @param {number|null} target — null for full pipe, step index for run-to-step
PD.actions.openInputEditor = function(target) {
  PD.state.drawerMode = "input";
  PD.state.drawerInputTarget = target;
  PD.state.drawerOpen = true;
  PD.state.drawerLabel = target != null ? "Custom Input (step " + target + ")" : "Custom Input";
  PD.state.drawerStatus = "idle";
  PD.state.drawerError = null;

  // Pre-fill with the most recent non-empty input from history, or "{}".
  if (PD.state.inputHistory && PD.state.inputHistory.length > 0) {
    PD.state.drawerInputBuffer = JSON.stringify(PD.state.inputHistory[0], null, 2);
  } else {
    PD.state.drawerInputBuffer = "{\n  \n}";
  }
  m.redraw();
};

// ── executeFromDrawer ──
// Called when the user clicks "Run" in the drawer's input editor mode.
// Parses the JSON buffer and dispatches to the appropriate run action
// based on drawerInputTarget.
PD.actions.executeFromDrawer = function() {
  var json;
  try {
    json = JSON.parse(PD.state.drawerInputBuffer);
  } catch (e) {
    // Surface the parse error inline — don't close the editor.
    PD.state.drawerError = {
      status: 0,
      statusText: "Invalid JSON",
      message: e.message
    };
    m.redraw();
    return;
  }

  var target = PD.state.drawerInputTarget;
  if (target != null) {
    PD.actions.runToStepWithInput(target, json);
  } else {
    PD.actions.runPipeWithInput(json);
  }
};

// ── closeInputDropdowns ──
// Utility to close all input-related dropdowns. Called by Layout's
// click-outside handler and by dropdown item onclick handlers.
PD.actions.closeInputDropdowns = function() {
  PD.state.inputDropdownOpen = false;
  PD.state.inputDropdownStep = null;
};

// ── renderInputDropdown ──
// Shared Mithril vnode factory that builds the input history dropdown menu.
// Used by both PipeToolbar (target=null) and step toolbars (target=stepIndex).
// Returns an array of vnodes to render inside a .dropdown-menu container.
// @param {number|null} target — null for full pipe, step index for run-to-step
// @return {Array} — Mithril vnodes for dropdown items
PD.utils.renderInputDropdownItems = function(target) {
  var items = [];

  // ── "Custom Input..." option — always shown at top ──
  // Opens the JSON editor in the RunDrawer for freeform input editing.
  items.push(
    m("button.dropdown-item.input-custom-item", {
      onclick: function(e) {
        e.stopPropagation();
        PD.actions.closeInputDropdowns();
        PD.actions.loadInputHistory();
        PD.actions.openInputEditor(target);
      }
    }, [
      m("span", { style: "margin-inline-end: var(--size-1);" }, "\u270E"),
      "Custom Input\u2026"
    ])
  );

  // ── Divider ──
  items.push(m("div.dropdown-divider"));

  // ── Loading state ──
  if (PD.state.inputHistoryLoading) {
    items.push(m("div.dropdown-item.input-loading", {
      style: "color: var(--text-2); font-style: italic; cursor: default;"
    }, "Loading history\u2026"));
    return items;
  }

  // ── History items ──
  var history = PD.state.inputHistory;
  if (!history || history.length === 0) {
    items.push(m("div.dropdown-item.input-empty", {
      style: "color: var(--text-2); font-style: italic; cursor: default;"
    }, "No input history"));
    return items;
  }

  // NOTE: Mithril requires that sibling vnodes in a flat array either ALL
  // have keys or NONE have keys — mixing causes a "vnodes must either all
  // have keys or none have keys" TypeError. Since the items above (Custom
  // Input button, divider, loading/empty) are unkeyed, history items must
  // also be unkeyed. This is safe because the dropdown is destroyed and
  // recreated on every open rather than being patched incrementally.
  // Ref: https://mithril.js.org/keys.html#key-restrictions
  history.forEach(function(inputObj, i) {
    items.push(
      m("button.dropdown-item.input-history-item", {
        title: JSON.stringify(inputObj, null, 2),
        onclick: function(e) {
          e.stopPropagation();
          PD.actions.closeInputDropdowns();
          if (target != null) {
            PD.actions.runToStepWithInput(target, inputObj);
          } else {
            PD.actions.runPipeWithInput(inputObj);
          }
        }
      }, m("code.input-preview", PD.utils.inputPreview(inputObj)))
    );
  });

  return items;
};

// ── Extract Mode Actions ──
// These actions control the step-extraction workflow. The user enters extract
// mode by clicking "Extract" on any step toolbar, selects additional steps via
// checkboxes, names the new pipe, and confirms. The API creates the new .md
// file and modifies the parent.
// Ref: POST /api/extract in buildandserve.ts
// Ref: ExtractBar.js — floating action bar component

/**
 * Enter extract mode with one step pre-selected.
 *
 * Activates the extraction UI: step toolbars switch to checkbox mode and
 * the ExtractBar floating action bar appears at the bottom of the viewport.
 *
 * @param {number} stepIndex - The step index that was clicked (pre-selected)
 */
PD.actions.enterExtractMode = function(stepIndex) {
  PD.state.extractMode = true;
  PD.state.extractSelected = {};
  PD.state.extractSelected[stepIndex] = true;
  PD.state.extractName = "";
  PD.state.extracting = false;
  // Close any open dropdowns to avoid visual clutter during selection
  PD.actions.closeInputDropdowns();
  m.redraw();
};

/**
 * Exit extract mode and reset all extract-related state.
 *
 * Called when the user clicks Cancel, or after a successful extraction.
 */
PD.actions.exitExtractMode = function() {
  PD.state.extractMode = false;
  PD.state.extractSelected = {};
  PD.state.extractName = "";
  PD.state.extracting = false;
  m.redraw();
};

/**
 * Toggle a step's selection in extract mode.
 *
 * If the step is already selected, deselects it. Otherwise, selects it.
 * The step-section in MarkdownRenderer receives an `.extract-selected`
 * CSS class for visual highlighting.
 *
 * @param {number} stepIndex - The step index to toggle
 */
PD.actions.toggleExtractStep = function(stepIndex) {
  if (PD.state.extractSelected[stepIndex]) {
    delete PD.state.extractSelected[stepIndex];
  } else {
    PD.state.extractSelected[stepIndex] = true;
  }
  m.redraw();
};

/**
 * Perform the extraction: call POST /api/extract with selected steps and name.
 *
 * Validates that at least one step is selected and a name is provided.
 * On success, exits extract mode, refreshes the pipe view, and reloads
 * the recent pipes list (the new pipe should appear in the sidebar).
 */
PD.actions.performExtract = function() {
  var selected = Object.keys(PD.state.extractSelected)
    .filter(function(k) { return PD.state.extractSelected[k]; })
    .map(Number)
    .sort(function(a, b) { return a - b; });

  if (selected.length === 0) return;
  if (!PD.state.extractName.trim()) return;
  if (!PD.state.selectedPipe) return;

  PD.state.extracting = true;
  m.redraw();

  var body = {
    project: PD.state.selectedPipe.projectName,
    pipe: PD.state.selectedPipe.pipeName,
    stepIndices: selected,
    newName: PD.state.extractName.trim()
  };

  // Use postAction to route output through the drawer panel.
  // On success (onDone callback), exit extract mode and refresh everything.
  PD.actions.postAction("/api/extract", body, "Extract steps", function() {
    PD.actions.exitExtractMode();
    PD.actions.refreshPipe();
    PD.actions.loadRecentPipes();
  });
};
