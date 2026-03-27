import pipe from "./index.ts"
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
server.finished.then(() => console.log("Server closed"));
