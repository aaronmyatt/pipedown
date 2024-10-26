import type { CliInput, PDError } from "../pipedown.d.ts";

export function reportErrors(input: CliInput) {
  input.errors && input.errors.map((err) => {
    if (typeof err === "string"){
      console.error(err);
    }
    else {
      console.error(err.stack);
      console.log("");
    }
    console.log("");
  });

  input.output && input.output.errors && input.output.errors.map((err: PDError) => {
    console.error(err.stack);
    console.log("");
  });
}
