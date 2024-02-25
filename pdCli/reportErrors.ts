import type {pdCliInput} from "./mod.ts";

export function reportErrors(input: pdCliInput) {
  input.errors && input.errors.map((err) => {
    if (typeof err === "string") console.error(err);
    else {
      console.error(err)
    }
    console.log("");
  });

  input.output.errors && input.output.errors.map((err) => {
    console.error(err);
    console.log("");
  });
}
