import utils from "../utils.ts";
import { executeScript } from "./executeScript.deno.inject.ts";

const PD = {};

self.PD = new Proxy(PD, {
  get(target, prop, _receiver) {
    if (prop in target) {
      return (pipeopts) =>
        Promise.resolve(target[prop](Object.assign({
          always: (_state, _input) => {
          },
        }, pipeopts)));
    } else {
      const DEFAULT_OPTS = {};
      return async (pipeopts = {}) => {
        const inputs = Object.fromEntries(
          Object.entries(pipeopts).filter(([key, _value]) =>
            !Object.keys(DEFAULT_OPTS).includes(key)
          ),
        );
        if (prop === "temp") {
          return executeScript(
            { name: utils.pipeScriptName({ id: "temp" }) },
            inputs,
          );
        }
        const pipe = await utils.onePipeWithName(prop);
        return await executeScript(
          { name: utils.pipeScriptName(pipe) },
          inputs,
        );
      };
    }
  },
});
