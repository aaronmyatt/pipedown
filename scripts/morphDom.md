# Morph DOM

We'll piggy back on Alpine.js's morph plugin to try updating our html SPA style whenever we trigger an update of the service workers cache.

The Alpine.js morph plugin exposes a simple function for passing html(el,newHtml). It is apparently used in Liveview (by the same author), so it's likely pretty battle tested!

## grabit
```ts
import {morph} from '../../../scripts/morph.js'
```

## morphit
Let's just expose it globally so we can test it out!
```ts
input.newDom = morph(input.selector || document.querySelector('body'), input.newHtml)
```