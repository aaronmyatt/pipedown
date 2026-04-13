/**
 * proposal_test.ts — Tests for Phase 3 Pi proposal system.
 *
 * Covers:
 *   1. createProposal — verify all fields populated correctly
 *   2. persistProposal + readProposal round-trip
 *   3. applyProposal with replace_step_code — verify index.json updated
 *   4. applyProposal with replace_pipe_description — verify pipeDescription updated
 *   5. applyProposal with insert_step_after — verify step inserted
 *   6. discardProposal — verify status set to "discarded"
 *   7. listProposals — verify recent proposals returned sorted
 *   8. Proposal scope validation — step-scope proposal only processes step ops
 *
 * Tests operate on temp directories and in-memory Pipe objects, following
 * the same pattern as structured_edit_test.ts and session_test.ts.
 * No HTTP routes are tested — only the proposalManager functions directly.
 *
 * Run with:
 *   ~/.deno/bin/deno test --no-check -A proposal_test.ts
 *
 * Ref: WEB_FIRST_WORKFLOW_PLAN.md §3 — Phase 3 checklist
 * Ref: pipedown.d.ts — PatchProposal, PatchOperation, ProposalStatus
 */

import {
  assertEquals,
  assertExists,
  assertNotEquals,
  assert,
} from "jsr:@std/assert";
import { join } from "jsr:@std/path@1.0.7";

import {
  createProposal,
  persistProposal,
  readProposal,
  listProposals,
  applyProposal,
  discardProposal,
  buildProposalPrompt,
  parseLLMProposalResponse,
  stripCodeFences,
} from "./pdCli/proposalManager.ts";
import { computeStepFingerprint } from "./pdBuild.ts";
import { pdBuild } from "./pdBuild.ts";
import {
  readPipeData,
  writePipeData,
} from "./pdCli/structuredEdit.ts";
import type {
  Pipe,
  Step,
  PatchProposal,
  PatchOperation,
  BuildInput,
} from "./pipedown.d.ts";

// ── Test Helpers ──

/**
 * Creates a minimal Pipe object for testing. Matches the pattern
 * established in structured_edit_test.ts.
 */
async function createTestPipe(): Promise<Pipe> {
  const step1: Step = {
    stepId: "step-1-id",
    name: "Fetch Data",
    funcName: "FetchData",
    code: 'input.data = "hello";',
    range: [0, 0],
    inList: false,
    headingLevel: 2,
    language: "ts",
    description: "Fetches data from somewhere.",
  };
  step1.fingerprint = await computeStepFingerprint(step1);

  const step2: Step = {
    stepId: "step-2-id",
    name: "Process Data",
    funcName: "ProcessData",
    code: "input.result = input.data.toUpperCase();",
    range: [0, 0],
    inList: false,
    headingLevel: 2,
    language: "ts",
    description: "Transforms the data.",
  };
  step2.fingerprint = await computeStepFingerprint(step2);

  const step3: Step = {
    stepId: "step-3-id",
    name: "Output Data",
    funcName: "OutputData",
    code: 'input.output = input.result + "!";',
    range: [0, 0],
    inList: false,
    headingLevel: 2,
    language: "ts",
    description: "Formats the output.",
  };
  step3.fingerprint = await computeStepFingerprint(step3);

  return {
    name: "Test Pipe",
    cleanName: "testPipe",
    steps: [step1, step2, step3],
    mdPath: "/tmp/test-pipe.md",
    config: {},
    dir: ".pd/testPipe",
    absoluteDir: "/tmp/.pd/testPipe",
    fileName: "testPipe",
    pipeDescription: "A test pipeline.",
    workspace: {
      syncState: "clean",
      lastBuiltAt: new Date().toISOString(),
      lastModifiedBy: "build",
    },
  };
}

/**
 * Scaffolds a temp project directory with a markdown file, runs pdBuild
 * to generate index.json, and returns the project path and pipe name.
 *
 * This is needed for tests that call applyProposal() (which reads/writes
 * index.json on disk) vs. in-memory-only tests.
 */
async function scaffoldTempProject(): Promise<{
  projectPath: string;
  pipeName: string;
}> {
  const tmpDir = await Deno.makeTempDir({ prefix: "pd-proposal-test-" });

  // Write a simple markdown pipe file with three steps.
  const markdown = `# Proposal Test Pipe

A pipe for testing Pi proposals.

## Fetch Data

Fetches data from the API.

\`\`\`ts
input.data = "hello world";
\`\`\`

## Transform Data

Transforms the fetched data.

\`\`\`ts
input.result = input.data.toUpperCase();
\`\`\`

## Format Output

Formats the final output.

\`\`\`ts
input.output = input.result + "!";
\`\`\`
`;
  await Deno.writeTextFile(join(tmpDir, "proposal-test-pipe.md"), markdown);

  // Run pdBuild to generate .pd/proposalTestPipe/index.json
  await pdBuild({
    cwd: tmpDir,
    errors: [],
  } as unknown as BuildInput);

  return { projectPath: tmpDir, pipeName: "proposalTestPipe" };
}

// ═══════════════════════════════════════════════════════════════════════
// ── Test 1: createProposal — verify all fields populated correctly ──
// ═══════════════════════════════════════════════════════════════════════
Deno.test("createProposal populates all required fields", () => {
  const operations: PatchOperation[] = [
    {
      type: "replace_step_code",
      path: "steps[0].code",
      newValue: 'input.data = "improved";',
    },
  ];

  const proposal = createProposal({
    scopeType: "step",
    scopeRef: { pipeName: "testPipe", stepIndex: 0, stepId: "step-1-id" },
    prompt: "improve error handling",
    operations,
    summary: "Added error handling to data fetch",
    rationale: "The step currently lacks try/catch blocks",
  });

  // Verify all fields exist and have correct values.
  assertExists(proposal.proposalId, "proposalId should be generated");
  // UUID format check: 8-4-4-4-12 hex chars
  assert(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      proposal.proposalId,
    ),
    "proposalId should be a valid UUID",
  );
  assertEquals(proposal.scopeType, "step");
  assertEquals(proposal.scopeRef.pipeName, "testPipe");
  assertEquals(proposal.scopeRef.stepIndex, 0);
  assertEquals(proposal.scopeRef.stepId, "step-1-id");
  assertEquals(proposal.origin, "pi");
  assertEquals(proposal.prompt, "improve error handling");
  assertEquals(proposal.operations.length, 1);
  assertEquals(proposal.operations[0].type, "replace_step_code");
  assertEquals(proposal.summary, "Added error handling to data fetch");
  assertEquals(
    proposal.rationale,
    "The step currently lacks try/catch blocks",
  );
  assertEquals(proposal.status, "ready");
  assertExists(proposal.createdAt, "createdAt should be set");
  // Verify it's a valid ISO-8601 timestamp
  assert(!isNaN(Date.parse(proposal.createdAt)), "createdAt should be valid ISO-8601");
});

// ═══════════════════════════════════════════════════════════════════════
// ── Test 2: persistProposal + readProposal round-trip ──
// ═══════════════════════════════════════════════════════════════════════
Deno.test("persistProposal and readProposal round-trip", async () => {
  const tmpDir = await Deno.makeTempDir({ prefix: "pd-proposal-persist-" });

  // Create the .pd/<pipe> directory structure that proposals live under.
  const pipeName = "testPipe";
  await Deno.mkdir(join(tmpDir, ".pd", pipeName), { recursive: true });

  const proposal = createProposal({
    scopeType: "pipe",
    scopeRef: { pipeName },
    prompt: "add a description",
    operations: [
      {
        type: "replace_pipe_description",
        path: "pipe.pipeDescription",
        newValue: "A great pipeline",
      },
    ],
    summary: "Added pipe description",
  });

  // Persist to disk
  await persistProposal(tmpDir, pipeName, proposal);

  // Verify the file was created
  const filePath = join(
    tmpDir,
    ".pd",
    pipeName,
    "proposals",
    `${proposal.proposalId}.json`,
  );
  const stat = await Deno.stat(filePath);
  assert(stat.isFile, "Proposal JSON file should exist");

  // Read it back
  const loaded = await readProposal(tmpDir, pipeName, proposal.proposalId);
  assertExists(loaded, "readProposal should return the proposal");
  assertEquals(loaded!.proposalId, proposal.proposalId);
  assertEquals(loaded!.scopeType, "pipe");
  assertEquals(loaded!.summary, "Added pipe description");
  assertEquals(loaded!.status, "ready");
  assertEquals(loaded!.operations.length, 1);
  assertEquals(loaded!.operations[0].type, "replace_pipe_description");

  // Clean up
  await Deno.remove(tmpDir, { recursive: true });
});

// ═══════════════════════════════════════════════════════════════════════
// ── Test 3: readProposal returns null for non-existent proposal ──
// ═══════════════════════════════════════════════════════════════════════
Deno.test("readProposal returns null for non-existent proposal", async () => {
  const tmpDir = await Deno.makeTempDir({ prefix: "pd-proposal-read-" });
  const result = await readProposal(tmpDir, "testPipe", "non-existent-id");
  assertEquals(result, null, "Should return null for missing proposal");
  await Deno.remove(tmpDir, { recursive: true });
});

// ═══════════════════════════════════════════════════════════════════════
// ── Test 4: applyProposal with replace_step_code ──
// ═══════════════════════════════════════════════════════════════════════
Deno.test("applyProposal with replace_step_code updates index.json", async () => {
  const { projectPath, pipeName } = await scaffoldTempProject();

  // Read the pipe to get original step code for comparison.
  const originalPipe = await readPipeData(projectPath, pipeName);
  const originalCode = originalPipe.steps[0].code;
  const originalFingerprint = originalPipe.steps[0].fingerprint;

  // Create a proposal that changes step 0's code.
  const proposal = createProposal({
    scopeType: "step",
    scopeRef: { pipeName, stepIndex: 0 },
    prompt: "add error handling",
    operations: [
      {
        type: "replace_step_code",
        path: "steps[0].code",
        newValue: 'try {\n  input.data = "hello world";\n} catch (e) {\n  input.error = e.message;\n}',
      },
    ],
    summary: "Added try/catch error handling",
  });

  // Persist the proposal first (applyProposal will update its status).
  await persistProposal(projectPath, pipeName, proposal);

  // Apply the proposal
  const updatedPipe = await applyProposal(projectPath, pipeName, proposal);

  // Verify the step code was updated
  assertNotEquals(
    updatedPipe.steps[0].code,
    originalCode,
    "Step code should have changed",
  );
  assert(
    updatedPipe.steps[0].code.includes("try"),
    "Updated code should contain try/catch",
  );

  // Verify the workspace is marked dirty with pi_patch provenance
  assertEquals(updatedPipe.workspace?.syncState, "json_dirty");
  assertEquals(updatedPipe.workspace?.lastModifiedBy, "pi_patch");

  // Verify the fingerprint changed (code change → fingerprint change)
  assertNotEquals(
    updatedPipe.steps[0].fingerprint,
    originalFingerprint,
    "Fingerprint should change after code edit",
  );

  // Verify the proposal was persisted with "applied" status
  const savedProposal = await readProposal(
    projectPath,
    pipeName,
    proposal.proposalId,
  );
  assertEquals(savedProposal?.status, "applied");

  // Verify changes are on disk (re-read index.json)
  const diskPipe = await readPipeData(projectPath, pipeName);
  assert(
    diskPipe.steps[0].code.includes("try"),
    "On-disk index.json should reflect the applied change",
  );

  await Deno.remove(projectPath, { recursive: true });
});

// ═══════════════════════════════════════════════════════════════════════
// ── Test 5: applyProposal with replace_pipe_description ──
// ═══════════════════════════════════════════════════════════════════════
Deno.test("applyProposal with replace_pipe_description updates pipeDescription", async () => {
  const { projectPath, pipeName } = await scaffoldTempProject();

  const proposal = createProposal({
    scopeType: "pipe",
    scopeRef: { pipeName },
    prompt: "improve description",
    operations: [
      {
        type: "replace_pipe_description",
        path: "pipe.pipeDescription",
        newValue: "An awesome pipeline that processes data efficiently.",
      },
    ],
    summary: "Updated pipe description",
  });

  await persistProposal(projectPath, pipeName, proposal);
  const updatedPipe = await applyProposal(projectPath, pipeName, proposal);

  assertEquals(
    updatedPipe.pipeDescription,
    "An awesome pipeline that processes data efficiently.",
  );
  assertEquals(updatedPipe.workspace?.syncState, "json_dirty");
  assertEquals(updatedPipe.workspace?.lastModifiedBy, "pi_patch");

  await Deno.remove(projectPath, { recursive: true });
});

// ═══════════════════════════════════════════════════════════════════════
// ── Test 6: applyProposal with insert_step_after ──
// ═══════════════════════════════════════════════════════════════════════
Deno.test("applyProposal with insert_step_after inserts a new step", async () => {
  const { projectPath, pipeName } = await scaffoldTempProject();

  const originalPipe = await readPipeData(projectPath, pipeName);
  const originalStepCount = originalPipe.steps.length;

  const proposal = createProposal({
    scopeType: "pipe",
    scopeRef: { pipeName },
    prompt: "add a validation step",
    operations: [
      {
        type: "insert_step_after",
        path: "steps[0]",
        newValue: {
          name: "Validate Data",
          code: 'if (!input.data) throw new Error("No data");',
          description: "Validates that data was fetched successfully.",
        },
        meta: { afterIndex: 0 },
      },
    ],
    summary: "Added validation step after data fetch",
  });

  await persistProposal(projectPath, pipeName, proposal);
  const updatedPipe = await applyProposal(projectPath, pipeName, proposal);

  // One more step than before
  assertEquals(
    updatedPipe.steps.length,
    originalStepCount + 1,
    "Should have one more step after insertion",
  );

  // The new step should be at index 1 (after index 0)
  assertEquals(updatedPipe.steps[1].name, "Validate Data");
  assert(
    updatedPipe.steps[1].code.includes("No data"),
    "New step code should contain the validation logic",
  );

  // The new step should have a stepId assigned
  assertExists(
    updatedPipe.steps[1].stepId,
    "Inserted step should have a stepId",
  );

  // Original step 1 ("Transform Data") should now be at index 2
  assertEquals(updatedPipe.steps[2].name, "Transform Data");

  await Deno.remove(projectPath, { recursive: true });
});

// ═══════════════════════════════════════════════════════════════════════
// ── Test 7: discardProposal — verify status set to "discarded" ──
// ═══════════════════════════════════════════════════════════════════════
Deno.test("discardProposal sets status to discarded", async () => {
  const tmpDir = await Deno.makeTempDir({ prefix: "pd-proposal-discard-" });
  const pipeName = "testPipe";
  await Deno.mkdir(join(tmpDir, ".pd", pipeName), { recursive: true });

  const proposal = createProposal({
    scopeType: "step",
    scopeRef: { pipeName, stepIndex: 0 },
    prompt: "something",
    operations: [
      { type: "replace_step_code", path: "steps[0].code", newValue: "// noop" },
    ],
    summary: "test discard",
  });

  // Persist, then discard.
  await persistProposal(tmpDir, pipeName, proposal);
  const discarded = await discardProposal(
    tmpDir,
    pipeName,
    proposal.proposalId,
  );

  assertExists(discarded, "discardProposal should return the proposal");
  assertEquals(discarded!.status, "discarded");

  // Verify status persists on disk
  const reloaded = await readProposal(tmpDir, pipeName, proposal.proposalId);
  assertEquals(reloaded?.status, "discarded");

  await Deno.remove(tmpDir, { recursive: true });
});

// ═══════════════════════════════════════════════════════════════════════
// ── Test 8: discardProposal returns null for non-existent proposal ──
// ═══════════════════════════════════════════════════════════════════════
Deno.test("discardProposal returns null for non-existent proposal", async () => {
  const tmpDir = await Deno.makeTempDir({ prefix: "pd-proposal-discard-ne-" });
  const result = await discardProposal(tmpDir, "testPipe", "non-existent-id");
  assertEquals(result, null);
  await Deno.remove(tmpDir, { recursive: true });
});

// ═══════════════════════════════════════════════════════════════════════
// ── Test 9: listProposals — recent proposals returned sorted ──
// ═══════════════════════════════════════════════════════════════════════
Deno.test("listProposals returns proposals sorted by createdAt desc", async () => {
  const tmpDir = await Deno.makeTempDir({ prefix: "pd-proposal-list-" });
  const pipeName = "testPipe";
  await Deno.mkdir(join(tmpDir, ".pd", pipeName), { recursive: true });

  // Create three proposals with staggered timestamps.
  // We manually set createdAt to ensure ordering (crypto.randomUUID doesn't help).
  const proposals: PatchProposal[] = [];
  for (let i = 0; i < 3; i++) {
    const p = createProposal({
      scopeType: "step",
      scopeRef: { pipeName, stepIndex: i },
      prompt: `prompt ${i}`,
      operations: [
        {
          type: "replace_step_code",
          path: `steps[${i}].code`,
          newValue: `// step ${i}`,
        },
      ],
      summary: `proposal ${i}`,
    });
    // Override createdAt to ensure deterministic ordering.
    // Each proposal is 1 second apart.
    p.createdAt = new Date(Date.now() + i * 1000).toISOString();
    proposals.push(p);
    await persistProposal(tmpDir, pipeName, p);
  }

  const listed = await listProposals(tmpDir, pipeName);

  assertEquals(listed.length, 3, "Should list all 3 proposals");
  // Verify descending order (newest first).
  // proposal[2] has the latest timestamp, so it should be first.
  assertEquals(listed[0].summary, "proposal 2");
  assertEquals(listed[1].summary, "proposal 1");
  assertEquals(listed[2].summary, "proposal 0");

  await Deno.remove(tmpDir, { recursive: true });
});

// ═══════════════════════════════════════════════════════════════════════
// ── Test 10: listProposals with limit ──
// ═══════════════════════════════════════════════════════════════════════
Deno.test("listProposals respects limit parameter", async () => {
  const tmpDir = await Deno.makeTempDir({ prefix: "pd-proposal-limit-" });
  const pipeName = "testPipe";
  await Deno.mkdir(join(tmpDir, ".pd", pipeName), { recursive: true });

  // Create 5 proposals
  for (let i = 0; i < 5; i++) {
    const p = createProposal({
      scopeType: "step",
      scopeRef: { pipeName, stepIndex: 0 },
      prompt: `prompt ${i}`,
      operations: [],
      summary: `proposal ${i}`,
    });
    p.createdAt = new Date(Date.now() + i * 1000).toISOString();
    await persistProposal(tmpDir, pipeName, p);
  }

  const limited = await listProposals(tmpDir, pipeName, 2);
  assertEquals(limited.length, 2, "Should respect limit of 2");

  await Deno.remove(tmpDir, { recursive: true });
});

// ═══════════════════════════════════════════════════════════════════════
// ── Test 11: listProposals returns empty for no proposals ──
// ═══════════════════════════════════════════════════════════════════════
Deno.test("listProposals returns empty array when no proposals exist", async () => {
  const tmpDir = await Deno.makeTempDir({ prefix: "pd-proposal-empty-" });
  const result = await listProposals(tmpDir, "testPipe");
  assertEquals(result.length, 0);
  await Deno.remove(tmpDir, { recursive: true });
});

// ═══════════════════════════════════════════════════════════════════════
// ── Test 12: applyProposal with delete_step ──
// ═══════════════════════════════════════════════════════════════════════
Deno.test("applyProposal with delete_step removes a step", async () => {
  const { projectPath, pipeName } = await scaffoldTempProject();

  const originalPipe = await readPipeData(projectPath, pipeName);
  const originalStepCount = originalPipe.steps.length;
  const secondStepName = originalPipe.steps[1].name;

  const proposal = createProposal({
    scopeType: "pipe",
    scopeRef: { pipeName },
    prompt: "remove the middle step",
    operations: [
      {
        type: "delete_step",
        path: "steps[1]",
      },
    ],
    summary: "Removed Transform Data step",
  });

  await persistProposal(projectPath, pipeName, proposal);
  const updatedPipe = await applyProposal(projectPath, pipeName, proposal);

  // One fewer step
  assertEquals(
    updatedPipe.steps.length,
    originalStepCount - 1,
    "Should have one fewer step after deletion",
  );

  // The deleted step ("Transform Data") should no longer exist.
  // Step at index 1 should now be what was previously at index 2.
  assertNotEquals(
    updatedPipe.steps[1]?.name,
    secondStepName,
    "Deleted step should no longer be at index 1",
  );

  await Deno.remove(projectPath, { recursive: true });
});

// ═══════════════════════════════════════════════════════════════════════
// ── Test 13: applyProposal with replace_schema ──
// ═══════════════════════════════════════════════════════════════════════
Deno.test("applyProposal with replace_schema updates pipe schema", async () => {
  const { projectPath, pipeName } = await scaffoldTempProject();

  const proposal = createProposal({
    scopeType: "pipe",
    scopeRef: { pipeName },
    prompt: "add schema",
    operations: [
      {
        type: "replace_schema",
        path: "pipe.schema",
        newValue: "z.object({ data: z.string(), result: z.string() })",
      },
    ],
    summary: "Added Zod schema",
  });

  await persistProposal(projectPath, pipeName, proposal);
  const updatedPipe = await applyProposal(projectPath, pipeName, proposal);

  assertEquals(
    updatedPipe.schema,
    "z.object({ data: z.string(), result: z.string() })",
  );

  await Deno.remove(projectPath, { recursive: true });
});

// ═══════════════════════════════════════════════════════════════════════
// ── Test 14: applyProposal with multiple operations ──
// ═══════════════════════════════════════════════════════════════════════
Deno.test("applyProposal handles multiple operations in one proposal", async () => {
  const { projectPath, pipeName } = await scaffoldTempProject();

  const proposal = createProposal({
    scopeType: "step",
    scopeRef: { pipeName, stepIndex: 0 },
    prompt: "improve step 0 title and code",
    operations: [
      {
        type: "replace_step_title",
        path: "steps[0].name",
        newValue: "Fetch User Data",
      },
      {
        type: "replace_step_description",
        path: "steps[0].description",
        newValue: "Fetches user data from the external API.",
      },
      {
        type: "replace_step_code",
        path: "steps[0].code",
        newValue: 'input.data = await fetch("https://api.example.com/users").then(r => r.json());',
      },
    ],
    summary: "Improved step 0 title, description, and code",
  });

  await persistProposal(projectPath, pipeName, proposal);
  const updatedPipe = await applyProposal(projectPath, pipeName, proposal);

  assertEquals(updatedPipe.steps[0].name, "Fetch User Data");
  assertEquals(
    updatedPipe.steps[0].description,
    "Fetches user data from the external API.",
  );
  assert(
    updatedPipe.steps[0].code.includes("api.example.com"),
    "Code should include the API URL",
  );

  await Deno.remove(projectPath, { recursive: true });
});

// ═══════════════════════════════════════════════════════════════════════
// ── Test 15: parseLLMProposalResponse — clean JSON ──
// ═══════════════════════════════════════════════════════════════════════
Deno.test("parseLLMProposalResponse parses clean JSON", () => {
  const json = JSON.stringify({
    summary: "Fixed code",
    rationale: "Better patterns",
    operations: [
      { type: "replace_step_code", path: "steps[0].code", newValue: "// fixed" },
    ],
  });

  const result = parseLLMProposalResponse(json);
  assertEquals(result.summary, "Fixed code");
  assertEquals(result.rationale, "Better patterns");
  assertEquals(result.operations.length, 1);
});

// ═══════════════════════════════════════════════════════════════════════
// ── Test 16: parseLLMProposalResponse — markdown-wrapped JSON ──
// ═══════════════════════════════════════════════════════════════════════
Deno.test("parseLLMProposalResponse strips markdown code fences", () => {
  const wrapped = `\`\`\`json
{
  "summary": "Wrapped proposal",
  "operations": [
    { "type": "replace_step_title", "path": "steps[0].name", "newValue": "Better Title" }
  ]
}
\`\`\``;

  const result = parseLLMProposalResponse(wrapped);
  assertEquals(result.summary, "Wrapped proposal");
  assertEquals(result.operations.length, 1);
});

// ═══════════════════════════════════════════════════════════════════════
// ── Test 17: parseLLMProposalResponse — JSON with preamble text ──
// ═══════════════════════════════════════════════════════════════════════
Deno.test("parseLLMProposalResponse extracts JSON from preamble text", () => {
  const withPreamble = `Here is my proposal for improving the step:

{
  "summary": "Extracted proposal",
  "rationale": "From preamble",
  "operations": [
    { "type": "replace_step_code", "path": "steps[1].code", "newValue": "// better" }
  ]
}`;

  const result = parseLLMProposalResponse(withPreamble);
  assertEquals(result.summary, "Extracted proposal");
});

// ═══════════════════════════════════════════════════════════════════════
// ── Test 18: parseLLMProposalResponse — throws on invalid input ──
// ═══════════════════════════════════════════════════════════════════════
Deno.test("parseLLMProposalResponse throws on unparseable input", () => {
  let threw = false;
  try {
    parseLLMProposalResponse("This is not JSON at all, just plain text.");
  } catch (e) {
    threw = true;
    assert(
      (e as Error).message.includes("Could not parse"),
      "Error should mention parsing failure",
    );
  }
  assert(threw, "Should have thrown on invalid input");
});

// ═══════════════════════════════════════════════════════════════════════
// ── Test 19: stripCodeFences utility ──
// ═══════════════════════════════════════════════════════════════════════
Deno.test("stripCodeFences removes code fences correctly", () => {
  // With language tag
  assertEquals(
    stripCodeFences("```json\n{\"key\": \"value\"}\n```"),
    '{"key": "value"}',
  );

  // Without language tag
  assertEquals(
    stripCodeFences("```\ncontent here\n```"),
    "content here",
  );

  // No fences — returns input unchanged
  assertEquals(
    stripCodeFences('{"key": "value"}'),
    '{"key": "value"}',
  );
});

// ═══════════════════════════════════════════════════════════════════════
// ── Test 20: buildProposalPrompt — step-scoped prompt ──
// ═══════════════════════════════════════════════════════════════════════
Deno.test("buildProposalPrompt builds step-scoped prompt with context", async () => {
  const pipe = await createTestPipe();

  const prompt = await buildProposalPrompt(
    pipe,
    { type: "step", stepIndex: 1 },
    "add error handling",
  );

  // The prompt should contain pipeline context
  assert(prompt.includes("Test Pipe"), "Should include pipe name");
  assert(
    prompt.includes("A test pipeline."),
    "Should include pipe description",
  );

  // The prompt should contain the target step
  assert(prompt.includes("Process Data"), "Should include target step name");
  assert(
    prompt.includes("input.result = input.data.toUpperCase()"),
    "Should include target step code",
  );

  // The prompt should contain preceding steps
  assert(prompt.includes("Fetch Data"), "Should include preceding step");

  // The prompt should contain output format instructions
  assert(
    prompt.includes("replace_step_code"),
    "Should include valid operation types",
  );
  assert(
    prompt.includes("JSON object"),
    "Should instruct JSON output format",
  );

  // The prompt should include the user's request
  assert(
    prompt.includes("add error handling"),
    "Should include user prompt",
  );
});

// ═══════════════════════════════════════════════════════════════════════
// ── Test 21: buildProposalPrompt — pipe-scoped prompt ──
// ═══════════════════════════════════════════════════════════════════════
Deno.test("buildProposalPrompt builds pipe-scoped prompt with all steps", async () => {
  const pipe = await createTestPipe();

  const prompt = await buildProposalPrompt(
    pipe,
    { type: "pipe" },
    "refactor the pipeline",
  );

  // Should include all steps (pipe scope shows everything)
  assert(prompt.includes("Fetch Data"), "Should include step 0");
  assert(prompt.includes("Process Data"), "Should include step 1");
  assert(prompt.includes("Output Data"), "Should include step 2");

  // Should include pipe-level operation types
  assert(
    prompt.includes("replace_pipe_description"),
    "Should include pipe-level ops",
  );
  assert(
    prompt.includes("insert_step_after"),
    "Should include structural ops",
  );
  assert(prompt.includes("delete_step"), "Should include delete op");
});

// ═══════════════════════════════════════════════════════════════════════
// ── Test 22: Proposal workspace dirty state after apply ──
// ═══════════════════════════════════════════════════════════════════════
Deno.test("applyProposal sets workspace to json_dirty with pi_patch provenance", async () => {
  const { projectPath, pipeName } = await scaffoldTempProject();

  // Read initial pipe — workspace should be clean after build.
  const initialPipe = await readPipeData(projectPath, pipeName);
  assertEquals(
    initialPipe.workspace?.syncState,
    "clean",
    "Initial state should be clean after build",
  );

  // Apply a simple proposal
  const proposal = createProposal({
    scopeType: "step",
    scopeRef: { pipeName, stepIndex: 0 },
    prompt: "test",
    operations: [
      {
        type: "replace_step_description",
        path: "steps[0].description",
        newValue: "Updated description.",
      },
    ],
    summary: "test dirty state",
  });

  await persistProposal(projectPath, pipeName, proposal);
  const updatedPipe = await applyProposal(projectPath, pipeName, proposal);

  // Verify dirty state with correct provenance
  assertEquals(updatedPipe.workspace?.syncState, "json_dirty");
  assertEquals(
    updatedPipe.workspace?.lastModifiedBy,
    "pi_patch",
    "lastModifiedBy should be 'pi_patch' after applying a proposal",
  );

  await Deno.remove(projectPath, { recursive: true });
});
