import {saveFunctionOutput, saveFunctionInput} from "../utils.ts";
import './pdglobal.deno.worker.ts'

self.pipedeps = {}
self.output = {}
const errors = {}
self.onmessage = async (event) => {
    const data = JSON.parse(event.data);

    try {
        const pipe = await import(data.scriptName + `?t=${Date.now()}`)
        console.log('pipe', pipe.pipe)
        self.output = await pipe.pipe({
            always: async (state, _input) => {
                try {
                    await saveFunctionOutput(state.func.id, state.output)
                    await saveFunctionInput(state.func.id, state.input)
                } catch (e) {
                    // don't let it kill the server; just log the error
                    console.error('always', e.message);
                    errors['always'] = e.message;
                }
            }
        }).process(data.inputs);
    } catch (e) {
        errors[data.scriptName] = e.message
        console.error('pipe catch', e.message);
    }

    try {
        self.output.errors = errors;
        self.postMessage(JSON.stringify(self.output));
    } catch (e) {
        // don't let it kill the server
        console.error('postMessage catch', e.message);
        errors['postMessage'] = e.message
        self.output.errors = errors
        self.postMessage(JSON.stringify(self.output));
        if (self.output.hasOwnProperty('then')) {
            console.warn('output is a promise; please check your code for async errors')
        }
    }
    self.close();
};
