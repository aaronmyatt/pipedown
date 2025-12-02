import {pd, std} from "./deps.ts";
import * as templates from "./stringTemplates.ts";
import type { BuildInput } from "./pipedown.d.ts";
import { getProjectBuildDir, getProjectName } from "./pdCli/helpers.ts";

// Helper to escape special regex characters in a string
const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function writeTests(input: BuildInput) {
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

async function writeDenoImportMap(input: BuildInput) {
  const projectName = getProjectName(input.globalConfig);
  const buildDir = getProjectBuildDir(projectName);
  
  input.importMap = {
    imports: {
      "/": "./",
      "./": "./",
    },
    lint: {
      include: [
        `${buildDir}/**/*.ts`,
      ],
      exclude: [
        `${buildDir}/**/*.json`,
        `${buildDir}/**/*.md`,
      ],
    },
  };

  for await (const entry of std.walk(buildDir, { exts: [".ts"] })) {
    const dirName = std.dirname(entry.path).split("/").pop();
    const buildDirPattern = new RegExp(`^${escapeRegex(buildDir)}/?`);
    const innerPath = std.dirname(entry.path).replace(buildDirPattern, "");
    if (entry.path.includes("index.ts")) {
      const path = entry.path.replace(new RegExp(`^${escapeRegex(buildDir)}`), ".");
      input.importMap.imports[`${dirName}`] = path;
      if (innerPath) {
        input.importMap.imports["/" + innerPath] = path;
      }
    }
  }
  await Deno.writeTextFile(
    std.join(buildDir, "deno.json"),
    JSON.stringify(input.importMap, null, 2),
  );
  return input;
}

async function writeReplEvalFile(input: BuildInput) {
  const projectName = getProjectName(input.globalConfig);
  const buildDir = getProjectBuildDir(projectName);
  const replEvalPath = std.join(buildDir, "replEval.ts");

  // assumes deno repl is run from build directory
  const importNames =
    (input.importMap ? Object.keys(input.importMap.imports) : [])
      .filter((key) => !key.includes("/"))
      .filter((key) => input.importMap?.imports[key].endsWith("index.ts"));

  await Deno.writeTextFile(
    replEvalPath,
    templates.denoReplEvalTemplate(importNames),
  );
}

const writeCliFile = async (input: BuildInput) => {
  for (const pipe of (input.pipes || [])) {
    const cliPath = std.join(pipe.dir, "cli.ts");
    if (await std.exists(cliPath)) continue;
    await Deno.writeTextFile(cliPath, templates.pdCliTemplate());
  }
};

const writeServerFile = async (input: BuildInput) => {
  for (const pipe of (input.pipes || [])) {
    const serverPath = std.join(pipe.dir, "server.ts");
    if (await std.exists(serverPath)) continue;
    await Deno.writeTextFile(serverPath, templates.pdServerTemplate());
  }
  return input;
};

const writeWorkerFile = async (input: BuildInput) => {
  for (const pipe of (input.pipes || [])) {
    const workerPath = std.join(pipe.dir, "worker.ts");
    if (await std.exists(workerPath)) continue;
    await Deno.writeTextFile(workerPath, templates.pdWorkerTemplate());
  }
  return input;
};

export async function defaultTemplateFiles(input: BuildInput){
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
