## Plan: Explicit Export Wrappers

Formalize export wrappers as the primary extension mechanism for Pipedown, while preserving the current lightweight template model and avoiding a large plugin system. The goal is to make wrappers explicit, discoverable, versionable, and packageable so that Pipedown packages and exports can extend Pipedown itself.

**Why This Matters**
The current system already generates thin host wrappers for CLI, server, worker, test, and trace use cases. That is the strongest natural extension surface in the codebase. Rather than inventing a new abstraction layer, Pipedown should treat wrappers as named, documented exports that can live in packages, be shared, and eventually be published through the same package lifecycle as pipes.

**Current Codebase Anchors**
- `/Users/aaronmyatt/pipes/core/pipedown/templates/cli.ts`
- `/Users/aaronmyatt/pipes/core/pipedown/templates/server.ts`
- `/Users/aaronmyatt/pipes/core/pipedown/templates/worker.ts`
- `/Users/aaronmyatt/pipes/core/pipedown/templates/test.ts`
- `/Users/aaronmyatt/pipes/core/pipedown/templates/trace.ts`
- `/Users/aaronmyatt/pipes/core/pipedown/defaultTemplateFiles.ts`
- `/Users/aaronmyatt/pipes/core/pipedown/pdCli/runWithCommand.ts`
- `/Users/aaronmyatt/pipes/core/pipedown/pdCli/helpers.ts`
- `/Users/aaronmyatt/pipes/core/pipedown/pdBuild.ts`
- `/Users/aaronmyatt/pipes/core/pipedown/exportPipe.ts`

**Current Situation**
1. Built-in wrappers exist as template files.
2. They are scaffolded into user projects and copied into `.pd` outputs.
3. `run-with` already offers a low-level mechanism for running through an alternate wrapper.
4. User-defined templates already exist via config.
5. The gap is discoverability, naming, lifecycle, and metadata.

**Recommended Direction**
1. Rename the conceptual model from template files to export wrappers.
2. Keep the implementation thin: a wrapper is still just a small file that imports the generated pipe and adapts it to a host.
3. Make wrappers explicit in config and package manifests.
4. Let wrappers be shipped as Pipedown package exports.
5. Allow the core Pipedown project to consume wrapper packages itself.

**Wrapper Contract**
Each wrapper should define:
1. Name
2. Purpose
3. Host/runtime assumptions
4. Expected input envelope additions
5. Output behavior
6. Optional install/deployment hints
7. Optional bundling/export behavior

A wrapper should not redefine pipeline semantics. It should only adapt the pipe to a host surface.

**Recommended Wrapper Categories**
1. Execution wrappers
   `cli`, `server`, `worker`
2. Development wrappers
   `test`, `trace`
3. Distribution wrappers
   future wrappers such as `raycast`, `extension`, or `subhosting-server`
4. Internal Pipedown wrappers
   wrappers used by Pipedown itself for registry tasks, inspection, or future tooling.

**How Pipedown Can Extend Itself Here**
This is the clearest area where Pipedown can use its own mechanism.
1. Future Pipedown wrapper packs can be distributed as Pipedown packages.
2. The core CLI can install or consume wrapper packages published by the Pipedown ecosystem.
3. Internal features like packaging reports, registry synchronization jobs, or hosted deployment adapters can be exposed as Pipedown exports where appropriate.
4. This creates an ecosystem where extending Pipedown feels like building more Pipedown.

**Low-Abstraction Design Rules**
1. Do not build a generic plugin host first.
2. Do not hide wrappers behind complex runtime registration.
3. Prefer explicit file- or manifest-based declarations.
4. Keep wrappers readable and auditable.
5. Favor composition through multiple simple wrappers over one giant wrapper abstraction if composition becomes necessary later.

**Implementation Phases**
1. Phase 1: Formal wrapper vocabulary
   Update docs and planning language so templates are treated as wrappers/exports.
2. Phase 2: Manifest/config declaration
   Allow packages and projects to declare named wrappers explicitly.
3. Phase 3: Wrapper discovery and listing
   Add a lightweight way to list available wrappers and their metadata.
4. Phase 4: Wrapper packaging
   Allow wrappers to be shipped and installed as Pipedown packages.
5. Phase 5: Wrapper-aware export/build flow
   Integrate wrappers more explicitly with export generation and deployment hints.

**Relationship To Current Commands**
1. `run-with` is the seed of the wrapper story and should remain part of it.
2. `serve` and `run` can continue as convenience commands over well-known wrappers.
3. Future package-aware export commands should resolve wrappers through explicit metadata rather than copying arbitrary files blindly.

**Scope Boundaries**
Included:
- Wrapper contract
- Wrapper naming and discoverability
- Relationship between wrappers and package manifests
- Wrapper distribution as packages
- Pipedown-extending-Pipedown through wrappers

Excluded for now:
- General-purpose plugin system
- Arbitrary code injection points across the build graph
- Complex wrapper composition engine
- Non-Deno runtime support beyond export-level compatibility metadata

**Open Design Questions With Recommendations**
1. Should wrappers remain file-based or become data-driven objects?
   Recommendation: remain file-based first, with metadata declared alongside them.
2. Should every wrapper be executable directly by the CLI?
   Recommendation: only if it has a stable invocation contract.
3. Should the core project ship a wrapper registry?
   Recommendation: start with explicit built-ins and package-manifest declarations rather than a global registry service.

**Verification**
1. Another agent can derive a wrapper manifest contract and command plan from this document.
2. The wrapper model stays recognizably close to the current template mechanism.
3. Pipedown packages can distribute wrappers that Pipedown itself can consume.
4. The design avoids over-abstracting early while still making wrappers first-class.