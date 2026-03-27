import { std } from "./deps.ts";

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
  pd run-with server myPipe.md                      # Run with a user template in the templates/ directory
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
