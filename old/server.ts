import { pipe } from "./out/scripts/pipes-28.json.js";

async function handler(request: Request): Response {
  console.log("Method:", request.method);

  const url = new URL(request.url);
  console.log("Path:", url.pathname);
  console.log("Query parameters:", url.searchParams);

  console.log("Headers:", request.headers);

  const output = await pipe().process({ request });

  if (output?.response) return output.response;

  return new Response("Not found (try /books/1)", {
    status: 404,
  });
}

Deno.serve({ port: 8001 }, handler);
