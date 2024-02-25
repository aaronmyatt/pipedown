import Pipeline from "./pipeline.js";

const defaultOpts = {
  _pipe: {},
  defaultInput: {},
  callbacks: { always: () => {} },
};
export function pipeProcessor(funcSequence, opts) {
  opts = Object.assign({}, defaultOpts, opts);
  const codeToFunctions = funcSequence
    // .filter(func => func.code)
    .map((func) => wrapCode.call(this, func, opts));
  const pipe = new Pipeline(codeToFunctions);
  pipe.defaultArgs = Object.assign(
    {},
    // this.defaultInput,
    opts.defaultInput,
  );
  return pipe;
}

function wrapCode(func, opts) {
  const that = this;
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

  return async function (input = {}) {
    input = input || {};
    if (input.error) return input;
    const state = { name: func.name, func };
    state.start = Date.now();
    state.input = Object.assign({}, input);

    try {
      await resolveDependencies.call(that, input);
      await func.exec(input);
    } catch (e) {
      console.error(e);
      console.log(JSON.stringify(e));
      input.error = {
        funcid: func.id,
        name: func.name,
        message: e.message,
        stack: e.stack,
      };
    } finally {
      state.end = Date.now();
      state.duration = state.end - state.start;
      state.output = Object.assign({}, input);
      opts && opts.always && opts.always(state, input);
    }
    return input;
  };
}

async function resolveDependencies(input) {
  if (!input || !input.dependencies || input.dependencies.length === 0) {
    return input;
  }

  return await Promise.all(input.dependencies
    .map(async (dependencyConfig) => {
      if (dependencyConfig.deptype === "css") {
        try {
          // we may want to refer to a css dependency server side
          addLinkToHeadIfMissing(addCssLink(dependencyConfig));
        } catch (e) {
          input.warn = {
            message: `Could not load css dependency ${dependencyConfig.path}`,
          };
        }
        return dependencyConfig;
      }

      if (dependencyConfig.deptype === "javascript") {
        addScriptToHeadIfMissing(makeScript(dependencyConfig));
        return dependencyConfig;
      }

      await import(/* @vite-ignore */ dependencyConfig.path).then((module) => {
        pipedeps[dependencyConfig.export] = module[dependencyConfig.export]
          ? module[dependencyConfig.export]
          : module.default;
        this[dependencyConfig.export] = module[dependencyConfig.export]
          ? module[dependencyConfig.export]
          : module.default;
      });
      return dependencyConfig;
    }));
}

function addCssLink(dep) {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = dep.path;
  return link;
}

function addLinkToHeadIfMissing(link) {
  let found = false;
  document.querySelectorAll("link").forEach((headLink) => {
    if (found) return;
    found = headLink.href === link.href;
  });
  !found && document.head.appendChild(link);
}

function makeScript(dep) {
  const script = document.createElement("script");
  script.src = dep.path;
  return script;
}

function addScriptToHeadIfMissing(script) {
  let found = false;
  document.querySelectorAll("script").forEach((headScript) => {
    found = headScript.src === script.src;
  });
  !found && document.head.appendChild(script);
}

function addScriptToBodyIfMissing(script) {
  let found = false;
  document.body.querySelectorAll("script").forEach((headScript) => {
    found = headScript.src === script.src;
  });
  !found && document.body.appendChild(script);
}

globalThis.addLinkToHead = (url) => {
  const link = addCssLink({ path: url });
  addLinkToHeadIfMissing(link);
};
globalThis.addScriptToHeadIfMissing = addScriptToHeadIfMissing;
globalThis.addScriptToBodyIfMissing = addScriptToBodyIfMissing;
