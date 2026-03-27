// @ts-nocheck

import {assertEquals} from "jsr:@std/assert"
import { assertSnapshot } from "jsr:@std/testing/snapshot";
import {pipe, rawPipe} from "./index.ts";

// --- VCR Configuration ---
// Modes: "record" | "replay" | "auto" | "off"
//   record  — execute mock steps normally, save before/after as cassettes
//   replay  — load cassettes, skip mock step execution (error if missing)
//   auto    — replay if cassettes exist, otherwise execute normally
//   off     — ignore mock flags, run everything
const VCR_MODE = Deno.env.get("PD_VCR_MODE") || "auto";

// --- VCR Utilities ---

function safeSnapshot(
  input: Record<string, unknown>,
  exclude: string[] = ["request", "response", "event"],
): Record<string, unknown> {
  const snap: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (exclude.includes(key)) {
      snap[key] = `[${typeof value}]`;
      continue;
    }
    try {
      snap[key] = structuredClone(value);
    } catch {
      snap[key] = `[non-cloneable: ${typeof value}]`;
    }
  }
  return snap;
}

function hashInput(input: Record<string, unknown>): string {
  const { errors: _e, mode: _m, test: _t, ...rest } = input;
  const str = JSON.stringify(rest);
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

function cassettePath(pipeName: string, inputName: string, stepFuncName: string): string {
  return `.cassettes/${pipeName}/${inputName}/${stepFuncName}.json`;
}

function cassetteDirPath(pipeName: string, inputName: string): string {
  return `.cassettes/${pipeName}/${inputName}`;
}

async function readCassette(path: string): Promise<Record<string, unknown> | null> {
  try {
    const text = await Deno.readTextFile(path);
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function writeCassette(path: string, dirPath: string, data: Record<string, unknown>): Promise<void> {
  await Deno.mkdir(dirPath, { recursive: true });
  await Deno.writeTextFile(path, JSON.stringify(data, null, 2));
}

// --- Identify mock-flagged steps ---
const mockStepIndices = new Set<number>();
(rawPipe.steps || []).forEach((step: { mock?: boolean }, index: number) => {
  if (step.mock) mockStepIndices.add(index);
});
const hasMockSteps = mockStepIndices.size > 0;

// --- Wrap pipeline stages for VCR ---
function setupVCR(mode: string, inputName: string) {
  const originalStages = [...pipe.stages];

  if (!hasMockSteps || mode === "off") {
    return { restore: () => {} };
  }

  pipe.stages = originalStages.map((stage, index) => {
    if (!mockStepIndices.has(index)) return stage;

    const stepMeta = rawPipe.steps[index];
    const cPath = cassettePath(rawPipe.cleanName, inputName, stepMeta.funcName);
    const cDirPath = cassetteDirPath(rawPipe.cleanName, inputName);

    if (mode === "record") {
      const recorded = async function (input: Record<string, unknown>) {
        const before = safeSnapshot(input);
        const result = await stage(input);
        const output = result || input;
        const after = safeSnapshot(output);
        await writeCassette(cPath, cDirPath, {
          pipeName: rawPipe.name,
          stepName: stepMeta.name,
          stepIndex: index,
          inputName,
          recordedAt: new Date().toISOString(),
          before,
          after,
        });
        return output;
      };
      Object.defineProperty(recorded, "name", { value: stage.name });
      return recorded;
    }

    if (mode === "replay") {
      const replayed = async function (input: Record<string, unknown>) {
        const cassette = await readCassette(cPath);
        if (!cassette) {
          throw new Error(
            `VCR replay: no cassette found at ${cPath}. Run "pd test --record" first.`
          );
        }
        const after = cassette.after as Record<string, unknown>;
        Object.assign(input, after);
        return input;
      };
      Object.defineProperty(replayed, "name", { value: stage.name });
      return replayed;
    }

    // "auto": replay if cassette exists, otherwise execute normally
    const autoReplay = async function (input: Record<string, unknown>) {
      const cassette = await readCassette(cPath);
      if (cassette) {
        const after = cassette.after as Record<string, unknown>;
        Object.assign(input, after);
        return input;
      }
      return await stage(input);
    };
    Object.defineProperty(autoReplay, "name", { value: stage.name });
    return autoReplay;
  });

  return {
    restore: () => { pipe.stages = originalStages; },
  };
}

// --- Test execution ---
Deno.test(rawPipe.name, async (t) => {
  rawPipe.config = rawPipe.config || {};
  rawPipe.config.inputs = rawPipe.config.inputs || [];

  for(const pipeInput of rawPipe.config.inputs) {
    const testName = pipeInput?._name || JSON.stringify(pipeInput)
    const inputName = pipeInput?._name || hashInput(pipeInput);
    pipeInput.mode = 'test';
    await t.step({
      name: testName,
      fn: async () => {
        pipeInput.test = true;
        const vcr = setupVCR(VCR_MODE, inputName);
        try {
          const output = await pipe.process(pipeInput);
          try {
            await assertSnapshot(t, output, {name: testName});
          } catch (e) {
            console.log(output);
            throw e;
          }
        } finally {
          vcr.restore();
        }
      }
    })
  }
});
