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
        "id": 32,
        "name": "Bootstrap 5.3.1 css",
        "description": "",
        "code": 'input.dependencies = input.dependencies || [];\ninput.dependencies.push({"path":"https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css","export":"","alias":"", "deptype": "css"})',
        "inputs": [
          {
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "css"
              }
            ]
          },
          {
            "dependencies": []
          },
          {
            "dependencies": []
          },
          {
            "dependencies": []
          },
          {
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "css"
              }
            ]
          },
          {
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "css",
                "type": "css"
              }
            ],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "Adult cats only meow to communicate with humans."
              ]
            },
            "catfact": "Adult cats only meow to communicate with humans.",
            "html": "<h1>YERP!</h1>",
            "upperFunk": "FUNKY"
          },
          {
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "css",
                "type": "css"
              }
            ]
          },
          {
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "css",
                "type": "css"
              }
            ],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "Not every cat gets 'high' from catnip. Whether or not a cat responds to it depends upon a recessive gene: no gene, no joy."
              ]
            },
            "catfact": "Not every cat gets 'high' from catnip. Whether or not a cat responds to it depends upon a recessive gene: no gene, no joy.",
            "html": '<h1 class="display-6">YERP!</h1>',
            "upperFunk": "FUNKY"
          },
          {
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "css",
                "type": "css"
              }
            ]
          },
          {
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "css",
                "type": "css"
              }
            ]
          },
          {
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "css",
                "type": "css"
              }
            ]
          },
          {
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "css",
                "type": "css"
              }
            ]
          },
          {
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "css",
                "type": "css"
              }
            ]
          },
          {
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "css",
                "type": "css"
              }
            ]
          },
          {
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "css",
                "type": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      Column\n    </div>\n    <div class="col">\n      Column\n    </div>\n    <div class="col">\n      Column\n    </div>\n  </div>\n</div>'
          },
          {
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "css",
                "type": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      Start / Stop\n    </div>\n    <div class="col">\n      Boop\n    </div>\n  </div>\n</div>'
          },
          {
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "css",
                "type": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col text-bg-success">\n      <button class="btn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary">\n      Boop\n    </div>\n  </div>\n</div>'
          },
          {
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "css",
                "type": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary">\n      Boop\n    </div>\n  </div>\n</div>'
          },
          {
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "css",
                "type": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary">\n      Boop\n    </div>\n  </div>\n</div>'
          },
          {
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "css",
                "type": "css"
              }
            ]
          },
          {
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "css",
                "type": "css"
              }
            ]
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "css",
                "type": "css"
              }
            ]
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "css",
                "type": "css"
              }
            ]
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "deptype",
                "type": "css"
              }
            ]
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "deptype",
                "type": "css"
              }
            ]
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ]
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ]
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer align-items-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer align-self-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer align-self-center h-full">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer align-self-center h-100">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center justify-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center justify-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center justify-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ]
          }
        ],
        "outputs": [
          {
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "css"
              }
            ]
          },
          {
            "dependencies": []
          },
          {
            "dependencies": []
          },
          {
            "dependencies": []
          },
          {
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "css"
              }
            ]
          },
          {
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "css",
                "type": "css"
              }
            ],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "Adult cats only meow to communicate with humans."
              ]
            },
            "catfact": "Adult cats only meow to communicate with humans.",
            "html": "<h1>YERP!</h1>",
            "upperFunk": "FUNKY"
          },
          {
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "css",
                "type": "css"
              }
            ]
          },
          {
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "css",
                "type": "css"
              }
            ],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "Not every cat gets 'high' from catnip. Whether or not a cat responds to it depends upon a recessive gene: no gene, no joy."
              ]
            },
            "catfact": "Not every cat gets 'high' from catnip. Whether or not a cat responds to it depends upon a recessive gene: no gene, no joy.",
            "html": '<h1 class="display-6">YERP!</h1>',
            "upperFunk": "FUNKY"
          },
          {
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "css",
                "type": "css"
              }
            ]
          },
          {
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "css",
                "type": "css"
              }
            ]
          },
          {
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "css",
                "type": "css"
              }
            ]
          },
          {
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "css",
                "type": "css"
              }
            ]
          },
          {
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "css",
                "type": "css"
              }
            ]
          },
          {
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "css",
                "type": "css"
              }
            ]
          },
          {
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "css",
                "type": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      Column\n    </div>\n    <div class="col">\n      Column\n    </div>\n    <div class="col">\n      Column\n    </div>\n  </div>\n</div>'
          },
          {
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "css",
                "type": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      Start / Stop\n    </div>\n    <div class="col">\n      Boop\n    </div>\n  </div>\n</div>'
          },
          {
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "css",
                "type": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col text-bg-success">\n      <button class="btn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary">\n      Boop\n    </div>\n  </div>\n</div>'
          },
          {
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "css",
                "type": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary">\n      Boop\n    </div>\n  </div>\n</div>'
          },
          {
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "css",
                "type": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary">\n      Boop\n    </div>\n  </div>\n</div>'
          },
          {
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "css",
                "type": "css"
              }
            ]
          },
          {
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "css",
                "type": "css"
              }
            ]
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "css",
                "type": "css"
              }
            ]
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "css",
                "type": "css"
              }
            ]
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "deptype",
                "type": "css"
              }
            ]
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "deptype",
                "type": "css"
              }
            ]
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ]
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ]
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer align-items-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer align-self-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer align-self-center h-full">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer align-self-center h-100">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center justify-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center justify-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center justify-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ]
          }
        ],
        "archived": false,
        "render": false,
        "dependency": true,
        "execOnServer": false,
        "transform": {
          "prop": null
        }
      },
      {
        "id": 44,
        "name": "Dependency: css /npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
        "description": "",
        "code": 'input.dependencies = input.dependencies || [];\ninput.dependencies.push({"path":"https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css","export":"","alias":"","deptype":"css"})',
        "inputs": [
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ]
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer align-items-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer align-self-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer align-self-center h-full">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer align-self-center h-100">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center justify-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center justify-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center justify-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ]
          }
        ],
        "outputs": [
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ]
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer align-items-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer align-self-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer align-self-center h-full">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer align-self-center h-100">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center justify-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center justify-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center justify-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ]
          }
        ],
        "archived": false,
        "render": false,
        "transform": {
          "prop": ""
        },
        "dependency": false,
        "execOnServer": false
      },
      {
        "id": 35,
        "name": "html transform",
        "description": "",
        "code": '// this input was generated by the property editor\n// making changes manually may have unexpected results\ninput.html = `<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center justify-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>`',
        "inputs": [
          {
            "html": "<h1>Wat</h1>"
          },
          {
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      Column\n    </div>\n    <div class="col">\n      Column\n    </div>\n    <div class="col">\n      Column\n    </div>\n  </div>\n</div>'
          },
          {
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "css",
                "type": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      Column\n    </div>\n    <div class="col">\n      Column\n    </div>\n    <div class="col">\n      Column\n    </div>\n  </div>\n</div>'
          },
          {
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "css",
                "type": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      Start / Stop\n    </div>\n    <div class="col">\n      Boop\n    </div>\n  </div>\n</div>'
          },
          {
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "css",
                "type": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col text-bg-success">\n      <button class="btn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary">\n      Boop\n    </div>\n  </div>\n</div>'
          },
          {
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "css",
                "type": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary">\n      Boop\n    </div>\n  </div>\n</div>'
          },
          {
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "css",
                "type": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary">\n      Boop\n    </div>\n  </div>\n</div>'
          },
          {
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "css",
                "type": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary">\n      Boop\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer align-items-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer align-self-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer align-self-center h-full">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer align-self-center h-100">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center justify-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center justify-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center justify-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center justify-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          }
        ],
        "outputs": [
          {
            "html": "<h1>Wat</h1>"
          },
          {
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      Column\n    </div>\n    <div class="col">\n      Column\n    </div>\n    <div class="col">\n      Column\n    </div>\n  </div>\n</div>'
          },
          {
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "css",
                "type": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      Column\n    </div>\n    <div class="col">\n      Column\n    </div>\n    <div class="col">\n      Column\n    </div>\n  </div>\n</div>'
          },
          {
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "css",
                "type": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      Start / Stop\n    </div>\n    <div class="col">\n      Boop\n    </div>\n  </div>\n</div>'
          },
          {
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "css",
                "type": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col text-bg-success">\n      <button class="btn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary">\n      Boop\n    </div>\n  </div>\n</div>'
          },
          {
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "css",
                "type": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary">\n      Boop\n    </div>\n  </div>\n</div>'
          },
          {
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "css",
                "type": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary">\n      Boop\n    </div>\n  </div>\n</div>'
          },
          {
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "css",
                "type": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary">\n      Boop\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer align-items-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer align-self-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer align-self-center h-full">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer align-self-center h-100">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center justify-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center justify-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center justify-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center justify-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          }
        ],
        "archived": false,
        "render": false,
        "transform": {
          "prop": "html"
        },
        "dependency": false,
        "execOnServer": false
      },
      {
        "id": 45,
        "name": "New Function",
        "description": "",
        "code": "",
        "inputs": [
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer align-items-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer align-self-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer align-self-center h-full">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer align-self-center h-100">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center justify-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center justify-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center justify-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center justify-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          }
        ],
        "outputs": [
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer align-items-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer align-self-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer align-self-center h-full">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer align-self-center h-100">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center justify-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center justify-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center justify-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center justify-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          }
        ],
        "archived": false,
        "render": true,
        "transform": {
          "prop": ""
        },
        "dependency": false,
        "execOnServer": false
      },
      {
        "id": 37,
        "name": "Play a simple noise",
        "description": "Use pure JS to play a simple noise, taken from: https://stackoverflow.com/questions/879152/how-do-i-make-javascript-beep",
        "code": "//if you have another AudioContext class use that one, as some browsers have a limit\nvar audioCtx = new (window.AudioContext || window.webkitAudioContext || window.audioContext);\n\n//All arguments are optional:\n\n//duration of the tone in milliseconds. Default is 500\n//frequency of the tone in hertz. default is 440\n//volume of the tone. Default is 1, off is 0.\n//type of tone. Possible values are sine, square, sawtooth, triangle, and custom. Default is sine.\n//callback to use on end of tone\nfunction beep(duration, frequency, volume, type, callback) {\n    var oscillator = audioCtx.createOscillator();\n    var gainNode = audioCtx.createGain();\n    \n    oscillator.connect(gainNode);\n    gainNode.connect(audioCtx.destination);\n    \n    if (volume){gainNode.gain.value = volume;}\n    if (frequency){oscillator.frequency.value = frequency;}\n    if (type){oscillator.type = type;}\n    if (callback){oscillator.onended = callback;}\n    \n    oscillator.start(audioCtx.currentTime);\n    oscillator.stop(audioCtx.currentTime + ((duration || 500) / 1000));\n};\n\ninput.beep = beep",
        "inputs": [
          {
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "css",
                "type": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary">\n      Boop\n    </div>\n  </div>\n</div>'
          },
          {
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "css",
                "type": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary">\n      Boop\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer align-items-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer align-self-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer align-self-center h-full">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer align-self-center h-100">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center justify-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center justify-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center justify-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center justify-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          }
        ],
        "outputs": [
          {
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "css",
                "type": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary">\n      Boop\n    </div>\n  </div>\n</div>'
          },
          {
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "css",
                "type": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary">\n      Boop\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer align-items-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer align-self-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer align-self-center h-full">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer align-self-center h-100">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center justify-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center justify-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center justify-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center justify-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          }
        ],
        "archived": false,
        "render": false,
        "transform": {
          "prop": null
        },
        "dependency": false,
        "execOnServer": false
      },
      {
        "id": 42,
        "name": "New Function",
        "description": "",
        "code": "function stringToHTML(str) {\n    var parser = new DOMParser();\n    var doc = parser.parseFromString(str, 'text/html');\n    return doc.body.firstChild;\n}\n\ndocument.body.replaceChild(stringToHTML(input.html), document.body.firstChild)",
        "inputs": [
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer align-items-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer align-self-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer align-self-center h-full">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer align-self-center h-100">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center justify-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center justify-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center justify-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center justify-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          }
        ],
        "outputs": [
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer align-items-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer align-self-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer align-self-center h-full">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer align-self-center h-100">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center justify-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center justify-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center justify-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center justify-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          }
        ],
        "archived": false,
        "render": false,
        "transform": {
          "prop": null
        },
        "dependency": false,
        "execOnServer": false
      },
      {
        "id": 43,
        "name": "New Function",
        "description": "",
        "code": "for(const el of document.getElementsByClassName('startstopbtn')){\n  el.addEventListener('click', () => {\n    setInterval(() => input.beep(100), 1000)\n  })\n}",
        "inputs": [
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer align-items-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer align-self-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer align-self-center h-full">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer align-self-center h-100">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center justify-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center justify-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center justify-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center justify-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          }
        ],
        "outputs": [
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer align-items-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer align-self-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer align-self-center h-full">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer align-self-center h-100">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center justify-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center justify-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center justify-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center justify-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          }
        ],
        "archived": false,
        "render": false,
        "transform": {
          "prop": null
        },
        "dependency": false,
        "execOnServer": false
      },
      {
        "id": 38,
        "name": "New Function",
        "description": "",
        "code": "",
        "inputs": [
          {
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "css",
                "type": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary">\n      Boop\n    </div>\n  </div>\n</div>'
          },
          {
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "css",
                "type": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary">\n      Boop\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer align-items-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer align-self-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer align-self-center h-full">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer align-self-center h-100">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center justify-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center justify-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center justify-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center justify-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          }
        ],
        "outputs": [
          {
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "css",
                "type": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary">\n      Boop\n    </div>\n  </div>\n</div>'
          },
          {
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "css",
                "type": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary">\n      Boop\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer align-items-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer align-self-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer align-self-center h-full">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer align-self-center h-100">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center justify-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center justify-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center justify-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          },
          {
            "nocss": true,
            "dependencies": [
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap@5.3.1/dist/css/bootstrap.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "html": '<div class="container text-center">\n  <div class="row">\n    <div class="col">\n      <button class="btn btn-success startstopbtn"> Start / Stop </button>\n    </div>\n    <div class="col text-bg-primary boopcontainer d-flex align-items-center justify-content-center">\n      <i class="bi bi-soundwave"></i>\n    </div>\n  </div>\n</div>'
          }
        ],
        "archived": false,
        "render": true,
        "transform": {
          "prop": null
        },
        "dependency": false,
        "execOnServer": false
      }
    ];
    return pipeProcessor(funcSequence, { always: () => {
    } });
  }
  return __toCommonJS(stdin_exports);
})();
