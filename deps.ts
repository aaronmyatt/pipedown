import { deepMerge } from "jsr:@std/collections@1.0.9";
import { exists, walk } from "jsr:@std/fs@1.0.5";
import * as colors from "jsr:@std/fmt@1.0.3/colors";
import {
  basename,
  dirname,
  globToRegExp,
  join,
  parse as parsePath,
  relative,
} from "jsr:@std/path@1.0.7";
import { serveFile } from "jsr:@std/http@1.0.9";
import { debounce } from "jsr:@std/async@1.0.7";
import { firstNotNullishOf } from "jsr:@std/collections@1.0.9";
import { parseArgs } from "jsr:@std/cli@1.0.6";

import { parse as keycodeParse } from "jsr:@cliffy/keycode@1.0.0-rc.7";
import { parse } from "jsr:@pd/pulldown-cmark@0.1.0";

import { process } from "jsr:@pd/pdpipe@0.2.2";
import { $p } from "jsr:@pd/pointers@0.1.1";

import * as esbuild from "npm:esbuild@0.23.1";
//import { httpImports } from "https://deno.land/x/esbuild_plugin_http_imports@v1.3.0/index.ts";

export const std = {
  relative,
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

export { esbuild, keycodeParse };
