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
        "id": 41,
        "name": "Dependency: css /npm/bulma@0.9.4/css/bulma.min.css",
        "description": "",
        "code": 'input.dependencies = input.dependencies || [];\ninput.dependencies.push({"path":"https://cdn.jsdelivr.net/npm/bulma@0.9.4/css/bulma.min.css","export":"","alias":"","deptype":"css"})',
        "inputs": [
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
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bulma@0.9.4/css/bulma.min.css",
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
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bulma@0.9.4/css/bulma.min.css",
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
        "dependency": true,
        "execOnServer": false
      },
      {
        "id": 11,
        "name": "some random variable",
        "description": "",
        "code": "input.some = 'random'",
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
            "dependencies": [],
            "some": "random"
          },
          {
            "dependencies": [],
            "some": "random"
          },
          {
            "dependencies": [],
            "some": "random"
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
            "some": "random"
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
            "some": "random"
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
            ],
            "some": "random"
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
            "some": "random"
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
            "some": "random"
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
            "some": "random"
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
            "some": "random"
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
            "some": "random"
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
            "some": "random"
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
            ],
            "some": "random"
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
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bulma@0.9.4/css/bulma.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "A group of cats is called a clowder."
              ]
            },
            "catfact": "A group of cats is called a clowder.",
            "html": '<h1 class="display-1">TRANSFORM!</h1>',
            "upperFunk": "FUNKY"
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
            "dependencies": [],
            "some": "random"
          },
          {
            "dependencies": [],
            "some": "random"
          },
          {
            "dependencies": [],
            "some": "random"
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
            "some": "random"
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
            "some": "random"
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
            ],
            "some": "random"
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
            "some": "random"
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
            "some": "random"
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
            "some": "random"
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
            "some": "random"
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
            "some": "random"
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
            "some": "random"
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
            ],
            "some": "random"
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
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bulma@0.9.4/css/bulma.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "A group of cats is called a clowder."
              ]
            },
            "catfact": "A group of cats is called a clowder.",
            "html": '<h1 class="display-1">TRANSFORM!</h1>',
            "upperFunk": "FUNKY"
          }
        ],
        "archived": false,
        "render": false,
        "transform": {
          "prop": null
        }
      },
      {
        "id": 12,
        "name": "Initial vars",
        "description": "Just getting the right funk",
        "code": "input.funk = 'funky'",
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
            "dependencies": [],
            "some": "random",
            "funk": "funky"
          },
          {
            "dependencies": [],
            "some": "random",
            "funk": "funky"
          },
          {
            "dependencies": [],
            "some": "random",
            "funk": "funky"
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
            "funk": "funky"
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
            "funk": "funky"
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
            ],
            "some": "random",
            "funk": "funky"
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
            "funk": "funky"
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
            "funk": "funky"
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
            "funk": "funky"
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
            "funk": "funky"
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
            "funk": "funky"
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
            "funk": "funky"
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
            ],
            "some": "random",
            "funk": "funky"
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
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bulma@0.9.4/css/bulma.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "some": "random",
            "funk": "funky"
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
            "dependencies": [],
            "some": "random",
            "funk": "funky"
          },
          {
            "dependencies": [],
            "some": "random",
            "funk": "funky"
          },
          {
            "dependencies": [],
            "some": "random",
            "funk": "funky"
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
            "funk": "funky"
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
            "funk": "funky"
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
            ],
            "some": "random",
            "funk": "funky"
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
            "funk": "funky"
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
            "funk": "funky"
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
            "funk": "funky"
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
            "funk": "funky"
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
            "funk": "funky"
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
            "funk": "funky"
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
            ],
            "some": "random",
            "funk": "funky"
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
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bulma@0.9.4/css/bulma.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "some": "random",
            "funk": "funky"
          }
        ]
      },
      {
        "id": 4,
        "name": "fetch meowfact",
        "description": "",
        "code": "input.catfactresponse = await fetch('https://meowfacts.herokuapp.com/').then(r => r.json())",
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
            "dependencies": [],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "Tylenol and chocolate are both poisonous to cats."
              ]
            }
          },
          {
            "dependencies": [],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "The chlorine in fresh tap water irritates sensitive parts of the cat's nose. Let tap water sit for 24 hours before giving it to a cat."
              ]
            }
          },
          {
            "dependencies": [],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "There are cats who have survived falls from over 32 stories (320 meters) onto concrete."
              ]
            }
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
            }
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
                "Cats can jump up to six times their length."
              ]
            }
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
            ],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "Studies now show that the allergen in cats is related to their scent glands. Cats have scent glands on their faces and at the base of their tails. Entire male cats generate the most scent. If this secretion from the scent glands is the allergen, allergic people should tolerate spayed female cats the best."
              ]
            }
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
                'When cats grimace, they are usually "taste-scenting." They have an extra organ that, with some breathing control, allows the cats to taste-sense the air.'
              ]
            }
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
                "Cats have an average of 24 whiskers, arranged in four horizontal rows on each side."
              ]
            }
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
                "Almost 10% of a cat's bones are in its tail, and the tail is used to maintain balance."
              ]
            }
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
                "In ancient Egypt, mummies were made of cats, and embalmed mice were placed with them in their tombs. In one ancient city, over 300,000 cat mummies were found."
              ]
            }
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
                "The Maine Coon is 4 to 5 times larger than the Singapura, the smallest breed of cat."
              ]
            }
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
                "The chlorine in fresh tap water irritates sensitive parts of the cat's nose. Let tap water sit for 24 hours before giving it to a cat."
              ]
            }
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
            ],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "Abraham Lincoln loved cats. He had four of them while he lived in the White House."
              ]
            }
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
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bulma@0.9.4/css/bulma.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "A group of cats is called a clowder."
              ]
            }
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
            "dependencies": [],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "Tylenol and chocolate are both poisonous to cats."
              ]
            }
          },
          {
            "dependencies": [],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "The chlorine in fresh tap water irritates sensitive parts of the cat's nose. Let tap water sit for 24 hours before giving it to a cat."
              ]
            }
          },
          {
            "dependencies": [],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "There are cats who have survived falls from over 32 stories (320 meters) onto concrete."
              ]
            }
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
            }
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
                "Cats can jump up to six times their length."
              ]
            }
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
            ],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "Studies now show that the allergen in cats is related to their scent glands. Cats have scent glands on their faces and at the base of their tails. Entire male cats generate the most scent. If this secretion from the scent glands is the allergen, allergic people should tolerate spayed female cats the best."
              ]
            }
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
                'When cats grimace, they are usually "taste-scenting." They have an extra organ that, with some breathing control, allows the cats to taste-sense the air.'
              ]
            }
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
                "Cats have an average of 24 whiskers, arranged in four horizontal rows on each side."
              ]
            }
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
                "Almost 10% of a cat's bones are in its tail, and the tail is used to maintain balance."
              ]
            }
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
                "In ancient Egypt, mummies were made of cats, and embalmed mice were placed with them in their tombs. In one ancient city, over 300,000 cat mummies were found."
              ]
            }
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
                "The Maine Coon is 4 to 5 times larger than the Singapura, the smallest breed of cat."
              ]
            }
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
                "The chlorine in fresh tap water irritates sensitive parts of the cat's nose. Let tap water sit for 24 hours before giving it to a cat."
              ]
            }
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
            ],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "Abraham Lincoln loved cats. He had four of them while he lived in the White House."
              ]
            }
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
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bulma@0.9.4/css/bulma.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "A group of cats is called a clowder."
              ]
            }
          }
        ]
      },
      {
        "id": 5,
        "name": "extract cat fact response",
        "description": "",
        "code": "input.catfact = input.catfactresponse.data[0]",
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
            "dependencies": [],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "Tylenol and chocolate are both poisonous to cats."
              ]
            },
            "catfact": "Tylenol and chocolate are both poisonous to cats."
          },
          {
            "dependencies": [],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "The chlorine in fresh tap water irritates sensitive parts of the cat's nose. Let tap water sit for 24 hours before giving it to a cat."
              ]
            },
            "catfact": "The chlorine in fresh tap water irritates sensitive parts of the cat's nose. Let tap water sit for 24 hours before giving it to a cat."
          },
          {
            "dependencies": [],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "There are cats who have survived falls from over 32 stories (320 meters) onto concrete."
              ]
            },
            "catfact": "There are cats who have survived falls from over 32 stories (320 meters) onto concrete."
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
            "catfact": "Adult cats only meow to communicate with humans."
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
                "Cats can jump up to six times their length."
              ]
            },
            "catfact": "Cats can jump up to six times their length."
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
            ],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "Studies now show that the allergen in cats is related to their scent glands. Cats have scent glands on their faces and at the base of their tails. Entire male cats generate the most scent. If this secretion from the scent glands is the allergen, allergic people should tolerate spayed female cats the best."
              ]
            },
            "catfact": "Studies now show that the allergen in cats is related to their scent glands. Cats have scent glands on their faces and at the base of their tails. Entire male cats generate the most scent. If this secretion from the scent glands is the allergen, allergic people should tolerate spayed female cats the best."
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
                'When cats grimace, they are usually "taste-scenting." They have an extra organ that, with some breathing control, allows the cats to taste-sense the air.'
              ]
            },
            "catfact": 'When cats grimace, they are usually "taste-scenting." They have an extra organ that, with some breathing control, allows the cats to taste-sense the air.'
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
                "Cats have an average of 24 whiskers, arranged in four horizontal rows on each side."
              ]
            },
            "catfact": "Cats have an average of 24 whiskers, arranged in four horizontal rows on each side."
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
                "Almost 10% of a cat's bones are in its tail, and the tail is used to maintain balance."
              ]
            },
            "catfact": "Almost 10% of a cat's bones are in its tail, and the tail is used to maintain balance."
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
                "In ancient Egypt, mummies were made of cats, and embalmed mice were placed with them in their tombs. In one ancient city, over 300,000 cat mummies were found."
              ]
            },
            "catfact": "In ancient Egypt, mummies were made of cats, and embalmed mice were placed with them in their tombs. In one ancient city, over 300,000 cat mummies were found."
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
                "The Maine Coon is 4 to 5 times larger than the Singapura, the smallest breed of cat."
              ]
            },
            "catfact": "The Maine Coon is 4 to 5 times larger than the Singapura, the smallest breed of cat."
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
                "The chlorine in fresh tap water irritates sensitive parts of the cat's nose. Let tap water sit for 24 hours before giving it to a cat."
              ]
            },
            "catfact": "The chlorine in fresh tap water irritates sensitive parts of the cat's nose. Let tap water sit for 24 hours before giving it to a cat."
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
            ],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "Abraham Lincoln loved cats. He had four of them while he lived in the White House."
              ]
            },
            "catfact": "Abraham Lincoln loved cats. He had four of them while he lived in the White House."
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
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bulma@0.9.4/css/bulma.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "A group of cats is called a clowder."
              ]
            },
            "catfact": "A group of cats is called a clowder."
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
            "dependencies": [],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "Tylenol and chocolate are both poisonous to cats."
              ]
            },
            "catfact": "Tylenol and chocolate are both poisonous to cats."
          },
          {
            "dependencies": [],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "The chlorine in fresh tap water irritates sensitive parts of the cat's nose. Let tap water sit for 24 hours before giving it to a cat."
              ]
            },
            "catfact": "The chlorine in fresh tap water irritates sensitive parts of the cat's nose. Let tap water sit for 24 hours before giving it to a cat."
          },
          {
            "dependencies": [],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "There are cats who have survived falls from over 32 stories (320 meters) onto concrete."
              ]
            },
            "catfact": "There are cats who have survived falls from over 32 stories (320 meters) onto concrete."
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
            "catfact": "Adult cats only meow to communicate with humans."
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
                "Cats can jump up to six times their length."
              ]
            },
            "catfact": "Cats can jump up to six times their length."
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
            ],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "Studies now show that the allergen in cats is related to their scent glands. Cats have scent glands on their faces and at the base of their tails. Entire male cats generate the most scent. If this secretion from the scent glands is the allergen, allergic people should tolerate spayed female cats the best."
              ]
            },
            "catfact": "Studies now show that the allergen in cats is related to their scent glands. Cats have scent glands on their faces and at the base of their tails. Entire male cats generate the most scent. If this secretion from the scent glands is the allergen, allergic people should tolerate spayed female cats the best."
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
                'When cats grimace, they are usually "taste-scenting." They have an extra organ that, with some breathing control, allows the cats to taste-sense the air.'
              ]
            },
            "catfact": 'When cats grimace, they are usually "taste-scenting." They have an extra organ that, with some breathing control, allows the cats to taste-sense the air.'
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
                "Cats have an average of 24 whiskers, arranged in four horizontal rows on each side."
              ]
            },
            "catfact": "Cats have an average of 24 whiskers, arranged in four horizontal rows on each side."
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
                "Almost 10% of a cat's bones are in its tail, and the tail is used to maintain balance."
              ]
            },
            "catfact": "Almost 10% of a cat's bones are in its tail, and the tail is used to maintain balance."
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
                "In ancient Egypt, mummies were made of cats, and embalmed mice were placed with them in their tombs. In one ancient city, over 300,000 cat mummies were found."
              ]
            },
            "catfact": "In ancient Egypt, mummies were made of cats, and embalmed mice were placed with them in their tombs. In one ancient city, over 300,000 cat mummies were found."
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
                "The Maine Coon is 4 to 5 times larger than the Singapura, the smallest breed of cat."
              ]
            },
            "catfact": "The Maine Coon is 4 to 5 times larger than the Singapura, the smallest breed of cat."
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
                "The chlorine in fresh tap water irritates sensitive parts of the cat's nose. Let tap water sit for 24 hours before giving it to a cat."
              ]
            },
            "catfact": "The chlorine in fresh tap water irritates sensitive parts of the cat's nose. Let tap water sit for 24 hours before giving it to a cat."
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
            ],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "Abraham Lincoln loved cats. He had four of them while he lived in the White House."
              ]
            },
            "catfact": "Abraham Lincoln loved cats. He had four of them while he lived in the White House."
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
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bulma@0.9.4/css/bulma.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "A group of cats is called a clowder."
              ]
            },
            "catfact": "A group of cats is called a clowder."
          }
        ]
      },
      {
        "id": 10,
        "name": "html transform",
        "description": "",
        "code": '// this input was generated by the property editor\n// making changes manually may have unexpected results\ninput.html = `<h1 class="display-1">TRANSFORM!</h1>`',
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
            "dependencies": [],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "Tylenol and chocolate are both poisonous to cats."
              ]
            },
            "catfact": "Tylenol and chocolate are both poisonous to cats.",
            "html": "<h1>YERP!</h1>"
          },
          {
            "dependencies": [],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "The chlorine in fresh tap water irritates sensitive parts of the cat's nose. Let tap water sit for 24 hours before giving it to a cat."
              ]
            },
            "catfact": "The chlorine in fresh tap water irritates sensitive parts of the cat's nose. Let tap water sit for 24 hours before giving it to a cat.",
            "html": "<h1>YERP!</h1>"
          },
          {
            "dependencies": [],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "There are cats who have survived falls from over 32 stories (320 meters) onto concrete."
              ]
            },
            "catfact": "There are cats who have survived falls from over 32 stories (320 meters) onto concrete.",
            "html": "<h1>YERP!</h1>"
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
            "html": "<h1>YERP!</h1>"
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
                "Cats can jump up to six times their length."
              ]
            },
            "catfact": "Cats can jump up to six times their length.",
            "html": '<h1 class="display-1">YERP!</h1>'
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
            ],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "Studies now show that the allergen in cats is related to their scent glands. Cats have scent glands on their faces and at the base of their tails. Entire male cats generate the most scent. If this secretion from the scent glands is the allergen, allergic people should tolerate spayed female cats the best."
              ]
            },
            "catfact": "Studies now show that the allergen in cats is related to their scent glands. Cats have scent glands on their faces and at the base of their tails. Entire male cats generate the most scent. If this secretion from the scent glands is the allergen, allergic people should tolerate spayed female cats the best.",
            "html": '<h1 class="display-1">YERP!</h1>'
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
                'When cats grimace, they are usually "taste-scenting." They have an extra organ that, with some breathing control, allows the cats to taste-sense the air.'
              ]
            },
            "catfact": 'When cats grimace, they are usually "taste-scenting." They have an extra organ that, with some breathing control, allows the cats to taste-sense the air.',
            "html": '<h1 class="display-1">YERP!</h1>'
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
                "Cats have an average of 24 whiskers, arranged in four horizontal rows on each side."
              ]
            },
            "catfact": "Cats have an average of 24 whiskers, arranged in four horizontal rows on each side.",
            "html": '<h1 class="display-1">YERP!</h1>'
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
                "Almost 10% of a cat's bones are in its tail, and the tail is used to maintain balance."
              ]
            },
            "catfact": "Almost 10% of a cat's bones are in its tail, and the tail is used to maintain balance.",
            "html": '<h1 class="display-1">YAS!</h1>'
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
                "In ancient Egypt, mummies were made of cats, and embalmed mice were placed with them in their tombs. In one ancient city, over 300,000 cat mummies were found."
              ]
            },
            "catfact": "In ancient Egypt, mummies were made of cats, and embalmed mice were placed with them in their tombs. In one ancient city, over 300,000 cat mummies were found.",
            "html": '<h1 class="display-1">BACK TO THE CODE!</h1>'
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
                "The Maine Coon is 4 to 5 times larger than the Singapura, the smallest breed of cat."
              ]
            },
            "catfact": "The Maine Coon is 4 to 5 times larger than the Singapura, the smallest breed of cat.",
            "html": '<h1 class="display-1">TRANSFORM!</h1>'
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
                "The chlorine in fresh tap water irritates sensitive parts of the cat's nose. Let tap water sit for 24 hours before giving it to a cat."
              ]
            },
            "catfact": "The chlorine in fresh tap water irritates sensitive parts of the cat's nose. Let tap water sit for 24 hours before giving it to a cat.",
            "html": '<h1 class="display-1">TRANSFORM!</h1>'
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
            ],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "Abraham Lincoln loved cats. He had four of them while he lived in the White House."
              ]
            },
            "catfact": "Abraham Lincoln loved cats. He had four of them while he lived in the White House.",
            "html": '<h1 class="display-1">TRANSFORM!</h1>'
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
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bulma@0.9.4/css/bulma.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "A group of cats is called a clowder."
              ]
            },
            "catfact": "A group of cats is called a clowder.",
            "html": '<h1 class="display-1">TRANSFORM!</h1>'
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
            "dependencies": [],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "Tylenol and chocolate are both poisonous to cats."
              ]
            },
            "catfact": "Tylenol and chocolate are both poisonous to cats.",
            "html": "<h1>YERP!</h1>"
          },
          {
            "dependencies": [],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "The chlorine in fresh tap water irritates sensitive parts of the cat's nose. Let tap water sit for 24 hours before giving it to a cat."
              ]
            },
            "catfact": "The chlorine in fresh tap water irritates sensitive parts of the cat's nose. Let tap water sit for 24 hours before giving it to a cat.",
            "html": "<h1>YERP!</h1>"
          },
          {
            "dependencies": [],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "There are cats who have survived falls from over 32 stories (320 meters) onto concrete."
              ]
            },
            "catfact": "There are cats who have survived falls from over 32 stories (320 meters) onto concrete.",
            "html": "<h1>YERP!</h1>"
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
            "html": "<h1>YERP!</h1>"
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
                "Cats can jump up to six times their length."
              ]
            },
            "catfact": "Cats can jump up to six times their length.",
            "html": '<h1 class="display-1">YERP!</h1>'
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
            ],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "Studies now show that the allergen in cats is related to their scent glands. Cats have scent glands on their faces and at the base of their tails. Entire male cats generate the most scent. If this secretion from the scent glands is the allergen, allergic people should tolerate spayed female cats the best."
              ]
            },
            "catfact": "Studies now show that the allergen in cats is related to their scent glands. Cats have scent glands on their faces and at the base of their tails. Entire male cats generate the most scent. If this secretion from the scent glands is the allergen, allergic people should tolerate spayed female cats the best.",
            "html": '<h1 class="display-1">YERP!</h1>'
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
                'When cats grimace, they are usually "taste-scenting." They have an extra organ that, with some breathing control, allows the cats to taste-sense the air.'
              ]
            },
            "catfact": 'When cats grimace, they are usually "taste-scenting." They have an extra organ that, with some breathing control, allows the cats to taste-sense the air.',
            "html": '<h1 class="display-1">YERP!</h1>'
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
                "Cats have an average of 24 whiskers, arranged in four horizontal rows on each side."
              ]
            },
            "catfact": "Cats have an average of 24 whiskers, arranged in four horizontal rows on each side.",
            "html": '<h1 class="display-1">YERP!</h1>'
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
                "Almost 10% of a cat's bones are in its tail, and the tail is used to maintain balance."
              ]
            },
            "catfact": "Almost 10% of a cat's bones are in its tail, and the tail is used to maintain balance.",
            "html": '<h1 class="display-1">YAS!</h1>'
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
                "In ancient Egypt, mummies were made of cats, and embalmed mice were placed with them in their tombs. In one ancient city, over 300,000 cat mummies were found."
              ]
            },
            "catfact": "In ancient Egypt, mummies were made of cats, and embalmed mice were placed with them in their tombs. In one ancient city, over 300,000 cat mummies were found.",
            "html": '<h1 class="display-1">BACK TO THE CODE!</h1>'
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
                "The Maine Coon is 4 to 5 times larger than the Singapura, the smallest breed of cat."
              ]
            },
            "catfact": "The Maine Coon is 4 to 5 times larger than the Singapura, the smallest breed of cat.",
            "html": '<h1 class="display-1">TRANSFORM!</h1>'
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
                "The chlorine in fresh tap water irritates sensitive parts of the cat's nose. Let tap water sit for 24 hours before giving it to a cat."
              ]
            },
            "catfact": "The chlorine in fresh tap water irritates sensitive parts of the cat's nose. Let tap water sit for 24 hours before giving it to a cat.",
            "html": '<h1 class="display-1">TRANSFORM!</h1>'
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
            ],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "Abraham Lincoln loved cats. He had four of them while he lived in the White House."
              ]
            },
            "catfact": "Abraham Lincoln loved cats. He had four of them while he lived in the White House.",
            "html": '<h1 class="display-1">TRANSFORM!</h1>'
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
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bulma@0.9.4/css/bulma.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "A group of cats is called a clowder."
              ]
            },
            "catfact": "A group of cats is called a clowder.",
            "html": '<h1 class="display-1">TRANSFORM!</h1>'
          }
        ],
        "archived": false,
        "render": false,
        "transform": {
          "prop": "html"
        }
      },
      {
        "id": 6,
        "name": "html render",
        "description": "",
        "code": "",
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
            "dependencies": [],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "Tylenol and chocolate are both poisonous to cats."
              ]
            },
            "catfact": "Tylenol and chocolate are both poisonous to cats.",
            "html": "<h1>YERP!</h1>"
          },
          {
            "dependencies": [],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "The chlorine in fresh tap water irritates sensitive parts of the cat's nose. Let tap water sit for 24 hours before giving it to a cat."
              ]
            },
            "catfact": "The chlorine in fresh tap water irritates sensitive parts of the cat's nose. Let tap water sit for 24 hours before giving it to a cat."
          },
          {
            "dependencies": [],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "There are cats who have survived falls from over 32 stories (320 meters) onto concrete."
              ]
            },
            "catfact": "There are cats who have survived falls from over 32 stories (320 meters) onto concrete.",
            "html": "<h1>YERP!</h1>"
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
            "html": "<h1>YERP!</h1>"
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
                "Cats can jump up to six times their length."
              ]
            },
            "catfact": "Cats can jump up to six times their length.",
            "html": '<h1 class="display-1">YERP!</h1>'
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
            ],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "Studies now show that the allergen in cats is related to their scent glands. Cats have scent glands on their faces and at the base of their tails. Entire male cats generate the most scent. If this secretion from the scent glands is the allergen, allergic people should tolerate spayed female cats the best."
              ]
            },
            "catfact": "Studies now show that the allergen in cats is related to their scent glands. Cats have scent glands on their faces and at the base of their tails. Entire male cats generate the most scent. If this secretion from the scent glands is the allergen, allergic people should tolerate spayed female cats the best.",
            "html": '<h1 class="display-1">YERP!</h1>'
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
                'When cats grimace, they are usually "taste-scenting." They have an extra organ that, with some breathing control, allows the cats to taste-sense the air.'
              ]
            },
            "catfact": 'When cats grimace, they are usually "taste-scenting." They have an extra organ that, with some breathing control, allows the cats to taste-sense the air.',
            "html": '<h1 class="display-1">YERP!</h1>'
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
                "Cats have an average of 24 whiskers, arranged in four horizontal rows on each side."
              ]
            },
            "catfact": "Cats have an average of 24 whiskers, arranged in four horizontal rows on each side.",
            "html": '<h1 class="display-1">YERP!</h1>'
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
                "Almost 10% of a cat's bones are in its tail, and the tail is used to maintain balance."
              ]
            },
            "catfact": "Almost 10% of a cat's bones are in its tail, and the tail is used to maintain balance.",
            "html": '<h1 class="display-1">YAS!</h1>'
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
                "In ancient Egypt, mummies were made of cats, and embalmed mice were placed with them in their tombs. In one ancient city, over 300,000 cat mummies were found."
              ]
            },
            "catfact": "In ancient Egypt, mummies were made of cats, and embalmed mice were placed with them in their tombs. In one ancient city, over 300,000 cat mummies were found.",
            "html": '<h1 class="display-1">BACK TO THE CODE!</h1>'
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
                "The Maine Coon is 4 to 5 times larger than the Singapura, the smallest breed of cat."
              ]
            },
            "catfact": "The Maine Coon is 4 to 5 times larger than the Singapura, the smallest breed of cat.",
            "html": '<h1 class="display-1">TRANSFORM!</h1>'
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
                "The chlorine in fresh tap water irritates sensitive parts of the cat's nose. Let tap water sit for 24 hours before giving it to a cat."
              ]
            },
            "catfact": "The chlorine in fresh tap water irritates sensitive parts of the cat's nose. Let tap water sit for 24 hours before giving it to a cat.",
            "html": '<h1 class="display-1">TRANSFORM!</h1>'
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
            ],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "Abraham Lincoln loved cats. He had four of them while he lived in the White House."
              ]
            },
            "catfact": "Abraham Lincoln loved cats. He had four of them while he lived in the White House.",
            "html": '<h1 class="display-1">TRANSFORM!</h1>'
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
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bulma@0.9.4/css/bulma.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "A group of cats is called a clowder."
              ]
            },
            "catfact": "A group of cats is called a clowder.",
            "html": '<h1 class="display-1">TRANSFORM!</h1>'
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
            "dependencies": [],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "Tylenol and chocolate are both poisonous to cats."
              ]
            },
            "catfact": "Tylenol and chocolate are both poisonous to cats.",
            "html": "<h1>YERP!</h1>"
          },
          {
            "dependencies": [],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "The chlorine in fresh tap water irritates sensitive parts of the cat's nose. Let tap water sit for 24 hours before giving it to a cat."
              ]
            },
            "catfact": "The chlorine in fresh tap water irritates sensitive parts of the cat's nose. Let tap water sit for 24 hours before giving it to a cat."
          },
          {
            "dependencies": [],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "There are cats who have survived falls from over 32 stories (320 meters) onto concrete."
              ]
            },
            "catfact": "There are cats who have survived falls from over 32 stories (320 meters) onto concrete.",
            "html": "<h1>YERP!</h1>"
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
            "html": "<h1>YERP!</h1>"
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
                "Cats can jump up to six times their length."
              ]
            },
            "catfact": "Cats can jump up to six times their length.",
            "html": '<h1 class="display-1">YERP!</h1>'
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
            ],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "Studies now show that the allergen in cats is related to their scent glands. Cats have scent glands on their faces and at the base of their tails. Entire male cats generate the most scent. If this secretion from the scent glands is the allergen, allergic people should tolerate spayed female cats the best."
              ]
            },
            "catfact": "Studies now show that the allergen in cats is related to their scent glands. Cats have scent glands on their faces and at the base of their tails. Entire male cats generate the most scent. If this secretion from the scent glands is the allergen, allergic people should tolerate spayed female cats the best.",
            "html": '<h1 class="display-1">YERP!</h1>'
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
                'When cats grimace, they are usually "taste-scenting." They have an extra organ that, with some breathing control, allows the cats to taste-sense the air.'
              ]
            },
            "catfact": 'When cats grimace, they are usually "taste-scenting." They have an extra organ that, with some breathing control, allows the cats to taste-sense the air.',
            "html": '<h1 class="display-1">YERP!</h1>'
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
                "Cats have an average of 24 whiskers, arranged in four horizontal rows on each side."
              ]
            },
            "catfact": "Cats have an average of 24 whiskers, arranged in four horizontal rows on each side.",
            "html": '<h1 class="display-1">YERP!</h1>'
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
                "Almost 10% of a cat's bones are in its tail, and the tail is used to maintain balance."
              ]
            },
            "catfact": "Almost 10% of a cat's bones are in its tail, and the tail is used to maintain balance.",
            "html": '<h1 class="display-1">YAS!</h1>'
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
                "In ancient Egypt, mummies were made of cats, and embalmed mice were placed with them in their tombs. In one ancient city, over 300,000 cat mummies were found."
              ]
            },
            "catfact": "In ancient Egypt, mummies were made of cats, and embalmed mice were placed with them in their tombs. In one ancient city, over 300,000 cat mummies were found.",
            "html": '<h1 class="display-1">BACK TO THE CODE!</h1>'
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
                "The Maine Coon is 4 to 5 times larger than the Singapura, the smallest breed of cat."
              ]
            },
            "catfact": "The Maine Coon is 4 to 5 times larger than the Singapura, the smallest breed of cat.",
            "html": '<h1 class="display-1">TRANSFORM!</h1>'
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
                "The chlorine in fresh tap water irritates sensitive parts of the cat's nose. Let tap water sit for 24 hours before giving it to a cat."
              ]
            },
            "catfact": "The chlorine in fresh tap water irritates sensitive parts of the cat's nose. Let tap water sit for 24 hours before giving it to a cat.",
            "html": '<h1 class="display-1">TRANSFORM!</h1>'
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
            ],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "Abraham Lincoln loved cats. He had four of them while he lived in the White House."
              ]
            },
            "catfact": "Abraham Lincoln loved cats. He had four of them while he lived in the White House.",
            "html": '<h1 class="display-1">TRANSFORM!</h1>'
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
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bulma@0.9.4/css/bulma.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "A group of cats is called a clowder."
              ]
            },
            "catfact": "A group of cats is called a clowder.",
            "html": '<h1 class="display-1">TRANSFORM!</h1>'
          }
        ],
        "archived": false,
        "render": "html"
      },
      {
        "id": 1,
        "name": "upperFunk",
        "description": "",
        "code": "input.upperFunk = input.funk.toUpperCase()",
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
            "dependencies": [],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "Tylenol and chocolate are both poisonous to cats."
              ]
            },
            "catfact": "Tylenol and chocolate are both poisonous to cats.",
            "html": "<h1>YERP!</h1>",
            "upperFunk": "FUNKY"
          },
          {
            "dependencies": [],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "The chlorine in fresh tap water irritates sensitive parts of the cat's nose. Let tap water sit for 24 hours before giving it to a cat."
              ]
            },
            "catfact": "The chlorine in fresh tap water irritates sensitive parts of the cat's nose. Let tap water sit for 24 hours before giving it to a cat.",
            "html": "<h1>YERP!</h1>",
            "upperFunk": "FUNKY"
          },
          {
            "dependencies": [],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "There are cats who have survived falls from over 32 stories (320 meters) onto concrete."
              ]
            },
            "catfact": "There are cats who have survived falls from over 32 stories (320 meters) onto concrete.",
            "html": "<h1>YERP!</h1>",
            "upperFunk": "FUNKY"
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
            ],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "Cats can jump up to six times their length."
              ]
            },
            "catfact": "Cats can jump up to six times their length.",
            "html": '<h1 class="display-1">YERP!</h1>',
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
            ],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "Studies now show that the allergen in cats is related to their scent glands. Cats have scent glands on their faces and at the base of their tails. Entire male cats generate the most scent. If this secretion from the scent glands is the allergen, allergic people should tolerate spayed female cats the best."
              ]
            },
            "catfact": "Studies now show that the allergen in cats is related to their scent glands. Cats have scent glands on their faces and at the base of their tails. Entire male cats generate the most scent. If this secretion from the scent glands is the allergen, allergic people should tolerate spayed female cats the best.",
            "html": '<h1 class="display-1">YERP!</h1>',
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
            ],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                'When cats grimace, they are usually "taste-scenting." They have an extra organ that, with some breathing control, allows the cats to taste-sense the air.'
              ]
            },
            "catfact": 'When cats grimace, they are usually "taste-scenting." They have an extra organ that, with some breathing control, allows the cats to taste-sense the air.',
            "html": '<h1 class="display-1">YERP!</h1>',
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
            ],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "Cats have an average of 24 whiskers, arranged in four horizontal rows on each side."
              ]
            },
            "catfact": "Cats have an average of 24 whiskers, arranged in four horizontal rows on each side.",
            "html": '<h1 class="display-1">YERP!</h1>',
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
            ],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "Almost 10% of a cat's bones are in its tail, and the tail is used to maintain balance."
              ]
            },
            "catfact": "Almost 10% of a cat's bones are in its tail, and the tail is used to maintain balance.",
            "html": '<h1 class="display-1">YAS!</h1>',
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
            ],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "In ancient Egypt, mummies were made of cats, and embalmed mice were placed with them in their tombs. In one ancient city, over 300,000 cat mummies were found."
              ]
            },
            "catfact": "In ancient Egypt, mummies were made of cats, and embalmed mice were placed with them in their tombs. In one ancient city, over 300,000 cat mummies were found.",
            "html": '<h1 class="display-1">BACK TO THE CODE!</h1>',
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
            ],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "The Maine Coon is 4 to 5 times larger than the Singapura, the smallest breed of cat."
              ]
            },
            "catfact": "The Maine Coon is 4 to 5 times larger than the Singapura, the smallest breed of cat.",
            "html": '<h1 class="display-1">TRANSFORM!</h1>',
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
            ],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "The chlorine in fresh tap water irritates sensitive parts of the cat's nose. Let tap water sit for 24 hours before giving it to a cat."
              ]
            },
            "catfact": "The chlorine in fresh tap water irritates sensitive parts of the cat's nose. Let tap water sit for 24 hours before giving it to a cat.",
            "html": '<h1 class="display-1">TRANSFORM!</h1>',
            "upperFunk": "FUNKY"
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
            ],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "Abraham Lincoln loved cats. He had four of them while he lived in the White House."
              ]
            },
            "catfact": "Abraham Lincoln loved cats. He had four of them while he lived in the White House.",
            "html": '<h1 class="display-1">TRANSFORM!</h1>',
            "upperFunk": "FUNKY"
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
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bulma@0.9.4/css/bulma.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "A group of cats is called a clowder."
              ]
            },
            "catfact": "A group of cats is called a clowder.",
            "html": '<h1 class="display-1">TRANSFORM!</h1>',
            "upperFunk": "FUNKY"
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
            "dependencies": [],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "Tylenol and chocolate are both poisonous to cats."
              ]
            },
            "catfact": "Tylenol and chocolate are both poisonous to cats.",
            "html": "<h1>YERP!</h1>",
            "upperFunk": "FUNKY"
          },
          {
            "dependencies": [],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "The chlorine in fresh tap water irritates sensitive parts of the cat's nose. Let tap water sit for 24 hours before giving it to a cat."
              ]
            },
            "catfact": "The chlorine in fresh tap water irritates sensitive parts of the cat's nose. Let tap water sit for 24 hours before giving it to a cat.",
            "html": "<h1>YERP!</h1>",
            "upperFunk": "FUNKY"
          },
          {
            "dependencies": [],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "There are cats who have survived falls from over 32 stories (320 meters) onto concrete."
              ]
            },
            "catfact": "There are cats who have survived falls from over 32 stories (320 meters) onto concrete.",
            "html": "<h1>YERP!</h1>",
            "upperFunk": "FUNKY"
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
            ],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "Cats can jump up to six times their length."
              ]
            },
            "catfact": "Cats can jump up to six times their length.",
            "html": '<h1 class="display-1">YERP!</h1>',
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
            ],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "Studies now show that the allergen in cats is related to their scent glands. Cats have scent glands on their faces and at the base of their tails. Entire male cats generate the most scent. If this secretion from the scent glands is the allergen, allergic people should tolerate spayed female cats the best."
              ]
            },
            "catfact": "Studies now show that the allergen in cats is related to their scent glands. Cats have scent glands on their faces and at the base of their tails. Entire male cats generate the most scent. If this secretion from the scent glands is the allergen, allergic people should tolerate spayed female cats the best.",
            "html": '<h1 class="display-1">YERP!</h1>',
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
            ],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                'When cats grimace, they are usually "taste-scenting." They have an extra organ that, with some breathing control, allows the cats to taste-sense the air.'
              ]
            },
            "catfact": 'When cats grimace, they are usually "taste-scenting." They have an extra organ that, with some breathing control, allows the cats to taste-sense the air.',
            "html": '<h1 class="display-1">YERP!</h1>',
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
            ],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "Cats have an average of 24 whiskers, arranged in four horizontal rows on each side."
              ]
            },
            "catfact": "Cats have an average of 24 whiskers, arranged in four horizontal rows on each side.",
            "html": '<h1 class="display-1">YERP!</h1>',
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
            ],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "Almost 10% of a cat's bones are in its tail, and the tail is used to maintain balance."
              ]
            },
            "catfact": "Almost 10% of a cat's bones are in its tail, and the tail is used to maintain balance.",
            "html": '<h1 class="display-1">YAS!</h1>',
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
            ],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "In ancient Egypt, mummies were made of cats, and embalmed mice were placed with them in their tombs. In one ancient city, over 300,000 cat mummies were found."
              ]
            },
            "catfact": "In ancient Egypt, mummies were made of cats, and embalmed mice were placed with them in their tombs. In one ancient city, over 300,000 cat mummies were found.",
            "html": '<h1 class="display-1">BACK TO THE CODE!</h1>',
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
            ],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "The Maine Coon is 4 to 5 times larger than the Singapura, the smallest breed of cat."
              ]
            },
            "catfact": "The Maine Coon is 4 to 5 times larger than the Singapura, the smallest breed of cat.",
            "html": '<h1 class="display-1">TRANSFORM!</h1>',
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
            ],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "The chlorine in fresh tap water irritates sensitive parts of the cat's nose. Let tap water sit for 24 hours before giving it to a cat."
              ]
            },
            "catfact": "The chlorine in fresh tap water irritates sensitive parts of the cat's nose. Let tap water sit for 24 hours before giving it to a cat.",
            "html": '<h1 class="display-1">TRANSFORM!</h1>',
            "upperFunk": "FUNKY"
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
            ],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "Abraham Lincoln loved cats. He had four of them while he lived in the White House."
              ]
            },
            "catfact": "Abraham Lincoln loved cats. He had four of them while he lived in the White House.",
            "html": '<h1 class="display-1">TRANSFORM!</h1>',
            "upperFunk": "FUNKY"
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
              },
              {
                "path": "https://cdn.jsdelivr.net/npm/bulma@0.9.4/css/bulma.min.css",
                "export": "",
                "alias": "",
                "deptype": "css"
              }
            ],
            "some": "random",
            "funk": "funky",
            "catfactresponse": {
              "data": [
                "A group of cats is called a clowder."
              ]
            },
            "catfact": "A group of cats is called a clowder.",
            "html": '<h1 class="display-1">TRANSFORM!</h1>',
            "upperFunk": "FUNKY"
          }
        ]
      }
    ];
    return pipeProcessor(funcSequence, { always: () => {
    } });
  }
  return __toCommonJS(stdin_exports);
})();
