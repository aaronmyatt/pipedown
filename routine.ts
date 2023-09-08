function routine<T = any>(
    fn: (...args: any[]) => any,
    ...args: any[]
): Promise<T> {
    const wrapped = (): any => {
        // @ts-ignore as this code is inside of worker
        self.onmessage = (event: MessageEvent) => {
            // data are actually the args given to the wrapped function
            const data: any = event.data;
            const result = fn.apply(null, data);

            // @ts-ignore as this code is inside of worker
            self.postMessage(result);
            // @ts-ignore as this code is inside of worker
            self.close();
        };
    };

    const wrappedBody = wrapped
        .toString()
        .replace(/^[^{]*{\s*/, "")
        .replace(/\s*}[^}]*$/, "") // making the function a "file"
        .replace(/fn/, `(${fn.toString()})`); // replacing the wrapped fn by it's body

    const tempWorker = Deno.makeTempFileSync({
        prefix: "__routine",
        suffix: ".worker.js",
    });
    Deno.writeTextFileSync(tempWorker, wrappedBody);

    const worker = new Worker(`file://${tempWorker}`, {
        type: "module"
    });

    worker.postMessage(args);

    return new Promise((resolve) => {
        worker.onmessage = (event: MessageEvent) => {
            Deno.remove(tempWorker);
            resolve(event.data);
        };
    });
}

export default routine;
