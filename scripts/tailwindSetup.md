# tailwindProjectSetup

```ts
import _$ from "https://deno.land/x/dax/mod.ts";
import { download } from "https://deno.land/x/download/mod.ts";
import {exists} from "https://deno.land/std@0.213.0/fs/exists.ts";
```

Setup Directories
```ts
input.binDir = '/Users/aaronmyatt/bin'
const publicDir = './.pd/public'
try {
    await Deno.mkdir(input.binDir)
} catch (err) {
    //console.log('bin exists')
}
try {
    await Deno.mkdir(publicDir)
} catch (err) {
    //console.log('public dir exists')
}
```

## Install Tailwind CSS
Grab the latest Tailwind CSS binary from the GitHub releases page and save it to `/usr/local/bin` with the name `tailwindcss`:
We also set the mode to 750 so that it's executable.
In the future we could check the OS and download the appropriate binary.
```ts
const twBinaryUrl = 'https://github.com/tailwindlabs/tailwindcss/releases/download/v3.4.1/tailwindcss-macos-x64'
const itdoes = await exists(input.binDir+'/tailwindcss', {isReadable: true, isFile: true})

if (itdoes) {
    //console.log('Tailwind CSS binary already exists');
} else {
    // console.log('Downloading Tailwind CSS binary');
    const twBinary = await download(twBinaryUrl, {file: 'tailwindcss', dir: input.binDir, mode: 775});
}    
```

## Create Tailwind CSS Config
Create a new Tailwind CSS config file in the ./.pd directory:
```ts
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
const twConfigPath = './.pd/tailwind.config.js'
const twConfigFile = await Deno.writeTextFile(twConfigPath, twConfig);
```

## Create Tailwind CSS Styles
Create a new Tailwind CSS styles file in the ./.pd directory:
```ts
const twStyles = `
@import 'tailwindcss/base';
@import 'tailwindcss/components';
@import 'tailwindcss/utilities';
`
const twStylesPath = './.pd/public/tailwind.css'
const twStylesFile = await Deno.writeTextFile(twStylesPath, twStyles);
```

## Create Tailwind CSS HTML
Create a new Tailwind CSS HTML file in the ./.pd directory:
```
const twHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="./tailwind.css" rel="stylesheet">
  <title>Tailwind CSS</title>
</head>
<body>
  <div class="container mx-auto">
    <h1 class="text-4xl font-bold text-center mt-10">Hello, Tailwind CSS!</h1>
  </div>
</body>
</html>
`
const twHtmlPath = './.pd/index.html'
const twHtmlFile = await Deno.writeTextFile(twHtmlPath, twHtml);
```

## Run Tailwind CSS
Run the Tailwind CSS binary to generate the styles:
```ts
input.twBuild = await _$`/Users/aaronmyatt/bin/tailwindcss build ./.pd/public/tailwind.css --config="./.pd/tailwind.config.js" -o ./.pd/public/styles.css`.captureCombined();
```
