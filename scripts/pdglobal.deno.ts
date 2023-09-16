import utils from "../utils.ts";
import {generateServerScript} from '../scriptGenerator.ts'
import {executeScript} from './executeScript.deno.inject.ts'

const PD = {}

window.PD = new Proxy(PD, {
    get(target, prop, receiver) {
        if (prop in target) {
            return (pipeopts) => Promise.resolve(target[prop](Object.assign({
                always: (state, input) => {
                    console.log(state)
                    console.log(input)
                }
            }, pipeopts)))
        } else {
            const DEFAULT_OPTS = {}
            return async (pipeopts = {}) => {
                const pipe = await utils.onePipeWithName(prop) || await utils.onePipe(prop) || {id: 'temp'};
                const name = utils.pipeScriptName(pipe);
                const inputs = Object.fromEntries(Object.entries(pipeopts || {}).filter(([key, value]) => !Object.keys(DEFAULT_OPTS).includes(key)));
                await generateServerScript(pipe || inputs)
                return await executeScript({ name, id: '' }, inputs)
            }
        }
    }
});
