
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
    pipeByName(pipename){
        return callApi('pipebyname/'+pipename, 'GET')
    },
    saveFunction(func){
        return callApi('functions', 'POST', JSON.stringify(func))
    },
    saveFuncInput(func, input){
        const path = 'function/' + func.id + '/input';
        if(navigator.sendBeacon){
            return navigator.sendBeacon(API_BASE+path, JSON.stringify({input}))
        } else {
            return callApi(path, 'POST', JSON.stringify({input}))
        }
    },
    saveFuncOutput(func, output){
        const path = 'function/' + func.id + '/output'
        if(navigator.sendBeacon){
            return navigator.sendBeacon(API_BASE+path, JSON.stringify({output}))
        } else {
            return callApi(path, 'POST', JSON.stringify({output}))
        }
    },
    savePipeInput(func, input){
        const path = 'pipe/' + func.id + '/input';
        if(navigator.sendBeacon){
            return navigator.sendBeacon(API_BASE+path, JSON.stringify({input}))
        } else {
            return callApi(path, 'POST', JSON.stringify({input}))
        }
    },
    savePipeOutput(func, output){
        const path = 'pipe/' + func.id + '/output'
        if(navigator.sendBeacon){
            return navigator.sendBeacon(API_BASE+path, JSON.stringify({output}))
        } else {
            return callApi(path, 'POST', JSON.stringify({output}))
        }
    },
    savePipe(pipe){
        return callApi('pipe', 'POST', JSON.stringify(pipe))
    },
    process({name, id, inputs = {}}){
        if(id) return callApi(`process/${id}`, 'POST', JSON.stringify(inputs))
        if(name) return callApi(`processbyname/${name}`, 'POST', JSON.stringify(inputs))
    },
    processScript({name, id, funcs = []}){
        if(id) return callApi(`script/${id}`, 'GET')
        if(name) return callApi(`scriptbyname/${name}`, 'GET')
    },
    processTemp({funcs = []}){
        return callApi(`processtemp`, 'POST', JSON.stringify({ funcs }))
    },
    getPipeInput(pipeid){
        return callApi(`pipe/${pipeid}/input`, 'GET')
    },
    getPipeOutput(pipeid){
        return callApi(`pipe/${pipeid}/output`, 'GET')
    },
    getFuncInput(funcid){
        return callApi(`function/${funcid}/input`, 'GET')
    },
    getFuncOutput(funcid){
        return callApi(`function/${funcid}/output`, 'GET')
    }

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
    .then(res => {
        // raise if error
        if(!res.ok){
            throw new Error(res.status)
        }
        return res;
    })
    .then(res => res.json())
}
