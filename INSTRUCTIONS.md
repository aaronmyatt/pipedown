# Pipedown Core Library Instructions

> "JSON for the mind" — A structured mental model for humans contributing to Pipedown

## What is Pipedown?

```json
{
  "purpose": "Transform Markdown files into executable TypeScript pipelines",
  "paradigm": "Functional pipeline processing",
  "runtime": "Deno",
  "philosophy": "Literate programming — documentation IS the code"
}
```

## Core Concepts

```json
{
  "Pipe": {
    "definition": "A sequence of functions that process input data",
    "source": "Extracted from code blocks in a Markdown file",
    "output": "A runnable TypeScript module in .pd/ directory"
  },
  "Step": {
    "definition": "A single function in the pipeline",
    "source": "A fenced code block (```ts or ```js) in Markdown",
    "properties": ["code", "name", "funcName", "range", "inList", "config"]
  },
  "Input": {
    "definition": "The data object passed through the pipeline",
    "behavior": "Mutated by each step, passed to the next",
    "pattern": "Each step can read/modify input.* properties"
  }
}
```

## File Structure (Core Library Only)

```json
{
  "deps.ts": {
    "purpose": "Central dependency management",
    "exports": ["std (standard library)", "md (markdown parser)", "pd (pipeline processor)", "esbuild"]
  },
  "mdToPipe.ts": {
    "purpose": "Parse Markdown into a Pipe object",
    "pipeline": ["parseMarkdown", "findRanges", "findPipeName", "findSteps", "mergeMetaConfig", "setupChecks"],
    "input": "{ markdown: string }",
    "output": "{ pipe: Pipe }"
  },
  "rangeFinder.ts": {
    "purpose": "Identify token ranges (code blocks, headings, lists, meta blocks)",
    "exports": ["rangeFinder", "Tag enum", "TokenType enum"],
    "key_concept": "Tracks start/end indices of markdown elements"
  },
  "pdBuild.ts": {
    "purpose": "Orchestrate the build process",
    "pipeline": ["copyFiles", "parseMdFiles", "mergeParentDirConfig", "writePipeDir", "writePipeJson", "writePipeMd", "transformMdFiles", "writeDefaultGeneratedTemplates", "writeUserTemplates", "maybeExportPipe", "report"],
    "output_dir": ".pd/",
    "walk_options": "Finds .md files, respects .gitignore, skips node_modules"
  },
  "pipeToScript.ts": {
    "purpose": "Transform a Pipe object into executable TypeScript",
    "pipeline": ["extractImportsFromSteps", "sanitizeStepNames", "stepsToFunctions", "scriptTemplate"],
    "output": "A complete TypeScript module string"
  },
  "exportPipe.ts": {
    "purpose": "Bundle pipes for distribution using esbuild",
    "trigger": "When pipe.config.build is defined"
  },
  "defaultTemplateFiles.ts": {
    "purpose": "Generate supporting files (test, cli, server, worker templates)",
    "files_generated": ["test.ts", "cli.ts", "server.ts", "worker.ts", "deno.json", "replEval.ts"]
  },
  "stringTemplates.ts": {
    "purpose": "Template strings for generated files",
    "exports": ["denoTestFileTemplate", "denoReplEvalTemplate", "pdCliTemplate", "pdServerTemplate", "pdWorkerTemplate", "cliHelpTemplate"]
  },
  "pdUtils.ts": {
    "purpose": "Utility functions",
    "exports": ["sanitizeString", "fileName", "fileDir"]
  },
  "pipedown.d.ts": {
    "purpose": "TypeScript type definitions",
    "key_types": ["Token", "Step", "Pipe", "PipeConfig", "Input", "BuildInput"]
  }
}
```

## The Pipeline Pattern

```json
{
  "pattern": "pd.process(funcs, input, opts)",
  "how_it_works": {
    "1": "Takes an array of functions",
    "2": "Each function receives (input, opts)",
    "3": "Each function mutates input or returns modified input",
    "4": "Functions execute sequentially",
    "5": "Errors are collected in input.errors[]"
  },
  "example": {
    "funcs": ["parseMarkdown", "findRanges", "findPipeName"],
    "input": "{ markdown: '# My Pipe\\n```ts\\nconsole.log(1)\\n```' }",
    "result": "{ pipe: { name: 'My Pipe', steps: [...] } }"
  }
}
```

## Markdown-to-Pipe Transformation

```json
{
  "supported_languages": ["ts", "js", "javascript", "typescript"],
  "meta_languages": ["json", "yaml", "yml"],
  "step_naming": {
    "source": "Preceding heading (## Step Name)",
    "fallback": "anonymous{index}"
  },
  "config_blocks": {
    "format": "JSON/YAML code blocks",
    "merging": "Deep merged into pipe.config"
  },
  "conditional_execution": {
    "syntax": "List items before code block",
    "keywords": ["check:", "if:", "when:", "or:", "and:", "not:", "route:", "stop:", "only:", "flags:"],
    "values": "JSON pointers (e.g., /points/add)"
  }
}
```

## Key Data Structures

### Token (from Markdown parser)

```json
{
  "type": "START | END | TEXT",
  "tag": "CODE_BLOCK | HEADING | LIST | ITEM",
  "content": "The text content",
  "level": "Heading level (1-6)",
  "language": "Code block language (ts, js, json, etc.)"
}
```

### Step

```json
{
  "code": "The extracted code from the code block",
  "range": "[startIndex, endIndex] in token array",
  "name": "Human-readable name from heading",
  "funcName": "Sanitized name for function definition",
  "inList": "Boolean - true if within a list (for conditional execution)",
  "config": {
    "checks": ["JSON pointers to evaluate"],
    "routes": ["Route patterns to match"],
    "or": ["OR conditions"],
    "and": ["AND conditions"],
    "not": ["NOT conditions"]
  }
}
```

### Pipe

```json
{
  "name": "From H1 heading",
  "cleanName": "Sanitized version of name",
  "steps": "Array of Step objects",
  "mdPath": "Path to source .md file",
  "dir": "Output directory in .pd/",
  "config": {
    "inputs": "Test inputs for the pipe",
    "templates": "Custom template files to copy",
    "build": "esbuild configuration for bundling",
    "skip": "Regex patterns to skip files",
    "exclude": "Regex patterns to exclude files"
  }
}
```

## Build Output Structure

```json
{
  ".pd/": {
    "{pipeName}/": {
      "index.ts": "The executable pipe module",
      "index.json": "The raw Pipe object",
      "index.md": "Copy of source markdown",
      "test.ts": "Generated test file",
      "cli.ts": "CLI runner template",
      "server.ts": "HTTP server template",
      "worker.ts": "Service worker template"
    },
    "deno.json": "Import map for the project",
    "replEval.ts": "REPL evaluation helper"
  }
}
```

## Dependencies (from deps.ts)

```json
{
  "@std/collections": "deepMerge",
  "@std/fs": "exists, walk",
  "@std/fmt": "colors",
  "@std/path": "basename, dirname, join, parse, relative, globToRegExp",
  "@std/http": "serveFile",
  "@std/async": "debounce",
  "@std/cli": "parseArgs",
  "@pd/pulldown-cmark": "Markdown parser",
  "@pd/pdpipe": "Pipeline processor (pd.process)",
  "@pd/pointers": "JSON pointer operations ($p)",
  "esbuild": "JavaScript bundler"
}
```

## Testing

```json
{
  "test_directory": "test/",
  "test_files": "*.md files in test/",
  "test_pattern": "Define inputs in JSON code blocks, use pipe.config.inputs",
  "snapshot_testing": "Uses @std/testing/snapshot for output comparison"
}
```

## Common Workflows

### Adding a New Core Feature

```json
{
  "steps": [
    "1. Update types in pipedown.d.ts if needed",
    "2. Add implementation to the relevant core file",
    "3. If it's a build step, add to pdBuild.ts pipeline",
    "4. If it's a parsing step, add to mdToPipe.ts pipeline",
    "5. Test with .md files in test/ directory"
  ]
}
```

### Understanding the Code Flow

```json
{
  "entry": "pdBuild.ts → pdBuild()",
  "flow": [
    "Walk directory for .md files",
    "For each file → mdToPipe()",
    "mdToPipe → parseMarkdown → findRanges → findSteps",
    "pipeToScript() → generates index.ts",
    "defaultTemplateFiles() → generates supporting files"
  ]
}
```

## JSON Pointer Usage

```json
{
  "library": "@pd/pointers (wraps jsonpointer)",
  "syntax": "/path/to/property",
  "examples": {
    "get": "$p.get(input, '/points/add')",
    "set": "$p.set(input, '/points/amount', 10)",
    "compile": "$p.compile('/ranges/codeBlocks').get(input)"
  },
  "usage_in_pipes": "Conditional checks use JSON pointers to test input values"
}
```

## Notes for Contributors

```json
{
  "skip_these_directories": ["pdCli/ - CLI implementation, separate concern"],
  "important_patterns": {
    "pipeline_functions": "Always (input, opts) => void | input",
    "error_handling": "Push to input.errors[], don't throw",
    "async_support": "All pipeline functions can be async"
  },
  "gotchas": {
    "token_indices": "Ranges are indices into the parsed token array, not line numbers",
    "sanitization": "Step names are sanitized to valid JS identifiers (sanitizeString)",
    "config_merging": "Parent directory config.json files are merged into pipe.config"
  }
}
```
