## Plan: Markdown Round-Trip Invariant

Preserve markdown as canonical source across local development, packaging,
installation, publication, export generation, and future hosted workflows. The
round-trip invariant should be treated as a platform-level rule, not an
implementation detail.

**Why This Matters** Pipedown’s identity depends on executable markdown
remaining first-class. If the system gradually shifts toward generated JSON or
generated TypeScript as the real source of truth, collaboration, package
inspection, authoring, and trust all degrade. The package and hosted roadmap
must therefore protect round-trip behavior deliberately.

**Current Codebase Anchors**

- `/Users/aaronmyatt/pipes/core/pipedown/pipeToMarkdown.ts` Current ability to
  reconstruct markdown from pipe metadata.
- `/Users/aaronmyatt/pipes/core/pipedown/pdCli/syncCommand.ts` Current workflow
  that syncs generated pipe JSON back to markdown.
- `/Users/aaronmyatt/pipes/core/pipedown/pdBuild.ts` Current writing of
  `index.md`, `index.json`, and `index.ts` into `.pd`.
- `/Users/aaronmyatt/pipes/core/pipedown/mdToPipe.ts` Current extraction of
  descriptions, heading levels, schema blocks, directives, and step metadata
  needed for reconstruction.
- `/Users/aaronmyatt/pipes/core/pipedown/pipedown.d.ts` Current types carrying
  reconstruction-relevant metadata.

**Invariant Statement**

1. Canonical source remains markdown.
2. Generated JSON and generated TypeScript are derivative artifacts.
3. Package archives must preserve canonical markdown.
4. Publication and installation must not silently discard markdown semantics.
5. Any hosted or remote editing model must either edit markdown directly or
   preserve a lossless mapping back to it.

**What Round-Trip Means Here**

1. A markdown source can be parsed into structured pipe metadata.
2. That metadata can be transformed back into markdown without losing
   user-authored meaning.
3. Derived artifacts do not become the only editable representation.
4. If generated artifacts are changed, there must be an intentional path back to
   markdown or those changes must be treated as ephemeral.

**Implications For Packaging**

1. Packages must contain markdown source.
2. Package manifests should point to markdown entries.
3. Derived artifacts can be included optionally, but not as the only
   representation.
4. Integrity should primarily be measured over markdown source plus manifest.

**Implications For Exports**

1. Export wrappers should remain derivative views over the same canonical pipe.
2. Export generation must not introduce wrapper-specific source-of-truth drift.
3. Installed packages should still be inspectable and reconstructible at the
   markdown level.

**Implications For Future Hosted Workflows**

1. Registry pages should show canonical markdown.
2. Hosted execution should be tied to package versions grounded in markdown
   source.
3. Any future editor should preserve markdown structure, descriptions, headings,
   schemas, and directives losslessly.

**How Pipedown Can Extend Itself Here** If Pipedown packages extend Pipedown,
they should still do so in markdown-canonical form. That means wrappers,
examples, helper workflows, and even internal tooling packages can continue to
participate in the same literate, inspectable format instead of becoming opaque
implementation-only assets.

**Implementation Phases**

1. Phase 1: Explicit invariant Write down the rule in planning and future docs.
2. Phase 2: Packaging alignment Ensure package format and manifests reinforce
   markdown as canonical source.
3. Phase 3: Lifecycle alignment Ensure install, publish, inspect, and export
   flows preserve access to markdown.
4. Phase 4: Drift detection Add ways to detect or warn about divergence between
   source markdown and derived metadata where appropriate.
5. Phase 5: Hosted/editor alignment Carry the invariant into future registry and
   hosted workflows.

**Recommended Early Behaviors**

1. `pd pack` should always include canonical markdown.
2. `pd info` should show entry markdown files.
3. `pd publish` should validate markdown presence and integrity.
4. Any future package reconstruction or sync flow should explicitly reference
   markdown provenance.

**Scope Boundaries** Included:

- Canonical-source rule
- Round-trip implications for packages, exports, and hosted workflow
- Relationship between markdown and generated artifacts

Excluded for now:

- Full collaborative editing design
- Rich merge semantics
- Hosted editor UX specifics

**Open Design Questions With Recommendations**

1. Is perfect formatting preservation required? Recommendation: preserve
   semantic meaning first and formatting fidelity where feasible, but keep
   improving toward lossless round-trip.
2. Should generated artifacts ever be hand-edited? Recommendation: only with an
   intentional sync workflow, and preferably as an advanced workflow rather than
   the normal path.
3. Should registry publication accept packages without markdown? Recommendation:
   no.

**Verification**

1. Another agent can derive package and lifecycle guardrails from this document.
2. The package plan remains faithful to Pipedown’s literate-programming
   identity.
3. Future hosted work does not quietly move the source of truth away from
   markdown.
