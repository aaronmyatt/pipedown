# Pages

```ts
import { DOMParser } from "https://esm.sh/linkedom/worker";
if(!input.DOMParser) input.DOMParser = new DOMParser();
```

## Append Event Source Script
```ts
const script = `<script>
function debounce(fn, wait,){
  let timeout = null;
  let flush = null;

  const debounced = ((...args) => {
    debounced.clear();
    flush = () => {
      debounced.clear();
      fn.call(debounced, ...args);
    };
    timeout = setTimeout(flush, wait);
  });

  debounced.clear = () => {
    if (typeof timeout === "number") {
      clearTimeout(timeout);
      timeout = null;
      flush = null;
    }
  };

  debounced.flush = () => {
    flush?.();
  };

  Object.defineProperty(debounced, "pending", {
    get: () => typeof timeout === "number",
  });

  return debounced;
}

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
      return registration;
    } catch (error) {
      console.error(\`Registration failed with \${error}\`);
    }
  }
};
globalThis.dxworker = registerServiceWorker();

let es = {};
function setupEventSource(refreshOnError){
  const eventSource = new EventSource('/sse');
  eventSource.onopen = async function(){
    //es.close && es.close()
    es = eventSource;
  }
  eventSource.onmessage = async function(event) {
      console.log(event.data);
      (await dxworker).active.postMessage({})  
  };
  eventSource.onerror = async function(event){
    console.log('here')
    refreshOnError && refreshOnError();
  }
}

const throttleSetup = debounce(setupEventSource, 50)
setupEventSource();


navigator.serviceWorker.addEventListener("message", (event) => {
  const newDom = new DOMParser().parseFromString(event.data.html, 'text/html')
  PD.morphDom.pipe.process({selector: document.querySelector('html'), newHtml: newDom.querySelector('html')})
});
</script>`
//const body = input.layout.querySelector('body')
//body.appendChild(input.DOMParser.parseFromString(script, 'text/html').querySelector('script'));
//input.layout.querySelector('body').appendChild(input.DOMParser.parseFromString(script, 'text/html').querySelector('script'));
```

## HomePage
```ts
import home from 'home';
Object.assign(input, await home.process(input))
```

## AboutPage
- route: /about
- ```ts
  import about from 'about';
  Object.assign(input, await about.process(input));
  ```
