import registerWebComponents from "../alpine-router/plugins/component.js";
import router from "../alpine-router/plugins/router.js";
import intersect from '@alpinejs/intersect'
import persist from '@alpinejs/persist'
import Alpine from 'alpinejs';
import pipeline from "../pipeline.js";
import {setupApi, API} from "../fe/api.js";
import {pipeProcessor} from "../pipeProcessor.js";
import '@alenaksu/json-viewer';
import Sortable from "sortablejs";
import {EditorView, basicSetup, javascript} from "./cmirror.bundle.js"

window.Sortable = Sortable;
window.Pipeline = pipeline;
window.chopQuotes = (codeValue) => {
    let chopStart = 0
    let chopEnd = codeValue.length
    if (codeValue.startsWith(`"`) || codeValue.startsWith("'") || codeValue.startsWith('`'))
        chopStart++
    if (codeValue.endsWith('"') || codeValue.endsWith("'") || codeValue.endsWith('`'))
        chopEnd--
    return codeValue.substring(chopStart, chopEnd)
}

window.CodeMirror = ({el, code, onChange}) => {
    const minHeightEditor = EditorView.theme({
        ".cm-content, .cm-gutter": {minHeight: "200px", whiteSpace: "pre-wrap"},
    })

    const extensions = [basicSetup, minHeightEditor]

    if (onChange)
        extensions.push(EditorView.updateListener.of((v) => {
            if (v.docChanged) {
                onChange(v.state.doc.toString())
            }
        }))

    return new EditorView({
        extensions,
        parent: el,
        doc: code,
        lineWrapping: true,
    })
}

Alpine.baseUrl = '/';
Alpine.plugin(intersect)
Alpine.plugin(persist)
Alpine.plugin(router);
Alpine.plugin(registerWebComponents);
Alpine.plugin(setupApi);

Alpine.store('toaster', [])
Alpine.data('pipeActions', () => ({
    get current() {
        return this.$store.pipes.current
    },
    pipes() {
        return this.$store.pipes.allPipes.filter(pipe => !pipe.archived) || []
    },
    load(pipe) {
        this.$store.pipes.load(pipe)
    },
    newPipe() {
        this.$store.pipes.newPipe()
    },
    savePipe(pipe) {
        this.$store.pipes.save(pipe || this.current)
    },
    deletePipe(pipe) {
        this.$store.pipes.deletePipe(pipe || this.current)
    },
    pipeForm(please) {
        if (please === 'close') {
            this.$refs.pipeform.close()
        }
        if (please === 'open') {
            this.$refs.pipeform.showModal()
        }
    }
}))
Alpine.magic('tojson', (el, {}) => (expression, opts) => {
    // example usage: <div x-text="$json({foo: 'bar'})"></div>
    try {
        if (opts && opts.pretty) {
            return JSON.stringify(expression, null, 2);
        }
        return JSON.stringify(expression);
    } catch (e) {
        console.error(e);
        return expression;
    }
})

Alpine.magic('fromjson', (el, {}) => (expression) => {
    // example usage: <div x-text="$json({foo: 'bar'})"></div>
    try {
        return JSON.parse(expression);
    } catch (e) {
        console.error(e);
        return expression;
    }
})

const DEFAULT_FUNCTION = {
    id: 0,
    name: 'New Function',
    description: '',
    code: '',
    inputs: [],
    outputs: [],
    archived: false,
    render: false,
    transform: {
        prop: '',
    },
    dependency: false,
    execOnServer: false,
}

const DEFAULT_PIPE = {
    id: 0,
    name: 'New Pipe',
    description: '',
    functions: [],
    archived: false,
    inputs: [],
    outputs: [],
}

Alpine.store('pipes', {
    current: null,
    allPipes: [],
    init() {
        this.fetch();
    },
    load(pipe) {
        this.current = pipe;
    },
    async save(pipe) {
        const pipePayload = JSON.stringify(pipe)
        if (this.allPipes.length === 0 || !this.allPipes.find(p => p.id === pipe.id)) {
            this.allPipes.push(pipe);
        }
        await Alpine.store('api').savePipe(pipe)
    },
    getFunctions(pipe) {
        pipe = pipe || this.current;
        return Alpine.store('functions').allFunctions
            .filter(f => pipe.functions.includes(f.id))
            // sort based on id order in pipe.functions
            .sort((a, b) => {
                return pipe.functions.indexOf(a.id) - pipe.functions.indexOf(b.id)
            })
    },
    addFunctionToCurrentPipe(id, config = {after: 0, start: false}) {
        this.current.functions = this.current.functions || [];
        if (id || id === 0) {
            if (config.after || config.after === 0) {
                this.current.functions.splice(config.after + 1, 0, id);
            } else {
                this.current.functions.push(id);
            }
        } else if (config.start) {
            this.current.functions.unshift(id);
        }
        this.current.functions = this.current.functions.toSorted(dependenciesFirst)
        this.save(this.current)
    },
    removeFunctionFromCurrentPipe(id) {
        this.current.functions = this.current.functions.filter(fid => fid !== id);
        this.save(this.current)
    },
    async process(pipe, input = {}) {
        if (pipe.execOnServer) {
            return await this.processOnServer(pipe, input)
        }
        return await this.processOnClient(pipe, input)
    },
    async processOnServer(pipe, input = {}) {
        return Alpine.store('api').process(pipe.id, input)
    },
    async processOnClient(pipe, input = {}) {
        const inputClone = Object.assign({}, input)
        const pipeClone = Object.assign({}, pipe || this.current)
        // since we're executing this within the pipedown client app context
        // we should skip css dependencies to avoid screwing the apps layout/presentation
        const skipCss = Object.assign({}, DEFAULT_FUNCTION, {code: `input.nocss = true;`, skip: true})
        const funcSequence = [skipCss].concat(this.getFunctions(pipeClone))
        return pipeProcessor(funcSequence, {
            always: (state, args) => {
                const func = state.func;
                if (func.skip) return;
                state.input && func.inputs.push(state.input)
                state.output && func.outputs.push(state.output)
                Alpine.store('functions').save(func)
            }
        })
            .process(inputClone)
            .then(output => {
                pipeClone.inputs.push(input);
                pipeClone.outputs.push(output);
                this.save(pipeClone);
                return output;
            })
    },
    newPipe(config = {}) {
        this.current = Object.assign({}, DEFAULT_PIPE, config);
        const maxId = this.allPipes.reduce((acc, p) => {
            return Math.max(acc, p.id)
        }, 0);
        this.current.id = maxId + 1;
        const newFunction = Alpine.store('functions').newFunction()
        this.addFunctionToCurrentPipe(newFunction.id)
        this.save(this.current);
    },
    deletePipe(pipe) {
        this.allPipes = this.allPipes.filter(p => p !== pipe);
        pipe.archived = true;
        this.save(pipe);
    },
    async fetch() {
        await Alpine.store('api').pipes()
            .then(res => {
                this.allPipes = res;
            })
    },
    reorderFunctions(newFunctionOrder) {
        this.current.functions = newFunctionOrder
            .map(Number)
            .filter(id => this.current.functions.includes(id))
            .toSorted(dependenciesFirst);
        this.save(this.current);
    },
})

function dependenciesFirst(a, b) {
    const aFunc = Alpine.store('functions').getFunction(a)
    const bFunc = Alpine.store('functions').getFunction(b)
    if (aFunc.dependency && !bFunc.dependency) return -1;
    if (!aFunc.dependency && bFunc.dependency) return 1;
    return 0;
}

function immutableMove(arr, from, to) {
    return arr.reduce((prev, current, idx, self) => {
        if (from === to) {
            prev.push(current);
        }
        if (idx === from) {
            return prev;
        }
        if (from < to) {
            prev.push(current);
        }
        if (idx === to) {
            prev.push(self[from]);
        }
        if (from > to) {
            prev.push(current);
        }
        return prev;
    }, []);
}

Alpine.store('functions', {
    loaded: false,
    init() {
        this.fetch();
    },
    allFunctions: [],
    newFunction(config = {}) {
        const newFunction = Object.assign({}, DEFAULT_FUNCTION, config);
        const maxId = this.allFunctions.reduce((acc, p) => {
            return Math.max(acc, p.id)
        }, 0);
        newFunction.id = maxId + 1;
        this.allFunctions.push(newFunction);
        this.save(newFunction)
        return newFunction;
    },
    newRenderFunction(config = {}) {
        Object.assign(config, {
            render: true
        })
        const newFunction = this.newFunction(config);
        return newFunction;
    },
    newTransformFunction(config = {}) {
        Object.assign(config, {
            transform: {prop: 'html'}
        })
        const newFunction = this.newFunction(config);
        return newFunction;
    },
    newDependencyFunction(dependencyConfig = {path: '', export: '', alias: '', deptype: 'javascript'}, config = {}) {
        config.code = `input.dependencies = input.dependencies || [];
input.dependencies.push(${JSON.stringify(dependencyConfig)})`
        config.name = `Dependency: ${dependencyConfig.deptype} ${dependencyConfig.alias || dependencyConfig.export || new URL(dependencyConfig.path).pathname || ''}`
        if (!config.code) throw new Error('Dependency functions must have code');
        const newFunction = this.newFunction(config);
        newFunction.dependency = true;
        return newFunction;
    },
    getFunction(id) {
        return this.allFunctions.find(f => f.id === id);
    },
    fetch() {
        Alpine.store('api').functions()
            .then(res => {
                this.allFunctions = res;
            })
            .then(() => {
                if (this.allFunctions.length > 0) this.loaded = true;
            })
    },
    save(func) {
        if (!func.id) throw new Error('Function must have an id');
        const index = this.allFunctions.findIndex(f => f.id === func.id);
        this.allFunctions[index] = func;
        const funcPayload = JSON.stringify(func)
        // post pipePayload to /api/functions
        Alpine.store('api').saveFunction(func)
    },
    delete(func) {
        this.allFunctions = this.allFunctions.filter(f => f !== func);
        func.archived = true;
        this.save(func);
    },
    processFunction(func, input = {}) {
        const funcSequence = [func]
        return pipeProcessor(funcSequence).process(input)
    },
    processServerFunction(func, input = {}) {
        return Alpine.store('api').processFunction(func.id, input)
    }
})

window.Alpine = Alpine;
Alpine.start();

const PD = {}
window.PD = new Proxy(PD, {
    get(target, prop, receiver) {
        debugger;
        if (prop in target) {
            return target[prop];
        } else {
            return (opts = {browser: false, server: false, worker: false, text: false, url: false}) => {
                API.processScript({name: prop}).then(res => {
                    const domScript = document.createElement('script')
                    domScript.addEventListener('load', () => {
                        console.log(`${prop} loaded`)
                        PD['pipe5'] = window.pipe5
                    })
                    domScript.innerHTML = res.script;
                    document.body.appendChild(domScript);
                })
            }
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
            //     throw new Error(`Pipe "${prop}" doesn't exist.`);
            // }
        }
    }
});
