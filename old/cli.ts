import { pipe } from "./out/scripts/pipes-26.json.js";
import { parse } from "https://deno.land/std@0.202.0/flags/mod.ts";

const flags = parse(Deno.args);

const output = await pipe.process({ flags });

Deno.inspect(JSON.stringify(output, )
