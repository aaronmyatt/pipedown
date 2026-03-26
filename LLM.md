# Pipedown LLM Guide

This document provides guidance for users and AI agents creating pipedown markdown files. Pipedown is a tool that transforms markdown files into executable TypeScript/JavaScript pipelines using Deno.

> **Note:** In the examples below, code block delimiters shown with backslash escaping (e.g., `\`\`\`ts`) are for documentation purposes. When creating actual pipedown files, use standard triple backticks without the backslashes.

## Overview

Pipedown lets you write executable documentation. Each markdown file becomes a pipeline of functions that are executed sequentially, with each step receiving an `input` object that flows through the entire pipeline.

## Quick Start

1. Create a markdown file (e.g., `myPipe.md`)
2. Run `pd build` to generate executable TypeScript in `.pd/` directory
3. Run `pd run myPipe.md` to execute the pipeline
4. Use `pd repl` for interactive testing

## Basic Structure

A pipedown markdown file consists of:

1. **A Level 1 Heading** - The pipe name (optional, defaults to "anonymous")
2. **Level 2+ Headings** - Step names for code blocks that follow
3. **TypeScript/JavaScript Code Blocks** - The actual executable code
4. **JSON Config Blocks** - Pipeline configuration

### Example

```markdown
# My Pipeline

## Step One

\`\`\`ts
input.message = "Hello, World!";
\`\`\`

## Step Two

\`\`\`ts
console.log(input.message);
\`\`\`
```

## Code Blocks

Only code blocks with `ts`, `js`, `typescript`, or `javascript` language identifiers are executed. All other code blocks are treated as documentation.

```markdown
\`\`\`ts
// This code will be executed
input.result = 42;
\`\`\`

\`\`\`bash
# This is just documentation, not executed
echo "hello"
\`\`\`
```

### Skipping Code Blocks

Add `skip` after the language identifier to exclude a code block from execution:

```markdown
\`\`\`ts skip
// This code will NOT be executed
const example = "skipped";
\`\`\`
```

## The Input Object

Every step receives an `input` object that persists throughout the pipeline. Use it to pass data between steps:

```markdown
## Fetch Data

\`\`\`ts
const response = await fetch("https://api.example.com/data");
input.data = await response.json();
\`\`\`

## Process Data

\`\`\`ts
input.processed = input.data.map(item => item.name.toUpperCase());
\`\`\`
```

### Input Properties

The `input` object may contain these special properties:

| Property | Description |
|----------|-------------|
| `input.errors` | Array of errors that occurred during execution |
| `input.request` | HTTP Request object (in server mode) |
| `input.response` | HTTP Response object (in server mode) |
| `input.route` | Matched route information (when using route matching) |
| `input.flags` | Command-line flags (in CLI mode) |
| `input.mode` | Execution mode (`{ cli: true }`, `{ server: true }`, `{ test: true }`) |

## The Opts Object

Each step also has access to an `opts` object containing the pipe's configuration:

```markdown
## Read Config

\`\`\`ts
const apiKey = $p.get(opts, '/config/apiKey');
console.log({ config: opts });
\`\`\`
```

The `opts` object contains:
- `opts.config` - Merged configuration from JSON blocks and config.json files
- `opts.steps` - Array of pipeline steps
- `opts.name` - Pipeline name
- `opts.$p` - JSON pointer utility for accessing nested properties

## JSON Configuration Blocks

Use JSON code blocks to configure your pipeline:

```markdown
# My Pipeline

\`\`\`json
{
    "apiKey": "your-api-key",
    "maxRetries": 3,
    "inputs": [
        { "testCase": "case1", "value": 10 },
        { "testCase": "case2", "value": 20 }
    ]
}
\`\`\`

## Use Config

\`\`\`ts
const maxRetries = $p.get(opts, '/config/maxRetries');
\`\`\`
```

### Configuration Options

| Option | Description |
|--------|-------------|
| `inputs` | Array of test inputs for `pd test` |
| `build` | Array of build configurations for bundling |
| `templates` | Custom template files to include |
| `skip` | Patterns to skip during processing |
| `exclude` | Patterns to exclude from processing |

## config.json Files

Pipedown supports hierarchical configuration through `config.json` files:

1. **Project-level** - `config.json` in project root
2. **Directory-level** - `config.json` in subdirectories

Configuration is merged, with more specific (deeper) configs taking precedence.

### Example config.json

```json
{
    "inGlobal": true,
    "exclude": ["envTest.md"],
    "templates": ["./custom-template.ts"]
}
```

### Nested Configuration

```
project/
├── config.json          # { "setting": "global" }
├── subdir/
│   ├── config.json      # { "setting": "local" }
│   └── myPipe.md        # Gets merged config: { "setting": "local" }
```

## Conditional Blocks (The List DSL)

Pipedown supports conditional execution using markdown list items before code blocks. When a code block is nested inside a list, the list items become directives that control whether the step runs. These directives check JSON pointer paths on the `input` object.

**Critical syntax rule:** The code block must be indented as part of the list. The directive lines (e.g., `- check: /path`) come before the code block in the same list.

### Directive Reference

#### `check:` / `if:` / `when:` — Conditional execution

Execute the step only if the JSON pointer path resolves to a truthy value. All three keywords are aliases. Multiple `check:` directives act as logical OR — the step runs if ANY check is truthy.

```markdown
## Validate User
- check: /userId
- \`\`\`ts
  // Only runs if input.userId is truthy
  input.valid = true;
  \`\`\`
```

#### `and:` — Require ALL conditions

Execute only if ALL `and:` paths are truthy. Combines with `check:` — if both are present, at least one `check:` must be truthy AND all `and:` conditions must be truthy.

```markdown
## Admin Action
- check: /user/isAuthenticated
- and: /user/hasPermission
- and: /user/isVerified
- \`\`\`ts
  // Runs only if authenticated AND has permission AND is verified
  input.accessGranted = true;
  \`\`\`
```

#### `or:` — Any condition suffices

Execute if ANY `or:` condition is truthy. Combines with `check:` — the step runs if any `check:` OR any `or:` is truthy.

```markdown
## Moderator View
- check: /isAdmin
- or: /isModerator
- or: /isSupervisor
- \`\`\`ts
  // Runs if admin OR moderator OR supervisor
  input.canModerate = true;
  \`\`\`
```

#### `not:` — Negative conditions

Execute only if ALL `not:` paths are falsy. Commonly used to skip steps when errors have occurred or when a flag disables a feature.

```markdown
## Proceed If No Errors
- not: /error
- not: /skip
- \`\`\`ts
  // Only runs if input.error AND input.skip are both falsy
  input.result = await processData(input.data);
  \`\`\`
```

#### `flags:` — CLI flag checking

Shorthand for checking `input.flags`. The path is automatically prefixed with `/flags`. When running with `pd run myPipe.md -- --verbose --output json`, the flags object becomes `{ verbose: true, output: "json", _: [] }`.

```markdown
## Verbose Output
- flags: /verbose
- \`\`\`ts
  // Only runs if --verbose flag was passed
  console.log("Debug:", JSON.stringify(input, null, 2));
  \`\`\`

## Process Positional Args
- flags: /_/0
- \`\`\`ts
  // Only runs if a positional argument was passed
  // e.g., pd run myPipe.md -- myfile.txt
  input.targetFile = input.flags._[0];
  \`\`\`
```

`flags: /verbose` is equivalent to `check: /flags/verbose`.

#### `route:` — URL pattern matching

Match the incoming request URL against a URL pattern (using the URLPattern API). Only meaningful in server mode. Route parameters are available at `input.route.pathname.groups`.

```markdown
## List Users
- route: /api/users
- \`\`\`ts
  input.body = await db.query("SELECT * FROM users");
  \`\`\`

## Get User By ID
- route: /api/users/:id
- \`\`\`ts
  const userId = input.route.pathname.groups.id;
  input.body = await db.query("SELECT * FROM users WHERE id = ?", [userId]);
  \`\`\`

## Wildcard Catch-All
- route: /static/*
- \`\`\`ts
  input.response = await serveStaticFile(input.request);
  \`\`\`
```

Multiple `route:` directives on the same step act as OR — the step runs if any route matches.

#### `stop:` — Halt pipeline

Stop pipeline execution after this step completes. No steps after this one will run. The directive takes no value.

```markdown
## Early Exit
- check: /shouldExit
- stop:
- \`\`\`ts
  input.body = { message: "Stopped early" };
  \`\`\`
```

#### `only:` — Exclusive execution

Only this step runs in the pipeline — all others are skipped. Useful for debugging or isolation. The directive takes no value.

```markdown
## Debug This Step
- only:
- \`\`\`ts
  console.log("Only this step runs");
  \`\`\`
```

### Combining Directives

Directives compose naturally. The evaluation logic is:

1. **Route check** (if present): must match
2. **Positive conditions** (`check:`/`if:`/`when:` + `or:`): at least one must be truthy
3. **AND conditions** (`and:`): ALL must be truthy
4. **NOT conditions** (`not:`): ALL must be falsy
5. **Flags** (`flags:`): the flag must be truthy (desugars to a check)

```markdown
## Protected API Endpoint
- route: /api/admin/:action
- check: /user/isAuthenticated
- and: /user/isAdmin
- not: /user/isBanned
- not: /error
- \`\`\`ts
  const action = input.route.pathname.groups.action;
  input.body = await handleAdminAction(action, input.user);
  \`\`\`
```

## Importing Dependencies

### Third-Party Dependencies

Import directly from URLs, npm, or JSR:

```markdown
## Use External Library

\`\`\`ts
import { download } from "https://deno.land/x/download/mod.ts";
import { Path } from "jsr:@david/path";
import lodash from "npm:lodash";

input.file = await download(input.url);
\`\`\`
```

### Importing Other Pipedown Files

Reference other pipedown files in your project using their generated module names:

```markdown
## Import Another Pipe

\`\`\`ts
import otherPipe from 'OtherPipeName';

// Process with the other pipe
const result = await otherPipe.process(input);
Object.assign(input, result);
\`\`\`
```

The import name is derived from the markdown file name with special characters removed and in PascalCase.

## CLI Commands

### pd build

Generate executable TypeScript from all markdown files:

```bash
pd build
pd build --debug  # Show debug information
pd build --json   # Output build info as JSON
```

### pd run

Execute a specific pipeline:

```bash
pd run myPipe.md
pd run myPipe.md --input '{"key": "value"}'
pd run myPipe.md -- --custom-flag value
```

### pd repl

Start an interactive REPL with all pipes preloaded:

```bash
pd repl
```

In the REPL:
- Access pipes by name (e.g., `myPipe`)
- Use `myPipeProcess({ input: 'data' })` to run a pipe
- Use `test(myPipe)` to run all test inputs
- Use `step(myPipe)` to step through inputs interactively
- Access `$p` for JSON pointer operations

### pd test

Run tests defined in the `inputs` configuration:

```bash
pd test
pd test -u  # Update snapshots
```

### pd serve

Start an HTTP server with your pipe as the handler:

```bash
pd serve myPipe.md
pd serve myPipe.md --port 3000
```

### pd sync

Regenerate the source markdown from the structured `index.json`:

```bash
pd sync myPipe           # Overwrite myPipe.md from .pd/myPipe/index.json
pd sync myPipe --dry-run # Preview without writing
```

### pd list

List all available pipes in the project:

```bash
pd list
```

### pd clean

Remove all generated files in `.pd/`:

```bash
pd clean
```

## Build/Export Configuration

Configure bundling for browser or other environments:

```markdown
\`\`\`json
{
    "build": [
        { "format": "esm" },
        { "format": "cjs" },
        { "format": "iife" }
    ]
}
\`\`\`
```

Build options use esbuild configuration. Output files are generated in the `.pd/` directory.

## Testing

Define test inputs in your JSON configuration:

```markdown
\`\`\`json
{
    "inputs": [
        { "_name": "Test Case 1", "value": 10 },
        { "_name": "Test Case 2", "value": 20 }
    ]
}
\`\`\`
```

Run tests with:

```bash
pd test           # Run all tests
pd test-update    # Update snapshots (or pd tu)
```

Tests use Deno's snapshot testing to verify output consistency.

## Execution Targets

When you run `pd build`, pipedown generates several execution targets in `.pd/<pipeName>/`. Each target wraps your pipeline with a different entrypoint, setting up the appropriate `input` shape for that execution context.

### cli.ts — Command-Line Interface

**Run with:** `pd run myPipe.md` or `deno run .pd/myPipe/cli.ts`

The CLI wrapper parses command-line arguments and feeds them into the pipeline:

```
pd run myPipe.md --input '{"userId": "123"}' -- --verbose --output json
```

**Input shape provided to your pipeline:**

| Property | Value |
|----------|-------|
| `input.flags` | Parsed CLI args: `{ verbose: true, output: "json", _: [] }` |
| `input.mode.cli` | `true` |
| Any keys from `--input` | Merged into input: `{ userId: "123" }` |

**Output behavior:**
- Default: prints the output object
- `--json` / `-j`: prints `JSON.stringify(output)`

### server.ts — HTTP Server

**Run with:** `pd serve myPipe.md` or `pd serve myPipe.md --port 3000`

Starts a Deno HTTP server. Each incoming request runs the full pipeline with:

**Input shape provided to your pipeline:**

| Property | Value |
|----------|-------|
| `input.request` | The incoming `Request` object |
| `input.body` | `{}` (populate this with your response body) |
| `input.responseOptions` | `{ headers: { "content-type": "application/json" }, status: 200 }` |
| `input.mode.server` | `true` |
| `input.mode.deploy` | `true` if running on Deno Deploy |

**Response handling:**
- If `input.response` is set, it's returned directly (full control)
- Otherwise, a `new Response(input.body, input.responseOptions)` is created
- If body is an object and content-type is JSON, it's auto-stringified
- If `input.errors` exists, returns 500 with error JSON

```markdown
## Parse Request
\`\`\`ts
if (input.request.method === 'POST') {
    input.data = await input.request.json();
}
\`\`\`

## Handle Route
- route: /api/users/:id
- \`\`\`ts
  const userId = input.route.pathname.groups.id;
  input.body = { user: await fetchUser(userId) };
  \`\`\`

## Set Status
\`\`\`ts
input.responseOptions.status = input.body ? 200 : 404;
\`\`\`
```

### test.ts — Snapshot Testing

**Run with:** `pd test` or `pd test -u` (update snapshots)

Iterates over each entry in the `inputs` config array and runs the pipeline, comparing output against saved snapshots.

**Input shape provided to your pipeline:**

| Property | Value |
|----------|-------|
| `input.mode` | `"test"` |
| `input.test` | `true` |
| All keys from the input entry | Merged into input |

**How it works:**
1. Reads `config.inputs` from the pipe's JSON config
2. For each input entry, uses `_name` as the test label
3. Calls `pipe.process(inputEntry)`
4. Compares output to a stored snapshot using `assertSnapshot()`
5. On first run, creates the snapshot; on subsequent runs, diffs against it

```json
{
  "inputs": [
    { "_name": "Valid user", "userId": "123" },
    { "_name": "Missing user", "userId": null },
    { "_name": "Admin flow", "userId": "admin", "role": "admin" }
  ]
}
```

### worker.ts — Service Worker

**Run with:** Include in a web app as a service worker registration

The worker template handles four lifecycle events. Each event runs the full pipeline with a different `input.type` so your steps can branch accordingly:

**Input shapes by event:**

| Event | `input.type` | Additional properties |
|-------|-------------|----------------------|
| `install` | `{ install: true }` | `event` (InstallEvent) |
| `activate` | `{ activate: true }` | `event` (ActivateEvent) |
| `fetch` | `{ fetch: true }` | `event`, `request`, `body`, `responseOptions` |
| `message` | `{ message: true }` | `event` (MessageEvent) |

All events set `input.mode.worker = true`.

The fetch handler automatically skips caching for WebSocket upgrades and Server-Sent Events (detects `upgrade` and `text/event-stream` headers).

```markdown
## Cache Setup
- check: /type/install
- \`\`\`ts
  const cache = await caches.open('v1');
  await cache.addAll(['/index.html', '/app.js']);
  \`\`\`

## Handle Fetch
- check: /type/fetch
- \`\`\`ts
  const cache = await caches.open('v1');
  const cached = await cache.match(input.request);
  if (cached) {
    input.response = cached;
  } else {
    input.response = await fetch(input.request);
  }
  \`\`\`

## Handle Message
- check: /type/message
- \`\`\`ts
  input.data = { received: input.event.data };
  \`\`\`
```

### index.ts — Main Module

The core generated file. Converts your markdown steps into an ordered array of async functions, wraps each with schema validation (if a Zod schema is defined), and exports the pipe for use by all other targets.

**Exports:**
- `pipe` — the Pipe instance with `.process(input)` method
- `rawPipe` — the parsed JSON metadata (from `index.json`)
- `process` — convenience function: `(input) => pipe.process(input)`
- `schema` — the Zod schema (if defined)

All other targets (`cli.ts`, `server.ts`, etc.) import from `index.ts`.

## Environment Variables

Pipedown automatically loads `.env` files using `@std/dotenv`:

```markdown
## Use Environment Variables

\`\`\`ts
const apiKey = Deno.env.get('API_KEY');
input.config = { apiKey };
\`\`\`
```

## JSON Pointer Utility ($p)

The `$p` utility is available for JSON pointer operations:

```markdown
## Using $p

\`\`\`ts
// Get nested value
const value = $p.get(input, '/deeply/nested/value');

// Set nested value (creates path if needed)
$p.set(input, '/result/data', processedData);

// Compile a pointer for repeated use
const getter = $p.compile('/user/name');
const userName = getter.get(input);
\`\`\`
```

## Error Handling

Errors are automatically caught and added to `input.errors`:

```markdown
## Risky Operation

\`\`\`ts
// If this throws, the error is captured and the pipeline continues
const result = await riskyOperation();
input.result = result;
\`\`\`

## Check for Errors

\`\`\`ts
if (input.errors && input.errors.length > 0) {
    console.error('Errors occurred:', input.errors);
    input.hasErrors = true;
}
\`\`\`
```

## Complete Example

```markdown
# User API Handler

Configuration for the pipeline:

\`\`\`json
{
    "inputs": [
        { "_name": "Get User", "userId": "123" },
        { "_name": "Invalid User", "userId": null }
    ]
}
\`\`\`

## Validate Input
- check: /userId
- \`\`\`ts
  if (!input.userId) {
      input.error = { message: 'User ID required', status: 400 };
  }
  \`\`\`

## Fetch User
- not: /error
- \`\`\`ts
  import { fetchUser } from './userService.ts';
  input.user = await fetchUser(input.userId);
  \`\`\`

## Format Response

\`\`\`ts
if (input.error) {
    input.body = { error: input.error.message };
    input.responseOptions.status = input.error.status;
} else {
    input.body = { user: input.user };
}
\`\`\`
```

## Best Practices

1. **Name your steps** - Use descriptive headings for each code block
2. **Keep steps focused** - Each step should do one thing well
3. **Use conditionals** - Skip steps that don't apply to the current input
4. **Define test inputs** - Include comprehensive test cases in your config
5. **Handle errors gracefully** - Check for errors and provide meaningful responses
6. **Document your pipes** - Markdown is documentation, use it!
7. **Use config.json** - Keep sensitive or environment-specific config separate

## File Structure

After running `pd build`, your project will have:

```
project/
├── myPipe.md              # Source markdown (human/LLM authored)
├── config.json            # Global configuration
├── .pd/                   # Generated files (do not edit directly)
│   ├── deno.json         # Import map for all pipes
│   ├── config.json       # Merged global config
│   ├── replEval.ts       # REPL initialization with test/step helpers
│   └── myPipe/           # Per-pipe directory
│       ├── index.ts      # Main executable module (generated from markdown)
│       ├── index.json    # Structured pipe data (the neutral interchange format)
│       ├── index.md      # Copy of source markdown
│       ├── cli.ts        # CLI entrypoint (pd run)
│       ├── server.ts     # HTTP server entrypoint (pd serve)
│       ├── worker.ts     # Service worker entrypoint
│       └── test.ts       # Snapshot test runner (pd test)
```

### index.json — The Neutral Interchange Format

The `index.json` file is the structured representation of your pipe. It contains everything from the source markdown in a machine-friendly format. This is the key file for LLM workflows — an LLM can read/write `index.json` and then `pd sync` translates changes back to markdown.

```json
{
  "mdPath": "/absolute/path/to/myPipe.md",
  "fileName": "myPipe",
  "dir": ".pd/myPipe",
  "absoluteDir": "/absolute/path/.pd/myPipe",
  "name": "My Pipeline",
  "cleanName": "MyPipeline",
  "pipeDescription": "Description text from below the H1 heading",
  "schema": "z.object({ ... })",
  "config": {
    "inputs": [{ "_name": "test1", "value": 10 }],
    "build": [],
    "templates": []
  },
  "steps": [
    {
      "name": "Step Name",
      "funcName": "StepName",
      "code": "input.result = 42;\n",
      "language": "ts",
      "range": [10, 10],
      "headingLevel": 2,
      "description": "What this step does.",
      "inList": false,
      "config": null
    },
    {
      "name": "Conditional Step",
      "funcName": "ConditionalStep",
      "code": "input.validated = true;\n",
      "language": "ts",
      "range": [18, 18],
      "headingLevel": 2,
      "description": "Only runs with conditions met.",
      "inList": true,
      "config": {
        "checks": ["/userId"],
        "and": ["/verified"],
        "not": ["/banned"]
      }
    }
  ]
}
```

### pd sync — JSON to Markdown

The `pd sync` command regenerates the source markdown from `index.json`. This completes the bidirectional flow:

```
Markdown  ──pd build──▶  index.json  ──pd sync──▶  Markdown
(human)                    (LLM)                    (human)
```

```bash
pd sync myPipe           # Overwrite myPipe.md from .pd/myPipe/index.json
pd sync myPipe --dry-run # Preview the generated markdown without writing
```

This enables an LLM-first workflow where the LLM edits structured JSON (its strength) and `pd sync` handles proper markdown formatting with fenced code blocks, list directives, and heading levels.

## pdPipe Dependency

Pipedown uses [@pd/pdpipe](https://github.com/aaronmyatt/pdPipe) for pipeline execution. Key features:

- **Sequential execution** - Steps run in order
- **Condition checking** - Configurable skip conditions
- **Error capture** - Errors don't stop the pipeline
- **Route matching** - URL pattern matching for servers
- **Type safety** - Full TypeScript support

## Troubleshooting

### Code block not executing

- Ensure language is `ts`, `js`, `typescript`, or `javascript`
- Check for `skip` modifier after language
- Verify the block is not inside a list without conditionals

### Imports not working

- Run `pd build` to regenerate import maps
- Check the import path matches the generated module name
- For other pipedown files, use the PascalCase name without extension

### Conditionals not working

- Ensure the code block is nested within a list item (the conditional directive line like `- check: /path` must come before the code block, and the code block must be indented as part of that list)
- Check JSON pointer paths start with `/`
- Verify the `input` object has the expected structure

### Test failures

- Run `pd test-update` to regenerate snapshots
- Check `inputs` array in JSON configuration
- Verify test inputs have all required properties
