import type { pdCliInput } from "./mod.ts";

// deno run -A $HOME/WebstormProjects/pipedown/pdCli/mod.ts build
// deno repl -A -c ./.pd/deno.json --eval-file=./.pd/replEval.ts

export async function replCommand(input: pdCliInput) {
    const command = new Deno.Command(Deno.execPath(), {
        args: [
            "repl",
            "-A",
            "-c",
            ".pd/deno.json",
            "--eval-file=./.pd/replEval.ts",
        ],
        stdout: "inherit",
        stderr: "inherit",
    });
  const process = command.spawn()
  await process.output();
  return input;
}
