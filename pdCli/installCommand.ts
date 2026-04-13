import type { CliInput } from "../pipedown.d.ts";
import { pd, std } from "../deps.ts";
import { readManifest } from "../packageManifest.ts";
import { cliHelpTemplate } from "../stringTemplates.ts";

const _PIPEDOWN_DIR = ".pipedown";
const PACKAGES_DIR = ".pipedown/packages";
const INSTALLED_JSON = ".pipedown/installed.json";

const helpText = cliHelpTemplate({
  title: "Install",
  command: "pd install <archive.tar.gz>",
  sections: [
    "Install a Pipedown package archive into the current project.",
    `The archive must contain a valid pipedown.json manifest.
    Packages are extracted to .pipedown/packages/{name}/ and automatically built.`,
    `Examples:
    pd install ./pd-assist-0.1.0.tar.gz       # Install from local archive
    pd install ~/packages/my-pipe-1.0.0.tar.gz # Install from absolute path
    pd install --list                          # List installed packages`,
  ],
});

interface InstalledPackage {
  version: string;
  installedAt: string;
  archivePath: string;
  packageDir: string;
  entry: string;
  exports?: Record<string, string>;
}

type InstalledRegistry = Record<string, InstalledPackage>;

async function readInstalled(projectDir: string): Promise<InstalledRegistry> {
  const installedPath = std.join(projectDir, INSTALLED_JSON);
  try {
    const raw = await Deno.readTextFile(installedPath);
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writeInstalled(
  projectDir: string,
  registry: InstalledRegistry,
): Promise<void> {
  const installedPath = std.join(projectDir, INSTALLED_JSON);
  await Deno.mkdir(std.dirname(installedPath), { recursive: true });
  await Deno.writeTextFile(
    installedPath,
    JSON.stringify(registry, null, 2) + "\n",
  );
}

export async function installCommand(input: CliInput) {
  if (pd.$p.get(input, "/flags/help") || pd.$p.get(input, "/flags/h")) {
    console.log(helpText);
    return input;
  }

  const projectDir = Deno.cwd();

  // --list: show installed packages
  if (input.flags.list) {
    const installed = await readInstalled(projectDir);
    const names = Object.keys(installed);
    if (names.length === 0) {
      console.log("No packages installed.");
    } else {
      console.log(std.colors.brightCyan("Installed packages:\n"));
      for (const name of names) {
        const pkg = installed[name];
        console.log(`  ${std.colors.brightGreen(name)}@${pkg.version}`);
        console.log(`    Installed: ${pkg.installedAt}`);
        console.log(`    Entry: ${pkg.entry}`);
        console.log(`    Dir: ${pkg.packageDir}`);
        console.log("");
      }
    }
    return input;
  }

  // Get archive path from positional args
  const archivePath = input.flags._[1] as string;
  if (!archivePath) {
    console.error(
      std.colors.red(
        "Error: missing archive path. Usage: pd install <archive.tar.gz>",
      ),
    );
    console.log(helpText);
    return input;
  }

  // Resolve to absolute path
  const absArchivePath = archivePath.startsWith("/")
    ? archivePath
    : std.join(projectDir, archivePath);

  // Verify archive exists
  try {
    await Deno.stat(absArchivePath);
  } catch {
    console.error(
      std.colors.red(`Error: archive not found: ${absArchivePath}`),
    );
    return input;
  }

  console.log(
    std.colors.brightCyan(`Installing from ${std.basename(absArchivePath)}...`),
  );

  // 1. Extract to a temp directory first, to read the manifest
  const tmpDir = await Deno.makeTempDir({ prefix: "pd-install-" });

  try {
    const extractCmd = new Deno.Command("tar", {
      args: ["xzf", absArchivePath],
      cwd: tmpDir,
      stdout: "piped",
      stderr: "piped",
    });

    const extractResult = await extractCmd.output();
    if (!extractResult.success) {
      const stderr = new TextDecoder().decode(extractResult.stderr);
      console.error(std.colors.red(`Error extracting archive: ${stderr}`));
      return input;
    }

    // 2. Read and validate the manifest from the extracted archive
    let manifest;
    try {
      manifest = await readManifest(tmpDir);
    } catch (e) {
      // Cast `e` from unknown to Error — Deno/TS strict mode types catch vars as unknown.
      // Ref: https://www.typescriptlang.org/tsconfig#useUnknownInCatchVariables
      console.error(std.colors.red(`Error: ${(e as Error).message}`));
      return input;
    }

    console.log(
      `  Found: ${std.colors.brightGreen(manifest.name)}@${manifest.version}`,
    );

    // 3. Move to the final package directory
    const packageDir = std.join(projectDir, PACKAGES_DIR, manifest.name);

    // Remove existing installation if present
    try {
      await Deno.remove(packageDir, { recursive: true });
    } catch {
      // doesn't exist yet — fine
    }

    // Create parent directory
    await Deno.mkdir(std.join(projectDir, PACKAGES_DIR), { recursive: true });

    // Move extracted contents to package directory
    await Deno.rename(tmpDir, packageDir);

    // 4. Run pd build on the installed package
    console.log("  Building...");

    const buildCmd = new Deno.Command("pd", {
      args: ["build"],
      cwd: packageDir,
      stdout: "piped",
      stderr: "piped",
    });

    const buildResult = await buildCmd.output();
    if (!buildResult.success) {
      const stderr = new TextDecoder().decode(buildResult.stderr);
      console.warn(
        std.colors.yellow(`  Warning: build had issues: ${stderr.trim()}`),
      );
      // Don't fail — the package is installed even if build has warnings
    }

    // 5. Record installation metadata
    const installed = await readInstalled(projectDir);
    installed[manifest.name] = {
      version: manifest.version,
      installedAt: new Date().toISOString(),
      archivePath: absArchivePath,
      packageDir: std.relative(projectDir, packageDir),
      entry: manifest.entry,
      exports: manifest.exports,
    };
    await writeInstalled(projectDir, installed);

    // 6. Report success
    console.log(
      std.colors.brightGreen(
        `\n✓ Installed ${manifest.name}@${manifest.version}`,
      ),
    );
    console.log(`  Package dir: ${std.relative(projectDir, packageDir)}`);
    console.log(`  Entry pipe: ${manifest.entry}`);
    console.log(
      `\n  Run with: ${
        std.colors.brightCyan(
          `pd run ${
            std.relative(projectDir, std.join(packageDir, manifest.entry))
          }`,
        )
      }`,
    );
  } finally {
    // Clean up temp dir if it still exists (move might have consumed it)
    try {
      await Deno.remove(tmpDir, { recursive: true });
    } catch {
      // already moved or cleaned up
    }
  }

  return input;
}
