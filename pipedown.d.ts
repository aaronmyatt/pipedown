export type { WalkOptions } from "jsr:@std/fs@1.0.3";
import type { Args } from "jsr:@std/cli@1.0.6";
import type { WalkEntry } from "jsr:@std/fs@1.0.3/walk";
import type { ParsedPath } from "jsr:@std/path@1.0.4/parse";
import type { BuildOptions } from "npm:esbuild@0.23.1";

export type Token = {
    type: string;
    tag: string;
    content: string;
    level: number;
    kind: string;
    fenced: boolean;
    language: string;
    start_number: number;
    label: string;
    alignments: Array<string>;
    url: string;
    title: string;
    checked: boolean;
};

export type Tokens = Token[];

export type PDError = {
    func: string;
} & Error;

export type Input = {
    globalConfig?: PipeConfig;
    request?: Request;
    response?: Response;
    errors?: PDError[];

    route?: object;
    flags?: object;
} & object;

export type Stage<T> = (input: T, opts: Pipe) => Promise<T> | void;

export type mdToPipeInput =
    & {
        markdown: string;
        tokens: Token[];
        headings: number[];
        codeBlocks: number[];
        steps: Step[];
        pipeName: string;
        pipe: Pipe;
    }
    & RangeFinderInput
    & Input;

export type Step = {
    code: string;
    range: number[];
    name: string;
    funcName: string;
    inList: boolean;
    internal?: boolean;
    config?: {
        checks?: string[];
        or?: string[];
        and?: string[];
        not?: string[];
        routes?: string[];
        flags?: string[];
        only?: number;
        stop?: number;
    };
};
export type Steps = Step[];

export type PipeConfig = {
    [key: string]: unknown;
    inputs?: Array<{
        [key: string]: Input;
    }>;
    templates?: {
        [key: string]: string;
    };
    build?: BuildOptions[];
    skip?: RegExp[];
    exclude?: RegExp[];
    checks?: string[];
    or?: string[];
    and?: string[];
    not?: string[];
    routes?: string[];
    flags?: string[];
    only?: number;
    stop?: number;
};

export type Pipe = {
    name: string;
    cleanName: string;
    steps: Step[];
    mdPath: string;
    config?: PipeConfig;
    dir: string;
    absoluteDir: string;
    fileName: string;
    checks?: {
        [key: string]: unknown;
    };
};

export type RangeFinderInput = {
    ranges: {
        token: Token;
        index: number;
        codeBlocks: number[][];
        headings: number[][];
        metaBlocks: number[][];
        lists: number[][];
    };
};

export type PipeToScriptInput = {
    pipe: Pipe;
    pipeImports?: string[];
    functions?: string[];
    script?: string;
    errors?: PDError[];
} & Input;

export interface CliInput extends Input {
    flags: Args;
    globalConfig: PipeConfig;
    projectPipes: Array<{ path: string; entry: WalkEntry } & ParsedPath>;
    errors?: Array<PDError>;
    output: Input;
    debug: boolean | string;
    match?: string;
}

export interface BuildInput extends CliInput {
    markdown?: {
        [key: string]: string;
    };
    importMap?: {
        imports: {
            [key: string]: string;
        };
        lint: {
            include: string[];
            exclude: string[];
        };
    };
    pipes?: Pipe[];
    warning?: string[];
    match?: string;
    markdownFilesProcesses?: number;
}
