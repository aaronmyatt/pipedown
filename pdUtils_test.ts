// deno-lint-ignore no-import-prefix no-unversioned-import
import { assertEquals } from "jsr:@std/assert";
import { fileDir, fileName, sanitizeString } from "./pdUtils.ts";

Deno.test("sanitizeString", async (t) => {
  await t.step("strips non-word characters and joins words", () => {
    assertEquals(sanitizeString("Hello World"), "HelloWorld");
  });

  await t.step("removes special characters", () => {
    assertEquals(
      sanitizeString("Step: With (Special) Chars!"),
      "StepWithSpecialChars",
    );
  });

  await t.step("handles leading/trailing whitespace", () => {
    assertEquals(sanitizeString("  padded  "), "padded");
  });

  await t.step("handles hyphens and underscores", () => {
    assertEquals(sanitizeString("my-pipe_name"), "mypipename");
  });

  await t.step("handles numeric-only input", () => {
    assertEquals(sanitizeString("123"), "123");
  });

  await t.step("handles leading numbers", () => {
    assertEquals(sanitizeString("123 should work"), "123shouldwork");
  });

  await t.step("returns empty string for all-special input", () => {
    assertEquals(sanitizeString("!@#$%"), "");
  });

  await t.step("handles empty string", () => {
    assertEquals(sanitizeString(""), "");
  });

  await t.step("collapses consecutive special characters", () => {
    assertEquals(sanitizeString("a---b___c"), "abc");
  });
});

Deno.test("fileName", async (t) => {
  await t.step("extracts and sanitizes filename from path", () => {
    assertEquals(fileName("/path/to/myFile.md"), "myFile");
  });

  await t.step("handles spaces in filename", () => {
    assertEquals(fileName("/path/to/My File.md"), "MyFile");
  });

  await t.step("handles special characters in filename", () => {
    assertEquals(fileName("/path/to/my-pipe_name.md"), "mypipename");
  });

  await t.step("handles nested paths", () => {
    assertEquals(fileName("/deep/nested/path/file.ts"), "file");
  });
});

Deno.test("fileDir", async (t) => {
  await t.step("returns parent directory basename", () => {
    assertEquals(fileDir("/path/to/myFile.md"), "to");
  });

  await t.step("handles nested paths", () => {
    assertEquals(fileDir("/a/b/c/file.ts"), "c");
  });
});
