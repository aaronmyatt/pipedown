import pipe from "./index.ts"
import {parseArgs} from "jsr:@std/cli@1.0.28";
import $p from "jsr:@pd/pointers@0.1.1";

const flags = parseArgs(Deno.args);
const input = JSON.parse(flags.input || flags.i || '{}');
$p.set(input, "/flags", flags);
$p.set(input, "/mode/cli", true);

const output = await pipe.process(input)

if(flags.json || flags.j) {
  console.log(JSON.stringify(output));
} else {
 console.log(output);
}
Deno.exit(0);
