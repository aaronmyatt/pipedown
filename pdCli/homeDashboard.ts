import { std } from "../deps.ts";
import { readProjectsRegistry, scanProjectPipes } from "./projectsDashboard.ts";
import { readTrace, scanTraces } from "./traceDashboard.ts";

export interface RecentPipe {
  projectName: string;
  projectPath: string;
  pipeName: string;
  pipePath: string;
  mtime: Date | null;
}

export async function scanRecentPipes(): Promise<RecentPipe[]> {
  const projects = await readProjectsRegistry();
  const allPipes: RecentPipe[] = [];

  // ── Build a lookup of latest trace timestamp per project+pipe ──
  // Trace files live at ~/.pipedown/traces/{project}/{pipe}/{timestamp}.json.
  // scanTraces() returns them sorted newest-first, so the first occurrence of
  // each project+pipe pair is its most recent execution time.
  // Ref: traceDashboard.ts → scanTraces()
  const traces = await scanTraces();
  const latestTraceByPipe = new Map<string, string>();
  for (const t of traces) {
    const key = `${t.project}/${t.pipe}`;
    // scanTraces is sorted descending, so the first hit per key is the latest
    if (!latestTraceByPipe.has(key)) {
      latestTraceByPipe.set(key, t.timestamp);
    }
  }

  console.log(
    "Latest trace timestamps by project/pipe:",
    Object.fromEntries(latestTraceByPipe.entries()),
  );

  for (const project of projects) {
    try {
      await Deno.stat(project.path);
    } catch {
      continue;
    }

    const pipes = await scanProjectPipes(project.path);
    for (const pipe of pipes) {
      // Determine the effective "last activity" timestamp: whichever is more
      // recent between the file's mtime (created/updated) and the latest trace
      // timestamp (last execution). This ensures a pipe that was executed
      // recently — even if its source file hasn't changed — sorts to the top.
      // ── Determine most recent activity ──
      // Trace timestamps are now epoch-millis filenames (e.g. "1743588527353")
      // while pipe mtimes are ISO strings from Deno.stat().mtime.toISOString().
      // Convert both to epoch-millis numbers for a correct comparison.
      // Ref: traceDashboard.ts → scanTraces(), projectsDashboard.ts → scanProjectPipes()
      const rawTraceTs =
        latestTraceByPipe.get(`${project.name}/${pipe.name}`) ?? "";
      // console.log(`${project.name}/${pipe.name}`, rawTraceTs, pipe.mtime);
      const rawMtime = pipe.mtime ?? "";
      const traceEpoch = Number(rawTraceTs) || new Date(rawTraceTs).getTime() ||
        0;
      const mtimeEpoch = rawMtime ? new Date(rawMtime).getTime() || 0 : 0;
      const lastActivity = traceEpoch > mtimeEpoch
        ? traceEpoch
        : mtimeEpoch || null;

      allPipes.push({
        projectName: project.name,
        projectPath: project.path,
        pipeName: pipe.name,
        pipePath: pipe.path,
        mtime: lastActivity ? new Date(lastActivity) : null,
      });
    }
  }

  // Sort by most recent activity (created, modified, or executed) descending,
  // then return only the top 10 most recently active pipes.
  // console.log("All scanned pipes with activity timestamps:", allPipes
  //   .toSorted((a, b) => (b.mtime?.getTime() || 0) - (a.mtime?.getTime() || 0))
  //   .slice(0, 10));

  return allPipes
    .toSorted((a, b) => (b.mtime?.getTime() || 0) - (a.mtime?.getTime() || 0))
    .slice(0, 50);
}

// ── scanAllPipes ──
// Returns every known pipe across all registered projects, sorted by mtime
// descending. Unlike scanRecentPipes (which factors in trace execution times
// and caps at 10), this function gives the complete, unfiltered list needed
// by the sidebar's "Projects" section to group pipes under project headings.
// Ref: readProjectsRegistry() — ~/.pipedown/projects.json
// Ref: scanProjectPipes() — walks a project dir for .md pipe files
export async function scanAllPipes(): Promise<RecentPipe[]> {
  const projects = await readProjectsRegistry();
  const allPipes: RecentPipe[] = [];

  for (const project of projects) {
    try {
      await Deno.stat(project.path);
    } catch {
      // Project directory no longer exists on disk — skip it silently.
      continue;
    }

    const pipes = await scanProjectPipes(project.path);
    for (const pipe of pipes) {
      allPipes.push({
        projectName: project.name,
        projectPath: project.path,
        pipeName: pipe.name,
        pipePath: pipe.path,
        // scanProjectPipes() returns mtime as string|null (ISO timestamp from
        // Deno.stat), but RecentPipe expects Date|null. Convert here.
        // Ref: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/Date
        mtime: pipe.mtime ? new Date(pipe.mtime) : null,
      });
    }
  }

  // Sort by file modification time descending so the sidebar shows the most
  // recently touched pipes first within each project group.
  // Use numeric epoch comparison instead of localeCompare — mtime is now a Date
  // object, so getTime() gives a reliable millisecond-precision sort key.
  // Ref: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/getTime
  allPipes.sort((a, b) =>
    (b.mtime?.getTime() || 0) - (a.mtime?.getTime() || 0)
  );
  return allPipes;
}

export async function readPipeIndex(
  projectPath: string,
  pipeName: string,
): Promise<unknown> {
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
        steps?: {
          index: number;
          before: unknown;
          after: unknown;
          delta: unknown;
          durationMs: number;
        }[];
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
  <script src="/frontend/shared/hashRouter.js"><\/script>
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
