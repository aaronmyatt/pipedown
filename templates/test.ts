import {assertEquals} from "jsr:@std/assert"
import { assertSnapshot } from "jsr:@std/testing/snapshot";
import {pipe, rawPipe} from "./index.ts";

Deno.test(rawPipe.name, async (t) => {
  rawPipe.config = rawPipe.config || {};
  rawPipe.config.inputs = rawPipe.config.inputs || [];

  for(const pipeInput of rawPipe.config.inputs) {
    const testName = pipeInput?._name || JSON.stringify(pipeInput)
    pipeInput.mode = 'test';
    await t.step({
      name: testName,
      fn: async () => {
        pipeInput.test = true;
        const output = await pipe.process(pipeInput);
        try {
          await assertSnapshot(t, output, {name: testName});
        } catch (e) {
          console.log(output);
          throw e;
        }
      }
    })
  }
});
