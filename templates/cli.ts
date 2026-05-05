import pipe from "./index.ts";
import { parseArgs } from "jsr:@std/cli@1.0.28";
import $p from "jsr:@pd/pointers@0.1.1";

const flags = parseArgs(Deno.args);
const input = JSON.parse(flags.input || "{}");
$p.set(input, "/flags", flags);
$p.set(input, "/mode/cli", true);

const output = await pipe.process(input);

// Surface accumulated errors prominently to stderr and exit non-zero.
// Without this, errors get buried inside Deno's truncated console.log
// of the output object — which is especially confusing when a sub-pipe
// throws and the user only sees the entry pipe's input dump. The
// captured `err.stack` includes correctly source-mapped markdown lines
// for the entry pipe and any sub-pipes it invokes.
const errors = (output as {
  errors?: Array<{ stack?: string; message?: string }>;
}).errors || [];

for (const err of errors) {
  console.error(err.stack || err.message || String(err));
  console.error("");
}

if (flags.json || flags.j) {
  console.log(JSON.stringify(output));
} else {
  console.log(output);
}

Deno.exit(errors.length > 0 ? 1 : 0);
