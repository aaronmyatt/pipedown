import type { BuildInput } from "../pipedown.d.ts";
import { std } from "../deps.ts";

import { pdBuild } from "../pdBuild.ts";
import { reportErrors } from "./reportErrors.ts";
import { scanTraces, readTrace, tracePage } from "./traceDashboard.ts";
import { enrichProjects, readProjectsRegistry, scanProjectPipes, readPipeMarkdown, projectsPage } from "./projectsDashboard.ts";
import { scanRecentPipes, readPipeIndex, recentStepTraces, homePage } from "./homeDashboard.ts";
import { loadPipeContext, findTargetStep, buildContextPrompt, callLLM } from "./llmCommand.ts";

let _controller: ReadableStreamDefaultController<string> | null = null;

const lazyIO = std.debounce(async (input = { errors: [] }) => {
  Object.assign(input, await pdBuild(input));
  _controller && _controller.enqueue("data: reload\n\n");
  if (input.errors && input.errors.length > 0) {
    reportErrors(input);
  }
  input.errors = [];
}, 200);

// Helper to resolve a project path from the registry by name
async function resolveProject(name: string): Promise<{ name: string; path: string } | null> {
  const raw = await readProjectsRegistry();
  return raw.find((p) => p.name === name) || null;
}

// Helper to run a shell command and stream output back
function spawnAndStream(cmd: string[], cwd?: string): Response {
  const process = new Deno.Command(cmd[0], {
    args: cmd.slice(1),
    stdout: "piped",
    stderr: "piped",
    cwd,
  });
  const child = process.spawn();
  const merged = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const dec = new TextDecoder();
      async function pump(stream: ReadableStream<Uint8Array>) {
        const reader = stream.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(enc.encode(dec.decode(value)));
        }
      }
      await Promise.all([pump(child.stdout), pump(child.stderr)]);
      controller.close();
    },
  });
  return new Response(merged, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

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

    // --- Home dashboard API routes ---

    // Recent pipes (flat list across all projects)
    if (url.pathname === "/api/recent-pipes") {
      const pipes = await scanRecentPipes();
      return new Response(JSON.stringify(pipes), {
        headers: { "content-type": "application/json" },
      });
    }

    // Pipe index.json (parsed pipe data for toolbar binding)
    if (url.pathname.match(/^\/api\/projects\/[^/]+\/pipes\/[^/]+\/index$/)) {
      const segments = url.pathname.split("/");
      const projectName = decodeURIComponent(segments[3]);
      const pipeName = decodeURIComponent(segments[5]);
      const project = await resolveProject(projectName);
      if (!project) return new Response("Project not found", { status: 404 });
      const data = await readPipeIndex(project.path, pipeName);
      if (!data) return new Response("Pipe index not found (run pd build first)", { status: 404 });
      return new Response(JSON.stringify(data), {
        headers: { "content-type": "application/json" },
      });
    }

    // Step traces for a specific pipe
    if (url.pathname.match(/^\/api\/projects\/[^/]+\/pipes\/[^/]+\/traces$/)) {
      const segments = url.pathname.split("/");
      const projectName = decodeURIComponent(segments[3]);
      const pipeName = decodeURIComponent(segments[5]);
      const stepParam = url.searchParams.get("step");
      const limitParam = url.searchParams.get("limit");
      const stepIndex = stepParam !== null ? parseInt(stepParam) : 0;
      const limit = limitParam ? parseInt(limitParam) : 5;
      const data = await recentStepTraces(projectName, pipeName, stepIndex, limit);
      return new Response(JSON.stringify(data), {
        headers: { "content-type": "application/json" },
      });
    }

    // --- Action API routes (POST) ---

    if (request.method === "POST" && url.pathname === "/api/llm") {
      try {
        const body = await request.json();
        const { action, project: projectName, pipe: pipeName, stepIndex, prompt: userPrompt } = body;
        const project = await resolveProject(projectName);
        if (!project) return new Response("Project not found", { status: 404 });

        const steps = await loadPipeContext(pipeName, project.path);
        let result: string;

        if (action === "description") {
          const contextPrompt = `Generate a concise description for this pipeline based on its steps:\n${JSON.stringify(steps.map((s: { name: string; code: string }) => ({ name: s.name, code: s.code })), null, 2)}\n\nProvide only the description text, no markdown formatting.`;
          result = await callLLM(contextPrompt);
        } else if (action === "schema") {
          const contextPrompt = `Generate a Zod schema for the input/output of this pipeline:\n${JSON.stringify(steps.map((s: { name: string; code: string }) => ({ name: s.name, code: s.code })), null, 2)}\n\nProvide only the Zod schema code.`;
          result = await callLLM(contextPrompt);
        } else if (action === "tests") {
          const contextPrompt = `Generate test input objects for this pipeline:\n${JSON.stringify(steps.map((s: { name: string; code: string }) => ({ name: s.name, code: s.code })), null, 2)}\n\nProvide JSON array of test inputs.`;
          result = await callLLM(contextPrompt);
        } else if (action === "step-title" && stepIndex !== undefined) {
          const { step } = findTargetStep(steps, "" + stepIndex);
          const contextPrompt = `Suggest a better title for this pipeline step:\nCurrent title: ${step.name}\nCode:\n${step.code}\n\nProvide only the title text.`;
          result = await callLLM(contextPrompt);
        } else if (action === "step-description" && stepIndex !== undefined) {
          const { step } = findTargetStep(steps, "" + stepIndex);
          const contextPrompt = `Write a brief description for this pipeline step:\nTitle: ${step.name}\nCode:\n${step.code}\n\nProvide only the description text.`;
          result = await callLLM(contextPrompt);
        } else if (action === "step-code" && stepIndex !== undefined) {
          const contextPrompt = buildContextPrompt(steps, stepIndex, userPrompt || "Improve this code");
          result = await callLLM(contextPrompt);
        } else {
          return new Response("Unknown action: " + action, { status: 400 });
        }

        return new Response(JSON.stringify({ result }), {
          headers: { "content-type": "application/json" },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: (e as Error).message }), {
          status: 500,
          headers: { "content-type": "application/json" },
        });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/run") {
      try {
        const body = await request.json();
        const project = await resolveProject(body.project);
        if (!project) return new Response("Project not found", { status: 404 });
        const pdPath = std.join(project.path, ".pd", body.pipe, "index.ts");
        const configPath = std.join(project.path, ".pd", "deno.json");
        return spawnAndStream(
          [Deno.execPath(), "run", "--unstable-kv", "-A", "-c", configPath, "--no-check", pdPath],
          project.path,
        );
      } catch (e) {
        return new Response("Error: " + (e as Error).message, { status: 500 });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/run-step") {
      try {
        const body = await request.json();
        const project = await resolveProject(body.project);
        if (!project) return new Response("Project not found", { status: 404 });

        const pipeDir = std.join(project.path, ".pd", body.pipe);
        const indexJsonPath = std.join(pipeDir, "index.json");
        const indexTsPath = std.join(pipeDir, "index.ts");
        const configPath = std.join(project.path, ".pd", "deno.json");

        const pipeData = JSON.parse(await Deno.readTextFile(indexJsonPath));
        const stepIndex = body.stepIndex;
        if (stepIndex >= pipeData.steps.length) {
          return new Response("Step index out of range", { status: 400 });
        }

        const stepFuncNames = pipeData.steps
          .slice(0, stepIndex + 1)
          .map((s: { funcName: string }) => s.funcName);

        const inputJson = body.input || "{}";
        const escapedInput = inputJson.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

        const evalScript = `
import { ${stepFuncNames.join(", ")} } from "file://${indexTsPath}";
import rawPipe from "file://${indexJsonPath}" with {type: "json"};
const input = JSON.parse('${escapedInput}');
const opts = rawPipe;
const steps = [${stepFuncNames.join(", ")}];
for (const step of steps) {
  try { await step(input, opts); } catch (e) {
    input.errors = input.errors || [];
    input.errors.push({ func: step.name, message: e.message });
  }
}
console.log(JSON.stringify(input, null, 2));
`;
        const tmpFile = std.join(pipeDir, `_run_step_${Date.now()}.ts`);
        await Deno.writeTextFile(tmpFile, evalScript);
        try {
          return spawnAndStream(
            [Deno.execPath(), "run", "--unstable-kv", "-A", "-c", configPath, "--no-check", tmpFile],
            project.path,
          );
        } finally {
          // Cleanup is tricky with streaming; schedule it
          setTimeout(() => Deno.remove(tmpFile).catch(() => {}), 30000);
        }
      } catch (e) {
        return new Response("Error: " + (e as Error).message, { status: 500 });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/test") {
      try {
        const body = await request.json();
        const project = await resolveProject(body.project);
        if (!project) return new Response("Project not found", { status: 404 });
        return spawnAndStream(
          [Deno.execPath(), "test", "--unstable-kv", "-A", "--no-check"],
          project.path,
        );
      } catch (e) {
        return new Response("Error: " + (e as Error).message, { status: 500 });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/pack") {
      try {
        const body = await request.json();
        const project = await resolveProject(body.project);
        if (!project) return new Response("Project not found", { status: 404 });
        return spawnAndStream(
          [Deno.execPath(), "run", "-A", "--no-check", "jsr:@niceguyyo/pipedown", "pack"],
          project.path,
        );
      } catch (e) {
        return new Response("Error: " + (e as Error).message, { status: 500 });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/open-editor") {
      try {
        const body = await request.json();
        const filePath = body.filePath;
        // Validate path is within a registered project
        const projects = await readProjectsRegistry();
        const isValid = projects.some((p) => filePath.startsWith(p.path));
        if (!isValid) return new Response("Path not within a registered project", { status: 403 });
        const cmd = new Deno.Command("code", { args: [filePath] });
        await cmd.output();
        return new Response("OK");
      } catch (e) {
        return new Response("Error: " + (e as Error).message, { status: 500 });
      }
    }

    // --- Existing API routes ---

    // Projects API: list all projects enriched with mtime
    if (url.pathname === "/api/projects") {
      const raw = await readProjectsRegistry();
      const enriched = await enrichProjects(raw);
      return new Response(JSON.stringify(enriched), {
        headers: { "content-type": "application/json" },
      });
    }

    // Projects API: list pipes for a project
    if (url.pathname.match(/^\/api\/projects\/[^/]+\/pipes$/)) {
      const name = decodeURIComponent(url.pathname.split("/")[3]);
      const raw = await readProjectsRegistry();
      const project = raw.find((p) => p.name === name);
      if (!project) {
        return new Response("Project not found", { status: 404 });
      }
      try {
        let pipes;
        if (project.pipes) {
          pipes = await Promise.all(project.pipes.map(async (p) => {
            const absPath = std.join(project.path, p.path);
            try {
              const stat = await Deno.stat(absPath);
              return { name: p.name, path: p.path, mtime: stat.mtime?.toISOString() || null };
            } catch {
              return { name: p.name, path: p.path, mtime: null };
            }
          }));
          pipes.sort((a: { mtime: string | null }, b: { mtime: string | null }) =>
            (b.mtime || "").localeCompare(a.mtime || ""));
        } else {
          pipes = await scanProjectPipes(project.path);
        }
        return new Response(JSON.stringify(pipes), {
          headers: { "content-type": "application/json" },
        });
      } catch {
        return new Response("Project directory not accessible", { status: 404 });
      }
    }

    // Projects API: read a markdown file
    if (url.pathname.match(/^\/api\/projects\/[^/]+\/files\/.+$/)) {
      const segments = url.pathname.split("/");
      const name = decodeURIComponent(segments[3]);
      const filePath = decodeURIComponent(segments.slice(5).join("/"));
      const raw = await readProjectsRegistry();
      const project = raw.find((p) => p.name === name);
      if (!project) {
        return new Response("Project not found", { status: 404 });
      }
      try {
        const content = await readPipeMarkdown(project.path, filePath);
        return new Response(content, {
          headers: { "content-type": "text/plain; charset=utf-8" },
        });
      } catch (e) {
        const status = (e as Error).message?.includes("traversal") ? 403 : 404;
        return new Response((e as Error).message || "File not found", { status });
      }
    }

    // Projects dashboard page
    if (url.pathname === "/projects") {
      return new Response(projectsPage(), {
        headers: { "content-type": "text/html" },
      });
    }

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

    // Default: home dashboard (recent pipes with toolbar overlays)
    return new Response(homePage(), {
      headers: { "content-type": "text/html" },
    });
  }

  console.log('wat')

  const server = Deno.serve({ handler, port, hostname });
  await server.finished.then(() => console.log("Server closed"));
}
