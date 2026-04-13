## Plan: CLI Package Lifecycle

Define the package lifecycle commands for Pipedown so developers can pack,
inspect, install, fetch, publish, and upgrade markdown-native packages locally
before a larger registry or hosted workflow exists. The design should fit
naturally into the current CLI router and remain pipeline-oriented rather than
introducing a separate toolchain mentality.

**Why This Matters** The CLI is already the operational center of Pipedown. If
package lifecycle becomes a separate conceptual system, the product will
fragment early. The goal here is to make packages feel like a native evolution
of the existing `build`, `run`, `serve`, `sync`, `watch`, and `test` workflows.

**Current Codebase Anchors**

- `/Users/aaronmyatt/pipes/core/pipedown/pdCli/mod.ts` Current command router
  and initialization flow.
- `/Users/aaronmyatt/pipes/core/pipedown/pdCli/helpers.ts` Current execution
  helpers and shared command behavior.
- `/Users/aaronmyatt/pipes/core/pipedown/stringTemplates.ts` Current help text
  pattern for CLI documentation.
- `/Users/aaronmyatt/pipes/core/pipedown/pdBuild.ts` Current build orchestration
  that package lifecycle commands will likely call into.
- `/Users/aaronmyatt/pipes/core/pipedown/pdCli/listCommand.ts` Useful precedent
  for project-local discovery.
- `/Users/aaronmyatt/pipes/core/pipedown/pdCli/inspectCommand.ts` Useful
  precedent for structured metadata output.

**Recommended Command Set**

1. `pd pack` Create a package archive from canonical markdown source and
   manifest.
2. `pd info` Inspect local package archives, installed packages, or remote
   package metadata.
3. `pd install` Install a local archive or remote package reference into a local
   cache or project.
4. `pd fetch` Download a package without activating it in the project.
5. `pd publish` Validate and push a package to a registry.
6. `pd upgrade` Resolve a newer matching version and install it.
7. Optional later: `pd uninstall`, `pd list-installed`, `pd doctor`.

**CLI UX Principles**

1. Commands should operate on markdown packages, not opaque binary blobs.
2. Output should be inspectable and scriptable.
3. The CLI should continue to support JSON-oriented workflows for automation.
4. Package commands should reuse the current help/flag patterns in the command
   files.
5. Installation should not require the user to understand internal `.pd` layout.

**Recommended Local Install Model**

1. Maintain a local Pipedown package cache.
2. Allow installation into a project through explicit metadata rather than
   copying raw files blindly.
3. Regenerate `.pd` outputs locally from canonical package contents where
   possible.
4. Preserve installed package metadata so future `upgrade` and `info` commands
   can reason about provenance and integrity.

**Interaction With Existing Commands**

1. `pd run` and `pd serve` should eventually be able to target installed package
   references, not only local markdown files.
2. `pd build` should remain project-oriented, but package installs may feed
   build inputs or exports into the project graph.
3. `pd inspect` should grow the ability to inspect package archives or installed
   packages.
4. `pd list` may later distinguish local project pipes from installed packages.

**How Pipedown Can Extend Itself Here** There is a natural opportunity to let
parts of the package lifecycle itself be expressed as Pipedown pipelines or
exports. For example:

1. Packaging reports and validation summaries could be generated via Pipedown
   pipes.
2. Registry interaction wrappers could begin life as export wrappers.
3. Example or community commands could be shipped as Pipedown packages consumed
   by the CLI. The constraint is to keep the command entrypoints explicit in the
   core CLI while using Pipedown packages for specialized behaviors around them.

**Implementation Phases**

1. Phase 1: Command semantics and install locations Decide how archives are
   named, where packages are cached, and how projects reference them.
2. Phase 2: `pd pack` and `pd info` Provide local pack and inspect first.
3. Phase 3: `pd install` and `pd fetch` Support local archives before remote
   registry resolution.
4. Phase 4: `pd publish` Add package validation and upload semantics.
5. Phase 5: `pd upgrade` Layer version resolution on top of the manifest and
   install metadata.

**Recommended Command Behavior Detail**

1. `pd pack` Should fail clearly if required package metadata is missing.
2. `pd info` Should support `--json` and work on local archives, installed
   references, and later remote references.
3. `pd install` Should verify integrity, unpack into cache, and optionally
   materialize exports or link package references into the project.
4. `pd fetch` Should not mutate the active project by default.
5. `pd publish` Should validate package metadata, integrity, and version
   immutability assumptions before upload.
6. `pd upgrade` Should consult install metadata and optionally respect a lock
   file.

**Scope Boundaries** Included:

- Command names and semantics
- Local install model
- Package cache and metadata concerns
- Relationship to current commands
- JSON/scriptability expectations

Excluded for now:

- Full registry API design
- Multi-registry federation
- Enterprise auth model
- UI or desktop package management

**Repo-Level Execution Strategy**

1. Add lifecycle commands to the router in `mod.ts` after the manifest is
   defined.
2. Follow the current command-file pattern so each package lifecycle command
   remains small and explicit.
3. Reuse `pdBuild()` rather than duplicating build logic.
4. Keep package install metadata simple enough to be expressed as JSON in the
   early iteration.

**Open Design Questions With Recommendations**

1. Should install copy source into the project or keep it in a cache?
   Recommendation: prefer a cache plus explicit references at first.
2. Should `pd install` auto-build packages? Recommendation: yes, if derived
   outputs are absent or stale, but keep the rule explicit.
3. Should remote fetch happen before local pack is stable? Recommendation: no.
   Nail `pack` and local `install` first.

**Verification**

1. Another agent can derive a command matrix and implementation order from this
   document.
2. Package lifecycle commands fit cleanly into the current router and help-text
   style.
3. The flow works entirely locally before introducing a registry.
4. Installed packages can later power existing run/build/export flows without
   special-case architectural rewrites.
