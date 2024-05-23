import {std} from "./deps.ts";

export const camelCaseString = (s: string) => {
  return s
    .replace(/[\W_]+/g, ' ').trim()
    .replace(/(?:^\w|[A-Z]|\b\w)/g, function (word, index) {
      return index === 0 ? word.toLowerCase() : word.toUpperCase();
  }).replace(/\s+/g, "");
};

export const fileName = (path: string) => camelCaseString(std.parsePath(path).name);
export const fileDir = (path: string) => std.basename(std.parsePath(path).dir);