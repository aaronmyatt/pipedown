/**
 * CLI command: `pd extract <file.md> <step-indices> <new-name>`
 *
 * Extracts selected steps from a pipe into a new sub-pipe markdown file.
 * The parent pipe is modified to replace the extracted steps with a single
 * delegation step that imports and calls the new sub-pipe.
 *
 * Step indices can be specified as:
 * - Single: "2"
 * - Range: "2-5" (inclusive)
 * - Comma-separated: "1,3,5"
 * - Mixed: "0,2-4,6"
 *
 * The new file is created as a sibling of the parent file (same directory).
 *
 * Ref: extractSteps.ts — core extraction logic (parseStepIndices, performExtraction)
 * Ref: pdBuild.ts — rebuild after writing modified files
 *
 * @example Extract steps 2-4 into a new pipe called "validation"
 * ```sh
 * pd extract myPipe.md 2-4 validation
 * ```
 *
 * @example Extract non-contiguous steps
 * ```sh
 * pd extract myPipe.md 1,3,5 data-fetch
 * ```
 *
 * @module
 */

import type { CliInput } from "../pipedown.d.ts";
import { pd, std } from "../deps.ts";
import { PD_DIR } from "./helpers.ts";
import { pdBuild } from "../pdBuild.ts";
import { cliHelpTemplate } from "../stringTemplates.ts";
import { parseStepIndices, performExtraction, toKebabCase } from "../extractSteps.ts";

const helpText = cliHelpTemplate({
  title: "Extract",
  command: "pd extract <file.md> <step-indices> <new-name>",
  sections: [
    "Extract steps from a pipe into a new sub-pipe markdown file.",
    "The parent pipe is updated with a delegation step that imports and runs the new sub-pipe.",
    `Step indices can be:
    - A single index:       pd extract pipe.md 2 validation
    - A range (inclusive):   pd extract pipe.md 2-5 validation
    - Comma-separated:       pd extract pipe.md 1,3,5 data-fetch
    - Mixed:                 pd extract pipe.md 0,2-4,6 preprocessing`,
    `Examples:
    pd extract myPipe.md 2-4 validation       # Extract steps 2-4 into validation.md
    pd extract myPipe.md 1,3,5 data-fetch     # Extract steps 1,3,5 into data-fetch.md
    pd extract myPipe.md 0 setup --dry-run    # Preview without writing files`,
  ],
});

export async function extractCommand(input: CliInput) {
  // ── Help flag check ──
  // Same pattern as inspectCommand, syncCommand etc.
  if (pd.$p.get(input, "/flags/help") || pd.$p.get(input, "/flags/h")) {
    console.log(helpText);
    return input;
  }

  const fileName = input.flags._[1] as string;
  const stepSpec = input.flags._[2] as string;
  const newName = input.flags._[3] as string;

  if (!fileName || !stepSpec || !newName) {
    console.error("Error: missing required arguments");
    console.log(helpText);
    return input;
  }

  try {
    // ── Build first to ensure .pd/ directory is current ──
    // pdBuild compiles all .md files into .pd/<pipeName>/ directories.
    // We need index.json to load the parsed pipe data with step metadata.
    await pdBuild(input);

    // ── Derive the pipe name from the file name ──
    // The .pd/ directory uses a sanitized version of the filename (no extension,
    // no special chars). This matches the logic in pdBuild.ts:parseMdFiles.
    // Ref: pdUtils.ts — sanitizeString strips non-word chars and joins words
    const pipeName = fileName.replace(/\.md$/, "").replace(/[\W_]+/g, " ").trim().replace(/\s+/g, "");
    const indexJsonPath = std.join(PD_DIR, pipeName, "index.json");

    // ── Load the full Pipe object from index.json ──
    // index.json contains the complete Pipe data including steps, config,
    // rawSource, sourceMap, and mdPath. The rawSource is the original markdown
    // which allows lossless reconstruction.
    const pipeData = JSON.parse(await Deno.readTextFile(indexJsonPath));
    const steps = pipeData.steps || [];

    if (steps.length === 0) {
      console.error("Error: pipe has no steps to extract");
      return input;
    }

    // ── Parse step indices ──
    // parseStepIndices validates the spec and returns sorted, unique indices.
    const stepIndices = parseStepIndices(stepSpec, steps.length - 1);
    console.log(
      std.colors.brightCyan(
        "Extracting step(s) " + stepIndices.join(", ") + " from " + fileName + " → " + toKebabCase(newName) + ".md",
      ),
    );

    // ── Determine output paths ──
    // The new pipe file is created as a sibling of the parent .md file
    // (same directory). This ensures the relative import path in the
    // delegation step resolves correctly after build.
    const parentMdPath = pipeData.mdPath;
    if (!parentMdPath) {
      console.error("Error: pipe has no mdPath — cannot determine source file location");
      return input;
    }

    const parentDir = std.dirname(parentMdPath);
    const newFileName = toKebabCase(newName) + ".md";
    const newFilePath = std.join(parentDir, newFileName);

    // ── Check for file collision ──
    // Refuse to overwrite an existing file to prevent accidental data loss.
    try {
      await Deno.stat(newFilePath);
      // If stat succeeds, the file already exists
      console.error(
        "Error: file already exists: " + newFilePath + "\nChoose a different name or remove the existing file first.",
      );
      return input;
    } catch (e) {
      if (!(e instanceof Deno.errors.NotFound)) {
        throw e; // Re-throw unexpected errors (permission issues etc.)
      }
      // NotFound is expected — the file doesn't exist yet, proceed.
    }

    // ── Perform the extraction ──
    const { newPipeMarkdown, modifiedParentMarkdown } = performExtraction(
      pipeData,
      stepIndices,
      newName,
    );

    // ── Dry-run mode: preview without writing ──
    if (input.flags["dry-run"]) {
      console.log(std.colors.brightYellow("\n── New pipe: " + newFileName + " ──"));
      console.log(newPipeMarkdown);
      console.log(std.colors.brightYellow("\n── Modified parent: " + fileName + " ──"));
      console.log(modifiedParentMarkdown);
      return input;
    }

    // ── Write both files ──
    await Deno.writeTextFile(newFilePath, newPipeMarkdown);
    console.log(std.colors.brightGreen("Created " + newFilePath));

    await Deno.writeTextFile(parentMdPath, modifiedParentMarkdown);
    console.log(std.colors.brightGreen("Updated " + parentMdPath));

    // ── Rebuild to compile the new pipe and update the parent's .pd/ ──
    await pdBuild(input);
    console.log(std.colors.brightGreen("Build complete."));
  } catch (e) {
    console.error("Error: " + (e as Error).message);
    input.errors = input.errors || [];
    input.errors.push(e as Error);
  }

  return input;
}
