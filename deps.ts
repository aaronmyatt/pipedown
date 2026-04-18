import { deepMerge } from "jsr:@std/collections@1.1.6";
import { exists, walk } from "jsr:@std/fs@1.0.23";
import * as colors from "jsr:@std/fmt@1.0.9/colors";
import {
  basename,
  dirname,
  globToRegExp,
  join,
  parse as parsePath,
  relative,
  toFileUrl,
} from "jsr:@std/path@1.1.4";
import { serveFile } from "jsr:@std/http@1.0.25";
import { debounce } from "jsr:@std/async@1.2.0";
import { firstNotNullishOf } from "jsr:@std/collections@1.1.6";
import { parseArgs } from "jsr:@std/cli@1.0.28";

import { parse as keycodeParse } from "jsr:@cliffy/keycode@1.0.0";
import { keypress, type KeyPressEvent } from "jsr:@cliffy/keypress@1.0.0";
import { Select } from "jsr:@cliffy/prompt@1.0.0-rc.7/select";
import MarkdownIt from "npm:markdown-it@14.1.1";

import { process } from "jsr:@pd/pdpipe@0.2.2";
import { $p } from "jsr:@pd/pointers@0.1.1";
import { transpile } from "jsr:@deno/emit@0.46.0";
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
  toFileUrl,
};
export const md = {
  MarkdownIt,
};

export const pd = {
  process,
  $p,
};

// Deno's runtime transpiler is used during build-time source-map
// recomposition so stack traces align with transpiled execution lines.
// Ref: https://jsr.io/@deno/emit/doc/~/transpile
export const denoEmit = {
  transpile,
};

export { keycodeParse, keypress, Select };
export type { KeyPressEvent };
