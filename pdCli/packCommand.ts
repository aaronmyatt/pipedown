import type { CliInput } from "../pipedown.d.ts";
import { pd, std } from "../deps.ts";
import { readManifest, resolvePackageFiles } from "../packageManifest.ts";
import { cliHelpTemplate } from "../stringTemplates.ts";

const helpText = cliHelpTemplate({
  title: "Pack",
  command: "pd pack",
  sections: [
    "Create a package archive (.tar.gz) from a Pipedown project.",
    `The project must have a pipedown.json manifest with at least:
    { "name": "...", "version": "...", "entry": "..." }`,
    `Examples:
    pd pack                  # Pack current directory
    pd pack --out ./dist/    # Pack to a specific output directory
    pd pack --dry-run        # List files without creating archive`,
  ],
});

export async function packCommand(input: CliInput) {
  if (pd.$p.get(input, "/flags/help") || pd.$p.get(input, "/flags/h")) {
    console.log(helpText);
    return input;
  }

  const projectDir = Deno.cwd();
  const dryRun = !!input.flags["dry-run"];

  // 1. Read and validate manifest
  let manifest;
  try {
    manifest = await readManifest(projectDir);
  } catch (e) {
    console.error(std.colors.red(`Error: ${e.message}`));
    return input;
  }

  console.log(
    std.colors.brightCyan(
      `Packing ${manifest.name}@${manifest.version}...`,
    ),
  );

  // 2. Resolve file list
  let files;
  try {
    files = await resolvePackageFiles(projectDir, manifest);
  } catch (e) {
    console.error(std.colors.red(`Error: ${e.message}`));
    return input;
  }

  // Convert to relative paths for display and tar
  const relativeFiles = files.map((f) => std.relative(projectDir, f));

  // 3. Display file list
  console.log(std.colors.brightGreen(`\nFiles to include (${relativeFiles.length}):`));
  for (const file of relativeFiles) {
    console.log(`  ${file}`);
  }

  if (dryRun) {
    console.log(std.colors.yellow("\n--dry-run: no archive created."));
    return input;
  }

  // 4. Create tar.gz archive
  const archiveName = `${manifest.name}-${manifest.version}.tar.gz`;
  const outDir = (input.flags.out as string) || projectDir;
  const archivePath = std.join(outDir, archiveName);

  // Ensure output directory exists
  try {
    await Deno.mkdir(outDir, { recursive: true });
  } catch (e) {
    if (!(e instanceof Deno.errors.AlreadyExists)) {
      console.error(std.colors.red(`Error creating output directory: ${e.message}`));
      return input;
    }
  }

  // Use system tar command (universally available on macOS/Linux)
  const tarArgs = ["czf", archivePath, ...relativeFiles];
  const tarCmd = new Deno.Command("tar", {
    args: tarArgs,
    cwd: projectDir,
    stdout: "piped",
    stderr: "piped",
  });

  const tarResult = await tarCmd.output();
  if (!tarResult.success) {
    const stderr = new TextDecoder().decode(tarResult.stderr);
    console.error(std.colors.red(`Error creating archive: ${stderr}`));
    return input;
  }

  // 5. Report result
  const stat = await Deno.stat(archivePath);
  const sizeKB = (stat.size / 1024).toFixed(1);

  console.log(std.colors.brightGreen(`\n✓ Created ${archiveName} (${sizeKB} KB)`));
  console.log(`  ${archivePath}`);

  return input;
}
