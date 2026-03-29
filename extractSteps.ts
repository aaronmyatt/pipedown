/**
 * Core logic for extracting steps from a parent pipe into a new sub-pipe.
 *
 * This module provides pure functions that both the CLI (`pd extract`) and the
 * dashboard API (`POST /api/extract`) consume. The extraction process:
 *
 * 1. Parses a flexible step-index specification (single, range, or CSV).
 * 2. Builds a new Pipe object from the selected steps.
 * 3. Constructs a replacement delegation step for the parent pipe.
 * 4. Produces markdown for both the new pipe and the modified parent.
 *
 * Ref: pipeToMarkdown.ts — used for both new-pipe generation (lossy path)
 *      and parent reconstruction (lossless path when rawSource available).
 * Ref: pipedown.d.ts — Pipe, Step, StepConfig type definitions.
 *
 * @module
 */

import type { Pipe, Step, StepConfig } from "./pipedown.d.ts";
import { pipeToMarkdown } from "./pipeToMarkdown.ts";
import { sanitizeString } from "./pdUtils.ts";

// ── Naming Helpers ──────────────────────────────────────────────────────────

/**
 * Convert a human-readable name to kebab-case for file paths.
 *
 * Examples: "My Module" → "my-module", "fetchData" → "fetch-data"
 *
 * @param s - The input string
 * @returns A lowercase, hyphen-separated string safe for file names
 */
export function toKebabCase(s: string): string {
  return s
    // Insert hyphens before uppercase letters that follow lowercase letters
    // (camelCase → camel-Case)
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    // Replace any non-alphanumeric characters with hyphens
    .replace(/[\W_]+/g, "-")
    .toLowerCase()
    // Trim leading/trailing hyphens
    .replace(/^-+|-+$/g, "");
}

/**
 * Convert a human-readable name to camelCase for JS identifiers.
 *
 * Uses the existing sanitizeString (strips special chars, joins words) then
 * lowercases the first character.
 * Ref: pdUtils.ts — sanitizeString removes non-word chars and joins words
 *
 * Examples: "My Module" → "myModule", "fetch-data" → "fetchData"
 *
 * @param s - The input string
 * @returns A camelCase string safe for JavaScript variable names
 */
export function toCamelCase(s: string): string {
  // sanitizeString produces PascalCase: "My Module" → "MyModule"
  const pascal = sanitizeString(s);
  if (pascal.length === 0) return pascal;
  // Lowercase the first character to get camelCase
  return pascal[0].toLowerCase() + pascal.slice(1);
}

// ── Step Index Parsing ──────────────────────────────────────────────────────

/**
 * Parse a flexible step-index specification into a sorted, deduplicated array.
 *
 * Supported formats:
 * - Single index: "2"
 * - Range: "2-5" (inclusive both ends)
 * - Comma-separated: "1,3,5"
 * - Mixed: "0,2-4,6"
 *
 * @param spec     - The index specification string
 * @param maxIndex - The highest valid step index (steps.length - 1)
 * @returns Sorted array of unique step indices
 * @throws {Error} If spec is empty, contains invalid numbers, or indices are out of bounds
 */
export function parseStepIndices(spec: string, maxIndex: number): number[] {
  if (!spec || spec.trim().length === 0) {
    throw new Error("Step index specification cannot be empty");
  }

  const indices = new Set<number>();

  // Split on commas first, then handle ranges within each segment
  const segments = spec.split(",").map((s) => s.trim());

  for (const segment of segments) {
    if (segment.includes("-")) {
      // Range: "2-5" → [2, 3, 4, 5]
      const parts = segment.split("-").map((p) => p.trim());
      if (parts.length !== 2) {
        throw new Error('Invalid range: "' + segment + '". Expected format: "start-end"');
      }

      const start = parseInt(parts[0], 10);
      const end = parseInt(parts[1], 10);

      if (isNaN(start) || isNaN(end)) {
        throw new Error('Invalid range: "' + segment + '". Both start and end must be integers');
      }
      if (start > end) {
        throw new Error('Invalid range: "' + segment + '". Start (' + start + ") must be <= end (" + end + ")");
      }

      for (let i = start; i <= end; i++) {
        indices.add(i);
      }
    } else {
      // Single index: "2"
      const idx = parseInt(segment, 10);
      if (isNaN(idx)) {
        throw new Error('Invalid step index: "' + segment + '". Must be an integer');
      }
      indices.add(idx);
    }
  }

  // Validate all indices are within bounds
  for (const idx of indices) {
    if (idx < 0 || idx > maxIndex) {
      throw new Error(
        "Step index " + idx + " is out of range. Valid range: 0-" + maxIndex,
      );
    }
  }

  // Return sorted for predictable ordering
  return [...indices].sort((a, b) => a - b);
}

// ── Pipe Construction ───────────────────────────────────────────────────────

/**
 * Build a new Pipe object from the selected steps of a parent pipe.
 *
 * The returned Pipe has no `rawSource` — this forces pipeToMarkdown() to use
 * the lossy `reconstructFromFields` path, which generates clean markdown from
 * the structured step data rather than trying to splice into original source.
 *
 * Step objects are deep-cloned and stripped of source-mapping artifacts that
 * are only meaningful in the context of the parent pipe (sourceMap, range,
 * original* diff-tracking fields).
 *
 * @param parentPipe  - The full parent Pipe object (parsed from .md with rawSource)
 * @param stepIndices - Sorted array of step indices to extract
 * @param newName     - Human-readable name for the new pipe (becomes H1 heading)
 * @returns A new Pipe object ready to be serialized with pipeToMarkdown()
 */
export function buildExtractedPipe(
  parentPipe: Pipe,
  stepIndices: number[],
  newName: string,
): Pipe {
  const cleanName = sanitizeString(newName);

  // Deep-clone selected steps and strip parent-specific metadata.
  // structuredClone is a standard API (available in Deno and modern browsers)
  // that creates a deep copy without shared references.
  // Ref: https://developer.mozilla.org/en-US/docs/Web/API/structuredClone
  const extractedSteps: Step[] = stepIndices.map((idx) => {
    const step = structuredClone(parentPipe.steps[idx]);

    // Remove source-mapping fields — they reference line numbers in the
    // parent's markdown source which are meaningless in the new file.
    delete step.sourceMap;
    delete step.originalCode;
    delete step.originalName;
    delete step.originalDescription;
    // range is the token index pair from the parent's parsed token array
    step.range = [];

    return step;
  });

  return {
    name: newName,
    cleanName,
    steps: extractedSteps,
    // mdPath and dir will be set by the caller when writing the file
    mdPath: "",
    dir: "",
    absoluteDir: "",
    fileName: toKebabCase(newName),
    pipeDescription: "Extracted from " + parentPipe.name + ".",
    // No rawSource → pipeToMarkdown uses the lossy reconstructFromFields path
    // which generates clean, predictable markdown from the step data.
  };
}

// ── Replacement Step ────────────────────────────────────────────────────────

/**
 * Find the first conditional check directive among the extracted steps.
 *
 * Scans through each step's config looking for check/if, and, or directives
 * in that priority order. Returns the first JSON pointer path found, or null.
 *
 * This is used to gate the delegation call in the parent pipe so the extracted
 * sub-pipeline only runs when the original condition would have been met.
 *
 * @param steps - The steps being extracted
 * @returns The first check pointer path found, or null if none exist
 */
function findFirstCheck(steps: Step[]): string | null {
  for (const step of steps) {
    if (!step.config) continue;

    // Priority: checks (includes check:/if:/when:), then and, then or
    if (step.config.checks && step.config.checks.length > 0) {
      return step.config.checks[0];
    }
    if (step.config.and && step.config.and.length > 0) {
      return step.config.and[0];
    }
    if (step.config.or && step.config.or.length > 0) {
      return step.config.or[0];
    }
  }
  return null;
}

/**
 * Construct the replacement step that delegates to the extracted sub-pipe.
 *
 * The generated step contains an import statement in its code block. During
 * build, pipeToScript.ts detects imports and hoists them to the top of the
 * generated TypeScript file.
 * Ref: pipeToScript.ts line 5 — detectImports regex hoists import statements
 *
 * For the safety gate, we use the first conditional directive found among the
 * extracted steps. If no conditionals exist, a simple "- check: /camelName"
 * flag is added so the developer can gate the call via an input flag.
 *
 * @param newName        - Human-readable name for the extracted module
 * @param extractedSteps - The steps being extracted (for check directive scanning)
 * @returns A Step object to insert into the parent pipe's steps array
 */
export function buildReplacementStep(
  newName: string,
  extractedSteps: Step[],
): Step {
  const camelName = toCamelCase(newName);
  const kebabName = toKebabCase(newName);

  // The import path targets the built .pd/<cleanName>/index.ts file.
  // pipeToScript.ts will hoist this import to the top of the parent's
  // generated TypeScript, making the pipe variable available at runtime.
  const importLine = "import { pipe as " + camelName + "Pipe } from \"./" + kebabName + "/index.ts\";";
  const processLine = "input." + camelName + " = await " + camelName + "Pipe.process(input);";
  const code = importLine + "\n" + processLine;

  // Determine the safety gate: reuse the first check from extracted steps,
  // or create a simple flag-based check using the module name.
  const existingCheck = findFirstCheck(extractedSteps);
  const checkPath = existingCheck || ("/" + camelName);

  const config: StepConfig = {
    checks: [checkPath],
  };

  return {
    name: newName,
    funcName: sanitizeString(newName),
    code,
    range: [],
    inList: true, // Must be true for DSL directives (- check:) to render
    config,
    description: "Run the extracted " + newName + " sub-pipeline.",
    headingLevel: 2,
    language: "ts",
  };
}

// ── Orchestrator ────────────────────────────────────────────────────────────

/**
 * Perform the full extraction: build a new sub-pipe and modify the parent.
 *
 * This is the main entry point consumed by both the CLI and API. It:
 * 1. Validates inputs
 * 2. Builds the new pipe from selected steps
 * 3. Constructs the replacement delegation step
 * 4. Modifies the parent pipe's steps array (remove extracted, insert replacement)
 * 5. Serializes both to markdown
 *
 * The parent pipe modification uses a clone-and-rebuild strategy:
 * - When rawSource is available, we clear it to force the lossy path for the
 *   modified parent. This avoids complex line-splicing for non-contiguous
 *   step removal. The lossy path faithfully reconstructs from structured data.
 * - DSL directives, descriptions, and code are all preserved in the Step objects.
 *
 * @param parentPipe  - The full parent Pipe object (with rawSource from mdToPipe)
 * @param stepIndices - Sorted array of step indices to extract
 * @param newName     - Human-readable name for the new sub-pipe
 * @returns Object with markdown strings for both the new pipe and modified parent
 * @throws {Error} If stepIndices is empty or contains invalid indices
 */
export function performExtraction(
  parentPipe: Pipe,
  stepIndices: number[],
  newName: string,
): { newPipeMarkdown: string; modifiedParentMarkdown: string } {
  if (stepIndices.length === 0) {
    throw new Error("At least one step index must be provided for extraction");
  }

  const maxIndex = parentPipe.steps.length - 1;
  for (const idx of stepIndices) {
    if (idx < 0 || idx > maxIndex) {
      throw new Error(
        "Step index " + idx + " is out of range. Valid range: 0-" + maxIndex,
      );
    }
  }

  // ── Build the new extracted pipe ──
  const newPipe = buildExtractedPipe(parentPipe, stepIndices, newName);
  const newPipeMarkdown = pipeToMarkdown(newPipe);

  // ── Modify the parent pipe ──
  // Deep-clone the parent so we don't mutate the original object.
  const modifiedParent = structuredClone(parentPipe);

  // Build the replacement step from the steps being extracted
  const extractedSteps = stepIndices.map((idx) => parentPipe.steps[idx]);
  const replacementStep = buildReplacementStep(newName, extractedSteps);

  // Remove extracted steps from the parent and insert the replacement.
  // We process indices in reverse order so that removing earlier indices
  // doesn't shift later ones. The replacement goes at the position of
  // the first extracted step.
  const insertionIndex = stepIndices[0];

  // Create a new steps array: keep non-extracted steps, insert replacement
  // at the position of the first extracted step.
  const indicesSet = new Set(stepIndices);
  const newSteps: Step[] = [];
  let replacementInserted = false;

  for (let i = 0; i < modifiedParent.steps.length; i++) {
    if (indicesSet.has(i)) {
      // This step is being extracted — skip it, but insert the replacement
      // at the position of the first extracted step.
      if (!replacementInserted && i === insertionIndex) {
        newSteps.push(replacementStep);
        replacementInserted = true;
      }
    } else {
      newSteps.push(modifiedParent.steps[i]);
    }
  }

  modifiedParent.steps = newSteps;

  // Clear rawSource to force the lossy reconstruction path. This is simpler
  // and more reliable than trying to splice line ranges, especially for
  // non-contiguous step extraction. The lossy path faithfully reconstructs
  // all structural content (headings, descriptions, DSL directives, code).
  delete modifiedParent.rawSource;

  // Also strip sourceMap from remaining steps — they reference line numbers
  // in the original source which are now invalid after step removal.
  for (const step of modifiedParent.steps) {
    delete step.sourceMap;
    delete step.originalCode;
    delete step.originalName;
    delete step.originalDescription;
  }

  const modifiedParentMarkdown = pipeToMarkdown(modifiedParent);

  return { newPipeMarkdown, modifiedParentMarkdown };
}
