import type { CliInput } from "../pipedown.d.ts";

import { helpText } from "../stringTemplates.ts";

export function helpCommand(input: CliInput) {
  console.log(helpText);
  return input;
}
