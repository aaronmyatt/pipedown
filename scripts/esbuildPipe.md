# esbuildPipe
We need a utility to convert pipedown typescript outputs to
different formats, particularly plain javascript bundles in either ESM or IIFE.

Esbuild can do both and it has esm/webworker varieties that
work seamlessly with Deno.

```ts
import * as esbuild from "https://deno.land/x/esbuild@v0.18.17/mod.js";
import { denoPlugins } from "https://deno.land/x/esbuild_deno_loader@0.8.5/mod.ts";
import {parse} from "https://deno.land/std@0.218.2/path/mod.ts";
```

## incaseCli
```ts
const couldBeCliArgs = $p.get(input, '/flags/_/0')
if(typeof couldBeCliArgs === 'string'){
    try {
      const args = JSON.parse(couldBeCliArgs)
      Object.assign(input, args);
    } catch(e){
      // maybe not!
    }
}
```

## noEntryPoints
We need at least a path from the CLI flags or one passed in by the calling module.
```ts
if(!$p.get(input, '/buildConfig/entryPoints') || $p.get(input, '/buildConfig/entryPoints').length === 0) throw new Error("No entry point provided")
```

The only important piece here is that I want to develop this pipe in such a manner that I can pass it a path as an input and have it fetch that file from the filesystem. This way I can trivially develop the pipe with pdrepl and then import it into a server context needing only to map the expected inputs.

Though I remember now that esbuild will handle reading from the path, this is necessary, I suppose, so that esbuild can follow the import dependency tree, relative to that files location on the system.

## buildConfig
```ts
  const entryPoint = $p.get(input, '/buildConfig/entryPoints/0')
  let outfile = entryPoint.replace('.ts', '.js')
  if(!outfile.startsWith('.pd')) 
    outfile = '.pd/'.concat(outfile)

  input.buildConfig = Object.assign({
    bundle: true,
    // entryPoints: [entryPoint],
    // entryNames: "[dir].js",
    format: "iife",
    treeShaking: true,
    // outdir: '.pd/public',
    outfile,
    plugins: [...denoPlugins({configPath: Deno.cwd()+'/.pd/deno.json'})]
  }, input.buildConfig);
```


## buildIt
```ts
if (Object.keys(input.buildConfig).length === 0) return;
const result = await esbuild.build(input.buildConfig);
input.result = result;
```