import { pd, std } from "./deps.ts";
import * as templates from "./stringTemplates.ts";
import type { BuildInput } from "./pipedown.d.ts";

// ── Path Resolution Helpers ──
// defaultTemplateFiles can be called for projects that are not the process
// cwd (e.g. dashboard/server initiated builds). We therefore resolve all IO
// paths from BuildInput.cwd when provided.
// Ref: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Logical_OR

/**
 * Resolve the project root directory for the current build.
 *
 * @param input - Build context; may provide cwd override
 * @returns Absolute project root path
 */
const resolveProjectRoot = (input: BuildInput): string =>
  input.cwd || Deno.cwd();

/**
 * Resolve the target .pd directory for the current build.
 *
 * @param input - Build context; used to resolve project root
 * @returns Absolute path to <project>/.pd
 */
const resolvePdDir = (input: BuildInput): string =>
  std.join(resolveProjectRoot(input), ".pd");

/**
 * Convert an absolute file path to a Deno import-map path relative to the
 * generated .pd/deno.json file (for example: "./report/index.ts").
 *
 * Import-map targets are resolved relative to the import map file location,
 * so we must compute paths from .pd/, not from the project root.
 * Ref: https://docs.deno.com/runtime/fundamentals/modules/import_maps/
 *
 * @param input - Build context containing cwd/project root
 * @param absolutePath - Absolute file path to convert
 * @returns Import-map relative path prefixed with "./"
 */
const toPdRelativeImportPath = (
  input: BuildInput,
  absolutePath: string,
): string => {
  const relative = std.relative(resolvePdDir(input), absolutePath);
  return `./${relative}`;
};

async function writeDenoImportMap(input: BuildInput) {
  input.importMap = {
    imports: {
      "/": "./",
      "./": "./",
      // Pointer library alias — used by replEval.ts so it doesn't hardcode a JSR version.
      // Ref: https://jsr.io/@pd/pointers
      "$p": "jsr:@pd/pointers@0.1.1",
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

  const pdDir = resolvePdDir(input);

  // Discover local pipe entrypoints under the target project's .pd directory.
  // We only map index.ts files so each pipe resolves to its canonical entry.
  // Ref: https://jsr.io/@std/fs/doc/~/walk
  for await (const entry of std.walk(pdDir, { exts: [".ts"] })) {
    if (!entry.path.endsWith("index.ts")) continue;

    const pipeDir = std.dirname(entry.path);
    const innerPath = std.relative(pdDir, pipeDir);
    const dirName = std.basename(pipeDir);
    const importPath = toPdRelativeImportPath(input, entry.path);

    input.importMap.imports[`${dirName}`] = importPath;
    input.importMap.imports["/" + innerPath] = importPath;
  }

  // Resolve installed packages under @pkg/ prefix.
  // installed.json is project-scoped, so resolve it from project root.
  // Ref: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse
  try {
    const installedJsonPath = std.join(
      resolveProjectRoot(input),
      ".pipedown",
      "installed.json",
    );
    const raw = await Deno.readTextFile(installedJsonPath);
    const installed: Record<
      string,
      { entry: string; packageDir: string; exports?: Record<string, string> }
    > = JSON.parse(raw);

    for (const [pkgName, pkg] of Object.entries(installed)) {
      const pkgPdDir = std.join(pkg.packageDir, ".pd");
      const entryStem = std.basename(pkg.entry).replace(/\.md$/, "");

      // Collect all pipes built in this package.
      const pipes: Array<{ name: string; path: string }> = [];
      try {
        for await (const e of std.walk(pkgPdDir, { exts: [".ts"] })) {
          if (!e.path.endsWith("index.ts")) continue;
          const name = std.basename(std.dirname(e.path));
          // Import paths in deno.json are resolved relative to the deno.json
          // location (.pd/). Use std.relative to keep cross-project builds
          // deterministic instead of relying on process cwd.
          // Ref: https://jsr.io/@std/path/doc/~/relative
          const relativeFromPd = std.relative(pdDir, e.path);
          pipes.push({ name, path: `./${relativeFromPd}` });
        }
      } catch {
        continue; // package .pd/ not found — not built yet, skip
      }

      // @pkg/{pkgName}/{pipeName} for each pipe in the package.
      for (const pipe of pipes) {
        input.importMap.imports[`@pkg/${pkgName}/${pipe.name}`] = pipe.path;
      }

      // @pkg/{pkgName} shorthand for the entry pipe.
      const entryPipe = pipes.find((p) => p.name === entryStem) ||
        pipes.find((p) => p.name.toLowerCase() === entryStem.toLowerCase()) ||
        (pipes.length === 1 ? pipes[0] : null);
      if (entryPipe) {
        input.importMap.imports[`@pkg/${pkgName}`] = entryPipe.path;
      }
    }
  } catch {
    // No installed.json — no packages installed, skip
  }

  await Deno.writeTextFile(
    std.join(pdDir, "deno.json"),
    JSON.stringify(
      {
        ...input.importMap,
        // extend .pd deno.json config with "nodeModulesDir": "auto"
        // nodeModulesDir: "auto"
      },
      null,
      2,
    ),
  );
  return input;
}

async function writeReplEvalFile(input: BuildInput) {
  const replEvalPath = std.join(resolvePdDir(input), "replEval.ts");

  // assumes deno repl is run from .pd directory
  const importNames =
    (input.importMap ? Object.keys(input.importMap.imports) : [])
      .filter((key) => !key.includes("/"))
      .filter((key) => input.importMap?.imports[key].endsWith("index.ts"));

  await Deno.writeTextFile(
    replEvalPath,
    templates.denoReplEvalTemplate(importNames),
  );

  return input;
}

export async function defaultTemplateFiles(input: BuildInput) {
  const funcs = [
    writeDenoImportMap,
    writeReplEvalFile,
  ];

  // pd.process() returns a derived object rather than mutating the original
  // argument by reference in all contexts. Merge explicitly so callers that
  // ignore the return value (for side-effect-only usage) still observe updated
  // importMap state on the original input object.
  // Ref: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/assign
  const output = await pd.process(funcs, input, {});
  Object.assign(input, output);
  return input;
}
