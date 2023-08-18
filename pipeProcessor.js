import Pipeline from "./pipeline.js";

export function pipeProcessor(funcSequence, callbacks = {
    always: () => {
    },
}) {
    const codeToFunctions = funcSequence
        // .filter(func => func.code)
        .map((func) => wrapCode(func, callbacks))
    return new Pipeline(codeToFunctions);
}

function wrapCode(func, callbacks) {
    const AsyncFunction = Object.getPrototypeOf(async function () {
    }).constructor;
    return async function (input) {
        const state = {name: func.name, func}
        state.start = Date.now()
        state.input = input

        try {
            await resolveDependencies(input)
            await new AsyncFunction('input', func.code).call(this, input)
        } catch (e) {
            console.error(e)
            console.log(JSON.stringify(e))
        } finally {
            state.end = Date.now()
            state.duration = state.end - state.start;
            state.output = input
            callbacks && callbacks.always && callbacks.always(state, input)
        }
        return input
    }
}

async function resolveDependencies(input) {
    const checks = [input !== undefined, 'dependencies' in input]
    if (checks.every(Boolean)) {
        // input.dependencies.forEach(dependency => {
        //     const [path, exportName] = dependency.split('#');
        //     const func = Alpine.store('functions').allFunctions.find(f => f.path === path);
        //     if(func){
        //         func.export = exportName;
        //         func.alias = exportName;
        //     }
        // })

        return await Promise.all(input.dependencies
            .map(async dependencyConfig => {
                if(dependencyConfig.deptype === 'css'){
                    if(input.nocss) return dependencyConfig;
                    addLinkToHeadIfMissing(addCssLink(dependencyConfig))
                    return dependencyConfig;
                }

                if(dependencyConfig.deptype === 'js'){
                    addScriptToHeadIfMissing(makeScript(dependencyConfig))
                    return dependencyConfig;
                }

                if (dependencyConfig.export in window) {
                } else {
                    const module = await import(/* @vite-ignore */ dependencyConfig.path)
                    if (dependencyConfig.export in window) {
                    } else {
                        window.pipedeps = window.pipedeps || {}
                        window.pipedeps[dependencyConfig.export] = module[dependencyConfig.export]
                    }
                }
                return dependencyConfig
            }))
    }
}

function addCssLink(dep){
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = dep.path
    return link
}

function addLinkToHeadIfMissing(link){
    let found = false
    document.querySelectorAll('link').forEach(headLink => {
        found = headLink.href === link.href
    })
    !found && document.head.appendChild(link)
}

function makeScript(dep){
    const script = document.createElement('script')
    script.src = dep.src
    return script
}

function addScriptToHeadIfMissing(script){
    let found = false
    document.querySelectorAll('script').forEach(headScript => {
        found = headScript.src === script.path
    })
    !found && document.head.appendChild(script)
}
