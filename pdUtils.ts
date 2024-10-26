import {std} from "./deps.ts";

export const sanitizeString = (s: string) => {
  return s
    .replace(/[\W_]+/g, ' ').trim()
    .replace(/\s+/g, "");
};

export const fileName = (path: string) => sanitizeString(std.parsePath(path).name);
export const fileDir = (path: string) => std.basename(std.parsePath(path).dir);