import {saveFunctionOutput, saveFunctionInput} from "../utils.ts";
import './pdglobal.deno.worker.ts'

self.pipedeps = {}
self.output = {
    error: {}
}
const error = {}
self.onmessage = async (event) => {
    const data = JSON.parse(event.data);

    try {
        const pipe = await import(data.scriptName + `?t=${Date.now()}`)
        self.output = await pipe.pipe({
            always: async (state, _input) => {
                try {
                    await saveFunctionOutput(state.func.id, state.output)
                    await saveFunctionInput(state.func.id, state.input)
                } catch (e) {
                    // don't let it kill the server; just log the error
                    console.error('always', e.message);
                    error['always'] = e.message;
                }
            }
        }).process(data.inputs);
    } catch (e) {
        error[data.scriptName] = e.message
        console.error('pipe catch', e.message);
    }

    try {
        self.output.error = combineErrors();
        self.postMessage(JSON.stringify(self.output));
    } catch (e) {
        // don't let it kill the server
        console.error('postMessage catch', e.message);
        error['postMessage'] = e.message
        self.output.error = combineErrors();
        self.postMessage(JSON.stringify(self.output));
        if (self.output.hasOwnProperty('then')) {
            console.warn('output is a promise; please check your code for async error')
        }
    }

    setTimeout(() => {
        self.close();
    }, 1000)
};

function combineErrors() {
    return Object.assign({}, self.output?.error || {}, error);
}