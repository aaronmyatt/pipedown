export const API = {
    functions(){
        return callApi('functions', 'GET')
    },
    pipes(){
        return callApi('pipes', 'GET')
    },
    saveFunction(func){
        return callApi('functions', 'POST', JSON.stringify(func))
    },
    savePipe(pipe){
        return callApi('pipes', 'POST', JSON.stringify(pipe))
    },
    process(pipeid, input = {}){
        return callApi(`process/${pipeid}`, 'POST', JSON.stringify(input))
    },
    processFunction(funcid, input = {}){
        return callApi(`process/function/${funcid}`, 'POST', JSON.stringify(input))
    },
    processScript({name,id}){
        if(id) return callApi(`script/${pipeid}`, 'GET')
        return callApi(`scriptbyname/${name}`, 'GET')
    },
}

export function setupApi(Alpine){
    Alpine.store('api', API)
}

function callApi(path, method, body){
    return fetch('http://localhost:8000/api/'+path, {
        method: method,
        headers: {
            'Content-Type': 'application/json'
        },
        body: body
    })
    .then(res => res.json())
}
