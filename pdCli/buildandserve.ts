import type { BuildInput } from "../pipedown.d.ts";
import { std } from "../deps.ts";

import { pdBuild } from "../pdBuild.ts";
import { reportErrors } from "./reportErrors.ts";
import { scanTraces, readTrace, tracePage } from "./traceDashboard.ts";

let _controller: ReadableStreamDefaultController<string> | null = null;

const lazyIO = std.debounce(async (input = { errors: [] }) => {
  Object.assign(input, await pdBuild(input));
  _controller && _controller.enqueue("data: reload\n\n");
  if (input.errors && input.errors.length > 0) {
    reportErrors(input);
  }
  input.errors = [];
}, 200);

const page = (scriptsPaths: string[]) =>
  `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Pipedown — Services</title>
  <meta name="description" content="Pipedown"/>
  <link rel="stylesheet" href="https://unpkg.com/open-props"/>
  <link rel="stylesheet" href="https://unpkg.com/open-props/normalize.min.css"/>
  <script src="https://unpkg.com/mithril/mithril.js"></script>
  <style>
    body {
      margin: 0;
      font-family: var(--font-sans);
      background: var(--surface-1);
      color: var(--text-1);
    }
    .layout {
      display: grid;
      grid-template-columns: 280px 1fr;
      grid-template-rows: auto 1fr;
      min-height: 100vh;
    }
    .topbar {
      grid-column: 1 / -1;
      display: flex;
      align-items: center;
      gap: var(--size-3);
      padding: var(--size-2) var(--size-4);
      background: var(--surface-2);
      border-block-end: var(--border-size-1) solid var(--surface-3);
    }
    .topbar h1 {
      font-size: var(--font-size-3);
      margin: 0;
    }
    .topbar a {
      color: var(--link);
      text-decoration: none;
      font-size: var(--font-size-1);
    }
    .topbar a:hover { text-decoration: underline; }
    .sidebar {
      background: var(--surface-2);
      padding: var(--size-3);
      overflow-y: auto;
      border-inline-end: var(--border-size-1) solid var(--surface-3);
    }
    .pipe-item {
      display: flex;
      align-items: center;
      gap: var(--size-2);
      padding: var(--size-2);
      border-radius: var(--radius-2);
      margin-block-end: var(--size-1);
    }
    .pipe-item:hover { background: var(--surface-3); }
    .pipe-item.active { background: var(--surface-4); }
    .pipe-name {
      cursor: pointer;
      font-size: var(--font-size-1);
      font-family: var(--font-mono);
      color: var(--text-2);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
    }
    .pipe-name:hover { color: var(--text-1); }
    .run-btn {
      padding: var(--size-1) var(--size-2);
      border-radius: var(--radius-2);
      border: var(--border-size-1) solid var(--surface-4);
      background: var(--surface-1);
      color: var(--text-1);
      cursor: pointer;
      font-size: var(--font-size-0);
      white-space: nowrap;
    }
    .run-btn:hover { background: var(--surface-3); }
    .main-content {
      padding: var(--size-4);
      overflow: auto;
    }
    .main-content pre {
      font-family: var(--font-mono);
      font-size: var(--font-size-1);
      background: var(--surface-2);
      padding: var(--size-3);
      border-radius: var(--radius-2);
      overflow-x: auto;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .main-content iframe {
      width: 100%;
      height: calc(100vh - 80px);
      border: none;
      border-radius: var(--radius-2);
    }
    .empty-state {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--text-2);
      font-size: var(--font-size-2);
    }
  </style>
  <script>
    var scriptsPaths = ${JSON.stringify(scriptsPaths)};
    document.addEventListener("DOMContentLoaded", function() {
      scriptsPaths.forEach(function(path) {
        if (path.includes('iife')) {
          var script = document.createElement('script');
          script.src = path;
          document.body.appendChild(script);
        }
      });
    });
  </script>
</head>
<body>
  <div id="app"></div>
  <script>
  (function() {
    var state = {
      currentPipe: null,
      contentType: null, // "json" | "html" | "source"
      content: null
    };

    function runPipe(path) {
      state.currentPipe = path;
      state.content = null;
      state.contentType = null;
      m.redraw();

      (async function() {
        var pipe;
        if (path.includes('iife')) {
          var scriptName = path.split('/').at(-2);
          pipe = PD[scriptName].pipe;
        }
        if (path.includes('esm')) {
          var mod = await import(location.origin + '/' + path + '?' + Math.random());
          pipe = mod.pipe;
        }
        var output = await pipe.process({ body: {}, responseOptions: { headers: {} }, mode: 'preview' });
        if (output.body) {
          if (output.responseOptions.headers['content-type'] === 'application/json') {
            state.contentType = 'json';
            state.content = output.body;
          } else {
            state.contentType = 'html';
            state.content = output.body;
          }
        }
        m.redraw();
      })();
    }

    function fetchFile(path) {
      state.currentPipe = path;
      state.contentType = 'source';
      fetch(path).then(function(res) { return res.text(); }).then(function(text) {
        state.content = text;
        m.redraw();
      });
    }

    var PipeList = {
      view: function() {
        if (!scriptsPaths.length) {
          return m("div.sidebar", m("p", { style: "color: var(--text-2); font-size: var(--font-size-1)" },
            "No pipes built yet. Create a .md pipe file to get started."));
        }
        return m("div.sidebar", scriptsPaths.map(function(path) {
          return m("div.pipe-item" + (state.currentPipe === path ? ".active" : ""), [
            m("button.run-btn", { onclick: function() { runPipe(path); } }, "Run"),
            m("span.pipe-name", { onclick: function() { fetchFile(path); } }, path)
          ]);
        }));
      }
    };

    var OutputView = {
      view: function() {
        if (!state.content) {
          return m("div.main-content", m("div.empty-state", "Select a pipe to run or view"));
        }
        if (state.contentType === 'json' || state.contentType === 'source') {
          return m("div.main-content", m("pre", state.content));
        }
        if (state.contentType === 'html') {
          return m("div.main-content",
            m("iframe", {
              sandbox: "allow-scripts allow-same-origin",
              allow: "fullscreen",
              srcdoc: state.content
            })
          );
        }
      }
    };

    var Layout = {
      view: function() {
        return m("div.layout", [
          m("div.topbar", [
            m("h1", "Pipedown"),
            m("a", { href: "/traces" }, "Traces →")
          ]),
          m(PipeList),
          m(OutputView)
        ]);
      }
    };

    m.mount(document.getElementById("app"), Layout);

    // SSE hot reload
    var eventSource = new EventSource('/sse');
    eventSource.onmessage = function(event) {
      if (event.data === 'reload' && state.currentPipe) {
        runPipe(state.currentPipe);
      }
    };
  })();
  </script>
</body>
</html>`;

async function watchFs(input: BuildInput) {
  for await (const event of Deno.watchFs(Deno.cwd(), { recursive: true })) {
    const pathRegex = new RegExp(/\.pd|deno|dist|\.git|\.vscode|\.github|\.cache|\.history|\.log|\.lock|\.swp/)
    const notInProtectedDir = event.paths.every((path) => !path.match(pathRegex));

    const extensions = [".md"];
    const hasValidExtension = event.paths.every((path) =>
      extensions.some((ext) => path.endsWith(ext))
  );

  if (
    event.kind === "modify" && event.paths.length === 1 &&
    notInProtectedDir && hasValidExtension
  ) {
      const fileName = event.paths[0];
      console.log(std.colors.brightGreen(`File changed: ${fileName}`));
      lazyIO(Object.assign(input, { match: fileName }));
    }
  }
}

function tellClientToReload() {
  const body = new ReadableStream({
    start(controller) {
      _controller = controller;
    },
    cancel() {
      // _controller = null;
    },
  });

  return new Response(body.pipeThrough(new TextEncoderStream()), {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      "connection": "keep-alive",
    },
  });
}

function findOpenPort(defaultPort = 8000){
  let port = defaultPort;
  while(true){
    try {
      Deno.listen({port});
    } catch (e) {
      port += 1;
      continue;
    }
    return port;
  }
}

export async function serve(input: BuildInput){
  pdBuild(input);
  watchFs(input);

  const hostname = "127.0.0.1";
  const port = findOpenPort(8888);

  const handler = async (request: Request) => {
    const url = new URL(request.url);

    // Trace API: list all traces
    if (url.pathname === "/api/traces") {
      const traces = await scanTraces();
      return new Response(JSON.stringify(traces), {
        headers: { "content-type": "application/json" },
      });
    }

    // Trace API: get single trace file
    if (url.pathname.startsWith("/api/traces/")) {
      const segments = url.pathname.replace("/api/traces/", "").split("/");
      if (segments.length >= 3) {
        const project = decodeURIComponent(segments[0]);
        const pipe = decodeURIComponent(segments.slice(1, -1).join("/"));
        const file = decodeURIComponent(segments[segments.length - 1]);
        const home = Deno.env.get("HOME");
        if (home) {
          const filePath = std.join(home, ".pipedown", "traces", project, pipe, file);
          try {
            const trace = await readTrace(filePath);
            return new Response(JSON.stringify(trace), {
              headers: { "content-type": "application/json" },
            });
          } catch {
            return new Response("Trace not found", { status: 404 });
          }
        }
      }
      return new Response("Bad request", { status: 400 });
    }

    // Trace dashboard page
    if (url.pathname === "/traces") {
      return new Response(tracePage(), {
        headers: { "content-type": "text/html" },
      });
    }

    // Static JS files
    if (url.pathname.endsWith(".js")) {
      const pathname = url.pathname;
      const response = await std.serveFile(request, "." + pathname);
      response.headers.set("Access-Control-Allow-Origin", "*");
      response.headers.set(
        "Access-Control-Allow-Headers",
        "Origin, X-Requested-With, Content-Type, Accept, Range",
      );
      return response;
    }

    // SSE for hot reload
    if (url.pathname === "/sse") {
      return tellClientToReload();
    }

    // Default: services page
    const scriptsPaths: string[] = [];
    for await (const entry of std.walk("./.pd")) {
      if (entry.path.endsWith(".js")) {
        scriptsPaths.push(entry.path);
      }
    }

    return new Response(page(scriptsPaths), {
      headers: {
        "content-type": "text/html",
      },
    });
  }

  const server = Deno.serve({ handler, port, hostname });
  await server.finished.then(() => console.log("Server closed"));
}
