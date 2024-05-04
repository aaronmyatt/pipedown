import { std, pd, md } from "./deps.ts";
import { rangeFinder } from "./rangeFinder.ts";
import type { mdToPipeInput, PipeConfig, Step, Steps, Token } from "./pipedown.d.ts";

const camelCaseString = (input: string) => {
  return input.replace(/(?:^\w|[A-Z]|\b\w)/g, function (word, index) {
    return index === 0 ? word.toLowerCase() : word.toUpperCase();
  }).replace(/\s+/g, "");
};

const parseMarkdown = (input: mdToPipeInput) => {
  input.tokens = md.tokens(input.markdown || '');
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
    const level = pd.$p.get(input.tokens.at(index) || {}, '/level');
    return level === 1;
  });
  if (!headingRange) {
    input.pipe.name = "anonymous";
  } else {
    const block = input.tokens.at(headingRange[0] + 1) || {};
    input.pipe.name = pd.$p.get(block, '/content') || "anonymous";
  }
  input.pipe.camelName = camelCaseString(input.pipe.name || "anonymous");
};

const findSteps = (input: mdToPipeInput) => {
  input.pipe.steps = input.ranges.codeBlocks.map((codeBlockRange: number[]): Step => {
    const code = input.tokens.slice(codeBlockRange[0], codeBlockRange[1])
        .reduce((acc: string, token: Token) => acc + (pd.$p.get(token, '/content') || ""), "")
    return {
      code,
      range: codeBlockRange,
      name: "",
      funcName: "",
      inList: false,
    };
  })
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
        const block = input.tokens.at(headingRange[0] + 1) || {};
        step.name = pd.$p.get(block, '/content') || "anonymous" + step.range[0];
      } else {
        step.name = "anonymous" + step.range[0];
      }
      step.funcName = camelCaseString(step.name);
      return step;
    });
};

const mergeMetaConfig = (input: mdToPipeInput) => {
  input.pipe.config = input.ranges.metaBlocks.map(
    (metaBlockRange: number[]) => {
      const block = input.tokens.at(metaBlockRange[0] + 1);
      if(!block) return {};
      return JSON.parse(pd.$p.get(block, '/content') || "{}");
    },
  ).reduce((acc: PipeConfig, step: Step) => {
    return std.deepMerge(acc, step);
  }, {});
};

export const mdToPipe = async (input: object) => {
  const funcs = [
    parseMarkdown,
    findRanges,
    findPipeName,
    findSteps,
    mergeMetaConfig,
    (input: mdToPipeInput) => {
      // flag which codeblocks are within a ranges.list block
      input.pipe.steps = input.pipe.steps.map((step: Step) => {
        const inList = input.ranges.lists.find((listRange: number[]) => {
          return listRange[0] < step.range[0] && listRange[1] > step.range[0];
        });
        step.inList = !!inList || false;
        return step;
      })
        .map((step: Step, stepIndex: number) => {
          if (step.inList) {
            // slice from start of list to start of codeblock
            const listRange = input.ranges.lists.find((listRange: number[]) => {
              return listRange[0] < step.range[0] &&
                listRange[1] > step.range[0];
            });

            // check list items preceeding codeblock for the following patterns
            // check|when|if:* - if true, add value to step config
            // route:* - if true, add value to step config
           listRange && input.tokens.slice(listRange[0], step.range[0])
              .reduce((acc: Array<Array<Token>>, token: Token) => {
                const tag = pd.$p.get(token, '/tag');
                if (tag === "listItem" && token.type === "start") {
                  acc.push([]);
                }
                const lastList = acc.findLast((list: Array<Token>) => {
                  return list.length >= 0;
                });
                if (token.type === "text" && lastList) {
                  lastList.push(token);
                }
                return acc;
              }, [])
              .map((list: Array<Token>): string => {
                return list.filter((token: Token) => {
                  return token.type === "text";
                })
                  .reduce((acc: string, token: Token) => {
                    return acc + pd.$p.get(token, '/content');
                  }, "");
              })
              .forEach((listItem: string) => {
                const pattern = /(?:check|when|if|route|stop|only):/g;
                const match = listItem.match(pattern);
                if (!match) {
                  return;
                }

                const actions: Record<string, () => void> = ({
                  "check": () => {
                    const check = listItem.replace('check:', '').trim()
                    pd.$p.set(step, `/config/checks/-`, check);
                  },
                  "if": () => {
                    const check = listItem.replace('if:', '').trim()
                    pd.$p.set(step, `/config/checks/-`, check);
                  },
                  "when": () => {
                    const check = listItem.replace('when:', '').trim()
                    pd.$p.set(step, `/config/checks/-`, check);
                  },
                  "route": () => {
                    const check = listItem.replace('route:', '').trim()
                    pd.$p.set(step, `/config/routes/-`, check);
                  },
                  "stop": () => pd.$p.set(step, `/config/stop`, stepIndex),
                  "only": () => pd.$p.set(step, `/config/only`, stepIndex),
                })

                match.forEach((match: string) => {
                  const key = match.replace(':', '');
                  actions[key]();
                });
              });
          }
          return step;
        });
    },
  ];

  const output = await pd.process(funcs, Object.assign({}, {
    markdown: "",
    tokens: [],
    headings: [],
    codeBlocks: [],
    steps: [],
    pipeName: "",
    pipe: {
      name: "",
      camelName: "",
      steps: [],
      config: {},
      dir: "",
      fileName: "",
      checks: {},
    },
    ranges: {
      token: {} as Token,
      index: 0,
      codeBlocks: [],
      headings: [],
      metaBlocks: [],
      lists: [],
    },
  }, input), {});
  return output;
};
