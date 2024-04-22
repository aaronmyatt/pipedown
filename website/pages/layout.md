# Page Layout

```ts
import { DOMParser } from "https://esm.sh/linkedom/worker";
if(!input.DOMParser) input.DOMParser = new DOMParser();
```

## Boilerplate
```ts
input.layout = input.DOMParser.parseFromString(
    `<html class="no-js" lang="">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title></title>
  <meta name="description" content=""/>

  <meta property="og:title" content=""/>
  <meta property="og:type" content=""/>
  <meta property="og:url" content=""/>
  <meta property="og:image" content=""/>
  <meta property="og:image:alt" content=""/>

  <link rel="icon" href="/favicon.ico" sizes="any"/>
  <link rel="icon" href="/icon.svg" type="image/svg+xml"/>
  <link rel="apple-touch-icon" href="icon.png"/>

  <link rel="manifest" href="site.webmanifest"/>
  <meta name="theme-color" content="#fafafa"/>
  <link href="https://cdn.jsdelivr.net/npm/daisyui@4.9.0/dist/full.min.css" rel="stylesheet" type="text/css" />
  <script src="https://cdn.tailwindcss.com">pd</script>
</head>

<body>
  <section id="app"></section>
</body>

</html>
`);
```

```ts
const script = input.layout.createElement('script')
// script.setAttribute('type', 'module')
script.setAttribute('src', '/pd/scripts/morphDom/index.iife.js')
script.innerHTML = 'pd'
input.layout.querySelector('body').appendChild(script);
```

## injectNavbar
```ts
const navbar = `
<div class="navbar bg-base-100">
  <div class="navbar-start">
    <div class="dropdown">
      <div tabindex="0" role="button" class="btn btn-ghost lg:hidden">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h8m-8 6h16"></svg>
      </div>
      <ul tabindex="0" class="menu menu-sm dropdown-content mt-3 z-[1] p-2 shadow bg-base-100 rounded-box w-52">
        <li><a href="/home">Home</a></li>
        <li><a href="/about">About</a></li>
        <li>
          <a>Parent</a>
          <ul class="p-2">
            <li><a>Submenu 1</a></li>
            <li><a>Submenu 2</a></li>
          </ul>
        </li>
        <li><a>Item 3</a></li>
      </ul>
    </div>
    <a class="btn btn-ghost text-xl">daisyUI</a>
  </div>
  <div class="navbar-center hidden lg:flex">
    <ul class="menu menu-horizontal px-1">
      <li><a href="/home">Home</a></li>
      <li><a href="/about">About</a></li>
      <li>
        <details>
          <summary>Parent</summary>
          <ul class="p-2">
            <li><a>Submenu 1</a></li>
            <li><a>Submenu 2</a></li>
          </ul>
        </details>
      </li>
      <li><a>Item 3</a></li>
    </ul>
  </div>
  <div class="navbar-end">
    <a class="btn">Button</a>
  </div>
</div>
`;
const tempDoc = input.DOMParser.parseFromString(navbar)
input.layout.querySelector('body').insertAdjacentElement('afterbegin', tempDoc.querySelector('.navbar'));
```

## dropManifestForNow
```ts
input.layout.querySelector('link[rel="manifest"]').remove();
```
