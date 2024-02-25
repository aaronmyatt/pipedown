async function executeScript(opts = { name: "", id: "" }, inputs) {
  const pipeWorkerThread = new Worker(
    new URL(`./pipe.worker.js`, import.meta.url).href,
    {
      type: "module",
    },
  );

  const waitForWorker = new Promise((resolve) => {
    pipeWorkerThread.onmessage = (event: MessageEvent) => {
      resolve(JSON.parse(event.data));
    };
  });

  pipeWorkerThread.postMessage(
    JSON.stringify({ scriptName: opts.name, inputs }),
  );

  return await waitForWorker.then((data) => {
    return data;
  });
}

export { executeScript };
