#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env

// ── Trace Timestamp Migration ──
// Migrates all trace files under ~/.pipedown/traces/ from the old
// dash-mangled ISO filenames (e.g. `2026-04-02T06-08-07-353Z.json`)
// to Unix epoch millisecond filenames (e.g. `1743588527353.json`).
//
// Also patches the `timestamp` property inside each JSON file to be
// a proper ISO-8601 string if it isn't already.
//
// The old filename format replaced colons and dots with dashes for
// filesystem compatibility, but this broke lexicographic sorting and
// required a regex band-aid in the frontend to reconstruct the ISO string.
// Epoch-millis filenames sort correctly as both strings and numbers.
//
// Usage:
//   deno run --allow-read --allow-write --allow-env scripts/migrateTraceTimestamps.ts
//
// Safe to run multiple times — already-migrated files (numeric names) are skipped.
// Ref: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/getTime

import { walk, exists } from "https://deno.land/std@0.224.0/fs/mod.ts";
import { join } from "https://deno.land/std@0.224.0/path/mod.ts";

// ── Regex to reverse the old filename mangling ──
// Old format: `2026-04-02T06-08-07-353Z` → should become `2026-04-02T06:08:07.353Z`
// The backend replaced colons and dots with dashes via `timestamp.replace(/[:.]/g, "-")`.
// This regex captures the date+hour portion, then the minute, second, and
// millisecond groups that were separated by dashes instead of colons/dot.
// Ref: templates/trace.ts line 216 (old code)
const OLD_FILENAME_RE = /^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d+)Z$/;

/**
 * Converts an old dash-mangled timestamp string back to proper ISO-8601.
 *
 * @param name — filename stem (without `.json`), e.g. `2026-04-02T06-08-07-353Z`
 * @returns ISO string like `2026-04-02T06:08:07.353Z`, or null if not in old format
 */
function oldNameToISO(name: string): string | null {
  const m = OLD_FILENAME_RE.exec(name);
  if (!m) return null;
  // m[1] = "2026-04-02T06", m[2] = "08", m[3] = "07", m[4] = "353"
  return `${m[1]}:${m[2]}:${m[3]}.${m[4]}Z`;
}

async function main() {
  const home = Deno.env.get("HOME");
  if (!home) {
    console.error("Cannot determine HOME directory");
    Deno.exit(1);
  }

  const traceRoot = join(home, ".pipedown", "traces");
  if (!await exists(traceRoot)) {
    console.log("No traces directory found at", traceRoot);
    return;
  }

  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  for await (const entry of walk(traceRoot, { exts: [".json"] })) {
    const dir = entry.path.substring(0, entry.path.lastIndexOf("/"));
    const basename = entry.name.replace(".json", "");

    // ── Skip already-migrated files ──
    // If the filename is purely numeric, it's already an epoch-millis name.
    if (/^\d+$/.test(basename)) {
      skipped++;
      continue;
    }

    // ── Try to parse the old mangled filename ──
    const iso = oldNameToISO(basename);
    if (!iso) {
      console.warn(`  SKIP (unrecognised format): ${entry.path}`);
      skipped++;
      continue;
    }

    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) {
      console.warn(`  SKIP (invalid date): ${entry.path} → "${iso}"`);
      skipped++;
      continue;
    }

    const epochMs = d.getTime();

    try {
      // ── Patch the JSON contents ──
      // Ensure the `timestamp` field is a proper ISO string (it usually already
      // is, but some very old files might have the mangled version).
      const raw = await Deno.readTextFile(entry.path);
      const trace = JSON.parse(raw);

      // Normalise the timestamp property to proper ISO if it matches the old format
      if (typeof trace.timestamp === "string") {
        const fixed = oldNameToISO(trace.timestamp) || trace.timestamp;
        const check = new Date(fixed);
        if (!Number.isNaN(check.getTime())) {
          trace.timestamp = check.toISOString();
        }
      }

      // ── Write updated JSON to new filename ──
      const newPath = join(dir, `${epochMs}.json`);

      // Guard against overwriting an existing file (e.g. two traces in the
      // same millisecond, which is astronomically unlikely but worth checking).
      if (await exists(newPath)) {
        console.warn(`  SKIP (target exists): ${newPath}`);
        skipped++;
        continue;
      }

      await Deno.writeTextFile(newPath, JSON.stringify(trace, null, 2));
      await Deno.remove(entry.path);

      console.log(`  OK: ${basename}.json → ${epochMs}.json`);
      migrated++;
    } catch (err) {
      console.error(`  ERROR: ${entry.path} — ${err}`);
      errors++;
    }
  }

  console.log(`\nMigration complete: ${migrated} migrated, ${skipped} skipped, ${errors} errors`);
}

main();
