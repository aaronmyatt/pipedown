# Pages

```ts
import { DOMParser } from "https://esm.sh/linkedom";
input.DOMParser = new DOMParser();
```

## defaultLayout
```ts
import layout from 'layout';
Object.assign(input, await layout.process(input));
```

## Append Event Source Script
```ts
const script = `<script>
  const eventSource = new EventSource('/sse');
  eventSource.onmessage = function(event) {
    console.log('event', event);
    //location.reload();
  };

  const registerServiceWorker = async () => {
  if ("serviceWorker" in navigator) {
    try {
      const workerPath = '/pd/website/dx.worker/worker.esm.js';
      const registration = await navigator.serviceWorker.register(workerPath, {
        scope: "/",
      });
      if (registration.installing) {
        console.log("Service worker installing");
      } else if (registration.waiting) {
        console.log("Service worker installed");
      } else if (registration.active) {
        console.log("Service worker active");
      }
    } catch (error) {
      console.error(\`Registration failed with \${error}\`);
    }
  }
};
registerServiceWorker();
</script>`
//const body = input.layout.querySelector('body')
//body.appendChild(input.DOMParser.parseFromString(script, 'text/html').querySelector('script'));
input.layout.querySelector('body').appendChild(input.DOMParser.parseFromString(script, 'text/html').querySelector('script'));
```

## HomePage
- route: /home
- ```ts
  import home from 'home';
  Object.assign(input, await home.process(input));
  ```
