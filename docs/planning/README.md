## Pipedown Platform Planning Set

This directory contains a set of seven separate, execution-ready planning
documents aligned with the current Pipedown codebase and the current platform
direction: Deno-first, markdown-canonical packages, minimal abstraction, and
explicit export wrappers as the primary extension mechanism.

The set is intended to be readable by humans and actionable by future agents
without requiring the full chat history.

## Documents

1. [package-manifest.md](./package-manifest.md) Defines the markdown-native
   package/archive format, manifest fields, versioning rules, dependency model,
   and archive layout.

2. [cli-package-lifecycle.md](./cli-package-lifecycle.md) Defines pack, install,
   publish, fetch, upgrade, and info semantics and how they fit into the
   existing CLI router.

3. [export-wrappers.md](./export-wrappers.md) Defines explicit export wrappers
   as the primary extension surface for Pipedown, keeping templates simple and
   discoverable.

4. [runtime-core-boundaries.md](./runtime-core-boundaries.md) Defines what
   remains runtime-core, what stays host-specific, and how to preserve the small
   kernel in `pdPipe`.

5. [capability-validation.md](./capability-validation.md) Defines a light-weight
   capability declaration and validation pass for install, build, and hosted
   execution.

6. [publishable-traces-tests.md](./publishable-traces-tests.md) Defines tests,
   cassettes, and traces as portable metadata that can travel with packages or
   be surfaced by a registry/host.

7. [markdown-roundtrip.md](./markdown-roundtrip.md) Defines markdown as
   canonical source and specifies the round-trip and source-of-truth rules for
   local, registry, and future hosted workflows.

## Recommended Sequence

1. package-manifest.md
2. cli-package-lifecycle.md
3. export-wrappers.md
4. runtime-core-boundaries.md
5. capability-validation.md
6. publishable-traces-tests.md
7. markdown-roundtrip.md

## Cross-Cutting Milestones

1. Milestone 1: Local package archive Depends on docs 1 and 7.

2. Milestone 2: Local install and execution Depends on docs 1, 2, 3, and 4.

3. Milestone 3: Minimal registry prototype Depends on docs 1, 2, 5, 6, and 7.

4. Milestone 4: Explicit export wrappers Depends on docs 2, 3, and 4.

5. Milestone 5: Hosted server deployment via Deno Subhosting Depends on docs 3,
   4, 5, 6, and 7.

## Shared Decisions

- Deno remains the primary runtime and distribution anchor.
- Markdown remains canonical source; generated files are derivative artifacts.
- Export wrappers, not a large plugin system, are the first-class extension
  surface.
- The package story comes before collaboration or a broad hosted authoring
  environment.
- Pipedown should ideally use Pipedown packages and exports to extend its own
  CLI, registry, docs, and wrappers over time.

## Relevant Code Anchors

- `/Users/aaronmyatt/pipes/core/pipedown/pdBuild.ts`
- `/Users/aaronmyatt/pipes/core/pipedown/pipedown.d.ts`
- `/Users/aaronmyatt/pipes/core/pipedown/exportPipe.ts`
- `/Users/aaronmyatt/pipes/core/pipedown/pdCli/mod.ts`
- `/Users/aaronmyatt/pipes/core/pipedown/mdToPipe.ts`
- `/Users/aaronmyatt/pipes/core/pdPipe/mod.ts`
- `/Users/aaronmyatt/pipes/core/pipedown/templates/test.ts`
- `/Users/aaronmyatt/pipes/core/pipedown/templates/trace.ts`
- `/Users/aaronmyatt/pipes/core/pipedown/pipeToMarkdown.ts`
- `/Users/aaronmyatt/pipes/core/pipedown/pdCli/syncCommand.ts`

## Verification Expectations

1. Each doc should be independently actionable by another agent without needing
   the conversation history.
2. Each doc should reference current files or symbols rather than abstract
   architecture only.
3. Each doc should explicitly state what is in scope and what is deferred.
4. Each doc should identify at least one natural way Pipedown packages or
   exports can be used to extend Pipedown itself.
5. The whole set should remain aligned with Deno-first distribution and Deno
   Subhosting for the initial hosted flow.
