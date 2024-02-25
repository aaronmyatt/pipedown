import { pdBuild } from "../pdBuild.ts";
import {
  PD_DIR,
} from "./helpers.ts";
import type { pdCliInput } from "./mod.ts";

export async function testCommand(input: pdCliInput) {
  await pdBuild(input);

  const args = ["test", "-A", `--config=${PD_DIR}/deno.json`, "--no-check"];
  if (input.flags["--"].length > 0) {
    args.push("--");
    args.push(...input.flags["--"]);
  }
  const test = new Deno.Command(Deno.execPath(), {
    args,
    stdout: "piped",
    stderr: "piped",
  });

  const decoder = new TextDecoder();
  const output = await test.output();
  const error = decoder.decode(output.stderr);
  const out = decoder.decode(output.stdout);
  if (out) {
    if (out.includes("Missing snapshot file")) {
      console.error("Re-running with '-- --update' to write snapshots");
      const test = new Deno.Command(Deno.execPath(), {
        args: [
          "test",
          "-A",
          `--config=${PD_DIR}/deno.json`,
          "--no-check",
          "--",
          "--update",
        ],
        stdout: "inherit",
        stderr: "inherit",
      });
      await test.output();
    } else {
      console.log(out);
    }
  }

  if (error) {
    console.error(error);
  }

  return input;
}
