## Plan: Pipedown Package Manifest

Define a markdown-native package and archive format for Pipedown that preserves
markdown as canonical source, supports local installation and future registry
publication, and stays aligned with the current Deno-first build pipeline. The
package format should feel closer to an npm tarball or a jar than to a
compiled-only artifact store: a versioned source snapshot plus manifest and
optional derived metadata.

**Why This Matters** A stable package format is the foundation for everything
else: local install, publish, fetch, versioning, explicit exports, registry
metadata, and hosted deployment. Without a package contract, every later feature
will invent its own assumptions. This recommendation should therefore be treated
as the root of the platform plan.

**Current Codebase Anchors**

- `/Users/aaronmyatt/pipes/core/pipedown/pipedown.d.ts` The `Pipe`, `Step`, and
  `PipeConfig` types already contain most of the metadata needed for a package
  manifest.
- `/Users/aaronmyatt/pipes/core/pipedown/pdBuild.ts` The current build writes
  `index.json`, `index.md`, and `index.ts` per pipe and already models a clear
  source-to-artifact pipeline.
- `/Users/aaronmyatt/pipes/core/pipedown/exportPipe.ts` Current bundling support
  shows where explicit exports and derived bundles belong.
- `/Users/aaronmyatt/pipes/core/pipedown/mdToPipe.ts` Current parser extracts
  pipe description, step descriptions, schemas, mock flags, and directives that
  should inform manifest metadata.
- `/Users/aaronmyatt/pipes/core/pipedown/pipeToMarkdown.ts` Important for
  ensuring the package format never drifts away from markdown as canonical
  source.

**Recommended Package Model**

1. Canonical source is markdown. The package should publish markdown files and
   associated package metadata. Generated TypeScript, JSON, bundles, traces, and
   test artifacts are derived outputs.
2. The package is a source snapshot plus manifest. A package should be a
   compressed archive containing the markdown source, package manifest, optional
   lock file, optional package-level config, and optional derived metadata.
3. Package identity is separate from pipe names. A package may contain one
   primary exported pipe at first, but the model should allow multiple pipe
   entries later without needing a new archive format.
4. The package must be installable locally before it is publishable remotely.
   Package design should optimize for local development first.

**Proposed Archive Layout**

1. `pipedown.json` Package manifest.
2. `README.md` Human-facing description.
3. `config.json` Optional package-level config if you decide to keep it distinct
   from embedded markdown config.
4. One or more canonical markdown entry files.
5. Optional `pipedown.lock`.
6. Optional metadata directory for derived artifacts and checksums.
7. Optional export artifacts directory when a package is packed with prebuilt
   exports.

**Proposed Manifest Fields**

1. Identity `name`, `version`, `description`, `license`, `author`, `repository`,
   `homepage`, `keywords`.
2. Source entry `entry` for the default markdown file.
3. Exports Named exports for `pipe`, `server`, `worker`, `cli`, `trace`, or
   future custom wrappers.
4. Dependencies Package-level dependencies on other Pipedown packages.
5. Runtime compatibility Deno version requirements and package format version.
6. Capabilities Declared package-level capabilities that can later be validated
   or surfaced during install and hosting.
7. Integrity metadata Content hashes for markdown, schema, and package archive.
8. Derived metadata Optional links or references to traces, tests, bundles, and
   generated artifact snapshots.

**Design Rules**

1. Never require generated `.pd` output in the archive. It can be included
   optionally, but packages should remain reconstructible from canonical
   markdown plus manifest.
2. Keep the manifest small. Do not mirror the entire `Pipe` JSON structure
   directly into the public manifest. Use the manifest for package identity and
   install-time concerns; use generated `index.json` for runtime/build detail.
3. Make the format inspectable with minimal tooling. Users should be able to
   unpack a package and understand it without a proprietary client.
4. Prefer tarball-style packaging over base64-in-JSON. Base64 may still be
   useful for transport in some contexts, but the on-disk and registry artifact
   should be a normal archive.

**Versioning Model**

1. Use semantic versioning at the package level.
2. Tie version changes to canonical source changes, not generated artifacts.
3. Treat manifest schema changes separately using a package-format version.
4. Require immutable published versions.

**Dependency Model**

1. Initial scope: Pipedown-to-Pipedown package dependencies only.
2. External `jsr:` and `npm:` imports remain inside pipe code and Deno
   resolution for now.
3. Add package-level dependency declarations only for Pipedown packages that
   need to be fetched, installed, or versioned by the Pipedown CLI.
4. Do not build a full dependency solver in the first iteration.

**How Pipedown Can Extend Itself Here** The natural extension point is to allow
Pipedown packages to describe Pipedown exports and wrapper packages. That means
Pipedown itself can ship wrapper packages, CLI helper packages, or example
package templates as Pipedown packages. This keeps extension in the same
conceptual format as the core platform.

**Implementation Phases**

1. Phase 1: Manifest schema draft Define `pipedown.json`, package-format
   version, archive layout, and required fields.
2. Phase 2: Archive pack format Decide on tar.gz or zip; specify canonical
   included files and integrity checks.
3. Phase 3: Local inspection flow Add a way to inspect package metadata before
   install.
4. Phase 4: Install-time generation rules Define how and when `.pd` gets
   regenerated from installed packages.
5. Phase 5: Publish-time validation Enforce required metadata, immutable
   versioning, and checksum generation.

**Scope Boundaries** Included:

- Package archive layout
- Manifest fields
- Versioning rules
- Integrity/checksum strategy
- Package-level dependency declarations
- Relationship between source and derived artifacts

Excluded for now:

- Collaboration model
- Registry UX
- Hosted execution API details
- Deep dependency solver design
- Full package signing infrastructure

**Open Design Questions With Recommendations**

1. Single-pipe or multi-pipe package first? Recommendation: start with one
   primary entry and allow named exports, but keep the archive shape compatible
   with multiple pipes later.
2. Should derived exports be publishable inside the package? Recommendation:
   yes, optionally. Do not require them.
3. Should `config.json` remain separate from `pipedown.json`? Recommendation:
   keep `pipedown.json` for package concerns and retain `config.json` or
   embedded config for runtime/build concerns until the split becomes painful.

**Verification**

1. A package can be packed and unpacked without losing canonical markdown.
2. The manifest is sufficient for install, publish, and export discovery.
3. Two identical source packages produce the same integrity metadata.
4. Generated `.pd` output can be rebuilt from the package alone.
5. Another agent can draft the actual manifest schema and CLI pack flow directly
   from this document.
