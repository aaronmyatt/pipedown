## Plan: Capability Declaration And Validation

Introduce a lightweight capability declaration and validation model that can
inform package install, local build, and hosted execution decisions without
turning Pipedown into a heavy policy engine. The first goal is clarity and
trust, not perfect static analysis.

**Why This Matters** As soon as Pipedown packages can be installed from
elsewhere or deployed through a hosted service, users need a simple way to
understand what a package expects to do. Capability metadata creates a bridge
between source transparency, package trust, install prompts, and future hosted
policy enforcement.

**Current Codebase Anchors**

- `/Users/aaronmyatt/pipes/core/pipedown/mdToPipe.ts` Current extraction of step
  descriptions, directives, schemas, and mock flags provides natural parser
  hooks.
- `/Users/aaronmyatt/pipes/core/pipedown/pipedown.d.ts` Current `PipeConfig` and
  `Step` structures can be extended conceptually with capability metadata.
- `/Users/aaronmyatt/pipes/core/pipedown/pipeToScript.ts` Current import
  extraction and generated module assembly may support shallow inference.
- `/Users/aaronmyatt/pipes/core/pipedown/templates/server.ts`
- `/Users/aaronmyatt/pipes/core/pipedown/templates/test.ts`
- `/Users/aaronmyatt/pipes/core/pipedown/templates/trace.ts` Existing wrappers
  show different host assumptions that capability metadata can describe.

**Recommended Capability Model** Start simple and package-level.

1. Declare capabilities explicitly in the manifest or package config.
2. Optionally infer or warn on obvious mismatches during build.
3. Surface capability summaries during `pack`, `info`, `install`, and `publish`.
4. Use the same metadata later for hosted deployment admission checks.

**Initial Capability Categories**

1. Network
2. Environment variables
3. File system
4. KV/storage
5. Subprocess execution
6. HTTP server behavior
7. Worker/event behavior
8. Trace/test recording behavior
9. External package imports

**Principles**

1. Prefer declaration first, inference second.
2. Avoid pretending static analysis can prove everything.
3. Keep categories human-understandable.
4. Use warnings before hard errors in the first iteration.
5. Ensure the same capability vocabulary works for local tooling and hosted
   policy.

**Where To Extract Or Validate**

1. Parser phase Read explicit capability declarations from manifest or config.
2. Build phase Perform shallow validation and emit warnings for likely
   undeclared capabilities.
3. Package lifecycle Show capabilities in `pd info`, `pd pack`, and
   `pd install`.
4. Hosted deployment Match declared capabilities against what the host supports.

**How Pipedown Can Extend Itself Here** Capability declarations can make
Pipedown extension packages safer and easier to adopt. Wrapper packages,
internal tooling packages, and future hosted adapters can all declare what they
need using the same vocabulary. That lets Pipedown extend itself through
packages without turning every install into blind trust.

**Implementation Phases**

1. Phase 1: Capability vocabulary Define the initial categories and semantics.
2. Phase 2: Declaration format Decide whether capabilities live in
   `pipedown.json`, embedded config, or both.
3. Phase 3: Build/install surfacing Show capability metadata during package
   lifecycle operations.
4. Phase 4: Shallow validation Add simple mismatches and warnings, not complex
   static guarantees.
5. Phase 5: Hosted admission policy Reuse the same metadata for
   Subhosting-oriented deployment checks.

**Recommended Early Behaviors**

1. Warn if a package declares no capabilities but obviously uses server or
   worker wrappers.
2. Warn if a package claims no network capability but imports modules that
   strongly suggest network use or uses fetch-heavy wrappers.
3. Show a concise capability summary during install.
4. Include capabilities in package metadata so the registry can surface them
   later.

**Scope Boundaries** Included:

- Capability vocabulary
- Declaration strategy
- Install/build/host surfacing
- Shallow validation approach

Excluded for now:

- Full code-effect analysis
- Sandbox implementation details
- Formal security guarantees
- Rich policy authoring language

**Open Design Questions With Recommendations**

1. Manifest only or manifest plus embedded config? Recommendation: package
   manifest first; optionally mirror relevant information into generated
   metadata.
2. Warning-only or blocking install? Recommendation: warning-only first, with
   blocking reserved for hosted deployment policy later.
3. Step-level or package-level capabilities first? Recommendation: package-level
   first; step-level can be derived or added later if needed.

**Verification**

1. Another agent can draft a minimal capability schema and lifecycle surfacing
   plan from this document.
2. The capability model remains simple enough to explain to users.
3. Capability metadata can be reused for both local trust signals and future
   hosted policy checks.
