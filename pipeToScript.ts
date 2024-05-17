import type {PipeToScriptInput, Step} from "./pipedown.d.ts";
import { pd } from "./deps.ts";
import {camelCaseString} from "./pdUtils.ts";

const detectImports = /import.*from.*/gm;

export const pipeToScript = async (input: PipeToScriptInput) => {
    const extractImportsFromSteps = (input: PipeToScriptInput) => {
        const pipeImports: string[] = input.pipe.steps.reduce((acc: string[], step: Step) => {
            const stepImports = step.code.matchAll(detectImports);
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

        input.pipeImports = pipeImports;
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
        input.functions = input.pipe && input.pipe.steps.map((step: Step) => {
            return `async function ${step.funcName} (input, opts) {
            ${step.code.replaceAll(detectImports, "")}
        }`;
        });
        return input;
    };

    const scriptTemplate = (input: PipeToScriptInput) => {
        input.script =
            `// deno-lint-ignore-file ban-unused-ignore no-unused-vars require-await
import Pipe from "jsr:@pd/pdpipe@0.1.1";
import $p from "jsr:@pd/pointers@0.1.1";
${input.pipeImports && input.pipeImports.join("\n")}
${input.functions && input.functions.join("\n")}
const funcSequence = [${input.pipe && input.pipe.steps.map((step: Step) => step.funcName).join(", ")}]

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

    const output = await pd.process<PipeToScriptInput>(funcs, input, {});

    if (
        Deno.env.get("DEBUG") || Deno.args.includes("--debug") ||
        Deno.args.includes("-d") || Deno.args.includes("--DEBUG") ||
        Deno.args.includes("-D")
    ) {
        if (output.errors && output.errors.length > 0) {
            return {success: false, script: '', ...output, errors: output.errors}
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
