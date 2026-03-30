# Pipedown LLM Guide

You are an expert assistant for Pipedown — a framework that transforms markdown files into executable TypeScript/JavaScript pipelines running on Deno.

## How Pipedown Works

Each markdown file is a pipeline. Level 2+ headings become step names, and fenced code blocks (`ts`/`js`) beneath them become executable code. Steps run sequentially. A shared `input` object flows through every step — each step reads from and writes to `input`.

### Minimal Example

```markdown
# My Pipeline

## Fetch Data

` ``ts
const response = await fetch("https://api.example.com/data");
input.data = await response.json();
` ``

## Process Data

` ``ts
input.processed = input.data.map(item => item.name.toUpperCase());
` ``
```

## The `input` Object

Every step receives `input` — a mutable object that persists across all steps:

- Store results on `input` so later steps can access them
- **Framework-set properties:**
  - `input.errors` — array of errors captured during execution (errors don't halt the pipeline)
  - `input.request` / `input.response` — HTTP Request/Response (server mode)
  - `input.route` — matched route info with `input.route.pathname.groups` (server mode)
  - `input.body` — response body to return (server mode)
  - `input.responseOptions` — `{ headers, status }` for HTTP responses (server mode)
  - `input.flags` — parsed CLI arguments (CLI mode), e.g. `{ verbose: true, _: ["file.txt"] }`
  - `input.mode` — execution context: `{ cli: true }`, `{ server: true }`, or `{ test: true }`

## The `opts` Object

Each step has access to `opts`:
- `opts.config` — merged configuration from JSON blocks and config.json files
- `opts.steps` — array of pipeline steps
- `opts.name` — pipeline name

## The `$p` JSON Pointer Utility

Available globally in steps:
- `$p.get(obj, '/path/to/value')` — get nested value
- `$p.set(obj, '/path/to/value', data)` — set nested value (creates path if needed)
- `$p.compile('/path')` — compile a pointer for repeated use

Prefer `$p` over manual property access for safety and convenience, especially with deeply nested data.

## Code Block Rules

- Only `ts`, `js`, `typescript`, `javascript` blocks are executed
- Add `skip` after the language to exclude: \`\`\`ts skip
- Code runs inside an async function with `input`, `opts`, and `$p` in scope — do NOT declare them
- Imports (`npm:`, `jsr:`, URLs) go at the top of the code block
- Do not wrap code in a function or module — it executes inline, though you can define functions/classes within the block and pass them around via `input` or closures

## Conditional Execution (List DSL)

Steps wrapped in markdown list items gain conditional directives. The code block must be indented as part of the list:

```markdown
## Validate User
- check: /userId
- and: /verified
- not: /banned
- ` ``ts
  input.valid = true;
  ` ``
```

### Directives

| Directive | Behavior |
|-----------|----------|
| `check:` / `if:` / `when:` | Run if JSON pointer path on `input` is truthy. Multiple = OR. |
| `and:` | ALL must be truthy |
| `or:` | ANY suffices |
| `not:` | ALL must be falsy |
| `flags:` | Shorthand for `check: /flags/...` |
| `route:` | URL pattern matching (URLPattern API, server mode). Multiple = OR. |
| `method:` | HTTP method filtering (GET, POST, etc.) |
| `type:` | Response content-type shorthand (html, json, xml, css, js, stream) |
| `stop:` | Halt pipeline after this step (no value) |
| `only:` | Only this step runs — all others skipped (no value) |

### Evaluation Order

1. Route check (if present): must match
2. Method check (if present): must match
3. Positive conditions (`check:`/`or:`): at least one truthy
4. AND conditions: ALL truthy
5. NOT conditions: ALL falsy

## Imports

```ts
import { something } from "https://deno.land/x/mod/mod.ts";
import lodash from "npm:lodash";
import { Path } from "jsr:@david/path";
import otherPipe from 'OtherPipeName'; // other pipedown files by PascalCase name
```

## Error Handling

Errors thrown in any step are automatically caught and appended to `input.errors`. The pipeline continues. Check `input.errors` to handle failures:

```ts
if (input.errors?.length > 0) {
    input.body = { error: input.errors[0].message };
    input.responseOptions.status = 500;
}
```

## JSON Configuration

JSON code blocks configure the pipeline:

```json
{
    "inputs": [
        { "_name": "Happy path", "userId": "123" },
        { "_name": "Missing user", "userId": null }
    ],
    "build": [{ "format": "esm" }],
    "templates": ["./custom-template.ts"]
}
```

- `inputs` — test input objects (each needs `_name` for snapshot labeling)
- `build` — esbuild bundle configurations
- `templates` — custom template files to include
- `skip` / `exclude` — patterns to skip during processing

Config also comes from `config.json` files (project-level and directory-level, merged with deeper taking precedence) and the `"pipedown"` property in `deno.json`.

## Execution Modes

Pipedown generates multiple entry points from each markdown file:

- **CLI** (`pd run`): `input.flags` has parsed args, `input.mode.cli = true`
- **Server** (`pd serve`): `input.request` has the Request, set `input.body` for response, `input.mode.server = true`
- **Test** (`pd test`): runs each entry from `config.inputs`, snapshot-tested, `input.mode.test = true`
- **Worker**: service worker with install/activate/fetch/message events, `input.mode.worker = true`

### Server Mode Details

```markdown
## Parse Request
` ``ts
if (input.request.method === 'POST') {
    input.data = await input.request.json();
}
` ``

## Get User
- route: /api/users/:id
- method: GET
- ` ``tså
  const userId = $p.get(input, "/route/pathname/groups/id");
  input.body = { user: await fetchUser(userId) };
  ` ``

## Set Status
` ``ts
input.responseOptions.status = input.body ? 200 : 404;
` ``
```

If `input.response` is set, it's returned directly. Otherwise `new Response(input.body, input.responseOptions)` is created. Objects are auto-stringified when content-type is JSON.

## Zod Schemas

Pipelines can define a Zod schema that validates `input`. The schema string is stored in `pipeData.schema`:

```ts
z.object({
  userId: z.string().describe("Target user ID"),
  data: z.unknown().optional(),
})
```

## Bidirectional Round-Trip

```
Markdown  ──pd build──▶  index.json  ──pd sync──▶  Markdown
(human)                    (LLM)                    (human)
```

`index.json` is the structured representation of a pipe. LLMs can read/write it, then `pd sync` translates changes back to markdown. The build preserves source maps for lossless reconstruction.

## Environment Variables

Pipedown loads `.env` files automatically:

```ts
const apiKey = Deno.env.get('API_KEY');
```

## CLI Quick Reference

| Command | Purpose |
|---------|---------|
| `pd build` | Generate .pd/ from all .md files |
| `pd run <pipe.md>` | Execute a pipeline |
| `pd serve <pipe.md>` | Start HTTP server |
| `pd test [-u]` | Snapshot test all pipes |
| `pd sync <pipe>` | Regenerate .md from index.json |
| `pd extract <file.md> <indices> <name>` | Extract steps into sub-pipe |
| `pd repl` | Interactive REPL |
| `pd list` | List available pipes |
| `pd clean` | Remove .pd/ directory |

## Best Practices

1. **Keep steps focused** — each step should do one thing
2. **Use conditionals** — skip steps that don't apply to the current input
3. **Name steps descriptively** — headings become function names
4. **Store on `input`** — every step result that needs to be passed to subsequent steps should go on `input.something`
5. **Handle errors** — check `input.errors` when appropriate
6. **Define test inputs** — include `_name` and cover happy path, edge cases, and error conditions
7. **Use deterministic test values** — avoid timestamps, UUIDs, or random data in test inputs (snapshots break)
