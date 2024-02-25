import {Pipe, Input, Stage} from "./pipedown.d.ts";
import {$p} from "./jsonPointers.ts";

const PD_PIPE_DIR = `/Users/aaronmyatt/WebstormProjects/pipedown`;
const REMOTE_PDPIPE_PATH =
  `${PD_PIPE_DIR}/pdPipe.ts`;
// const OUTPUT_DIR = `.pd/.output`;
// const INPUT_DIR = `.pd/.input`;

function funcWrapper<I extends Input>(funcs: Stage<I>[], opts: Pipe) {
  opts.$p = $p;

  return funcs.map((func, index: number) => async (input: I) => {
    const funcConfig = $p.get(opts, '/steps/' + index + '/config')

    if(funcConfig && funcConfig.check){
      const checks = funcConfig.check.reduce((acc: Pipe['checks'], check: string) => {
        acc[check] = $p.get(input, check)
        return acc
      }, {} as Pipe['checks'])
      opts.checks = checks
      if(!Object.values(checks).some(check => !!check)){
        return input
      }
    }

    if(funcConfig && funcConfig.route && input.request){
      const pattern = new URLPattern({ pathname: funcConfig.route });
      if(!pattern.test(input.request.url)){
        return input
      }
    }

    if (input.errors && input.errors.length > 0) {
      return input;
    }

    try {
        await func(input, opts);
    } catch (e) {
      input.errors = input.errors || [];
      input.errors.push({
        message: e.message,
        stack: e.stack,
        name: e.name,
        func: func.name,
      });
    }

    return input;
  });
}

// const shouldSaveOutput = (opts, func) => {
//   if (opts.save || opts.saveOutput) {
//     func();
//   }
// };

// const shouldSaveInput = (opts, func) => {
//   if (opts.save || opts.saveInput) {
//     func();
//   }
// };

// async function saveInput(name, input) {
//   try {
//     await Deno.mkdir(INPUT_DIR);
//   } catch (e) {
//     // if(debug) console.log(e);
//   }

//   try {
//     await Deno.writeTextFile(
//       `${INPUT_DIR}/${name}.json`,
//       JSON.stringify({ input: [] }, null, 4),
//       {
//         createNew: true,
//       },
//     );
//   } catch (e) {
//     // if(debug) console.log(e);
//   }

//   await cacheInput(name, input);
// }

// async function saveOutput(name, input, output) {
//   try {
//     await Deno.mkdir(OUTPUT_DIR);
//   } catch (e) {
//     // if(debug) console.log(e);
//   }

//   try {
//     await Deno.writeTextFile(
//       `${OUTPUT_DIR}/${name}.json`,
//       JSON.stringify({}, null, 4),
//       {
//         createNew: true,
//       },
//     );
//   } catch (e) {
//     // if(debug) console.log(e);
//   }
//   await cacheOutput(name, input, output);
// }

// async function cacheInput(name, input) {
//   const oldInput = JSON.parse(
//     await Deno.readTextFile(`${INPUT_DIR}/${name}.json`),
//   );
//   oldInput.input.push(input);
//   await Deno.writeTextFile(
//     `${INPUT_DIR}/${name}.json`,
//     JSON.stringify(oldInput, null, 4),
//   );
// }

// async function cacheOutput(name, input, output) {
//   const oldOutput = JSON.parse(
//     await Deno.readTextFile(`${OUTPUT_DIR}/${name}.json`),
//   );
//   const key = JSON.stringify(input);
//   if (key in oldOutput) {
//     return;
//   } else {
//     oldOutput[key] = output;
//     await Deno.writeTextFile(
//       `${OUTPUT_DIR}/${name}.json`,
//       JSON.stringify(oldOutput, null, 4),
//     );
//   }
// }

export { funcWrapper, PD_PIPE_DIR, REMOTE_PDPIPE_PATH};
