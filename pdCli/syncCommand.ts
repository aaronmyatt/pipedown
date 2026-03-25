import type { CliInput } from "../pipedown.d.ts";
import { pd, std } from "../deps.ts";
import { PD_DIR } from "./helpers.ts";
import { pdBuild } from "../pdBuild.ts";
import { pipeToMarkdown } from "../pipeToMarkdown.ts";
import { cliHelpTemplate } from "../stringTemplates.ts";

const helpText = cliHelpTemplate({
  title: "Sync",
  command: "pd sync <pipeName>",
  sections: [
    "Sync changes from .pd/{pipeName}/index.json back to the source markdown file.",
    `Examples:
    pd sync myPipe           # Read .pd/myPipe/index.json, regenerate myPipe.md
    pd sync myPipe --dry-run # Preview the generated markdown without writing`,
  ],
});

export async function syncCommand(input: CliInput) {
  if (pd.$p.get(input, "/flags/help") || pd.$p.get(input, "/flags/h")) {
    console.log(helpText);
    return input;
  }

  const pipeName = input.flags._[1] as string;
  if (!pipeName) {
    console.error("Error: missing pipe name argument");
    console.log(helpText);
    return input;
  }

  const indexJsonPath = std.join(PD_DIR, pipeName, "index.json");

  try {
    const pipeData = JSON.parse(await Deno.readTextFile(indexJsonPath));
    const markdown = pipeToMarkdown(pipeData);

    if (input.flags["dry-run"]) {
      console.log(markdown);
      return input;
    }

    const mdPath = pipeData.mdPath;
    if (!mdPath) {
      console.error("Error: pipe has no mdPath — cannot determine source file location");
      return input;
    }

    await Deno.writeTextFile(mdPath, markdown);
    console.log(`Synced ${indexJsonPath} → ${mdPath}`);
  } catch (e) {
    console.error(`Error: ${e.message}`);
    input.errors = input.errors || [];
    input.errors.push(e);
  }

  return input;
}
