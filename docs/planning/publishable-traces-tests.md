## Plan: Publishable Traces And Tests

Treat test snapshots, VCR cassettes, and execution traces as portable metadata associated with a package, export, or deployment rather than as purely local byproducts. The goal is to make them useful for package trust, debugging, reproducibility, and future hosted visibility without making them mandatory for every package.

**Why This Matters**
One of Pipedown’s differentiators is that it can keep logic, tests, and documentation close together. The current test and trace wrappers already encode valuable metadata. Formalizing how that metadata travels with packages or deployments strengthens the package story and makes a future registry or hosted platform much more transparent.

**Current Codebase Anchors**
- `/Users/aaronmyatt/pipes/core/pipedown/templates/test.ts`
  Current snapshot and VCR cassette behavior.
- `/Users/aaronmyatt/pipes/core/pipedown/templates/trace.ts`
  Current execution tracing, sanitization, and delta capture.
- `/Users/aaronmyatt/pipes/core/pipedown/pdCli/testCommand.ts`
  Current entrypoint for running tests.
- `/Users/aaronmyatt/pipes/core/pipedown/pdCli/runCommand.ts`
  Current trace-aware default execution flow.
- `/Users/aaronmyatt/pipes/core/pipedown/mdToPipe.ts`
  Source of step metadata including mock flags and descriptions.

**Current Metadata Assets**
1. Snapshot tests
   Useful for package reproducibility and regression review.
2. VCR cassettes
   Useful for deterministic replay and publishable evidence of external-step behavior.
3. Trace logs
   Useful for inspection, debugging, and hosted execution observability.

**Recommended Metadata Model**
1. Treat tests and traces as optional package-associated metadata.
2. Keep the formats JSON- and markdown-friendly.
3. Distinguish between local development artifacts and publishable artifacts.
4. Allow the registry or hosted platform to reference these artifacts even when they are not embedded inside the package archive.

**Recommended Artifact Classes**
1. Package verification metadata
   Snapshot summaries, trace summaries, cassette presence, execution timestamps.
2. Portable replay metadata
   VCR cassettes or equivalent replay assets that make tests deterministic.
3. Hosted runtime metadata
   Execution traces, logs, deployment run summaries.

**Key Principles**
1. Do not force every package to publish traces or cassettes.
2. Preserve privacy and size limits through sanitization and explicit opt-in.
3. Reuse the existing sanitization logic as a design anchor.
4. Keep the metadata model aligned with markdown-canonical packages.

**How Pipedown Can Extend Itself Here**
Pipedown packages can publish their own traces, cassettes, and verification reports, and Pipedown itself can consume those artifacts in the CLI, registry, or hosted UI. This creates a useful feedback loop where Pipedown packages become both executable units and richly inspectable units.

**Implementation Phases**
1. Phase 1: Metadata classification
   Define what counts as local-only versus publishable metadata.
2. Phase 2: Package references
   Decide how package manifests or derived metadata refer to traces/tests/cassettes.
3. Phase 3: CLI surfacing
   Add package-aware summaries in `pd info` and related commands.
4. Phase 4: Registry surfacing
   Expose verification and trace summaries in a future registry prototype.
5. Phase 5: Hosted deployment linkage
   Attach traces and test metadata to hosted versions or deployments.

**Recommended Early Use Cases**
1. `pd info` shows whether a package includes snapshots, cassettes, or trace summaries.
2. `pd publish` can optionally upload verification artifacts.
3. Hosted deployments can attach trace logs to a package version.
4. Registry package pages can later show a concise “verified by snapshots/traces” summary.

**Scope Boundaries**
Included:
- Artifact classification
- Package metadata references
- Publishability rules
- Reuse of existing test/trace formats and sanitization concepts

Excluded for now:
- Full observability backend design
- Authentication or access-control model for trace visibility
- Real-time monitoring infrastructure

**Open Design Questions With Recommendations**
1. Embed artifacts in the package or reference them externally?
   Recommendation: allow either, but prefer optional references or sidecar artifacts for large metadata.
2. Should cassettes be publishable by default?
   Recommendation: no; make them explicit because they may capture sensitive behavior.
3. Should trace artifacts influence version trust?
   Recommendation: only as supplemental evidence, not as required publication gates.

**Verification**
1. Another agent can draft metadata schemas and lifecycle behavior from this document.
2. The test/trace story strengthens package trust without becoming mandatory ceremony.
3. Existing test and trace wrappers remain recognizable as the source of truth for future metadata work.