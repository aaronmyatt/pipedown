import {API} from "../fe/api.js";

const PD = {}
window.pipedeps = window.pipedeps || {}

function addScriptToWindow(res) {
    const domScript = document.createElement('script')
    domScript.id = 'pipe' + res.id
    domScript.innerHTML = res.script;

    // assuming the browser blocks the thread while this is
    // evaluated we're safe to rely on this being globally
    // available after this line
    if (!document.getElementById(domScript.id))
        document.body.appendChild(domScript);
    return res
}

function callPipe(pipe, inputs = {}) {
    return pipe(Object.assign({
        always: async (state, _input) => {
            await API.saveFuncInput(state.func, state.input)
            await API.saveFuncOutput(state.func, state.output)
        }
    }, inputs))
}

function logPipe(pipe, inputs = {}) {
    return pipe(Object.assign({
            always: (state, input) => {
                // console.info(state.func, state.input, state.output)
            }
        }, inputs)
    )
}

const DEFAULT_OPTS = {browser: false, server: false, worker: false, text: false, url: false, json: false, temp: false}
window.PD = new Proxy(PD, {
    set(target, prop, newValue, _receiver) {
        target[prop] = newValue;
        console.log(target);
        return target[prop]
    },
    get(target, prop, _receiver) {
        return (pipeopts = DEFAULT_OPTS) => {
            const inputs = Object.fromEntries(Object.entries(pipeopts).filter(([key, value]) => !Object.keys(DEFAULT_OPTS).includes(key)));
            if (pipeopts.server) {
                if (prop === 'temp') return API.processTemp({funcs: inputs.funcs})
                return API.process({name: prop, inputs})
            }
            if (pipeopts.json) {
                return Promise.any([API.pipe(prop), API.pipeByName(prop)])
            }
            if (prop in target) {
                try {
                    return logPipe(target[prop], pipeopts).process(inputs);
                } catch(e) {
                    console.error(e)
                    return target[prop];
                }
            }
            // default to assuming browser
            return API.processScript({name: prop})
                .then(addScriptToWindow)
                .then(res => {
                    const scriptHandle = 'pipe' + res.id
                    const pipe = window[scriptHandle].pipe
                    target[scriptHandle] = pipe
                    target[prop] = pipe
                    window[prop] = pipe
                    return callPipe(pipe, pipeopts).process(inputs);
                })
                .catch(e => {
                    console.error(e)
                })

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
    }
});
