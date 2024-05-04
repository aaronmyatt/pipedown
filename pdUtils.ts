import type {Pipe, Input, Stage} from "./pipedown.d.ts";
import {pd} from "./deps.ts";

const PD_PIPE_DIR = `/Users/aaronmyatt/WebstormProjects/pipedown`;
const REMOTE_PDPIPE_PATH =
  `${PD_PIPE_DIR}/pdPipe.ts`;
// const OUTPUT_DIR = `.pd/.output`;
// const INPUT_DIR = `.pd/.input`;

function funcWrapper<I extends Input>(funcs: Stage<I>[], opts: Pipe) {
  return funcs.map((func, index: number) => async function(input: I) {
    const funcConfig = pd.$p.get(opts, '/steps/' + index + '/config')

    if(funcConfig && funcConfig.checks){
      const checks = funcConfig.checks.reduce((acc: { [key: string]: unknown; }, check: string) => {
        acc[check] = pd.$p.get(input, check)
        return acc
      }, {} as { [key: string]: unknown; })
      opts.checks = checks
      if(!Object.values(checks).some(check => !!check)){
        return input
      }
    }

    if(funcConfig && funcConfig.routes && input && input.request && input.request.url){
      const url = input.request.url;
      const route = funcConfig.routes
        .map((route: string) => new URLPattern({ pathname: route }))
        .findFirst((route: URLPattern) => route.test(url))

      if(!route) return input

      input.route = route.exec(url);
    }

    const only = (funcConfig && funcConfig.only)
    if(only && only !== index){
      return input
    }

    const stop = (funcConfig && funcConfig.stop)
    if(index > stop){
      return input
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
  })
  .map((func, index) => {
    Object.defineProperty(func, 'name', { value: `${index}-${funcs[index].name}` });
    return func;
  })
}

const camelCaseString = (s: string) => {
  return s
    .replace(/[\W_]+/g, ' ').trim()
    .replace(/(?:^\w|[A-Z]|\b\w)/g, function (word, index) {
      return index === 0 ? word.toLowerCase() : word.toUpperCase();
  }).replace(/\s+/g, "");
};

export { funcWrapper, PD_PIPE_DIR, REMOTE_PDPIPE_PATH, camelCaseString };
