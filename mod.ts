import './scripts/pdglobal.deno.ts'
import {Application, Router, oakCors, Status} from './deps.ts';
import {
    createDirIfItDoesntExist,
    writePipeDataToFile,
    writeFuncDataToFile,
    pipeDirName,
    funcDirName,
    allPipes,
    onePipe,
    saveFunctionInput,
    saveFunctionOutput,
    onePipeWithName,
    inputsDirName,
    outputsDirName,
    allFuncs,
    oneFunc,
    savePipeInput,
    savePipeOutput,
    writePipeInputsDataToFile,
    writePipeOutputsDataToFile,
    readLastPipeInput,
    readLastFunctionInput,
    readLastFunctionOutput, readLastPipeOutput
} from './utils.ts';
import {generateClientPipeScript, generateServerScript} from './scriptGenerator.ts';
import * as esbuild from "https://deno.land/x/esbuild@v0.18.17/mod.js";

createDirIfItDoesntExist(pipeDirName);
createDirIfItDoesntExist(funcDirName);
createDirIfItDoesntExist(inputsDirName);
createDirIfItDoesntExist(outputsDirName);


const app = new Application();
const router = new Router();

// enable cors
app.use(oakCors({origin: '*'}));

// // API endpoint
router.get('/api/pipes', async (context) => {
    context.response.body = await allPipes();
});

router.get('/api/pipe/:pipeid', async (context) => {
    context.response.body = await onePipe(context.params.pipeid);
});

router.get('/api/pipebyname/:pipename', async (context) => {
    context.response.body = await onePipeWithName(context.params.pipename);
});


router.get('/api/functions', async (context) => {
    context.response.body = await allFuncs();
})

router.post('/api/pipe', async (context) => {
    const requestData = await context.request.body({type: 'json'}).value;
    await writePipeDataToFile(requestData)
    context.response.body = await onePipe(requestData.id);
});

router.post('/api/functions', async (context) => {
    const requestData = await context.request.body({type: 'json'}).value;
    await writeFuncDataToFile(requestData)
    context.response.body = {message: 'success', data: await oneFunc(requestData.id)};
});

router.get('/api/function/:funcid/:inorout', async (context) => {
    const funcid = context.params.funcid;
    const inorout = context.params.inorout;
    context.response.status = Status.OK
    context.response.body = await ({
        input: readLastFunctionInput.bind(this, funcid),
        output: readLastFunctionOutput.bind(this, funcid)
    })[inorout]() || {};
});

router.post('/api/function/:funcid/:inorout', async (context) => {
    const requestData = await context.request.body({type: 'json'}).value;
    const funcid = context.params.funcid;
    const inorout = context.params.inorout;
    ({
        input: saveFunctionInput.bind(this, funcid, requestData),
        output: saveFunctionOutput.bind(this, funcid, requestData)
    })[inorout]();
    context.response.status = Status.OK
});

router.get('/api/pipe/:pipeid/:inorout', async (context) => {
    const pipeid = context.params.pipeid;
    const inorout = context.params.inorout;
    context.response.status = Status.OK
    context.response.body = await ({
        input: readLastPipeInput.bind(this, pipeid),
        output: readLastPipeOutput.bind(this, pipeid)
    })[inorout]() || {};
});

router.post('/api/pipe/:pipeid/:inorout', async (context) => {
    const requestData = await context.request.body({type: 'json'}).value;
    const pipeid = context.params.pipeid;
    const inorout = context.params.inorout;
    ({
        input: savePipeInput.bind(this, pipeid, requestData),
        output: savePipeOutput.bind(this, pipeid, requestData)
    })[inorout]();
    context.response.status = Status.OK
});

router.all('/api/process/:pipeid/:prop?', async (context) => {
    const requestData = await context.request.body({type: 'json'}).value;
    const prop = context.params.prop;
    const pipe = await onePipe(context.params.pipeid)

    if (pipe) {
        writePipeInputsDataToFile(pipe, requestData);
        await generateServerScript(pipe)

        const output = await PD[pipe.name](requestData);
        writePipeOutputsDataToFile(pipe, output);

        if (output.headers) {
            Object.entries(output.headers).forEach(([key, value]) => {
                context.response.headers.set(key, value)
            })
        }
        if (prop && prop in output) {
            context.response.body = output[prop]
        } else {
            context.response.body = output
        }
    }

})

router.all('/api/processbyname/:pipename/:prop?', async (context) => {
    const requestData = await context.request.body({type: 'json'}).value;
    const prop = context.params.prop;
    const pipename = context.params.pipename
    let pipe = await onePipeWithName(context.params.pipename);
    if (!pipe) {
        const output = await PD.pdNewPipe({name: pipename})
        pipe = output.newPipe
    }

    if (pipe) {
        writePipeInputsDataToFile(pipe, requestData);
        await generateServerScript(pipe)

        const output = await PD[pipename](requestData)
        writePipeOutputsDataToFile(pipe, output);

        if (output.headers) {
            Object.entries(output.headers).forEach(([key, value]) => {
                context.response.headers.set(key, value)
            })
        }
        if (prop && prop in output) {
            context.response.body = output[prop]
        } else {
            context.response.body = output
        }
    }
})

router.get('/api/script/:pipeid', async (context) => {
    const pipeid = context.params.pipeid
    const pipe = await onePipe(pipeid);
    const pipeScript = await generateClientPipeScript(pipe);
    context.response.body = {script: pipeScript};
})

router.get('/api/scriptbyname/:pipename', async (context) => {
    const pipeName = context.params.pipename
    let pipe = await onePipeWithName(pipeName)
    if (!pipe) {
        const output = await PD.pdNewPipe({name: pipeName})
        pipe = output.newPipe
    }

    if (pipe) {
        const pipeScript = await generateClientPipeScript(pipe);
        context.response.body = {script: pipeScript, id: pipe.id};
    } else {
        context.response.status = Status.NotFound
        context.response.body = {message: `Pipe ${pipeName} not found`};
    }
})

router.post('/api/processtemp', async (context) => {
    const requestData = await context.request.body({type: 'json'}).value;
    const output = await PD.temp({id: 'temp', functions: requestData.funcs})
    context.response.body = output;
})

router.post('/api/temporaryscript', async (context) => {
    const requestData = await context.request.body({type: 'json'}).value;
    const pipe = {
        functions: requestData.funcs,
    }
    const pipeScript = await generateClientPipeScript(pipe, {globalName: 'pipetemp'})
    context.response.body = {script: pipeScript, id: 'temp'};
})

router.get('/testwindow', async (context) => {
    context.response.headers.set('Content-Type', 'text/html')
    try {
        const output = await PD.pdTestWindow()
        context.response.body = output.html;
    } catch (e) {
        context.response.body = await Deno.readTextFile('public/testwindow.html')
    }
})

app.use(router.routes());
app.use(router.allowedMethods());


app.use(async (ctx, next) => {
    await next();
    const pathname = ctx.request.url.pathname

    const pipes = await allPipes()
    for (const pipe of pipes) {
        if (pipe.execOnServer) {
            await generateServerScript(pipe);
        } else {
            await generateClientPipeScript(pipe);
        }
    }

    if (pathname.startsWith('/scripts')) {
        const entryPoint = `${Deno.cwd()}${pathname}`
        try {
            if (pathname.includes('pipes-')) {
                // if it's a pipe script, we can skip
            } else {
                await esbuild.build({
                    bundle: true,
                    entryPoints: [entryPoint],
                    platform: 'browser',
                    write: true,
                    format: 'iife',
                    outdir: 'out/scripts',
                })
            }
        } catch (e) {
            console.warn(`Nothing to build at: ${entryPoint}`)
        } finally {
            await ctx.send({
                root: `${Deno.cwd()}/out`,
            })
        }
    } else {
        try {
            await ctx.send({
                root: `${Deno.cwd()}/public`,
                index: 'index.html',
            })
        } catch (e) {
            await ctx.send({
                path: `index.html`,
                root: `${Deno.cwd()}/public`
            })
        }
    }
})


console.log('Server is running at http://localhost:8000/');
await app.listen({port: 8000});
