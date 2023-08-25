
const API_BASE = 'http://localhost:8000/api/'
export const API = {
    functions(){
        return callApi('functions', 'GET')
    },
    pipes(){
        return callApi('pipes', 'GET')
    },
    pipe(pipeid){
        return callApi('pipe/'+pipeid, 'GET')
    },
    saveFunction(func){
        return callApi('functions', 'POST', JSON.stringify(func))
    },
    saveFuncInput(func, input){
        return navigator.sendBeacon(API_BASE + 'function/' + func.id + '/input', JSON.stringify({input}))
    },
    saveFuncOutput(func, output){
        return navigator.sendBeacon(API_BASE + 'function/' + func.id + '/output', JSON.stringify({output}))
    },
    savePipe(pipe){
        return callApi('pipes', 'POST', JSON.stringify(pipe))
    },
    process(pipeid, input = {}){
        return callApi(`process/${pipeid}`, 'POST', JSON.stringify(input))
    },
    processScript({name, id, funcs = []}){
        if(id) return callApi(`script/${pipeid}`, 'GET')
        if(name) return callApi(`scriptbyname/${name}`, 'GET')
        if(funcs.length > 0) return callApi(`temporaryscript`, 'POST', JSON.stringify({ funcs }))
    },
}

export function setupApi(Alpine){
    Alpine.store('api', API)
}

function callApi(path, method, body){
    return fetch(API_BASE+path, {
        method: method,
        headers: {
            'Content-Type': 'application/json'
        },
        body: body
    })
    .then(res => res.json())
}
