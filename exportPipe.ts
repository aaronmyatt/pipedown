import {esbuild, pd, std} from "./deps.ts";
import type {pdBuildInput} from "./pdBuild.ts";
import {denoPlugins} from "jsr:@luca/esbuild-deno-loader@0.10.3";

async function buildIIFE(input: pdBuildInput) {
  const configPath = std.join(Deno.cwd(), ".pd", "deno.json");
  const _denoPlugins = denoPlugins({ configPath, loader: "native" });
  const filteredPipes =
    input.pipes?.filter((pipe) => pipe.config?.build?.includes("iife")) || [];
  for (const pipe of filteredPipes) {
    const scriptPath = std.join(pipe.dir, "index.ts");
    await esbuild.build({
      bundle: true,
      entryPoints: [scriptPath],
      // entryNames: "[dir].js",
      format: "iife",
      treeShaking: true,
      // outdir: '.pd/public',
      outfile: std.join(pipe.dir, "index.iife.js"),
      globalName: `PD.${pipe.fileName}`,
      plugins: _denoPlugins,
    })
      .catch((e) => {
        input.warning = input.warning || [];
        input.warning.push(e);
      });
  }
}

async function buildESM(input: pdBuildInput) {
  const configPath = std.join(Deno.cwd(), ".pd", "deno.json");
  const _denoPlugins = denoPlugins({ configPath });
  const filteredPipes =
    input.pipes?.filter((pipe) => pipe.config?.build?.includes("esm")) || [];
  for (const pipe of filteredPipes) {
    const scriptPath = std.join(pipe.dir, "index.ts");
    await esbuild.build({
      bundle: true,
      entryPoints: [scriptPath],
      // entryNames: "[dir].js",
      format: "esm",
      treeShaking: true,
      // outdir: '.pd/public',
      outfile: std.join(pipe.dir, "index.esm.js"),
      globalName: `PD.${pipe.fileName}`,
      plugins: _denoPlugins,
    }).catch((e) => {
      input.warning = input.warning || [];
      input.warning.push(e);
    });
  }
}

export async function exportPipe(input: pdBuildInput){
  const funcs = [
    buildIIFE,
    buildESM,
  ]
  return await pd.process(funcs, input, {})
}
