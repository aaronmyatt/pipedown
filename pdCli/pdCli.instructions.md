# pdCli Instructions

> "JSON for the mind" — A human-readable guide to the Pipedown CLI module

```
{
  "module": "pdCli",
  "purpose": "Command-line interface for the Pipedown project",
  "description": "Provides CLI commands to build, run, test, serve, and manage Pipedown markdown-based pipe definitions",
  
  "architecture": {
    "pattern": "Command-based modular CLI",
    "entryPoint": "mod.ts",
    "commandPattern": "Each command is a separate module exporting an async function",
    "flagSystem": "Uses @std/cli parseArgs for flag parsing",
    "processingPipeline": "Commands are processed through checkFlags() wrapper for routing"
  },

  "files": {
    "mod.ts": {
      "role": "Main entry point and command router",
      "responsibilities": [
        "Parse CLI arguments and flags",
        "Initialize the .pd directory",
        "Register project context",
        "Route commands via checkFlags() to appropriate handlers"
      ],
      "keyExports": ["checkFlags"]
    },

    "helpers.ts": {
      "role": "Shared utilities for command execution",
      "responsibilities": [
        "Define common Deno args (--unstable-kv, -A, etc.)",
        "Provide pdRun, pdRunWith, pdServe, pdRepl execution helpers",
        "Error merging utilities"
      ],
      "keyConstants": ["PD_DIR", "commonArgs"]
    },

    "buildCommand.ts": {
      "role": "Build command handler",
      "command": "pd build",
      "responsibilities": [
        "Read all markdown files in current directory",
        "Generate executable files in .pd directory"
      ]
    },

    "runCommand.ts": {
      "role": "Run command handler",
      "command": "pd run [file.md]",
      "responsibilities": [
        "Build the specified markdown file",
        "Execute the generated script with optional input"
      ]
    },

    "runWithCommand.ts": {
      "role": "Run with wrapper command handler",
      "command": "pd runWith [wrapper] [file.md]",
      "responsibilities": [
        "Build and run with a specific wrapper template (e.g., server, worker)"
      ]
    },

    "serveCommand.ts": {
      "role": "Serve command handler",
      "command": "pd serve [file.md]",
      "responsibilities": [
        "Build the specified markdown file",
        "Run as a server with watch mode"
      ]
    },

    "testCommand.ts": {
      "role": "Test command handler",
      "command": "pd test | pd t",
      "responsibilities": [
        "Build all pipes",
        "Run Deno tests against generated scripts",
        "Support snapshot testing with test-update (tu) command"
      ],
      "aliases": ["t", "tu", "test-update"]
    },

    "listCommand.ts": {
      "role": "List command handler",
      "command": "pd list",
      "responsibilities": [
        "List all processed markdown files in .pd directory"
      ]
    },

    "cleanCommand.ts": {
      "role": "Clean command handler",
      "command": "pd clean",
      "responsibilities": [
        "Remove the entire .pd directory and generated files"
      ]
    },

    "replCommand.ts": {
      "role": "REPL command handler",
      "command": "pd repl",
      "responsibilities": [
        "Build all pipes",
        "Launch Deno REPL with pipes preloaded"
      ]
    },

    "helpCommand.ts": {
      "role": "Help command handler",
      "command": "pd help",
      "responsibilities": [
        "Display CLI usage information"
      ]
    },

    "defaultCommand.ts": {
      "role": "Default (no command) handler",
      "command": "pd",
      "responsibilities": [
        "Watch for file changes",
        "Auto-rebuild and serve on changes"
      ]
    },

    "buildandserve.ts": {
      "role": "Development server with hot reload",
      "responsibilities": [
        "Watch filesystem for .md file changes",
        "Debounced rebuild on changes",
        "Serve preview UI with SSE reload",
        "Provide script browser interface"
      ]
    },

    "reportErrors.ts": {
      "role": "Error reporting utility",
      "responsibilities": [
        "Format and display CLI errors",
        "Handle both string and structured errors"
      ]
    }
  },

  "commandFlow": {
    "1_initialization": [
      "Parse args with std.parseArgs",
      "Check for --version or --help flags (exit early)",
      "Create .pd directory if missing",
      "Load global config from config.json",
      "Register project in ~/.pipedown/projects.json"
    ],
    "2_contextGathering": [
      "Walk directory for .md files",
      "Build projectPipes array with file metadata"
    ],
    "3_commandRouting": [
      "Pass input through checkFlags() wrappers",
      "Match command flags to appropriate handler",
      "Execute matched command function"
    ]
  },

  "flagPatterns": {
    "globalFlags": {
      "-d, --debug": "Enable debug output",
      "-h, --help": "Show help message",
      "-v, --version": "Show version",
      "-j, --json": "Output as JSON",
      "-p, --pretty": "Pretty print JSON"
    },
    "commandSpecificFlags": {
      "--input": "JSON string input for run/serve commands"
    }
  },

  "dataTypes": {
    "CliInput": {
      "description": "Main input object passed through command pipeline",
      "properties": {
        "flags": "Parsed CLI arguments (Args type)",
        "globalConfig": "Project configuration from config.json",
        "projectPipes": "Array of discovered markdown pipe files",
        "errors": "Accumulated errors during processing",
        "output": "Output data container",
        "debug": "Debug mode flag"
      }
    }
  },

  "conventions": {
    "commandNaming": "Commands use camelCase + 'Command' suffix (e.g., buildCommand)",
    "helpText": "Each command uses cliHelpTemplate from stringTemplates.ts",
    "errorHandling": "Errors are accumulated in input.errors array",
    "asyncPattern": "Commands return Promise<CliInput> or CliInput",
    "flagChecking": "Commands check for help flag before execution"
  },

  "dependencies": {
    "internal": {
      "../deps.ts": "External dependencies (std lib, esbuild, pd modules)",
      "../pdBuild.ts": "Build pipeline for markdown to script conversion",
      "../stringTemplates.ts": "Template functions for generated code",
      "../pipedown.d.ts": "TypeScript type definitions"
    },
    "external": {
      "@std/cli": "Argument parsing",
      "@std/fs": "File system operations",
      "@std/fmt/colors": "Terminal coloring",
      "@pd/pdpipe": "Pipeline processing library"
    }
  },

  "developmentTips": {
    "addingNewCommand": [
      "1. Create [commandName]Command.ts in pdCli/",
      "2. Export async function [commandName]Command(input: CliInput)",
      "3. Add helpText using cliHelpTemplate",
      "4. Check for help flag before main logic",
      "5. Import in mod.ts",
      "6. Add checkFlags(['commandName'], [commandName]Command) to funcs array"
    ],
    "debugging": [
      "Use --debug or -d flag to enable debug output",
      "Set DEBUG env variable for persistent debug mode",
      "Check input.errors array for accumulated errors"
    ],
    "testing": [
      "pd test runs all generated pipe tests",
      "pd test-update updates snapshots",
      "Tests use @std/testing/snapshot for assertions"
    ]
  }
}
```

## Quick Reference

| Command | Description |
|---------|-------------|
| `pd` | Watch mode - auto-rebuild and serve |
| `pd build` | Build all markdown pipes |
| `pd run <file>` | Build and run a specific pipe |
| `pd serve <file>` | Build and serve a pipe as HTTP server |
| `pd test` | Run all pipe tests |
| `pd list` | List all built pipes |
| `pd clean` | Remove all generated files |
| `pd repl` | Interactive REPL with pipes loaded |
| `pd help` | Show help message |

## File Dependency Graph

```
mod.ts (entry point - imports all command handlers)
├── helpers.ts (shared utilities, used by run/serve/repl commands)
├── buildCommand.ts → pdBuild.ts
├── runCommand.ts → helpers.ts, pdBuild.ts
├── runWithCommand.ts → helpers.ts, pdBuild.ts
├── serveCommand.ts → helpers.ts, pdBuild.ts
├── testCommand.ts → pdBuild.ts
├── listCommand.ts
├── cleanCommand.ts
├── replCommand.ts → helpers.ts, pdBuild.ts
├── helpCommand.ts
├── defaultCommand.ts → buildandserve.ts
│                        └── pdBuild.ts, reportErrors.ts
└── reportErrors.ts
```

## Key Concepts

1. **Pipes**: Markdown files that define data processing pipelines
2. **Build Output**: Generated TypeScript in `.pd/` directory
3. **Command Router**: `checkFlags()` pattern for CLI routing
4. **Hot Reload**: SSE-based browser refresh on file changes
