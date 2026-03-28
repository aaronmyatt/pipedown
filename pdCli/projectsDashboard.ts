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

/**
 * Collect known pipe names from the .pd build directory (index.json files)
 * or from the projects.json registry as a fallback.
 * Returns null if no authoritative source is available.
 */
async function getKnownPipeNames(projectPath: string): Promise<Set<string> | null> {
  // Primary: check .pd directory for built pipes (each has an index.json)
  const pdDir = std.join(projectPath, ".pd");
  try {
    const names = new Set<string>();
    for await (const entry of std.walk(pdDir, { includeDirs: false })) {
      if (entry.name === "index.json") {
        const rel = std.relative(pdDir, entry.path);
        const dir = std.parsePath(rel).dir;
        if (dir) names.add(dir);
      }
    }
    if (names.size > 0) return names;
  } catch { /* .pd may not exist */ }

  // Fallback: check projects.json for a pipes array
  const registry = await readProjectsRegistry();
  const project = registry.find(p => p.path === projectPath);
  if (project?.pipes && project.pipes.length > 0) {
    return new Set(project.pipes.map(p => p.name));
  }

  return null;
}

export async function scanProjectPipes(projectPath: string): Promise<PipeInfo[]> {
  const knownPipes = await getKnownPipeNames(projectPath);

  const pipes: PipeInfo[] = [];
  try {
    for await (const entry of std.walk(projectPath, {
      exts: [".md"],
      skip: [SKIP_PATTERN, /README\.md$/i],
    })) {
      const rel = std.relative(projectPath, entry.path);
      const parsed = std.parsePath(rel);
      const name = parsed.dir ? std.join(parsed.dir, parsed.name) : parsed.name;
      if (knownPipes && !knownPipes.has(name)) continue;
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
  <link rel="stylesheet" href="/frontend/shared/base.css"/>
  <link rel="stylesheet" href="/frontend/shared/markdown.css"/>
  <link rel="stylesheet" href="/frontend/projects/styles.css"/>
  <script src="https://unpkg.com/mithril/mithril.js"><\/script>
  <script src="https://unpkg.com/markdown-it/dist/markdown-it.min.js"><\/script>
  <link rel="stylesheet" href="https://unpkg.com/@highlightjs/cdn-assets@11.9.0/styles/github.min.css"/>
  <script src="https://unpkg.com/@highlightjs/cdn-assets@11.9.0/highlight.min.js"><\/script>
</head>
<body>
  <div id="app"></div>
  <script src="/frontend/shared/relativeTime.js"><\/script>
  <script src="/frontend/projects/state.js"><\/script>
  <script src="/frontend/projects/components/SearchBar.js"><\/script>
  <script src="/frontend/projects/components/ProjectList.js"><\/script>
  <script src="/frontend/projects/components/FocusedProjectView.js"><\/script>
  <script src="/frontend/projects/components/MarkdownViewer.js"><\/script>
  <script src="/frontend/projects/components/Breadcrumb.js"><\/script>
  <script src="/frontend/projects/components/Layout.js"><\/script>
  <script src="/frontend/projects/app.js"><\/script>
</body>
</html>`;
}
