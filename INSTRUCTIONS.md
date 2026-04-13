# Pipedown Core Library

Markdown → executable TypeScript pipelines. Deno runtime. Literate programming.

---

## Core Concepts

**Pipe** — A sequence of functions extracted from code blocks in a Markdown file
→ outputs a runnable TypeScript module in `.pd/`

**Step** — A single function from a fenced code block (`ts`/`js`). Properties:
`code`, `name`, `funcName`, `range`, `inList`, `config`, `sourceMap`

**Input** — Data object passed through the pipeline. Each step mutates `input.*`
and passes it forward.

---

## File Structure

| File                      | Purpose                                                                                                                                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `deps.ts`                 | Central dependencies → exports `std`, `md`, `pd`, `esbuild`                                                                                                                                                        |
| `mdToPipe.ts`             | Markdown → Pipe object. Pipeline: parseMarkdown → findRanges → findPipeName → findSteps → mergeMetaConfig → setupChecks. Captures sourceMap line numbers for lossless reconstruction.                              |
| `rangeFinder.ts`          | Identifies token ranges (code blocks, headings, lists, meta blocks). Exports: `rangeFinder`, `Tag`, `TokenType`                                                                                                    |
| `pdBuild.ts`              | Build orchestrator. Pipeline: parseMdFiles → mergeParentDirConfig → writePipeDir → writePipeJson → writePipeMd → transformMdFiles → writeDefaultGeneratedTemplates → writeUserTemplates → maybeExportPipe → report |
| `pipeToScript.ts`         | Pipe → TypeScript. Pipeline: extractImportsFromSteps → sanitizeStepNames → stepsToFunctions → scriptTemplate                                                                                                       |
| `pipeToMarkdown.ts`       | Pipe JSON → Markdown. Two modes: lossless (splice changes into rawSource via sourceMap) and lossy (reconstruct from fields). Used by `pd sync` and LLM actions.                                                    |
| `extractSteps.ts`         | Step extraction logic: `parseStepIndices`, `buildExtractedPipe`, `performExtraction`. Used by `pd extract` CLI and dashboard API.                                                                                  |
| `exportPipe.ts`           | Bundles pipes via esbuild when `pipe.config.build` defined                                                                                                                                                         |
| `defaultTemplateFiles.ts` | Generates: test.ts, cli.ts, server.ts, devServer.ts, worker.ts, trace.ts, deno.json, replEval.ts. Handles @pkg/* aliases for installed packages.                                                                   |
| `stringTemplates.ts`      | Template strings for generated files (~450 lines)                                                                                                                                                                  |
| `pdUtils.ts`              | Utilities: `sanitizeString`, `fileName`, `fileDir`                                                                                                                                                                 |
| `pdConfig.ts`             | Config from deno.json `"pipedown"` property (primary) or config.json (fallback). Exports: `readPipedownConfig`, `writePipedownConfig`                                                                              |
| `packageManifest.ts`      | pipedown.json manifest: `validateManifest`, `readManifest`, `resolvePackageFiles`, `resolveBuildArtifacts`                                                                                                         |
| `pipedown.d.ts`           | Types: `Token`, `Step`, `Pipe`, `PipeConfig`, `Input`, `BuildInput`                                                                                                                                                |

---

## CLI Commands (pdCli/)

| Command       | Usage                                        | Purpose                                                              |
| ------------- | -------------------------------------------- | -------------------------------------------------------------------- |
| `pd build`    | `pd build [--debug] [--json]`                | Build all .md → .pd/                                                 |
| `pd run`      | `pd run <pipe.md> [--input '{}'] [-- flags]` | Execute a pipeline                                                   |
| `pd serve`    | `pd serve <pipe.md> [--port N] [--dev]`      | HTTP server. `--dev` launches dashboard with hot reload              |
| `pd test`     | `pd test [-u]`                               | Snapshot test all pipes                                              |
| `pd sync`     | `pd sync <pipe> [--dry-run]`                 | Regenerate .md from .pd/index.json                                   |
| `pd extract`  | `pd extract <file.md> <indices> <name>`      | Extract steps into sub-pipe. Indices: `2`, `2-5`, `1,3,5`, `0,2-4,6` |
| `pd llm`      | `pd llm <file> <step> <instruction>`         | LLM-assisted code generation                                         |
| `pd watch`    | `pd watch`                                   | File watcher with auto-rebuild                                       |
| `pd repl`     | `pd repl`                                    | Interactive REPL with all pipes loaded                               |
| `pd list`     | `pd list`                                    | List available pipes                                                 |
| `pd clean`    | `pd clean`                                   | Remove .pd/ directory                                                |
| `pd inspect`  | `pd inspect <pipe>`                          | Inspect pipe structure                                               |
| `pd pack`     | `pd pack`                                    | Package pipe for distribution                                        |
| `pd install`  | `pd install <pkg>`                           | Install a pipedown package                                           |
| `pd run-step` | `pd run-step <pipe> <step>`                  | Run individual step                                                  |
| `pd run-with` | `pd run-with <wrapper> <pipe> <input>`       | Run with template wrapper                                            |

### Dashboard (pd serve --dev)

Three pages served by `buildandserve.ts`:

- `/` — Home: local pipes, inline markdown editing, LLM actions, step extraction
- `/projects` — Multi-project explorer with new project/pipe creation
- `/traces` — Execution trace viewer

Frontend: Mithril.js SPA in `pdCli/frontend/` with `shared/`, `home/`,
`projects/`, `traces/` directories. Convention: `window.pd` for shared utils,
`window.PD` for per-page namespace.

### LLM Integration

`llmCommand.ts` exports `callLLM()` (uses `llm` CLI with claude-sonnet-4.6) and
`getPipedownSystemPrompt()` (reads LLM.md from disk, cached). Dashboard actions:
`description`, `schema`, `tests`, `step-title`, `step-description`, `step-code`.

---

## Pipeline Pattern

`pd.process(funcs, input, opts)`

1. Takes array of async stage functions
2. Each receives `(input, opts)` — `opts` is the Pipe instance
3. Each mutates or returns input
4. Sequential execution
5. Errors → `input.errors[]` (pipeline continues)

### Conditional Execution Guards (pdPipe)

Guards evaluated in order:

1. **`only`** — Execute this step exclusively, skip all others
2. **`stop`** — Halt processing after this step index
3. **Error checking** — Short-circuit if prior steps failed
4. **`not`** — Skip if JSON-pointer condition is truthy
5. **`check`/`and`/`or`** — Boolean gate logic
6. **`routes`** — URL-pattern matching (server mode)
7. **`methods`** — HTTP method filtering (GET, POST, etc.)

---

## Markdown Transformation

**Supported languages:** ts, js, javascript, typescript **Meta languages:**
json, yaml, yml **Step naming:** From preceding heading (`## Step Name`) or
`anonymous{index}` **Config blocks:** JSON/YAML code blocks → deep merged into
`pipe.config`

**Conditional execution** — List items before code block:

- `check:`, `if:`, `when:` — JSON pointer conditions (OR logic)
- `or:`, `and:`, `not:` — Logical operators
- `route:` — URL pattern matching (URLPattern API)
- `method:` — HTTP method filtering (GET, POST, etc.)
- `type:` — Response content-type shorthand (html, json, xml, css, js, stream)
- `stop:`, `only:`, `flags:` — Flow control
- `mock:` — Test mocking

Values are JSON pointers: `/points/add`

---

## Data Structures

### Token

- `type` — START | END | TEXT
- `tag` — CODE_BLOCK | HEADING | LIST | ITEM
- `content` — Text content
- `level` — Heading level (1-6)
- `language` — Code block language

### Step

- `code` — Extracted code
- `range` — [startIndex, endIndex] in token array
- `name` — From heading
- `funcName` — Sanitized identifier
- `inList` — Boolean (conditional execution context)
- `config.checks` — JSON pointers to evaluate
- `config.routes` — Route patterns
- `config.methods` — HTTP methods
- `config.contentType` — Response content-type
- `config.or/and/not` — Logical conditions
- `sourceMap` — `{ headingLine, codeStartLine, codeEndLine }` (0-indexed line
  numbers for lossless reconstruction)
- `originalCode` / `originalName` / `originalDescription` — Values at parse time
  (mutation detection)

### Pipe

- `name` — From H1 heading
- `cleanName` — Sanitized
- `steps` — Step[]
- `mdPath` — Source .md path
- `dir` — Output in .pd/
- `rawSource` — Original markdown (for lossless reconstruction)
- `pipeDescription` — Prose below H1
- `originalPipeDescription` — At parse time
- `config.inputs` — Test inputs
- `config.templates` — Custom templates
- `config.build` — esbuild config (BuildOptions[])
- `config.skip/exclude` — Regex patterns

---

## Build Output

```
.pd/
├── {pipeName}/
│   ├── index.ts      # Executable pipe
│   ├── index.json    # Raw Pipe object (the neutral interchange format)
│   ├── index.md      # Source copy
│   ├── test.ts       # Snapshot test file
│   ├── cli.ts        # CLI runner
│   ├── server.ts     # HTTP server
│   ├── devServer.ts  # Dev server with hot reload + tracing
│   ├── worker.ts     # Service worker
│   └── trace.ts      # Execution tracing
├── deno.json         # Import map (pipes + @pkg/* aliases)
└── replEval.ts       # REPL helper
```

---

## Bidirectional Markdown Round-Trip

```
Markdown  ──pd build──▶  index.json  ──pd sync──▶  Markdown
(human)                    (LLM)                    (human)
```

**Lossless mode** (when `pipe.rawSource` + `step.sourceMap` available):

- Splices changes into original source at precise line ranges
- Preserves original formatting, DSL directives, blockquotes
- Detects mutations via `original*` fields

**Lossy mode** (fallback):

- Reconstructs from structured fields only
- Clean, predictable markdown

---

## Dependencies

| Package            | Version | Use                                                    |
| ------------------ | ------- | ------------------------------------------------------ |
| `@std/collections` | 1.1.6   | deepMerge                                              |
| `@std/fs`          | 1.0.23  | exists, walk                                           |
| `@std/path`        | 1.1.4   | basename, dirname, join, parse, relative, globToRegExp |
| `@std/fmt`         | 1.0.9   | colors                                                 |
| `@std/http`        | 1.0.25  | serveFile                                              |
| `@std/async`       | 1.2.0   | debounce                                               |
| `@std/cli`         | 1.0.28  | parseArgs                                              |
| `@cliffy/keycode`  | 1.0.0   | Keycode parsing (REPL)                                 |
| `markdown-it`      | 14.1.1  | Markdown parser                                        |
| `@pd/pdpipe`       | 0.2.2   | Pipeline processor                                     |
| `@pd/pointers`     | 0.1.1   | JSON pointer ops ($p)                                  |
| `esbuild`          | 0.25+   | Bundler                                                |

---

## JSON Pointers

Library: `@pd/pointers` (wraps jsonpointer)

- `$p.get(input, '/points/add')`
- `$p.set(input, '/points/amount', 10)`
- `$p.compile('/ranges/codeBlocks').get(input)`

Used in conditional checks to test input values and in step code for nested
access.

---

## Testing

- Directory: `test/`
- Test files: `extractSteps_test.ts`, `mdToPipe_test.ts`,
  `pipeToMarkdown_test.ts`, `pipeToScript_test.ts`, `pdBuild_test.ts`,
  `rangeFinder_test.ts`, `pdUtils_test.ts`
- Inputs: Define in JSON code blocks → `pipe.config.inputs`
- Snapshots: `@std/testing/snapshot`

---

## Code Flow

```
pdBuild()
  → walk .md files (respects .gitignore, skip/exclude patterns)
  → mdToPipe() per file
    → parseMarkdown → findRanges → findSteps (with sourceMap)
  → mergeParentDirConfig() (deno.json "pipedown" + config.json)
  → pipeToScript() → index.ts
  → defaultTemplateFiles() → supporting files
  → maybeExportPipe() → esbuild bundles (if config.build)
```

---

## Contributor Notes

**Patterns:**

- Pipeline functions: `(input, opts) => void | input`
- Error handling: Push to `input.errors[]`, don't throw
- Async: All pipeline functions can be async
- Config: deno.json `"pipedown"` property preferred over config.json

**Gotchas:**

- Ranges are token array indices, not line numbers
- Step names sanitized via `sanitizeString()`
- Parent `config.json` / deno.json files merge into `pipe.config`
- sourceMap line numbers are 0-indexed
- `rawSource` is set during mdToPipe for lossless reconstruction
- `buildPipeContextHeader` and `buildContextPrompt` are async (read LLM.md from
  disk)
