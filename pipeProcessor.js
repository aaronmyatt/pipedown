import Pipeline from "./pipeline.js";
export function pipeProcessor(funcSequence, callbacks = {
    always: () => {
    },
}, globals = {}) {
    const codeToFunctions = funcSequence
        // .filter(func => func.code)
        .map((func) => wrapCode.call(this, func, callbacks, globals))
    const pipe = new Pipeline(codeToFunctions);
    return pipe;
}

function wrapCode(func, callbacks, globals) {
    const AsyncFunction = Object.getPrototypeOf(async function () {
    }).constructor;
    return async function (input = {}) {
        input = input || {}
        if(input.error) return input;
        const state = {name: func.name, func}
        state.start = Date.now()
        state.input = Object.assign({}, input)

        try {
            await resolveDependencies(input)
            await new AsyncFunction('input', 'globals', func.code).call(this, input, globals)
        } catch (e) {
            console.error(e)
            console.log(JSON.stringify(e))
            input.error = {
                funcid: func.id,
                name: func.name,
                message: e.message,
                stack: e.stack,
            }
        } finally {
            state.end = Date.now()
            state.duration = state.end - state.start;
            state.output = Object.assign({}, input)
            callbacks && callbacks.always && callbacks.always(state, input)
        }
        return input
    }
}

async function resolveDependencies(input) {
    if (!input || !input.dependencies || input.dependencies.length === 0) return input;

    return await Promise.all(input.dependencies
        .map(async dependencyConfig => {
            if (dependencyConfig.deptype === 'css') {
                addLinkToHeadIfMissing(addCssLink(dependencyConfig))
                return dependencyConfig;
            }

            if (dependencyConfig.deptype === 'javascript') {
                addScriptToHeadIfMissing(makeScript(dependencyConfig))
                return dependencyConfig;
            }
            await import(/* @vite-ignore */ dependencyConfig.path).then(module => {
                pipedeps[dependencyConfig.export] = module[dependencyConfig.export] ? module[dependencyConfig.export] : module.default
            })
            return dependencyConfig
        }))
}

function addCssLink(dep) {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = dep.path
    return link
}

function addLinkToHeadIfMissing(link) {
    let found = false
    document.querySelectorAll('link').forEach(headLink => {
        if(found) return;
        found = headLink.href === link.href
    })
    !found && document.head.appendChild(link)
}

function makeScript(dep) {
    const script = document.createElement('script')
    script.src = dep.src
    return script
}

function addScriptToHeadIfMissing(script) {
    let found = false
    document.querySelectorAll('script').forEach(headScript => {
        found = headScript.src === script.path
    })
    !found && document.head.appendChild(script)
}
