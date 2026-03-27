import type { Pipe, RangeFinderInput, Token } from "./pipedown.d.ts";

import { pd } from "./deps.ts";
const { $p } = pd;

const SUPPORTED_LANGUAGES = ["ts", "js", "javascript", "typescript"];
const META_LANGUAGES = ["json", "yaml", "yml"];
const SCHEMA_LANGUAGES = ["zod"];

const codeBlocks = $p.compile('/ranges/codeBlocks')
const headingBlocks = $p.compile('/ranges/headings')
const metaBlocks = $p.compile('/ranges/metaBlocks')
const listBlocks = $p.compile('/ranges/lists')

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

// Helper functions to normalize markdown-it tokens to our expected format
const normalizeTokenType = (token: Token): string => {
    if (token.type.endsWith('_open')) return TokenType.start;
    if (token.type.endsWith('_close')) return TokenType.end;
    if (token.type === 'inline' || token.content) return TokenType.text;
    return token.type;
};

const normalizeTokenTag = (token: Token): string => {
    if (token.type === 'fence' || token.type === 'code_block') return Tag.codeBlock;
    if (token.type.startsWith('heading')) return Tag.heading;
    if (token.type.startsWith('bullet_list') || token.type.startsWith('ordered_list')) return Tag.list;
    if (token.type === 'list_item_open' || token.type === 'list_item_close') return Tag.item;
    return token.tag || token.type;
};

const getTokenLanguage = (token: Token): string => {
    if (token.type === 'fence' && token.info) {
        return token.info.split(' ')[0]; // Get language from info string
    }
    return '';
};

const checkCodeBlock = (input: RangeFinderInput) => {
    const token = input.ranges.token;
    const normalizedTag = normalizeTokenTag(token);
    const language = getTokenLanguage(token);

    const isCodeBlock = normalizedTag === Tag.codeBlock;
    const supported = SUPPORTED_LANGUAGES.includes(language.toLowerCase());
    const isSkipped = token.info?.split(' ').slice(1).includes('skip');

    if (isCodeBlock && (token.type === 'fence' || token.type === 'code_block') && supported && !isSkipped) {
        // For markdown-it, code blocks are single tokens, so we store start and end as same index
        const index = tokenIndex.get(input);
        $p.set(input, '/ranges/codeBlocks/-', [index, index]);
    }
}

const checkList = (input: RangeFinderInput) => {
    const token = input.ranges.token;
    const normalizedTag = normalizeTokenTag(token);
    const normalizedType = normalizeTokenType(token);

    if (normalizedTag === Tag.list && normalizedType === TokenType.start) {
        $p.set(input, '/ranges/lists/-', [tokenIndex.get(input)]);
    }

    if (normalizedTag === Tag.list && normalizedType === TokenType.end) {
        const previousBlock = listBlocks.get(input).findLast((block: number[]) => {
            return block.length === 1;
        });
        if (previousBlock) {
            previousBlock.push(tokenIndex.get(input));
        }
    }
}

const checkHeading = (input: RangeFinderInput) => {
    const token = input.ranges.token;
    const normalizedTag = normalizeTokenTag(token);
    const normalizedType = normalizeTokenType(token);

    if (normalizedTag === Tag.heading && normalizedType === TokenType.start) {
        $p.set(input, '/ranges/headings/-', [tokenIndex.get(input)]);
    }

    if (normalizedTag === Tag.heading && normalizedType === TokenType.end) {
        const previousBlock = headingBlocks.get(input).at(-1);
        if (previousBlock) {
            previousBlock.push(tokenIndex.get(input));
        }
    }
}

const checkMetaBlock = (input: RangeFinderInput) => {
    const token = input.ranges.token;
    const normalizedTag = normalizeTokenTag(token);
    const language = getTokenLanguage(token);

    const isMetaBlock = normalizedTag === Tag.codeBlock;
    const supported = META_LANGUAGES.includes(language.toLowerCase());
    const isSkipped = token.info?.split(' ').slice(1).includes('skip');

    if (isMetaBlock && (token.type === 'fence' || token.type === 'code_block') && supported && !isSkipped) {
        const index = tokenIndex.get(input);
        $p.set(input, '/ranges/metaBlocks/-', [index, index]);
    }
}

const checkSchemaBlock = (input: RangeFinderInput) => {
    const token = input.ranges.token;
    const normalizedTag = normalizeTokenTag(token);
    const language = getTokenLanguage(token);

    const isCodeBlock = normalizedTag === Tag.codeBlock;
    const isSchema = SCHEMA_LANGUAGES.includes(language.toLowerCase());

    if (isCodeBlock && (token.type === 'fence' || token.type === 'code_block') && isSchema) {
        const index = tokenIndex.get(input);
        $p.set(input, '/ranges/schemaBlocks/-', [index, index]);
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
            schemaBlocks: [],
        }
    },
    checkCodeBlock,
    checkList,
    checkHeading,
    checkMetaBlock,
    checkSchemaBlock,
]

export async function rangeFinder(input: RangeFinderInput): Promise<RangeFinderInput>{
    return await pd.process(funcs, input, {} as Pipe);
}
