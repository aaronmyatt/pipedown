import pipe from "./index.ts"
globalThis.addEventListener("install", async (event) => {
    event.waitUntil(pipe.process({event, mode: { worker: true }, type: {install: true}}));
})
globalThis.addEventListener("activate", async (event) => {
    event.waitUntil(pipe.process({event, mode: { worker: true }, type: {activate: true}}));
})
globalThis.addEventListener("fetch", async (event) => {
    const detectCacheExceptions = [
        event.request.headers.get("connection"),
        event.request.headers.get('content-type'),
        event.request.headers.get('accept')
    ];
    const skipCache = detectCacheExceptions.filter(Boolean)
        .some(header => {
            return ['upgrade', 'text/event-stream'].includes(header.toLowerCase())
        })
    if(skipCache) return;


    event.respondWith((async () => {
        const output = await pipe.process({
            event,
            type: {fetch: true},
            request: event.request,
            body: {},
            responseOptions: {
                headers: {
                    "content-type": "application/json"
                },
                status: 200,
            }
        })
        if(output.errors) {
            console.error(output.errors);
            return new Response(JSON.stringify(output.errors), {status: 500});
        }
        const response = output.response || new Response(output.body, output.responseOptions);
        return response;
    })());
})

globalThis.addEventListener("message", async (event) => {
    const output = await pipe.process({event, mode: { worker: true }, type: {message: true}});
    if(output.errors) {
        console.error(output.errors);
        return;
    }
    if(output.data) {
        console.log(output.data);
    }
});
