var pipe = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // <stdin>
  var stdin_exports = {};
  __export(stdin_exports, {
    pipe: () => pipe
  });

  // pipeline.js
  function Pipeline(presetStages) {
    this.stages = presetStages || [];
  }
  Pipeline.prototype.pipe = function(stage) {
    this.stages.push(stage);
    return this;
  };
  Pipeline.prototype.process = function(args) {
    if (this.stages.length === 0) {
      return args;
    }
    var stageOutput = args;
    this.stages.forEach(function(stage, counter) {
      if (stageOutput && typeof stageOutput.then === "function") {
        stageOutput = stageOutput.then(stage);
      } else {
        if (typeof stage === "function") {
          stageOutput = stage(stageOutput);
        } else {
          stageOutput = stage;
        }
      }
    });
    return stageOutput;
  };
  var pipeline_default = Pipeline;

  // pipeProcessor.js
  function pipeProcessor(funcSequence, callbacks = {
    always: () => {
    }
  }) {
    const codeToFunctions = funcSequence.map((func) => wrapCode(func, callbacks));
    return new pipeline_default(codeToFunctions);
  }
  function wrapCode(func, callbacks) {
    const AsyncFunction = Object.getPrototypeOf(async function() {
    }).constructor;
    return async function(input) {
      const state = { name: func.name, func };
      state.start = Date.now();
      state.input = input;
      try {
        await resolveDependencies(input);
        await new AsyncFunction("input", func.code).call(this, input);
      } catch (e) {
        console.error(e);
        console.log(JSON.stringify(e));
      } finally {
        state.end = Date.now();
        state.duration = state.end - state.start;
        state.output = input;
        console.log(state);
        callbacks && callbacks.always && callbacks.always(state, input);
      }
      return input;
    };
  }
  async function resolveDependencies(input) {
    const checks = [input !== void 0, "dependencies" in input];
    if (checks.every(Boolean)) {
      return await Promise.all(input.dependencies.map(async (dependencyConfig) => {
        if (dependencyConfig.deptype === "css") {
          if (input.nocss)
            return dependencyConfig;
          addLinkToHeadIfMissing(addCssLink(dependencyConfig));
          return dependencyConfig;
        }
        if (dependencyConfig.deptype === "js") {
          addScriptToHeadIfMissing(makeScript(dependencyConfig));
          return dependencyConfig;
        }
        if (dependencyConfig.export in window) {
        } else {
          const module = await import(
            /* @vite-ignore */
            dependencyConfig.path
          );
          if (dependencyConfig.export in window) {
          } else {
            window.pipedeps = window.pipedeps || {};
            window.pipedeps[dependencyConfig.export] = module[dependencyConfig.export];
          }
        }
        return dependencyConfig;
      }));
    }
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
      found = headLink.href === link.href;
    });
    !found && document.head.appendChild(link);
  }
  function makeScript(dep) {
    const script = document.createElement("script");
    script.src = dep.src;
    return script;
  }
  function addScriptToHeadIfMissing(script) {
    let found = false;
    document.querySelectorAll("script").forEach((headScript) => {
      found = headScript.src === script.path;
    });
    !found && document.head.appendChild(script);
  }

  // <stdin>
  function pipe() {
    const funcSequence = [
      {
        "id": 23,
        "name": "deno esbuild 0.18.17 (dynamic import)",
        "description": "",
        "code": "const esbuild = await import('https://deno.land/x/esbuild@v0.18.17/mod.js');\n\nwindow.pipedeps = window.pipedeps || {}\nwindow.pipedeps.build = esbuild.build",
        "inputs": [],
        "outputs": [],
        "archived": false,
        "render": false,
        "dependency": false,
        "execOnServer": false
      },
      {
        "id": 26,
        "name": "pd fetch functions",
        "description": "",
        "code": "const response = await fetch('http://localhost:8000/api/functions');\ninput.functions = await response.json();",
        "inputs": [],
        "outputs": [],
        "archived": false,
        "render": false,
        "dependency": false,
        "execOnServer": false
      },
      {
        "id": 25,
        "name": "New Function",
        "description": "",
        "code": "input.firstFunction = input.functions[0]\ninput.functions = input.functions.length\ninput.code = input.firstFunction.code",
        "inputs": [],
        "outputs": [],
        "archived": true,
        "render": false,
        "dependency": false,
        "execOnServer": false
      },
      {
        "id": 27,
        "name": "esbuild bundle config",
        "description": "",
        "code": "input.buildConfig = {\n        bundle: true,\n        stdin: {\n            contents: input.code,\n            resolveDir: '.'\n        },\n        format: 'esm',\n        write: false,\n        treeShaking: true,\n    }",
        "inputs": [],
        "outputs": [],
        "archived": false,
        "render": false,
        "dependency": false,
        "execOnServer": false
      },
      {
        "id": 28,
        "name": "esbuild call",
        "description": "",
        "code": "const output = await pipedeps.build(input.buildConfig)\ninput.buildOutput = output.outputFiles[0].text",
        "inputs": [],
        "outputs": [],
        "archived": false,
        "render": false,
        "dependency": false,
        "execOnServer": false
      }
    ];
    return pipeProcessor(funcSequence, { always: () => {
    } });
  }
  return __toCommonJS(stdin_exports);
})();
