# About Page

```json
{
    "build": ["iife"]
}
```

```ts
import { DOMParser } from "https://esm.sh/linkedom/worker";
if(!input.DOMParser) input.DOMParser = new DOMParser();
```

## defaultLayout
```ts
import layout from 'layout';
Object.assign(input, await layout.process(input));
```

## Start with a title
```ts
input.layout.querySelector('title').textContent = 'About';
// input.layout.querySelector('meta[name="description"]').setAttribute('content', 'Home page description');
// input.layout.querySelector('meta[property="og:title"]').setAttribute('content', 'Home');
// input.layout.querySelector('meta[property="og:type"]').setAttribute('content', 'website');
// input.layout.querySelector('meta[property="og:url"]').setAttribute('content', 'https://example.com/home');
// input.layout.querySelector('meta[property="og:image"]').setAttribute('content', 'https://example.com/image.jpg');
// input.layout.querySelector('meta[property="og:image:alt"]').setAttribute('content', 'Home');

// add h1 to body
const h1 = input.layout.createElement('h1');
h1.textContent = 'About';
input.layout.querySelector('#app').appendChild(h1);
```

## respondWithHtml
```ts
Object.assign(input.responseOptions.headers, { "content-type": "text/html" });
input.responseOptions.status = 200;
input.body = input.layout.toString();
```

