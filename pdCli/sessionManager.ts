/**
 * sessionManager.ts — Session CRUD, execution, and persistence for run sessions.
 *
 * A "run session" is the core primitive that makes incremental execution,
 * partial runs, and "rerun from here" first-class operations. Each session
 * is a persisted JSON file under `.pd/<pipe>/sessions/<sessionId>.json`.
 *
 * Key responsibilities:
 *   1. Create RunSession objects from pipe metadata
 *   2. Persist / read / list sessions on disk
 *   3. Execute sessions (full, to_step, from_step, single_step, continue)
 *   4. Capture per-step before/after snapshots and compute deltas
 *   5. Update session and step statuses throughout execution
 *
 * Ref: WEB_FIRST_WORKFLOW_PLAN.md §4.1-E (RunSession type)
 * Ref: WEB_FIRST_WORKFLOW_PLAN.md §8 (Execution and Session Model)
 * Ref: pipedown.d.ts — RunSession, SessionStepRecord, SessionMode, etc.
 *
 * Run tests with:
 *   ~/.deno/bin/deno test --no-check -A session_test.ts
 */

import { std } from "../deps.ts";
import type {
  RunSession,
  SessionStepRecord,
  SessionMode,
  SessionStatus,
  StepStatus,
  Pipe,
  Input,
} from "../pipedown.d.ts";

// ── Snapshot & Delta Utilities ──
// These are extracted from templates/trace.ts. We duplicate rather than
// import from templates/ because those files are user-facing templates
// with relative imports (e.g. `import pipe from "./index.ts"`) that
// would break if imported from a different directory.
//
// Ref: templates/trace.ts — safeSnapshot, computeDelta patterns

// ── SanitizeOptions ──
// Controls how large string values are truncated in snapshots.
// Keeps snapshots a manageable size without losing important data.

/** @internal Configuration for snapshot value sanitization */
interface SanitizeOptions {
  /** Maximum length for regular string values before truncation */
  maxStringLength: number;
  /** Maximum length before base64 detection kicks in */
  maxBase64Length: number;
}

/** Sensible defaults — 1KB strings, 128 chars for base64 detection */
const DEFAULT_SANITIZE: SanitizeOptions = {
  maxStringLength: 1024,
  maxBase64Length: 128,
};

/**
 * Recursively sanitizes a value for safe JSON snapshot storage.
 *
 * Handles three categories of problematic values:
 *   1. Data URIs (data:image/png;base64,...) — replaced with a summary
 *   2. Raw base64 blobs — detected by character distribution heuristic
 *   3. Long strings — truncated with a character-count note
 *
 * Arrays and objects are traversed recursively.
 *
 * @param value - Any JSON-serializable value to sanitize
 * @param opts  - Truncation thresholds
 * @returns Sanitized copy of the value
 *
 * Ref: https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/Data_URLs
 */
function sanitizeValue(
  value: unknown,
  opts: SanitizeOptions = DEFAULT_SANITIZE,
): unknown {
  if (typeof value === "string") {
    // Detect data URIs (images, fonts, etc.)
    if (/^data:[^;]+;base64,/.test(value)) {
      const mimeMatch = value.match(/^data:([^;]+);base64,/);
      const mime = mimeMatch?.[1] ?? "unknown";
      return `[base64 ${mime}: ${value.length.toLocaleString()} chars]`;
    }

    // Detect raw base64 blobs (>80% base64-alphabet chars and long)
    if (value.length > opts.maxBase64Length) {
      const b64Chars = value.replace(/[^A-Za-z0-9+/=]/g, "").length;
      if (b64Chars / value.length > 0.8) {
        return `[base64-like data: ${value.length.toLocaleString()} chars]`;
      }
    }

    // Truncate long strings
    if (value.length > opts.maxStringLength) {
      const removed = value.length - opts.maxStringLength;
      return value.slice(0, opts.maxStringLength) +
        `... [truncated: ${removed.toLocaleString()} chars removed]`;
    }

    return value;
  }

  if (Array.isArray(value)) {
    return value.map((v) => sanitizeValue(v, opts));
  }

  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (
      const [k, v] of Object.entries(value as Record<string, unknown>)
    ) {
      result[k] = sanitizeValue(v, opts);
    }
    return result;
  }

  return value;
}

/**
 * Creates a safe, JSON-serializable snapshot of the input object.
 *
 * Non-cloneable values (Request, Response, Event) are replaced with
 * type placeholders. All other values are deep-cloned via structuredClone
 * and then sanitized (truncated/summarized).
 *
 * @param input   - The pipeline input object to snapshot
 * @param exclude - Keys to replace with type placeholders (default: request, response, event)
 * @param sanitizeOpts - Truncation thresholds
 * @returns A plain object safe for JSON.stringify
 *
 * Ref: https://developer.mozilla.org/en-US/docs/Web/API/structuredClone
 */
export function safeSnapshot(
  input: Record<string, unknown>,
  exclude: string[] = ["request", "response", "event"],
  sanitizeOpts: SanitizeOptions = DEFAULT_SANITIZE,
): Record<string, unknown> {
  const snap: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (exclude.includes(key)) {
      snap[key] = `[${typeof value}]`;
      continue;
    }
    try {
      snap[key] = sanitizeValue(structuredClone(value), sanitizeOpts);
    } catch {
      snap[key] = `[non-cloneable: ${typeof value}]`;
    }
  }
  return snap;
}

/**
 * Computes a key-level diff between two snapshots.
 *
 * Compares top-level keys of `before` and `after` to produce:
 * - `added`    — keys present in `after` but not `before`
 * - `modified` — keys present in both but with different JSON representations
 * - `removed`  — keys present in `before` but not `after`
 *
 * Deep comparison uses JSON.stringify for simplicity — this is sufficient
 * for session diffs where we want to highlight which top-level fields changed.
 *
 * @param before - Snapshot taken before step execution
 * @param after  - Snapshot taken after step execution
 * @returns Object with added/modified/removed string arrays
 */
export function computeDelta(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): { added: string[]; modified: string[]; removed: string[] } {
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const added: string[] = [];
  const modified: string[] = [];
  const removed: string[] = [];
  for (const key of allKeys) {
    if (!(key in before)) added.push(key);
    else if (!(key in after)) removed.push(key);
    else if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      modified.push(key);
    }
  }
  return { added, modified, removed };
}

// ── Session Directory Helpers ──
// Sessions live under `.pd/<pipeName>/sessions/` within the project directory.
// Each session is a JSON file named `<sessionId>.json`.

/**
 * Returns the absolute path to the sessions directory for a given pipe.
 *
 * @param projectPath - Absolute path to the project root
 * @param pipeName    - Name of the pipe (matches .pd/<pipeName>/)
 * @returns Absolute path like `/path/to/project/.pd/myPipe/sessions/`
 */
function sessionsDir(projectPath: string, pipeName: string): string {
  return std.join(projectPath, ".pd", pipeName, "sessions");
}

/**
 * Returns the absolute path to a specific session JSON file.
 *
 * @param projectPath - Absolute path to the project root
 * @param pipeName    - Name of the pipe
 * @param sessionId   - UUID of the session
 * @returns Absolute path like `/path/to/project/.pd/myPipe/sessions/<uuid>.json`
 */
function sessionFilePath(projectPath: string, pipeName: string, sessionId: string): string {
  return std.join(sessionsDir(projectPath, pipeName), `${sessionId}.json`);
}

// ── Session CRUD ──

/**
 * Creates a new RunSession object from pipe metadata.
 *
 * Populates all session fields from the pipe's current state:
 * - Generates a UUID sessionId via crypto.randomUUID()
 * - Computes versionId from workspace contentHash or "build-" + lastBuiltAt
 * - Copies step fingerprints from the pipe's steps
 * - Initialises all step records to "pending" status
 *
 * Does NOT persist the session — call `persistSession()` after creation.
 *
 * @param projectName - Human-readable project name
 * @param pipeData    - The pipe's index.json data (full Pipe object)
 * @param inputValue  - The input value for this run
 * @param mode        - Execution mode (full, to_step, from_step, etc.)
 * @param options     - Optional targetStepIndex, startStepIndex, endStepIndex
 * @returns A new RunSession in "created" status
 *
 * Ref: WEB_FIRST_WORKFLOW_PLAN.md §4.1-E
 * Ref: https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID
 */
export function createSession(
  projectName: string,
  pipeData: Pipe,
  inputValue: unknown,
  mode: SessionMode = "full",
  options: {
    targetStepIndex?: number;
    startStepIndex?: number;
    endStepIndex?: number;
  } = {},
): RunSession {
  // Generate a unique session identifier.
  // Ref: https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID
  const sessionId = crypto.randomUUID();

  // Derive versionId from workspace metadata. The contentHash is the
  // preferred source of identity, but it may be undefined in the first cut,
  // so we fall back to "build-" + lastBuiltAt for a human-readable ID.
  const workspace = pipeData.workspace;
  const versionId = workspace?.contentHash
    ?? (workspace?.lastBuiltAt ? `build-${workspace.lastBuiltAt}` : `build-${new Date().toISOString()}`);

  // Determine the pipe name from the Pipe object. Uses `fileName` (the
  // sanitized markdown filename without extension) which matches the .pd/
  // directory name, falling back to `cleanName` then `name`.
  const pipeName = pipeData.fileName || pipeData.cleanName || pipeData.name;

  // Initialize per-step records. Every step starts as "pending" — the
  // execution engine updates status as it runs each step.
  const steps: SessionStepRecord[] = pipeData.steps.map((step, index) => ({
    sessionId,
    stepIndex: index,
    stepId: step.stepId,
    stepFingerprint: step.fingerprint,
    status: "pending" as StepStatus,
  }));

  const session: RunSession = {
    sessionId,
    projectName,
    pipeName,
    versionId,
    inputValue,
    mode,
    status: "created" as SessionStatus,
    createdAt: new Date().toISOString(),
    traceRefs: [],
    steps,
    // Set optional step range fields if provided
    ...(options.targetStepIndex !== undefined ? { targetStepIndex: options.targetStepIndex } : {}),
    ...(options.startStepIndex !== undefined ? { startStepIndex: options.startStepIndex } : {}),
    ...(options.endStepIndex !== undefined ? { endStepIndex: options.endStepIndex } : {}),
  };

  return session;
}

/**
 * Persists a session to disk as a JSON file.
 *
 * The session is written atomically (overwrite) under:
 *   `.pd/<pipeName>/sessions/<sessionId>.json`
 *
 * Called after creation and after each step completes (crash recovery).
 *
 * @param projectPath - Absolute path to the project root
 * @param session     - The session to persist
 *
 * Ref: https://docs.deno.com/api/deno/~/Deno.writeTextFile
 * Ref: https://docs.deno.com/api/deno/~/Deno.mkdir
 */
export async function persistSession(projectPath: string, session: RunSession): Promise<void> {
  const dir = sessionsDir(projectPath, session.pipeName);
  // Ensure the sessions directory exists — recursive: true is idempotent.
  await Deno.mkdir(dir, { recursive: true });
  const filePath = sessionFilePath(projectPath, session.pipeName, session.sessionId);
  await Deno.writeTextFile(filePath, JSON.stringify(session, null, 2));
}

/**
 * Reads a session by its ID from disk.
 *
 * @param projectPath - Absolute path to the project root
 * @param pipeName    - Name of the pipe
 * @param sessionId   - UUID of the session to read
 * @returns The deserialized RunSession, or null if not found
 */
export async function readSession(
  projectPath: string,
  pipeName: string,
  sessionId: string,
): Promise<RunSession | null> {
  try {
    const filePath = sessionFilePath(projectPath, pipeName, sessionId);
    const content = await Deno.readTextFile(filePath);
    return JSON.parse(content) as RunSession;
  } catch {
    // File doesn't exist or is unreadable — return null rather than throwing
    // to let callers handle the "not found" case gracefully.
    return null;
  }
}

/**
 * Lists recent sessions for a pipe, sorted by createdAt descending.
 *
 * Scans the sessions directory, reads each JSON file, and sorts by
 * creation timestamp (newest first). Returns a limited subset to keep
 * list responses fast.
 *
 * @param projectPath - Absolute path to the project root
 * @param pipeName    - Name of the pipe
 * @param limit       - Maximum number of sessions to return (default 10)
 * @returns Array of sessions sorted by createdAt desc, capped at limit
 */
export async function listSessions(
  projectPath: string,
  pipeName: string,
  limit: number = 10,
): Promise<RunSession[]> {
  const dir = sessionsDir(projectPath, pipeName);
  const sessions: RunSession[] = [];

  try {
    // Iterate over all .json files in the sessions directory.
    // Ref: https://docs.deno.com/api/deno/~/Deno.readDir
    for await (const entry of Deno.readDir(dir)) {
      if (!entry.isFile || !entry.name.endsWith(".json")) continue;
      try {
        const filePath = std.join(dir, entry.name);
        const content = await Deno.readTextFile(filePath);
        sessions.push(JSON.parse(content) as RunSession);
      } catch {
        // Skip corrupted session files — don't let one bad file block the list.
        continue;
      }
    }
  } catch {
    // Directory doesn't exist yet — no sessions have been created.
    return [];
  }

  // Sort by createdAt descending (newest first) and cap at limit.
  // ISO-8601 strings sort lexicographically, so string comparison works.
  sessions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return sessions.slice(0, limit);
}

/**
 * Updates the overall session status and persists the change.
 *
 * This is a convenience method for status transitions. If the new status
 * is "completed" or "failed", also sets the completedAt timestamp.
 *
 * @param projectPath - Absolute path to the project root
 * @param session     - The session to update (mutated in place)
 * @param status      - New status to set
 */
export async function updateSessionStatus(
  projectPath: string,
  session: RunSession,
  status: SessionStatus,
): Promise<void> {
  session.status = status;
  if (status === "completed" || status === "failed") {
    session.completedAt = new Date().toISOString();
  }
  await persistSession(projectPath, session);
}

/**
 * Updates a step's status within a session and persists.
 *
 * @param projectPath - Absolute path to the project root
 * @param session     - The session containing the step (mutated in place)
 * @param stepIndex   - Zero-based index of the step to update
 * @param status      - New status for the step
 */
export async function updateStepStatus(
  projectPath: string,
  session: RunSession,
  stepIndex: number,
  status: StepStatus,
): Promise<void> {
  if (stepIndex >= 0 && stepIndex < session.steps.length) {
    session.steps[stepIndex].status = status;
    await persistSession(projectPath, session);
  }
}

// ── Session Execution ──

/**
 * Determines which step indices to execute based on the session's mode and range fields.
 *
 * Execution modes:
 *   - `full`        — all steps [0..N-1]
 *   - `to_step`     — steps [0..targetStepIndex] (inclusive)
 *   - `from_step`   — steps [startStepIndex..N-1]
 *   - `single_step` — only [targetStepIndex]
 *   - `continue`    — from first non-"done" step through the end
 *
 * @param session   - The session whose mode determines the range
 * @param totalSteps - Total number of steps in the pipe
 * @returns Array of zero-based step indices to execute, in order
 *
 * Ref: WEB_FIRST_WORKFLOW_PLAN.md §4.1-E — SessionMode
 */
export function computeStepsToExecute(session: RunSession, totalSteps: number): number[] {
  const all = Array.from({ length: totalSteps }, (_, i) => i);

  switch (session.mode) {
    case "full":
      return all;

    case "to_step": {
      // Execute from 0 up to and including targetStepIndex.
      const target = session.targetStepIndex ?? (totalSteps - 1);
      return all.filter((i) => i <= target);
    }

    case "from_step": {
      // Execute from startStepIndex through to the end.
      const start = session.startStepIndex ?? 0;
      return all.filter((i) => i >= start);
    }

    case "single_step": {
      // Execute exactly one step.
      const target = session.targetStepIndex ?? 0;
      return [target];
    }

    case "continue": {
      // Find the first step that isn't "done" and run from there to the end.
      // This enables "resume from where I left off" after a partial run.
      const firstPending = session.steps.findIndex((s) => s.status !== "done");
      if (firstPending === -1) return []; // All steps already done
      return all.filter((i) => i >= firstPending);
    }

    default:
      return all;
  }
}

/**
 * Executes a session against a built pipe, running the determined steps.
 *
 * This is the main execution engine. It:
 *   1. Dynamically imports the pipe's compiled index.ts to get step functions
 *   2. Determines which steps to execute based on session.mode
 *   3. For each step: snapshots before, runs, snapshots after, computes delta
 *   4. Persists the session after each step (crash recovery)
 *   5. Updates overall session status on completion or failure
 *
 * Step functions from the compiled index.ts require TWO arguments:
 *   `(input, opts)` where `opts` is the full pipe data (rawPipe/pipeData).
 * This matches how pdPipe calls steps internally.
 *
 * @param projectPath - Absolute path to the project root
 * @param session     - The session to execute (mutated in place)
 * @param pipeData    - The pipe's index.json data (passed as `opts` to step functions)
 * @returns Object containing the final session state and output
 *
 * Ref: WEB_FIRST_WORKFLOW_PLAN.md §8.1 — session lifecycle
 * Ref: templates/trace.ts — safeSnapshot/computeDelta patterns
 */
export async function executeSession(
  projectPath: string,
  session: RunSession,
  pipeData: Pipe,
): Promise<{ session: RunSession; output: unknown }> {
  const pipeName = session.pipeName;
  const totalSteps = pipeData.steps.length;

  // ── Dynamically import the compiled pipe module ──
  // The built index.ts exports individual step functions and a `pipe` object
  // with a `stages` array. We import the module and access `pipe.stages`
  // to get the callable functions in order.
  //
  // We use absolute file:// URLs because the generated index.ts has relative
  // imports (e.g. `import rawPipe from "./index.json"`) that resolve from the
  // file's directory — absolute URLs make this work regardless of Deno.cwd().
  //
  // Cache-busting: append a timestamp query param so Deno doesn't serve a
  // stale cached module if the pipe was just rebuilt. Deno's module cache
  // keys on URL string, so a unique query param forces a fresh import.
  //
  // Ref: https://docs.deno.com/runtime/fundamentals/modules/#importing-modules
  const indexTsPath = std.join(projectPath, ".pd", pipeName, "index.ts");
  const importUrl = `file://${indexTsPath}?t=${Date.now()}`;
  const pipeModule = await import(importUrl);

  // The pipe module exports `pipe` which is a Pipe() instance from @pd/pdpipe.
  // `pipe.stages` is the array of step functions in execution order.
  // Ref: pipeToScript.ts — generated module structure
  const stages = pipeModule.pipe?.stages || pipeModule.default?.stages;
  if (!stages || stages.length === 0) {
    throw new Error(`No stages found in compiled pipe module for "${pipeName}"`);
  }

  // ── Determine which steps to execute ──
  const stepsToRun = computeStepsToExecute(session, totalSteps);

  if (stepsToRun.length === 0) {
    // Nothing to execute — session is already complete (e.g. continue on a fully done session)
    await updateSessionStatus(projectPath, session, "completed");
    return { session, output: session.inputValue };
  }

  // ── Prepare the input object ──
  // Clone the input value to avoid mutating the stored session input.
  // The pipeline steps will mutate this object in place.
  // deno-lint-ignore no-explicit-any
  let currentInput: any;
  try {
    currentInput = structuredClone(session.inputValue) || {};
  } catch {
    // If inputValue isn't cloneable (unlikely for JSON), fall back to
    // JSON round-trip which handles all JSON-serializable values.
    currentInput = JSON.parse(JSON.stringify(session.inputValue ?? {}));
  }
  // Ensure currentInput is an object (step functions expect an object)
  if (typeof currentInput !== "object" || currentInput === null) {
    currentInput = {};
  }

  // For "continue" and "from_step" modes, we need to feed the output from
  // the last completed step. If previous steps have afterSnapshots, use
  // the last one as our starting input — this gives us the accumulated
  // state up to the resume point.
  if (session.mode === "continue" || session.mode === "from_step") {
    const firstStepToRun = stepsToRun[0];
    // Look backwards from the resume point to find the last step with an afterSnapshot
    for (let i = firstStepToRun - 1; i >= 0; i--) {
      const stepRecord = session.steps[i];
      if (stepRecord.status === "done" && stepRecord.afterSnapshotRef) {
        try {
          // afterSnapshotRef stores the snapshot inline as a JSON string
          currentInput = JSON.parse(stepRecord.afterSnapshotRef);
          break;
        } catch {
          // Snapshot couldn't be parsed — continue looking backwards
        }
      }
    }
  }

  // ── Mark session as running ──
  await updateSessionStatus(projectPath, session, "running");

  // ── Execute each step ──
  for (const stepIndex of stepsToRun) {
    const stepRecord = session.steps[stepIndex];

    // Bounds check: ensure the stage function exists
    if (stepIndex >= stages.length) {
      stepRecord.status = "failed";
      stepRecord.errorRef = `Step index ${stepIndex} exceeds available stages (${stages.length})`;
      await persistSession(projectPath, session);
      continue;
    }

    const stageFn = stages[stepIndex];

    // ── Mark step as running ──
    stepRecord.status = "running";
    stepRecord.startedAt = new Date().toISOString();
    await persistSession(projectPath, session);

    try {
      // ── Before snapshot ──
      // Capture the state of the input BEFORE this step runs. This lets
      // the UI show "what did this step start with?" for debugging.
      const beforeSnap = safeSnapshot(currentInput as Record<string, unknown>);

      // ── Execute the step function ──
      // Step functions from the compiled index.ts accept (input, opts).
      // `opts` is the full pipe data (rawPipe) which steps can access for
      // configuration, metadata, etc. via the second parameter.
      //
      // Ref: pipeToScript.ts — `export async function StepName(input, opts) { ... }`
      const startTime = performance.now();
      const result = await stageFn(currentInput, pipeData);
      const endTime = performance.now();

      // Steps may return a modified input, or mutate the input in place
      // and return void/undefined. Use the return value if truthy.
      if (result !== undefined && result !== null) {
        currentInput = result;
      }

      // ── After snapshot ──
      const afterSnap = safeSnapshot(currentInput as Record<string, unknown>);

      // ── Compute delta ──
      const delta = computeDelta(beforeSnap, afterSnap);

      // ── Update step record with results ──
      stepRecord.status = "done";
      stepRecord.completedAt = new Date().toISOString();
      stepRecord.durationMs = Math.round((endTime - startTime) * 100) / 100;
      // Store snapshots inline as JSON strings for simplicity in the first cut.
      // This avoids separate snapshot files and keeps the session self-contained.
      stepRecord.beforeSnapshotRef = JSON.stringify(beforeSnap);
      stepRecord.afterSnapshotRef = JSON.stringify(afterSnap);
      stepRecord.deltaRef = JSON.stringify(delta);

      // ── Persist after each step (crash recovery) ──
      // If the process crashes mid-session, the last persisted state shows
      // which steps completed and which were in-flight.
      await persistSession(projectPath, session);
    } catch (error) {
      // ── Step failed ──
      stepRecord.status = "failed";
      stepRecord.completedAt = new Date().toISOString();
      stepRecord.errorRef = (error as Error).message || String(error);

      // Persist the failure immediately
      await persistSession(projectPath, session);

      // Mark overall session as failed and stop execution.
      // We don't continue to later steps because they depend on this
      // step's output — running them with stale/incorrect input would
      // produce misleading results.
      await updateSessionStatus(projectPath, session, "failed");
      return { session, output: currentInput };
    }
  }

  // ── All requested steps completed successfully ──
  await updateSessionStatus(projectPath, session, "completed");
  return { session, output: currentInput };
}
