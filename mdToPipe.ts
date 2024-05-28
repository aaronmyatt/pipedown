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

const camelCaseString = (input: string) => {
  return input.replace(/(?:^\w|[A-Z]|\b\w)/g, function (word, index) {
    return index === 0 ? word.toLowerCase() : word.toUpperCase();
  }).replace(/\s+/g, "");
};

const parseMarkdown = (input: mdToPipeInput) => {
  // we get a big long list of objects like this:
  // {
  //     "type": "START",
  //     "tag": "LIST",
  //     "content": "",
  //     "level": 0,
  //     "kind": "",
  //     "fenced": false,
  //     "language": "",
  //     "start_number": 0,
  //     "label": "",
  //     "alignments": [],
  //     "url": "",
  //     "title": "",
  //     "checked": false
  // }
  input.tokens = md.parse(input.markdown || "");
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
    const level = pd.$p.get(input.tokens.at(index) || {}, "/level");
    return level === 1;
  });
  if (!headingRange) {
    input.pipe.name = "anonymous";
  } else {
    const block = input.tokens.at(headingRange[0] + 1) || {};
    input.pipe.name = pd.$p.get(block, "/content") || "anonymous";
  }
  input.pipe.camelName = camelCaseString(input.pipe.name || "anonymous");
};

const findSteps = (input: mdToPipeInput) => {
  input.pipe.steps = input.ranges.codeBlocks.map(
    (codeBlockRange: number[]): Step => {
      const code = input.tokens.slice(codeBlockRange[0], codeBlockRange[1])
        .reduce(
          (acc: string, token: Token) =>
            acc + (pd.$p.get(token, "/content") || ""),
          "",
        );
      return {
        code,
        range: codeBlockRange,
        name: "",
        funcName: "",
        inList: false,
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
        const block = input.tokens.at(headingRange[0] + 1) || {};
        step.name = pd.$p.get(block, "/content") || "anonymous" + step.range[0];
      } else {
        step.name = "anonymous" + step.range[0];
      }
      step.funcName = camelCaseString(step.name);
      return step;
    });
};

const mergeMetaConfig = (input: mdToPipeInput) => {
  const metaConfig = input.ranges.metaBlocks.map(
    (metaBlockRange: number[]) => {
      const block = input.tokens.at(metaBlockRange[0] + 1);
      if (!block) return {};
      return JSON.parse(pd.$p.get(block, "/content") || "{}");
    },
  ).reduce((acc: PipeConfig, step: Step) => {
    return std.deepMerge(acc, step);
  }, {});
  input.pipe.config = Object.assign(input.pipe.config || {}, metaConfig);
};

const wrapWithInteralSteps = (input: mdToPipeInput) => {
  const persistInput = (io = "input") => {
    return `
      const kvAvailable = typeof Deno !== 'undefined' && typeof Deno.openKv === 'function'
      if(kvAvailable) {
        try {
          const db = await Deno.openKv()
          const key = ['pd', '${io}', opts.fileName]
          try {
              await db.set(key, JSON.stringify(input))
          } catch (e) {
            const safe = {
              error: e.message,
            }
            for (const [k, v] of Object.entries(input)) {
                safe[k] = typeof v;
            }
            await db.set(key, safe)
          }
        } catch (e) {
            console.error(e)
        }
      } else {
        const key = 'pd:${io}:' + opts.fileName 
        const inputJson = localStorage.getItem(key) || '[]'
        const storedJson = JSON.parse(inputJson)
        storedJson.push(JSON.stringify(input))
        localStorage.setItem(key, JSON.stringify(storedJson))
      }
      `;
  };
  const emitStartEvent = () => {
    return `const event = new CustomEvent('pd:pipe:start', {detail: {input, opts}})
          dispatchEvent(event)`;
  };

  const emitEndEvent = () => {
    return `const event = new CustomEvent('pd:pipe:end', {detail: {input, opts}})
          dispatchEvent(event)`;
  };

  function wrapWith(start: Step, end: Step, steps = input.pipe.steps) {
    return [
      start,
      ...steps,
      end,
    ];
  }

  const wrapWithEvents = wrapWith.bind(this, {
    name: "emitStartEvent",
    code: emitStartEvent(),
    funcName: "emitStartEvent",
    inList: false,
    range: [0, 0],
    internal: true,
  }, {
    name: "emitEndEvent",
    code: emitEndEvent(),
    funcName: "emitEndEvent",
    inList: false,
    range: [0, 0],
    internal: true,
  });

  const wrapWithPersistance = wrapWith.bind(this, {
    name: "persistInput",
    code: persistInput(),
    funcName: "persistInput",
    inList: false,
    range: [0, 0],
    internal: true,
  }, {
    name: "persistOutput",
    code: persistInput("output"),
    funcName: "persistOutput",
    inList: false,
    range: [0, 0],
    internal: true,
  });

  if (pd.$p.get(input, "/pipe/config/persist")) {
    input.pipe.steps = wrapWithPersistance(input.pipe.steps);
  }

  if (pd.$p.get(input, "/pipe/config/emit")) {
    input.pipe.steps = wrapWithEvents(input.pipe.steps);
  }
};

const setupChecks = (input: mdToPipeInput) => {
  const inRange = (ranges: Array<number[]>, index: number) => {
    return ranges.find(([start, stop]: number[]) => {
      return start < index && stop > index;
    });
  }

  // flag which codeblocks are within a ranges.list block
  // we don't want to filter as we need to preserve the order
  input.pipe.steps = input.pipe.steps.map((step: Step) => {
    step.inList = !!inRange(input.ranges.lists, step.range[0]);
    return step;
  })
    .map((step: Step, stepIndex: number) => {
      if (step.inList) {
        // slice from start of list to start of codeblock
        const listRange = inRange(input.ranges.lists, step.range[0]);

        // check list items preceding codeblock for the following patterns
        // check|when|if:* - if true, add value to step config
        // route:* - if true, add value to step config
        listRange && input.tokens.slice(listRange[0], step.range[0])
          .filter((token: Token) => pd.$p.get(token, "/type") === TokenType.text)
          .map((token: Token) => pd.$p.get(token, "/content").trim())
          .filter(text => !!text.match(/(?:check|when|if|flags|route|stop|only|or|and|not):/g))
          .map((text: string) => {
            const [type, pointer] = text.split(":");
            return { type, pointer };
          })
          .forEach((check: {type: string, pointer: string}) => {
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

            actions[check.type]();
          });
      }
      return step;
    });
}

export const mdToPipe = async (input: {markdown:string, pipe: Pipe}&Input) => {
  const funcs = [
    parseMarkdown,
    findRanges,
    findPipeName,
    findSteps,
    mergeMetaConfig,
    setupChecks,
    wrapWithInteralSteps,
  ];

  const output = await pd.process(
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
        camelName: "",
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
      },
    }, input),
    {},
  );
  return output;
};
