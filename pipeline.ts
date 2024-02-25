import type { Stage, Input } from "./pipedown.d.ts";
"use strict";
/**
 * Creates a new pipeline. Optionally pass an array of stages
 *
 * @param presetStages[]
 * @constructor
 */
class Pipeline<I extends Input> {
  stages = [] as Stage<I>[];
  defaultArgs = {};
  constructor(presetStages: Stage<I>[] = [], defaultArgs = {}) {
    this.defaultArgs = defaultArgs;
    // Stages for the pipeline, either received through
    // the constructor or the pipe method in prototype
    this.stages = presetStages || [];
  }

  pipe(stage: Stage<I>) {
    this.stages.push(stage);
    return this;
  };

  process (args: I) {
    args = Object.assign({}, this.defaultArgs, args);

    // Output is same as the passed args, if
    // there are no stages in the pipeline
    if (this.stages.length === 0) {
      return args;
    }

    // Set the stageOutput to be args
    // as there is no output to start with
    let stageOutput: Promise<I> | Promise<Awaited<I>>  = Promise.resolve(args);

    this.stages.forEach(function (stage: Stage<I>, _counter: number) {
        stageOutput = stageOutput.then(stage);
      // Output from the last stage was promise
      // if (stageOutput instanceof Promise) {
      //   // Call the next stage only when the promise is fulfilled
      // } else {
      //   // Otherwise, call the next stage with the last stage output
      //   if (typeof stage === "function") {
      //     stageOutput = stage(stageOutput);
      //   } else {
      //     stageOutput = stage;
      //   }
      // }
    });

    return stageOutput;
  }
}

/**
 * Adds a new stage. Stage can be a function or some literal value. In case
 * of literal values. That specified value will be passed to the next stage and the
 * output from last stage gets ignored
 *
 * @param stage
 * @returns {Pipeline}
 */
// Pipeline.prototype.pipe = function (stage: Stage<I, I>) {
//   this.stages.push(stage);

//   return this;
// };

// /**
//  * Processes the pipeline with passed arguments
//  *
//  * @param args
//  * @returns {*}
//  */
// Pipeline.prototype.process = function (args: Input) {
//   args = Object.assign({}, this.defaultArgs, args);

//   // Output is same as the passed args, if
//   // there are no stages in the pipeline
//   if (this.stages.length === 0) {
//     return args;
//   }

//   // Set the stageOutput to be args
//   // as there is no output to start with
//   let stageOutput: Input|Promise<Input> = args;

//   this.stages.forEach(function (stage: Stage, _counter: number) {
//     // Output from the last stage was promise
//     if (stageOutput instanceof Promise) {
//       // Call the next stage only when the promise is fulfilled
//       stageOutput = stageOutput.then(stage);
//     } else {
//       // Otherwise, call the next stage with the last stage output
//       if (typeof stage === "function") {
//         stageOutput = stage(stageOutput);
//       } else {
//         stageOutput = stage;
//       }
//     }
//   });

//   return stageOutput;
// };

export default Pipeline;
