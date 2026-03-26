import { std } from "./deps.ts";

export function denoTestFileTemplate (pipeName: string){
  return `import {assertEquals} from "jsr:@std/assert" 
import { assertSnapshot } from "jsr:@std/testing/snapshot";
import {pipe, rawPipe} from "./index.ts";

Deno.test("${pipeName}", async (t) => {
  rawPipe.config = rawPipe.config || {};
  rawPipe.config.inputs = rawPipe.config.inputs || [];
  
  for(const pipeInput of rawPipe.config.inputs) {
    const testName = pipeInput?._name || JSON.stringify(pipeInput)
    pipeInput.mode = 'test';
    await t.step({
      name: testName,
      fn: async () => {
        pipeInput.test = true;
        const output = await pipe.process(pipeInput);
        try {
          await assertSnapshot(t, output, {name: testName});
        } catch (e) {
          console.log(output);
          throw e;
        }
      }
    })
  }
});`
}

export const denoReplEvalTemplate = (importNames: string[]) =>
  `${
    importNames
      .map((key: string) => {
        return `import { default as ${key.replace(/^\d+/, "")}, process as ${
          key.replace(/^\d+/, "")
        }Process } from "${key}";`;
      })
      .join("\n")
  }
import $p from "jsr:@pd/pointers@0.1.1";

function test(pipe, { exclude = [], test = true } = {}) {
  pipe.json.config.inputs.forEach(i => {
    const match = exclude.map(path => $p.get(i, path)).some(Boolean)
    if(match) return;

    i.test = test;
    pipe.process(i).then(output => {
      console.log('Input:: '+JSON.stringify(i))
      output.errors && output.errors.map(e => console.error(e.message))
      output.data && console.info(output.data)
      console.log('')
    })
  })
}

async function step(pipe, { exclude = [], test = true } = {}) {
  const wTestMode = pipe.json.config.inputs.map(i => { i.test = test; return i })
  const inputIterable = wTestMode[Symbol.iterator]();
  let notDone = true; 
  let continueLoop = true; 
  while(notDone && continueLoop) {
    const { value, done } = inputIterable.next();
    if(done) notDone = false;
    if(notDone) {
      const match = exclude.map(path => $p.get(value, path)).some(Boolean)
      if(match) continue;
      const output = await pipe.process(value)
      console.log('Input:: ' + JSON.stringify(value))
      continueLoop = confirm('Press Enter to continue');
      output.errors && output.errors.map(e => console.error(e.message))
      console.info(output)
      console.log('')
    }
  }
}

${
    importNames.map((key) =>
      `const test${key[0].toUpperCase() + key.substring(1)} = () => test(${
        key.replace(/^\d+/, "")
      });`
    ).join("\n")
  }
${
    importNames.map((key) =>
      `const step${key[0].toUpperCase() + key.substring(1)} = () => step(${
        key.replace(/^\d+/, "")
      });`
    ).join("\n")
  }
`;

export const pdCliTemplate = () =>
  `import pipe from "./index.ts"
import {parseArgs} from "jsr:@std/cli@1.0.28";
import $p from "jsr:@pd/pointers@0.1.1";

const flags = parseArgs(Deno.args);
const input = JSON.parse(flags.input || flags.i || '{}');
$p.set(input, "/flags", flags);
$p.set(input, "/mode/cli", true);

const output = await pipe.process(input)


if(flags.json || flags.j) {
  console.log(JSON.stringify(output));
} else {
 console.log(output);
}
Deno.exit(0);
`;

export const pdServerTemplate = () =>
  `import pipe from "./index.ts"
import {parseArgs} from "jsr:@std/cli@1.0.28";

const isDenoDeploy = Deno.env.has('DENO_DEPLOYMENT_ID');

function findOpenPort(defaultPort = 8000){
  let port = defaultPort;
  if(isDenoDeploy) return port;
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

const flags = parseArgs(Deno.args);
const hostname = flags.host || "127.0.0.1";
const port = flags.port || findOpenPort();

const handler = async (request: Request) => {
  console.log(request.url);
  const output = await pipe.process({request, body: {}, responseOptions: {
          headers: {
              "content-type": "application/json"
          },
          status: 200,
      },
      mode: {
          server: true,
          deploy: isDenoDeploy
      }
  });
  if(output.errors) {
      console.error(output.errors);
      return new Response(JSON.stringify(output.errors), {status: 500});
  }
  if(output.responseOptions.headers['content-type'] === 'application/json' && typeof output.body === 'object') {
      output.body = JSON.stringify(output.body);
  }
  const response = output.response || new Response(output.body, output.responseOptions);
  return response;
};

const server = Deno.serve({ handler, port, hostname });
server.finished.then(() => console.log("Server closed"));`;

export const pdWorkerTemplate = () =>
  `import pipe from "./index.ts"
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
});`;

export const cliHelpTemplate = ({ title, command, sections }: {
  title: string;
  command: string;
  sections: string[];
}) =>
  `${std.colors.bold(title)}
Usage: ${std.colors.green(command)}

${sections.join("\n\n")}
`;

export const helpText = cliHelpTemplate({
  title: "Pipedown (pd) — Markdown-to-executable pipeline tool",
  command: "pd <command> [args] [options]",
  sections: [
    `Description:
  Pipedown transforms markdown files into executable TypeScript pipelines.
  Each markdown file defines a pipeline of steps (fenced codeblocks under headings).
  Built artifacts are stored in the .pd/ directory.`,
    `Commands:

  Build & Generate:
    build                                   Parse all .md files in cwd and generate executable .ts in .pd/
    clean                                   Delete the .pd/ directory and all generated artifacts

  Run:
    run <file.md>                           Build and execute a pipeline. Accepts --input '<json>'
    run-step <file.md> <step-index>         Build and run steps 0..N, output the intermediate input object as JSON
    runWith <wrapper.md> <file.md> <input>  Build and run <file.md> wrapped by <wrapper.md>
    serve <file.md> <input>                 Build and start an HTTP server from a pipeline

  Inspect & List:
    list                                    List all .md files that have been processed in .pd/
    inspect <file.md> [step-index]          Output structured JSON describing a pipe's steps, config, and code

  Edit & Sync:
    llm <file> <index|heading> <prompt>     Use an LLM to generate or improve a specific codeblock in a pipeline
    sync <pipeName>                         Write .pd/<pipeName>/index.json back to the source .md file

  Watch & Interactive:
    watch                                   Watch .md files for changes, rebuild on save. Use --assist <path> for stub detection
    repl                                    Open a Deno REPL with all project pipes preloaded

  Test:
    test   (alias: t)                       Build and run snapshot tests for all pipelines
    test-update (alias: tu)                 Re-run tests and update snapshots

  Other:
    help                                    Show this help message
    version                                 Print the Pipedown version`,
    `Global Options:
  -j, --json      Print output as JSON
  -p, --pretty    Pretty-print JSON output
  -d, --debug     Display debug information
  -h, --help      Display help (global or per-command)
  -v, --version   Print the Pipedown version
  --input <json>  Provide initial input as a JSON string (used by run, run-step, serve)`,
    `Examples:
  pd build                                          # Build all .md pipelines
  pd run myPipe.md                                  # Build and run myPipe.md
  pd run myPipe.md --input '{"key": "value"}'       # Run with initial input
  pd run-step myPipe.md 2                           # Run steps 0-2, print intermediate state
  pd inspect myPipe.md                              # Dump full pipe structure as JSON
  pd inspect myPipe.md 0                            # Dump step 0 with preceding context
  pd llm myPipe 0 "Add error handling"              # LLM-edit step 0
  pd sync myPipe                                    # Write index.json back to .md source
  pd serve myPipe.md '{}'                           # Start HTTP server from pipeline
  pd watch --assist ./assist.md                     # Watch and detect incomplete steps
  pd test                                           # Run all snapshot tests
  pd test-update                                    # Update test snapshots

  Per-command help:  pd <command> --help`,
  ],
});
