# Release

Publish a new version of pipedown (@pd/pdcli) to JSR. Validates the project, bumps the version, runs tests, and publishes.

```json
{
  "inputs": [
    { "_name": "patch", "bump": "patch" },
    { "_name": "minor", "bump": "minor" },
    { "_name": "major", "bump": "major" },
    { "_name": "dry-run", "bump": "patch", "dryRun": true }
  ]
}
```

## Read Current Version

Read the current version from deno.json and parse it into components.

```ts
const denoJsonPath = $p.get(opts, "/config/denoJsonPath") || "../deno.json";
const denoJson = JSON.parse(await Deno.readTextFile(denoJsonPath));

input.denoJsonPath = denoJsonPath;
input.denoJson = denoJson;
input.packageName = denoJson.name;
input.currentVersion = denoJson.version;

const parts = input.currentVersion.split(".").map(Number);
input.versionParts = { major: parts[0], minor: parts[1], patch: parts[2] };

console.log(input.packageName + " v" + input.currentVersion);
```

## Bump Version

Calculate the new version based on the bump type (patch, minor, major).

```ts
const bump = input.bump || "patch";
const v = input.versionParts;

if (bump === "major") {
  v.major += 1;
  v.minor = 0;
  v.patch = 0;
} else if (bump === "minor") {
  v.minor += 1;
  v.patch = 0;
} else {
  v.patch += 1;
}

input.newVersion = v.major + "." + v.minor + "." + v.patch;
console.log("Bump: " + input.currentVersion + " -> " + input.newVersion + " (" + bump + ")");
```

## Run Tests

Run the test suite to ensure everything passes before publishing.

```ts
import { dirname, join } from "jsr:@std/path@1.1.4";

console.log("Running tests...");

// Resolve test file paths relative to deno.json location
const projectDir = dirname(input.denoJsonPath);
const testFiles = [
  "rangeFinder_test.ts",
  "mdToPipe_test.ts",
  "pipeToScript_test.ts",
  "pdBuild_test.ts",
].map(f => join(projectDir, f));

const testCmd = new Deno.Command(Deno.execPath(), {
  args: ["test", "-A", "--no-check", ...testFiles],
  stdout: "piped",
  stderr: "piped",
});

const testResult = await testCmd.output();
const testOutput = new TextDecoder().decode(testResult.stdout);
const testErr = new TextDecoder().decode(testResult.stderr);

if (testResult.code !== 0) {
  console.error("Tests failed:");
  console.error(testErr || testOutput);
  input.error = "Tests failed — aborting release";
  return;
}

// Extract pass/fail summary from last line
const summaryMatch = testOutput.match(/(\d+) passed.*?(\d+) failed/);
if (summaryMatch) {
  console.log("Tests: " + summaryMatch[1] + " passed, " + summaryMatch[2] + " failed");
} else {
  console.log("Tests passed");
}
```

## Check Git Status

Ensure the working tree is clean before publishing.

```ts
console.log("Checking git status...");

const gitCmd = new Deno.Command("git", {
  args: ["status", "--porcelain"],
  stdout: "piped",
});

const gitResult = await gitCmd.output();
const gitOutput = new TextDecoder().decode(gitResult.stdout).trim();

if (gitOutput.length > 0) {
  console.log("Uncommitted changes:");
  console.log(gitOutput);
  input.dirty = true;
  console.log("Warning: working tree is dirty. Use --allow-dirty for deno publish or commit first.");
} else {
  input.dirty = false;
  console.log("Working tree clean");
}
```

## Update deno.json

Write the new version to deno.json.

- not: /error
- not: /dryRun
- ```ts
  input.denoJson.version = input.newVersion;
  await Deno.writeTextFile(
    input.denoJsonPath,
    JSON.stringify(input.denoJson, null, 2) + "\n"
  );
  console.log("Updated " + input.denoJsonPath + " to v" + input.newVersion);
  ```

## Publish to JSR

Run deno publish to push the new version to JSR.

- not: /error
- ```ts
  console.log("Publishing " + input.packageName + "@" + input.newVersion + " to JSR...");

  const publishArgs = ["publish", "--no-check"];
  if (input.dryRun) {
    publishArgs.push("--dry-run");
    console.log("(dry run — no actual publish)");
  }
  if (input.dirty) {
    publishArgs.push("--allow-dirty");
  }
  publishArgs.push("--config", input.denoJsonPath);

  const publishCmd = new Deno.Command(Deno.execPath(), {
    args: publishArgs,
    stdout: "inherit",
    stderr: "inherit",
  });

  const publishResult = await publishCmd.output();

  if (publishResult.code !== 0) {
    input.error = "Publish failed with exit code " + publishResult.code;
    // Revert version if publish failed and we're not in dry-run
    if (!input.dryRun) {
      input.denoJson.version = input.currentVersion;
      await Deno.writeTextFile(
        input.denoJsonPath,
        JSON.stringify(input.denoJson, null, 2) + "\n"
      );
      console.error("Reverted deno.json to v" + input.currentVersion);
    }
    return;
  }

  console.log("Published " + input.packageName + "@" + input.newVersion);
  ```

## Git Tag

Create a git tag for the new version and commit the version bump.

- not: /error
- not: /dryRun
- ```ts
  const commitMsg = "release: " + input.packageName + "@" + input.newVersion;

  // Stage and commit the version bump
  const addCmd = new Deno.Command("git", {
    args: ["add", input.denoJsonPath],
    stdout: "piped",
  });
  await addCmd.output();

  const commitCmd = new Deno.Command("git", {
    args: ["commit", "-m", commitMsg],
    stdout: "piped",
    stderr: "piped",
  });
  const commitResult = await commitCmd.output();

  if (commitResult.code === 0) {
    console.log("Committed: " + commitMsg);
  }

  // Create tag
  const tag = "v" + input.newVersion;
  const tagCmd = new Deno.Command("git", {
    args: ["tag", tag],
    stdout: "piped",
    stderr: "piped",
  });
  const tagResult = await tagCmd.output();

  if (tagResult.code === 0) {
    console.log("Tagged: " + tag);
    console.log("Run 'git push && git push --tags' to push the release");
  } else {
    console.log("Tag creation failed (tag may already exist)");
  }
  ```

## Summary

Print a summary of what happened.

```ts
console.log("");
console.log("=== Release Summary ===");
console.log("Package: " + input.packageName);
console.log("Version: " + input.currentVersion + " -> " + (input.dryRun ? input.newVersion + " (dry run)" : input.newVersion));
if (input.error) {
  console.log("Status: FAILED — " + input.error);
} else if (input.dryRun) {
  console.log("Status: DRY RUN (no changes made)");
} else {
  console.log("Status: SUCCESS");
}
```
