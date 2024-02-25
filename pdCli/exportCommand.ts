import * as esbuild from "https://deno.land/x/esbuild@v0.19.2/mod.js";
// Import the WASM build on platforms where running subprocesses is not
// permitted, such as Deno Deploy, or when running without `--allow-run`.
// import * as esbuild from "https://deno.land/x/esbuild@v0.19.2/wasm.js";
import { denoPlugins } from "https://deno.land/x/esbuild_deno_loader@0.8.2/mod.ts";
import { basename } from "https://deno.land/std@0.206.0/path/basename.ts";
import { join } from "https://deno.land/std@0.206.0/path/join.ts";

export const exportCommand = async (input) => {
  // export pipe in various formats
  // target: browser, node, deno, webworker, webassembly
  // format: esm, cjs, iife, umd, amd, system, esnext
  // output: stdout, file, directory

  // either target one pipe or operate over all pipes within the
  // current project

  // check project config for any export settings
  // if none, use default settings

  const buildParams = {
    target: "es2020",
    format: "iife", // esm, iife, cjs
    platform: "browser",
    globalName: "pipe",
  };

  input.globalConfig = input.globalConfig || {};
  if (input.globalConfig.build) {
    Object.assign(buildParams, input.globalConfig.build);
  }

  const pipeName = input.flags._[1] || input.globalConfig.export.name;
  if(!pipeName) throw new Error('Designate one entry pipe name in your config.json')

  const basePath = (ext:"ts"|"js") => basename(pipeName, ".md") + "/index."+ext;
  const entryPoint = "./.pd/" + basePath("ts");
  const entryPoints = [entryPoint];
  const copy_to = input.flags.copy_to || input.globalConfig.export.copy_to

  buildParams.target = input.flags.target || buildParams.target;
  buildParams.format = input.flags.format || buildParams.format;
  buildParams.platform = input.flags.platform || buildParams.platform;

  const _result = await esbuild.build({
    // we assume the command is being run from the root of the project
    plugins: [...denoPlugins({ configPath: Deno.cwd() + "/.pd/deno.json" })],
    entryPoints: entryPoints,
    outdir: 'dist',
    outbase: '.pd',
    bundle: true,
    ...buildParams,
  });


  if(copy_to) await Deno.copyFile(join('./dist/', basePath("js")), copy_to);
  return {
   	exported: pipeName,
  	esbuild: _result,
  	copy_to
  }

};
// export as CLI command

// if called from the command line
// if (import.meta.main) {
//     // read command line args
//     const flags = Deno.args;
//     let input = {};
//     if(flags.length > 0) {
//         try {
//             input = JSON.parse(flags[0] || '{}')
//         } catch(e){
//             console.error(e.name)
//             console.error(e.message)
//             Deno.exit(1)
//         }
//     }
//     pipe.process(input).then((output) => {
//       if(output.error) {
//         console.error(JSON.stringify(output))
//         Deno.exit(1)
//       } else {
//         console.log(JSON.stringify(output))
//         Deno.exit(0)
//       }
//     })
// }
