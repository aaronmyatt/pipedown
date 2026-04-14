import { std } from "../deps.ts";
import { fileName } from "../pdUtils.ts";

export interface InteractivePipeRef {
  path: string;
  name: string;
}

export interface InteractiveTarget {
  /**
   * Relative markdown path chosen by the user. We keep the original path
   * around so the watcher can target the same file the build system will scan.
   */
  path: string;
  /**
   * Sanitized pipe identity used by .pd output directories and trace lookup.
   * Ref: pdUtils.fileName() and templates/trace.ts
   */
  pipeName: string;
}

export interface ReplayableInputChoice {
  label: string;
  timestamp: string;
  input: Record<string, unknown>;
}

/**
 * Stable footer copy for the interactive CLI.
 *
 * Keeping the exact text in one place ensures the rendered footer and the unit
 * tests stay aligned as the hotkey surface evolves.
 */
export const INTERACTIVE_COMMANDS_FOOTER =
  "Commands: r rerun, i edit input, s choose past input, e edit pipe, t latest trace, q quit";

/**
 * Escape a literal string for use inside a regular expression.
 *
 * `pdBuild()` builds a `RegExp` from the `match` string, so we must escape the
 * active pipe path before handing it over or the watcher would match too many
 * files.
 */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Resolve the interactive target from a requested file path.
 *
 * We intentionally accept either the exact relative path or just the basename
 * so the command feels natural from the repository root.
 */
export function resolveInteractiveTarget(
  requested: string,
  projectPipes: InteractivePipeRef[],
): InteractiveTarget | null {
  const normalizedRequested = requested.trim().replace(/^\.\//, "");
  if (!normalizedRequested) return null;

  const requestedStem = std.basename(normalizedRequested).replace(/\.md$/, "");

  const match = projectPipes.find((pipe) => {
    const normalizedPath = pipe.path.replace(/^\.\//, "");
    const normalizedStem = pipe.name.replace(/\.md$/, "");
    return normalizedPath === normalizedRequested ||
      normalizedPath.endsWith(`/${normalizedRequested}`) ||
      normalizedStem === requestedStem;
  });

  if (!match) return null;

  return {
    path: match.path,
    pipeName: fileName(match.path),
  };
}

/**
 * Convert a replayable input object into a stable dedupe key.
 *
 * We serialize the replay input once and reuse the exact representation for
 * deduping and default-option lookup so the selector behaves consistently.
 * Ref: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify
 */
export function replayableInputKey(input: Record<string, unknown>): string {
  return JSON.stringify(input);
}

/**
 * Deduplicate replay choices while preserving most-recent-first order.
 *
 * Two trace records that replay to the same JSON input are effectively the same
 * choice, so we keep the first one and drop later duplicates.
 */
export function dedupeReplayableInputs<T extends ReplayableInputChoice>(
  choices: T[],
): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];

  for (const choice of choices) {
    const key = replayableInputKey(choice.input);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(choice);
  }

  return deduped;
}

/**
 * Find the replay choice whose JSON payload matches a preferred input object.
 *
 * Cliffy's Select prompt uses strict reference equality for its `default`
 * option, so we locate the existing choice object first instead of passing a
 * freshly created input object.
 * Ref: https://cliffy.io/docs/v1.0.0-rc.3/prompt
 */
export function findReplayableInputChoice<T extends ReplayableInputChoice>(
  choices: T[],
  preferredInput: Record<string, unknown> | null,
): T | null {
  if (!preferredInput || Object.keys(preferredInput).length === 0) return null;

  const preferredKey = replayableInputKey(preferredInput);
  return choices.find((choice) =>
    replayableInputKey(choice.input) === preferredKey
  ) ??
    null;
}

/**
 * Map a raw keypress into one of the supported interactive hotkeys.
 *
 * The top-level loop should react instantly to single-key commands. Enter is a
 * convenience alias for rerun, and Ctrl+C maps to quit so the workflow still
 * feels like a normal terminal program.
 * Ref: https://cliffy.io/docs/v1.0.0-rc.4/keypress
 */
export function normalizeInteractiveAction(
  key: string | undefined,
  ctrlKey = false,
): string | null {
  if (!key) return null;

  if (ctrlKey && key.toLowerCase() === "c") return "q";
  if (key === "enter" || key === "return") return "r";

  const normalized = key.toLowerCase();
  return ["r", "i", "s", "e", "t", "q"].includes(normalized)
    ? normalized
    : null;
}

/**
 * Check whether a filesystem event touches the markdown file being watched.
 *
 * Watching the parent directory is more reliable than watching the file itself
 * because many editors save via atomic rename. We therefore compare each event
 * path against the target's absolute path and basename.
 * Ref: https://docs.deno.com/api/deno/~/Deno.watchFs
 *
 * @param targetPath - Absolute path to the markdown file being iterated on.
 * @param eventPaths - Raw paths emitted by `Deno.watchFs()`.
 * @returns `true` when the event should trigger a rerun.
 */
export function eventTouchesInteractiveTarget(
  targetPath: string,
  eventPaths: string[],
): boolean {
  const targetDir = std.dirname(targetPath);
  const targetBase = std.basename(targetPath);

  return eventPaths.some((eventPath) => {
    const absoluteEventPath = toAbsoluteInteractivePath(eventPath);
    return absoluteEventPath === targetPath ||
      (std.dirname(absoluteEventPath) === targetDir &&
        std.basename(absoluteEventPath) === targetBase);
  });
}

/**
 * Convert a CLI-relative project path into an absolute filesystem path.
 *
 * The lightweight `std` bundle used by Pipedown does not re-export
 * `@std/path/resolve`, so we keep this tiny absolute-path helper local to the
 * interactive workflow.
 *
 * @param path - Relative or absolute filesystem path.
 * @returns Absolute path rooted at the current working directory.
 */
export function toAbsoluteInteractivePath(path: string): string {
  return path.startsWith("/")
    ? path
    : std.join(Deno.cwd(), path.replace(/^\.\//, ""));
}
