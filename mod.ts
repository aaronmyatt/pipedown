import {Application, Router, send, oakCors, aspect, Pipeline} from './deps.ts';
import {
    readWholeJSONDir,
    createDirIfItDoesntExist,
    readRawJsonFile,
    pipeFileName,
    writePipeDataToFile,
    funcFileName,
    writeFuncDataToFile,
    pipeDirName,
    funcDirName,
    allPipes,
    getPipeFunctions,
    oneFunc
} from './utils.ts';
import {pipeProcessor as pprocessor} from './pipeProcessor.js';
import * as esbuild from "https://deno.land/x/esbuild@v0.18.17/mod.js";

const app = new Application();
const router = new Router();

// enable cors
app.use(oakCors({origin: '*'}));

// // API endpoint
router.get('/api/pipes', (context) => {
    context.response.body = allPipes();
});

router.get('/api/pipe/:pipeid', (context) => {
    context.response.body = allPipes().find(p => p.id === Number(context.params.pipeid));
});


router.get('/api/functions', (context) => {
    const dirname = 'functions';
    createDirIfItDoesntExist(dirname);
    const functions = readWholeJSONDir(dirname);
    context.response.body = functions;
})

router.post('/api/pipes', async (context) => {
    const requestData = await context.request.body({type: 'json'}).value;
    createDirIfItDoesntExist(pipeDirName);
    writePipeDataToFile(requestData)
    context.response.body = readRawJsonFile(pipeFileName(pipeDirName, requestData.id));
});

router.post('/api/functions', async (context) => {
    const requestData = await context.request.body({type: 'json'}).value;
    createDirIfItDoesntExist(funcDirName);
    writeFuncDataToFile(requestData)
    context.response.body = {message: 'success', data: readRawJsonFile(funcFileName(funcDirName, requestData.id))};
});

router.post('/api/function/:funcid/input', async (context) => {
    const requestData = await context.request.body({type: 'json'}).value;
    const funcid = context.params.funcid;
    const func = oneFunc(funcid)
    func.inputs.push(requestData.input)
    writeFuncDataToFile(func)
});

router.post('/api/function/:funcid/output', async (context) => {
    const requestData = await context.request.body({type: 'json'}).value;
    const funcid = context.params.funcid;
    const func = oneFunc(funcid)
    func.outputs.push(requestData.output)
    writeFuncDataToFile(func)
});

router.all('/api/process/:pipeid/:prop?', async (context) => {
    const requestData = await context.request.body({type: 'json'}).value;
    const prop = context.params.prop;
    const pipe = allPipes().find(p => p.id === Number(context.params.pipeid));
    const result = await pipeProcessor(pipe)
    const scriptName = pipeFileName('./', pipe.id)
    await Deno.writeTextFile(scriptName + '.js', result)
    const module = await import(scriptName + '.js')
    const pipeScript = module.pipe();
    const output = await pipeScript.process(requestData);
    if(output.headers){
        Object.entries(output.headers).forEach(([key, value]) => {
            context.response.headers.set(key, value)
        })
    }
    if(prop && prop in output){
        context.response.body = output[prop]
    } else {
        context.response.body = output
    }
})

async function generatePipeScript(pipeid) {
    const pipe = allPipes().find(p => p.id === Number(pipeid));
    const result = await pipeProcessor(pipe, {format: 'iife', platform: 'browser', globalName: 'pipe'+pipeid})
    const scriptName = pipeFileName('./', pipe.id)
    await Deno.writeTextFile(scriptName + '.js', result)
    const pipeScript = await Deno.readTextFile(scriptName + '.js');
    return pipeScript;
}

router.get('/api/script/:pipeid', async (context) => {
    const pipeScript = await generatePipeScript(context.params.pipeid);
    context.response.body = {script: pipeScript};
})

router.get('/api/scriptbyname/:pipename', async (context) => {
    const pipeName = context.params.pipename
    const pipe = allPipes().find(p => p.name === pipeName);
    const pipeScript = await generatePipeScript(pipe.id);
    context.response.body = {script: pipeScript, id: pipe.id};
})

router.post('/api/temporaryscript', async (context) => {
    const requestData = await context.request.body({type: 'json'}).value;
    const pipe = {
        functions: requestData.funcs,
    }
    const pipeScript = await pipeProcessor(pipe, {format: 'iife', platform: 'browser', globalName: 'pipetemp'})
    context.response.body = {script: pipeScript, id: 'temp'};
})

const PIPE_TEMPLATE = (funcSequence) => `import {pipeProcessor} from './pipeProcessor.js';
const funcSequence = ${JSON.stringify(funcSequence, null, 4)}
export const pipe = pipeProcessor.bind(this, funcSequence)
`

async function pipeProcessor(pipe: Record<string, unknown>, buildConfig = {} ) {
    const funcSequence = getPipeFunctions(pipe)
    const config = Object.assign({
        bundle: true,
        stdin: {
            contents: PIPE_TEMPLATE(funcSequence),
            resolveDir: '.'
        },
        format: 'esm',
        write: false,
        treeShaking: true,
    }, buildConfig)
    const pipeBuild = await esbuild.build(config)
    return pipeBuild.outputFiles[0].text
}

app.use(router.routes());
app.use(router.allowedMethods());


app.use(async (ctx, next) => {
    await next();
    const pathname = ctx.request.url.pathname

    if (pathname.startsWith('/scripts')) {
        await esbuild.build({
            bundle: true,
            entryPoints: [`${Deno.cwd()}${pathname}`],
            platform: 'browser',
            write: true,
            format: 'iife',
            outdir: 'out/scripts',
        })
        await ctx.send({
            root: `${Deno.cwd()}/out`,
        })
    } else {
        console.log(pathname)
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
