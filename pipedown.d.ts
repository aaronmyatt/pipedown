export type { WalkOptions } from "jsr:@std/fs@1.0.5";
import type { Args } from "jsr:@std/cli@1.0.6";
import type { WalkEntry } from "jsr:@std/fs@1.0.5/walk";
import type { ParsedPath } from "jsr:@std/path@1.0.7/parse";
import type { BuildOptions } from "npm:esbuild@0.25.4";

/** A markdown-it token with both standard and legacy properties. */
export type Token = {
    type: string;
    tag: string;
    content: string;
    level?: number;
    info?: string;
    markup?: string;
    map?: [number, number];
    block?: boolean;
    children?: Token[];
    attrGet?: (name: string) => string | null;
    attrSet?: (name: string, value: string) => void;
    // Legacy properties for compatibility
    kind?: string;
    fenced?: boolean;
    language?: string;
    start_number?: number;
    label?: string;
    alignments?: Array<string>;
    url?: string;
    title?: string;
    checked?: boolean;
};

export type Tokens = Token[];

/** An error captured during pipeline execution. */
export type PDError = {
    func: string;
} & Error;

/** The data object that flows through all pipeline steps. */
export type Input = {
    globalConfig?: PipeConfig;
    request?: Request;
    response?: Response;
    errors?: PDError[];
    route?: object;
    flags?: object;
    mode?: Record<string, boolean>;
    only?: number;
    stop?: number;
    [key: string]: unknown;
};

/** A single stage/function in a pipeline. */
export type Stage<T = Input> = (input: T, opts: Pipe) => Promise<T> | T | void;

/** Internal input type for the mdToPipe parser pipeline. */
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

/** A single executable step extracted from a markdown code block. */
export type Step = {
    /** The raw code content of the ts/js code block. */
    code: string;
    /** Token range [startIndex, endIndex] in the parsed token array. */
    range: number[];
    /** The step name, derived from the preceding heading. */
    name: string;
    /** Sanitized function name used in generated TypeScript. */
    funcName: string;
    /** Whether this code block is nested inside a list (for conditionals). */
    inList: boolean;
    /** Whether this is an internal/system step (not user-authored). */
    internal?: boolean;
    /** Conditional execution configuration extracted from list directives. */
    config?: StepConfig;
};

/** Configuration for conditional step execution. */
export type StepConfig = {
    /** JSON pointer paths — step runs if any is truthy. */
    checks?: string[];
    /** JSON pointer paths — step runs if ANY is truthy (logical OR). */
    or?: string[];
    /** JSON pointer paths — step runs only if ALL are truthy (logical AND). */
    and?: string[];
    /** JSON pointer paths — step runs only if ALL are falsy (logical NOT). */
    not?: string[];
    /** URL patterns for route matching. */
    routes?: string[];
    /** Flag paths (auto-prefixed with /flags). */
    flags?: string[];
    /** If set, only this step index runs. */
    only?: number;
    /** If set, pipeline stops after this step index. */
    stop?: number;
};

export type Steps = Step[];

/** Pipeline configuration from JSON blocks and config.json files. */
export type PipeConfig = {
    [key: string]: unknown;
    /** Test input objects used by `pd test`. Each may have a `_name` for labeling. */
    inputs?: Array<Input & { _name?: string }>;
    /** Custom template file paths to copy into the .pd directory. */
    templates?: string[];
    /** esbuild configurations for bundling output formats. */
    build?: BuildOptions[];
    /** Patterns to skip during markdown file discovery. */
    skip?: (string | RegExp)[];
    /** Patterns to exclude from processing. */
    exclude?: (string | RegExp)[];
    /** JSON pointer paths for conditional checks (pipe-level). */
    checks?: string[];
    or?: string[];
    and?: string[];
    not?: string[];
    routes?: string[];
    flags?: string[];
    only?: number;
    stop?: number;
    /** Project name override. */
    name?: string;
};

/** A complete pipeline definition parsed from a markdown file. */
export type Pipe = {
    /** The pipeline name from the H1 heading. */
    name: string;
    /** Sanitized name (no special chars, no spaces). */
    cleanName: string;
    /** The ordered list of executable steps. */
    steps: Step[];
    /** Path to the source markdown file. */
    mdPath: string;
    /** Merged configuration from JSON blocks and config.json files. */
    config?: PipeConfig;
    /** Relative path to the .pd output directory for this pipe. */
    dir: string;
    /** Absolute path to the .pd output directory for this pipe. */
    absoluteDir: string;
    /** Sanitized filename (without extension). */
    fileName: string;
    /** Raw Zod schema source text from the top-level zod block (one per pipe). */
    schema?: string;
};

/** Input/output for the rangeFinder token classifier. */
export type RangeFinderInput = {
    ranges: {
        /** The current token being processed. */
        token: Token;
        /** The current token index. */
        index: number;
        /** Ranges of executable code blocks (ts/js). */
        codeBlocks: number[][];
        /** Ranges of heading open/close pairs. */
        headings: number[][];
        /** Ranges of metadata blocks (json/yaml). */
        metaBlocks: number[][];
        /** Ranges of list open/close pairs. */
        lists: number[][];
        /** Ranges of schema blocks (zod). */
        schemaBlocks: number[][];
    };
};

/** Input for the pipeToScript code generator. */
export type PipeToScriptInput = {
    pipe: Pipe;
    pipeImports?: string[];
    functions?: string[];
    script?: string;
    errors?: PDError[];
} & Input;

/** Input for CLI commands. */
export interface CliInput extends Input {
    flags: Args;
    globalConfig: PipeConfig;
    projectPipes: Array<{ path: string; entry: WalkEntry } & ParsedPath>;
    errors?: Array<PDError>;
    output: Input;
    debug: boolean | string;
    match?: string;
}

/** Input for the build pipeline. */
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
