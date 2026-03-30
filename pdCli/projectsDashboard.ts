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

// ── Global Config ──
// The global config lives at ~/.pipedown/config.json and stores user-wide
// settings such as `newProjectDir` — the directory where new projects are
// scaffolded from the dashboard.
// Ref: https://docs.deno.com/api/deno/~/Deno.readTextFile

/** Shape of ~/.pipedown/config.json */
export interface GlobalConfig {
  /** Absolute path to the directory where new projects are created.
   *  Defaults to $HOME/pipes when absent. */
  newProjectDir?: string;
}

/**
 * Reads ~/.pipedown/config.json. Returns an empty object if the file
 * does not exist or contains invalid JSON — this makes the config
 * entirely optional; the dashboard will fall back to sensible defaults.
 */
export async function readGlobalConfig(): Promise<GlobalConfig> {
  const home = Deno.env.get("HOME");
  if (!home) return {};
  const configPath = std.join(home, ".pipedown", "config.json");
  try {
    const raw = await Deno.readTextFile(configPath);
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * Persists the global config to ~/.pipedown/config.json, creating the
 * directory if it doesn't exist yet. Merges `patch` into the existing
 * config so callers only need to supply the fields they want to change.
 *
 * @param patch - Partial config to merge (e.g. `{ newProjectDir: "/…" }`)
 * @returns The merged config that was written to disk
 * Ref: https://docs.deno.com/api/deno/~/Deno.writeTextFile
 */
export async function writeGlobalConfig(patch: Partial<GlobalConfig>): Promise<GlobalConfig> {
  const home = Deno.env.get("HOME");
  if (!home) throw new Error("HOME not set");
  const pipedownDir = std.join(home, ".pipedown");
  await Deno.mkdir(pipedownDir, { recursive: true });

  // Merge with existing config to avoid clobbering other fields
  const existing = await readGlobalConfig();
  const merged = { ...existing, ...patch };

  const configPath = std.join(pipedownDir, "config.json");
  await Deno.writeTextFile(configPath, JSON.stringify(merged, null, 2));
  return merged;
}

/**
 * Returns the resolved newProjectDir — either the user-configured value
 * from config.json or the default `$HOME/pipes`.
 */
export async function resolveNewProjectDir(): Promise<string> {
  const home = Deno.env.get("HOME") || "/tmp";
  const config = await readGlobalConfig();
  return config.newProjectDir || std.join(home, "pipes");
}

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
      // The build system strips hyphens from pipe names (e.g. "fetch-data" →
      // "fetchdata" in .pd/). Normalise both sides so the comparison matches.
      // Ref: pdBuild.ts pipe name normalisation
      if (knownPipes && !knownPipes.has(name)) {
        const normalised = name.replace(/-/g, "").toLowerCase();
        const match = [...knownPipes].some(k => k.replace(/-/g, "").toLowerCase() === normalised);
        if (!match) continue;
      }
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

// ── Project Creation ──
// Creates a new project directory with a minimal deno.json scaffold and
// registers it in ~/.pipedown/projects.json so it appears immediately
// in the dashboard sidebar.

/**
 * Sanitise a user-entered project name into a safe directory name.
 * Same rules as pipe names: lowercase, non-alnum → hyphens, collapse,
 * strip leading/trailing hyphens.
 *
 * @param name - Raw user input (e.g. "My Cool Project")
 * @returns Safe directory name (e.g. "my-cool-project")
 * Ref: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/replace
 */
function sanitiseProjectName(name: string): string {
  let safe = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!safe) safe = "new-project";
  return safe;
}

/**
 * Creates a new project on disk and registers it in the global registry.
 *
 * @param displayName - Human-readable project name (e.g. "My Cool Project")
 * @returns The new project entry `{ name, path }`
 * @throws If the project directory already exists (409 Conflict from caller)
 * Ref: https://docs.deno.com/api/deno/~/Deno.mkdir
 */
export async function createProject(displayName: string): Promise<ProjectEntry> {
  const home = Deno.env.get("HOME");
  if (!home) throw new Error("HOME not set");

  const safeName = sanitiseProjectName(displayName);
  const baseDir = await resolveNewProjectDir();
  const projectPath = std.join(baseDir, safeName);

  // Check if directory already exists — callers treat this as a 409 Conflict
  try {
    await Deno.stat(projectPath);
    throw new Error("ALREADY_EXISTS");
  } catch (e) {
    if ((e as Error).message === "ALREADY_EXISTS") throw e;
    // Deno.errors.NotFound is expected — the directory doesn't exist yet
  }

  // Create the project directory and any missing parents (e.g. if
  // newProjectDir itself doesn't exist yet).
  // Ref: https://docs.deno.com/api/deno/~/Deno.mkdir
  await Deno.mkdir(projectPath, { recursive: true });

  // Scaffold a minimal deno.json so `pd build` recognises this as a
  // pipedown project. The "pipedown.name" field gives the project a
  // human-readable display name in the dashboard.
  // Ref: https://docs.deno.com/runtime/fundamentals/configuration/
  const denoJson = {
    pipedown: { name: displayName },
  };
  await Deno.writeTextFile(
    std.join(projectPath, "deno.json"),
    JSON.stringify(denoJson, null, 2),
  );

  // Register in ~/.pipedown/projects.json so the dashboard sees it
  const pipedownDir = std.join(home, ".pipedown");
  await Deno.mkdir(pipedownDir, { recursive: true });
  const projectsPath = std.join(pipedownDir, "projects.json");

  let projects: ProjectEntry[] = [];
  try {
    projects = JSON.parse(await Deno.readTextFile(projectsPath));
  } catch { /* first project */ }

  const entry: ProjectEntry = { name: displayName, path: projectPath };
  // Guard against duplicate paths (shouldn't happen after the stat check,
  // but defensive coding against concurrent requests)
  if (!projects.some(p => p.path === projectPath)) {
    projects.push(entry);
    await Deno.writeTextFile(projectsPath, JSON.stringify(projects, null, 2));
  }

  return entry;
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
  <link rel="stylesheet" href="https://unpkg.com/@highlightjs/cdn-assets@11.9.0/styles/github.min.css" media="(prefers-color-scheme: light)"/>
  <link rel="stylesheet" href="https://unpkg.com/@highlightjs/cdn-assets@11.9.0/styles/github-dark.min.css" media="(prefers-color-scheme: dark)"/>
  <script src="https://unpkg.com/@highlightjs/cdn-assets@11.9.0/highlight.min.js"><\/script>
  <script src="/frontend/shared/theme.js"><\/script>
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
  <script src="/frontend/projects/components/NewProjectModal.js"><\/script>
  <script src="/frontend/projects/components/NewPipeModal.js"><\/script>
  <script src="/frontend/projects/components/Layout.js"><\/script>
  <script src="/frontend/projects/app.js"><\/script>
</body>
</html>`;
}
