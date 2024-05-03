import { std, pd, md } from "./deps.ts";
import { rangeFinder } from "./rangeFinder.ts";
import type { mdToPipeInput, Pipe, Step, Steps } from "./pipedown.d.ts";

const camelCaseString = (input: string) => {
  return input.replace(/(?:^\w|[A-Z]|\b\w)/g, function (word, index) {
    return index === 0 ? word.toLowerCase() : word.toUpperCase();
  }).replace(/\s+/g, "");
};

const parseMarkdown = (input: mdToPipeInput) => {
  input.tokens = md.tokens(input.markdown);
};

const findRanges = async (input: mdToPipeInput) => {
  const output = await rangeFinder({});
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
    return input.tokens.at(index)?.level === 1;
  });
  if (!headingRange) {
    input.pipe.name = "anonymous";
  } else {
    input.pipe.name = input.tokens.at(headingRange[0] + 1).content;
  }
  input.pipe.camelName = camelCaseString(input.pipe.name || "anonymous");
};

const findSteps = (input: mdToPipeInput) => {
  input.pipe.steps = input.ranges.codeBlocks.map((codeBlockRange: number[]) => {
    return {
      code: input.tokens.slice(codeBlockRange[0], codeBlockRange[1])
        .reduce((acc: string, token: Token) => acc + (token.content || ""), ""),
      range: codeBlockRange,
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
        step.name = input.tokens.at(headingRange[0] + 1).content ||
          "anonymous" + step.range[0];
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
      return JSON.parse(input.tokens.at(metaBlockRange[0] + 1).content);
    },
  ).reduce((acc: PipeConfig, step: Step) => {
    return std.deepMerge(acc, step);
  }, {});
};

export const mdToPipe = async (input: mdToPipeInput) => {
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
        step.inList = inList || false;
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
            input.tokens.slice(listRange[0], step.range[0])
              .reduce((acc: Array<Array<Token>>, token: Token) => {
                if (token.tag === "listItem" && token.type === "start") {
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
                    return acc + token.content;
                  }, "");
              })
              .forEach((listItem: string) => {
                step.config = step.config || {};
                step.config.checks = step.config.checks || [];
                step.config.routes = step.config.routes || [];
                const pattern = /(?:check|when|if|route|stop|only):/g;
                const match = listItem.match(pattern);
                if (!match) {
                  return;
                }

                const actions: Record<string, () => void> = ({
                  "check": () => {
                    const check = listItem.replace('check:', '').trim()
                    step.config.checks.push(check);
                  },
                  "if": () => {
                    const check = listItem.replace('if:', '').trim()
                    step.config.checks.push(check);
                  },
                  "when": () => {
                    const check = listItem.replace('when:', '').trim()
                    step.config.checks.push(check);
                  },
                  "route": () => {
                    const check = listItem.replace('route:', '').trim()
                    step.config.routes.push(check);
                  },
                  "stop": () => step.config.stop = stepIndex,
                  "only": () => step.config.only = stepIndex,
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

  input.pipe = input.pipe || {};

  const output = await pd.process(funcs, input, {} as Pipe);
  if (output.debug) {
    // keep tokens for debugging
  } else {
    return { pipe: output.pipe, errors: output.errors };
  }
  return output;
};

if (import.meta.main) {
  const pipe = await mdToPipe({
    markdown: await Deno.readTextFile(".pd/website/start/start.md"),
    debug: true,
  });
  console.log(pipe);
}
