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

## Conditional Blocks

Pipedown supports conditional execution using list items before code blocks. These check JSON pointer paths on the `input` object.

### Basic Conditionals

```markdown
## Conditional Step
- if: /shouldRun
- \`\`\`ts
  console.log('This only runs if input.shouldRun is truthy');
  \`\`\`
```

### Conditional Directives

| Directive | Description |
|-----------|-------------|
| `check:`, `if:`, `when:` | Execute if the path is truthy |
| `or:` | Execute if ANY `or` condition is truthy |
| `and:` | Execute only if ALL `and` conditions are truthy |
| `not:` | Execute only if the path is falsy |
| `flags:` | Check `input.flags` (prepends `/flags` to path) |
| `route:` | Match URL pattern against `input.request.url` |
| `stop:` | Stop pipeline execution at this step |
| `only:` | Execute only this step |

### Examples

```markdown
## With Multiple Conditions
- check: /user/isAuthenticated
- and: /user/hasPermission
- not: /user/isBanned
- \`\`\`ts
  input.accessGranted = true;
  \`\`\`

## With Or Conditions
- if: /isAdmin
- or: /isModerator
- \`\`\`ts
  input.canModerate = true;
  \`\`\`

## Route Matching
- route: /api/users/:id
- \`\`\`ts
  const userId = input.route.pathname.groups.id;
  input.user = await fetchUser(userId);
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

## Server Mode

Pipes can run as HTTP servers. The `input` object includes:

- `input.request` - The incoming Request object
- `input.body` - Request body (initially empty object)
- `input.responseOptions` - Headers, status code, etc.
- `input.mode.server` - Set to `true`

```markdown
## Handle Request

\`\`\`ts
if (input.request.method === 'POST') {
    input.body = await input.request.json();
}
\`\`\`

## Send Response

\`\`\`ts
input.body = { message: 'Success', data: input.processedData };
input.responseOptions.status = 200;
\`\`\`
```

## Worker Mode

Pipes can also run as service workers:

```markdown
## Handle Fetch Event
- check: /type/fetch
- \`\`\`ts
  const cache = await caches.open('v1');
  input.response = await cache.match(input.request);
  \`\`\`
```

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
├── myPipe.md              # Source markdown
├── config.json            # Global configuration
├── .pd/                   # Generated files
│   ├── deno.json         # Import map
│   ├── replEval.ts       # REPL initialization
│   └── myPipe/           # Per-pipe directory
│       ├── index.ts      # Main executable
│       ├── index.json    # Parsed pipe data
│       ├── index.md      # Copy of source
│       ├── cli.ts        # CLI wrapper
│       ├── server.ts     # HTTP server
│       ├── worker.ts     # Service worker
│       └── test.ts       # Test file
```

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
