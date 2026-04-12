# Pipedown Web-First Workflow Plan

Status: planning document
Scope: web-first workflow evolution for `pipedown`
Based on: `WORKFLOW_PROPOSAL.md`, `LLM.md`, `INSTRUCTIONS.md`, current dashboard/frontend structure, and existing markdown round-trip behavior.

---

## 0. Approved Direction and Guardrails

This plan assumes the approved product direction is:

- **Option 1: web-first evolution**
- **No near-term TUI investment**
- **Structured, step-oriented editing becomes the primary workflow**
- **Raw markdown editing remains available, but becomes a secondary escape hatch**
- **Pi/LLM interactions are always scoped to a pipe or step**
- **Pi/LLM outputs must be focused, reviewable, and diffable**
- **`index.json` becomes the source of truth for machine edits**
- **`pd sync` becomes the explicit mechanism that applies structured changes back to markdown**

### Important source-of-truth clarification

This plan distinguishes between two kinds of truth:

1. **Human-facing canonical artifact:** markdown on disk (`*.md`)
2. **Machine-edit canonical workspace:** `.pd/<pipe>/index.json`

That means:

- humans still inspect, version, package, and collaborate on markdown
- the structured web editor and Pi mutate `index.json`
- the web UI can also edit raw markdown directly when needed
- `pd sync` is the only supported structured-to-markdown write-back path
- `pd build` remains the markdown-to-structured regeneration path
- first-cut concurrent edits use simple last-write-wins behavior rather than conflict resolution

This preserves Pipedown's markdown identity while making machine editing safer and more structured, while also keeping the first implementation operationally simple.

### Non-goals for this plan

- building a near-term TUI
- replacing local editors for long-form authoring
- multi-user collaborative editing
- unscoped free-form Pi chat as the primary editing surface
- broad architecture changes unrelated to workflow/session/editing

---

## 1. Product Vision

### Vision statement

Pipedown should evolve from a markdown viewer with action overlays into a **web-based pipe studio** where users can:

- navigate a pipe as a sequence of steps
- inspect and run the pipe incrementally
- edit steps structurally instead of editing an entire markdown file by default
- ask Pi for scoped improvements that return focused patches
- preview and apply those patches safely
- sync structured changes back to markdown intentionally via `pd sync`

### What the flagship experience should feel like

The default experience should feel like:

- **step-first**, not file-first
- **session-based**, not one-shot run-based
- **patch-oriented**, not fire-and-forget rewrite-oriented
- **structured by default**, not textarea by default
- **trace-aware**, not output-only
- **markdown-backed**, not markdown-hidden

### Desired user mental model

The user should understand the system like this:

1. I open a pipe in the browser.
2. I work on one step at a time.
3. I can run to a step, rerun from a step, or continue from where I left off.
4. I can edit a step's title, description, code, and conditions directly.
5. If I use Pi, it proposes a patch for the current pipe or step.
6. I review the patch, apply it, and rerun.
7. When I want the file on disk updated, I sync structured changes back to markdown.

### Strategic outcome

If this works, Pipedown gets:

- a more opinionated and differentiated workflow
- a safer LLM integration model
- a reusable session model that can later support CLI/editor workflows too
- clearer separation between human-readable docs and machine-editable structure

---

## 2. UX Goals and User Journeys

## 2.1 UX goals

The web-first workflow should optimize for these goals:

1. **Make the step the default unit of attention.**
2. **Make incremental execution feel normal, not advanced.**
3. **Make edit → rerun the tightest loop in the product.**
4. **Make Pi feel helpful but constrained.**
5. **Preserve markdown visibility without forcing markdown-first editing.**
6. **Make session state legible: what ran, what failed, what changed, what is stale.**
7. **Keep every machine-generated change reviewable before it lands.**
8. **Avoid hidden state and silent sync behavior.**

## 2.2 Primary user journeys

### Journey A: Inspect and run a pipe incrementally

1. User opens a pipe from the left nav.
2. Center panel shows the pipe as ordered steps.
3. Right panel shows current input profile and session state.
4. User chooses a saved input or recent trace input.
5. User clicks **Run next** or **Run to here** on a step.
6. UI shows per-step status changes in real time.
7. User inspects before/after state and output delta inline for the executed step.
8. User continues step by step until done or a failure occurs.

Success criteria:

- no need to leave the current page to understand the latest run
- partial runs are first-class and preserved
- user can tell exactly where execution stands

### Journey B: Edit one step and rerun from that point

1. User opens step N.
2. User edits title, description, code, or conditions in a structured editor.
3. Saving the step updates the structured workspace (`index.json`) only.
4. Step N and downstream steps are marked **stale**.
5. UI offers **Rerun from here** or **Rerun first stale step**.
6. User reruns.
7. Inline deltas update and stale state clears for rerun steps.

Success criteria:

- the user never has to edit the whole file unless they choose to
- stale propagation is obvious and trustworthy
- rerunning from the changed step is one click away

### Journey C: Ask Pi to improve one step

1. User selects a step and clicks **Ask Pi**.
2. Pi prompt is explicitly scoped to that step, with pipe context.
3. Pi returns a focused patch proposal, not a silent rewrite.
4. User sees:
   - changed fields
   - code diff and/or field diff
   - short rationale
   - optional suggested next run/test action
5. User chooses **Apply**, **Discard**, or **Refine**.
6. If applied, the step becomes dirty/stale and can be rerun immediately.

Success criteria:

- Pi never mutates the pipe invisibly
- patches are narrow enough to trust
- applying a Pi change naturally leads into rerun/testing

### Journey D: Sync back to markdown

1. User has unsynced structured changes in the workspace.
2. UI shows the pipe as **Unsynced to markdown**.
3. User opens a sync review panel.
4. System shows a markdown preview/diff generated from `index.json`.
5. User runs **pd sync** via backend integration or explicit command action.
6. Markdown file on disk updates.
7. System rebuilds and returns the workspace to a clean synced state.

Success criteria:

- there is exactly one obvious path for structured changes to reach markdown
- sync is intentional and reviewable
- markdown stays inspectable and trusted

### Journey E: Fall back to raw markdown editing

1. User chooses **Raw markdown** mode explicitly.
2. The browser opens the current markdown file directly in the web UI.
3. User edits markdown holistically.
4. Save writes the markdown file and immediately triggers rebuild (`pd build`) to refresh `index.json`.
5. The rebuilt structured workspace becomes the current source for further web editing.
6. If there were unsynced structured edits before the raw save, those edits are lost in this first cut.

Success criteria:

- raw markdown remains available entirely within the web UI
- overwrite behavior is simple and predictable
- structured mode remains the primary path

---

## 3. Architectural Direction

The core architectural move is to stop treating the home page as a rendered markdown page with injected controls and instead treat it as a **step-aware workspace** backed by structured data and explicit run sessions.

## 3.1 Proposed layered architecture

### Layer 1: canonical file/build layer

Existing responsibilities remain, with some stricter workflow rules:

- `pd build`: markdown → `.pd/<pipe>/index.json`
- `pd sync`: `.pd/<pipe>/index.json` → markdown
- `pipeToMarkdown.ts` remains the markdown reconstruction engine
- `mdToPipe.ts` remains the markdown parser into structured pipe data

### Layer 2: structured workspace layer

New or expanded responsibility:

- load/edit/save the current pipe's structured representation
- track whether the structured workspace is clean, dirty, stale, or syncing
- mediate all structured edits from the web UI and Pi

This should become the heart of the browser editing experience.

### Layer 3: session and trace layer

New first-class responsibility:

- create run sessions
- persist partial runs like full runs
- store step statuses, before/after snapshots, and deltas
- support rerun semantics and stale invalidation

### Layer 4: patch/proposal layer

New first-class responsibility:

- model user and Pi changes as patches to structured data
- preview diffs before apply
- keep a history of proposals and applied patches within a session/workspace

### Layer 5: UI workspace shell

The browser UI becomes a composed studio with:

- pipe navigation
- step canvas
- session panel
- trace/delta inspector
- Pi panel
- sync review panel
- secondary raw markdown mode

## 3.2 Recommended codebase impact areas

The likely implementation will touch these areas most heavily:

- `pipedown.d.ts`
- `mdToPipe.ts`
- `pipeToMarkdown.ts`
- `pdBuild.ts`
- `pdCli/syncCommand.ts`
- `pdCli/buildandserve.ts`
- `pdCli/homeDashboard.ts`
- `pdCli/traceDashboard.ts`
- `pdCli/frontend/home/*`
- possibly `pdCli/frontend/shared/*` for new diff/tree/session utilities

## 3.3 Architectural principles to enforce

1. **No direct Pi-to-markdown rewrite path.** Pi writes structured patches only.
2. **No hidden markdown sync.** Structured-to-markdown updates happen through `pd sync` semantics.
3. **No browser-only session model.** The session backend should be reusable by future CLI/editor integrations.
4. **No partial runs treated as second-class.** They should generate durable inspectable artifacts.
5. **No ambiguous dirty state.** The UI must always know whether markdown and `index.json` diverge.

---

## 4. Data Model and Backend Primitives

The web-first workflow needs a clearer backend domain model than the current mix of ad hoc run endpoints, trace files, and LLM actions.

## 4.1 Core entities

### A. Pipe workspace

Represents the current editable structured state for a pipe.

Suggested fields:

- `projectName`
- `pipeName`
- `mdPath`
- `currentIndexHash`
- `syncState`: `clean | json_dirty | syncing`
- `lastBuiltAt`
- `lastSyncedAt`
- `currentVersionId`
- `hasUnsavedPatchApplications`

Implementation note:

- keep this metadata minimal and persist it directly in `index.json` under a small top-level metadata block
- do not introduce a separate `workspace.json` sidecar in the first cut

Purpose:

- gives the UI one authoritative record for current web workspace status
- keeps metadata simple and colocated with the structured pipe
- defers conflict tracking and multi-writer coordination to a later phase

### B. Pipe version

Represents a snapshot of the structured pipe used for execution/session identity.

Suggested fields:

- `versionId`
- `pipeName`
- `indexHash`
- `createdAt`
- `source`: `build | manual_edit | pi_patch | sync`
- `baseVersionId?`
- `stepFingerprints[]`

Purpose:

- sessions should be pinned to a specific structured version
- stale detection and resume logic need version awareness

### C. Step descriptor

Represents a step as an addressable object in the web app and patch APIs.

Suggested fields to add or formalize:

- `stepId`
- `index`
- `name`
- `description`
- `code`
- `config`
- `sourceMap`
- `fingerprint`
- `status` (derived in session context, not stored on the pipe itself)

Important note:

- introduce stable `stepId` now
- persist `stepId` in `index.json`, not in markdown
- on `pd build`, preserve existing `stepId`s by matching rebuilt steps against the prior `index.json` where possible; if a step cannot be matched confidently, generate a new `stepId`
- keep `stepIndex` for convenience in APIs and UI, but treat `stepId` as the durable identity for patches, sessions, and history

### D. Input profile

Formalize the current loose input-history behavior.

Suggested fields:

- `inputProfileId`
- `name`
- `value`
- `source`: `config | trace | ad_hoc`
- `pipeName`
- `createdAt`
- `updatedAt`
- `lastUsedAt`

Purpose:

- make step-oriented iteration reproducible
- let users intentionally pick baselines for reruns

### E. Run session

The missing core primitive.

Suggested fields:

- `sessionId`
- `projectName`
- `pipeName`
- `versionId`
- `inputProfileId?`
- `inputValue`
- `mode`: `full | to_step | from_step | single_step | continue`
- `targetStepIndex?`
- `startStepIndex?`
- `endStepIndex?`
- `status`: `created | running | completed | failed | cancelled`
- `createdAt`
- `completedAt?`
- `traceRefs[]`
- `reusedSnapshotRef?`

### F. Session step record

Suggested fields:

- `sessionId`
- `stepIndex`
- `stepFingerprint`
- `status`: `pending | running | done | skipped | failed | stale`
- `beforeSnapshotRef?`
- `afterSnapshotRef?`
- `deltaRef?`
- `errorRef?`
- `durationMs?`
- `startedAt?`
- `completedAt?`
- `reusedFromSessionId?`

### G. Patch proposal

Represents a focused user- or Pi-generated patch before it is applied.

Suggested fields:

- `proposalId`
- `scopeType`: `pipe | step`
- `scopeRef`: pipe name and optional step ref
- `origin`: `user_structured_edit | pi`
- `prompt?`
- `operations[]`
- `summary`
- `rationale?`
- `markdownPreview?`
- `jsonDiff?`
- `status`: `draft | ready | applied | discarded | superseded`
- `createdAt`

## 4.2 Recommended patch format

The system should avoid broad whole-pipe rewrites where possible.

Recommended shape:

- domain-level operations first
- optional JSON Patch representation second
- generated markdown diff only as a review artifact, not the patch source

Example operation shapes:

- `replace_pipe_description`
- `replace_schema`
- `replace_step_title`
- `replace_step_description`
- `replace_step_code`
- `replace_step_config`
- `insert_step_after`
- `delete_step`
- `reorder_step`

This supports focused, diffable patches and avoids overloading generic text diff as the actual mutation language.

## 4.3 Snapshot and trace primitives

The current trace model should be extended so partial runs become durable and composable.

Needed primitives:

- input snapshot reference
- output snapshot reference
- before/after state per executed step
- computed JSON diff per step
- run metadata including mode and executed range
- version metadata so traces are tied to the pipe structure that produced them

## 4.4 API surface to add or evolve

Illustrative API directions:

### Workspace APIs

- `GET /api/workspaces/:project/:pipe`
- `POST /api/workspaces/:project/:pipe/rebuild`
- `POST /api/workspaces/:project/:pipe/sync`
- `GET /api/workspaces/:project/:pipe/sync-preview`
- `PATCH /api/workspaces/:project/:pipe`
- `PATCH /api/workspaces/:project/:pipe/steps/:stepRef`

### Session APIs

- `POST /api/sessions`
- `GET /api/sessions/:sessionId`
- `POST /api/sessions/:sessionId/run`
- `POST /api/sessions/:sessionId/continue`
- `POST /api/sessions/:sessionId/rerun-from/:stepIndex`
- `GET /api/sessions/:sessionId/events`

### Input profile APIs

- `GET /api/pipes/:pipe/input-profiles`
- `POST /api/pipes/:pipe/input-profiles`
- `PATCH /api/pipes/:pipe/input-profiles/:id`
- `DELETE /api/pipes/:pipe/input-profiles/:id`

### Pi patch APIs

- `POST /api/pi/proposals`
- `GET /api/pi/proposals/:proposalId`
- `POST /api/pi/proposals/:proposalId/apply`
- `POST /api/pi/proposals/:proposalId/refine`
- `POST /api/pi/proposals/:proposalId/discard`

## 4.5 Backend implementation notes

### Recommended near-term storage approach

Keep the first cut intentionally minimal:

- structured pipe plus minimal workspace metadata in `.pd/<pipe>/index.json`
- per-step `stepId` values persisted directly in `index.json`
- session records under `.pd/<pipe>/sessions/`
- proposal records under `.pd/<pipe>/proposals/` only if proposal history must survive restart

Possible storage additions:

- `.pd/<pipe>/sessions/<sessionId>.json`
- `.pd/<pipe>/proposals/<proposalId>.json`

Avoid a broader `workspace.json` / `versions/` sidecar hierarchy until the simpler model proves insufficient. For now, colocating the essential metadata inside `index.json` keeps the implementation easier to reason about and easier to inspect.

---

## 5. Frontend Changes Needed

The current home page already contains many useful behaviors, but the implementation should shift from markdown-plus-injected-toolbar semantics toward a true step workspace.

## 5.1 Core UI structure

Recommended workspace layout:

### Left sidebar

Keep and improve:

- recent pipes
- project grouping
- search/filter
- pipe metadata and sync status badges

### Center panel: step canvas

This becomes the primary workspace surface.

Each step should be rendered as a first-class component with:

- title
- description
- code preview/editor
- condition/DSL summary
- status badge
- latest run summary
- stale marker if downstream invalidated
- inline before/after/delta toggle
- actions:
  - Run next
  - Run to here
  - Rerun from here
  - Edit
  - Ask Pi
  - View trace details

### Right panel

Tabbed or segmented panel for:

- session timeline/status
- input profiles
- Pi proposal panel
- patch review
- trace inspector
- sync preview

## 5.2 Primary frontend state model

The frontend should explicitly model:

- selected workspace
- sync state
- current version
- active session
- per-step execution state
- pending proposal
- dirty structured edits
- raw markdown mode state
- overwrite warning state when raw markdown saves will replace unsynced structured edits

This is broader than the current `drawer`-centric model and likely warrants a more structured per-page state shape.

## 5.3 Component changes

Recommended new or refactored home components:

- `WorkspaceShell`
- `PipeHeader`
- `SyncStatusBar`
- `StepList`
- `StepCard`
- `StepStatusBadge`
- `StepEditor`
- `StepDeltaPanel`
- `SessionPanel`
- `InputProfilesPanel`
- `PiPanel`
- `PatchReviewPanel`
- `SyncPreviewPanel`
- `RawMarkdownPanel`

## 5.4 Editing UX changes

Structured editing should support these targets first:

### Pipe-level

- pipe title
- pipe description
- schema
- test inputs / input profiles

### Step-level

- step title
- step description
- step code
- step conditions / DSL config

Suggested editing behavior:

- inline edit for title/description
- expandable editor for code
- structured form/editor for conditions
- explicit Save/Cancel for each edit scope
- autosave is optional later; do not start there

## 5.5 Raw markdown as secondary mode

Raw markdown should move behind an explicit toggle or secondary tab.

Recommended behavior:

- do not show raw markdown textarea as the default editor
- allow raw markdown editing directly in the web UI without a blocking sync/discard gate
- show a clear warning that saving raw markdown rebuilds `index.json` and replaces any unsynced structured edits
- keep raw mode as an advanced option with clear status messaging

## 5.6 Session and trace UX changes

The current separation between `/` and `/traces` should loosen.

Near term:

- keep `/traces` as the historical deep-dive page
- embed latest session and per-step trace info inline on the home page
- deep-link from a step to its fuller trace view

Longer term:

- the home page should answer most "what just happened?" questions without requiring page switching

## 5.7 Transport and live updates

The app already uses SSE. Keep that direction, but evolve the event model.

Needed event types include:

- `workspace_changed`
- `sync_state_changed`
- `session_created`
- `session_updated`
- `step_updated`
- `proposal_created`
- `proposal_applied`
- `pipe_executed`

The current generic `reload` event should become a compatibility path, not the primary update model.

---

## 6. Pi / LLM Integration Plan

Pi should become more useful by becoming more constrained.

## 6.1 Product rule for Pi

Pi interactions should be:

- **pipe-scoped** or **step-scoped** only
- **proposal-based** only
- **diff-first** always
- **structured-output** first
- **apply explicitly** only

No silent rewrites. No unbounded chat as the default editing path.

## 6.2 Pi interaction types

### Pipe-scoped

Use for:

- improve pipe description
- generate/update schema
- propose test inputs
- refactor overall flow
- suggest step insertion or reordering

### Step-scoped

Use for:

- revise step title
- revise step description
- rewrite step code
- simplify step conditions
- explain or fix a failing step

## 6.3 Context model for Pi prompts

Pi should receive:

### For pipe-scoped proposals

- current structured pipe (`index.json` subset)
- pipe description/schema/config
- recent session summary
- optionally recent failure context

### For step-scoped proposals

- target step fields
- relevant surrounding steps
- pipe description/schema
- latest before/after snapshot for that step if available
- latest error if applicable
- explicit instruction from the user

## 6.4 Expected Pi output shape

Pi should return a structured proposal envelope, not raw final text only.

Suggested output fields:

- `scope`
- `summary`
- `operations`
- `rationale`
- `warnings`
- `suggestedNextAction`

Optional additions:

- `testsSuggested`
- `assumptions`

## 6.5 Apply flow

Recommended interaction:

1. User opens Pi panel on a pipe or step.
2. Pi generates proposal.
3. UI renders field-level diff and code diff.
4. User chooses:
   - Apply
   - Apply + rerun from here
   - Apply + run tests
   - Refine
   - Discard
5. Applied proposal updates `index.json`, not markdown.
6. Workspace sync state becomes dirty.

## 6.6 Safety and trust rules

- proposals must be narrow by default
- large proposals should be split or flagged
- proposed scope must be visible before apply
- Pi should not touch unrelated steps unless the user explicitly asks for broader refactoring
- every proposal should cite the affected fields/steps

## 6.7 Near-term implementation strategy

Reuse the current `llmCommand.ts` machinery where useful, but move from action-specific raw text generation to proposal generation.

Migration path:

1. keep existing actions working
2. add proposal mode beside them
3. shift UI to proposal mode as the default
4. retire direct mutation-style actions once proposal mode is stable

---

## 7. Relationship Between `index.json`, Markdown, and `pd sync`

This is the most important workflow rule to make explicit.

## 7.1 Proposed invariant

### Structured editing path

- browser structured edits mutate `index.json`
- Pi proposals mutate `index.json` after approval
- `index.json` is the machine-edit source of truth
- markdown is not updated implicitly
- `pd sync` writes the current structured state back to markdown

### Raw markdown path

- raw markdown edits can also happen directly in the web UI
- saving raw markdown mutates the markdown file directly
- save immediately runs `pd build` to regenerate `index.json`
- the rebuilt `index.json` replaces the current structured workspace, even if unsynced structured edits existed before the raw save

## 7.2 Allowed transitions

### Markdown → structured

`pd build`

Use when:

- project startup
- raw markdown changed, including raw markdown saves from the web UI
- file watcher detects markdown edits
- sync completed and rebuild is needed for consistency

### Structured → markdown

`pd sync`

Use when:

- structured edits should become durable markdown
- Pi-generated proposals have been accepted and need to land in the source file
- user wants to commit or inspect the markdown artifact

## 7.3 Sync state model

The product should formalize these states:

- `clean` - the current structured workspace has no unsynced web changes
- `json_dirty` - structured workspace changed, markdown not yet synced
- `syncing` - sync/build operation is in progress

This state should appear clearly in the UI and the minimal metadata stored in `index.json`. External concurrent edits are not modeled in the first cut; the initial workflow uses explicit last-write-wins behavior instead.

## 7.4 Recommended workflow rules

1. **Structured mode saves to `index.json`, not markdown.**
2. **Pi applies to `index.json`, not markdown.**
3. **`pd sync` is the only structured-to-markdown path.**
4. **Raw markdown mode is explicit and secondary, but fully available in the web UI.**
5. **Saving raw markdown rebuilds and replaces the current `index.json`.**
6. **Concurrent web/external edits use simple last-write-wins behavior for now; no conflict resolution in the first cut.**

## 7.5 `pd sync` enhancements likely needed

The existing `pd sync` command is a good base but should grow into a stronger workflow tool.

Recommended enhancements:

- dry-run diff output that is easier to review
- sync preview API for the web UI
- basic write validation and clear error reporting
- automatic `pd build` after successful sync so markdown and `index.json` normalize immediately
- machine-readable sync result envelope for the UI
- clear overwrite semantics when a newer raw markdown save or newer sync wins

## 7.6 Why this relationship is good

This model:

- keeps markdown central for humans and git history
- gives tools a structured mutation substrate
- avoids brittle direct LLM markdown surgery
- makes sync explicit and understandable
- keeps the round-trip story legible

---

## 8. Execution and Session Model

The web-first experience will only feel coherent if execution is session-based.

## 8.1 Session lifecycle

### Create session

A session is created with:

- pipe identity
- structured version id/hash
- selected input profile or ad hoc input
- intended execution mode

### Execute session

System runs one of:

- full pipe
- run to step
- rerun from step
- single step
- continue from last completed step

### Update session

As execution progresses, update:

- overall session status
- per-step statuses
- before/after snapshots
- delta information
- errors
- timing

### Complete session

On completion, persist:

- final output
- step results
- partial/full trace metadata
- reuse eligibility for future reruns

## 8.2 Session statuses the UI should expose

At the pipe level:

- not started
- running
- completed
- failed
- stale after edit

At the step level:

- not run
- pending
- running
- done
- skipped
- failed
- stale
- reused snapshot

## 8.3 Snapshot reuse model

To make rerun-from-here fast and intuitive, the system should reuse upstream results when it is safe.

Recommended rule:

- each step has a fingerprint/hash derived from its relevant structured content
- if steps `0..N-1` are unchanged, the session may reuse the latest valid snapshot after step `N-1`
- when a step changes, that step and all downstream steps become stale
- upstream unchanged steps remain reusable

This is safer and more legible than keeping opaque hidden state.

## 8.4 Partial runs as first-class traces

Partial runs should persist with metadata such as:

- `mode`
- `startStepIndex`
- `endStepIndex`
- `executedStepIndices`
- `reusedSnapshotRef`
- `versionId`
- `inputProfileId`

This allows:

- inline session inspection
- later trace browsing
- comparison across reruns
- session resume behavior grounded in actual artifacts

## 8.5 Relationship to current endpoints

Near-term migration can wrap or evolve current behavior:

- existing `/api/run` becomes session-backed full run
- existing `/api/run-step` becomes session-backed partial run
- traces API begins returning session-aware metadata
- home UI uses session ids instead of only "latest output in drawer" semantics

---

## 9. Incremental Phases and Milestones

The fastest path is not a full rewrite. It is a staged evolution that validates the web-first workflow without painting the backend into a web-only corner.

## Phase 0 - Workflow invariants and backend groundwork

Goal: make source-of-truth rules explicit and build the minimum metadata needed for dirty/sync/session-aware behavior.

Deliverables:

- documented workspace/sync invariants
- minimal workspace metadata embedded in `index.json`
- explicit sync-state tracking
- stronger `pd sync` semantics and preview support
- type additions for sessions/proposals/workspaces

Success signal:

- the system can reliably answer "is markdown in sync with `index.json`?"

## Phase 1 - Sessionized execution on the current home page

Goal: make incremental execution first-class before changing too much editing UX.

Deliverables:

- run session backend
- partial runs persisted like real traces
- step status badges
- rerun-from-here / run-next / continue actions
- inline last-run summaries on steps

Success signal:

- the home page feels session-aware, not just output-drawer-aware

## Phase 2 - Structured step editing as the default

Goal: replace raw-markdown-first editing with structured step/pipe editing.

Deliverables:

- step editor components
- pipe-level structured editors
- dirty/stale propagation
- step-level save/cancel behavior
- secondary raw markdown mode with clear overwrite messaging

Success signal:

- most web edits happen without opening the raw markdown textarea

## Phase 3 - Pi proposals and patch review workflow

Goal: make Pi useful in the same structured, session-aware loop.

Deliverables:

- proposal schema
- step/pipe scoped Pi interactions
- diff review UI
- apply/refine/discard actions
- apply + rerun / apply + test shortcuts

Success signal:

- Pi changes feel safer and more actionable than the current one-click actions

## Phase 4 - Sync-centered polish and workflow hardening

Goal: make the structured-to-markdown loop trustworthy and routine.

Deliverables:

- sync preview panel
- explicit unsynced workspace badges
- rebuild-after-sync consistency flow
- clear last-write-wins messaging for raw markdown vs structured saves
- docs and UX copy that teach the model clearly

Success signal:

- users understand exactly when and how markdown updates happen

## Phase 5 - Deep integration and quality pass

Goal: reduce friction and connect the workflow into the rest of the product.

Deliverables:

- tighter home/traces linking
- input profile management polish
- keyboard shortcuts and quality-of-life improvements
- session history browsing from the home page
- performance and reliability hardening

Success signal:

- the browser workspace feels cohesive enough to be the flagship demo surface

---

## 10. Comprehensive TODO List / Checklist by Phase

## Phase 0 - Workflow invariants and backend groundwork

### Product / docs

- [ ] Document the dual-truth model clearly: markdown for humans, `index.json` for machine edits. *(described in this plan doc; no standalone reference doc yet)*
- [ ] Document that `pd sync` is the only structured-to-markdown path. *(described in this plan doc; no standalone reference doc yet)*
- [ ] Document that raw markdown editing is secondary and explicit. *(described in this plan doc; no standalone reference doc yet)*
- [ ] Document that TUI is out of near-term scope. *(described in this plan doc; no standalone reference doc yet)*

### Types / domain model

- [x] Extend `pipedown.d.ts` with workspace/session/proposal/input-profile types. *(WorkspaceMetadata, SyncState, SyncResult, RunSession, SessionStepRecord, PatchProposal, PatchOperation, InputProfile, PipeVersion, SessionMode, SessionStatus, StepStatus, ProposalStatus - all added)*
- [x] Add a formal `syncState` enum/type. *(`SyncState = "clean" | "json_dirty" | "syncing"` in pipedown.d.ts)*
- [x] Add step fingerprint/version metadata to the structured model. *(`Step.fingerprint` field + `computeStepFingerprint()` in pdBuild.ts)*
- [x] Introduce `stepId` now and persist it in `index.json`. *(`Step.stepId` field + `assignStepIds()` in pdBuild.ts)*

### Build/sync backend

- [x] Add minimal workspace metadata inside `index.json` for sync-state tracking. *(`Pipe.workspace` set by `assignStepIds()` during build)*
- [x] Persist `stepId` values in `index.json` and preserve them across rebuilds by matching against the prior `index.json` where possible. *(exact-match-by-index + name-match fallback in `assignStepIds()`)*
- [x] Extend `pd sync` to return a machine-readable result envelope. *(`SyncResult` populated on `input.syncResult` in syncCommand.ts)*
- [x] Add `pd sync --dry-run` improvements suitable for UI consumption. *(syncCommand.ts returns `SyncResult` with `markdown` field in dry-run mode)*
- [x] Add sync preview support in backend APIs. *(`GET /api/workspaces/:pipeName/sync-preview` in buildandserve.ts)*
- [x] Auto-run `pd build` after `pd sync` and implement consistently. *(syncCommand.ts calls `pdBuild()` after writing markdown, then stamps `lastSyncedAt`)*

### Tests

- [x] Add tests for sync-state transitions: clean → json_dirty → clean. *(workspace_test.ts: "sync-state transitions" test)*
- [x] Add tests that raw markdown save/build replaces unsynced structured state predictably. *(workspace_test.ts: "raw markdown save/build replaces unsynced structured state" - verifies rebuild from new markdown overwrites dirty workspace)*
- [x] Add tests for `pd sync` dry-run preview behavior. *(workspace_test.ts: "pd sync dry-run preview behavior" - verifies generated markdown reflects edits, disk file unchanged)*
- [x] Add tests that `stepId`s are preserved across rebuilds when steps can be matched and regenerated when they cannot. *(workspace_test.ts: preservation, reorder, new steps, rename - all covered)*

## Phase 1 - Sessionized execution on the current home page

### Backend

- [x] Introduce a run session model and persistence format. *(pdCli/sessionManager.ts: RunSession persisted as `.pd/<pipe>/sessions/<sessionId>.json`)*
- [x] Add session-aware wrappers around existing run/full and run-step flows. *(sessionManager.ts: `executeSession()` wraps step execution with session tracking)*
- [x] Persist partial runs with metadata equivalent to full runs. *(sessionManager.ts: partial runs via `to_step`, `from_step`, `single_step`, `continue` modes all persist identically)*
- [x] Store per-step before/after snapshots for executed steps. *(sessionManager.ts: `safeSnapshot()` captures before/after inline in SessionStepRecord)*
- [x] Compute/store per-step deltas. *(sessionManager.ts: `computeDelta()` stores added/modified/removed keys per step)*
- [x] Track per-step status transitions. *(sessionManager.ts: `updateStepStatus()` transitions pending→running→done/failed)*
- [x] Add session ids to run responses. *(buildandserve.ts: POST /api/sessions returns full session JSON with sessionId)*
- [x] Add session-fetch API. *(buildandserve.ts: GET /api/sessions/:project/:pipe/:sessionId)*
- [x] Add session event streaming over SSE. *(buildandserve.ts: broadcasts `session_step_updated` and `session_updated` events)*

### Frontend

- [x] Add pipe-level session summary state to the home page. *(state.js: activeSession, latestSessions, sessionLoading state properties)*
- [x] Add per-step status badges. *(MarkdownRenderer.js: colored status badges injected into step headings - ● done/green, ○ pending/gray, ◌ running/yellow, ✗ failed/red)*
- [x] Add **Run next** action. *(state.js: PD.actions.runNextStep - finds first pending step and runs it as single_step session)*
- [x] Add **Rerun from here** action. *(state.js: PD.actions.rerunFromStep - creates from_step session; button in MarkdownRenderer step toolbars)*
- [x] Add **Continue** action when a session is partially complete. *(state.js: PD.actions.continueSession - POSTs to /api/sessions/:project/:pipe/:sessionId/continue)*
- [x] Show latest output/delta inline on each step. *(RunDrawer.js: session summary panel with per-step status bar, expandable before/after/delta per step)*
- [ ] Preserve selected session context across page refreshes if possible.
- [x] Reduce reliance on the generic drawer for core execution understanding. *(RunDrawer.js: session summary section shows structured per-step results above raw output)*

### Trace integration

- [ ] Extend trace API payloads with session metadata.
- [ ] Deep-link from step cards to richer trace views.
- [ ] Show whether displayed trace data came from full run, partial run, or reused snapshot.

### Tests

- [x] Add tests for session creation and persistence. *(session_test.ts: creation, persistence/round-trip, readSession null case)*
- [x] Add tests for partial-run trace persistence. *(session_test.ts: to_step test verifies partial runs persist correctly)*
- [x] Add tests for run-to-step / rerun-from-step metadata correctness. *(session_test.ts: to_step + continue tests, computeStepsToExecute tests for all modes)*
- [x] Add tests for status computation at both pipe and step level. *(session_test.ts: full execution, to_step, continue - all verify step and session statuses)*

## Phase 2 — Structured step editing as the default

### Backend

- [x] Add structured pipe/step update endpoints. *(buildandserve.ts: PATCH /api/workspaces/:project/:pipe, PATCH .../steps/:stepIndex, POST .../steps, DELETE .../steps/:stepIndex, POST .../steps/reorder, POST .../sync, POST .../rebuild)*
- [x] Add field-level validation for title/description/code/config updates. *(structuredEdit.ts: editPipeFields validates field whitelist, editStepFields validates step index bounds)*
- [x] Add step fingerprint recomputation on structured edits. *(structuredEdit.ts: editStepFields calls computeStepFingerprint after code/config changes)*
- [x] Add stale propagation logic from the edited step onward. *(structuredEdit.ts: fingerprint changes on edited step; downstream steps detectable as stale by comparing fingerprints between sessions)*
- [x] Persist workspace dirty state after each structured save. *(structuredEdit.ts: all edit functions set workspace.syncState="json_dirty" and workspace.lastModifiedBy="web_edit")*

### Frontend shell

- [x] Replace DOM-injected hover-only controls with componentized step actions. *(MarkdownRenderer.js: Edit button added to each step toolbar alongside existing buttons)*
- [ ] Build a `StepCard`-based main workspace layout. *(deferred — current step-section DOM wrapping approach extended instead)*
- [x] Add a `SyncStatusBar` visible at all times for the selected pipe. *(SyncStatusBar.js: new component showing sync state + action buttons)*
- [x] Add visible state for `clean`, `unsynced`, and `syncing`. *(SyncStatusBar.js: green/orange/spinner indicators; state.js: PD.state.syncState)*

### Structured editors

- [x] Add pipe description editor. *(PipeToolbar.js: Edit Description button with inline textarea, Save/Cancel)*
- [x] Add schema editor. *(PipeToolbar.js: Edit Schema button with inline textarea, Save/Cancel)*
- [ ] Add input profile editor.
- [x] Add step title editor. *(MarkdownRenderer.js: inline text input for step name in edit mode)*
- [x] Add step description editor. *(MarkdownRenderer.js: inline textarea for description in edit mode)*
- [x] Add step code editor. *(MarkdownRenderer.js: inline monospace textarea for code in edit mode)*
- [ ] Add step conditions/config editor.
- [x] Support save/cancel per editor scope. *(each editor has explicit Save/Cancel buttons; state.js: editingStep, editStepBuffer, editingPipeField, editPipeBuffer)*

### Stale/rerun UX

- [x] Mark edited step and downstream steps stale immediately. *(state.js: saveStepEdit marks downstream steps stale in active session via fingerprint comparison)*
- [ ] Show "first stale step" callout.
- [ ] Offer **Rerun first stale step** after save.
- [ ] Show when upstream steps are safely reusable.

### Raw markdown fallback

- [ ] Move raw markdown editing into a secondary panel/tab. *(existing Edit button kept, not yet demoted to secondary panel)*
- [x] Warn that raw markdown save will rebuild and replace unsynced structured edits. *(state.js: enterEditMode shows confirm dialog when syncState is json_dirty)*
- [x] Keep raw mode fully web-accessible without requiring a local editor. *(existing MarkdownEditor component preserved)*
- [x] On raw save, trigger rebuild and refresh workspace. *(existing saveEdit flow triggers rebuild via POST /api/projects/.../files; SSE reload refreshes state)*

### Tests

- [x] Add API tests for structured step updates. *(structured_edit_test.ts: 18 tests covering pipe edits, step edits, insert, delete, reorder)*
- [x] Add tests for stale propagation rules. *(structured_edit_test.ts: fingerprint change detection test)*
- [x] Add tests for raw markdown overwrite messaging and behavior. *(workspace_test.ts: raw markdown overwrite test from Phase 0)*
- [x] Add tests for rebuild-after-raw-save behavior. *(structured_edit_test.ts: rebuildPipeFromMarkdown restores clean state)*

## Phase 3 - Pi proposals and patch review workflow

### Proposal model

- [ ] Define a proposal schema for pipe- and step-scoped patches.
- [ ] Implement proposal persistence and status transitions.
- [ ] Add validation that proposals only modify allowed scope.

### Pi backend

- [ ] Add a proposal-generation mode to existing LLM integration.
- [ ] Build step-scoped prompt assembly that includes local context and recent execution state.
- [ ] Build pipe-scoped prompt assembly for broader changes.
- [ ] Add refine/retry behavior that references the current proposal.
- [ ] Add proposal apply endpoint that mutates `index.json` only.

### Frontend

- [ ] Add a Pi side panel scoped to current pipe or step.
- [ ] Show affected fields/steps clearly before generation and after response.
- [ ] Render field-level and code diffs.
- [ ] Add Apply / Apply + rerun / Apply + test / Refine / Discard actions.
- [ ] Add proposal history for the current workspace.
- [ ] Surface warnings when Pi suggests large or multi-step changes.

### Safety / trust

- [ ] Add proposal size thresholds and warnings.
- [ ] Add scope-violation rejection if Pi touches unrelated targets.
- [ ] Log proposal provenance for debugging and trust-building.

### Tests

- [ ] Add tests for proposal parsing/validation.
- [ ] Add tests that step-scoped prompts do not mutate unrelated steps.
- [ ] Add tests for apply/discard/refine state transitions.
- [ ] Add tests for proposal-to-workspace dirty-state updates.

## Phase 4 - Sync-centered polish and workflow hardening

### Sync UX

- [ ] Add sync preview panel showing generated markdown diff.
- [ ] Add one obvious sync action in the workspace header.
- [ ] Show last synced timestamp and source baseline.
- [ ] Show which mode last wrote the current workspace (`pd sync` or raw markdown rebuild).

### Overwrite / rebuild semantics

- [ ] Document last-write-wins behavior for raw markdown saves and sync.
- [ ] Implement an explicit "rebuild from markdown" action.
- [ ] Implement an explicit "sync structured changes now" action.
- [ ] Do not attempt merge/conflict resolution in the first cut.

### Consistency / reliability

- [ ] Ensure sync clears dirty state only after successful markdown write and rebuild.
- [ ] Ensure failed sync leaves the workspace recoverable.
- [ ] Ensure file watcher/SSE events settle into one consistent current workspace instead of mixing stale and fresh state.

### Docs and onboarding

- [ ] Update dashboard copy/tooltips to explain build vs sync.
- [ ] Add a small in-product explanation of why structured edits go through `index.json`.
- [ ] Update developer docs for new workflow primitives and endpoints.

### Tests

- [ ] Add integration tests for structured edit → sync → rebuild → clean state.
- [ ] Add integration tests for sync failure recovery.
- [ ] Add tests for documented last-write-wins overwrite flows.

## Phase 5 - Deep integration and quality pass

### UX polish

- [ ] Add keyboard shortcuts for run next, rerun from here, ask Pi, and sync.
- [ ] Add better empty/loading/error states for session and proposal panels.
- [ ] Improve mobile/narrow-layout behavior enough to stay usable.

### Trace/history integration

- [ ] Add "recent sessions" list to the home page.
- [ ] Add compare-latest-vs-previous run summaries.
- [ ] Add quick links from traces back to the exact pipe/step workspace state.

### Performance

- [ ] Measure large-pipe rendering and session update performance.
- [ ] Virtualize or collapse step content where needed.
- [ ] Avoid full-page refetches for every local action.

### Quality / observability

- [ ] Add structured logging around workspace/sync/session/proposal flows.
- [ ] Add regression coverage for SSE-driven updates.
- [ ] Add manual QA checklist for edit/run/sync overwrite scenarios.

---

## 11. Risks, Open Questions, and Suggested Sequencing

## 11.1 Main risks

### Risk 1: source-of-truth confusion

If users cannot tell whether the current truth lives in markdown or `index.json`, trust will drop quickly.

Mitigation:

- make sync state always visible
- teach the model in-product
- keep transition rules explicit and few

### Risk 2: unsynced structured edits being clobbered

File watcher rebuilds or external markdown edits could overwrite the machine-edit workspace.

Mitigation:

- make the first cut explicitly last-write-wins instead of pretending to support conflict resolution
- show clear UI messaging before raw markdown saves and syncs overwrite another representation
- revisit stronger multi-writer conflict handling only after the web-first loop proves valuable

### Risk 3: building too much browser editor complexity too early

A rich browser workspace can become expensive fast.

Mitigation:

- start with structured field editors, not a full browser IDE
- keep raw markdown and external editor escape hatches
- focus on step-level edits first

### Risk 4: Pi proposals becoming too broad

Large multi-step rewrites will undermine trust and make review difficult.

Mitigation:

- default to narrow scope
- split broad requests into multiple proposals where possible
- add scope warnings and size thresholds

### Risk 5: session model complexity outrunning current execution architecture

The current run endpoints are simpler than the proposed session model.

Mitigation:

- wrap existing run mechanisms first
- persist session metadata incrementally
- avoid overengineering orchestration before basic session UX proves useful

## 11.2 Resolved decisions and remaining open questions

1. **Should `stepId` be introduced now, and if so how should it survive markdown round-trips?** Yes. Introduce `stepId` now, persist it in `index.json`, and keep markdown free of hidden metadata. During `pd build`, preserve existing `stepId`s by matching rebuilt steps against the prior `index.json` where possible; if a rebuilt step cannot be matched confidently, generate a new `stepId`. `stepIndex` remains a convenience address, not the durable identity.
2. **Should `pd sync` auto-rebuild after write, or should build remain a distinct explicit step under the hood?** Yes: `pd sync` should auto-run `pd build` afterward so markdown and `index.json` return to a normalized clean state.
3. **Where should workspace/session/proposal sidecar files live inside `.pd/`?** Simplify the first cut: keep minimal workspace metadata and `stepId`s inside `.pd/<pipe>/index.json`, keep sessions under `.pd/<pipe>/sessions/`, and only add `.pd/<pipe>/proposals/` if proposal history needs to survive restart. Do not add a separate `workspace.json` or a broader sidecar hierarchy yet.
4. **What is the best conflict UX when markdown changed externally while `index.json` is dirty?** For now, there is no conflict UX. Use explicit last-write-wins semantics: raw markdown saves rebuild and replace the structured workspace; `pd sync` overwrites markdown from the current `index.json`. Competing edits may be lost in this first cut, which is acceptable for the near-term web-first workflow.
5. **How much of the traces page should be absorbed into the home page versus linked to?** Show the latest run trace in a side panel on the home page and link out to the fuller traces page for deeper history.
6. **Should the first structured editor support step insertion/reordering, or start with field edits only?** Yes: the first structured editor should support insertion and reordering, not just field edits.

## 11.3 Suggested sequencing

Recommended order of work:

1. **Phase 0 first** - establish workspace/sync invariants and metadata.
2. **Phase 1 second** - make sessions and partial runs real before overhauling editing.
3. **Phase 2 third** - ship structured editing once stale/rerun semantics exist.
4. **Phase 3 fourth** - make Pi proposal-driven on top of structured editing.
5. **Phase 4 fifth** - harden the sync loop and overwrite semantics.
6. **Phase 5 last** - polish, optimize, and connect deeper history/trace flows.

This sequencing reduces the chance of building UI that later has to be rethought because session or sync primitives were underspecified.

---

## 12. Recommended First Slice

If only one implementation slice can happen first, it should be:

### Slice A: "Sessionized home page + explicit sync state"

That slice would include:

- visible sync state on the current pipe
- session-backed full/partial runs
- persistent partial traces
- per-step status badges
- rerun-from-here and run-next
- minimal sync metadata embedded in `index.json` for clean/dirty tracking

Why this slice first:

- it improves the existing home page immediately
- it validates the session model
- it prepares the UI for structured editing and Pi proposals without forcing a large editor rewrite yet

### Slice B: "Structured step editing for code/title/description"

As the next slice:

- add step-scoped structured edits
- mark downstream steps stale
- offer rerun from first stale step
- keep raw markdown as secondary mode

### Slice C: "Pi proposals for one step"

Then:

- step-scoped Pi prompt
- proposal preview
- apply + rerun flow

This would demonstrate the end-state loop clearly:

**open step → run → inspect → edit or ask Pi → review patch → apply → rerun → sync to markdown**

---

## Concise Completion Summary

- **Outcome:** comprehensive implementation plan for Pipedown's web-first workflow evolution, centered on structured step editing, sessionized execution, Pi patch proposals, and explicit `pd sync` write-back to markdown.
- **File written:** `WEB_FIRST_WORKFLOW_PLAN.md`
- **Main phases proposed:**
  1. Workflow invariants and backend groundwork
  2. Sessionized execution on the current home page
  3. Structured step editing as the default
  4. Pi proposals and patch review workflow
  5. Sync-centered polish and workflow hardening
  6. Deep integration and quality pass
- **Key decisions captured:** `stepId` lives in `index.json`, `pd sync` auto-rebuilds, metadata stays minimal and mostly inline, overwrite semantics are last-write-wins for now, the home page shows only the latest trace inline, and the first structured editor supports insertion/reordering.
