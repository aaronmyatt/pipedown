import { md, pd, std } from "./deps.ts";
import { rangeFinder } from "./rangeFinder.ts";
import type {
  Input,
  mdToPipeInput,
  PDError,
  Pipe,
  PipeConfig,
  Step,
  Steps,
  Token,
} from "./pipedown.d.ts";
import { sanitizeString } from "./pdUtils.ts";
import { buildConfigBlock } from "./pipeToMarkdown.ts";

// Extract plain text from a heading token. Handles both markdown-it's
// children array (inline tokens) and the fallback of looking at the next
// token in the stream.
const headingText = (tokens: Token[], headingIndex: number): string => {
  const token = tokens.at(headingIndex);
  if (token?.children) {
    return token.children
      .filter((child) => child.type === "text")
      .map((child) => child.content)
      .join("");
  }
  // Fallback: markdown-it places heading text in the next inline token
  const next = tokens.at(headingIndex + 1);
  if (next?.type === "inline") return next.content || "";
  return "";
};

// Collect paragraph (inline) text between two token indices.
// Used for pipe descriptions and step descriptions.
const collectInlineText = (
  tokens: Token[],
  fromIndex: number,
  toIndex: number,
): string[] => {
  const parts: string[] = [];
  for (let i = fromIndex; i < toIndex; i++) {
    const t = tokens[i];
    if (t?.type === "inline" && t.content) parts.push(t.content);
  }
  return parts;
};

const parseMarkdown = (input: mdToPipeInput) => {
  const markdownIt = new md.MarkdownIt();
  input.tokens = markdownIt.parse(input.markdown || "", {});
  // Preserve the raw source for lossless round-trip reconstruction
  input.pipe.rawSource = input.markdown;
};

// Walk the raw markdown line-by-line tracking fence open/close state.
// Each `## ` (or `# `) line that appears WHILE a fence is open is a
// strong signal that the previous fence was never closed — markdown-it
// will silently treat the heading and everything after as code-block
// content, swallowing subsequent steps. Pipedown-specific because the
// authoring contract is "every step heading owns one closed fence".
//
// Recovery strategy: emit the error, pretend the fence closed at this
// point so any subsequent fences in the file are still validated and
// the user gets one error per missing close (not a cascade).
//
// Limitation: nested fences inside a code-string would confuse this
// scanner, but Pipedown step bodies are real TypeScript, so that's
// not a realistic source of false positives.
const validateMarkdownStructure = (input: mdToPipeInput) => {
  const filePath = input.pipe.mdPath || "<unknown>";
  const lines = (input.markdown || "").split("\n");
  let fenceOpen = false;
  let fenceOpenLine = 0; // 1-indexed source line of the unclosed fence

  const pushErr = (line: number, message: string) => {
    const pdErr = Object.assign(new Error(message), {
      func: "validateMarkdownStructure",
      severity: "error" as const,
      filePath,
      line,
      column: 1,
    }) as PDError;
    input.errors = input.errors || [];
    input.errors.push(pdErr);
  };

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const line = lines[i];

    // Leading whitespace allowed; an optional list marker (`-`, `*`, `+`)
    // covers Pipedown's conditional pattern where the opening fence
    // appears as a list item: `- ```ts`. The closing fence in that
    // pattern is just indented whitespace + backticks.
    if (/^\s*(?:[-*+]\s+)?```/.test(line)) {
      if (fenceOpen) {
        fenceOpen = false;
      } else {
        fenceOpen = true;
        fenceOpenLine = lineNum;
      }
      continue;
    }

    // Top-level H1 / H2 inside an open fence → previous fence wasn't closed.
    if (/^#{1,2}\s/.test(line) && fenceOpen) {
      pushErr(
        fenceOpenLine,
        `code fence opened at line ${fenceOpenLine} was not closed before the next heading at line ${lineNum} — subsequent steps will be swallowed by markdown-it`,
      );
      fenceOpen = false; // recover so further checks make sense
    }
  }

  if (fenceOpen) {
    pushErr(
      fenceOpenLine,
      `code fence opened at line ${fenceOpenLine} was never closed`,
    );
  }
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
  // The pipe name comes from the first H1 heading (nesting level 0 in markdown-it)
  const headingRange = input.ranges.headings.find((hRange: number[]) => {
    const index = !hRange.length ? 0 : hRange[0];
    const token = input.tokens.at(index);
    const level = token?.level || (token?.type === "heading_open" ? 1 : 0);
    return level === 1;
  });

  input.pipe.name = headingRange
    ? headingText(input.tokens, headingRange[0]) || "anonymous"
    : "anonymous";
  input.pipe.cleanName = sanitizeString(input.pipe.name || "anonymous");
};

const findSchema = (input: mdToPipeInput) => {
  if (!input.ranges.schemaBlocks || input.ranges.schemaBlocks.length === 0) {
    return;
  }

  // Use only the first zod block — one schema per pipe
  const schemaRange = input.ranges.schemaBlocks[0];
  const token = input.tokens.at(schemaRange[0]);
  if (token) {
    input.pipe.schema = token.content || "";
    // Preserve the original schema at parse time for lossless round-trip —
    // allows pipeToMarkdown to detect schema mutations and splice the new
    // zod block content into the header while preserving other formatting.
    input.pipe.originalSchema = input.pipe.schema;
  }

  if (input.ranges.schemaBlocks.length > 1) {
    const filePath = input.pipe.mdPath || "<unknown>";
    for (const extraRange of input.ranges.schemaBlocks.slice(1)) {
      const extraToken = input.tokens.at(extraRange[0]);
      const line = extraToken?.map ? extraToken.map[0] + 1 : undefined;
      const pdErr = Object.assign(
        new Error(
          "multiple zod blocks found — only the first is used as the pipe schema",
        ),
        {
          func: "findSchema",
          severity: "warning" as const,
          filePath,
          line,
          column: 1,
        },
      ) as PDError;
      input.errors = input.errors || [];
      input.errors.push(pdErr);
    }
  }
};

const findSteps = (input: mdToPipeInput) => {
  input.pipe.steps = input.ranges.codeBlocks.map(
    (codeBlockRange: number[]): Step => {
      const token = input.tokens.at(codeBlockRange[0]);
      const code = token?.content || "";
      const language = token?.info?.split(" ")[0] || "ts";
      const infoFlags = token?.info?.split(" ").slice(1) || [];
      const isMock = infoFlags.includes("mock");

      // Capture source line map from token.map for lossless round-trip
      const codeSourceMap = token?.map
        ? { codeStartLine: token.map[0], codeEndLine: token.map[1] }
        : undefined;

      return {
        code,
        range: codeBlockRange,
        name: "",
        funcName: "",
        inList: false,
        language,
        mock: isMock || undefined,
        originalCode: code,
        sourceMap: codeSourceMap,
      };
    },
  )
    .map((step: Step, index: number, steps: Steps) => {
      // Find the nearest heading that sits between the previous code block and this one
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

        // Extract heading level from the tag (h1, h2, h3, etc.)
        if (headingToken?.tag) {
          const level = parseInt(headingToken.tag.replace("h", ""));
          if (!isNaN(level)) step.headingLevel = level;
        }

        step.name = headingText(input.tokens, headingRange[0]) ||
          "anonymous" + step.range[0];
        // Preserve the original name at parse time for lossless round-trip
        // reconstruction — allows pipeToMarkdown to detect title mutations
        // and splice in the new heading text while preserving other formatting.
        step.originalName = step.name;

        // Capture heading line number from token.map for lossless round-trip
        if (headingToken?.map) {
          step.sourceMap = {
            ...step.sourceMap,
            headingLine: headingToken.map[0],
          };
        }

        // Extract description: paragraph text between heading end and code block start
        const descParts = collectInlineText(
          input.tokens,
          headingRange[1] + 1,
          step.range[0],
        );
        if (descParts.length > 0) {
          step.description = descParts.join("\n");
          // Preserve original description for lossless round-trip — allows
          // pipeToMarkdown to detect description mutations and splice in
          // new prose while preserving DSL directive lines.
          step.originalDescription = step.description;
        }
      } else {
        step.name = "anonymous" + step.range[0];
      }
      step.funcName = sanitizeString(step.name);
      return step;
    });
};

const findPipeDescription = (input: mdToPipeInput) => {
  // Extract prose between the H1 heading and the first structural element
  const firstHeading = input.ranges.headings[0];
  if (!firstHeading) return;

  const firstBlock = Math.min(
    input.ranges.codeBlocks[0]?.[0] ?? Infinity,
    input.ranges.metaBlocks[0]?.[0] ?? Infinity,
    input.ranges.schemaBlocks?.[0]?.[0] ?? Infinity,
    input.ranges.headings[1]?.[0] ?? Infinity,
  );
  if (firstBlock === Infinity) return;

  const descParts = collectInlineText(
    input.tokens,
    firstHeading[1] + 1,
    firstBlock,
  );
  if (descParts.length > 0) {
    input.pipe.pipeDescription = descParts.join("\n");
    // Preserve original pipe description for lossless round-trip — allows
    // pipeToMarkdown to detect pipe-level description mutations and splice
    // the new text into the header while preserving schema/config blocks.
    input.pipe.originalPipeDescription = input.pipe.pipeDescription;
  }
};

const mergeMetaConfig = (input: mdToPipeInput) => {
  const metaConfig = input.ranges.metaBlocks.map(
    (metaBlockRange: number[]) => {
      const token = input.tokens.at(metaBlockRange[0]);
      if (!token) return {};

      // JSON.parse throws a SyntaxError for invalid JSON. We catch it here
      // and record it as a PDError so the build pipeline can surface a helpful
      // message pointing to the specific file and block content, rather than
      // crashing with a cryptic uncaught exception.
      // Ref: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse
      try {
        return JSON.parse(token.content || "{}");
      } catch (e) {
        // Build a concise error message: file path + the SyntaxError description
        // + a truncated preview of the malformed block so the user can locate it.
        const filePath = input.pipe.mdPath || "<unknown>";
        const preview = (token.content || "").slice(0, 80).replace(/\n/g, "↵");
        const message =
          `Malformed JSON config block in "${filePath}": ${
            (e as SyntaxError).message
          }` +
          `\n  Block preview: ${preview}`;

        // PDError extends Error and adds a `func` field for pipeline attribution.
        // We use Object.assign to attach the `func` property to a real Error
        // instance so the stack trace is preserved.
        // Ref: pipedown.d.ts — PDError type definition
        const pdErr = Object.assign(new Error(message), {
          func: "mergeMetaConfig",
          severity: "error" as const,
          filePath,
          // token.map is [startLine, endLine] zero-indexed; lint format is 1-indexed
          line: token.map ? token.map[0] + 1 : undefined,
          column: 1,
        }) as PDError;
        input.errors = input.errors || [];
        input.errors.push(pdErr);
        // Return empty object so the rest of the pipeline still runs;
        // the error will be reported and the build will fail at the end.
        return {};
      }
    },
  ).reduce((acc: PipeConfig, step: Step) => {
    return std.deepMerge(acc, step);
  }, {});
  input.pipe.config = Object.assign(input.pipe.config || {}, metaConfig);

  // Preserve the original config at parse time for lossless round-trip —
  // allows pipeToMarkdown to detect config mutations (e.g., LLM-generated
  // test inputs) and splice the new JSON block into the header.
  // Uses buildConfigBlock() from pipeToMarkdown.ts to ensure the comparison
  // uses the same serialisation logic as rendering, avoiding false positives.
  input.pipe.originalConfig = buildConfigBlock(input.pipe.config);
};

// Canonical DSL directive keys recognised in `- key: value` list items.
// Kept in module scope so lint/typo detection can reference the same set
// the parser uses.
const CANONICAL_DIRECTIVES = [
  "check",
  "when",
  "if",
  "flags",
  "or",
  "and",
  "not",
  "route",
  "stop",
  "only",
  "mock",
  "method",
  "type",
];

// HTTP method whitelist used to flag typos in `- method: <value>` directives.
// Mirrors the methods supported by Deno's std/http.
const HTTP_METHODS = new Set([
  "GET",
  "POST",
  "PUT",
  "DELETE",
  "PATCH",
  "HEAD",
  "OPTIONS",
  "CONNECT",
  "TRACE",
]);

// Levenshtein distance with an early-bail cap. Used purely to suggest
// likely-intended directive names for typos like "chek" → "check".
// Ref: https://en.wikipedia.org/wiki/Levenshtein_distance
function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 2) return 3;
  const dp: number[][] = Array.from(
    { length: m + 1 },
    () => new Array(n + 1).fill(0),
  );
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[m][n];
}

function suggestDirective(unknown: string): string | null {
  const lower = unknown.toLowerCase();
  for (const key of CANONICAL_DIRECTIVES) {
    if (lower === key) return null;
    if (editDistance(lower, key) <= 2) return key;
  }
  return null;
}

const setupChecks = (input: mdToPipeInput) => {
  const inRange = (ranges: Array<number[]>, index: number) => {
    return ranges.find(([start, stop]: number[]) => {
      return start < index && stop > index;
    });
  };

  const filePath = input.pipe.mdPath || "<unknown>";
  // Matches anything shaped like `<key>: <value>` so we can lint typo'd
  // directives. Anchored at start so prose containing colons doesn't false-trip.
  const directiveLikeRegex = /^([a-zA-Z][a-zA-Z0-9_-]*)\s*:\s*(.*)$/;

  input.pipe.steps = input.pipe.steps.map((step: Step) => {
    step.inList = !!inRange(input.ranges.lists, step.range[0]);
    return step;
  })
    .map((step: Step, stepIndex: number) => {
      if (step.inList) {
        const listRange = inRange(input.ranges.lists, step.range[0]);
        // Regex to match DSL directives in list items before code blocks.
        // Each directive controls conditional execution or response metadata.
        // "method" filters by HTTP method; "type" sets response content-type.
        // Ref: pdPipe/pdUtils.ts funcWrapper() for runtime evaluation
        const checkRegex = new RegExp(
          "(?<type>check|when|if|flags|or|and|not|route|stop|only|mock|method|type):\\s*(?<pointer>\\S*)",
        );

        if (listRange) {
          // Collect list item text content alongside the source line of each
          // `list_item_open` token, so lint warnings can point at the exact
          // line of the offending directive.
          type ListItemEntry = { text: string; line?: number };
          const listItems: ListItemEntry[] = [];

          for (let i = listRange[0]; i < step.range[0]; i++) {
            const token = input.tokens[i];
            if (token.type === "list_item_open") {
              listItems.push({
                text: "",
                line: token.map ? token.map[0] + 1 : undefined,
              });
            } else if (token.type === "inline" || token.type === "text") {
              if (listItems.length > 0) {
                listItems[listItems.length - 1].text += token.content || "";
              }
            }
          }

          listItems
            .map((entry) => entry.text.trim())
            .map((text: string) => checkRegex.exec(text))
            .filter((match) => match)
            .map((match) => (match?.groups || { type: "", pointer: "" }))
            .forEach((check) => {
              const appendCheck = pd.$p.compile("/config/checks/-");
              const actions: Record<string, () => void> = {
                "check": () => appendCheck.set(step, check.pointer),
                "if": () => appendCheck.set(step, check.pointer),
                "when": () => appendCheck.set(step, check.pointer),
                "flags": () => appendCheck.set(step, "/flags" + check.pointer),
                "or": () => pd.$p.set(step, `/config/or/-`, check.pointer),
                "and": () => pd.$p.set(step, `/config/and/-`, check.pointer),
                "not": () => pd.$p.set(step, `/config/not/-`, check.pointer),
                "route": () =>
                  pd.$p.set(step, `/config/routes/-`, check.pointer),
                "stop": () => pd.$p.set(step, `/config/stop`, stepIndex),
                "only": () => pd.$p.set(step, `/config/only`, stepIndex),
                "mock": () => {
                  step.mock = true;
                },
                // "method" — HTTP method guard (e.g., method: POST).
                // Multiple method directives on one step act as OR.
                // Ref: pdPipe/pdUtils.ts funcWrapper() for runtime evaluation
                "method": () =>
                  pd.$p.set(
                    step,
                    `/config/methods/-`,
                    check.pointer.toUpperCase(),
                  ),
                // "type" — response content-type shorthand (e.g., type: html).
                // Supports shorthand names (json, html, text, etc.) or raw MIME types.
                // Applied after step execution by funcWrapper.
                // Ref: pdPipe/pdUtils.ts CONTENT_TYPE_MAP for shorthand resolution
                "type": () =>
                  pd.$p.set(step, `/config/contentType`, check.pointer),
              };

              actions[check.type]?.();
            });

          // Also handle bare `- mock` (no colon)
          listItems
            .map((entry) => entry.text.trim())
            .filter((text: string) => text === "mock")
            .forEach(() => {
              step.mock = true;
            });

          // Lint pass: flag typo'd directives ("chek: /flag") and unknown
          // HTTP methods ("method: WHATEVER"). False-positives on prose
          // are avoided by only suggesting when the unknown key is within
          // edit distance 2 of a canonical directive.
          for (const entry of listItems) {
            const trimmed = entry.text.trim();
            if (trimmed === "" || trimmed === "mock") continue;
            const directiveMatch = directiveLikeRegex.exec(trimmed);
            if (!directiveMatch) continue;
            const key = directiveMatch[1];
            const value = directiveMatch[2];
            const lowerKey = key.toLowerCase();

            if (CANONICAL_DIRECTIVES.includes(lowerKey)) {
              if (lowerKey === "method") {
                const method = value.trim().split(/\s+/)[0]?.toUpperCase() ||
                  "";
                if (method && !HTTP_METHODS.has(method)) {
                  const pdErr = Object.assign(
                    new Error(
                      `unknown HTTP method "${value.trim()}" — expected one of ${
                        [...HTTP_METHODS].join(", ")
                      }`,
                    ),
                    {
                      func: "setupChecks",
                      severity: "warning" as const,
                      filePath,
                      line: entry.line,
                      column: 1,
                    },
                  ) as PDError;
                  input.errors = input.errors || [];
                  input.errors.push(pdErr);
                }
              }
              continue;
            }

            const suggestion = suggestDirective(key);
            if (suggestion) {
              const pdErr = Object.assign(
                new Error(
                  `unknown directive "${key}" (did you mean "${suggestion}"?)`,
                ),
                {
                  func: "setupChecks",
                  severity: "warning" as const,
                  filePath,
                  line: entry.line,
                  column: 1,
                },
              ) as PDError;
              input.errors = input.errors || [];
              input.errors.push(pdErr);
            }
          }
        }
      }
      return step;
    });
};

export const mdToPipe = async (
  input: { markdown: string; pipe: Pipe } & Input,
) => {
  const funcs = [
    parseMarkdown,
    validateMarkdownStructure,
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
