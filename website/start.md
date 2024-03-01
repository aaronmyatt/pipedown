# Start Website Process


We'll get a Deno.serve `{ request }` object and
use that to determine which page to serve.

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
    let _controller;
    if (!globalThis.watchingFileSystem) {
        (async () => {
            const watcher = Deno.watchFs('./', { recursive: true });
            for await (const event of watcher) {
                console.log('file change', event, _controller);
                const payload = "data: 1\n\n"
                if(!_controller) continue;
                try {
                    _controller.enqueue(payload);
                } catch (err) {
                    console.log('err', err);
                    console.log('err', _controller);
                    globalThis.watchingFileSystem = false
                    break;
                }
            }
        })();
        globalThis.watchingFileSystem = true;
        console.info('watching file system');
    }
    const body = new ReadableStream({
        start(controller) {
              _controller = controller;      
            // interval = setInterval(() => {
            //     const payload = "data: 1\n\n"
            //     console.log('sending', payload, controller);
            //     controller.enqueue(payload);
            // }, 1000);
        },
      cancel() {
            // _controller = null;
        }
    })
    input.response = new Response(body.pipeThrough(new TextEncoderStream()), {
        headers: {
            "content-type": "text/event-stream",
            "cache-control": "no-cache",
            //"connection": "keep-alive",
        },
    });
    ```

## publicContent
```ts
import { serveFile } from "https://deno.land/std@0.217.0/http/file_server.ts";
const publicDir = './.pd/public'; 
if(Object.keys(input.body).length || input.response) return;
const path = publicDir+(new URL(input.request.url)).pathname;
try {
    input.response = await serveFile(input.request, path);
    console.log({path});
} catch (err) {
    console.log('err', err);
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
