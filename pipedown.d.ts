// import type {Token} from 'https://deno.land/x/rusty_markdown@v0.4.1/event.ts';
// exclude TokenCommon<"start" | "end"> & TagCommon<SimpleTags> from Token
type Token = {
    tag: string,
    type: "start" | "end" | "text",
    content: string,
    level: number,
    language: string,
} & object;
type PDError = {
    func: string,
} & Error;

type Input = {
    [key: string]: unknown;
    request?: Request;
    response?: Response;
    errors?: PDError[];
} & object;

type Stage<T> = (input: T, opts: Pipe) => Promise<T> | void;
type Pipeline<T extends object> = {
    stages: Stage<T>[],
    defaultArgs: T,
    pipe: (stage: Stage<T>) => Pipeline<T>,
    process: (args: T) => Promise<T>,
};
// type Pipe<T> = {
//     name: string,
//     steps: Step[],
//     config: PipeConfig,
//     dir: string,
//     fileName: string,
// };
type mdToPipeInput = {
    markdown: string,
    tokens: Token[],
    headings: number[],
    codeBlocks: number[],
    steps: Step[],
    pipeName: string,
    pipe: Pipe,
} & RangeFinderInput & Input;

type Step =     {
  code: string,
  range: number[],
  name: string|number,
  funcName: string,
  inList: boolean,
  config?: {
    check?: string[],
    route?: string[],
    flags?: string[],
  }
};
type Steps = Step[];

type PipeConfig  = {
    [key: string]: unknown;
    on?: {
        [key: string]: Array<string|{
            [key: string]: Input,
        }>
    },
    inputs?: Array<{
        [key: string]: Input,
    }>
    build: string[],
};

type Pipe = {
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

type RangeFinderInput = {
    ranges: {
        token: Token,
        index: number,
        codeBlocks: number[][],
        headings: number[][],
        metaBlocks: number[][],
        lists: number[][],
    }
};

type PipeToScriptInput = {
    pipe?: Pipe;
    pipeImports?: string[];
    functions?: string[];
    script?: string;
}
