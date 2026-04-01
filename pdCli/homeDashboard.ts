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

// ── Pipe-Level Traces ──
// Returns the top-level input/output from the most recent trace files for a
// given pipe. Unlike recentStepTraces (which drills into a single step's
// before/after), this gives the whole-pipeline view.
// Ref: trace file schema → { input, output, durationMs, stepsTotal, … }
export async function recentPipeTraces(
  projectName: string,
  pipeName: string,
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
        input?: unknown;
        output?: unknown;
        durationMs?: number;
        stepsTotal?: number;
      };
      results.push({
        timestamp: entry.timestamp,
        input: trace.input,
        output: trace.output,
        durationMs: trace.durationMs,
        stepsTotal: trace.stepsTotal,
      });
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
  <link rel="stylesheet" href="/frontend/shared/base.css"/>
  <link rel="stylesheet" href="/frontend/shared/markdown.css"/>
  <link rel="stylesheet" href="/frontend/shared/jsonTree.css"/>
  <link rel="stylesheet" href="/frontend/shared/ansi.css"/>
  <link rel="stylesheet" href="/frontend/home/styles.css"/>
  <script src="https://unpkg.com/mithril/mithril.js"><\/script>
  <script src="https://unpkg.com/markdown-it/dist/markdown-it.min.js"><\/script>
  <link rel="stylesheet" href="https://unpkg.com/@highlightjs/cdn-assets@11.9.0/styles/github.min.css" media="(prefers-color-scheme: light)"/>
  <link rel="stylesheet" href="https://unpkg.com/@highlightjs/cdn-assets@11.9.0/styles/github-dark.min.css" media="(prefers-color-scheme: dark)"/>
  <script src="https://unpkg.com/@highlightjs/cdn-assets@11.9.0/highlight.min.js"><\/script>
  <script src="/frontend/shared/theme.js"><\/script>
</head>
<body>
  <div id="app"></div>
  <script src="/frontend/shared/jsonTree.js"><\/script>
  <script src="/frontend/shared/ansi.js"><\/script>
  <script src="/frontend/shared/relativeTime.js"><\/script>
  <script src="/frontend/home/state.js"><\/script>
  <script src="/frontend/home/components/SearchBar.js"><\/script>
  <script src="/frontend/home/components/Sidebar.js"><\/script>
  <script src="/frontend/home/components/MarkdownRenderer.js"><\/script>
  <script src="/frontend/home/components/PipeToolbar.js"><\/script>
  <script src="/frontend/home/components/MarkdownEditor.js"><\/script>
  <script src="/frontend/home/components/MainContent.js"><\/script>
  <script src="/frontend/home/components/NewPipeModal.js"><\/script>
  <script src="/frontend/home/components/ExtractBar.js"><\/script>
  <script src="/frontend/home/components/RunDrawer.js"><\/script>
  <script src="/frontend/home/components/Layout.js"><\/script>
  <script src="/frontend/home/app.js"><\/script>
</body>
</html>`;
}
