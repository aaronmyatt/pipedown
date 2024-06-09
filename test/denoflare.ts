import pipe from "./index.ts";
export default {
  async fetch(request: Request): Promise<Response> {
    const output = await pipe.process({
      request,
      body: {},
      responseOptions: {
        headers: {
          "content-type": "application/json",
        },
        status: 200,
      },
      mode: {
        server: true,
      },
    });
    if (output.errors) {
      console.error(output.errors);
      return new Response(JSON.stringify(output.errors), { status: 500 });
    }
    if (
      output.responseOptions.headers["content-type"] === "application/json" &&
      typeof output.body === "object"
    ) {
      output.body = JSON.stringify(output.body);
    }
    const response = output.response ||
      new Response(output.body, output.responseOptions);
    return response;
  },
};
