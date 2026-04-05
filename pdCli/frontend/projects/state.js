// ── Projects page state, data-fetching, and navigation ──
// Initialises the per-page PD namespace with reactive state, actions for
// project/pipe browsing, and modal flows for creating new projects and pipes.
// Ref: Mithril.js state management — https://mithril.js.org/components.html

window.PD = {
  state: {
    // ── Project browsing ──
    projects: [],
    loading: true,
    searchQuery: "",
    focusedProject: null,
    focusedPipes: [],
    pipesLoading: false,
    viewingPipe: null,
    markdownHtml: null,
    markdownLoading: false,

    // ── New Project modal ──
    showNewProjectModal: false,
    newProjectName: "",
    newProjectCreating: false,
    // Global config from ~/.pipedown/config.json (loaded on modal open)
    globalConfig: null,

    // ── New Pipe modal (on focused project) ──
    showNewPipeModal: false,
    newPipeName: "",
    newPipeCreating: false
  },
  actions: {},
  utils: {},
  components: {}
};

// ── Markdown renderer ──
// Ref: markdown-it — https://github.com/markdown-it/markdown-it
// Ref: highlight.js — https://highlightjs.org/
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

// ── Search filter ──
// Matches project names, pipe names, and recent pipe names against the
// user's search query. Returns true if the project should be visible.
PD.utils.matchesSearch = function(project) {
  if (!PD.state.searchQuery) return true;
  var q = PD.state.searchQuery.toLowerCase();
  if (project.name.toLowerCase().includes(q)) return true;
  if (project.pipes && project.pipes.some(function(p) {
    return p.name.toLowerCase().includes(q);
  })) return true;
  if (project.recentPipe && project.recentPipe.toLowerCase().includes(q)) return true;
  return false;
};

// ── Sanitise name helper ──
// Converts a user-entered name into a safe directory/file name: lowercase,
// non-alphanumeric chars → hyphens, collapse consecutive hyphens, strip edges.
// Shared logic between project and pipe creation.
// Ref: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/replace
PD.utils.sanitiseName = function(name) {
  var safe = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return safe || "untitled";
};

// ── Project / Pipe Browsing Actions ──

// focusProject — select a project in the sidebar and load its pipes.
// Ref: GET /api/projects/{name}/pipes endpoint in buildandserve.ts
PD.actions.focusProject = function(project) {
  PD.state.focusedProject = project;
  PD.state.viewingPipe = null;
  PD.state.markdownHtml = null;
  PD.state.pipesLoading = true;
  PD.state.focusedPipes = [];

  // ── Persist to URL hash ──
  // Hash format: #/projectName
  // Ref: shared/hashRouter.js
  pd.hashRouter.setSegments([project.name]);

  m.request({
    method: "GET",
    url: "/api/projects/" + encodeURIComponent(project.name) + "/pipes"
  }).then(function(data) {
    PD.state.focusedPipes = data;
    PD.state.pipesLoading = false;
  }).catch(function() {
    PD.state.focusedPipes = [];
    PD.state.pipesLoading = false;
  }).then(function() { m.redraw.sync(); });
};

// viewPipe — fetch and render a pipe's markdown source.
// Ref: GET /api/projects/{name}/files/{path} in buildandserve.ts
PD.actions.viewPipe = function(pipe) {
  PD.state.viewingPipe = pipe;
  PD.state.markdownLoading = true;
  PD.state.markdownHtml = null;

  // ── Persist to URL hash ──
  // Hash format: #/projectName/pipeName
  // Ref: shared/hashRouter.js
  if (PD.state.focusedProject) {
    pd.hashRouter.setSegments([PD.state.focusedProject.name, pipe.name]);
  }

  var url = "/api/projects/" +
    encodeURIComponent(PD.state.focusedProject.name) +
    "/files/" + encodeURIComponent(pipe.path);
  m.request({
    method: "GET",
    url: url,
    extract: function(xhr) { return xhr.responseText; }
  }).then(function(raw) {
    PD.state.markdownHtml = PD.utils.mdRenderer.render(raw);
    PD.state.markdownLoading = false;
  }).catch(function() {
    PD.state.markdownHtml = null;
    PD.state.markdownLoading = false;
  }).then(function() { m.redraw.sync(); });
};

// goHome — clear all selection state to return to the project list.
PD.actions.goHome = function() {
  PD.state.focusedProject = null;
  PD.state.focusedPipes = [];
  PD.state.viewingPipe = null;
  PD.state.markdownHtml = null;
  // Clear the hash since nothing is selected
  pd.hashRouter.clear();
};

// goToProject — clear pipe selection, staying on the focused project.
PD.actions.goToProject = function() {
  PD.state.viewingPipe = null;
  PD.state.markdownHtml = null;
  // Revert hash to project-only (drop the pipe segment)
  if (PD.state.focusedProject) {
    pd.hashRouter.setSegments([PD.state.focusedProject.name]);
  }
};

// loadProjects — (re-)fetches the enriched project list from the API.
// Called on initial load (Layout oncreate) and after creating a new project.
// Ref: GET /api/projects in buildandserve.ts
PD.actions.loadProjects = function() {
  return m.request({ method: "GET", url: "/api/projects" }).then(function(data) {
    PD.state.projects = data;
    PD.state.loading = false;
  }).catch(function() {
    PD.state.projects = [];
    PD.state.loading = false;
  }).then(function() { m.redraw.sync(); });
};

// ── restoreFromHash ──
// Reads the URL hash and restores the focused project (and optionally a
// viewed pipe) from it. Called after loadProjects completes and on
// hashchange events.
//
// Hash formats:
//   #/projectName         → focus project, show pipe list
//   #/projectName/pipeName → focus project + view specific pipe
//
// @return {boolean} — true if something was restored
// Ref: shared/hashRouter.js
PD.actions.restoreFromHash = function() {
  var segments = pd.hashRouter.getSegments();
  if (segments.length === 0) return false;

  var projectName = segments[0];
  var pipeName = segments[1] || null; // optional

  // Don't re-focus if already viewing this project (avoids resetting pipes list)
  var alreadyFocused = PD.state.focusedProject &&
    PD.state.focusedProject.name === projectName;

  if (!alreadyFocused) {
    // Find the project in the loaded list
    var project = PD.state.projects.find(function(p) {
      return p.name === projectName;
    });
    if (!project) return false;

    // Focus the project — this triggers a pipe list fetch.
    // If we also need to view a pipe, we wait for the pipe list to load
    // and then select it.
    PD.actions.focusProject(project);
    // Restore the hash that focusProject just set (it only wrote project),
    // because we might need the pipe segment too.
    if (pipeName) {
      pd.hashRouter.setSegments([projectName, pipeName]);
    }
  }

  // If a pipe name was specified, select it once the pipe list is available.
  if (pipeName) {
    // The pipe list may already be loaded (if project was already focused)
    // or may still be loading (if we just called focusProject). Poll briefly.
    var attempts = 0;
    var interval = setInterval(function() {
      attempts++;
      if (!PD.state.pipesLoading || attempts > 50) {
        clearInterval(interval);
        if (!PD.state.pipesLoading) {
          // Don't re-select if already viewing this pipe
          if (PD.state.viewingPipe && PD.state.viewingPipe.name === pipeName) return;
          var pipe = PD.state.focusedPipes.find(function(p) {
            return p.name === pipeName;
          });
          if (pipe) {
            PD.actions.viewPipe(pipe);
          }
        }
      }
    }, 100);
  }

  return true;
};

// ── New Project Modal Actions ──
// These actions manage the "create new project" dialog that scaffolds a
// new project directory under the configured newProjectDir.

// openNewProjectModal — show the modal and fetch global config so we can
// display the resolved newProjectDir path.
// Ref: GET /api/config in buildandserve.ts
PD.actions.openNewProjectModal = function() {
  PD.state.showNewProjectModal = true;
  PD.state.newProjectName = "";
  PD.state.newProjectCreating = false;
  // Fetch global config to show the target directory
  m.request({ method: "GET", url: "/api/config" }).then(function(config) {
    PD.state.globalConfig = config;
  }).catch(function() {
    PD.state.globalConfig = {};
  }).then(function() { m.redraw.sync(); });
};

PD.actions.closeNewProjectModal = function() {
  PD.state.showNewProjectModal = false;
  PD.state.newProjectName = "";
  PD.state.newProjectCreating = false;
};

// createNewProject — sanitise name, POST to /api/projects, refresh list,
// and focus the newly created project.
// Ref: POST /api/projects in buildandserve.ts
PD.actions.createNewProject = function() {
  if (PD.state.newProjectCreating || !PD.state.newProjectName.trim()) return;
  PD.state.newProjectCreating = true;
  m.redraw();

  var displayName = PD.state.newProjectName.trim();

  fetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: displayName })
  }).then(function(res) {
    if (!res.ok) {
      return res.json().then(function(body) {
        throw new Error(body.error || "Create failed: " + res.statusText);
      });
    }
    return res.json();
  }).then(function(newProject) {
    PD.actions.closeNewProjectModal();
    // Reload the full project list so the new one appears in the sidebar
    PD.actions.loadProjects();
    // After a short delay (async reload), auto-focus the new project
    // Ref: setTimeout ensures we run after m.redraw from loadProjects
    setTimeout(function() {
      var match = PD.state.projects.find(function(p) {
        return p.path === newProject.path;
      });
      if (match) {
        PD.actions.focusProject(match);
      }
    }, 500);
  }).catch(function(err) {
    PD.state.newProjectCreating = false;
    // Display error inline in the modal area — keep it simple with an alert
    // since the projects page doesn't have a drawer component.
    alert(err.message || "Failed to create project");
    m.redraw();
  });
};

// ── New Pipe Modal Actions (on focused project) ──
// These actions manage creating a new pipe file within the currently
// focused project. Simpler than the home page variant because the target
// project is always the focused one — no project selector needed.

PD.actions.openNewPipeModal = function() {
  PD.state.showNewPipeModal = true;
  PD.state.newPipeName = "";
  PD.state.newPipeCreating = false;
};

PD.actions.closeNewPipeModal = function() {
  PD.state.showNewPipeModal = false;
  PD.state.newPipeName = "";
  PD.state.newPipeCreating = false;
};

// createNewPipe — sanitise name, generate template markdown, POST to
// the write endpoint, and refresh the focused project's pipe list.
// Ref: POST /api/projects/{name}/files/{path} in buildandserve.ts
PD.actions.createNewPipe = function() {
  if (PD.state.newPipeCreating || !PD.state.newPipeName.trim() || !PD.state.focusedProject) return;
  PD.state.newPipeCreating = true;
  m.redraw();

  var displayName = PD.state.newPipeName.trim();
  var safeName = PD.utils.sanitiseName(displayName);
  var fileName = safeName + ".md";

  // Build template markdown with the user's display name and two starter steps
  var template = "# " + displayName + "\n\n" +
    "Describe what this pipe does.\n\n" +
    "## Step One\n\n" +
    "Describe what this step does.\n\n" +
    "```ts\n// Your code here\n```\n\n" +
    "## Step Two\n\n" +
    "Describe what this step does.\n\n" +
    "```ts\n// Your code here\n```\n";

  var projectName = PD.state.focusedProject.name;
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
    // Refresh the focused project's pipe list so the new pipe appears
    PD.actions.focusProject(PD.state.focusedProject);
  }).catch(function(err) {
    PD.state.newPipeCreating = false;
    alert(err.message || "Failed to create pipe");
    m.redraw();
  });
};
