import {pd, std} from "./deps.ts";
import * as templates from "./stringTemplates.ts";
import type { BuildInput } from "./pipedown.d.ts";
import { PD_DIR } from "./pdCli/helpers.ts";

async function writeDenoImportMap(input: BuildInput) {
  input.importMap = {
    imports: {
      "/": "./",
      "./": "./",
    },
    lint: {
      include: [
        ".pd/**/*.ts",
      ],
      exclude: [
        ".pd/**/*.json",
        ".pd/**/*.md",
      ],
    },
  };

  for await (const entry of std.walk("./.pd", { exts: [".ts"] })) {
    const dirName = std.dirname(entry.path).split("/").pop();
    const innerPath = std.dirname(entry.path).replace(/\.pd\//, "");
    if (entry.path.includes("index.ts")) {
      // regex for '.pd' at start of path
      const regex = new RegExp(`^\.pd`);
      const path = entry.path.replace(regex, ".");
      input.importMap.imports[`${dirName}`] = path;
      input.importMap.imports["/" + innerPath] = path;
    }
  }

  // Resolve installed packages under @pkg/ prefix
  try {
    const raw = await Deno.readTextFile(".pipedown/installed.json");
    const installed: Record<string, { entry: string; packageDir: string; exports?: Record<string, string> }> = JSON.parse(raw);

    for (const [pkgName, pkg] of Object.entries(installed)) {
      const pkgPdDir = std.join(pkg.packageDir, ".pd");
      const entryStem = std.basename(pkg.entry).replace(/\.md$/, "");

      // Collect all pipes built in this package
      const pipes: Array<{ name: string; path: string }> = [];
      try {
        for await (const e of std.walk(pkgPdDir, { exts: [".ts"] })) {
          if (!e.path.endsWith("index.ts")) continue;
          const name = std.dirname(e.path).split("/").pop()!;
          pipes.push({ name, path: "../" + e.path });
        }
      } catch {
        continue; // package .pd/ not found — not built yet, skip
      }

      // @pkg/{pkgName}/{pipeName} for each pipe in the package
      for (const pipe of pipes) {
        input.importMap.imports[`@pkg/${pkgName}/${pipe.name}`] = pipe.path;
      }

      // @pkg/{pkgName} shorthand for the entry pipe
      const entryPipe = pipes.find(p => p.name === entryStem)
        || pipes.find(p => p.name.toLowerCase() === entryStem.toLowerCase())
        || (pipes.length === 1 ? pipes[0] : null);
      if (entryPipe) {
        input.importMap.imports[`@pkg/${pkgName}`] = entryPipe.path;
      }
    }
  } catch {
    // No installed.json — no packages installed, skip
  }

  await Deno.writeTextFile(
    std.join(PD_DIR, "deno.json"),
    JSON.stringify({
      ...input.importMap,

      // extend .pd deno.json config with "nodeModulesDir": "auto"
      // nodeModulesDir: "auto"
    }, null, 2),
  );
  return input;
}

async function writeReplEvalFile(input: BuildInput) {
  const replEvalPath = std.join(PD_DIR, "replEval.ts");

  // assumes deno repl is run from .pd directory
  const importNames =
    (input.importMap ? Object.keys(input.importMap.imports) : [])
      .filter((key) => !key.includes("/"))
      .filter((key) => input.importMap?.imports[key].endsWith("index.ts"));

  await Deno.writeTextFile(
    replEvalPath,
    templates.denoReplEvalTemplate(importNames),
  );
}

export async function defaultTemplateFiles(input: BuildInput){
  const funcs = [
    writeDenoImportMap,
    writeReplEvalFile,
  ]
  return await pd.process(funcs, input, {})
}
