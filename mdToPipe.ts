import { md, pd, std } from "./deps.ts";
import { rangeFinder, Tag as TokenTag, TokenType } from "./rangeFinder.ts";
import type {
  mdToPipeInput,
  PipeConfig,
  Step,
  Steps,
  Token,
  Input,
  Pipe,
} from "./pipedown.d.ts";
import { sanitizeString } from "./pdUtils.ts";

const parseMarkdown = (input: mdToPipeInput) => {
  const markdownIt = new md.MarkdownIt();
  input.tokens = markdownIt.parse(input.markdown || "", {});
};

const findRanges = async (input: mdToPipeInput) => {
  const output = await rangeFinder(input);
  input.ranges = output.ranges;
  for (const [index, token] of input.tokens.entries()) {
    input.ranges.token = token;
    input.ranges.index = index;
    const { ranges } = await rangeFinder(input);
    input.ranges = ranges;
  }
};

const findPipeName = (input: mdToPipeInput) => {
  const headingRange = input.ranges.headings.find((hRange: number[]) => {
    const index = !hRange.length ? 0 : hRange[0];
    const token = input.tokens.at(index);
    // For markdown-it, heading level is in the type (heading_open) or level property
    const level = token?.level || (token?.type === 'heading_open' ? 1 : 0);
    return level === 1;
  });
  
  if (!headingRange) {
    input.pipe.name = "anonymous";
  } else {
    // Find the inline token that contains the heading text
    const headingToken = input.tokens.at(headingRange[0]);
    let headingText = "";
    
    if (headingToken?.children) {
      headingText = headingToken.children
        .filter(child => child.type === 'text')
        .map(child => child.content)
        .join('');
    } else {
      // Fallback: look for next inline token
      const nextToken = input.tokens.at(headingRange[0] + 1);
      if (nextToken?.type === 'inline') {
        headingText = nextToken.content || "";
      }
    }
    
    input.pipe.name = headingText || "anonymous";
  }
  input.pipe.cleanName = sanitizeString(input.pipe.name || "anonymous");
};

const findSchema = (input: mdToPipeInput) => {
  if (!input.ranges.schemaBlocks || input.ranges.schemaBlocks.length === 0) return;

  // Use only the first zod block — one schema per pipe
  const schemaRange = input.ranges.schemaBlocks[0];
  const token = input.tokens.at(schemaRange[0]);
  if (token) {
    input.pipe.schema = token.content || "";
  }

  if (input.ranges.schemaBlocks.length > 1) {
    console.warn("Warning: multiple zod blocks found — only the first is used as the pipe schema.");
  }
};

const findSteps = (input: mdToPipeInput) => {
  input.pipe.steps = input.ranges.codeBlocks.map(
    (codeBlockRange: number[]): Step => {
      const token = input.tokens.at(codeBlockRange[0]);
      const code = token?.content || "";
      const language = token?.info?.split(' ')[0] || "ts";

      return {
        code,
        range: codeBlockRange,
        name: "",
        funcName: "",
        inList: false,
        language,
      };
    },
  )
    .map((step: Step, index: number, steps: Steps) => {
      const headingRange = input.ranges.headings.findLast(
        (headingRange: number[]) => {
          const afterLastCodeBlock = index > 0
            ? headingRange[0] > steps[index - 1].range[0]
            : true;
          const beforeCurrentCodeBlock = headingRange[0] < step.range[0];
          return afterLastCodeBlock && beforeCurrentCodeBlock;
        },
      );

      if (headingRange) {
        const headingToken = input.tokens.at(headingRange[0]);
        let headingText = "";

        // Extract heading level from the tag (h1, h2, h3, etc.)
        if (headingToken?.tag) {
          const level = parseInt(headingToken.tag.replace("h", ""));
          if (!isNaN(level)) step.headingLevel = level;
        }

        if (headingToken?.children) {
          headingText = headingToken.children
            .filter(child => child.type === 'text')
            .map(child => child.content)
            .join('');
        } else {
          const nextToken = input.tokens.at(headingRange[0] + 1);
          if (nextToken?.type === 'inline') {
            headingText = nextToken.content || "";
          }
        }

        step.name = headingText || "anonymous" + step.range[0];

        // Extract description: paragraph text between heading and code block
        const headingEnd = headingRange[1];
        const codeStart = step.range[0];
        const descParts: string[] = [];
        for (let i = headingEnd + 1; i < codeStart; i++) {
          const t = input.tokens[i];
          if (t?.type === 'inline' && t.content) {
            descParts.push(t.content);
          }
        }
        if (descParts.length > 0) {
          step.description = descParts.join("\n");
        }
      } else {
        step.name = "anonymous" + step.range[0];
      }
      step.funcName = sanitizeString(step.name);
      return step;
    });
};

const findPipeDescription = (input: mdToPipeInput) => {
  // Extract prose between the H1 heading and the first step/config/schema block
  const firstHeading = input.ranges.headings[0];
  if (!firstHeading) return;

  const headingEnd = firstHeading[1];

  // Find the first structural element after the heading
  const firstCodeBlock = input.ranges.codeBlocks[0]?.[0] ?? Infinity;
  const firstMetaBlock = input.ranges.metaBlocks[0]?.[0] ?? Infinity;
  const firstSchemaBlock = input.ranges.schemaBlocks?.[0]?.[0] ?? Infinity;
  const firstSecondHeading = input.ranges.headings[1]?.[0] ?? Infinity;
  const firstBlock = Math.min(firstCodeBlock, firstMetaBlock, firstSchemaBlock, firstSecondHeading);

  if (firstBlock === Infinity) return;

  const descParts: string[] = [];
  for (let i = headingEnd + 1; i < firstBlock; i++) {
    const t = input.tokens[i];
    if (t?.type === 'inline' && t.content) {
      descParts.push(t.content);
    }
  }
  if (descParts.length > 0) {
    input.pipe.pipeDescription = descParts.join("\n");
  }
};

const mergeMetaConfig = (input: mdToPipeInput) => {
  const metaConfig = input.ranges.metaBlocks.map(
    (metaBlockRange: number[]) => {
      const token = input.tokens.at(metaBlockRange[0]);
      if (!token) return {};
      return JSON.parse(token.content || "{}");
    },
  ).reduce((acc: PipeConfig, step: Step) => {
    return std.deepMerge(acc, step);
  }, {});
  input.pipe.config = Object.assign(input.pipe.config || {}, metaConfig);
};

const setupChecks = (input: mdToPipeInput) => {
  const inRange = (ranges: Array<number[]>, index: number) => {
    return ranges.find(([start, stop]: number[]) => {
      return start < index && stop > index;
    });
  }

  input.pipe.steps = input.pipe.steps.map((step: Step) => {
    step.inList = !!inRange(input.ranges.lists, step.range[0]);
    return step;
  })
    .map((step: Step, stepIndex: number) => {
      if (step.inList) {
        const listRange = inRange(input.ranges.lists, step.range[0]);
        const checkRegex = new RegExp('(?<type>check|when|if|flags|or|and|not|route|stop|only):\\s*(?<pointer>\\S*)');

        if (listRange) {
          // Collect list item text content
          const listItems: string[] = [];
          
          for (let i = listRange[0]; i < step.range[0]; i++) {
            const token = input.tokens[i];
            if (token.type === 'list_item_open') {
              listItems.push('');
            } else if (token.type === 'inline' || token.type === 'text') {
              if (listItems.length > 0) {
                listItems[listItems.length - 1] += token.content || '';
              }
            }
          }
          
          listItems
            .map((text: string) => text.trim())
            .map((text: string) => checkRegex.exec(text))
            .filter(match => match)
            .map(match => (match?.groups || {type: '', pointer: ''}))
            .forEach((check) => {
              const appendCheck = pd.$p.compile('/config/checks/-')
              const actions: Record<string, () => void> = {
                "check": () => appendCheck.set(step, check.pointer),
                "if": () => appendCheck.set(step, check.pointer),
                "when": () => appendCheck.set(step, check.pointer),
                "flags": () => appendCheck.set(step, '/flags'+check.pointer),
                "or": () => pd.$p.set(step, `/config/or/-`, check.pointer),
                "and": () => pd.$p.set(step, `/config/and/-`, check.pointer),
                "not": () => pd.$p.set(step, `/config/not/-`, check.pointer),
                "route": () => pd.$p.set(step, `/config/routes/-`, check.pointer),
                "stop": () => pd.$p.set(step, `/config/stop`, stepIndex),
                "only": () => pd.$p.set(step, `/config/only`, stepIndex),
              };

              actions[check.type]?.();
            });
        }
      }
      return step;
    });
}

export const mdToPipe = async (input: {markdown:string, pipe: Pipe}&Input) => {
  const funcs = [
    parseMarkdown,
    findRanges,
    findPipeName,
    findPipeDescription,
    findSchema,
    findSteps,
    mergeMetaConfig,
    setupChecks,
  ];

  return await pd.process(
    funcs,
    Object.assign({
      markdown: "",
      tokens: [],
      headings: [],
      codeBlocks: [],
      steps: [],
      pipeName: "",
      pipe: {
        name: "",
        cleanName: "",
        steps: [],
        dir: "",
        fileName: "",
        checks: {},
        config: {
          on: {},
          inputs: [],
          build: [],
          skip: [],
          exclude: [],
        },
      },
      ranges: {
        token: {} as Token,
        index: 0,
        codeBlocks: [],
        headings: [],
        metaBlocks: [],
        lists: [],
        schemaBlocks: [],
      },
    }, input),
    {},
  );
};
