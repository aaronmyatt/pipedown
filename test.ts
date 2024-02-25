import { mdToPipe } from "./mdToPipe.ts";
import { pipeToScript } from "./pipeToScript.ts";
import { scriptToEsmBundle } from "./scriptToEsmBundle.ts";

const __dirname = new URL(".", import.meta.url).pathname;
const markdown = await Deno.readTextFile(__dirname + "/test/dailyWallpaper.md");
const { pipe } = await mdToPipe({ markdown });
const { script } = await pipeToScript({ pipe });
const { bundle } = await scriptToEsmBundle({ script });
console.log(bundle);
