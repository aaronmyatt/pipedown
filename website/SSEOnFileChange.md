# triggerSSEOnFileChange


*All software is bespoke*
```json
{
    "pathToRoute": {
        "home.md": ["/home"],
        ".css": ["/daisyui.css", "/styles.css"]
    }
}
```

```ts
let _controller;
if (!globalThis.watchingFileSystem) {
    (async () => {
        const watcher = Deno.watchFs('./', {recursive: true});
        for await (const event of watcher) {
            const path = event.paths[0];
            // const inProtectedDir = event.paths.every((path) =>
            //     path.match("\.pd|deno|dist|\.git|\.vscode|\.github|\.cache|\.history|\.log|\.lock|\.swp")
            // );
            if (!_controller) continue;
            if(path.endsWith('.ts')){
                console.log(path)
                const payload = `data: reload\n\n`
    
                try {
                    _controller.enqueue(payload);
                } catch (err) {
                    console.log('err', err);
                    console.log('err', _controller);
                    globalThis.watchingFileSystem = false
                    break;
                }
            }

            
            // const pathToRoute = $p.get(opts, '/config/pathToRoute')
            // for(const entry of (Object.entries(pathToRoute))){
            //     const [pattern, routes] = entry;

            //     if(path.match(pattern)){
            //         console.log(path);
            //     }

            // }
        }
    })();
    globalThis.watchingFileSystem = true;
    console.info('watching file system');
}
const body = new ReadableStream({
    start(controller) {
        _controller = controller;
        controller.enqueue('data: all\n\n')
    },
    cancel() {
        // _controller = null;
    }
})
input.body = 1;
input.response = new Response(body.pipeThrough(new TextEncoderStream()), {
    headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        "connection": "keep-alive",
    },
});
```
