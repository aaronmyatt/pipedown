import type { BuildInput, CliInput } from "../pipedown.d.ts";
import { pd, std } from "../deps.ts";
import {
  readManifest,
  resolveBuildArtifacts,
  resolvePackageFiles,
} from "../packageManifest.ts";
import { pdBuild } from "../pdBuild.ts";
import { cliHelpTemplate } from "../stringTemplates.ts";

const helpText = cliHelpTemplate({
  title: "Pack",
  command: "pd pack",
  sections: [
    "Create a package archive (.tar.gz) from a Pipedown project.",
    `The project must have a pipedown.json manifest with at least:
    { "name": "...", "version": "...", "entry": "..." }`,
    `Options:
    --build      Run pd build first and include compiled JS bundles
    --out <path> Output directory for archive (default: current dir)
    --dry-run    List files without creating archive`,
    `Examples:
    pd pack                  # Pack current directory
    pd pack --build          # Build + pack with JS bundles
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
  const shouldBuild = !!input.flags["build"];

  // ── 1. Read and validate manifest ──
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

  // ── 2. Run pd build if --build flag is set ──
  // pdBuild parses markdown files, generates TypeScript, and runs esbuild
  // for any pipe that declares a `build: []` config. This is idempotent —
  // output lands in .pd/ which is gitignored.
  // Ref: pdBuild.ts — the full build pipeline (parse → generate → esbuild)
  if (shouldBuild) {
    console.log(std.colors.brightCyan("  Running build..."));

    // Construct a BuildInput from the existing CliInput.
    // pdBuild expects the full BuildInput shape but only needs a few
    // fields from CliInput — the rest are initialised internally.
    // Ref: pipedown.d.ts — BuildInput extends CliInput
    const buildInput: BuildInput = {
      ...input,
      importMap: { imports: {}, lint: { include: [], exclude: [] } },
      pipes: [],
    };

    const buildResult = await pdBuild(buildInput);

    // esbuild errors are collected in `warning` rather than thrown —
    // see exportPipe.ts line 40-41. Surface them but don't abort,
    // matching the lenient behaviour in installCommand.ts.
    if (buildResult.warning?.length) {
      for (const w of buildResult.warning) {
        console.warn(std.colors.yellow(`  Build warning: ${w}`));
      }
    }
    if (buildResult.errors?.length) {
      for (const e of buildResult.errors) {
        console.warn(std.colors.yellow(`  Build error: ${e.message || e}`));
      }
    }

    console.log(std.colors.brightCyan("  Build complete."));
  }

  // ── 3. Resolve source file list ──
  let files;
  try {
    files = await resolvePackageFiles(projectDir, manifest);
  } catch (e) {
    console.error(std.colors.red(`Error: ${e.message}`));
    return input;
  }

  // Convert to relative paths for display and tar
  const relativeFiles = files.map((f) => std.relative(projectDir, f));

  // ── 4. Resolve build artifacts if --build was used ──
  // Collects compiled JS bundles (index.esm.js, etc.) and generated
  // TypeScript entry points (index.ts) from .pd/.
  // Ref: packageManifest.ts — resolveBuildArtifacts()
  let relativeBuildFiles: string[] = [];
  if (shouldBuild) {
    const buildFiles = await resolveBuildArtifacts(projectDir);
    relativeBuildFiles = buildFiles.map((f) => std.relative(projectDir, f));
  }

  // ── 5. Display file list ──
  console.log(
    std.colors.brightGreen(`\nSource files (${relativeFiles.length}):`),
  );
  for (const file of relativeFiles) {
    console.log(`  ${file}`);
  }

  if (relativeBuildFiles.length > 0) {
    console.log(
      std.colors.brightGreen(
        `\nBuild artifacts (${relativeBuildFiles.length}):`,
      ),
    );
    for (const file of relativeBuildFiles) {
      console.log(`  ${file}`);
    }
  } else if (shouldBuild) {
    console.log(
      std.colors.yellow(
        "\n  No build artifacts found — do your pipes declare a build config?",
      ),
    );
  }

  if (dryRun) {
    console.log(std.colors.yellow("\n--dry-run: no archive created."));
    return input;
  }

  // ── 6. Create tar.gz archive ──
  const allFiles = [...relativeFiles, ...relativeBuildFiles];
  const archiveName = `${manifest.name}-${manifest.version}.tar.gz`;
  const outDir = (input.flags.out as string) || projectDir;
  const archivePath = std.join(outDir, archiveName);

  // Ensure output directory exists
  try {
    await Deno.mkdir(outDir, { recursive: true });
  } catch (e) {
    if (!(e instanceof Deno.errors.AlreadyExists)) {
      console.error(
        std.colors.red(`Error creating output directory: ${e.message}`),
      );
      return input;
    }
  }

  // Use system tar command (universally available on macOS/Linux)
  // Ref: https://man7.org/linux/man-pages/man1/tar.1.html
  const tarArgs = ["czf", archivePath, ...allFiles];
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

  // ── 7. Report result ──
  const stat = await Deno.stat(archivePath);
  const sizeKB = (stat.size / 1024).toFixed(1);

  console.log(
    std.colors.brightGreen(`\n✓ Created ${archiveName} (${sizeKB} KB)`),
  );
  console.log(`  ${archivePath}`);

  return input;
}
