# DX Worker
Here's the idea. Why can't we use service workers to refresh content as we develop? We can
use the same idea as the server sent events, but instead of the server sending the events, we
can use the service worker to send the events. This way, we can use the same code to refresh
the browser when we make changes to the files.
Nice try GPT.
I imagine we will want to pair this with SSE. Service workers will catch and prevent
requests from reaching the server and causing page reloads. We can then fetch content
and intelligently refresh parts of the page content. This will work especially well
for HTML and CSS content which can be quite conveniently updated without a full page
reload. JS content will be a bit more tricky, but we can still use the same idea to
refresh the JS or just reload the entire page.

From  a little reading around we need to:

1) Register the service worker - handled by PD/website
2) Install the service worker - handled by PD/website
3) Proactively load cache - done in the install/activate events?
4) Intercept requests - done per the fetch event
5) Refresh content - most of the time just loads stuff from the cache
6) Listen for changes via SSE - `new EventSource('/sse')`
7) postMessage to the service worker to refresh content 
    on message events to the service worker deliberately reload the cache for the designated path(s)


## onInstall
- if: /type/install
```ts
console.log('dx.worker.md::install', install)
```

## onActivate
- if: /type/activate
```ts
console.log('dx.worker.md::activate', install)
```

## onFetch
- if: /type/activate
```ts
console.log('dx.worker.md::fetch', install)
event.respondWith(input.event.request)
```