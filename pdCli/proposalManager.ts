/**
 * proposalManager.ts — Pi patch proposal generation, persistence, and application.
 *
 * This module implements the proposal system described in WEB_FIRST_WORKFLOW_PLAN.md
 * §6 and §4.1-G. Pi generates focused, reviewable patch proposals that mutate
 * `index.json` only (never markdown directly). The user explicitly applies or
 * discards them via the web UI.
 *
 * Key responsibilities:
 *   1. Create PatchProposal objects from Pi-generated operations
 *   2. Persist / read / list proposals under `.pd/<pipe>/proposals/`
 *   3. Apply proposals by calling structuredEdit functions
 *   4. Discard / supersede proposals (lifecycle transitions)
 *   5. Build LLM prompts for step-scoped and pipe-scoped proposals
 *
 * Ref: WEB_FIRST_WORKFLOW_PLAN.md §4.1-G (PatchProposal type)
 * Ref: WEB_FIRST_WORKFLOW_PLAN.md §6 (Pi / LLM Integration Plan)
 * Ref: pipedown.d.ts — PatchProposal, PatchOperation, ProposalStatus
 *
 * Run tests with:
 *   ~/.deno/bin/deno test --no-check -A proposal_test.ts
 */

import { std } from "../deps.ts";
import type {
  PatchProposal,
  PatchOperation,
  ProposalStatus,
  Pipe,
  Step,
} from "../pipedown.d.ts";
import {
  editPipeFields,
  editStepFields,
  insertStep,
  deleteStep,
  readPipeData,
  writePipeData,
} from "./structuredEdit.ts";
import { getPipedownSystemPrompt } from "./llmCommand.ts";

// ═══════════════════════════════════════════════════════════════════════
// ── Proposal CRUD ──
// Functions for creating, persisting, reading, listing, and managing
// the lifecycle of PatchProposal objects. Proposals are stored as
// individual JSON files under `.pd/<pipe>/proposals/<proposalId>.json`
// so they survive server restarts and can be inspected by the user.
//
// Ref: WEB_FIRST_WORKFLOW_PLAN.md §4.5 — storage approach
// ═══════════════════════════════════════════════════════════════════════

// ── Proposal directory helper ──

/**
 * Returns the absolute path to the proposals directory for a pipe.
 * Creates the directory if it doesn't exist.
 *
 * @param projectPath - Absolute path to the project root
 * @param pipeName    - Name of the pipe (matches .pd/<pipeName>/)
 * @returns Absolute path to `.pd/<pipeName>/proposals/`
 *
 * Ref: https://docs.deno.com/api/deno/~/Deno.mkdir
 */
async function ensureProposalDir(
  projectPath: string,
  pipeName: string,
): Promise<string> {
  const dir = std.join(projectPath, ".pd", pipeName, "proposals");
  await Deno.mkdir(dir, { recursive: true });
  return dir;
}

// ── createProposal ──

/**
 * Creates a PatchProposal object with all required fields populated.
 *
 * This is a pure function that builds the proposal in memory — it does NOT
 * persist to disk. Call `persistProposal()` afterward if you want to save it.
 *
 * @param params - Proposal parameters:
 *   - scopeType: "pipe" or "step"
 *   - scopeRef: { pipeName, stepId?, stepIndex? }
 *   - prompt: the user's instruction that triggered this proposal
 *   - operations: array of PatchOperation objects from the LLM
 *   - summary: short description of what this proposal changes
 *   - rationale: (optional) Pi's explanation of why these changes were suggested
 * @returns A fully populated PatchProposal with status "ready"
 *
 * Ref: pipedown.d.ts — PatchProposal type definition
 * Ref: https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID
 */
export function createProposal(params: {
  scopeType: "pipe" | "step";
  scopeRef: { pipeName: string; stepId?: string; stepIndex?: number };
  prompt: string;
  operations: PatchOperation[];
  summary: string;
  rationale?: string;
}): PatchProposal {
  const id = crypto.randomUUID();
  console.log(`[pd:proposal] createProposal: id=${id.substring(0, 8)}… scope=${params.scopeType} ops=${params.operations.length} summary="${params.summary}"`);
  return {
    proposalId: id,
    scopeType: params.scopeType,
    scopeRef: params.scopeRef,
    origin: "pi",
    prompt: params.prompt,
    operations: params.operations,
    summary: params.summary,
    rationale: params.rationale,
    status: "ready" as ProposalStatus,
    createdAt: new Date().toISOString(),
  };
}

// ── persistProposal ──

/**
 * Writes a PatchProposal to disk as a JSON file.
 *
 * The proposal is stored at `.pd/<pipe>/proposals/<proposalId>.json`.
 * The proposals directory is created if it doesn't exist yet.
 *
 * @param projectPath - Absolute path to the project root
 * @param pipeName    - Name of the pipe
 * @param proposal    - The PatchProposal to persist
 *
 * Ref: https://docs.deno.com/api/deno/~/Deno.writeTextFile
 */
export async function persistProposal(
  projectPath: string,
  pipeName: string,
  proposal: PatchProposal,
): Promise<void> {
  const dir = await ensureProposalDir(projectPath, pipeName);
  const filePath = std.join(dir, `${proposal.proposalId}.json`);
  await Deno.writeTextFile(filePath, JSON.stringify(proposal, null, 2));
  console.log(`[pd:proposal] persistProposal: ${proposal.proposalId.substring(0, 8)}… status=${proposal.status}`);
}

// ── readProposal ──

/**
 * Reads a single PatchProposal from disk by its ID.
 *
 * @param projectPath - Absolute path to the project root
 * @param pipeName    - Name of the pipe
 * @param proposalId  - UUID of the proposal to read
 * @returns The parsed PatchProposal, or null if not found
 *
 * Ref: https://docs.deno.com/api/deno/~/Deno.readTextFile
 */
export async function readProposal(
  projectPath: string,
  pipeName: string,
  proposalId: string,
): Promise<PatchProposal | null> {
  const dir = std.join(projectPath, ".pd", pipeName, "proposals");
  const filePath = std.join(dir, `${proposalId}.json`);
  try {
    const raw = await Deno.readTextFile(filePath);
    return JSON.parse(raw) as PatchProposal;
  } catch {
    // File doesn't exist or isn't parseable — treat as "not found".
    return null;
  }
}

// ── listProposals ──

/**
 * Lists recent proposals for a pipe, sorted by createdAt descending.
 *
 * Reads all `.json` files from the proposals directory, parses each one,
 * and returns them sorted newest-first. An optional `limit` caps the
 * result count (defaults to 20).
 *
 * @param projectPath - Absolute path to the project root
 * @param pipeName    - Name of the pipe
 * @param limit       - Maximum number of proposals to return (default 20)
 * @returns Array of PatchProposal objects, newest first
 *
 * Ref: https://docs.deno.com/api/deno/~/Deno.readDir
 */
export async function listProposals(
  projectPath: string,
  pipeName: string,
  limit = 20,
): Promise<PatchProposal[]> {
  const dir = std.join(projectPath, ".pd", pipeName, "proposals");
  const proposals: PatchProposal[] = [];

  try {
    for await (const entry of Deno.readDir(dir)) {
      // Only process .json files — ignore any other artifacts.
      if (!entry.isFile || !entry.name.endsWith(".json")) continue;
      try {
        const raw = await Deno.readTextFile(std.join(dir, entry.name));
        proposals.push(JSON.parse(raw) as PatchProposal);
      } catch {
        // Skip unparseable files — they may be corrupted or hand-edited.
        continue;
      }
    }
  } catch {
    // Directory doesn't exist yet — no proposals. Return empty array.
    return [];
  }

  // Sort by createdAt descending (newest first).
  // ISO-8601 timestamps sort correctly with string comparison.
  // Ref: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/localeCompare
  proposals.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return proposals.slice(0, limit);
}

// ═══════════════════════════════════════════════════════════════════════
// ── Proposal Application ──
// Applies a proposal's operations to the pipe's index.json by delegating
// to the appropriate structuredEdit functions. Each operation type maps
// to a specific edit primitive.
//
// After all operations are applied, the proposal status is updated to
// "applied" and re-persisted. The workspace is automatically marked as
// "json_dirty" by the underlying edit functions.
//
// Ref: WEB_FIRST_WORKFLOW_PLAN.md §4.2 — patch format
// Ref: structuredEdit.ts — editPipeFields, editStepFields, insertStep, deleteStep
// ═══════════════════════════════════════════════════════════════════════

/**
 * Applies a proposal's operations to the pipe's index.json.
 *
 * Iterates through each operation in the proposal and dispatches to the
 * corresponding structuredEdit function. Operations are applied in order,
 * which matters for structural changes (insert/delete shift indices).
 *
 * **Operation type mapping:**
 * - `replace_pipe_description` → `editPipeFields(pipe, { pipeDescription: op.newValue })`
 * - `replace_schema`          → `editPipeFields(pipe, { schema: op.newValue })`
 * - `replace_step_title`      → `editStepFields(pipe, stepIndex, { name: op.newValue })`
 * - `replace_step_description`→ `editStepFields(pipe, stepIndex, { description: op.newValue })`
 * - `replace_step_code`       → `editStepFields(pipe, stepIndex, { code: op.newValue })`
 * - `replace_step_config`     → `editStepFields(pipe, stepIndex, { config: op.newValue })`
 * - `insert_step_after`       → `insertStep(pipe, afterIndex, newStep)`
 * - `delete_step`             → `deleteStep(pipe, stepIndex)`
 *
 * @param projectPath - Absolute path to the project root
 * @param pipeName    - Name of the pipe
 * @param proposal    - The PatchProposal to apply
 * @returns The updated Pipe object after all operations are applied
 * @throws If the pipe can't be read or an operation fails critically
 *
 * Ref: WEB_FIRST_WORKFLOW_PLAN.md §6.5 — apply flow
 */
export async function applyProposal(
  projectPath: string,
  pipeName: string,
  proposal: PatchProposal,
): Promise<Pipe> {
  // Read the current pipe data from disk.
  const pipeData = await readPipeData(projectPath, pipeName);

  // Apply each operation in sequence.
  // Structural operations (insert/delete) shift indices, so order matters.
  for (const op of proposal.operations) {
    // Extract the step index from the operation's path field.
    // Path format examples: "steps[2].code", "steps[0].description", "pipe.pipeDescription"
    // For step-scoped operations, we parse the index from "steps[N]".
    const stepIndex = extractStepIndex(op);

    switch (op.type) {
      // ── Pipe-level operations ──

      case "replace_pipe_description":
        editPipeFields(pipeData, {
          pipeDescription: op.newValue as string,
        });
        break;

      case "replace_schema":
        editPipeFields(pipeData, {
          schema: op.newValue as string,
        });
        break;

      // ── Step-level field replacements ──

      case "replace_step_title":
        if (stepIndex !== null) {
          await editStepFields(pipeData, stepIndex, {
            name: op.newValue as string,
          });
        }
        break;

      case "replace_step_description":
        if (stepIndex !== null) {
          await editStepFields(pipeData, stepIndex, {
            description: op.newValue as string,
          });
        }
        break;

      case "replace_step_code":
        if (stepIndex !== null) {
          await editStepFields(pipeData, stepIndex, {
            code: op.newValue as string,
          });
        }
        break;

      case "replace_step_config":
        // Config is a structured object (StepConfig), not a simple string.
        // editStepFields doesn't currently handle config, so we apply it
        // directly and recompute the fingerprint.
        if (stepIndex !== null && stepIndex < pipeData.steps.length) {
          pipeData.steps[stepIndex].config = op.newValue as Step["config"];
          // Recompute fingerprint since config is part of it
          const { computeStepFingerprint } = await import("../pdBuild.ts");
          pipeData.steps[stepIndex].fingerprint = await computeStepFingerprint(
            pipeData.steps[stepIndex],
          );
          // Mark workspace dirty (editStepFields would normally do this)
          pipeData.workspace = {
            ...(pipeData.workspace || { syncState: "clean" }),
            syncState: "json_dirty",
            lastModifiedBy: "pi_patch",
          };
        }
        break;

      // ── Structural operations ──

      case "insert_step_after": {
        // The `meta` field or the path indicates where to insert.
        // newValue should contain the step data: { name, code, description? }
        const afterIndex = op.meta?.afterIndex as number ??
          (stepIndex !== null ? stepIndex : pipeData.steps.length - 1);
        const stepData = op.newValue as {
          name: string;
          code: string;
          description?: string;
        };
        await insertStep(pipeData, afterIndex, stepData);
        break;
      }

      case "delete_step":
        if (stepIndex !== null) {
          deleteStep(pipeData, stepIndex);
        }
        break;

      default:
        // Unknown operation type — skip but log for debugging.
        console.warn(
          `[proposalManager] Unknown operation type: "${op.type}" — skipping`,
        );
        break;
    }
  }

  // Stamp workspace metadata as modified by Pi patch.
  // The individual edit functions already set "json_dirty", but we override
  // lastModifiedBy to "pi_patch" for provenance tracking.
  pipeData.workspace = {
    ...(pipeData.workspace || { syncState: "clean" }),
    syncState: "json_dirty",
    lastModifiedBy: "pi_patch",
  };

  // Write the updated pipe back to disk.
  await writePipeData(projectPath, pipeName, pipeData);

  // Update the proposal status to "applied" and re-persist.
  proposal.status = "applied";
  await persistProposal(projectPath, pipeName, proposal);

  console.log(`[pd:proposal] applyProposal: ${proposal.proposalId.substring(0, 8)}… applied ${proposal.operations.length} ops to pipe "${pipeName}"`);
  return pipeData;
}

// ── discardProposal ──

/**
 * Marks a proposal as "discarded" and re-persists it.
 *
 * Discarded proposals remain on disk (for audit trail) but won't be
 * suggested for application again.
 *
 * @param projectPath - Absolute path to the project root
 * @param pipeName    - Name of the pipe
 * @param proposalId  - UUID of the proposal to discard
 * @returns The updated proposal, or null if not found
 */
export async function discardProposal(
  projectPath: string,
  pipeName: string,
  proposalId: string,
): Promise<PatchProposal | null> {
  const proposal = await readProposal(projectPath, pipeName, proposalId);
  if (!proposal) return null;

  proposal.status = "discarded";
  await persistProposal(projectPath, pipeName, proposal);
  console.log(`[pd:proposal] discardProposal: ${proposalId.substring(0, 8)}… discarded`);
  return proposal;
}

// ═══════════════════════════════════════════════════════════════════════
// ── LLM Prompt Assembly ──
// Builds structured prompts that instruct the LLM to return a JSON
// proposal rather than raw text. The prompts include:
//   1. The Pipedown system prompt (from LLM.md)
//   2. Pipeline context (name, description, schema, steps)
//   3. Step-specific context for step-scoped proposals
//   4. Explicit JSON output format instructions
//
// Ref: WEB_FIRST_WORKFLOW_PLAN.md §6.3 — context model for Pi prompts
// Ref: WEB_FIRST_WORKFLOW_PLAN.md §6.4 — expected Pi output shape
// ═══════════════════════════════════════════════════════════════════════

/**
 * Builds the LLM prompt for generating a step-scoped or pipe-scoped proposal.
 *
 * The prompt is structured to elicit a JSON response matching the
 * PatchProposal operations format. It includes:
 * - Framework context (Pipedown system prompt)
 * - Pipeline context (name, description, schema, config)
 * - Target step context (for step-scoped proposals)
 * - Preceding steps summary (for step-scoped proposals)
 * - Explicit output format instructions with valid operation types
 *
 * @param pipeData    - The full Pipe object from index.json
 * @param scope       - { type: "pipe" | "step", stepIndex?: number }
 * @param userPrompt  - The user's instruction for Pi
 * @returns The assembled prompt string ready for callLLM()
 *
 * Ref: WEB_FIRST_WORKFLOW_PLAN.md §6.2 — Pi interaction types
 */
export async function buildProposalPrompt(
  pipeData: Pipe,
  scope: { type: "pipe" | "step"; stepIndex?: number },
  userPrompt: string,
): Promise<string> {
  // Load the Pipedown system prompt from LLM.md so the LLM understands
  // the framework's conventions before seeing the specific pipeline.
  const systemPrompt = await getPipedownSystemPrompt();

  const parts: string[] = [];

  // ── Framework context ──
  parts.push(systemPrompt);

  // ── Pipeline-level context ──
  // Always included regardless of scope — the LLM needs the big picture.
  parts.push("\n## Pipeline Context\n");
  parts.push(`Pipeline name: ${pipeData.name || "unnamed"}`);
  if (pipeData.pipeDescription) {
    parts.push(`Pipeline description: ${pipeData.pipeDescription}`);
  }
  if (pipeData.schema) {
    parts.push(`Pipeline schema:\n\`\`\`zod\n${pipeData.schema}\n\`\`\``);
  }

  if (scope.type === "step" && scope.stepIndex !== undefined) {
    // ── Step-scoped proposal ──
    return buildStepScopedPrompt(
      parts,
      pipeData,
      scope.stepIndex,
      userPrompt,
    );
  } else {
    // ── Pipe-scoped proposal ──
    return buildPipeScopedPrompt(parts, pipeData, userPrompt);
  }
}

/**
 * Builds the prompt for step-scoped proposals.
 *
 * Includes the target step's full context (name, description, code, config)
 * plus a summary of preceding steps so the LLM understands the data flow.
 *
 * @param parts      - Accumulated prompt parts (mutated in place)
 * @param pipeData   - Full Pipe object
 * @param stepIndex  - Zero-based index of the target step
 * @param userPrompt - User's instruction
 * @returns Complete prompt string
 */
function buildStepScopedPrompt(
  parts: string[],
  pipeData: Pipe,
  stepIndex: number,
  userPrompt: string,
): string {
  const step = pipeData.steps[stepIndex];
  if (!step) {
    throw new Error(`Step index ${stepIndex} out of bounds (pipe has ${pipeData.steps.length} steps)`);
  }

  // ── Preceding steps summary ──
  // Gives the LLM context about what data transformations have already
  // occurred before the target step. This helps it generate code that
  // reads from the correct `input` properties.
  const precedingSteps = pipeData.steps.slice(0, stepIndex);
  if (precedingSteps.length > 0) {
    parts.push("\n### Preceding steps:");
    precedingSteps.forEach((s, i) => {
      parts.push(`\nStep ${i}: ${s.name}`);
      if (s.description) parts.push(`  Description: ${s.description}`);
      parts.push(`  Code:\n\`\`\`ts\n${s.code}\n\`\`\``);
    });
  }

  // ── Target step context ──
  parts.push("\n### Current step to improve:");
  parts.push(`Step index: ${stepIndex}`);
  parts.push(`Name: ${step.name}`);
  if (step.description) parts.push(`Description: ${step.description}`);
  parts.push(`Code:\n\`\`\`ts\n${step.code}\n\`\`\``);
  if (step.config) {
    parts.push(`Config/Conditionals: ${JSON.stringify(step.config, null, 2)}`);
  }

  // ── Output format instructions ──
  // Explicitly tell the LLM to return JSON matching our PatchOperation format.
  // The JSON instruction is very specific to minimize parsing failures.
  parts.push(`
## Your Task

You are improving a single step in a Pipedown pipeline. Return a JSON object with:

\`\`\`json
{
  "summary": "one-line description of changes",
  "rationale": "why these changes help",
  "operations": [
    { "type": "replace_step_code", "path": "steps[${stepIndex}].code", "newValue": "..." },
    { "type": "replace_step_description", "path": "steps[${stepIndex}].description", "newValue": "..." }
  ]
}
\`\`\`

Only include operations for fields you actually change. Valid operation types for step scope:
- replace_step_title — changes the step's heading name
- replace_step_description — changes the paragraph description
- replace_step_code — changes the fenced code block content
- replace_step_config — changes conditional execution config

Rules:
- Output ONLY the JSON object — no explanations, no markdown fences around the entire response.
- The code runs inside an async function with \`input\` and \`opts\` in scope. Do NOT declare or import them.
- Read data from \`input\` properties set by preceding steps; write results back onto \`input\`.
- Use \`$p.get(opts, '/config/key')\` to read pipeline configuration.
- Imports (npm:, jsr:, URLs) go at the top of the code block.
- Keep changes focused and narrow — only modify what the user asked for.

User request: ${userPrompt}`);

  return parts.join("\n");
}

/**
 * Builds the prompt for pipe-scoped proposals.
 *
 * Includes the full pipeline context (all steps) so the LLM can suggest
 * broad changes: description updates, schema changes, step reordering,
 * new steps, or multi-step refactors.
 *
 * @param parts      - Accumulated prompt parts (mutated in place)
 * @param pipeData   - Full Pipe object
 * @param userPrompt - User's instruction
 * @returns Complete prompt string
 */
function buildPipeScopedPrompt(
  parts: string[],
  pipeData: Pipe,
  userPrompt: string,
): string {
  // ── All steps context ──
  parts.push("\n### All steps in this pipeline:");
  pipeData.steps.forEach((s, i) => {
    parts.push(`\n#### Step ${i}: ${s.name}`);
    if (s.description) parts.push(`Description: ${s.description}`);
    parts.push(`Code:\n\`\`\`ts\n${s.code}\n\`\`\``);
    if (s.config) {
      parts.push(`Config: ${JSON.stringify(s.config, null, 2)}`);
    }
  });

  // ── Output format instructions ──
  parts.push(`
## Your Task

You are improving this Pipedown pipeline. Return a JSON object with:

\`\`\`json
{
  "summary": "one-line description of changes",
  "rationale": "why these changes help",
  "operations": [
    { "type": "replace_pipe_description", "path": "pipe.pipeDescription", "newValue": "..." },
    { "type": "replace_step_code", "path": "steps[0].code", "newValue": "..." }
  ]
}
\`\`\`

Only include operations for fields you actually change. Valid operation types for pipe scope:
- replace_pipe_description — changes the pipe's prose description
- replace_schema — changes the Zod schema
- replace_step_title — changes a step's heading (include steps[N] path)
- replace_step_description — changes a step's description paragraph
- replace_step_code — changes a step's code block
- replace_step_config — changes a step's conditional execution config
- insert_step_after — inserts a new step; newValue must be { name, code, description? }; include meta.afterIndex
- delete_step — removes a step at the given path index

Rules:
- Output ONLY the JSON object — no explanations, no markdown fences around the entire response.
- Step code runs inside an async function with \`input\` and \`opts\` in scope.
- Use \`$p.get(opts, '/config/key')\` to read pipeline configuration.
- Imports (npm:, jsr:, URLs) go at the top of code blocks.
- Keep changes focused — prefer narrow, targeted modifications.
- For insert_step_after, set meta.afterIndex to the step index after which to insert.
- For delete_step, set path to "steps[N]" where N is the step to delete.

User request: ${userPrompt}`);

  return parts.join("\n");
}

/**
 * Builds a refinement prompt that includes the existing proposal and user feedback.
 *
 * When the user wants to refine a proposal (e.g. "make the error messages more
 * specific"), this prompt includes the current proposal's operations alongside
 * the refinement feedback so the LLM can iterate on its previous suggestion.
 *
 * @param pipeData     - Full Pipe object
 * @param proposal     - The existing proposal to refine
 * @param feedback     - User's refinement feedback
 * @returns Complete prompt string for callLLM()
 */
export async function buildRefinementPrompt(
  pipeData: Pipe,
  proposal: PatchProposal,
  feedback: string,
): Promise<string> {
  // Start with the same base prompt as the original proposal scope.
  const basePrompt = await buildProposalPrompt(
    pipeData,
    {
      type: proposal.scopeType,
      stepIndex: proposal.scopeRef.stepIndex,
    },
    // Use the original prompt as context, then append refinement.
    proposal.prompt || "improve this",
  );

  // Append the current proposal and refinement feedback.
  return `${basePrompt}

## Previous Proposal (to be refined)

The following proposal was generated but the user wants changes:

Summary: ${proposal.summary}
Rationale: ${proposal.rationale || "none provided"}

Operations:
\`\`\`json
${JSON.stringify(proposal.operations, null, 2)}
\`\`\`

## Refinement Request

The user wants the following adjustments to the proposal above:
${feedback}

Return a NEW complete JSON proposal object (same format as above) that incorporates the user's feedback. Do not reference the old proposal — produce a fresh, complete set of operations.`;
}

// ═══════════════════════════════════════════════════════════════════════
// ── LLM Response Parsing ──
// The LLM may return JSON in various formats:
//   1. Clean JSON: { "summary": "...", "operations": [...] }
//   2. Markdown-wrapped: ```json\n{ ... }\n```
//   3. With preamble: "Here is the proposal:\n{ ... }"
//
// These helpers extract the JSON object from any of these formats.
//
// Ref: CommonMark spec § 4.5 — fenced code blocks
// ═══════════════════════════════════════════════════════════════════════

/**
 * Strips markdown code fences from LLM output, if present.
 *
 * Handles both ``` and ```json / ```ts / etc. wrapping. If no fences
 * are found, returns the input unchanged.
 *
 * @param text - Raw LLM output
 * @returns The unwrapped content
 *
 * Ref: CommonMark spec § 4.5 — https://spec.commonmark.org/0.31.2/#fenced-code-blocks
 */
export function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  // Match opening fence with optional language tag and closing fence.
  // The `[\s\S]*?` is non-greedy to handle nested fences correctly.
  const match = trimmed.match(/^```\w*\s*\n([\s\S]*?)\n```\s*$/);
  if (match) return match[1].trim();
  return trimmed;
}

/**
 * Parses the LLM response into a proposal data object.
 *
 * Tries multiple strategies to extract valid JSON:
 *   1. Direct JSON.parse of the trimmed response
 *   2. Strip code fences, then parse
 *   3. Extract the first JSON object from the text (regex fallback)
 *
 * @param rawResponse - The raw text from callLLM()
 * @returns Parsed object with { summary, rationale?, operations[] }
 * @throws If no valid JSON can be extracted
 */
export function parseLLMProposalResponse(rawResponse: string): {
  summary: string;
  rationale?: string;
  operations: PatchOperation[];
} {
  const trimmed = rawResponse.trim();

  // Strategy 1: direct parse
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && Array.isArray(parsed.operations)) return parsed;
  } catch {
    // Not clean JSON — try other strategies.
  }

  // Strategy 2: strip code fences
  const stripped = stripCodeFences(trimmed);
  try {
    const parsed = JSON.parse(stripped);
    if (parsed && Array.isArray(parsed.operations)) return parsed;
  } catch {
    // Still not valid — try regex extraction.
  }

  // Strategy 3: find the first JSON object in the text.
  // This handles responses like "Here is the proposal:\n{...}"
  // We look for the first '{' and try to parse from there.
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = trimmed.substring(firstBrace, lastBrace + 1);
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && Array.isArray(parsed.operations)) return parsed;
    } catch {
      // All strategies failed.
    }
  }

  throw new Error(
    "Could not parse LLM response as a proposal JSON object. " +
      "Raw response (first 500 chars): " +
      trimmed.substring(0, 500),
  );
}

// ═══════════════════════════════════════════════════════════════════════
// ── Internal Helpers ──
// ═══════════════════════════════════════════════════════════════════════

/**
 * Extracts the step index from a PatchOperation's path field.
 *
 * Parses paths like "steps[2].code" or "steps[0]" to extract the
 * numeric index. Returns null if the path doesn't contain a step
 * reference (e.g. "pipe.pipeDescription").
 *
 * @param op - The PatchOperation to inspect
 * @returns The step index, or null for pipe-level operations
 */
function extractStepIndex(op: PatchOperation): number | null {
  // Check the meta field first — structural operations like insert_step_after
  // may store the target index in meta.afterIndex or meta.stepIndex.
  if (op.meta?.stepIndex !== undefined) {
    return op.meta.stepIndex as number;
  }

  // Parse from the path field: "steps[N]" or "steps[N].field"
  const match = op.path?.match(/steps\[(\d+)\]/);
  if (match) return parseInt(match[1], 10);

  return null;
}
