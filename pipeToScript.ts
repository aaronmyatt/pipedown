import type { PipeToScriptInput, Step } from "./pipedown.d.ts";
import { pd } from "./deps.ts";
import { sanitizeString } from "./pdUtils.ts";

const detectImports = /import.*from.*/gm;

/**
 * Deduplicate hoisted step imports while preserving first-seen order.
 *
 * We intentionally dedupe by exact import statement text instead of by module
 * specifier alone. For example, `import { a } from "x"` and
 * `import { b } from "x"` are both valid and not interchangeable, so only
 * literally repeated imports should collapse.
 *
 * JavaScript `Set` preserves insertion order during iteration, which makes it
 * a small, predictable fit for this build-time normalization pass.
 * Ref: https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Set
 *
 * @param imports - Hoisted import statements collected from all pipe steps
 * @returns Import statements with exact duplicates removed
 */
const dedupeImports = (imports: string[]): string[] => [...new Set(imports)];

export const pipeToScript = async (input: PipeToScriptInput) => {
  const extractImportsFromSteps = (input: PipeToScriptInput) => {
    input.pipeImports = dedupeImports(
      input.pipe.steps.reduce(
        (acc: string[], step: Step) => {
          const stepImports = step.code.matchAll(detectImports);
          if (stepImports) {
            for (const match of stepImports) {
              // Normalize leading/trailing whitespace before hoisting so that
              // semantically identical imports from different steps dedupe
              // cleanly in the generated module header.
              acc.push(match[0].trim());
            }
          }
          return acc;
        },
        [],
      )
        .filter((importStatement: string) => {
          return !importStatement.startsWith("//");
        }),
    );
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
    input.functions = input.pipe.steps.map((step: Step) => {
      return `export async function ${step.funcName} (input, opts) {
    ${step.code.replaceAll(detectImports, "")}
}`;
    });
    return input;
  };

  const scriptTemplate = (input: PipeToScriptInput) => {
    // ── Zod block detection ──
    // A \`\`\`zod block may contain:
    //   (a) An exported schema:  `export const schema = z.object({...})`
    //   (b) A non-exported schema: `const schema = z.object({...})`
    //   (c) Only helper definitions (no `schema` variable at all)
    //
    // Cases (a) and (b) trigger automatic validation wrappers (_pd_initSchema /
    // per-step _pd_validateSchema_<i>_<name>) and the `PipeInput` type alias.
    // Case (c) injects the zod definitions at module level so step code can
    // reference them (e.g. `MyType.parse(...)`) but skips validation wrappers.
    // Ref: https://zod.dev/?id=basic-usage
    const schemaText = input.pipe.schema ?? "";
    const hasZodBlock = schemaText.length > 0;

    // Detect whether the zod block defines a variable literally named `schema`.
    // Matches both `export const schema` and plain `const schema`.
    // This drives whether we generate the validation pipeline wrappers.
    const hasSchemaVar = hasZodBlock &&
      /(?:export\s+)?const\s+schema\s*=/.test(schemaText);

    // Always import zod when a ```zod block exists — even helper-only blocks
    // need the `z` namespace in scope.
    const zodImport = hasZodBlock ? 'import { z } from "npm:zod";' : "";

    const schemaImports = hasZodBlock
      ? [...schemaText.matchAll(detectImports)].map((match) => match[0])
      : [];

    if (schemaImports.length > 0) {
      console.warn(
        "Warning: removing import statements from pipe schema block; only the generated zod import is preserved. Removed imports: " +
          schemaImports.join(", "),
      );
    }

    // Strip import statements from schema text before injecting it into the
    // generated module. Schema imports are not hoisted automatically; only the
    // generated zod import above is preserved.
    const schemaBody = hasZodBlock
      ? schemaText.replaceAll(/import.*from.*/gm, "").trim()
      : "";

    // Step names needed both for schemaBlock generation and funcSequence construction
    const stepNames = input.pipe.steps.map((step: Step) => step.funcName);

    // ── Build the schema block that gets injected at module level ──
    // When `schema` is defined → full validation wrappers + PipeInput type.
    // When only helper types exist → inject definitions only (no wrappers).
    //
    // Step-specific validation wrappers (from main): each step gets its own
    // `_pd_validateSchema_<index>_<funcName>` function so that zod errors
    // clearly identify which step caused the validation failure.
    // Ref: https://zod.dev/?id=safeParse (safeParse returns { success, data | error })
    let schemaBlock = "";
    if (hasZodBlock && hasSchemaVar) {
      // Full schema mode: inject definitions + step-specific validation helpers
      schemaBlock = `
// ── Pipe schema — validates input at every step boundary ──
${schemaBody}
export type PipeInput = z.infer<typeof schema>;

// Validates the raw input before the first step runs.
// Reports errors as step index -1 ("pre-pipeline") so they are
// visually distinct from per-step validation failures.
function _pd_initSchema(input) {
  const result = schema.safeParse(input);
  if (result.success) {
    Object.assign(input, result.data);
  } else {
    input.errors = input.errors || [];
    input.errors.push({
      func: "_pd_initSchema",
      step: "(initial input)",
      stepIndex: -1,
      message: "Schema validation failed on initial input: " + result.error.message,
      issues: result.error.issues,
    });
  }
}

${stepNames.map((name: string, index: number) => String.raw`
// Post-step validator for step ${index}: "${name}"
// Runs immediately after "${name}" to ensure it left the input
// in a schema-valid state.
function _pd_validateSchema_${index}_${name}(input) {
  const result = schema.safeParse(input);
  if (!result.success) {
    input.errors = input.errors || [];
    input.errors.push({
      func: "_pd_validateSchema",
      step: "${name}",
      stepIndex: ${index},
      message: "Schema validation failed after step ${index} (${name}): " + result.error.message,
      issues: result.error.issues,
    });
  }
}
`).join("")}
`;
    } else if (hasZodBlock) {
      // Helper-only mode: inject zod definitions at module level without
      // validation wrappers. Step code can reference these types directly,
      // e.g. `AggregatedDeveloper.parse(data)`.
      schemaBlock = `
// ── Zod definitions (no pipe-level schema) ──
${schemaBody}
`;
    }

    // ── Build the function sequence ──
    // When a `schema` variable exists, wrap each step with its own named
    // validator: init → step0 → validate_0_step0 → step1 → validate_1_step1
    // Each validator is unique per step so errors report the exact step context.
    // Otherwise (no schema or helper-only), just chain the steps directly.
    let funcSequenceItems: string;
    if (hasSchemaVar) {
      const withValidation = stepNames.flatMap(
        (name: string, index: number) => [name, `_pd_validateSchema_${index}_${name}`],
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
${input.pipeImports?.join("\n")}
${schemaBlock}
${input.functions?.join("\n")}

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
