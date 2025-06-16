import type { CliInput } from "../pipedown.d.ts";
import { pd, std } from "../deps.ts";
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

async function loadPipeContext(markdownFile: string) {
  const pipeDir = std.join(PD_DIR, markdownFile);
  const indexJsonPath = std.join(pipeDir, "index.json");
  
  try {
    const pipeData = JSON.parse(await Deno.readTextFile(indexJsonPath));
    return pipeData.steps || [];
  } catch (error) {
    throw new Error(`Could not load pipe data for ${markdownFile}: ${error.message}`);
  }
}

function findTargetStep(steps: any[], target: string) {
  // Try to parse as index first
  const index = parseInt(target);
  if (!isNaN(index)) {
    if (index >= 0 && index < steps.length) {
      return { step: steps[index], index };
    }
    throw new Error(`Index ${index} is out of range. Available indices: 0-${steps.length - 1}`);
  }
  
  // Search by heading name
  const stepIndex = steps.findIndex(step => 
    step.name.toLowerCase().includes(target.toLowerCase()) ||
    step.funcName.toLowerCase().includes(target.toLowerCase())
  );
  
  if (stepIndex === -1) {
    const availableNames = steps.map((step, i) => `${i}: ${step.name}`).join('\n  ');
    throw new Error(`Could not find step with name containing "${target}". Available steps:\n  ${availableNames}`);
  }
  
  return { step: steps[stepIndex], index: stepIndex };
}

function buildContextPrompt(steps: any[], targetIndex: number, userPrompt: string) {
  // Get preceding steps for context
  const precedingSteps = steps.slice(0, targetIndex);
  const targetStep = steps[targetIndex];
  
  const contextJson = JSON.stringify(precedingSteps, null, 2);
  
  return `You are helping to improve a codeblock in a markdown-based pipeline system.

Context - Previous steps in this pipeline:
${contextJson}

Current codeblock to improve:
Name: ${targetStep.name}
Current code:
\`\`\`
${targetStep.code}
\`\`\`

User request: ${userPrompt}

Please provide only the improved code without any explanation or markdown formatting.`;
}

async function callLLM(prompt: string): Promise<string> {
  const command = new Deno.Command("llm", {
    args: ["--schema", ".code", prompt],
    stdout: "piped",
    stderr: "piped",
  });
  
  const { code, stdout, stderr } = await command.output();
  
  if (code !== 0) {
    const errorText = new TextDecoder().decode(stderr);
    throw new Error(`LLM command failed: ${errorText}`);
  }
  
  return new TextDecoder().decode(stdout).trim();
}

async function updateMarkdownFile(markdownFile: string, targetIndex: number, newCode: string) {
  const markdownPath = `${markdownFile}.md`;
  
  try {
    const content = await Deno.readTextFile(markdownPath);
    const pipeDir = std.join(PD_DIR, markdownFile);
    const indexJsonPath = std.join(pipeDir, "index.json");
    const pipeData = JSON.parse(await Deno.readTextFile(indexJsonPath));
    
    const targetStep = pipeData.steps[targetIndex];
    const [startLine, endLine] = targetStep.range;
    
    const lines = content.split('\n');
    
    // Find the code block boundaries
    let codeBlockStart = -1;
    let codeBlockEnd = -1;
    let currentLine = 0;
    
    for (let i = 0; i < lines.length; i++) {
      if (currentLine >= startLine && lines[i].startsWith('```')) {
        if (codeBlockStart === -1) {
          codeBlockStart = i;
        } else {
          codeBlockEnd = i;
          break;
        }
      }
      if (currentLine >= endLine) break;
      currentLine++;
    }
    
    if (codeBlockStart === -1 || codeBlockEnd === -1) {
      throw new Error("Could not find code block boundaries in markdown file");
    }
    
    // Replace the code content
    const beforeCode = lines.slice(0, codeBlockStart + 1);
    const afterCode = lines.slice(codeBlockEnd);
    const newContent = [
      ...beforeCode,
      newCode,
      ...afterCode
    ].join('\n');
    
    await Deno.writeTextFile(markdownPath, newContent);
    console.log(std.colors.brightGreen(`✓ Updated codeblock in ${markdownPath}`));
    
  } catch (error) {
    throw new Error(`Failed to update markdown file: ${error.message}`);
  }
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
  const prompt = promptParts.join(' ');
  
  try {
    console.log(std.colors.brightBlue(`Loading context for ${markdownFile}...`));
    const steps = await loadPipeContext(markdownFile);
    
    console.log(std.colors.brightBlue(`Finding target step: ${target}...`));
    const { step: targetStep, index: targetIndex } = findTargetStep(steps, target);
    
    console.log(std.colors.brightBlue(`Calling LLM to improve: ${targetStep.name}...`));
    const contextPrompt = buildContextPrompt(steps, targetIndex, prompt);
    const improvedCode = await callLLM(contextPrompt);
    
    console.log(std.colors.brightBlue("Updating markdown file..."));
    await updateMarkdownFile(markdownFile, targetIndex, improvedCode);
    
    console.log(std.colors.brightGreen("✓ Successfully updated codeblock!"));
    
  } catch (error) {
    console.error(std.colors.brightRed(`Error: ${error.message}`));
    input.errors = input.errors || [];
    input.errors.push(error);
  }
  
  return input;
}
