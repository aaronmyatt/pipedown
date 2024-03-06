# triggerSSEOnFileChange

```ts
    let _controller;
if (!globalThis.watchingFileSystem) {
    (async () => {
        const watcher = Deno.watchFs('./', {recursive: true});
        for await (const event of watcher) {
            const extensions = [".ts", ".js", ".json", ".md", ".html", ".css"];
            if (!_controller) continue;
            const hasValidExtension = event.paths.every((path) =>
                extensions.some((ext) => path.endsWith(ext))
            );
            if (!hasValidExtension) continue;

            const payload = `data: ${event.paths[0]}\n\n`

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
input.body = 1;
input.response = new Response(body.pipeThrough(new TextEncoderStream()), {
    headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        //"connection": "keep-alive",
    },
});
```
