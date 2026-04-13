/**
 * Package manifest (pipedown.json) — reading, validation, and types.
 */
import { std } from "./deps.ts";

/** The shape of a pipedown.json package manifest. */
export interface PackageManifest {
  /** Package name (lowercase, hyphens allowed, no spaces). */
  name: string;
  /** Semantic version string. */
  version: string;
  /** Short description of the package. */
  description?: string;
  /** Path to the primary markdown entry file (relative to project root). */
  entry: string;
  /** Author name or email. */
  author?: string;
  /** SPDX license identifier. */
  license?: string;
  /** Homepage URL. */
  homepage?: string;
  /** Keywords for discovery. */
  keywords?: string[];
  /** Named export wrappers (e.g., { cli: "templates/cli.ts" }). */
  exports?: Record<string, string>;
  /** Minimum Pipedown CLI version required. */
  pipedownVersion?: string;
  /** Package format schema version. */
  packageFormat?: number;
}

export interface ManifestValidationResult {
  valid: boolean;
  errors: string[];
  manifest?: PackageManifest;
}

const NAME_PATTERN = /^[a-z][a-z0-9-]*$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?(\+[a-zA-Z0-9.]+)?$/;

/**
 * Validate a parsed manifest object.
 * Returns errors for any missing or invalid fields.
 */
export function validateManifest(
  data: Record<string, unknown>,
  _projectDir?: string,
): ManifestValidationResult {
  const errors: string[] = [];

  // Required: name
  if (!data.name || typeof data.name !== "string") {
    errors.push("'name' is required and must be a string");
  } else if (!NAME_PATTERN.test(data.name)) {
    errors.push(
      `'name' must be lowercase, start with a letter, and contain only letters, numbers, and hyphens (got: "${data.name}")`,
    );
  }

  // Required: version
  if (!data.version || typeof data.version !== "string") {
    errors.push("'version' is required and must be a string");
  } else if (!SEMVER_PATTERN.test(data.version)) {
    errors.push(
      `'version' must be valid semver (got: "${data.version}")`,
    );
  }

  // Required: entry
  if (!data.entry || typeof data.entry !== "string") {
    errors.push("'entry' is required and must be a path to a .md file");
  } else if (!data.entry.endsWith(".md")) {
    errors.push(`'entry' must point to a .md file (got: "${data.entry}")`);
  }

  // Optional: exports (if present, must be a record of string → string)
  if (data.exports !== undefined) {
    if (
      typeof data.exports !== "object" || data.exports === null ||
      Array.isArray(data.exports)
    ) {
      errors.push("'exports' must be an object mapping names to file paths");
    }
  }

  // Optional: keywords (if present, must be array of strings)
  if (data.keywords !== undefined) {
    if (
      !Array.isArray(data.keywords) ||
      !data.keywords.every((k: unknown) => typeof k === "string")
    ) {
      errors.push("'keywords' must be an array of strings");
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    manifest: data as unknown as PackageManifest,
  };
}

/**
 * Read and validate pipedown.json from a directory.
 * Returns the validated manifest or throws with clear error messages.
 */
export async function readManifest(dir: string): Promise<PackageManifest> {
  const manifestPath = std.join(dir, "pipedown.json");

  let raw: string;
  try {
    raw = await Deno.readTextFile(manifestPath);
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) {
      throw new Error(
        `No pipedown.json found in ${dir}. Create one with at least: { "name": "...", "version": "...", "entry": "..." }`,
      );
    }
    throw e;
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`pipedown.json in ${dir} is not valid JSON`);
  }

  const result = validateManifest(data, dir);
  if (!result.valid) {
    throw new Error(
      `Invalid pipedown.json:\n  - ${result.errors.join("\n  - ")}`,
    );
  }

  return result.manifest!;
}

/**
 * Resolve which files should be included in a package archive.
 * Returns absolute paths.
 */
export async function resolvePackageFiles(
  dir: string,
  manifest: PackageManifest,
): Promise<string[]> {
  const files: string[] = [];
  const abs = (rel: string) => std.join(dir, rel);

  // Always include pipedown.json
  files.push(abs("pipedown.json"));

  // Always include entry markdown file
  const entryPath = abs(manifest.entry);
  try {
    await Deno.stat(entryPath);
    files.push(entryPath);
  } catch {
    throw new Error(`Entry file not found: ${manifest.entry}`);
  }

  // Include README.md if it exists
  const readmePath = abs("README.md");
  if (await std.exists(readmePath)) {
    files.push(readmePath);
  }

  // Include config.json if it exists
  const configPath = abs("config.json");
  if (await std.exists(configPath)) {
    files.push(configPath);
  }

  // Include templates/ directory contents
  const templatesDir = abs("templates");
  if (await std.exists(templatesDir)) {
    for await (const entry of Deno.readDir(templatesDir)) {
      if (entry.isFile) {
        files.push(std.join(templatesDir, entry.name));
      }
    }
  }

  // Include exports if declared
  if (manifest.exports) {
    for (const [_name, filePath] of Object.entries(manifest.exports)) {
      const exportPath = abs(filePath);
      if (await std.exists(exportPath)) {
        // Only add if not already included (e.g., if it's in templates/)
        if (!files.includes(exportPath)) {
          files.push(exportPath);
        }
      }
    }
  }

  // Include .cassettes/ directory if it exists
  const cassettesDir = abs(".cassettes");
  if (await std.exists(cassettesDir)) {
    for await (const entry of std.walk(cassettesDir, { includeDirs: false })) {
      files.push(entry.path);
    }
  }

  // Include additional .md files in the root (multi-pipe support later)
  for await (const entry of Deno.readDir(dir)) {
    if (
      entry.isFile &&
      entry.name.endsWith(".md") &&
      entry.name !== "README.md" &&
      entry.name !== manifest.entry
    ) {
      const mdPath = abs(entry.name);
      if (!files.includes(mdPath)) {
        files.push(mdPath);
      }
    }
  }

  // Include examples/ directory if it exists
  const examplesDir = abs("examples");
  if (await std.exists(examplesDir)) {
    for await (const entry of std.walk(examplesDir, { includeDirs: false })) {
      files.push(entry.path);
    }
  }

  return files;
}

/**
 * Resolve esbuild build artifacts from the .pd/ directory for inclusion
 * in a package archive. Collects compiled JS bundles (index.{format}.js)
 * and generated TypeScript entry points (index.ts) — the distributable
 * outputs of `pd build` when pipes declare a `build: []` config.
 *
 * Deliberately excludes build-time metadata (index.json, index.md),
 * the project-specific import map (deno.json), REPL helpers (replEval.ts),
 * and generated template wrappers (cli.ts, server.ts, etc.).
 *
 * Ref: esbuild output naming convention in exportPipe.ts —
 *   outfile: `index.${format}.js` (e.g., index.esm.js, index.cjs.js)
 * Ref: https://esbuild.github.io/api/#outfile
 *
 * @param dir - Absolute path to the project root directory
 * @returns Array of absolute paths to build artifacts in .pd/
 */
export async function resolveBuildArtifacts(
  dir: string,
): Promise<string[]> {
  const files: string[] = [];
  const pdDir = std.join(dir, ".pd");

  // If .pd/ doesn't exist, no build has been run — return empty.
  if (!await std.exists(pdDir)) return files;

  // Walk .pd/ looking for compiled JS bundles and generated TS entry points.
  // The regex matches esbuild output like index.esm.js, index.cjs.js, index.iife.js.
  // Ref: https://jsr.io/@std/fs/doc/walk/~
  for await (const entry of std.walk(pdDir, { includeDirs: false })) {
    const name = std.basename(entry.path);

    // Compiled JS bundles from esbuild (index.esm.js, index.cjs.js, etc.)
    if (/^index\.\w+\.js$/.test(name)) {
      files.push(entry.path);
    }

    // Generated TypeScript entry point — useful for Deno consumers
    // who can import directly without needing the bundled output.
    if (name === "index.ts") {
      files.push(entry.path);
    }
  }

  return files;
}
