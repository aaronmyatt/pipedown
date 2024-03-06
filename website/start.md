# Start Website Process


We'll get a Deno.serve `{ request }` object and
use that to determine which page to serve.

## setupCSS
```ts
import tw from "tailwindSetup"
tw.process()
```

## Serve a page
```ts
import pages from 'pages';
Object.assign(input, await pages.process(input));
```

## Reload browser on change
Use Server Sent Events to reload the browser when a file changes.
- https://dash.deno.com/playground/server-sent-events
- https://vercel.com/blog/an-introduction-to-streaming-on-the-web
- https://deno.com/blog/deploy-streams#server-sent-events
- route: /sse
- ```ts
    import triggerSSE from 'SSEOnFileChange';
    Object.assign(input, await triggerSSE.process(input));
    ```

## Serve a PD file
- route: /pd/:path(.*)
- ```ts
    import pdFileServer from 'pdFileServer'
    Object.assign(input, await pdFileServer.process(input))
    ```


## publicContent
```ts
import { serveFile } from 'https://deno.land/std/http/file_server.ts';
const publicDir = './.pd/public'; 
if(Object.keys(input.body).length || input.response) return;
const path = publicDir+(new URL(input.request.url)).pathname;
try {
    input.response = await serveFile(input.request, path);
} catch (err) {
    console.log(`Couldn't serve ${path}`);
    return;
}
```

## fourOhFour
```ts
if(input.response || input.body || input.responseOptions) return;
input.response = new Response('404 Not Found', { status: 404 });
```

## tidyup
```ts
delete input.DOMParser;
```
