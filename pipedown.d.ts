
export type { WalkOptions } from "https://deno.land/std@0.206.0/fs/mod.ts";
import type {Token} from 'https://deno.land/x/rusty_markdown@v0.4.1/event.ts';
export type { Token } from 'https://deno.land/x/rusty_markdown@v0.4.1/event.ts';
// exclude TokenCommon<"start" | "end"> & TagCommon<SimpleTags> from Token
// export type Token = {
//     tag: string,
//     type: "start" | "end" | "text",
//     content: string,
//     level: number,
//     language: string,
// } & object;
export type PDError = {
    func: string,
} & Error;

export type Input = {
    // [key: string]: unknown;
    globalConfig? : object;
    request?: Request;
    response?: Response;
    errors?: PDError[];

    route?: object;
    flags?: object;

} & object;

export type Stage<T> = (input: T, opts: Pipe) => Promise<T> | void;
export type Pipeline<T extends object> = {
    stages: Stage<T>[],
    defaultArgs: T,
    pipe: (stage: Stage<T>) => Pipeline<T>,
    process: (args: T) => Promise<T>,
};
// export type Pipe<T> = {
//     name: string,
//     steps: Step[],
//     config: PipeConfig,
//     dir: string,
//     fileName: string,
// };
export type mdToPipeInput = {
    markdown: string,
    tokens: Token[],
    headings: number[],
    codeBlocks: number[],
    steps: Step[],
    pipeName: string,
    pipe: Pipe,
} & RangeFinderInput & Input;

export type Step =     {
  code: string,
  range: number[],
  name: string,
  funcName: string,
  inList: boolean,
  config?: {
    checks?: string[],
    routes?: string[],
    flags?: string[],
    only?: number,
    stop?: number,
  }
};
export type Steps = Step[];

export type PipeConfig  = {
    [key: string]: unknown;
    on?: {
        [key: string]: Array<string|{
            [key: string]: Input,
        }>
    },
    inputs?: Array<{
        [key: string]: Input,
    }>
    build?: string[],
};

export type Pipe = {
    name: string,
    camelName: string,
    steps: Step[],
    config?: PipeConfig,
    dir: string,
    fileName: string,
    checks?: {
        [key: string]: unknown;
    },
};

export type RangeFinderInput = {
    ranges: {
        token: Token,
        index: number,
        codeBlocks: number[][],
        headings: number[][],
        metaBlocks: number[][],
        lists: number[][],
    }
};

export type PipeToScriptInput = {
    pipe: Pipe;
    pipeImports?: string[];
    functions?: string[];
    script?: string;
    errors?: PDError[];    
} & Input;
