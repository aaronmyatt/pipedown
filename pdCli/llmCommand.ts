import type { CliInput, PDError } from "../pipedown.d.ts";
import { md, pd, std } from "../deps.ts";
import { PD_DIR } from "./helpers.ts";

const helpText = `
llm - Generate or improve codeblocks using LLM

Usage:
  pd llm <markdown-file> <index|heading-name> <prompt>

Arguments:
  markdown-file    Path to the markdown file (without .md extension)
  index           Zero-based index of the codeblock to target
  heading-name    Name of the heading containing the codeblock
  prompt          Prompt for the LLM to generate/improve the code

Examples:
  pd llm dailyWallpaper 0 "Add error handling"
  pd llm myScript "API Call" "Optimize this API call for better performance"
`;

// ── Shared Pipedown System Prompt ──
// Reads LLM.md from the project root at runtime so there's a single source
// of truth for what Pipedown is and how it works. The file is cached after
// the first read to avoid repeated disk I/O within a single process.
// Ref: /LLM.md

let _cachedSystemPrompt: string | null = null;

/**
 * Loads the Pipedown system prompt from LLM.md at the project root.
 * The result is cached in memory so subsequent calls in the same process
 * return instantly without hitting the filesystem again.
 * Ref: https://docs.deno.com/api/deno/~/Deno.readTextFile
 * @returns The contents of LLM.md, or a short fallback if the file is missing.
 */
export async function getPipedownSystemPrompt(): Promise<string> {
  if (_cachedSystemPrompt) return _cachedSystemPrompt;

  // LLM.md lives at the project root — same directory the user runs `pd` from.
  // We resolve relative to CWD, matching how PD_DIR (`./.pd`) is resolved.
  const llmMdPath = std.join(Deno.cwd(), "LLM.md");
  try {
    _cachedSystemPrompt = await Deno.readTextFile(llmMdPath);
  } catch {
    // Fallback: if LLM.md doesn't exist (e.g. running outside a pipedown
    // project), provide a minimal one-liner so prompts still work.
    _cachedSystemPrompt =
      "You are an expert assistant for Pipedown — a framework that transforms markdown files into executable TypeScript/JavaScript pipelines running on Deno.";
  }
  return _cachedSystemPrompt;
}

export async function loadPipeContext(
  markdownFile: string,
  projectPath?: string,
) {
  const baseDir = projectPath ? std.join(projectPath, ".pd") : PD_DIR;
  const pipeDir = std.join(baseDir, markdownFile);
  const indexJsonPath = std.join(pipeDir, "index.json");

  try {
    const pipeData = JSON.parse(await Deno.readTextFile(indexJsonPath));
    return pipeData.steps || [];
  } catch (error) {
    // Deno's catch clause types errors as `unknown`; cast to Error to access .message.
    // Ref: https://www.typescriptlang.org/docs/handbook/2/narrowing.html#using-type-predicates
    throw new Error(
      `Could not load pipe data for ${markdownFile}: ${
        (error as Error).message
      }`,
    );
  }
}

// deno-lint-ignore no-explicit-any
export function findTargetStep(steps: any[], target: string) {
  // Try to parse as index first
  const index = parseInt(target);
  if (!isNaN(index)) {
    if (index >= 0 && index < steps.length) {
      return { step: steps[index], index };
    }
    throw new Error(
      `Index ${index} is out of range. Available indices: 0-${
        steps.length - 1
      }`,
    );
  }

  // Search by heading name
  const stepIndex = steps.findIndex((step) =>
    step.name.toLowerCase().includes(target.toLowerCase()) ||
    step.funcName.toLowerCase().includes(target.toLowerCase())
  );

  if (stepIndex === -1) {
    const availableNames = steps.map((step, i) => `${i}: ${step.name}`).join(
      "\n  ",
    );
    throw new Error(
      `Could not find step with name containing "${target}". Available steps:\n  ${availableNames}`,
    );
  }

  return { step: steps[stepIndex], index: stepIndex };
}

export async function buildContextPrompt(
  // deno-lint-ignore no-explicit-any
  steps: any[],
  targetIndex: number,
  userPrompt: string,
) {
  // Get preceding steps for context — the LLM needs to understand what data
  // transformations have already occurred so it can generate code that reads
  // from the correct `input` properties set by earlier steps.
  const precedingSteps = steps.slice(0, targetIndex);
  const targetStep = steps[targetIndex];
  const systemPrompt = await getPipedownSystemPrompt();

  const contextJson = JSON.stringify(precedingSteps, null, 2);

  return `${systemPrompt}

## Your Task

You are improving a single step's code within a Pipedown pipeline.

### Context — Previous steps in this pipeline:
${contextJson}

### Current step to improve:
Name: ${targetStep.name}
Current code:
\`\`\`ts
${targetStep.code}
\`\`\`

### User request: ${userPrompt}

### Rules:
- Output ONLY the improved TypeScript/JavaScript code — no explanations, no markdown fences.
- The code runs inside an async function with \`input\` and \`opts\` in scope. Do NOT declare or import them.
- Read data from \`input\` properties set by preceding steps; write results back onto \`input\`.
- Use \`$p.get(opts, '/config/key')\` to read pipeline configuration.
- Imports (npm:, jsr:, URLs) go at the top of the code block.
- Do not wrap code in a function or module — it executes inline.`;
}

export async function callLLM(prompt: string): Promise<string> {
  // Pass the prompt via stdin instead of as a positional argument.
  // The `llm` CLI treats extra positional args as an error, and multi-line
  // prompts with spaces/newlines get split into multiple args by Deno.Command.
  // Piping via stdin avoids shell-escaping issues entirely.
  // Ref: https://llm.datasette.io/en/stable/usage.html
  const command = new Deno.Command("llm", {
    args: ["-m", "claude-sonnet-4.6", "-x", "code"],
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  });

  // Spawn the process so we can write to stdin before awaiting output.
  // Deno.Command.spawn() returns a child process with writable stdin.
  // Ref: https://docs.deno.com/api/deno/~/Deno.Command.prototype.spawn
  const child = command.spawn();

  // Write the prompt to stdin and close the stream to signal EOF.
  const writer = child.stdin.getWriter();
  await writer.write(new TextEncoder().encode(prompt));
  await writer.close();

  const { code, stdout, stderr } = await child.output();
  console.log(std.colors.brightBlue(`LLM command executed with code: ${code}`));

  if (code !== 0) {
    const errorText = new TextDecoder().decode(stderr);
    console.error(std.colors.brightRed(`LLM command error: ${errorText}`));
    throw new Error(`LLM command failed: ${errorText}`);
  }

  return new TextDecoder().decode(stdout).trim();
}

/**
 * Cleans raw LLM output by stripping markdown code fences and unwrapping
 * JSON `{"code": "..."}` envelopes. The `llm` CLI with `-x code` may return
 * either format depending on the model's behaviour.
 * Ref: CommonMark spec § 4.5 — https://spec.commonmark.org/0.31.2/#fenced-code-blocks
 * @param {string} text - Raw LLM output
 * @returns {string} The extracted code string
 */
function cleanLLMOutput(text: string): string {
  let cleaned = text.trim();

  // Strip markdown code fences (```lang ... ```) — same logic as buildandserve.ts
  const fenceMatch = cleaned.match(/^```\w*\s*\n([\s\S]*?)\n```\s*$/);
  if (fenceMatch) cleaned = fenceMatch[1];

  // Unwrap JSON envelope: {"code": "..."} — the `-x code` template
  // can cause some models to wrap output in this format.
  try {
    const parsed = JSON.parse(cleaned);
    if (
      parsed && typeof parsed === "object" && typeof parsed.code === "string"
    ) {
      cleaned = parsed.code;
    }
  } catch {
    // Not JSON — use as-is
  }

  return cleaned;
}

async function updateMarkdownFile(
  markdownFile: string,
  targetIndex: number,
  newCode: string,
) {
  const markdownPath = `${markdownFile}.md`;

  try {
    const content = await Deno.readTextFile(markdownPath);
    const pipeDir = std.join(PD_DIR, markdownFile);
    const indexJsonPath = std.join(pipeDir, "index.json");
    const pipeData = JSON.parse(await Deno.readTextFile(indexJsonPath));
    const targetStep = pipeData.steps[targetIndex];

    // Create markdown-it instance
    const markdownIt = new md.MarkdownIt();

    // Parse markdown content into tokens
    const tokens = markdownIt.parse(content, {});

    // Find the target codeblock token within the range
    let codeblockFound = false;
    for (
      let i = targetStep.range[0];
      i < targetStep.range[1] && i < tokens.length;
      i++
    ) {
      const token = tokens[i];
      if (
        token && token.type === "fence" &&
        token.content.trim() === targetStep.code.trim()
      ) {
        // Update the codeblock content
        token.content = newCode;
        codeblockFound = true;
        break;
      }
    }

    if (!codeblockFound) {
      throw new Error(
        `Could not find the target codeblock in the specified range. Expected code:\n${targetStep.code}`,
      );
    }

    // Convert tokens back to markdown using custom serializer
    const updatedContent = tokensToMarkdown(tokens);

    await Deno.writeTextFile(markdownPath, updatedContent);
    console.log(
      std.colors.brightGreen(`✓ Updated codeblock in ${markdownPath}`),
    );
  } catch (error) {
    // Cast unknown catch variable to Error for .message access.
    throw new Error(
      `Failed to update markdown file: ${(error as Error).message}`,
    );
  }
}

// Custom function to convert tokens back to markdown
// deno-lint-ignore no-explicit-any
function tokensToMarkdown(tokens: any[]): string {
  let result = "";

  for (const token of tokens) {
    switch (token.type) {
      case "heading_open":
        result += "#".repeat(token.tag.slice(1)) + " ";
        break;
      case "heading_close":
        result += "\n\n";
        break;
      case "paragraph_open":
        // No action needed
        break;
      case "paragraph_close":
        result += "\n\n";
        break;
      case "fence":
        result += "```" + (token.info || "") + "\n";
        result += token.content;
        if (!token.content.endsWith("\n")) result += "\n";
        result += "```\n\n";
        break;
      case "code_inline":
        result += "`" + token.content + "`";
        break;
      case "text":
        result += token.content;
        break;
      case "softbreak":
        result += "\n";
        break;
      case "hardbreak":
        result += "\n";
        break;
      case "bullet_list_open":
        // No action needed
        break;
      case "bullet_list_close":
        result += "\n";
        break;
      case "list_item_open":
        result += "- ";
        break;
      case "list_item_close":
        result += "\n";
        break;
      case "strong_open":
        result += "**";
        break;
      case "strong_close":
        result += "**";
        break;
      case "em_open":
        result += "*";
        break;
      case "em_close":
        result += "*";
        break;
      default:
        // For unhandled token types, try to preserve content if available
        if (token.content) {
          result += token.content;
        }
        break;
    }
  }

  return result.trim() + "\n";
}

export async function llmCommand(input: CliInput) {
  if (pd.$p.get(input, "/flags/help") || pd.$p.get(input, "/flags/h")) {
    console.log(helpText);
    return input;
  }

  const args = input.flags._;
  if (args.length < 4) {
    console.error("Error: Missing required arguments");
    console.log(helpText);
    return input;
  }

  const [, markdownFile, target, ...promptParts] = args as string[];
  const prompt = promptParts.join(" ");

  try {
    console.log(
      std.colors.brightBlue(`Loading context for ${markdownFile}...`),
    );
    const steps = await loadPipeContext(markdownFile);

    console.log(std.colors.brightBlue(`Finding target step: ${target}...`));
    const { step: targetStep, index: targetIndex } = findTargetStep(
      steps,
      target,
    );

    console.log(
      std.colors.brightBlue(`Calling LLM to improve: ${targetStep.name}...`),
    );
    const contextPrompt = await buildContextPrompt(steps, targetIndex, prompt);
    const rawResult = await callLLM(contextPrompt);
    // Clean the LLM output: strip code fences and unwrap {"code": "..."} envelopes
    // before writing back to the markdown source file.
    const improvedCode = cleanLLMOutput(rawResult);

    console.log(std.colors.brightBlue("Updating markdown file..."));
    console.log(
      std.colors.brightGreen("Improved code:\n") + std.colors.dim(improvedCode),
    );
    await updateMarkdownFile(markdownFile, targetIndex, improvedCode);

    console.log(std.colors.brightGreen("✓ Successfully updated codeblock!"));
  } catch (error) {
    console.error(std.colors.brightRed(`Error: ${(error as Error).message}`));
    input.errors = input.errors || [];
    // PDError = { func: string } & Error — spread the caught error and add the
    // required `func` identifier so the pipeline error reporter knows which step failed.
    // Ref: pipedown.d.ts PDError type definition
    input.errors.push({ ...(error as Error), func: "llm" } as PDError);
  }

  return input;
}
