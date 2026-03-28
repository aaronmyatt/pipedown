import type { CliInput } from "../pipedown.d.ts";
import { pd, std, md } from "../deps.ts";
import { PD_DIR } from "./helpers.ts";
import {Tag, TokenType} from "../rangeFinder.ts";

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

export async function loadPipeContext(markdownFile: string, projectPath?: string) {
  const baseDir = projectPath ? std.join(projectPath, ".pd") : PD_DIR;
  const pipeDir = std.join(baseDir, markdownFile);
  const indexJsonPath = std.join(pipeDir, "index.json");

  try {
    const pipeData = JSON.parse(await Deno.readTextFile(indexJsonPath));
    return pipeData.steps || [];
  } catch (error) {
    throw new Error(`Could not load pipe data for ${markdownFile}: ${error.message}`);
  }
}

export function findTargetStep(steps: any[], target: string) {
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

export function buildContextPrompt(steps: any[], targetIndex: number, userPrompt: string) {
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

export async function callLLM(prompt: string): Promise<string> {
  const command = new Deno.Command("llm", {
    args: ["-m", "claude-3.7-sonnet", "--schema", "code,", prompt],
    stdout: "piped",
    stderr: "piped",
  });
  
  const { code, stdout, stderr } = await command.output();
  console.log(std.colors.brightBlue(`LLM command executed with code: ${code}`));
  
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

    // Create markdown-it instance
    const markdownIt = new md.MarkdownIt();
    
    // Parse markdown content into tokens
    const tokens = markdownIt.parse(content, {});
    
    // Find the target codeblock token within the range
    let codeblockFound = false;
    for (let i = targetStep.range[0]; i < targetStep.range[1] && i < tokens.length; i++) {
      const token = tokens[i];
      if (token && token.type === 'fence' && token.content.trim() === targetStep.code.trim()) {
        // Update the codeblock content
        token.content = newCode;
        codeblockFound = true;
        break;
      }
    }
    
    if (!codeblockFound) {
      throw new Error(`Could not find the target codeblock in the specified range. Expected code:\n${targetStep.code}`);
    }

    
    // Convert tokens back to markdown using custom serializer
    const updatedContent = tokensToMarkdown(tokens);
    
    await Deno.writeTextFile(markdownPath, updatedContent);
    console.log(std.colors.brightGreen(`✓ Updated codeblock in ${markdownPath}`));
    
  } catch (error) {
    throw new Error(`Failed to update markdown file: ${error.message}`);
  }
}

// Custom function to convert tokens back to markdown
function tokensToMarkdown(tokens: any[]): string {
  let result = '';
  
  for (const token of tokens) {
    switch (token.type) {
      case 'heading_open':
        result += '#'.repeat(token.tag.slice(1)) + ' ';
        break;
      case 'heading_close':
        result += '\n\n';
        break;
      case 'paragraph_open':
        // No action needed
        break;
      case 'paragraph_close':
        result += '\n\n';
        break;
      case 'fence':
        result += '```' + (token.info || '') + '\n';
        result += token.content;
        if (!token.content.endsWith('\n')) result += '\n';
        result += '```\n\n';
        break;
      case 'code_inline':
        result += '`' + token.content + '`';
        break;
      case 'text':
        result += token.content;
        break;
      case 'softbreak':
        result += '\n';
        break;
      case 'hardbreak':
        result += '\n';
        break;
      case 'bullet_list_open':
        // No action needed
        break;
      case 'bullet_list_close':
        result += '\n';
        break;
      case 'list_item_open':
        result += '- ';
        break;
      case 'list_item_close':
        result += '\n';
        break;
      case 'strong_open':
        result += '**';
        break;
      case 'strong_close':
        result += '**';
        break;
      case 'em_open':
        result += '*';
        break;
      case 'em_close':
        result += '*';
        break;
      default:
        // For unhandled token types, try to preserve content if available
        if (token.content) {
          result += token.content;
        }
        break;
    }
  }
  
  return result.trim() + '\n';
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
