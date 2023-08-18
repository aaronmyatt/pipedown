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
} from './utils.ts';
import {pipeProcessor as pprocessor} from './pipeProcessor.js';
import * as esbuild from "https://deno.land/x/esbuild@v0.18.17/mod.js";

const app = new Application();
const router = new Router();

// enable cors
app.use(oakCors({origin: '*'}));

// // API endpoint
router.get('/api/pipes', async (context) => {
    const dirname = 'data';
    createDirIfItDoesntExist(dirname);
    const data = readWholeJSONDir(dirname);
    context.response.body = data;
});


router.get('/api/functions', async (context) => {
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

router.post('/api/process/:pipeid', async (context) => {
    const requestData = await context.request.body({type: 'json'}).value;
    const pipe = readWholeJSONDir('data').find(p => p.id === Number(context.params.pipeid));
    const result = await pipeProcessor(pipe, {
        always: (state, args) => {
            writeFuncDataToFile(state.func)
        }
    })
    const scriptName = pipeFileName('./', pipe.id)
    await Deno.writeTextFile(scriptName + '.js', result)
    const module = await import(scriptName + '.js')
    const pipeScript = module.pipe();
    context.response.body = await pipeScript.process(requestData);
})

async function generatePipeScript(pipeid) {
    const pipe = readWholeJSONDir('data').find(p => p.id === Number(pipeid));
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
    const pipe = readWholeJSONDir('data').find(p => p.name === context.params.pipename);
    const pipeScript = await generatePipeScript(pipe.id);
    context.response.body = {script: pipeScript};
})

router.post('/api/process/function/:funcid', async (context) => {
    const requestData = await context.request.body({type: 'json'}).value;
    const func = readWholeJSONDir('functions').find(f => f.id === Number(context.params.funcid));
    const result = await pprocessor([func]).process(requestData);
    context.response.body = result;
})

function getFunctions(pipe): Record<string, unknown>[] {
    return readWholeJSONDir('functions')
        .filter(f => pipe.functions.includes(f.id))
        .sort((a, b) => pipe.functions.indexOf(a.id) - pipe.functions.indexOf(b.id))
}

const PIPE_TEMPLATE = (funcSequence) => `import {pipeProcessor} from './pipeProcessor.js';
export function pipe(){
    const funcSequence = ${JSON.stringify(funcSequence, null, 4)}
     return pipeProcessor(funcSequence, { always: () => {} })
}`

async function pipeProcessor(pipe: Record<string, unknown>, buildConfig = {} ) {
    const funcSequence = getFunctions(pipe)
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
