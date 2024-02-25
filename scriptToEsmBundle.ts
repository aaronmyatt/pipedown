import { process } from "./pdPipe.ts";
import * as esbuild from "https://deno.land/x/esbuild@v0.18.17/mod.js";
//import { httpImports } from "https://deno.land/x/esbuild_plugin_http_imports/index.ts";

const RESOLVE_DIR = Deno.env.get("RESOLVE_DIR") ||
  new URL(".", import.meta.url).pathname;

const buildConfig = (input: ScriptToEsmBundleInput) => {
  input.buildConfig = Object.assign({}, {
    bundle: true,
    stdin: {
      contents: input.script,
      resolveDir: RESOLVE_DIR,
    },
    format: "esm",
    write: false,
    treeShaking: true,
    // plugins: [httpImports()]
  }, input.buildConfig);
  return input;
};

const buildBundle = async (input: ScriptToEsmBundleInput) => {
  if (!input.buildConfig) input.buildConfig = {};
  const result = await esbuild.build(input.buildConfig);
  input.bundle = result.outputFiles && result.outputFiles[0].text;
  return input;
};

interface ScriptToEsmBundleInput {
    script: string;
    buildConfig?: esbuild.BuildOptions;
    bundle?: string;
}
export const scriptToEsmBundle = async (input: ScriptToEsmBundleInput) => {
  const funcs = [
    buildConfig,
    buildBundle,
    async (input: ScriptToEsmBundleInput) => {
      input.bundle && await Deno.writeTextFile(`esm.bundle.js`, input.bundle);
      return input;
    },
  ];

  const output = await process(funcs, input, { save: false });
  // if (Deno.env.get('DEBUG') || Deno.args.includes('--debug') || Deno.args.includes('-d') || Deno.args.includes('--DEBUG') || Deno.args.includes('-D')) {
  //     // keep tokens for debugging
  // } else {
  // }
  return output;
};

// if run as a script
if (import.meta.main) {
  // extract directory path from import.meta.url
  const __dirname = new URL(".", import.meta.url).pathname;
  const script =
    'import Pipeline from "./pipeline.js";\nimport {pipeProcessor} from "./pipeProcessor.js";\nimport {download} from "https://deno.land/x/download@v2.0.2/mod.ts";\nimport $ from "https://deno.land/x/dax@0.35.0/mod.ts";\nasync function callTheWikiMediaAPI (input) {\n            let today = new Date();\nlet year = today.getFullYear();\nlet month = String(today.getMonth() + 1).padStart(2, "0");\nlet day = String(today.getDate()).padStart(2, "0");\nlet url = `https://api.wikimedia.org/feed/v1/wikipedia/en/featured/${year}/${month}/${day}`;\n\nlet response = await fetch(url, {\n  headers: {\n    Authorization:\n      "Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJhdWQiOiI2NmZhNzliMDJiODdjNTkxMzZlNWJlMjZlNGEzNjI1OCIsImp0aSI6ImNkM2U0NzEwMjM3YjkyNWUyNjc1ZjE5ZTkzZDYzZmExMWE0M2RkMjdiNDk0YmUzODJmZmNhYWZlZDlmOWYzYjM1OTNiYTYwZTc2NjM2OGUzIiwiaWF0IjoxNjk3MzY2MDA3LjgyMDc5OCwibmJmIjoxNjk3MzY2MDA3LjgyMDgwMiwiZXhwIjozMzI1NDI3NDgwNy44MTc1MTYsInN1YiI6Ijc0MDA4Nzg4IiwiaXNzIjoiaHR0cHM6Ly9tZXRhLndpa2ltZWRpYS5vcmciLCJyYXRlbGltaXQiOnsicmVxdWVzdHNfcGVyX3VuaXQiOjUwMDAsInVuaXQiOiJIT1VSIn0sInNjb3BlcyI6WyJiYXNpYyJdfQ.mz7yGGz-FYMn0q3Akf16De2YZiZOFi2hZoB16Oif6AbV9jZ3cGYIujBO4H7Zx8jR487JOb-W1RmwSQm-Zk33aLFAV_l6sAgat04BqexrZPz7u46bVLpOH3z9FChpTkk_aXJKiqpHBi0_7c_IIXOMoGYqvkMTiySZUOY57ZXQb340y5ScPnQQqEfjOx3VKD3sOpNGQG9rNW9BF1YtcXGauKhwzmhwKqo3ZaWQG8dLdf3zD0xXiNttjhvZDIgyzVhz1opjdsQTSCtsAP-bja_ODxr97Jd1NmNB4M2EnndIUt2h48If6iztplHwdaWTQMCpro72bRoINYB7dgibeGeeD23u5bawJRe888MFgVannIw550LRzyGJPwrYme0FZvni2Zm0giK6CsmzVgTRDjIiuSc68t2mxQjsFFtg-NHIfvsz-v8E7ViQh3a_PtuVRVvtuqNc2ppqmpuATJ_z8qQabuYWbL9WQBG2JgKnuT3RKiuhwF6SriePnDaTwGANCT-sHU4Stk4sM91OMgDACI-SDLuAcVb3SVdEu306QZ67WLmpucvL8om-FyXi1BOSCVc3EKhF0HqmXgp8ld04glphg89WbAETP8tYM-SFKF0MvAXavnQexniIrqz5MYT4-t2PGKcKSwznXz0gi0862n6jpdIj-9MfvYYE_ckUf1bkKx8",\n    "Api-User-Agent": "Pipedown (aaronmyatt@gmail.com)",\n  },\n});\ninput.wikiJson = await response.json();\ninput.imageUrl = input.wikiJson[\'image\'][\'image\'][\'source\']\n\n        }\nasync function anonymous1 (input) {\n            \n\ntry {\n  input.imageFile = await download.download(input.imageUrl);\n} catch (err) {\n  input.error = err;\n}\n\n        }\nasync function setWallpaper (input) {\n            \ninput.osaout = await $`osascript -e \'tell application "System Events" to tell every desktop to set picture to "${input.imageFile.fullPath}"\'`.captureCombined();\n\n        }\nconst funcSequence = ["callTheWikiMediaAPI, anonymous1, setWallpaper"]\nconst pipe = new Pipeline(funcs);\nexport default pipe';
  const output = await scriptToEsmBundle({ script });
  console.log(JSON.stringify(output));
  // Deno.exit()
}
