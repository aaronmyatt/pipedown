import type { PDError, Pipe } from "../pipedown.d.ts";

export const commonArgs = ["--unstable-kv", "-A", "-c", ".pd/deno.json"];

export const PD_DIR = `./.pd`;

interface PdRunOptions {
  subcommand?: string;
  scriptName: string;
  testInput: string;
  entryPoint?: string;
  watch?: boolean;
  rawInput?: boolean;
  includeScriptArgs?: boolean;
  extraArgs?: string[];
}

export async function pdRun(options: PdRunOptions) {
  const {
    subcommand = "run",
    scriptName,
    testInput,
    entryPoint = "cli.ts",
    watch = false,
    rawInput = false,
    includeScriptArgs = true,
    extraArgs = [],
  } = options;

  const args: string[] = [subcommand, ...commonArgs];

  if (watch) args.push("--watch");
  args.push(...extraArgs);

  const pipeDir = `${PD_DIR}/${scriptName.replace(/\.md/, "")}`;
  args.push(`${pipeDir}/${entryPoint}`);

  if (rawInput) {
    args.push(testInput || "{}");
  } else {
    args.push("--input", testInput || "{}");
  }

  if (includeScriptArgs) {
    const scriptArgs = Deno.args.slice(
      Deno.args.findIndex((arg) => arg === "--") + 1,
    );
    args.push(...scriptArgs);
  }

  const command = new Deno.Command(Deno.execPath(), {
    args,
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
  });
  await command.output();
}

export function pdRunWith(
  wrapperName: string,
  scriptName: string,
  testInput: string,
) {
  return pdRun({ scriptName, testInput, entryPoint: `${wrapperName}.ts` });
}

/**
 * Launch a pipe as an HTTP server.
 *
 * @param scriptName - The pipe name (markdown filename without .md)
 * @param testInput - JSON string to pass as initial input
 * @param entryPoint - Template entry point: "server.ts" (production, default)
 *                     or "devServer.ts" (development with hot reload + tracing).
 *                     In dev mode the devServer handles its own file watching,
 *                     so Deno's --watch is only used for the production template.
 * Ref: templates/server.ts, templates/devServer.ts
 */
export function pdServe(
  scriptName: string,
  testInput: string,
  entryPoint = "server.ts",
) {
  // The devServer.ts template manages its own file watching and rebuilding
  // via Deno.watchFs, so we only enable Deno's --watch for the production
  // server template (which needs it to restart on .pd/ file changes).
  const useWatch = entryPoint === "server.ts";

  return pdRun({
    scriptName,
    testInput,
    entryPoint,
    watch: useWatch,
    rawInput: true,
    includeScriptArgs: false,
  });
}

export async function pdRepl() {
  const command = new Deno.Command(Deno.execPath(), {
    args: ["repl", ...commonArgs, "--eval-file=./.pd/replEval.ts"],
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
  });
  const process = command.spawn();
  await process.output();
}

interface ErrorObject {
  errors: Array<PDError>;
}
export function mergeErrors(input: ErrorObject, output: ErrorObject) {
  if (output.errors) {
    input.errors = input.errors || [];
    input.errors = input.errors.concat(output.errors);
  }
  return input;
}

export const objectEmpty = (obj: object) => {
  return Object.keys(obj).length === 0;
};

// ── Dependency-Aware Watch Path Resolution ──
// Reads a pipe's index.json and resolves the complete set of file paths
// that should trigger a rebuild — the pipe's own .md source plus any
// local file or inter-pipe dependencies declared in pipe.dependencies.
//
// Used by file watchers (devServer, watchCommand, interactiveRun,
// buildandserve) to focus their Deno.watchFs scope on only the files
// that can affect a given pipe, rather than watching all .md files.

/**
 * Read a pipe's index.json from its .pd directory.
 * Returns null if the file doesn't exist or can't be parsed.
 *
 * @param pipeDirOrName - Either an absolute .pd/<name> path, or a pipe name
 *                        (resolved relative to PD_DIR)
 * @returns The parsed Pipe object, or null on failure
 */
export async function readPipeJson(
  pipeDirOrName: string,
): Promise<Pipe | null> {
  // If it's just a name (no path separators), resolve against PD_DIR
  const dir = pipeDirOrName.includes("/")
    ? pipeDirOrName
    : `${PD_DIR}/${pipeDirOrName}`;
  try {
    const content = await Deno.readTextFile(`${dir}/index.json`);
    return JSON.parse(content) as Pipe;
  } catch {
    return null;
  }
}

/**
 * Resolve the full set of file paths that should be watched for a pipe.
 *
 * Includes:
 *   1. The pipe's own .md source file (pipe.mdPath)
 *   2. .md files of any pipedown pipes listed in pipe.dependencies.pipes
 *   3. Local files listed in pipe.dependencies.localFiles (resolved relative
 *      to the pipe's .md source directory)
 *
 * External packages are excluded — they don't live on the local filesystem.
 *
 * @param pipe - The pipe object (from index.json) with dependencies populated
 * @returns Array of absolute file paths to watch
 */
export async function resolvePipeWatchPaths(pipe: Pipe): Promise<string[]> {
  const paths = new Set<string>();

  // 1. Always watch the pipe's own markdown source
  if (pipe.mdPath) paths.add(pipe.mdPath);

  const deps = pipe.dependencies;
  if (!deps) return [...paths];

  // 2. Resolve dependent pipe names to their .md source paths by reading
  //    each dependent pipe's index.json.
  // Ref: pdBuild.ts resolveDependencies() populates these pipe names
  for (const depPipeName of deps.pipes) {
    const depPipe = await readPipeJson(depPipeName);
    if (depPipe?.mdPath) paths.add(depPipe.mdPath);
  }

  // 3. Resolve local file imports relative to the pipe's source directory.
  //    These are paths like "./helpers.ts" or "../shared/utils.ts" written
  //    by the user in step code.
  if (pipe.mdPath && deps.localFiles.length > 0) {
    // dirname() gives us the directory containing the .md file — local
    // imports in step code are relative to where the user writes the markdown.
    const mdDir = pipe.mdPath.replace(/\/[^/]+$/, "");
    for (const localFile of deps.localFiles) {
      // Simple path join — normalizes ../ segments
      const resolved = resolveRelativePath(mdDir, localFile);
      paths.add(resolved);
    }
  }

  return [...paths];
}

/**
 * Resolve a relative path against a base directory.
 * Handles ./ and ../ segments without importing @std/path/resolve.
 *
 * @param base     - Absolute directory path
 * @param relative - Relative path (e.g., "./foo.ts", "../bar.ts")
 * @returns Absolute resolved path
 */
function resolveRelativePath(base: string, relative: string): string {
  // Strip leading ./ from the relative path
  const cleaned = relative.replace(/^\.\//, "");
  const parts = base.split("/").concat(cleaned.split("/"));

  // Normalize by resolving .. segments
  const resolved: string[] = [];
  for (const part of parts) {
    if (part === "..") {
      resolved.pop();
    } else if (part !== "." && part !== "") {
      resolved.push(part);
    }
  }
  return "/" + resolved.join("/");
}
