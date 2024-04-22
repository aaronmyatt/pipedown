# tailwindProjectSetup

```ts
import _$ from "https://deno.land/x/dax/mod.ts";
import { download } from "https://deno.land/x/download/mod.ts";
import {exists} from "https://deno.land/std@0.213.0/fs/exists.ts";
import daisyui from "npm:daisyui"
```

Setup Paths and Directories
```ts
input.binDir = '/Users/aaronmyatt/bin'
input.publicDir = './.pd/public'

try {
    await Deno.mkdir(input.binDir)
} catch (err) {
    //console.log('bin exists')
}
try {
    await Deno.mkdir(input.publicDir)
} catch (err) {
    //console.log('public dir exists')
}

input.twConfigPath = input.publicDir+'/tailwind.config.js'
input.twStylesPath = input.publicDir+'/tailwind.css'

const andThen = (label, doesitexist) => doesitexist ? $p.set(input, `/got${label}`, doesitexist) : $p.set(input, `/need${label}`, true)
await exists(input.binDir+'/tailwindcss', {isReadable: true, isFile: true}).then(andThen.bind(this, 'Cli'))
await exists(input.twConfigPath, {isReadable: true, isFile: true}).then(andThen.bind(this, 'Config'))
await exists(input.twStylesPath, {isReadable: true, isFile: true}).then(andThen.bind(this, 'Styles'))
await exists(input.publicDir+'/daisyui.css', {isReadable: true, isFile: true}).then(andThen.bind(this, 'Daisy'))
```

## Install Tailwind CSS
Grab the latest Tailwind CSS binary from the GitHub releases page and save it to `/usr/local/bin` with the name `tailwindcss`:
We also set the mode to 750 so that it's executable.
In the future we could check the OS and download the appropriate binary.
- if: /needCli
- ```ts
  console.log('Fetching Tailwindcss CLI binary ')
  input.twBinaryUrl = 'https://github.com/tailwindlabs/tailwindcss/releases/download/v3.4.1/tailwindcss-macos-x64'
  const twBinary = await download(input.twBinaryUrl, {file: 'tailwindcss', dir: input.binDir, mode: 775});
  ```

## Create Tailwind CSS Config
Create a new Tailwind CSS config file in the ./.pd directory:
- if: /needConfig
- ```ts
  const twConfig = `
  module.exports = {
    purge: [
      './**/*.html',
      './**/*.js',
      './**/*.ts',
      './**/*.md',
    ],
    darkMode: false, // or 'media' or 'class'
    theme: {
      extend: {},
    },
    variants: {
      extend: {},
    },
    plugins: [],
  }
  `
  console.log('Writing Tailwindcss config to: ', input.twConfigPath)
  const twConfigFile = await Deno.writeTextFile(input.twConfigPath, twConfig);
  ```

## Create Tailwind CSS Styles
Create a new Tailwind CSS styles file in the ./.pd directory:
- if: /needStyles
- ```ts
  const twStyles = `
  @import 'tailwindcss/base';
  @import 'tailwindcss/components';
  @import 'tailwindcss/utilities';
  `
  console.log('Writing Tailwindcss base styles to: ', input.twStylesPath)
  const twStylesFile = await Deno.writeTextFile(input.twStylesPath, twStyles);
  ```

## Download DaisyUI
- if: /needDaisy
- ```ts
  const file = 'daisyui.css';
  input.daisyuiUrl = 'https://cdn.jsdelivr.net/npm/daisyui@4.7.2/dist/full.min.css'
  await download(input.daisyuiUrl, {file, dir: input.publicDir, mode: 777});
  ```

## Run Tailwind CSS
Run the Tailwind CSS binary to generate the styles:
```ts
input.twBuild = await _$`/Users/aaronmyatt/bin/tailwindcss build ./.pd/public/tailwind.css --config="./.pd/public/tailwind.config.js" -o ./.pd/public/styles.css`.captureCombined();
```
