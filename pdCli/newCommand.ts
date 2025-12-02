import type { CliInput } from "../pipedown.d.ts";
import { pd, std } from "../deps.ts";
import { cliHelpTemplate, pdNewScriptTemplate, pdNewServerMdTemplate, pdNewCliMdTemplate, pdNewCleanTemplate, pdNewWrapperTemplate, pdServerTemplate, pdCliTemplate } from "../stringTemplates.ts";

const helpText = cliHelpTemplate({
  title: "New",
  command: "pd new [options] <name>",
  sections: [
    "Create a new entry point file.",
    `Options:
    --type <type>    Type of entry point (script, server, cli). Default: script
    --clean          Create minimal entry point file with just default export configuration
    --template       Create a wrapper file that imports index.ts from the same directory
    -h, --help       Display this message.`,
    `Examples:
    pd new myPipe
    pd new --type server myServer
    pd new --type cli myCli
    pd new --clean myLib
    pd new --template myWrapper`,
  ],
});

const nameArg = pd.$p.compile("/flags/_/1");

type EntryPointType = "script" | "server" | "cli";

async function writeEntryPointFile(name: string, type: EntryPointType, clean: boolean): Promise<void> {
  const fileName = name.endsWith(".md") ? name : `${name}.md`;
  const baseName = name.replace(/\.md$/, "");
  
  let content: string;
  
  if (clean) {
    content = pdNewCleanTemplate(baseName);
  } else {
    switch (type) {
      case "server":
        content = pdNewServerMdTemplate(baseName);
        break;
      case "cli":
        content = pdNewCliMdTemplate(baseName);
        break;
      case "script":
      default:
        content = pdNewScriptTemplate(baseName);
        break;
    }
  }
  
  // Check if file already exists
  if (await std.exists(fileName)) {
    console.log(std.colors.brightYellow(`File ${fileName} already exists. Skipping.`));
    return;
  }
  
  await Deno.writeTextFile(fileName, content);
  console.log(std.colors.brightGreen(`Created ${fileName}`));
  
  // For server and cli types, also write the wrapper file if not clean
  if (!clean && (type === "server" || type === "cli")) {
    const wrapperFileName = type === "server" ? `${baseName}.server.ts` : `${baseName}.cli.ts`;
    const wrapperContent = type === "server" ? pdServerTemplate() : pdCliTemplate();
    
    if (await std.exists(wrapperFileName)) {
      console.log(std.colors.brightYellow(`File ${wrapperFileName} already exists. Skipping.`));
    } else {
      await Deno.writeTextFile(wrapperFileName, wrapperContent);
      console.log(std.colors.brightGreen(`Created ${wrapperFileName}`));
    }
  }
}

async function writeTemplateFile(name: string): Promise<void> {
  const fileName = name.endsWith(".ts") ? name : `${name}.ts`;
  
  // Check if file already exists
  if (await std.exists(fileName)) {
    console.log(std.colors.brightYellow(`File ${fileName} already exists. Skipping.`));
    return;
  }
  
  await Deno.writeTextFile(fileName, pdNewWrapperTemplate());
  console.log(std.colors.brightGreen(`Created ${fileName}`));
}

export async function newCommand(input: CliInput): Promise<CliInput> {
  if (pd.$p.get(input, "/flags/help") || pd.$p.get(input, "/flags/h")) {
    console.log(helpText);
    return input;
  }
  
  const name = nameArg.get(input) as string;
  
  if (!name) {
    console.log(std.colors.brightRed("Error: Please provide a name for the entry point."));
    console.log(helpText);
    return input;
  }
  
  const isClean = pd.$p.get(input, "/flags/clean") as boolean;
  const isTemplate = pd.$p.get(input, "/flags/template") as boolean;
  const typeArg = pd.$p.get(input, "/flags/type") as string | undefined;
  
  // Validate type argument
  const validTypes: EntryPointType[] = ["script", "server", "cli"];
  const type: EntryPointType = (typeArg && validTypes.includes(typeArg as EntryPointType)) 
    ? typeArg as EntryPointType 
    : "script";
  
  if (isTemplate) {
    await writeTemplateFile(name);
  } else {
    await writeEntryPointFile(name, type, isClean);
  }
  
  return input;
}
