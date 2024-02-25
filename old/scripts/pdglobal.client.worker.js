import { API } from "../fe/api.js";
import { gotdeno, gotwindow, maybeworker } from "../utils.ts";

const PD = {
  api: () => API,
};

function addScriptToWindow(res) {
  const domScript = document.createElement("script");
  domScript.id = "pipe" + res.id;
  domScript.innerHTML = res.script;

  // assuming the browser blocks the thread while this is
  // evaluated we're safe to rely on this being globally
  // available after this line
  if (!document.getElementById(domScript.id)) {
    document.body.appendChild(domScript);
  }
  return res;
}

function callPipe(pipe, inputs = {}) {
  return pipe(Object.assign({
    always: (state, input) => {
      API.saveFuncInput(state.func, state.input);
      API.saveFuncOutput(state.func, state.output);
    },
  }, inputs));
}

window.PD = new Proxy(PD, {
  get(target, prop, receiver) {
    if (prop in target) {
      return (pipeopts) =>
        Promise.resolve(target[prop](Object.assign({
          always: (state, input) => {
            console.log(state);
            console.log(input);
          },
        }, pipeopts)));
    } else {
      const DEFAULT_OPTS = {
        browser: false,
        server: false,
        worker: false,
        text: false,
        url: false,
        json: false,
        temp: false,
      };
      return (pipeopts = DEFAULT_OPTS) => {
        const inputs = Object.fromEntries(
          Object.entries(pipeopts).filter(([key, value]) =>
            !Object.keys(DEFAULT_OPTS).includes(key)
          ),
        );
        if (pipeopts.server) {
          // if(gotdeno) return Promise.any([executeScript({name: prop, inputs}), executeScript({id: prop, inputs})])
          return Promise.any([
            API.process({ id: prop, inputs }),
            API.process({ name: prop, inputs }),
          ]);
        }
        if (pipeopts.temp) {
          if (!inputs.funcs || inputs.funcs.length === 0) {
            throw new Error("Temporary script requires a list of function ids");
          }
          return API.processScript({ funcs: inputs.funcs })
            .then((res) => {
              const el = document.getElementById("pipe" + res.id);
              if (el) {
                el.remove();
              }
              return res;
            })
            .then(addScriptToWindow)
            .then((res) => {
              const scriptHandle = "pipe" + res.id;
              return callPipe(window[scriptHandle].pipe, inputs);
            });
        }
        if (pipeopts.json) {
          return API.pipe(prop);
        }
        // default to assuming browser
        return API.processScript({ name: prop })
          .then(addScriptToWindow)
          .then((res) => {
            const scriptHandle = "pipe" + res.id;
            const pipe = window[scriptHandle].pipe;
            target[scriptHandle] = pipe;
            target[prop] = pipe;
            window[prop] = pipe;
            return pipe;
          })
          .then((pipe) => callPipe(pipe, inputs))
          .catch((e) => {
            console.error(e);
          });
      };

      // if (!potentialPipe) {
      //     Alpine.store('toaster').push({
      //         message: `Pipe "${prop}" doesn't exist.`,
      //         type: 'error',
      //         actions: [
      //             {
      //                 label: 'Create Pipe',
      //                 callback: () => {
      //                     Alpine.store('pipes').newPipe({name: prop});
      //                 }
      //             }]
      //     })

      // }
    }
  },
});
