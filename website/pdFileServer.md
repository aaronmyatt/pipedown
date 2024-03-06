# pdFileServer

```ts
import { serveFile } from 'https://deno.land/std/http/file_server.ts';
import {exists} from "https://deno.land/std@0.213.0/fs/exists.ts";
import {parse} from "https://deno.land/std@0.218.2/path/mod.ts";
import { assert } from "https://deno.land/std@0.218.0/assert/mod.ts";
import esbuildPipe from 'esbuildPipe'
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

## Try serving a file that already exists
An .md, .ts, or .json file that already exists in the pipedown generated directory may be requested. Let's check for it!
```ts
console.log(input, $p.get(input, '/route/pathname/groups/path'))
input.path = '.pd/'+(input.path || $p.get(input, '/route/pathname/groups/path'))
input.exists = await exists(input.path);
if(input.exists){}
else
    input.missing = true;
```

## mapFileNameToExisting
The file is missing, so let's see if there's a file name.format.extension we recognise, like: `index.iife.js` or `index.esm.js`
- if: /missing
- ```ts
    const {ext, name: filename} = parse(input.path)
    
    input.format = $p.get(filename.split('.'), '/1')
    
    assert(!!input.format, `Requested browser or module files
    should take the form of: name.format.ext
    Got: ${filename}`)
    assert(['esm', 'iife'].includes(input.format), 
        'Not a valid format, try: "esm"|"iife"')
    
    input.likelyExistingPath = 
        input.path.replace(`.${input.format}${ext}`, '')+'.ts'
    ```

## buildit
We want to make pipes usable in Javascript environments that do not support Deno's handy Typescript module resolution system. This requires bundling a pipe with its dependencies 

TODO: output to the nested pd dir! Matching the requested `input.path`
- if: /missing
- ```ts
    input.build = await esbuildPipe.process({
        buildConfig: {
            entryPoints: [input.likelyExistingPath],
            format: input.format,
            outfile: input.path,
        }
    })
    ```

https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerContainer/register#scope
```ts
input.response = await serveFile(input.request, input.path);
if(input.path.includes('worker')){
    input.response.headers.append('Service-Worker-Allowed', '/')
}
```