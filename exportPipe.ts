// deno-lint-ignore no-import-prefix
import type { BuildOptions } from "npm:esbuild@0.25.4";
import type { BuildInput } from "./pipedown.d.ts";
import { pd, std } from "./deps.ts";
// deno-lint-ignore no-import-prefix
import { denoPlugins } from "jsr:@luca/esbuild-deno-loader@0.11.1";

const configPath = std.join(Deno.cwd(), ".pd", "deno.json");
const plugins = [...denoPlugins({ configPath })];
const buildConfigDefaults: BuildOptions = {
  bundle: true,
  treeShaking: true,
  plugins,
  format: "esm",
  // entryNames: "[dir].js",
  // outdirs: ['.pd/public'],
};

function extractConfig(input: ExportPipeInput) {
  input.builds = (input.pipes || []).map((pipe) => {
    const build = pipe.config?.build || [];
    return build.map((userConf) => {
      return {
        ...buildConfigDefaults,
        entryPoints: [std.join(pipe.dir, "index.ts")],
        outfile: std.join(
          pipe.dir,
          `index.${userConf.format || buildConfigDefaults.format}.js`,
        ),
        globalName: `PD.${pipe.fileName}`,
        ...userConf,
      };
    });
  }).flat();
}

async function esBuilder(input: ExportPipeInput) {
  // deno-lint-ignore no-import-prefix
  const esbuild = await import("npm:esbuild@0.27.4");
  for (const build of input.builds) {
    // Cast to `any` to bypass BuildOptions type mismatch between esbuild@0.25.4
    // (used by the denoPlugins dependency) and esbuild@0.27.4 (imported here).
    // The APIs are compatible at runtime; only the d.ts signatures diverge.
    // Ref: https://esbuild.github.io/api/#build
    // deno-lint-ignore no-explicit-any
    await esbuild.build(build as any)
      .catch((e) => {
        input.warning = input.warning || [];
        input.warning.push(e);
      });
  }
}

type ExportPipeInput = BuildInput & {
  builds: BuildOptions[];
};

export async function exportPipe(input: BuildInput) {
  const funcs = [
    extractConfig,
    esBuilder,
  ];
  return await pd.process(funcs, { ...input, builds: [] }, {});
}
