export type { WalkOptions } from "jsr:@std/fs@1.0.5";
import type { Args } from "jsr:@std/cli@1.0.6";
import type { WalkEntry } from "jsr:@std/fs@1.0.5/walk";
import type { ParsedPath } from "jsr:@std/path@1.0.7/parse";
import type { BuildOptions } from "npm:esbuild@0.25.4";

/** A markdown-it token with both standard and legacy properties. */
export type Token = {
    type: string;
    tag: string;
    content: string;
    level?: number;
    info?: string;
    markup?: string;
    map?: [number, number];
    block?: boolean;
    children?: Token[];
    attrGet?: (name: string) => string | null;
    attrSet?: (name: string, value: string) => void;
    // Legacy properties for compatibility
    kind?: string;
    fenced?: boolean;
    language?: string;
    start_number?: number;
    label?: string;
    alignments?: Array<string>;
    url?: string;
    title?: string;
    checked?: boolean;
};

export type Tokens = Token[];

/** An error captured during pipeline execution. */
export type PDError = {
    func: string;
} & Error;

/** The data object that flows through all pipeline steps. */
export type Input = {
    globalConfig?: PipeConfig;
    request?: Request;
    response?: Response;
    errors?: PDError[];
    route?: object;
    flags?: object;
    mode?: Record<string, boolean>;
    only?: number;
    stop?: number;
    [key: string]: unknown;
};

/** A single stage/function in a pipeline. */
export type Stage<T = Input> = (input: T, opts: Pipe) => Promise<T> | T | void;

/** Internal input type for the mdToPipe parser pipeline. */
export type mdToPipeInput =
    & {
        markdown: string;
        tokens: Token[];
        headings: number[];
        codeBlocks: number[];
        steps: Step[];
        pipeName: string;
        pipe: Pipe;
    }
    & RangeFinderInput
    & Input;

// ── Workspace / Sync Types ──
// These types support the web-first workflow where `index.json` is the
// machine-edit source of truth and `pd sync` writes structured changes
// back to markdown. See WEB_FIRST_WORKFLOW_PLAN.md §4.1 and §7.3.

/**
 * Tracks whether the structured workspace (index.json) is in sync with
 * the canonical markdown file on disk.
 *
 * - `"clean"` — markdown and index.json are consistent; no unsynced edits.
 * - `"json_dirty"` — structured workspace has been modified (via web UI or
 *   Pi patch) but those changes have not yet been written back to markdown
 *   via `pd sync`.
 * - `"syncing"` — a sync or build operation is currently in progress.
 *
 * Ref: WEB_FIRST_WORKFLOW_PLAN.md §7.3
 */
export type SyncState = "clean" | "json_dirty" | "syncing";

/**
 * Minimal metadata embedded directly inside `index.json` to track the
 * workspace's sync state and provenance. Keeping this block small avoids
 * a separate sidecar file while still giving the UI enough information
 * to answer "is markdown in sync with index.json?"
 *
 * Ref: WEB_FIRST_WORKFLOW_PLAN.md §4.1-A
 */
export type WorkspaceMetadata = {
    /** Current sync state between index.json and the source markdown. */
    syncState: SyncState;
    /** ISO-8601 timestamp of the last successful `pd build` run. */
    lastBuiltAt?: string;
    /** ISO-8601 timestamp of the last successful `pd sync` run. */
    lastSyncedAt?: string;
    /**
     * Hash of meaningful pipe content for change detection.
     * Reserved for future use — left undefined in the first cut.
     */
    contentHash?: string;
    /**
     * Which operation last modified this index.json, enabling the UI
     * to show provenance (e.g., "last changed by Pi patch").
     */
    lastModifiedBy?: "build" | "sync" | "web_edit" | "pi_patch";
};

/**
 * Machine-readable result envelope returned by `pd sync`. This allows
 * both CLI consumers and the web UI to inspect sync outcomes without
 * parsing console output.
 *
 * Ref: WEB_FIRST_WORKFLOW_PLAN.md §7.5
 */
export type SyncResult = {
    /** Whether the sync (and optional rebuild) completed successfully. */
    success: boolean;
    /** The pipe name that was synced. */
    pipeName: string;
    /** Path to the source markdown file (if known). */
    mdPath?: string;
    /** Path to the index.json that was read. */
    indexJsonPath: string;
    /** Resulting sync state after the operation. */
    syncState: SyncState;
    /** Generated markdown content (included in dry-run mode). */
    markdown?: string;
    /** Error message if the sync failed. */
    error?: string;
    /** Whether a `pd build` was triggered after writing markdown. */
    rebuilt?: boolean;
};

/** A single executable step extracted from a markdown code block. */
export type Step = {
    /**
     * Stable, unique identifier for this step, persisted in index.json
     * but NOT written to markdown. Used by the web UI, sessions, and
     * Pi patch proposals to reference steps durably across rebuilds.
     *
     * Generated via `crypto.randomUUID()` on first build; preserved
     * across subsequent builds by matching steps on funcName.
     *
     * Ref: WEB_FIRST_WORKFLOW_PLAN.md §4.1-C
     */
    stepId?: string;
    /** The raw code content of the ts/js code block. */
    code: string;
    /** Token range [startIndex, endIndex] in the parsed token array. */
    range: number[];
    /** The step name, derived from the preceding heading. */
    name: string;
    /** Sanitized function name used in generated TypeScript. */
    funcName: string;
    /** Whether this code block is nested inside a list (for conditionals). */
    inList: boolean;
    /** Whether this is an internal/system step (not user-authored). */
    internal?: boolean;
    /** Conditional execution configuration extracted from list directives. */
    config?: StepConfig;
    /** Paragraph text between the heading and the code block. */
    description?: string;
    /** The heading level (2, 3, etc.) for reconstruction. */
    headingLevel?: number;
    /** The code block language identifier (ts, js, etc.). */
    language?: string;
    /** Whether this step has side effects and should be VCR recorded/replayed in tests. */
    mock?: boolean;
    /** Source line mapping for lossless round-trip reconstruction. */
    sourceMap?: {
        /** Line number (0-indexed) of the heading_open token in the original source. */
        headingLine?: number;
        /** Line number (0-indexed) of the fence-open line (```) in the original source. */
        codeStartLine?: number;
        /** Line number (0-indexed, exclusive) after the fence-close line in the original source. */
        codeEndLine?: number;
    };
    /**
     * Content-based fingerprint (SHA-256 hex) derived from the step's
     * meaningful content: code, funcName, and config. Used by the session
     * layer to detect whether a step has changed between runs — unchanged
     * steps can reuse prior snapshots safely.
     *
     * Computed by `computeStepFingerprint()` during `pd build`.
     *
     * Ref: WEB_FIRST_WORKFLOW_PLAN.md §4.1-C, §8.3
     */
    fingerprint?: string;
    /** The code content at parse time, for detecting modifications during round-trip. */
    originalCode?: string;
    /** The step name at parse time, for detecting title modifications during round-trip. */
    originalName?: string;
    /** The description at parse time, for detecting description modifications during round-trip. */
    originalDescription?: string;
};

/** Configuration for conditional step execution. */
export type StepConfig = {
    /** JSON pointer paths — step runs if any is truthy. */
    checks?: string[];
    /** JSON pointer paths — step runs if ANY is truthy (logical OR). */
    or?: string[];
    /** JSON pointer paths — step runs only if ALL are truthy (logical AND). */
    and?: string[];
    /** JSON pointer paths — step runs only if ALL are falsy (logical NOT). */
    not?: string[];
    /** URL patterns for route matching. */
    routes?: string[];
    /** HTTP methods this step responds to (e.g., ["GET", "POST"]). Multiple = OR. */
    methods?: string[];
    /** Response content-type shorthand or raw MIME type (e.g., "html", "application/xml"). */
    contentType?: string;
    /** Flag paths (auto-prefixed with /flags). */
    flags?: string[];
    /** If set, only this step index runs. */
    only?: number;
    /** If set, pipeline stops after this step index. */
    stop?: number;
};

export type Steps = Step[];

/** Pipeline configuration from JSON blocks, deno.json "pipedown" property, or config.json files. */
export type PipeConfig = {
    [key: string]: unknown;
    /** Test input objects used by `pd test`. Each may have a `_name` for labeling. */
    inputs?: Array<Input & { _name?: string }>;
    /** Custom template file paths to copy into the .pd directory. */
    templates?: string[];
    /** esbuild configurations for bundling output formats. */
    build?: BuildOptions[];
    /** Patterns to skip during markdown file discovery. */
    skip?: (string | RegExp)[];
    /** Patterns to exclude from processing. */
    exclude?: (string | RegExp)[];
    /** JSON pointer paths for conditional checks (pipe-level). */
    checks?: string[];
    or?: string[];
    and?: string[];
    not?: string[];
    routes?: string[];
    flags?: string[];
    only?: number;
    stop?: number;
    /** Project name override. */
    name?: string;
};

/** A complete pipeline definition parsed from a markdown file. */
export type Pipe = {
    /** The pipeline name from the H1 heading. */
    name: string;
    /** Sanitized name (no special chars, no spaces). */
    cleanName: string;
    /** The ordered list of executable steps. */
    steps: Step[];
    /** Path to the source markdown file. */
    mdPath: string;
    /** Merged configuration from JSON blocks and config.json files. */
    config?: PipeConfig;
    /** Relative path to the .pd output directory for this pipe. */
    dir: string;
    /** Absolute path to the .pd output directory for this pipe. */
    absoluteDir: string;
    /** Sanitized filename (without extension). */
    fileName: string;
    /** Raw Zod schema source text from the top-level zod block (one per pipe). */
    schema?: string;
    /** Prose description between the H1 heading and the first step/config block. */
    pipeDescription?: string;
    /** The pipe-level description at parse time, for detecting mutations during round-trip. */
    originalPipeDescription?: string;
    /** The schema text at parse time, for detecting schema mutations during round-trip. */
    originalSchema?: string;
    /** Serialized "meaningful" config at parse time (JSON string), for detecting config mutations during round-trip. */
    originalConfig?: string;
    /** The original markdown source text, for lossless round-trip reconstruction. */
    rawSource?: string;
    /**
     * Minimal workspace metadata for sync-state tracking. Persisted
     * inside index.json so the web UI can determine at a glance whether
     * the structured workspace is clean, dirty, or syncing.
     *
     * Ref: WEB_FIRST_WORKFLOW_PLAN.md §4.1-A
     */
    workspace?: WorkspaceMetadata;
};

/** Input/output for the rangeFinder token classifier. */
export type RangeFinderInput = {
    ranges: {
        /** The current token being processed. */
        token: Token;
        /** The current token index. */
        index: number;
        /** Ranges of executable code blocks (ts/js). */
        codeBlocks: number[][];
        /** Ranges of heading open/close pairs. */
        headings: number[][];
        /** Ranges of metadata blocks (json/yaml). */
        metaBlocks: number[][];
        /** Ranges of list open/close pairs. */
        lists: number[][];
        /** Ranges of schema blocks (zod). */
        schemaBlocks: number[][];
    };
};

/** Input for the pipeToScript code generator. */
export type PipeToScriptInput = {
    pipe: Pipe;
    pipeImports?: string[];
    functions?: string[];
    script?: string;
    errors?: PDError[];
} & Input;

// ── Session, Proposal & Input Profile Types ──
// These are type-only additions for Phase 0. No backend implementation yet.
// They formalise the data model described in WEB_FIRST_WORKFLOW_PLAN.md §4.1
// so that downstream work (Phase 1 sessions, Phase 3 proposals) can import
// stable type definitions without rework.

/**
 * A snapshot of the structured pipe used for execution/session identity.
 * Sessions are pinned to a specific version so that stale detection and
 * resume logic have a clear reference point.
 *
 * Ref: WEB_FIRST_WORKFLOW_PLAN.md §4.1-B
 */
export type PipeVersion = {
    /** Unique identifier for this version snapshot. */
    versionId: string;
    /** The pipe this version belongs to. */
    pipeName: string;
    /**
     * Hash of the index.json content at the time this version was created.
     * Used for fast equality checks without deep comparison.
     */
    indexHash: string;
    /** ISO-8601 timestamp when this version was captured. */
    createdAt: string;
    /**
     * What operation produced this version.
     * - `build`  — generated by `pd build` from markdown
     * - `manual_edit` — user edited a step in the web UI
     * - `pi_patch` — Pi proposal was applied
     * - `sync` — produced by the `pd sync` → rebuild cycle
     */
    source: "build" | "manual_edit" | "pi_patch" | "sync";
    /** The version this one was derived from, if applicable. */
    baseVersionId?: string;
    /**
     * Per-step fingerprints at the time of this version, enabling
     * efficient stale detection without reloading each step's content.
     */
    stepFingerprints: string[];
};

/**
 * A saved input configuration that makes step-oriented iteration
 * reproducible. Users can pick a named profile before running a session
 * instead of re-entering ad hoc input every time.
 *
 * Ref: WEB_FIRST_WORKFLOW_PLAN.md §4.1-D
 */
export type InputProfile = {
    /** Unique identifier for this profile. */
    inputProfileId: string;
    /** Human-readable label shown in the UI. */
    name: string;
    /** The actual input value (any JSON-serialisable object). */
    value: unknown;
    /**
     * Where this profile originated:
     * - `config` — defined in the pipe's JSON config block (inputs[])
     * - `trace`  — captured from a previous run's input
     * - `ad_hoc` — typed in by the user in the web UI
     */
    source: "config" | "trace" | "ad_hoc";
    /** The pipe this profile belongs to. */
    pipeName: string;
    /** ISO-8601 timestamp when the profile was created. */
    createdAt: string;
    /** ISO-8601 timestamp when the profile was last modified. */
    updatedAt?: string;
    /** ISO-8601 timestamp when the profile was last used in a session. */
    lastUsedAt?: string;
};

/**
 * Execution mode for a run session, controlling which steps are executed.
 *
 * - `full`        — run every step from start to finish
 * - `to_step`     — run from the beginning up to (and including) a target step
 * - `from_step`   — run starting at a given step through to the end
 * - `single_step` — run exactly one step
 * - `continue`    — resume from the last completed step in a prior session
 *
 * Ref: WEB_FIRST_WORKFLOW_PLAN.md §4.1-E
 */
export type SessionMode = "full" | "to_step" | "from_step" | "single_step" | "continue";

/**
 * Overall lifecycle status of a run session.
 *
 * Ref: WEB_FIRST_WORKFLOW_PLAN.md §8.2
 */
export type SessionStatus = "created" | "running" | "completed" | "failed" | "cancelled";

/**
 * A run session — the missing core primitive that makes incremental
 * execution, partial runs, and rerun-from-here first-class operations.
 *
 * Sessions are persisted under `.pd/<pipe>/sessions/<sessionId>.json`.
 *
 * Ref: WEB_FIRST_WORKFLOW_PLAN.md §4.1-E
 */
export type RunSession = {
    /** Unique identifier for this session. */
    sessionId: string;
    /** Project name (from the projects registry). */
    projectName: string;
    /** The pipe being executed. */
    pipeName: string;
    /** The PipeVersion.versionId this session was created against. */
    versionId: string;
    /** Optional reference to a saved input profile. */
    inputProfileId?: string;
    /** The actual input value used for this run. */
    inputValue: unknown;
    /** Execution mode — determines which steps are included. */
    mode: SessionMode;
    /** For `to_step` / `single_step` mode: the target step index. */
    targetStepIndex?: number;
    /** For `from_step` mode: the step to start from. */
    startStepIndex?: number;
    /** For ranged runs: the last step to execute (inclusive). */
    endStepIndex?: number;
    /** Overall session status. */
    status: SessionStatus;
    /** ISO-8601 timestamp when the session was created. */
    createdAt: string;
    /** ISO-8601 timestamp when the session finished (success or failure). */
    completedAt?: string;
    /**
     * References to trace files produced during this session.
     * Each entry is a relative path under `~/.pipedown/traces/`.
     */
    traceRefs: string[];
    /**
     * If upstream steps were reused from a prior session's snapshot,
     * this field records the source session and step range.
     */
    reusedSnapshotRef?: {
        sessionId: string;
        throughStepIndex: number;
    };
    /** Per-step execution records. */
    steps: SessionStepRecord[];
};

/**
 * Status of an individual step within a run session.
 *
 * Ref: WEB_FIRST_WORKFLOW_PLAN.md §8.2
 */
export type StepStatus = "pending" | "running" | "done" | "skipped" | "failed" | "stale" | "reused";

/**
 * Per-step execution record within a RunSession. Captures status,
 * timing, before/after snapshots, and delta information for each step.
 *
 * Ref: WEB_FIRST_WORKFLOW_PLAN.md §4.1-F
 */
export type SessionStepRecord = {
    /** The session this record belongs to. */
    sessionId: string;
    /** Zero-based index of the step within the pipe. */
    stepIndex: number;
    /** The step's stable identifier (from Step.stepId). */
    stepId?: string;
    /** The step's content fingerprint at the time of execution. */
    stepFingerprint?: string;
    /** Current execution status of this step. */
    status: StepStatus;
    /** Reference to the serialised input snapshot before this step ran. */
    beforeSnapshotRef?: string;
    /** Reference to the serialised output snapshot after this step ran. */
    afterSnapshotRef?: string;
    /** Reference to the computed JSON diff between before and after. */
    deltaRef?: string;
    /** Error information if the step failed. */
    errorRef?: string;
    /** Execution duration in milliseconds. */
    durationMs?: number;
    /** ISO-8601 timestamp when execution of this step began. */
    startedAt?: string;
    /** ISO-8601 timestamp when execution of this step completed. */
    completedAt?: string;
    /**
     * If this step's result was reused from a prior session (because
     * its fingerprint matched), this records the source session.
     */
    reusedFromSessionId?: string;
};

/**
 * Status lifecycle of a patch proposal.
 *
 * - `draft`      — proposal is being composed (e.g. Pi is generating)
 * - `ready`      — proposal is complete and awaiting user review
 * - `applied`    — user accepted and the patch was applied to index.json
 * - `discarded`  — user rejected the proposal
 * - `superseded` — a newer proposal replaced this one
 *
 * Ref: WEB_FIRST_WORKFLOW_PLAN.md §4.1-G
 */
export type ProposalStatus = "draft" | "ready" | "applied" | "discarded" | "superseded";

/**
 * A single domain-level operation within a PatchProposal.
 *
 * These are semantic operations (e.g. "replace step code") rather than
 * generic text diffs, making proposals easier to review and trust.
 *
 * Ref: WEB_FIRST_WORKFLOW_PLAN.md §4.2
 */
export type PatchOperation = {
    /**
     * The kind of change. Domain-level names map to specific fields:
     * - `replace_pipe_description` / `replace_schema` — pipe-level
     * - `replace_step_title` / `replace_step_description` / `replace_step_code`
     *   / `replace_step_config` — step-level
     * - `insert_step_after` / `delete_step` / `reorder_step` — structural
     */
    type: string;
    /** Human-readable path to the target (e.g. "steps[2].code"). */
    path: string;
    /** The previous value (for diff display). */
    oldValue?: unknown;
    /** The new value to apply. */
    newValue?: unknown;
    /** Additional context for structural operations (e.g. insert position). */
    meta?: Record<string, unknown>;
};

/**
 * A focused user- or Pi-generated patch proposal before it is applied.
 * Proposals are the unit of reviewable change in the web-first workflow —
 * every mutation to index.json should go through a proposal (explicitly
 * for Pi, implicitly for user structured edits).
 *
 * Persisted under `.pd/<pipe>/proposals/<proposalId>.json` when proposal
 * history needs to survive restart.
 *
 * Ref: WEB_FIRST_WORKFLOW_PLAN.md §4.1-G
 */
export type PatchProposal = {
    /** Unique identifier for this proposal. */
    proposalId: string;
    /** Whether the proposal targets the whole pipe or a single step. */
    scopeType: "pipe" | "step";
    /**
     * Reference to the target. For pipe-scope, just the pipe name.
     * For step-scope, includes stepId or stepIndex.
     */
    scopeRef: {
        pipeName: string;
        stepId?: string;
        stepIndex?: number;
    };
    /**
     * Who created this proposal:
     * - `user_structured_edit` — user made a field-level edit in the web UI
     * - `pi` — generated by the Pi/LLM integration
     */
    origin: "user_structured_edit" | "pi";
    /** The user's prompt/instruction that triggered this proposal (Pi only). */
    prompt?: string;
    /** The ordered list of domain-level operations in this proposal. */
    operations: PatchOperation[];
    /** Short human-readable summary of what this proposal changes. */
    summary: string;
    /** Pi's explanation of why these changes were suggested. */
    rationale?: string;
    /** Preview of the markdown that would result from applying this proposal. */
    markdownPreview?: string;
    /** Serialised JSON diff for UI rendering. */
    jsonDiff?: unknown;
    /** Current lifecycle status of the proposal. */
    status: ProposalStatus;
    /** ISO-8601 timestamp when the proposal was created. */
    createdAt: string;
};

/** Input for CLI commands. */
export interface CliInput extends Input {
    flags: Args;
    globalConfig: PipeConfig;
    projectPipes: Array<{ path: string; entry: WalkEntry } & ParsedPath>;
    errors?: Array<PDError>;
    output: Input;
    debug: boolean | string;
    match?: string;
    /**
     * Machine-readable result from `pd sync`, populated by syncCommand
     * so callers (web UI, tests) can inspect the outcome programmatically.
     */
    syncResult?: SyncResult;
}

/** Input for the build pipeline. */
export interface BuildInput extends CliInput {
    markdown?: {
        [key: string]: string;
    };
    importMap?: {
        imports: {
            [key: string]: string;
        };
        lint: {
            include: string[];
            exclude: string[];
        };
    };
    pipes?: Pipe[];
    warning?: string[];
    match?: string;
    markdownFilesProcesses?: number;

    /**
     * Override the working directory used by pdBuild for resolving .pd paths,
     * walking .md files, and reading .gitignore. Defaults to Deno.cwd() when
     * not provided. This allows the dashboard server to build any registered
     * project without shelling out to a child process.
     */
    cwd?: string;
}
