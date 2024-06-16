import type { pdBuildInput } from "../pdBuild.ts";
import { std } from "../deps.ts";

import { pdBuild } from "../pdBuild.ts";
import { reportErrors } from "./reportErrors.ts";

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
<html class="no-js" lang="">

<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title></title>
  <meta name="description" content="Pipedown"/>
  <link href="https://cdn.jsdelivr.net/npm/daisyui@4.9.0/dist/full.min.css" rel="stylesheet" type="text/css" />
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    const scriptsPaths = ${JSON.stringify(scriptsPaths)};

    // when document ready
    document.addEventListener("DOMContentLoaded", () => {
      scriptsPaths.forEach((path) => {
        if(path.includes('iife')){
          const script = document.createElement('script');
          script.src = path;
          document.body.appendChild(script);
        }
        if(path.includes('esm')){
        }
      });
    });
  </script>
</head>

<body x-data="{
    init(){
      document.addEventListener('pd:reload', () => {
        this.currentPipe && this.run(this.currentPipe);
      });
    },
    currentPipe: '',
    async fetchFile(path){
        const res = await fetch(path);
        const text = await res.text();
        const code = document.createElement('code')
        code.textContent = text;
        const pre = document.createElement('pre')
        pre.appendChild(code);
        // the only child
        document.querySelector('#app').innerHTML = '';
        document.querySelector('#app').appendChild(pre);
    },
    async run(path){
        this.currentPipe = path;
        let pipe;
        if(path.includes('iife')){
          const scriptName = path.split('/').at(-2);
          pipe = PD[scriptName].pipe;
        }

        if(path.includes('esm')){
          const mod = await import(location.origin+'/'+path+'?'+Math.random());
          pipe = mod.pipe;
        }
        console.log({pipe})
        const output = await pipe.process({ body: {}, responseOptions: {headers: {}}, mode: 'preview' });
        console.log({output})
        if(output.body){
          if(output.responseOptions.headers['content-type'] === 'application/json'){
            const code = document.createElement('code')
            code.textContent = output.body;
            const pre = document.createElement('pre')
            pre.appendChild(code);
            // the only child
            document.querySelector('#app').innerHTML = '';
            document.querySelector('#app').appendChild(pre);
          } else {
            const iframe = document.createElement('iframe');
            iframe.className = 'w-full h-screen';
            iframe.height = '100%';
            iframe.width = '100%';
            iframe.allow = 'fullscreen';
            iframe.sandbox = 'allow-scripts allow-same-origin';
            iframe.src = 'data:text/html;charset=utf-8,' + encodeURIComponent(output.body);
            document.querySelector('#app').innerHTML = '';
            document.querySelector('#app').appendChild(iframe);
          }
        }
    },
}">
  <h1>Pipedown</h1>
  <div class="flex">
    <div>
      <ul>${
    scriptsPaths.map((path: string) =>
      `<li>
            <button @click="() => run('${path}')" class="btn">Run</button>
            <a @click="fetchFile('${path}')">${path}</a>
        </li>`
    )
      .join("")
  }</ul>
    </div>
    <section class="flex-1"  id="app"></section>
  </div>
  <script src="//unpkg.com/alpinejs" defer></script>
  
  <script>
    function setupEventSource(refreshOnError){
      const eventSource = new EventSource('/sse');

      eventSource.onmessage = async function(event) {
          console.log(event.data);
          if(event.data === 'reload'){
            const event = new CustomEvent('pd:reload');
            document.dispatchEvent(event);
          }
      };
      eventSource.onerror = async function(event){
        console.log('here')
      }
    }
    setupEventSource();
  </script>
  
</body>
</html>
`;

async function watchFs(input: pdBuildInput) {
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

export async function serve(input: pdBuildInput){
  pdBuild(input);
  watchFs(input);

  const hostname = "127.0.0.1";
  const port = findOpenPort(8888);

  const handler = async (request: Request) => {
    const url = new URL(request.url);
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

    if (url.pathname === "/sse") {
      return tellClientToReload();
    }

    const scriptsPaths = [];
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