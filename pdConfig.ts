import { std } from "./deps.ts";
import type { PipeConfig } from "./pipedown.d.ts";

/**
 * Read pipedown config from a directory.
 * Checks deno.json -> "pipedown" first, then layers config.json on top.
 */
export async function readPipedownConfig(dir: string): Promise<PipeConfig> {
  let base: PipeConfig = {};

  // 1. Try deno.json -> pipedown
  const denoJsonPath = std.join(dir, "deno.json");
  try {
    const raw = JSON.parse(await Deno.readTextFile(denoJsonPath));
    if (raw.pipedown && typeof raw.pipedown === "object") {
      base = raw.pipedown;
    }
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) throw e;
  }

  // 2. Layer config.json on top (override)
  const configJsonPath = std.join(dir, "config.json");
  try {
    const legacy = JSON.parse(await Deno.readTextFile(configJsonPath));
    Object.assign(base, legacy);
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) throw e;
  }

  return base;
}

/**
 * Write pipedown config to a directory.
 * Prefers writing into deno.json "pipedown" if deno.json exists,
 * otherwise falls back to config.json.
 */
export async function writePipedownConfig(
  dir: string,
  config: PipeConfig,
): Promise<void> {
  const denoJsonPath = std.join(dir, "deno.json");
  try {
    const raw = JSON.parse(await Deno.readTextFile(denoJsonPath));
    raw.pipedown = config;
    await Deno.writeTextFile(denoJsonPath, JSON.stringify(raw, null, 4));
    return;
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) throw e;
  }

  // Fallback: write config.json
  await Deno.writeTextFile(
    std.join(dir, "config.json"),
    JSON.stringify(config, null, 4),
  );
}

/**
 * Sync variant of readPipedownConfig, needed by templates/trace.ts.
 */
export function readPipedownConfigSync(dir: string): PipeConfig {
  let base: PipeConfig = {};

  const denoJsonPath = std.join(dir, "deno.json");
  try {
    const raw = JSON.parse(Deno.readTextFileSync(denoJsonPath));
    if (raw.pipedown && typeof raw.pipedown === "object") {
      base = raw.pipedown;
    }
  } catch { /* not found */ }

  try {
    const legacy = JSON.parse(
      Deno.readTextFileSync(std.join(dir, "config.json")),
    );
    Object.assign(base, legacy);
  } catch { /* not found */ }

  return base;
}
