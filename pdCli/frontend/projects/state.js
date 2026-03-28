// Projects page state, data-fetching, and navigation
window.PD = {
  state: {
    projects: [],
    loading: true,
    searchQuery: "",
    focusedProject: null,
    focusedPipes: [],
    pipesLoading: false,
    viewingPipe: null,
    markdownHtml: null,
    markdownLoading: false
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

PD.actions.focusProject = function(project) {
  PD.state.focusedProject = project;
  PD.state.viewingPipe = null;
  PD.state.markdownHtml = null;
  PD.state.pipesLoading = true;
  PD.state.focusedPipes = [];
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

PD.actions.viewPipe = function(pipe) {
  PD.state.viewingPipe = pipe;
  PD.state.markdownLoading = true;
  PD.state.markdownHtml = null;
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

PD.actions.goHome = function() {
  PD.state.focusedProject = null;
  PD.state.focusedPipes = [];
  PD.state.viewingPipe = null;
  PD.state.markdownHtml = null;
};

PD.actions.goToProject = function() {
  PD.state.viewingPipe = null;
  PD.state.markdownHtml = null;
};
