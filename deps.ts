import { deepMerge } from "jsr:@std/collections@0.224.0";
import { walk, exists } from "jsr:@std/fs@0.224.0";
import * as colors from "jsr:@std/fmt@0.224.0/colors";
import {
  dirname,
  join,
  parse as parsePath,
  basename, globToRegExp,
} from "jsr:@std/path@0.224.0";
import { serveFile } from "jsr:@std/http@0.224.0";
import { debounce } from "jsr:@std/async@0.224.0";
import {firstNotNullishOf} from "jsr:@std/collections@0.224.0";
import {parseArgs} from "jsr:@std/cli@0.224.0";

import {parse as keycodeParse} from "jsr:@cliffy/keycode@1.0.0-rc.4";
import { parse } from "jsr:@pd/pulldown-cmark@0.1.0";

import { process } from "jsr:@pd/pdpipe@0.1.1";
import {$p} from "jsr:@pd/pointers@0.1.1";

import * as esbuild from "npm:esbuild@0.21.1";
//import { httpImports } from "https://deno.land/x/esbuild_plugin_http_imports@v1.3.0/index.ts";

export const std = {
    deepMerge,
    walk,
    colors,
    dirname,
    join,
    parsePath,
    parseArgs,
    exists,
    globToRegExp,
    serveFile,
    basename,
    debounce,
    firstNotNullishOf,
};
export const md = {
    parse,
};

export const pd = {
    process,
    $p,
};

export {
    esbuild,
    keycodeParse,
};
