import {pd, std} from "./deps.ts";
import * as templates from "./stringTemplates.ts";
import type {pdBuildInput} from "./pdBuild.ts";
import { PD_DIR } from "./pdCli/helpers.ts";

async function writeTests(input: pdBuildInput) {
  for (const pipe of (input.pipes || [])) {
    const testPath = std.join(pipe.dir, "test.ts");
    if (await std.exists(testPath)) continue;
    await Deno.writeTextFile(
      testPath,
      templates.denoTestFileTemplate(pipe.name),
    );
  }
  return input;
}

async function writeDenoImportMap(input: pdBuildInput) {
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
  await Deno.writeTextFile(
    std.join(PD_DIR, "deno.json"),
    JSON.stringify(input.importMap, null, 2),
  );
  return input;
}

async function writeReplEvalFile(input: pdBuildInput) {
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

const writeCliFile = async (input: pdBuildInput) => {
  for (const pipe of (input.pipes || [])) {
    const cliPath = std.join(pipe.dir, "cli.ts");
    if (await std.exists(cliPath)) continue;
    await Deno.writeTextFile(cliPath, templates.pdCliTemplate());
  }
};

const writeServerFile = async (input: pdBuildInput) => {
  for (const pipe of (input.pipes || [])) {
    const serverPath = std.join(pipe.dir, "server.ts");
    if (await std.exists(serverPath)) continue;
    await Deno.writeTextFile(serverPath, templates.pdServerTemplate());
  }
  return input;
};

const writeWorkerFile = async (input: pdBuildInput) => {
  for (const pipe of (input.pipes || [])) {
    const workerPath = std.join(pipe.dir, "worker.ts");
    if (await std.exists(workerPath)) continue;
    await Deno.writeTextFile(workerPath, templates.pdWorkerTemplate());
  }
  return input;
};

export async function defaultTemplateFiles(input: pdBuildInput){
  const funcs = [
    writeTests,
    writeDenoImportMap,
    writeReplEvalFile,
    writeCliFile,
    writeServerFile,
    writeWorkerFile,
  ]
  return await pd.process(funcs, input, {})
}
