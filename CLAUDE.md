# Pipedown

## Dev Server

Always start the `pd` dashboard server when working on UI/dashboard changes:

```
~/.deno/bin/deno run --no-check --unstable-kv -A test_serve.ts
```

This uses the launch config at `.claude/launch.json` (server name: `pd-dashboard`, port 8888).

The dashboard has three pages:
- `/` — Services (local built pipes)
- `/projects` — System-wide project explorer
- `/traces` — Execution traces

## Frontend Architecture

Dashboard frontend code lives in `pipedown/pdCli/frontend/` and is organized by page with shared utilities:

```
pdCli/frontend/
├── shared/          # Cross-page utilities loaded on every page
│   ├── base.css
│   ├── markdown.css
│   ├── jsonTree.css
│   ├── jsonTree.js       # exposes window.pd.jsonTree, window.pd.jtOpen
│   └── relativeTime.js   # exposes window.pd.relativeTime
├── home/
│   ├── state.js          # sets window.PD = { state, actions, utils, components }
│   ├── styles.css
│   ├── components/       # each component registers itself as PD.components.Name
│   └── app.js            # m.mount + SSE hot reload
├── projects/             # same structure
└── traces/               # same structure
```

### Global namespace convention

- **`window.pd`** — shared utilities only (`pd.jsonTree`, `pd.jtOpen`, `pd.relativeTime`)
- **`window.PD`** — per-page namespace; `state.js` initialises it, components extend it:
  - `PD.state` — reactive state object
  - `PD.actions` — data-fetching and mutation functions
  - `PD.utils` — pure helpers (formatters, renderers)
  - `PD.components.Name` — Mithril component objects

### Script load order in HTML shells

```html
<!-- 1. Shared utilities -->
<script src="/frontend/shared/jsonTree.js"></script>
<script src="/frontend/shared/relativeTime.js"></script>
<!-- 2. Page state (sets window.PD) -->
<script src="/frontend/<page>/state.js"></script>
<!-- 3. Components (any order; each registers into PD.components) -->
<script src="/frontend/<page>/components/Layout.js"></script>
<!-- ... -->
<!-- 4. app.js last — calls m.mount -->
<script src="/frontend/<page>/app.js"></script>
```

### Mithril gotchas

- `m.mount(el, Component)` does **not** call lifecycle hooks on the root component. Always wrap: `m.mount(el, { view: () => m(PD.components.Layout) })`.
- Trigger initial data fetching from `oncreate` on a component that is _not_ the `m.mount` root.

## Testing UI changes

Do **not** start the dev server, use preview tools, or attempt to verify UI changes yourself. The user will test and verify independently. Focus on writing correct code and explaining what changed.
