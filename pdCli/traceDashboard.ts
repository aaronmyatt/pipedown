import { std } from "../deps.ts";

export interface TraceIndexEntry {
  project: string;
  pipe: string;
  timestamp: string;
  filePath: string;
}

/**
 * Convert a trace timestamp into a sortable millisecond value.
 *
 * Trace files now use epoch-millisecond filenames, but older traces may still
 * use ISO-8601 strings. Keeping the conversion logic here lets the rest of the
 * trace lookup code stay simple and makes the ordering rule easy to test.
 * Ref: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/getTime
 */
export function traceTimestampToMillis(timestamp: string): number {
  const numeric = Number(timestamp);
  if (Number.isFinite(numeric)) return numeric;

  const parsed = new Date(timestamp).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Sort trace index entries newest-first.
 *
 * This is factored out so both filesystem-backed scans and unit tests use the
 * same ordering rule. The newest trace is the one with the highest timestamp,
 * regardless of whether the filename is numeric or legacy ISO text.
 */
export function sortTraceIndexEntries(
  entries: TraceIndexEntry[],
): TraceIndexEntry[] {
  return entries.toSorted((a, b) =>
    traceTimestampToMillis(b.timestamp) - traceTimestampToMillis(a.timestamp)
  );
}

/**
 * Return the subset of traces for a single project/pipe pair.
 *
 * The caller can feed this either the full scan output or a small fixture in a
 * test. The `limit` is applied after sorting so callers always get the most
 * recent traces first.
 */
export function recentTracesForPipeFromEntries(
  entries: TraceIndexEntry[],
  projectName: string,
  pipeName: string,
  limit = 5,
): TraceIndexEntry[] {
  return sortTraceIndexEntries(entries)
    .filter((entry) => entry.project === projectName && entry.pipe === pipeName)
    .slice(0, limit);
}

/**
 * Return recent traces that match any of several project/pipe aliases.
 *
 * Interactive replay needs to bridge old and new naming schemes: newer trace
 * directories use `fileName`, while historical traces may still live under the
 * pipe H1/title. We therefore accept multiple aliases and prefer exact
 * project-scoped matches before falling back to any project when needed.
 *
 * @param entries - Trace index entries to search.
 * @param projectNames - Acceptable project-name aliases.
 * @param pipeNames - Acceptable pipe-name aliases.
 * @param limit - Maximum number of traces to return.
 * @returns Matching traces ordered newest-first.
 */
export function recentTracesForAliasesFromEntries(
  entries: TraceIndexEntry[],
  projectNames: string[],
  pipeNames: string[],
  limit = 5,
): TraceIndexEntry[] {
  const projects = new Set(projectNames.filter(Boolean));
  const pipes = new Set(pipeNames.filter(Boolean));
  const sorted = sortTraceIndexEntries(entries).filter((entry) => {
    if (pipes.size > 0 && !pipes.has(entry.pipe)) return false;
    if (projects.size > 0 && !projects.has(entry.project)) return false;
    return true;
  });

  // If the current project name changed since the trace was written, prefer
  // same-pipe matches from any project over showing an empty chooser.
  if (sorted.length > 0 || projects.size === 0) {
    return sorted.slice(0, limit);
  }

  return sortTraceIndexEntries(entries)
    .filter((entry) => pipes.has(entry.pipe))
    .slice(0, limit);
}

/**
 * Return the newest trace that matches any project/pipe alias.
 *
 * @param entries - Trace index entries to search.
 * @param projectNames - Acceptable project-name aliases.
 * @param pipeNames - Acceptable pipe-name aliases.
 * @returns The newest matching trace, or `null` when none exist.
 */
export function latestTraceForAliasesFromEntries(
  entries: TraceIndexEntry[],
  projectNames: string[],
  pipeNames: string[],
): TraceIndexEntry | null {
  return recentTracesForAliasesFromEntries(
    entries,
    projectNames,
    pipeNames,
    1,
  )[0] ??
    null;
}

/**
 * Return the single newest trace for a project/pipe pair.
 *
 * This is the tiny lookup used by the CLI replay flow: "what is the most
 * recent input we can safely reuse for this pipe?" If no trace exists we
 * return `null` instead of throwing, because the first interactive run should
 * simply fall back to `{}`.
 */
export function latestTraceForPipeFromEntries(
  entries: TraceIndexEntry[],
  projectName: string,
  pipeName: string,
): TraceIndexEntry | null {
  return recentTracesForPipeFromEntries(entries, projectName, pipeName, 1)[0] ??
    null;
}

/**
 * Coerce a trace field into a replayable JSON object.
 *
 * Historical traces are not fully uniform: some preserve the original payload
 * directly on `trace.input`, some wrap it under `trace.input.input`, and some
 * only retain the CLI JSON string at `trace.input.flags.input`. This helper
 * normalizes those shapes into a plain object when possible.
 * Ref: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse
 *
 * @param value - Candidate value from a trace payload.
 * @returns A plain object suitable for replay, or `null` when unusable.
 */
export function coerceReplayableInputValue(
  value: unknown,
): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value !== "string" || !value.trim()) return null;

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

/**
 * Extract a replayable input object from a trace payload.
 *
 * Trace files capture the original input plus runtime-added metadata under
 * `flags` and `mode`. Those runtime fields are useful while executing, but they
 * would leak CLI internals back into a replayed run, so we strip them here.
 *
 * We also support two older/alternate trace shapes:
 * - `trace.input.input` already contains the replayable object
 * - `trace.input.flags.input` stores the original CLI JSON string
 *
 * If the trace has no remaining user-authored fields, return `{}`.
 */
export function extractReplayableInput(
  trace: unknown,
): Record<string, unknown> {
  if (!trace || typeof trace !== "object") return {};

  const input = (trace as { input?: unknown }).input;
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};

  const inputRecord = input as Record<string, unknown>;

  // Some pipelines intentionally wrap the business payload under `input.input`.
  // When present, that nested object is the most precise replay source.
  const nestedReplayable = coerceReplayableInputValue(inputRecord.input);
  if (nestedReplayable && Object.keys(nestedReplayable).length > 0) {
    return nestedReplayable;
  }

  const replayable: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(inputRecord)) {
    if (key === "flags" || key === "mode") continue;
    replayable[key] = value;
  }

  if (Object.keys(replayable).length > 0) return replayable;

  // Older traces may have only the CLI flag mirror. If `flags.input` contains
  // a JSON object string, recover it so the interactive chooser can still reuse
  // the original run input.
  const flagsRecord = inputRecord.flags;
  if (
    flagsRecord && typeof flagsRecord === "object" &&
    !Array.isArray(flagsRecord)
  ) {
    const fromFlag = coerceReplayableInputValue(
      (flagsRecord as Record<string, unknown>).input,
    );
    if (fromFlag && Object.keys(fromFlag).length > 0) {
      return fromFlag;
    }
  }

  return {};
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

        // The directory layout mirrors the project name and the pipe identity
        // used by the build pipeline. Keeping the raw path segment here avoids
        // guessing at old H1-based names later.
        pipe: parts.slice(1, -1).join("/"),
        timestamp: parts[parts.length - 1].replace(".json", ""),
        filePath: entry.path,
      });
    }
  }

  return sortTraceIndexEntries(entries);
}

export async function latestTraceForPipe(
  projectName: string,
  pipeName: string,
): Promise<TraceIndexEntry | null> {
  const traces = await scanTraces();
  return latestTraceForPipeFromEntries(traces, projectName, pipeName);
}

/**
 * Find the newest trace using project and pipe aliases.
 *
 * @param projectNames - Acceptable project-name aliases.
 * @param pipeNames - Acceptable pipe-name aliases.
 * @returns The newest matching trace, or `null`.
 */
export async function latestTraceForAliases(
  projectNames: string[],
  pipeNames: string[],
): Promise<TraceIndexEntry | null> {
  const traces = await scanTraces();
  return latestTraceForAliasesFromEntries(traces, projectNames, pipeNames);
}

export async function recentTracesForPipe(
  projectName: string,
  pipeName: string,
  limit = 5,
): Promise<TraceIndexEntry[]> {
  const traces = await scanTraces();
  return recentTracesForPipeFromEntries(traces, projectName, pipeName, limit);
}

/**
 * Find recent traces using project and pipe aliases.
 *
 * @param projectNames - Acceptable project-name aliases.
 * @param pipeNames - Acceptable pipe-name aliases.
 * @param limit - Maximum number of traces to return.
 * @returns Matching traces ordered newest-first.
 */
export async function recentTracesForAliases(
  projectNames: string[],
  pipeNames: string[],
  limit = 5,
): Promise<TraceIndexEntry[]> {
  const traces = await scanTraces();
  return recentTracesForAliasesFromEntries(
    traces,
    projectNames,
    pipeNames,
    limit,
  );
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
