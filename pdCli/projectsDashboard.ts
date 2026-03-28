import { std } from "../deps.ts";

interface ProjectEntry {
  name: string;
  path: string;
  pipes?: { name: string; path: string }[];
}

interface EnrichedProject extends ProjectEntry {
  exists: boolean;
  mtime: string | null;
  pipeCount: number;
  recentPipe?: string;
}

interface PipeInfo {
  name: string;
  path: string;
  mtime: string | null;
}

const SKIP_PATTERN = /node_modules|\.pd|\.git|\.vscode|\.github|\.cache|deno\.lock/;

export async function readProjectsRegistry(): Promise<ProjectEntry[]> {
  const home = Deno.env.get("HOME");
  if (!home) return [];

  const projectsPath = std.join(home, ".pipedown", "projects.json");
  try {
    const raw = await Deno.readTextFile(projectsPath);
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function scanProjectPipes(projectPath: string): Promise<PipeInfo[]> {
  const pipes: PipeInfo[] = [];
  try {
    for await (const entry of std.walk(projectPath, {
      exts: [".md"],
      skip: [SKIP_PATTERN, /README\.md$/i],
    })) {
      const rel = std.relative(projectPath, entry.path);
      const name = std.parsePath(rel).name;
      let mtime: string | null = null;
      try {
        const stat = await Deno.stat(entry.path);
        mtime = stat.mtime?.toISOString() || null;
      } catch { /* ignore */ }
      pipes.push({ name, path: rel, mtime });
    }
  } catch { /* directory may not exist */ }

  pipes.sort((a, b) => (b.mtime || "").localeCompare(a.mtime || ""));
  return pipes;
}

export async function enrichProjects(projects: ProjectEntry[]): Promise<EnrichedProject[]> {
  const enriched: EnrichedProject[] = [];

  for (const project of projects) {
    try {
      await Deno.stat(project.path);
    } catch {
      enriched.push({
        ...project,
        exists: false,
        mtime: null,
        pipeCount: 0,
      });
      continue;
    }

    const pipes = await scanProjectPipes(project.path);
    const latestMtime = pipes.length > 0 ? pipes[0].mtime : null;
    const recentPipe = pipes.length > 0 ? pipes[0].name : undefined;

    enriched.push({
      ...project,
      exists: true,
      mtime: latestMtime,
      pipeCount: pipes.length,
      recentPipe,
    });
  }

  enriched.sort((a, b) => {
    if (!a.exists && b.exists) return 1;
    if (a.exists && !b.exists) return -1;
    return (b.mtime || "").localeCompare(a.mtime || "");
  });

  return enriched;
}

export async function readPipeMarkdown(projectPath: string, pipePath: string): Promise<string> {
  const absPath = std.join(projectPath, pipePath);
  const rel = std.relative(projectPath, absPath);
  if (rel.startsWith("..")) {
    throw new Error("Path traversal not allowed");
  }
  return await Deno.readTextFile(absPath);
}

export function projectsPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Pipedown — Projects</title>
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
      grid-template-rows: auto auto 1fr;
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
    .breadcrumb {
      grid-column: 1 / -1;
      display: flex;
      align-items: center;
      gap: var(--size-1);
      padding: var(--size-1) var(--size-4);
      background: var(--surface-2);
      border-block-end: var(--border-size-1) solid var(--surface-3);
      font-size: var(--font-size-1);
      color: var(--text-2);
    }
    .breadcrumb a {
      color: var(--link);
      text-decoration: none;
      cursor: pointer;
    }
    .breadcrumb a:hover { text-decoration: underline; }
    .breadcrumb .sep { margin: 0 var(--size-1); color: var(--text-2); }
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
    .project-card {
      padding: var(--size-2) var(--size-2);
      border-radius: var(--radius-2);
      margin-block-end: var(--size-1);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: var(--size-2);
    }
    .project-card:hover { background: var(--surface-3); }
    .project-card.active { background: var(--surface-4); }
    .project-card.stale { opacity: 0.5; }
    .project-card .caret {
      font-size: var(--font-size-2);
      color: var(--text-2);
      flex-shrink: 0;
      transition: transform 0.15s;
    }
    .project-card.active .caret { transform: rotate(90deg); }
    .project-info { flex: 1; min-width: 0; }
    .project-name {
      font-weight: var(--font-weight-6);
      font-size: var(--font-size-1);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .project-meta {
      display: flex;
      gap: var(--size-2);
      margin-top: var(--size-1);
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
    .badge-recent {
      background: var(--green-2);
      color: var(--green-9);
    }
    .detail {
      padding: var(--size-4);
      overflow: auto;
      min-width: 0;
    }
    .pipe-list { list-style: none; padding: 0; margin: 0; }
    .pipe-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--size-2) var(--size-3);
      border-radius: var(--radius-2);
      cursor: pointer;
      border-block-end: var(--border-size-1) solid var(--surface-2);
    }
    .pipe-item:hover { background: var(--surface-2); }
    .pipe-item.active { background: var(--surface-3); }
    .pipe-item-name {
      font-family: var(--font-mono);
      font-size: var(--font-size-1);
    }
    .pipe-item-path {
      font-size: var(--font-size-0);
      color: var(--text-2);
    }
    .pipe-item-mtime {
      font-size: var(--font-size-0);
      color: var(--text-2);
      font-family: var(--font-mono);
      white-space: nowrap;
    }
    .md-viewer {
      max-width: 80ch;
      line-height: 1.7;
      font-size: var(--font-size-1);
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
    .md-viewer table {
      border-collapse: collapse;
      width: 100%;
      margin: var(--size-3) 0;
    }
    .md-viewer th, .md-viewer td {
      border: var(--border-size-1) solid var(--surface-3);
      padding: var(--size-1) var(--size-2);
      text-align: left;
    }
    .md-viewer th { background: var(--surface-2); font-weight: var(--font-weight-6); }
    .md-viewer a { color: var(--link); }
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
    .project-heading {
      display: flex;
      align-items: baseline;
      gap: var(--size-2);
      margin-block-end: var(--size-3);
    }
    .project-heading h2 { margin: 0; font-size: var(--font-size-4); }
    .project-heading .path {
      font-size: var(--font-size-0);
      color: var(--text-2);
      font-family: var(--font-mono);
    }
  </style>
</head>
<body>
  <div id="app"></div>
  <script>
  (function() {
    var state = {
      projects: [],
      loading: true,
      searchQuery: "",
      focusedProject: null,
      focusedPipes: [],
      pipesLoading: false,
      viewingPipe: null,
      markdownHtml: null,
      markdownLoading: false
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

    function matchesSearch(project) {
      if (!state.searchQuery) return true;
      var q = state.searchQuery.toLowerCase();
      if (project.name.toLowerCase().includes(q)) return true;
      if (project.pipes && project.pipes.some(function(p) {
        return p.name.toLowerCase().includes(q);
      })) return true;
      if (project.recentPipe && project.recentPipe.toLowerCase().includes(q)) return true;
      return false;
    }

    function focusProject(project) {
      state.focusedProject = project;
      state.viewingPipe = null;
      state.markdownHtml = null;
      state.pipesLoading = true;
      state.focusedPipes = [];
      m.request({
        method: "GET",
        url: "/api/projects/" + encodeURIComponent(project.name) + "/pipes"
      }).then(function(data) {
        state.focusedPipes = data;
        state.pipesLoading = false;
      }).catch(function() {
        state.focusedPipes = [];
        state.pipesLoading = false;
      });
    }

    function viewPipe(pipe) {
      state.viewingPipe = pipe;
      state.markdownLoading = true;
      state.markdownHtml = null;
      var url = "/api/projects/" +
        encodeURIComponent(state.focusedProject.name) +
        "/files/" + encodeURIComponent(pipe.path);
      m.request({
        method: "GET",
        url: url,
        extract: function(xhr) { return xhr.responseText; }
      }).then(function(raw) {
        state.markdownHtml = mdRenderer.render(raw);
        state.markdownLoading = false;
      }).catch(function() {
        state.markdownHtml = null;
        state.markdownLoading = false;
      });
    }

    function goHome() {
      state.focusedProject = null;
      state.focusedPipes = [];
      state.viewingPipe = null;
      state.markdownHtml = null;
    }

    function goToProject() {
      state.viewingPipe = null;
      state.markdownHtml = null;
    }

    var SearchBar = {
      view: function() {
        return m("input.search-input", {
          type: "text",
          placeholder: "Search projects and pipes...",
          value: state.searchQuery,
          oninput: function(e) { state.searchQuery = e.target.value; }
        });
      }
    };

    var ProjectList = {
      oninit: function() {
        m.request({ method: "GET", url: "/api/projects" }).then(function(data) {
          state.projects = data;
          state.loading = false;
        }).catch(function() {
          state.projects = [];
          state.loading = false;
        });
      },
      view: function() {
        if (state.loading) {
          return m("div.sidebar", m("p", { style: "color: var(--text-2)" }, "Loading projects..."));
        }
        var filtered = state.projects.filter(matchesSearch);
        if (filtered.length === 0) {
          return m("div.sidebar", [
            m(SearchBar),
            m("p", { style: "color: var(--text-2); font-size: var(--font-size-1)" },
              state.searchQuery ? "No matching projects." : "No projects registered yet.")
          ]);
        }
        return m("div.sidebar", [
          m(SearchBar),
          filtered.map(function(project, i) {
            var isActive = state.focusedProject && state.focusedProject.name === project.name &&
              state.focusedProject.path === project.path;
            var cls = ".project-card" + (isActive ? ".active" : "") + (!project.exists ? ".stale" : "");
            return m("div" + cls, {
              onclick: function() {
                if (project.exists) focusProject(project);
              }
            }, [
              m("span.caret", "\\u203A"),
              m("div.project-info", [
                m("div.project-name", [
                  project.name,
                  !project.exists ? m("span", { style: "color: var(--text-2); font-weight: normal; margin-left: var(--size-1)" }, "(not found)") : null
                ]),
                m("div.project-meta", [
                  project.pipeCount > 0 ? m("span.badge", project.pipeCount + " pipes") : null,
                  project.mtime ? m("span.badge" + (i === 0 ? ".badge-recent" : ""), relativeTime(project.mtime)) : null
                ])
              ])
            ]);
          })
        ]);
      }
    };

    var FocusedProjectView = {
      view: function() {
        if (!state.focusedProject) {
          return m("div.detail", m("div.empty-state", [
            m("p", "Select a project to explore")
          ]));
        }
        if (state.pipesLoading) {
          return m("div.detail", m("p", "Loading pipes..."));
        }
        var pipes = state.focusedPipes;
        if (state.searchQuery) {
          var q = state.searchQuery.toLowerCase();
          pipes = pipes.filter(function(p) {
            return p.name.toLowerCase().includes(q) || p.path.toLowerCase().includes(q);
          });
        }
        return m("div.detail", [
          m("div.project-heading", [
            m("h2", state.focusedProject.name),
            m("span.path", state.focusedProject.path)
          ]),
          pipes.length === 0
            ? m("p", { style: "color: var(--text-2)" }, "No markdown pipes found in this project.")
            : m("ul.pipe-list", pipes.map(function(pipe) {
                return m("li.pipe-item", {
                  onclick: function() { viewPipe(pipe); }
                }, [
                  m("div", [
                    m("div.pipe-item-name", pipe.name),
                    m("div.pipe-item-path", pipe.path)
                  ]),
                  pipe.mtime ? m("span.pipe-item-mtime", relativeTime(pipe.mtime)) : null
                ]);
              }))
        ]);
      }
    };

    var MarkdownViewer = {
      view: function() {
        if (state.markdownLoading) {
          return m("div.detail", m("p", "Loading markdown..."));
        }
        if (!state.markdownHtml) {
          return m("div.detail", m("p", "Failed to load file."));
        }
        return m("div.detail",
          m("div.md-viewer", m.trust(state.markdownHtml))
        );
      }
    };

    var Breadcrumb = {
      view: function() {
        var items = [
          m("a", { onclick: goHome }, "Projects")
        ];
        if (state.focusedProject) {
          items.push(m("span.sep", "\\u203A"));
          if (state.viewingPipe) {
            items.push(m("a", { onclick: goToProject }, state.focusedProject.name));
          } else {
            items.push(m("span", state.focusedProject.name));
          }
        }
        if (state.viewingPipe) {
          items.push(m("span.sep", "\\u203A"));
          items.push(m("span", state.viewingPipe.name));
        }
        return m("div.breadcrumb", items);
      }
    };

    var Layout = {
      view: function() {
        return m("div.layout", [
          m("div.topbar", [
            m("h1", "Pipedown"),
            m("a", { href: "/" }, "Services"),
            m("a", { href: "/traces" }, "Traces")
          ]),
          m(Breadcrumb),
          m(ProjectList),
          state.viewingPipe ? m(MarkdownViewer) : m(FocusedProjectView)
        ]);
      }
    };

    m.mount(document.getElementById("app"), Layout);
  })();
  </script>
</body>
</html>`;
}
