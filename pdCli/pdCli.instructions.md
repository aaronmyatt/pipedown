# pdCli

Command-line interface for Pipedown. Build, run, test, serve, and manage markdown-based pipe definitions.

---

## Architecture

- **Pattern**: Command-based modular CLI
- **Entry**: `mod.ts`
- **Routing**: `checkFlags()` wrapper matches commands to handlers
- **Flags**: `@std/cli` parseArgs

---

## Commands

| Command | File | Description |
|---------|------|-------------|
| `pd` | defaultCommand.ts | Watch mode, auto-rebuild and serve |
| `pd build` | buildCommand.ts | Build all markdown pipes to `.pd/` |
| `pd run <file>` | runCommand.ts | Build and run a pipe |
| `pd runWith <wrapper> <file>` | runWithCommand.ts | Run with wrapper (server, worker) |
| `pd serve <file>` | serveCommand.ts | Build and serve as HTTP server |
| `pd test` / `pd t` | testCommand.ts | Run all pipe tests |
| `pd test-update` / `pd tu` | testCommand.ts | Update test snapshots |
| `pd list` | listCommand.ts | List built pipes |
| `pd clean` | cleanCommand.ts | Remove `.pd/` directory |
| `pd repl` | replCommand.ts | REPL with pipes preloaded |
| `pd help` | helpCommand.ts | Show help |

---

## Files

### mod.ts
Entry point and command router.
- Parse CLI arguments
- Initialize `.pd/` directory
- Load `config.json`
- Route via `checkFlags()` to handlers
- **Exports**: `checkFlags`

### helpers.ts
Shared execution utilities.
- `pdRun`, `pdRunWith`, `pdServe`, `pdRepl`
- **Constants**: `PD_DIR`, `commonArgs`

### buildandserve.ts
Development server with hot reload.
- Watch `.md` files
- Debounced rebuild
- SSE reload

### reportErrors.ts
Error formatting and display.

---

## Flags

**Global**
- `-d, --debug` — Debug output
- `-h, --help` — Help
- `-v, --version` — Version
- `-j, --json` — JSON output
- `-p, --pretty` — Pretty print

**Command-specific**
- `--input` — JSON input for run/serve

---

## Data Types

### CliInput
Main object through command pipeline.
- `flags` — Parsed args
- `globalConfig` — From config.json
- `projectPipes` — Discovered .md files
- `errors` — Accumulated errors
- `output` — Output container
- `debug` — Debug flag

---

## Command Flow

1. **Init**: Parse args → check version/help → create `.pd/` → load config
2. **Context**: Walk for `.md` files → build `projectPipes` array
3. **Route**: Match via `checkFlags()` → execute handler

---

## Conventions

- **Naming**: `[name]Command.ts` with `[name]Command(input: CliInput)` export
- **Help**: Use `cliHelpTemplate` from `stringTemplates.ts`
- **Errors**: Accumulate in `input.errors`
- **Return**: `Promise<CliInput>` or `CliInput`
- **Pattern**: Check help flag before main logic

---

## Dependencies

**Internal**
- `../deps.ts` — std lib, esbuild, pd modules
- `../pdBuild.ts` — Build pipeline
- `../stringTemplates.ts` — Code templates
- `../pipedown.d.ts` — Types

**External**
- `@std/cli` — Arg parsing
- `@std/fs` — File system
- `@std/fmt/colors` — Colors
- `@pd/pdpipe` — Pipeline processing

---

## Adding a New Command

1. Create `[name]Command.ts`
2. Export `async function [name]Command(input: CliInput)`
3. Add help text via `cliHelpTemplate`
4. Check help flag first
5. Import in `mod.ts`
6. Add `checkFlags(['name'], [name]Command)` to `funcs`

---

## Debugging

- `--debug` or `-d` flag
- `DEBUG` env variable
- Check `input.errors` array

---

## Testing

- `pd test` — Run tests
- `pd test-update` — Update snapshots
- Uses `@std/testing/snapshot`
