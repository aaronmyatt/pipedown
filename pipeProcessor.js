import Pipeline from "./pipeline.js";

export function pipeProcessor(funcSequence, callbacks = {
    always: () => {
    },
}) {
    const pdglobalDependency = {
        path: '/scripts/pdglobal.js',
        export: 'PD',
        alias: '',
        deptype: 'javascript',
        dependency: true
    }
    const codeToFunctions = funcSequence
        // .filter(func => func.code)
        .map((func) => wrapCode(func, callbacks))
    return new Pipeline(codeToFunctions);
}

function wrapCode(func, callbacks) {
    const AsyncFunction = Object.getPrototypeOf(async function () {
    }).constructor;
    return async function (input = {}) {
        input = input || {}
        const state = {name: func.name, func}
        state.start = Date.now()
        state.input = Object.assign({}, input)

        try {
            await resolveDependencies(input)
            await new AsyncFunction('input', func.code).call(this, input)
        } catch (e) {
            console.error(e)
            console.log(JSON.stringify(e))
        } finally {
            state.end = Date.now()
            state.duration = state.end - state.start;
            state.output = Object.assign({}, input)
            callbacks && callbacks.always && callbacks.always(state, input)
        }
        return input
    }
}

function resolveDependencies(input) {
    if (!input || !input.dependencies || input.dependencies.length === 0) return input;

    return input.dependencies
        .map(async dependencyConfig => {
            if (dependencyConfig.deptype === 'css') {
                addLinkToHeadIfMissing(addCssLink(dependencyConfig))
                return dependencyConfig;
            }

            if (dependencyConfig.deptype === 'javascript') {
                addScriptToHeadIfMissing(makeScript(dependencyConfig))
                return dependencyConfig;
            }

            if (dependencyConfig.export in window) {
            } else {
                import(/* @vite-ignore */ dependencyConfig.path).then(module => {
                    if (dependencyConfig.export in window) {
                    } else {
                        window.pipedeps = window.pipedeps || {}
                        window.pipedeps[dependencyConfig.export] = module[dependencyConfig.export]
                    }
                })
            }
            return dependencyConfig
        })
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
