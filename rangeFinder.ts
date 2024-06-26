import type { Pipe, RangeFinderInput, Token } from "./pipedown.d.ts";

import { pd } from "./deps.ts";
const { $p } = pd;

const SUPPORTED_LANGUAGES = ["ts", "js", "javascript", "typescript"];
const META_LANGUAGES = ["json", "yaml", "yml"];


const codeBlocks = $p.compile('/ranges/codeBlocks')
const headingBlocks = $p.compile('/ranges/headings')
const metaBlocks = $p.compile('/ranges/metaBlocks')
const listBlocks = $p.compile('/ranges/lists')

const tokenTag = $p.compile('/ranges/token/tag')
const tokenType = $p.compile('/ranges/token/type')
const tokenLang = $p.compile('/ranges/token/language')
const tokenIndex = $p.compile('/ranges/index')

export enum Tag {
    codeBlock = "CODE_BLOCK",
    list = "LIST",
    heading = "HEADING",
    item = "ITEM",
}

export enum TokenType {
    start = "START",
    end = "END",
    text = "TEXT",
}


const checkCodeBlock = (input: RangeFinderInput) => {
    const isCodeBlock = tokenTag.get(input) === Tag.codeBlock;
    const startOrEnd = tokenType.get(input);
    const supported = SUPPORTED_LANGUAGES.includes(tokenLang.get(input)?.toLowerCase())

    if(isCodeBlock && startOrEnd === TokenType.start && supported){
        $p.set(input, '/ranges/codeBlocks/-', [tokenIndex.get(input)])
    }
    if(isCodeBlock && startOrEnd === TokenType.end && supported){
        // append end index to last codeBlock
        const previousBlock = codeBlocks.get(input).at(-1)
        previousBlock.push(tokenIndex.get(input))
    }
}

const checkList = (input: RangeFinderInput) => {
    const isList = tokenTag.get(input) === Tag.list;
    const startOrEnd = tokenType.get(input);

    if(isList && startOrEnd === TokenType.start)
        $p.set(input, '/ranges/lists/-', [tokenIndex.get(input)])

    if(isList && startOrEnd === TokenType.end){
        // lists may be nested, so we need to fill them in from the inside out
        const previousBlock = listBlocks.get(input).findLast((block: number[]) => {
            return block.length === 1
        })
        previousBlock.push(tokenIndex.get(input))
    }
}

const checkHeading = (input: RangeFinderInput) => {
    const isHeading = tokenTag.get(input) === Tag.heading;
    const startOrEnd = tokenType.get(input);

    if(isHeading && startOrEnd === TokenType.start)
        $p.set(input, '/ranges/headings/-', [tokenIndex.get(input)])

    if(isHeading && startOrEnd === TokenType.end){
        // append end index to last heading
        const previousBlock = headingBlocks.get(input).at(-1)
        previousBlock.push(tokenIndex.get(input))
    }
}

const checkMetaBlock = (input: RangeFinderInput) => {
    const isMetaBlock = tokenTag.get(input) === Tag.codeBlock;
    const startOrEnd = tokenType.get(input);
    const supported = META_LANGUAGES.includes(tokenLang.get(input)?.toLowerCase())

    if(isMetaBlock && startOrEnd === TokenType.start && supported)
        $p.set(input, '/ranges/metaBlocks/-', [tokenIndex.get(input)])

    if(isMetaBlock && startOrEnd === TokenType.end && supported){
        // append end index to last metaBlock
        const previousBlock = metaBlocks.get(input).at(-1)
        previousBlock.push(tokenIndex.get(input))
    }
}


const funcs = [
    (input: RangeFinderInput) => {
        if(input.ranges) return;
        input.ranges = {
            token: {} as Token,
            index: 0,
            codeBlocks: [],
            headings: [],
            metaBlocks: [],
            lists: [],
        }
    },
    checkCodeBlock,
    checkList,
    checkHeading,
    checkMetaBlock,
]

export async function rangeFinder(input: RangeFinderInput): Promise<RangeFinderInput>{
    return await pd.process(funcs, input, {} as Pipe);
}
