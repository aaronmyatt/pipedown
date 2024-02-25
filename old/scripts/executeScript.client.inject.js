async function executeScript(opts = {name:  '', id: ''}, inputs) {
    const pipeWorkerThread = new Worker(new URL(`./scripts/pipe.worker.js`, import.meta.url).href, {
        type: "module"
    });

    const waitForWorker = new Promise((resolve) => {
        pipeWorkerThread.onmessage = (event: MessageEvent) => {
            resolve(event.data);
        };
    });

    pipeWorkerThread.postMessage({ scriptName: opts.name, inputs });

    return await waitForWorker.then((data) => {
        return data;
    });
}

export {
    executeScript
}
