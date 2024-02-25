import {Pipe, Input, Stage} from "./pipedown.d.ts";
import Pipeline from "./pipeline.ts";
import { funcWrapper } from "./pdUtils.ts";

export default function Pipe<I extends Input>(funcs: Stage<I>[], opts: Pipe): Pipeline<I> {
  const dispatchOnStart = (input: I) => {
    const event = new CustomEvent("pd::pipe::start", { detail: input });
    globalThis.dispatchEvent(event);
  }
  funcs.push((input: I) => {
    // dispatch custom event at end of pipeline
    const event = new CustomEvent("pd::pipe::processed", { detail: input });
    globalThis.dispatchEvent(event);
  })

  const wrappedFuncs = funcWrapper(funcs, opts)
  return new Pipeline(wrappedFuncs);
}

export async function process<I extends Input>(steps: ((input: I) => void)[], input: I, opts: Pipe): Promise<I> {
  return await Pipe<I>(steps, opts).process(input);
}
