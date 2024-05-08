export type { WalkOptions } from "jsr:@std/fs@0.224.0";

export type Token = {
    type: string,
    tag: string,
    content: string,
    level: number,
    kind: string,
    fenced: boolean,
    language: string,
    start_number: number,
    label: string,
    alignments: Array<string>,
    url: string,
    title: string,
    checked: boolean
}

export type Tokens = Token[];

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
