import { std } from "../deps.ts";

interface TraceIndexEntry {
  project: string;
  pipe: string;
  timestamp: string;
  filePath: string;
}

export async function scanTraces(): Promise<TraceIndexEntry[]> {
  const home = Deno.env.get("HOME");
  if (!home) return [];

  const traceRoot = std.join(home, ".pipedown", "traces");
  if (!await std.exists(traceRoot)) return [];

  const entries: TraceIndexEntry[] = [];
  for await (const entry of std.walk(traceRoot, { exts: [".json"] })) {
    const rel = std.relative(traceRoot, entry.path);
    const parts = rel.split("/");
    if (parts.length >= 3) {
      entries.push({
        project: parts[0],

        // TODO: consider saving traces by original pipe filename
        // (e.g. "myPipe.pd.ts") instead of the markdown h1 title/internal name
        pipe: parts.slice(1, -1).join("/"),
        timestamp: parts[parts.length - 1].replace(".json", ""),
        filePath: entry.path,
      });
    }
  }

  // ── Sort by timestamp descending (newest first) ──
  // Filenames are now Unix epoch milliseconds (e.g. "1743588527353"), so a
  // simple numeric comparison gives correct chronological ordering.
  // Falls back to localeCompare for any legacy non-numeric filenames that
  // haven't been migrated yet.
  // Ref: scripts/migrateTraceTimestamps.ts — migration tool

  return entries.toSorted((a, b) => {
    const aNum = Number(a.timestamp);
    const bNum = Number(b.timestamp);
    return bNum - aNum;
  });
}

export async function readTrace(filePath: string): Promise<unknown> {
  const content = await Deno.readTextFile(filePath);
  return JSON.parse(content);
}

export function tracePage(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Pipedown — Traces</title>
  <link rel="stylesheet" href="https://unpkg.com/open-props"/>
  <link rel="stylesheet" href="https://unpkg.com/open-props/normalize.min.css"/>
  <link rel="stylesheet" href="/frontend/shared/base.css"/>
  <link rel="stylesheet" href="/frontend/shared/jsonTree.css"/>
  <link rel="stylesheet" href="/frontend/traces/styles.css"/>
  <script src="https://unpkg.com/mithril/mithril.js"><\/script>
  <script src="/frontend/shared/theme.js"><\/script>
</head>
<body>
  <div id="app"></div>
  <script src="/frontend/shared/jsonTree.js"><\/script>
  <script src="/frontend/shared/hashRouter.js"><\/script>
  <script src="/frontend/traces/state.js"><\/script>
  <script src="/frontend/traces/components/Sidebar.js"><\/script>
  <script src="/frontend/traces/components/Detail.js"><\/script>
  <script src="/frontend/traces/components/Layout.js"><\/script>
  <script src="/frontend/traces/app.js"><\/script>
</body>
</html>`;
}
