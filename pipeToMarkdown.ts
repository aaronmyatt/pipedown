import type { Pipe, Step, PipeConfig } from "./pipedown.d.ts";

/**
 * Converts a Pipe object back to markdown source.
 * Reconstructs the markdown from structured fields on the Pipe and Step objects.
 */
export function pipeToMarkdown(pipe: Pipe): string {
  const lines: string[] = [];

  // H1 heading
  lines.push(`# ${pipe.name}`);
  lines.push("");

  // Pipe-level description
  if (pipe.pipeDescription) {
    lines.push(pipe.pipeDescription);
    lines.push("");
  }

  // Schema block (if present)
  if (pipe.schema) {
    lines.push("```zod");
    lines.push(pipe.schema.trimEnd());
    lines.push("```");
    lines.push("");
  }

  // JSON config block (inputs and other meaningful config)
  const configBlock = buildConfigBlock(pipe.config);
  if (configBlock) {
    lines.push("```json");
    lines.push(configBlock);
    lines.push("```");
    lines.push("");
  }

  // Steps
  for (const step of pipe.steps) {
    renderStep(step, lines);
  }

  return lines.join("\n").trimEnd() + "\n";
}

function renderStep(step: Step, lines: string[]): void {
  const level = step.headingLevel || 2;
  const hashes = "#".repeat(level);

  // Heading
  lines.push(`${hashes} ${step.name}`);
  lines.push("");

  // Description
  if (step.description) {
    lines.push(step.description);
    lines.push("");
  }

  // Conditional directives
  if (step.inList && step.config) {
    const directives = buildDirectives(step.config);
    if (directives.length > 0) {
      for (const directive of directives) {
        lines.push(`- ${directive}`);
      }
    }
  }

  // Code block
  const lang = step.language || "ts";
  if (step.inList && step.config) {
    // Indented inside list
    lines.push(`- \`\`\`${lang}`);
    const codeLines = step.code.trimEnd().split("\n");
    for (const codeLine of codeLines) {
      lines.push(`  ${codeLine}`);
    }
    lines.push("  ```");
  } else {
    lines.push(`\`\`\`${lang}`);
    lines.push(step.code.trimEnd());
    lines.push("```");
  }
  lines.push("");
}

function buildDirectives(config: Step["config"]): string[] {
  const directives: string[] = [];
  if (!config) return directives;

  for (const check of config.checks || []) {
    // Skip flags checks (they have /flags/ prefix, handled separately)
    if (check.startsWith("/flags/")) continue;
    directives.push(`check: ${check}`);
  }

  for (const check of config.checks || []) {
    if (check.startsWith("/flags/")) {
      directives.push(`flags: ${check.replace("/flags", "")}`);
    }
  }

  for (const path of config.and || []) {
    directives.push(`and: ${path}`);
  }

  for (const path of config.not || []) {
    directives.push(`not: ${path}`);
  }

  for (const path of config.or || []) {
    directives.push(`or: ${path}`);
  }

  for (const route of config.routes || []) {
    directives.push(`route: ${route}`);
  }

  if (config.stop !== undefined) {
    directives.push("stop:");
  }

  if (config.only !== undefined) {
    directives.push("only:");
  }

  return directives;
}

function buildConfigBlock(config?: PipeConfig): string | null {
  if (!config) return null;

  // Extract only the user-meaningful config (not internal/system fields)
  const meaningful: Record<string, unknown> = {};

  if (config.inputs && config.inputs.length > 0) {
    meaningful.inputs = config.inputs;
  }

  if (config.build && config.build.length > 0) {
    meaningful.build = config.build;
  }

  // Include custom config keys (not internal ones)
  const internalKeys = new Set([
    "inputs", "build", "templates", "skip", "exclude",
    "checks", "or", "and", "not", "routes", "flags",
    "only", "stop", "name", "inGlobal",
  ]);
  for (const [key, value] of Object.entries(config)) {
    if (!internalKeys.has(key) && value !== undefined) {
      meaningful[key] = value;
    }
  }

  if (Object.keys(meaningful).length === 0) return null;

  return JSON.stringify(meaningful, null, 2);
}
