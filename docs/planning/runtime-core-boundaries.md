## Plan: Runtime-Core Boundaries

Preserve the small, portable execution kernel in `pdPipe` while pushing
host-specific concerns outward into wrappers, build stages, and distribution
surfaces. The goal is to keep runtime-core simple enough to remain trustworthy
and reusable, while making Deno-specific execution and deployment capabilities
explicit at the edges.

**Why This Matters** A platform that wants to be extended through packages and
wrappers needs a stable center. Right now the best candidate is the small
`pdPipe` runtime. Protecting that boundary reduces future confusion, makes the
wrapper/export story cleaner, and limits how much packaging and hosting concerns
leak into execution semantics.

**Current Codebase Anchors**

- `/Users/aaronmyatt/pipes/core/pdPipe/mod.ts`
- `/Users/aaronmyatt/pipes/core/pdPipe/pipeline.ts`
- `/Users/aaronmyatt/pipes/core/pdPipe/pdUtils.ts`
- `/Users/aaronmyatt/pipes/core/pipedown/pipedown.d.ts`
- `/Users/aaronmyatt/pipes/core/pipedown/templates/cli.ts`
- `/Users/aaronmyatt/pipes/core/pipedown/templates/server.ts`
- `/Users/aaronmyatt/pipes/core/pipedown/templates/worker.ts`
- `/Users/aaronmyatt/pipes/core/pipedown/pdBuild.ts`
- `/Users/aaronmyatt/pipes/core/pipedown/pipeToScript.ts`
- `/Users/aaronmyatt/pipes/core/pipedown/deps.ts`

**Current Boundary Assessment**

1. `pdPipe` is already small and focused.
2. Parsing, building, and file I/O are outside runtime-core.
3. Host wrappers are already outside runtime-core.
4. The main risk is accidental leakage of Deno-specific assumptions into types,
   manifests, or future package resolution logic.

**Recommended Runtime-Core Definition** Runtime-core includes:

1. Pipeline sequencing
2. Step wrapping and conditional execution
3. Error aggregation
4. Execution semantics over an input object
5. Minimal shared types required by runtime behavior

Runtime-core excludes:

1. Markdown parsing
2. File system access
3. CLI routing
4. HTTP serving
5. Worker event handling
6. Test harnesses
7. Trace persistence
8. Package install/publish logic
9. Registry logic

**Design Rules**

1. Keep runtime-core free of direct host bootstrapping.
2. Prefer data passed in through the input object or metadata rather than
   runtime-core consulting the environment directly.
3. Keep runtime-core usable by generated code without dragging in the full
   CLI/build toolchain.
4. Make host assumptions wrapper concerns.

**Deno-First Without Runtime Pollution** You can stay fully Deno-first and still
keep the runtime-core narrow.

1. Build, package, publish, and deploy can be Deno-first.
2. Wrappers can remain Deno-first.
3. The runtime-core should remain agnostic enough that generated pipes are
   conceptually portable even if the surrounding platform is Deno-native.

**How Pipedown Can Extend Itself Here** Once the runtime-core boundary is
explicit, future Pipedown packages can extend the system by shipping wrappers,
packaging helpers, or inspection tools without modifying the runtime kernel.
That is a healthier self-extension model than letting feature packages hook
arbitrary runtime internals.

**Implementation Phases**

1. Phase 1: Boundary documentation Write down the runtime-core contract and what
   is deliberately outside it.
2. Phase 2: Type audit Check shared types for host leakage and clarify which
   types are core versus build/CLI specific.
3. Phase 3: Wrapper boundary audit Ensure wrappers own host bootstrapping and
   envelope shaping.
4. Phase 4: Package lifecycle audit Ensure packaging logic depends on build and
   wrappers, not on expanding runtime-core responsibilities.

**Interaction With Package and Wrapper Plans**

1. Packages should depend on runtime-core only through generated outputs and
   shared types.
2. Wrappers should import generated pipes, not reimplement pipeline logic.
3. Registry and hosted plans should treat runtime-core as a stable executable
   substrate, not a place to attach product logic.

**Scope Boundaries** Included:

- Defining runtime-core responsibilities
- Defining host-specific responsibilities
- Protecting the `pdPipe` boundary
- Aligning package/wrapper work around that boundary

Excluded for now:

- Refactoring the entire repo structure
- Splitting the repository into multiple packages immediately
- General runtime virtualization or sandbox design

**Open Design Questions With Recommendations**

1. Should shared types live in `pdPipe` or remain in `pipedown`? Recommendation:
   keep the plan oriented around conceptual boundaries first; physical
   relocation can follow later.
2. Should traces/tests reach into runtime-core? Recommendation: no. Keep them
   wrapper-level or harness-level concerns.
3. Should package install metadata ever affect runtime-core execution?
   Recommendation: no. It can affect preparation and wrapper selection, not the
   execution kernel.

**Verification**

1. Another agent can identify which files should remain runtime-core and which
   should remain wrappers/tooling.
2. New package and wrapper features can be designed without broadening `pdPipe`
   responsibilities.
3. The platform can stay Deno-first while the runtime kernel remains
   intentionally small and durable.
