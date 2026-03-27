import type { PipeToScriptInput, Step } from "./pipedown.d.ts";
import { pd } from "./deps.ts";
import { sanitizeString } from "./pdUtils.ts";

const detectImports = /import.*from.*/gm;

export const pipeToScript = async (input: PipeToScriptInput) => {
  const extractImportsFromSteps = (input: PipeToScriptInput) => {
    input.pipeImports = input.pipe.steps.reduce(
      (acc: string[], step: Step) => {
        const stepImports = step.code.matchAll(detectImports);
        if (stepImports) {
          for (const match of stepImports) {
            acc.push(match[0]);
          }
        }
        return acc;
      },
      [],
    )
      .filter((importStatement: string) => {
        return !importStatement.startsWith("//");
      });
    return input;
  };

  const sanitizeStepNames = (input: PipeToScriptInput) => {
    input.pipe.steps = input.pipe.steps.map((step: Step) => {
      // if step.name is a number, prepend 'anonymous' and use as funcName
      if (typeof step.name === "number") {
        step.funcName = `anonymous${step.name}`;
        return step;
      }
      step.funcName = sanitizeString(step.name);
      return step;
    });
    return input;
  };

  const stepsToFunctions = (input: PipeToScriptInput) => {
    input.functions = input.pipe && input.pipe.steps.map((step: Step) => {
      return `export async function ${step.funcName} (input, opts) {
    ${step.code.replaceAll(detectImports, "")}
}`;
    });
    return input;
  };

  const scriptTemplate = (input: PipeToScriptInput) => {
    const hasSchema = !!input.pipe.schema;

    const zodImport = hasSchema ? 'import { z } from "npm:zod";' : "";
    // Strip import statements from schema text — they're hoisted to the top
    const schemaBody = hasSchema
      ? input.pipe.schema!.replace(/import.*from.*/gm, "").trim()
      : "";

    const schemaBlock = hasSchema ? `
// Pipe schema — validates input at every step boundary
${schemaBody}
export type PipeInput = z.infer<typeof schema>;

function _pd_initSchema(input) {
  const result = schema.safeParse(input);
  if (result.success) {
    Object.assign(input, result.data);
  } else {
    input.errors = input.errors || [];
    input.errors.push({ func: "_pd_initSchema", message: result.error.message, issues: result.error.issues });
  }
}

function _pd_validateSchema(input) {
  const result = schema.safeParse(input);
  if (!result.success) {
    input.errors = input.errors || [];
    input.errors.push({ func: "_pd_validateSchema", message: result.error.message, issues: result.error.issues });
  }
}
` : "";

    // When schema exists, wrap each step with validation:
    // init → step1 → validate → step2 → validate → ...
    const stepNames = input.pipe.steps.map((step: Step) => step.funcName);
    let funcSequenceItems: string;
    if (hasSchema) {
      const withValidation = stepNames.flatMap(
        (name: string) => [name, "_pd_validateSchema"],
      );
      funcSequenceItems = ["_pd_initSchema", ...withValidation].join(", ");
    } else {
      funcSequenceItems = stepNames.join(", ");
    }

    input.script =
      `// deno-lint-ignore-file ban-unused-ignore no-unused-vars require-await
import Pipe from "jsr:@pd/pdpipe@0.2.2";
import $p from "jsr:@pd/pointers@0.1.1";
${zodImport}
${input.pipe.config?.build ? '' : 'import "jsr:@std/dotenv/load";'}
import rawPipe from "./index.json" with {type: "json"};
${input.pipeImports && input.pipeImports.join("\n")}
${schemaBlock}
${input.functions && input.functions.join("\n")}

const funcSequence = [
${funcSequenceItems}
]
const pipe = Pipe(funcSequence, rawPipe);
const process = (input={}) => pipe.process(input);
pipe.json = rawPipe;
export default pipe;
export { pipe, rawPipe, process };
`;
    return input;
  };

  const funcs = [
    extractImportsFromSteps,
    sanitizeStepNames,
    stepsToFunctions,
    scriptTemplate,
  ];

  const output = await pd.process<PipeToScriptInput>(funcs, input, {});

  const hasErrors = output.errors && output.errors.length > 0;
  let debugEnvEnabled = false;
  try {
    debugEnvEnabled = Boolean(Deno.env.get("DEBUG"));
  } catch {
    debugEnvEnabled = false;
  }
  const isDebug = debugEnvEnabled ||
    ["-d", "-D", "--debug", "--DEBUG"].some((flag) => Deno.args.includes(flag));

  // In debug mode, spread the full pipeline output for introspection
  const base = isDebug ? { ...output } : {};

  return hasErrors
    ? { ...base, success: false, script: "", errors: output.errors }
    : { ...base, success: true, script: output.script };
};
