## Plan: Local Packaging — `pipedown.json`, `pd pack`, `pd install`

Enable Pipedown projects to be packaged as portable archives and installed into
other projects. Local-only scope: no registry, no remote fetch, no hosted
deployment. Prove the package model works end-to-end with a real use case
(pd-assist) before expanding.

**Why This Matters** Today, sharing a Pipedown pipeline means copying markdown
files and hoping the recipient has the right directory structure, config.json,
templates, and dependencies. A minimal packaging story turns a project into a
self-contained, inspectable archive that another developer (or Pipedown project)
can install and run.

**First Dogfood Target: pd-assist** The pd-assist pipeline at
`/Users/aaronmyatt/pipes/pd-assist/` is the ideal first package:

- It's a real Pipedown pipeline that analyzes other Pipedown pipelines
- It has config, templates, and example files
- Installing it into another project validates the full pack → install → build →
  run flow
- It exercises `pd build`, `pd sync`, and Deno subprocess execution

**Current Codebase Anchors**

- `/Users/aaronmyatt/pipes/core/pipedown/pdCli/mod.ts` — CLI router where
  `pd pack` and `pd install` will be registered
- `/Users/aaronmyatt/pipes/core/pipedown/pdBuild.ts` — Build orchestration,
  called after install to regenerate `.pd/` outputs
- `/Users/aaronmyatt/pipes/core/pipedown/pdCli/inspectCommand.ts` — Existing
  inspect pattern, model for `pd info` on packages
- `/Users/aaronmyatt/pipes/core/pipedown/pdCli/helpers.ts` — Shared CLI helpers
- `/Users/aaronmyatt/pipes/core/pipedown/pipedown.d.ts` — Types to extend with
  package metadata
- `/Users/aaronmyatt/pipes/core/pipedown/exportPipe.ts` — Existing bundle/export
  logic, relevant for packaged exports

---

### 1. `pipedown.json` — Package Manifest

A new file at the project root that declares package identity and metadata.
Intentionally small — don't mirror the full `Pipe` structure.

**Required fields:**

```json
{
  "name": "pd-assist",
  "version": "0.1.0",
  "description": "LLM-powered stub detection and code generation for Pipedown pipelines",
  "entry": "assist.md"
}
```

**Optional fields:**

```json
{
  "author": "Aaron Myatt",
  "license": "MIT",
  "homepage": "https://github.com/...",
  "keywords": ["llm", "assist", "codegen"],
  "exports": {
    "cli": "templates/cli.ts",
    "server": "templates/server.ts"
  },
  "pipedownVersion": ">=0.5.0",
  "packageFormat": 1
}
```

**Design decisions:**

1. **Separate from `config.json`** — `pipedown.json` is for package identity and
   distribution; `config.json` is for runtime/build behavior. They serve
   different audiences.
2. **`entry` points to a markdown file** — the canonical source, not generated
   output.
3. **`exports` are optional** — not every package needs custom wrappers.
4. **No dependencies field yet** — Pipedown-to-Pipedown dependencies can be
   added later when there are packages to depend on. External `jsr:` and `npm:`
   imports remain in Deno resolution.
5. **`packageFormat: 1`** — schema version for future evolution.

**Validation rules:**

- `name` required, must be a valid package name (lowercase, hyphens, no spaces)
- `version` required, must be valid semver
- `entry` required, must point to an existing `.md` file
- If `exports` specified, files must exist

---

### 2. `pd pack` — Create a Package Archive

Creates a `.tar.gz` archive from a Pipedown project.

**Command:** `pd pack [--out <path>]`

**Behavior:**

1. Read and validate `pipedown.json` in the current directory (fail clearly if
   missing or invalid)
2. Resolve the file list:
   - Required: `pipedown.json`, entry markdown file(s), `README.md` (warn if
     missing)
   - Optional: `config.json`, `templates/` directory, `.cassettes/` directory,
     additional `.md` files
   - Excluded: `.pd/` directory, `node_modules/`, `.git/`, any files matching
     `config.exclude` patterns
3. Create a compressed tar archive: `{name}-{version}.tar.gz`
4. Output: archive path, file count, total size
5. Optional `--dry-run` flag: list files that would be included without creating
   the archive

**Archive layout:**

```
pd-assist-0.1.0.tar.gz
├── pipedown.json
├── README.md
├── config.json
├── assist.md
├── templates/
│   ├── cli.ts
│   ├── server.ts
│   ├── worker.ts
│   ├── test.ts
│   └── trace.ts
└── examples/
    └── sample.md
```

**Implementation:**

- New file: `pipedown/pdCli/packCommand.ts`
- Use Deno's `@std/archive` for tar creation and `@std/io` for gzip compression
- Register in `mod.ts`: `checkMinFlags(["pack"], packCommand)`

---

### 3. `pd install` — Install a Package from Local Archive

Installs a `.tar.gz` package archive into the current project.

**Command:** `pd install <path-to-archive.tar.gz>`

**Behavior:**

1. Validate the archive: must contain `pipedown.json`, must contain the declared
   entry markdown file
2. Extract into a project-local package directory: `.pipedown/packages/{name}/`
3. Copy or symlink the entry markdown file into the project's pipe discovery
   path (so `pd build` finds it)
4. Run `pd build` to generate `.pd/` outputs from the installed markdown
5. Record installation metadata in `.pipedown/installed.json`:
   ```json
   {
     "pd-assist": {
       "version": "0.1.0",
       "installedAt": "2026-03-28T...",
       "archivePath": "/path/to/pd-assist-0.1.0.tar.gz",
       "packageDir": ".pipedown/packages/pd-assist"
     }
   }
   ```
6. Output: installed package name, version, entry pipe name

**Design decisions:**

1. **Project-local, not global** — packages install into the current project,
   not a system-wide cache. This ensures reproducibility and avoids global
   version conflicts.
2. **Explicit metadata** — `.pipedown/installed.json` tracks what's installed
   for future `pd info`, `pd upgrade`, and `pd uninstall`.
3. **Auto-build after install** — users can immediately `pd run` the installed
   pipe without a separate build step.
4. **No dependency resolution** — if a package needs other packages, the user
   installs them manually in this iteration.

**Implementation:**

- New file: `pipedown/pdCli/installCommand.ts`
- Use `@std/archive` for tar extraction
- Register in `mod.ts`: `checkMinFlags(["install"], installCommand)`

---

### 4. `pd info` Enhancement

Extend the existing `pd inspect` or add `pd info` to show package metadata.

**Commands:**

- `pd info` — show current project's `pipedown.json` if present
- `pd info <archive.tar.gz>` — show package metadata from an archive without
  installing
- `pd info --installed` — list installed packages from
  `.pipedown/installed.json`

This builds on the existing `inspectCommand.ts` pattern.

---

### 5. Implementation Phases

| Phase | What                                                         | Effort | Depends On  |
| ----- | ------------------------------------------------------------ | ------ | ----------- |
| 1     | Define `pipedown.json` schema + validation function          | Small  | —           |
| 2     | Implement `pd pack`                                          | Medium | Phase 1     |
| 3     | Create `pipedown.json` for pd-assist                         | Small  | Phase 1     |
| 4     | Pack pd-assist as first real archive                         | Small  | Phases 2, 3 |
| 5     | Implement `pd install`                                       | Medium | Phase 2     |
| 6     | Install pd-assist into a test project, verify `pd run` works | Small  | Phases 4, 5 |
| 7     | Enhance `pd info` for package metadata                       | Small  | Phases 1, 5 |

**Recommended execution order:** Phases 1–6 as a single sprint, Phase 7 as a
follow-up.

---

### 6. New Files

| File                                              | Purpose                                      |
| ------------------------------------------------- | -------------------------------------------- |
| `pipedown/pdCli/packCommand.ts`                   | `pd pack` implementation                     |
| `pipedown/pdCli/installCommand.ts`                | `pd install` implementation                  |
| `pipedown/packageManifest.ts`                     | Manifest schema, validation, reading/writing |
| `/Users/aaronmyatt/pipes/pd-assist/pipedown.json` | First real package manifest                  |

### Modified Files

| File                               | Change                                 |
| ---------------------------------- | -------------------------------------- |
| `pipedown/pdCli/mod.ts`            | Register `pack` and `install` commands |
| `pipedown/pdCli/inspectCommand.ts` | Extend for package metadata display    |
| `pipedown/pipedown.d.ts`           | Add `PackageManifest` type             |
| `pipedown/stringTemplates.ts`      | Help text for new commands             |

---

### 7. Scope Boundaries

**Included:**

- `pipedown.json` manifest schema and validation
- `pd pack` creating local `.tar.gz` archives
- `pd install` from local archive into project
- `pd info` for package metadata inspection
- pd-assist as first dogfood package
- Installation metadata tracking (`.pipedown/installed.json`)

**Explicitly excluded (deferred to later milestones):**

- Remote registry (publish, fetch from URL)
- Dependency resolution between packages
- Capability declarations and validation
- Package signing or checksums beyond basic archive integrity
- `pd upgrade`, `pd uninstall`
- Hosted deployment integration
- Multi-pipe packages (one entry pipe per package for now)

---

### 8. Verification

1. `cd ~/pipes/pd-assist && pd pack` — produces `pd-assist-0.1.0.tar.gz`
2. `pd info pd-assist-0.1.0.tar.gz` — shows name, version, entry, description
3. `mkdir /tmp/test-project && cd /tmp/test-project && pd install ~/pipes/pd-assist/pd-assist-0.1.0.tar.gz`
   — installs successfully
4. `pd run assist --input '{"file": "../some-pipe.md"}' -- --json` — runs the
   installed pipe
5. `.pipedown/installed.json` exists with correct metadata
6. `pd info --installed` — lists pd-assist with version info
7. Packing a project without `pipedown.json` fails with a clear error message
8. Packing with invalid manifest (missing name/version) fails with a clear error
   message
