# Pipedown Workflow Proposal

## Goal

Propose viable directions for moving Pipedown toward a more integrated, iterative, interactive workflow for users who want to:

- navigate through steps interactively
- edit steps
- run pipes incrementally
- generate content with Pi conveniently

This proposal is based on:

- `LLM.md`
- `pdCli/frontend/home/*`
- `pdCli/frontend/projects/*`
- `pdCli/frontend/traces/*`
- shared frontend utilities in `pdCli/frontend/shared/*`

---

## 1. What the current product already does well

Pipedown already has the beginnings of a strong interactive workflow.

### The core model is a good fit for iteration

`LLM.md` describes a pipeline format that is naturally step-oriented:

- markdown is the authoring format
- `##` headings define steps
- each step mutates a shared `input`
- steps can be conditionally run with list DSL directives
- pipes can be built to `index.json` and synced back to markdown
- there are already CLI affordances for `run`, `test`, `extract`, `sync`, and `repl`

That means Pipedown is already structured around the exact unit users want to interact with: the step.

### The current web experience is meaningfully better than a typical “view source and click run” dashboard

From the frontend implementation, the home page already provides:

- a recent + project-based pipe navigator
- rendered markdown as the primary reading surface
- per-step hover toolbars
- full-pipe runs and “run to here” partial runs
- input history and custom JSON input editing
- an in-browser markdown editor
- LLM actions for pipe description, schema, tests, step title, step description, and step code
- extraction of selected steps into a sub-pipe
- a run drawer that streams output and can show structured JSON or trace data
- SSE-based refresh and URL hash state restoration

The other pages also matter:

- `/projects` gives a cleaner project/pipe explorer and creation flow
- `/traces` gives a dedicated trace browser with step-by-step inspection

### Current strengths worth preserving

1. **Markdown remains the center of gravity.** The product still feels doc-first, which is a strong differentiator.
2. **The web UI is already not just CRUD.** It supports running, tracing, editing, and AI-assisted generation.
3. **The trace model is valuable.** Seeing input/output and per-step deltas is a strong base for iterative work.
4. **The `index.json` round-trip is strategically important.** It creates a structured layer that can support safer editing, LLM patches, and alternative frontends.
5. **The existing CLI and editor handoff matter.** `pd run`, `pd repl`, and “Open in Editor” show that Pipedown does not have to be web-only.

---

## 2. Inferred current interaction model

Today, the product is effectively split into three surfaces:

### A. Home page = main working surface

The home page is the closest thing to an IDE today:

- browse/select a pipe
- read rendered markdown
- hover a step to act on it
- run whole pipe or partial pipe
- inspect output in a right-side drawer
- optionally switch into raw markdown edit mode
- optionally trigger Pi actions

This is a **document-plus-overlay** model. The markdown stays visually primary; actions are layered on top.

### B. Projects page = inventory / setup surface

The projects page is more like a project explorer:

- browse all projects
- create projects
- create pipes
- view markdown

It is not yet a serious iterative workspace, but it is useful for orientation and setup.

### C. Traces page = observability surface

The traces page is the richest place for understanding execution after the fact:

- select a trace
- inspect input/output/raw JSON
- inspect per-step before/after state and deltas

This is valuable, but it is currently a separate place from the authoring/run loop.

---

## 3. Key gaps between current state and an ideal iterative workflow

The current product has many pieces, but they are not yet one coherent loop.

### Gap 1: navigation is step-aware, but not session-aware

Users can run a whole pipe or “run to here,” but there is no durable notion of:

- current step
- last successful step
- failed step
- dirty/stale steps after an edit
- resume from last known state
- compare before/after across reruns

In other words, Pipedown has **step actions**, but not yet an **interactive execution session**.

### Gap 2: editing is still coarse

The current editing choices are:

- edit raw markdown in a large textarea
- open the file in an external editor
- use Pi buttons that trigger preset backend actions

What is missing:

- inline editing of a single step
- structural editing of step title / description / code / DSL separately
- safe preview/apply for Pi-generated changes
- an obvious “edit this step, then rerun from here” loop

### Gap 3: partial execution is useful, but not first-class

The home UI supports partial runs, but the experience still feels like a special command, not the main mode of work.

Missing pieces include:

- persistent traces for partial runs
- step output snapshots attached to the current run session
- rerun-from-step / run-next-step / run-selected-range
- explicit display of which steps executed, skipped, or errored
- cached or resumable state between runs

### Gap 4: Pi is helpful, but not yet conversational or iterative

Current Pi affordances are one-click actions:

- description
- schema
- tests
- step title
- step description
- step code

That is useful, but limited. Users who want iterative generation usually want:

- ask Pi with richer context
- target current step or selection
- preview diff before apply
- refine the result with follow-up prompts
- generate and immediately run/test the result

### Gap 5: web authoring and editor+bash authoring are not the same workflow

The current web UI is becoming capable, but for many users the best writing/debugging environment is still:

- local editor
- terminal
- fast reruns
- grep / git / shell tools nearby

Today, those users do not yet get an equally integrated Pipedown-native iterative workflow.

### Gap 6: the best data is split across pages

The authoring surface, trace surface, and project surface are separate. That separation keeps pages simple, but it also creates friction:

- run in one place
- inspect deep trace in another
- browse projects in another
- edit in yet another place

This makes the product feel like useful tools placed next to each other rather than one coherent studio.

---

## 4. Design principles for the next phase

Regardless of surface, I think Pipedown should optimize for these principles:

1. **The step should be the primary interaction unit.**
2. **Execution should feel session-based, not one-shot.**
3. **Editing and rerunning should be tightly coupled.**
4. **Pi should generate patches, not just fire-and-forget text.**
5. **Markdown should remain the source of truth for humans.**
6. **`index.json` should become the structured mutation layer for tools and AI.**
7. **Web, CLI, editor, and TUI should share backend primitives wherever possible.**

---

## 5. Cross-cutting architecture I would recommend no matter which direction wins

Before the product picks a dominant surface, it should add a few shared primitives.

### A. Introduce a first-class “run session” model

Instead of thinking only in terms of “run pipe” and “run step,” introduce a session concept:

- `sessionId`
- pipe identity + version hash
- selected input profile
- execution target (full pipe / through step / from step / single step)
- ordered step statuses: pending, running, skipped, done, error, stale
- per-step snapshots: before, after, duration, stdout/stderr, errors
- links to persisted traces

This would immediately unlock better UX in any surface.

### B. Persist partial runs like real traces

Right now, full runs and partial runs feel asymmetrical. That should change.

Partial runs should produce inspectable artifacts too, ideally with clear metadata like:

- run mode: full / to-step / from-step / single-step
- step range executed
- baseline input
- resulting intermediate state

That makes incremental work much more credible.

### C. Treat Pi output as structured patches

The `index.json` round-trip in `LLM.md` is the key asset here.

Rather than only returning final text, Pi operations should be able to produce:

- a patch against `index.json`
- or a patch against markdown with source-map awareness
- plus a human-readable diff preview
- plus apply / discard / refine actions

This is how Pi becomes convenient without feeling dangerous.

### D. Add explicit input profiles

Input history from traces is a great start, but iterative work needs a clearer model:

- named ad hoc inputs for local experimentation
- maybe “saved inputs” beside `config.inputs`
- quick selection of baseline input when rerunning from a step

### E. Make surface handoff intentional

Wherever the user is, they should be able to jump cleanly to another surface with the same context:

- open current pipe + step in editor
- open current run session in traces/web/TUI
- reopen last trace from CLI
- launch Pi prompt scoped to current step

---

## 6. Option 1: Web-first evolution

### UX description

This path treats the browser as the primary integrated workspace.

The ideal experience would evolve the current home page into a more explicit **pipe studio**:

- left sidebar: recent pipes / projects
- center: step-oriented pipe canvas
- right panel: session output, traces, and Pi assistant

Instead of hover-only step controls, each step becomes a richer card/section with:

- title, description, code, DSL summary
- status badge: not run / ran / changed / failed / skipped
- quick actions: edit, run next, run to here, rerun from here, ask Pi
- inline before/after delta from the most recent session

The user flow becomes:

1. open a pipe
2. choose or edit input
3. run step-by-step or run to cursor
4. inspect intermediate state inline
5. edit a step inline
6. ask Pi to revise that step
7. preview/apply the change
8. rerun from the edited step

### Likely architecture direction

- keep markdown as the primary display, but move from DOM-injected hover toolbars toward a richer step-aware component model
- add a session API and stream session updates to the browser
- unify current drawer output and trace data into a session timeline/panel
- use `index.json` as the structured backing model for step editing and Pi patching
- eventually keep markdown rendering, but treat each step as an addressable object with edit/run state

### Implementation scope / rough phases

#### Phase 1: strengthen current home page

- add explicit step status badges
- persist partial-run traces
- show last run result inline per step
- add “rerun from here” and “run next”
- improve Pi action affordances with clearer targeting and loading states

#### Phase 2: add inline structured editing

- edit title / description / code / DSL separately
- preview changes before save
- after save, mark downstream steps stale
- offer immediate rerun from the first stale step

#### Phase 3: add Pi workspace semantics

- conversational Pi side panel scoped to pipe/step/selection
- generate patch preview instead of silent rewrite
- “apply + rerun” and “apply + test” actions
- compare current version vs Pi proposal vs last successful run

### Tradeoffs

#### Strengths

- best onboarding and discoverability
- easiest to demonstrate visually
- leverages the substantial progress already made in the web UI
- best path for integrated traces + AI + step controls in one place

#### Weaknesses

- browser is still not most users’ preferred long-form authoring surface
- inline editing complexity can grow quickly
- the current home page implementation uses imperative DOM injection for step controls, which will get harder to scale into a richer IDE-like experience
- there is a risk of building a lot of editor behavior in the browser that still loses to a real editor

### When this option is best

Choose this if Pipedown wants the flagship experience to be highly approachable, visual, and self-contained in one tab.

---

## 7. Option 2: Editor+bash-first evolution

### UX description

This path assumes that for many serious users, the most natural workflow remains:

- edit markdown in a real editor
- run from terminal
- inspect state quickly
- use Pi from the editor or CLI

Under this model, the web UI becomes an excellent explorer/control plane, but not necessarily the default authoring surface.

A strong editor+bash workflow could look like:

- open `pipe.md` in editor
- run `pd` in an interactive session mode for that pipe
- navigate steps from terminal or editor commands
- run next / run to step / rerun from step
- inspect intermediate state in terminal, local HTML, or trace viewer
- trigger Pi on current step from editor command or CLI
- preview patch and apply back to markdown

This could start with CLI and later gain editor integration.

### Likely architecture direction

- invest first in a strong session runner available from CLI
- evolve `pd repl` or add a new interactive command focused on step navigation and reruns
- persist session state and traces locally, not only in the web runtime
- add editor-facing commands/code actions rather than recreating editing in browser
- use the same patch/session APIs as the web path

Possible capabilities:

- `pd session pipe.md`
- `next`, `run-to 4`, `rerun-from 3`, `show input`, `show delta 3`
- `pd pi step-code --step 3 --preview`
- `pd open trace <sessionId>`

I would not get attached to exact command names yet, but the model matters.

### Implementation scope / rough phases

#### Phase 1: make CLI incremental execution first-class

- add session-based CLI mode
- persist partial-run snapshots and deltas
- support run-next / run-to / rerun-from
- improve terminal formatting for step status and errors

#### Phase 2: connect editor context

- open current file/step from CLI output
- editor command/code action for “Run current step” and “Ask Pi about current step”
- patch preview/apply flow for Pi output
- easy jump from editor to trace/session view

#### Phase 3: tighten loop with lightweight companion surfaces

- optional small local dashboard for traces/session history
- named input profiles and saved experiment state
- editor decorations for last run status, stale steps, and failures

### Tradeoffs

#### Strengths

- best fit for users who already live in editor + shell
- lowest risk of overbuilding a browser editor
- aligns with Pipedown’s markdown-on-disk philosophy
- can make incremental execution feel extremely fast and ergonomic

#### Weaknesses

- weaker initial discoverability and demo-ability than a polished web studio
- more surface fragmentation unless carefully designed
- editor integrations can become IDE-specific if not kept generic
- less compelling for non-terminal-first users

### When this option is best

Choose this if the primary target user is a developer who already prefers local files, shell commands, and editor-native workflows.

---

## 8. Option 3: Terminal TUI / hybrid experience

### UX description

This is the middle path: keep the power-user feel of editor+bash, but provide a more integrated, guided interface than plain CLI commands.

A `pd tui` or substantially upgraded `pd repl` could provide:

- left pane: projects / pipes / step list
- center pane: current step content or rendered summary
- right pane: current session state, delta, errors, or Pi panel
- bottom area: command prompt / logs

Key interactions:

- j/k or arrows to move between steps
- enter to expand
- `r` run next / `R` rerun from here / `g` ask Pi / `e` open in `$EDITOR`
- inspect before/after state without leaving terminal
- keep bash and git workflows one keystroke away

This is especially attractive because the source material is markdown and code, which already feels natural in terminal workflows.

### Likely architecture direction

- build on the same session and patch primitives as the other options
- reuse trace/session data model from web
- do **not** try to build a full embedded editor at first
- instead, support seamless handoff to `$EDITOR` for real editing, then return to the TUI and rerun
- optionally allow a small rendered markdown preview for context

This path is strongest if it is explicitly hybrid:

- TUI for navigation/run/inspect/Pi
- real editor for long-form editing
- web traces/dashboard still available when needed

### Implementation scope / rough phases

#### Phase 1: session-oriented TUI prototype

- pick pipe
- navigate steps
- run full / to-step / from-step / next
- inspect input/output/delta/errors per step

#### Phase 2: editing + Pi handoff

- open current step in editor
- return to TUI and mark downstream steps stale
- Pi panel with patch preview/apply
- named inputs and quick rerun shortcuts

#### Phase 3: deepen hybrid integrations

- link to web trace view for rich JSON/tree inspection
- optional side-by-side markdown rendering
- reusable command palette shared conceptually with web and CLI

### Tradeoffs

#### Strengths

- more integrated than raw shell commands
- closer to the ergonomics terminal-oriented users want
- likely better than browser for rapid step-by-step experimentation
- avoids pretending the browser must do everything

#### Weaknesses

- highest product/design/build cost if treated as a fully separate surface
- another frontend to maintain
- terminal UI can be harder to polish than it first appears
- still probably needs editor handoff, so it is not truly one-surface

### When this option is best

Choose this if Pipedown wants a distinctive power-user experience that still feels cohesive and interactive without becoming browser-centric.

---

## 9. Comparison summary

| Direction | Best at | Main risk | Time-to-value |
|---|---|---|---|
| Web-first | discoverability, integrated demoable workflow, AI + traces in one place | building too much browser-IDE surface area | fastest visible progress |
| Editor+bash-first | serious authoring, speed, alignment with current developer habits | weaker cohesion if not backed by shared session model | strong for power users, moderate for broader users |
| TUI / hybrid | integrated power-user experience | extra surface area and maintenance | medium; valuable once shared primitives exist |

---

## 10. Recommendation

## Short version

**Do not force a single-surface answer yet.**

My recommendation is:

1. **Build shared workflow primitives first**: session model, partial traces, structured Pi patches, saved inputs.
2. **Use the web experience as the fastest proving ground** for integrated step/session UX, because it already has substantial momentum.
3. **Aim for a hybrid end state** where:
   - editor is still the preferred long-form authoring environment for many users
   - web is the best control/inspection surface
   - a future TUI can emerge if the session model proves valuable enough

### More opinionated recommendation

If I had to pick one practical near-term bet, I would choose:

**Web-first evolution in the short term, but architected for an editor+bash-friendly hybrid future.**

Why:

- the web app already has real momentum and useful interaction patterns
- it is the easiest place to learn what an interactive run/edit/Pi loop should feel like
- but markdown authoring and shell-driven debugging are too central to assume the browser should become the only serious workspace

So the right strategy is not “web only.” It is:

- **validate the interaction model in web**
- **avoid web-specific architecture traps**
- **expose the same capabilities to CLI/editor later**

---

## 11. Concrete near-term roadmap I would suggest

### Phase 0: tighten the current web loop without major refactors

Focus on high-leverage improvements to the existing home page:

- persist partial-run traces
- add run-next and rerun-from-here
- show per-step last-run status inline
- make Pi actions clearly preview changes before applying
- add stronger links between home and traces for the same execution

This would already make the current dashboard feel much more iterative.

### Phase 1: add shared session + patch primitives

Build a backend/workflow layer that all surfaces can use:

- session lifecycle API
- step snapshot storage
- partial trace persistence
- structured Pi patch generation + apply
- named/saved input profiles

### Phase 2: choose where to spend surface effort

After Phase 1, reevaluate based on actual usage:

- if users stay in browser: deepen the web studio
- if users mostly live in editor/terminal: add session CLI + editor integrations
- if a guided terminal workflow seems compelling: evolve `pd repl` into a real TUI

This is a better decision point than choosing purely by instinct now.

---

## 12. Risks and open questions

1. **What should be the canonical editable representation for Pi?**
   - direct markdown patching is human-friendly but fragile
   - `index.json` patching is safer but needs excellent round-trip UX

> Go for index.json patching. The json represetnation should be the source of truth for the LLM. `pd sync` can be leveraged for Pi/the LLM to apply changes back to the markdown files.

2. **How much state should be persisted between iterative runs?**
   - enough to support resume/replay
   - not so much that users become confused about stale hidden state

> Agreed.

3. **Should inline web editing stay raw-markdown-first or become structured?**
   - raw markdown preserves the product’s identity
   - structured editing improves step-level workflows
   - the best answer may be both, with easy toggling

> Let's keep the raw/holistic markdown editing as a sub-option, but not the primary experience. Let's go for a more structured editing experience.

4. **How conversational should Pi be inside the product?**
   - command-like helpers are predictable
   - open-ended chat is flexible
   - the likely sweet spot is scoped conversation with patch preview

> Keep the Pi interactions pipe or step scoped. Interactions should result in a focused, diffable patch.

5. **Is TUI a real product direction or just a delivery mechanism for power users?**
   - important to validate before investing heavily in a second major frontend

> Let's skip the TUI for now.

---

## Final takeaway

Pipedown already has most of the ingredients for an excellent iterative workflow; what it lacks is a **unified session model** tying together step navigation, editing, partial execution, traces, and Pi-assisted change.

The strongest strategic move is to build that shared workflow layer first, then let it power multiple credible product directions:

- a stronger web studio
- a better editor+bash workflow
- a future TUI/hybrid experience

If forced to sequence the work, I would:

1. improve the current web home page as the quickest learning surface
2. build shared session/patch primitives underneath it
3. preserve the option to make editor+bash the dominant daily workflow for power users
