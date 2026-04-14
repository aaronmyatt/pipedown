# TODO — Interactive Run Workflow

## Goal

Add a simple iterative workflow for CLI and web:

- rerun the current pipe with the last trace input
- edit that input
- pick a past trace input
- edit the pipe
- inspect the last trace

This should be a small extension of the existing run/trace/watch/dashboard flow,
not a new session system.

## Scope guardrails

Do this with the current architecture:

- reuse `trace.ts` traces in `~/.pipedown/traces/`
- reuse current run endpoints and CLI run path
- reuse existing watcher patterns
- reuse the home dashboard, RunDrawer, input history, and trace views

Do **not** introduce:

- session manager / proposal manager
- persistent interactive state machine
- new web app/page unless absolutely necessary
- all changes to the markdown should be in-place edits directly to the target
  pipe, not a sidecar file or copy

---

## Repo facts to anchor the work

### CLI

- `pdCli/mod.ts`
  - command routing is simple positional matching via `checkMinFlags()`
  - current global flags parse `-i` as a string flag, which conflicts with
    `pd run -i`
- `pdCli/runCommand.ts`
  - already builds, then runs `trace.ts` or `cli.ts`
  - good entry point to branch to interactive mode
- `pdCli/watchCommand.ts`
  - already has the debounce + `Deno.watchFs()` pattern needed for auto-rerun
- `templates/trace.ts`
  - already writes traces and exposes `flags.input || flags.i`
- `templates/cli.ts`
  - also still treats `-i` as input shorthand

### Web

- `pdCli/buildandserve.ts`
  - already exposes `/api/run`
  - already exposes per-pipe trace APIs
  - already sends SSE `reload` and `pipe_executed`
- `pdCli/frontend/home/state.js`
  - already loads input history from traces
  - already has custom JSON input editing
  - already has `runPipeWithInput()` and `loadDrawerTrace()`
- `pdCli/frontend/home/components/RunDrawer.js`
  - already supports JSON input editing and trace-rich output
- `pdCli/frontend/home/components/PipeToolbar.js`
  - already has the right place for an interactive toggle / actions

### Trace lookup note

- `pdCli/traceDashboard.ts` already has a TODO about trace naming
- `templates/trace.ts` currently writes traces using
  `rawPipe.fileName || rawPipe.name`
- interactive replay should standardize on the same pipe identity everywhere

---

## Implementation plan

### 1) Fix CLI command surface

Add support for:

- `pd interactive <file.md>`
- `pd i <file.md>`
- `pd run <file.md> -i`

Tasks:

- [ ] update `pdCli/mod.ts` routing for `interactive` and `i`
- [ ] add a boolean interactive flag for `run`
- [ ] remove the current string meaning of top-level `-i`
- [ ] update help text in `stringTemplates.ts`

Important cleanup:

- [ ] standardize user input on `--input`
- [ ] remove `flags.i` input alias from `templates/cli.ts`
- [ ] remove `flags.i` input alias from `templates/trace.ts`

---

### 2) Add small trace replay helpers

Extend `pdCli/traceDashboard.ts` with reusable helpers:

- [ ] `latestTraceForPipe(projectName, pipeName)`
- [ ] `recentTracesForPipe(projectName, pipeName, limit)`
- [ ] `extractReplayableInput(trace)`

`extractReplayableInput(trace)` should:

- [ ] start from `trace.input`
- [ ] strip runtime-added keys like `flags` and `mode`
- [ ] return `{}` when no usable input exists

If trace naming is inconsistent, add one compatibility helper rather than ad hoc
fixes in multiple places.

---

### 3) Build CLI interactive MVP

Create a small helper such as `pdCli/interactiveRun.ts` and keep `runCommand.ts`
thin.

Behavior:

- [ ] build the target pipe
- [ ] load replay input from latest trace, else `{}`
- [ ] run once immediately
- [ ] start a debounced watcher using the existing `watchCommand.ts` pattern
- [ ] rebuild + rerun on markdown changes

Interactive actions:

- [ ] `r` — rerun now with current input
- [ ] `i` — edit JSON input in `$EDITOR` via temp file
- [ ] `s` — choose from recent deduped trace inputs
- [ ] `e` — open the target pipe in `$EDITOR`
- [ ] `t` — show the latest trace path/summary
- [ ] `q` — quit

Guardrails:

- [ ] force tracing on in interactive mode, or fail fast if tracing is disabled
- [ ] reuse existing ignore patterns for `.pd/`, `.git/`, etc.
- [ ] debounce rebuild/rerun to avoid storms

---

### 4) Add web interactive mode to the existing home page

Keep this inside the current dashboard.

#### `pdCli/frontend/home/state.js`

Add minimal state/actions:

- [ ] `interactiveEnabled`
- [ ] `interactiveInput`
- [ ] `toggleInteractiveMode()`
- [ ] `rerunInteractive()`
- [ ] `selectInteractiveInput(inputObj)`
- [ ] `showLastTrace()`

Reuse existing actions where possible:

- [ ] `loadInputHistory()`
- [ ] `openInputEditor()`
- [ ] `runPipeWithInput()`
- [ ] `enterEditMode()` or `openEditor()`
- [ ] `loadDrawerTrace()`

#### `pdCli/frontend/home/components/PipeToolbar.js`

- [ ] add an `Interactive` toggle/button near `Run`
- [ ] when enabled, expose these actions:
  - [ ] Run Again
  - [ ] Edit Input
  - [ ] Past Inputs
  - [ ] Edit Pipe
  - [ ] Last Trace
- [ ] reuse the existing input dropdown instead of creating a second selector

#### `pdCli/frontend/home/components/RunDrawer.js`

- [ ] keep the current drawer design
- [ ] reuse current JSON input editor for input editing
- [ ] reuse current trace rendering for last-trace inspection

#### `pdCli/frontend/home/app.js`

- [ ] on SSE `reload`, if the current pipe is interactive and not in edit mode,
      rerun with the staged interactive input
- [ ] do not rerun while the user is editing markdown or editing JSON input
- [ ] preserve current non-interactive behavior

Backend note:

- [ ] prefer reusing `/api/run` and existing trace APIs
- [ ] only add a tiny new endpoint if the frontend becomes awkward without it

---

### 5) Normalize trace identity

Make trace lookup predictable for both CLI and web.

- [ ] standardize on filename-based pipe identity
- [ ] keep compatibility fallback for older traces if needed
- [ ] remove stale frontend comments that imply H1-only trace naming
- [ ] ensure CLI and web use the same lookup rule

---

### 6) Finish with tests and docs

Small, high-value coverage only.

- [ ] test replay-input extraction (`flags` / `mode` stripped)
- [ ] test latest-trace selection ordering
- [ ] test trace-name compatibility fallback if added
- [ ] update CLI help/docs for:
  - [ ] `pd interactive <file.md>`
  - [ ] `pd i <file.md>`
  - [ ] `pd run <file.md> -i`
  - [ ] `r / i / s / e / t / q`

Manual smoke checklist:

- [ ] no prior trace → interactive run falls back to `{}`
- [ ] save pipe → reruns automatically
- [ ] edit input → reruns with edited JSON
- [ ] select past trace input → reruns correctly
- [ ] last trace is easy to inspect
- [ ] web interactive mode does not rerun while editing

---

## Risks

- trace identity may still be inconsistent across old and new traces; if lookup
  is flaky, interactive mode will feel broken immediately
  - Please purge all old traces from `~/.pipedown/traces/` before testing
- reusing broad file watching may rerun too often; if noise is high, interactive
  mode becomes annoying instead of helpful
  - Let's only watch the target pipe file, not the whole project, to minimize
    noise
- `-i` flag changes may break muscle memory or hidden scripts that still rely on
  `-i` as input shorthand
- web auto-rerun can clobber UX if it fires while the user is editing markdown
  or custom JSON
  - Acceptable for now
- forcing trace-backed replay means projects with tracing disabled need a clear
  fallback or a clear error
  - Either run with no inputs or expect the user to (i) input some inputs

## Open / clarifying / challenging questions

- should interactive rerun on **any** markdown change in the project, or only
  when the active pipe changes?
  - ideally it would rerun on any DEPENDENT pipe change, but that may be complex
    to track without future static analysis tooling, so start with just the
    active pipe file for MVP
- should `e` open `$EDITOR`, or should we require a sensible fallback (`code`,
  `open`, etc.) when `$EDITOR` is unset?
  - expect $EDITOR to be set in our target user base
- should `t` just show the latest trace summary/path, or jump straight to pretty
  JSON output when run in CLI?
  - Let's pretty-print the latest trace JSON in CLI, and show the summary + a
    "View Trace" button in web that opens the full trace in the drawer
- do we want to preserve compatibility with old `-i` input shorthand at all, or
  make a clean break now?
  - break it

## Suggestions to refine the approach - INCLUDE ALL OF THESE IN THE FINAL PLAN

- treat the CLI MVP as the source of truth first; only mirror proven behavior
  into web after the terminal loop feels right
- keep replay input logic in one shared helper path so CLI and web cannot drift
- prefer a single explicit `interactiveRun.ts` helper over spreading the loop
  across `runCommand.ts` and `watchCommand.ts`
- default to the simplest rerun rule first: rerun on markdown save, not on every
  possible project event
- if trace identity cleanup expands, split it into a separate small patch so it
  does not block the interactive loop MVP

## Suggested order

1. fix `-i` CLI conflict
2. add trace replay helpers
3. ship CLI interactive MVP
4. normalize trace identity and update docs

## Acceptance criteria

### CLI

- [ ] `pd i testAll.md` works
- [ ] `pd interactive testAll.md` works
- [ ] `pd run testAll.md -i` works
- [ ] save triggers rebuild + rerun
- [ ] rerun defaults to last trace input
- [ ] `r/i/s/e/t/q` all work

### Web

- [ ] interactive mode lives on the existing home page
- [ ] current replay input can be edited and rerun
- [ ] past inputs are selectable
- [ ] last trace is easy to inspect
- [ ] RunDrawer stays the main output surface

### Direction

- [ ] clearly simpler than PR #15
- [ ] built mostly from existing run/trace/watch/dashboard plumbing
