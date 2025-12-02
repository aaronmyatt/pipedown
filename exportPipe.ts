import type { BuildOptions } from "npm:esbuild@0.23.1";
import type { BuildInput } from "./pipedown.d.ts";
import { esbuild, pd, std } from "./deps.ts";
import { denoPlugins } from "jsr:@luca/esbuild-deno-loader@0.11.0";
import { getProjectBuildDir, getProjectName } from "./pdCli/helpers.ts";

function getBuildConfigDefaults(input: BuildInput): BuildOptions {
  const projectName = getProjectName(input.globalConfig);
  const buildDir = getProjectBuildDir(projectName);
  const configPath = std.join(buildDir, "deno.json");
  const plugins = [...denoPlugins({ configPath })];
  
  return {
    bundle: true,
    treeShaking: true,
    plugins,
    format: "esm",
    // entryNames: "[dir].js",
    // outdirs: ['builds/public'],
  };
}

function extractConfig(input: ExportPipeInput) {
  const buildConfigDefaults = getBuildConfigDefaults(input);
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
  for (const build of input.builds) {
    await esbuild.build(build)
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
