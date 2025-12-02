# Pipedown Core Library

Markdown → executable TypeScript pipelines. Deno runtime. Literate programming.

---

## Core Concepts

**Pipe** — A sequence of functions extracted from code blocks in a Markdown file → outputs a runnable TypeScript module in `.pd/`

**Step** — A single function from a fenced code block (`ts`/`js`). Properties: `code`, `name`, `funcName`, `range`, `inList`, `config`

**Input** — Data object passed through the pipeline. Each step mutates `input.*` and passes it forward.

---

## File Structure

| File | Purpose |
|------|---------|
| `deps.ts` | Central dependencies → exports `std`, `md`, `pd`, `esbuild` |
| `mdToPipe.ts` | Markdown → Pipe object. Pipeline: parseMarkdown → findRanges → findPipeName → findSteps → mergeMetaConfig → setupChecks |
| `rangeFinder.ts` | Identifies token ranges (code blocks, headings, lists, meta blocks). Exports: `rangeFinder`, `Tag`, `TokenType` |
| `pdBuild.ts` | Build orchestrator. Pipeline: copyFiles → parseMdFiles → mergeParentDirConfig → writePipeDir → writePipeJson → writePipeMd → transformMdFiles → writeDefaultGeneratedTemplates → writeUserTemplates → maybeExportPipe → report |
| `pipeToScript.ts` | Pipe → TypeScript. Pipeline: extractImportsFromSteps → sanitizeStepNames → stepsToFunctions → scriptTemplate |
| `exportPipe.ts` | Bundles pipes via esbuild when `pipe.config.build` defined |
| `defaultTemplateFiles.ts` | Generates: test.ts, cli.ts, server.ts, worker.ts, deno.json, replEval.ts |
| `stringTemplates.ts` | Template strings for generated files |
| `pdUtils.ts` | Utilities: `sanitizeString`, `fileName`, `fileDir` |
| `pipedown.d.ts` | Types: `Token`, `Step`, `Pipe`, `PipeConfig`, `Input`, `BuildInput` |

---

## Pipeline Pattern

`pd.process(funcs, input, opts)`

1. Takes array of functions
2. Each receives `(input, opts)`
3. Each mutates or returns input
4. Sequential execution
5. Errors → `input.errors[]`

---

## Markdown Transformation

**Supported languages:** ts, js, javascript, typescript  
**Meta languages:** json, yaml, yml  
**Step naming:** From preceding heading (`## Step Name`) or `anonymous{index}`  
**Config blocks:** JSON/YAML code blocks → deep merged into `pipe.config`

**Conditional execution** — List items before code block:
- `check:`, `if:`, `when:` — JSON pointer conditions
- `or:`, `and:`, `not:` — Logical operators
- `route:` — Route pattern matching
- `stop:`, `only:`, `flags:` — Flow control

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
- `config.or/and/not` — Logical conditions

### Pipe
- `name` — From H1 heading
- `cleanName` — Sanitized
- `steps` — Step[]
- `mdPath` — Source .md path
- `dir` — Output in .pd/
- `config.inputs` — Test inputs
- `config.templates` — Custom templates
- `config.build` — esbuild config
- `config.skip/exclude` — Regex patterns

---

## Build Output

Build files are stored in a global directory to share across projects:

```
~/.pipedown/
├── builds/
│   └── {projectName}/
│       ├── {pipeName}/
│       │   ├── index.ts      # Executable pipe
│       │   ├── index.json    # Raw Pipe object
│       │   ├── index.md      # Source copy
│       │   ├── test.ts       # Test file
│       │   ├── cli.ts        # CLI runner
│       │   ├── server.ts     # HTTP server
│       │   └── worker.ts     # Service worker
│       ├── deno.json         # Import map
│       └── replEval.ts       # REPL helper
└── projects.json             # Registry of all projects
```

The project name is derived from:
1. The `name` field in `config.json` (if present)
2. The current directory name (fallback)

---

## Dependencies

| Package | Use |
|---------|-----|
| `@std/collections` | deepMerge |
| `@std/fs` | exists, walk |
| `@std/path` | basename, dirname, join, parse, relative, globToRegExp |
| `@std/cli` | parseArgs |
| `@pd/pulldown-cmark` | Markdown parser |
| `@pd/pdpipe` | Pipeline processor |
| `@pd/pointers` | JSON pointer ops ($p) |
| `esbuild` | Bundler |

---

## JSON Pointers

Library: `@pd/pointers` (wraps jsonpointer)

- `$p.get(input, '/points/add')`
- `$p.set(input, '/points/amount', 10)`
- `$p.compile('/ranges/codeBlocks').get(input)`

Used in conditional checks to test input values.

---

## Testing

- Directory: `test/`
- Files: `*.md` in test/
- Inputs: Define in JSON code blocks → `pipe.config.inputs`
- Snapshots: `@std/testing/snapshot`

---

## Code Flow

```
pdBuild()
  → walk .md files
  → mdToPipe() per file
    → parseMarkdown → findRanges → findSteps
  → pipeToScript() → index.ts
  → defaultTemplateFiles() → supporting files
```

---

## Contributor Notes

**Skip:** `pdCli/` (CLI implementation, separate concern)

**Patterns:**
- Pipeline functions: `(input, opts) => void | input`
- Error handling: Push to `input.errors[]`, don't throw
- Async: All pipeline functions can be async

**Gotchas:**
- Ranges are token array indices, not line numbers
- Step names sanitized via `sanitizeString()`
- Parent `config.json` files merge into `pipe.config`
