import type {PipeToScriptInput} from "./pipedown.d.ts";
import { process } from "jsr:@pd/pdpipe@0.1.1";
import {camelCaseString} from "./pdUtils.ts";

const PD_IMPORTS = [`import Pipe from "${REMOTE_PDPIPE_PATH}";`, `import {$p} from "${PD_PIPE_DIR}/jsonPointers.ts"`];

const camelCaseString = (s: string) => {
    return s.replace(/(?:^\w|[A-Z]|\b\w)/g, function (word, index) {
        return index === 0 ? word.toLowerCase() : word.toUpperCase();
    }).replace(/\s+/g, "");
};

const detectImports = /import.*from.*/gm;
const detectZod = /z\./;
const toggleZod = (code: string) => {
    const zodImport = `import {z} from "https://deno.land/x/zod/mod.ts";`;
    if (code.match(detectZod) && !PD_IMPORTS.includes(zodImport)) {
        PD_IMPORTS.push(zodImport);
    }
    return code;
};

export const pipeToScript = async (input: PipeToScriptInput) => {
    const extractImportsFromSteps = (input: PipeToScriptInput) => {
        const pipeImports: string[] = input.pipe.steps.reduce((acc: string[], step: Step) => {
            const stepImports = step.code.matchAll(detectImports);
            toggleZod(step.code);
            if (stepImports) {
                for (const match of stepImports) {
                    acc.push(match[0]);
                }
            }
            return acc;
        }, [])
            .filter((importStatement: string) => {
                return !importStatement.startsWith("//");
            });

        input.pipeImports = [...PD_IMPORTS, ...pipeImports];
        return input;
    };

    const camelCaseStepNames = (input: PipeToScriptInput) => {
        input.pipe.steps = input.pipe.steps.map((step: Step) => {
            // if step.name is a number, prepend 'anonymous' and use as funcName
            if (typeof step.name === "number") {
                step.funcName = `anonymous${step.name}`;
                return step;
            }
            step.funcName = camelCaseString(step.name);
            return step;
        });
        return input;
    };

    const stepsToFunctions = (input: PipeToScriptInput) => {
        input.functions = input.pipe.steps.map((step: Step) => {
            return `async function ${step.funcName} (input, opts={$: {}, $p: {}}) {
            const {$, $p} = opts;
            ${step.code.replaceAll(detectImports, "")}
        }`;
        });
        return input;
    };

    const scriptTemplate = (input: PipeToScriptInput) => {
        input.script =
            `// deno-lint-ignore-file ban-unused-ignore no-unused-vars require-await
${input.pipeImports.join("\n")}
${input.functions.join("\n")}
const funcSequence = [${input.pipe.steps.map((step: Step) => step.funcName).join(", ")}]

const rawPipe = ${JSON.stringify(input.pipe, null, 2)}
const pipe = Pipe(funcSequence, rawPipe);
pipe.json = rawPipe;
export default pipe;
export { pipe, rawPipe }
`;
        return input;
    };

    const funcs = [
        extractImportsFromSteps,
        camelCaseStepNames,
        stepsToFunctions,
        scriptTemplate,
    ];

    const output = await process<PipeToScriptInput>(funcs, input, {});

    if (
        Deno.env.get("DEBUG") || Deno.args.includes("--debug") ||
        Deno.args.includes("-d") || Deno.args.includes("--DEBUG") ||
        Deno.args.includes("-D")
    ) {
        if (output.errors && output.errors.length > 0) {
            return {success: false, script: '', errors: output.errors, ...output}
        } else {
            return {success: true, script: output.script, ...output};
        }
    } else {
        if (output.errors && output.errors.length > 0) {
            return {success: false, script: '', errors: output.errors}
        } else {
            return {success: true, script: output.script};
        }
    }
};
