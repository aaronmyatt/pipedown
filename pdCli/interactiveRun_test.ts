import { assertEquals } from "@std/assert";
import {
  dedupeReplayableInputs,
  escapeRegExp,
  eventTouchesInteractiveTarget,
  findReplayableInputChoice,
  INTERACTIVE_COMMANDS_FOOTER,
  normalizeInteractiveAction,
  resolveInteractiveTarget,
} from "./interactiveRunHelpers.ts";

Deno.test("interactiveRun helpers", async (t) => {
  await t.step("escapeRegExp protects literal match strings", () => {
    assertEquals(escapeRegExp("src/foo.bar(md)"), "src/foo\\.bar\\(md\\)");
  });

  await t.step(
    "resolveInteractiveTarget matches basename or nested path",
    () => {
      const target = resolveInteractiveTarget("nested/example.md", [
        { path: "nested/example.md", name: "example" },
      ]);
      assertEquals(target, {
        path: "nested/example.md",
        pipeName: "example",
      });
    },
  );

  await t.step(
    "resolveInteractiveTarget returns null when nothing matches",
    () => {
      assertEquals(resolveInteractiveTarget("missing.md", []), null);
    },
  );

  await t.step(
    "dedupeReplayableInputs keeps first occurrence of each input object",
    () => {
      const deduped = dedupeReplayableInputs([
        { timestamp: "3", label: "third", input: { value: 1 } },
        { timestamp: "2", label: "second", input: { value: 1 } },
        { timestamp: "1", label: "first", input: { value: 2 } },
      ]);

      assertEquals(deduped.length, 2);
      assertEquals(deduped[0].timestamp, "3");
      assertEquals(deduped[1].timestamp, "1");
    },
  );

  await t.step(
    "findReplayableInputChoice returns the existing choice object for defaults",
    () => {
      const choices = dedupeReplayableInputs([
        { timestamp: "3", label: "third", input: { value: 1 } },
        { timestamp: "2", label: "second", input: { value: 1 } },
        { timestamp: "1", label: "first", input: { value: 2 } },
      ]);

      const choice = findReplayableInputChoice(choices, { value: 2 });
      assertEquals(choice?.timestamp, "1");
      assertEquals(choice?.label, "first");
    },
  );

  await t.step(
    "normalizeInteractiveAction maps immediate hotkeys and ctrl+c",
    () => {
      assertEquals(normalizeInteractiveAction("r"), "r");
      assertEquals(normalizeInteractiveAction("return"), "r");
      assertEquals(normalizeInteractiveAction("c", true), "q");
      assertEquals(normalizeInteractiveAction("up"), null);
    },
  );

  await t.step(
    "interactive footer text stays aligned with the supported hotkeys",
    () => {
      assertEquals(
        INTERACTIVE_COMMANDS_FOOTER,
        "Commands: r rerun, i edit input, s choose past input, e edit pipe, t latest trace, q quit",
      );
    },
  );

  await t.step(
    "eventTouchesInteractiveTarget handles atomic-save style paths",
    () => {
      const target = "/tmp/project/example.md";
      assertEquals(eventTouchesInteractiveTarget(target, [target]), true);
      assertEquals(
        eventTouchesInteractiveTarget(target, [
          "/tmp/project/.example.md.swp",
          target,
        ]),
        true,
      );
      assertEquals(
        eventTouchesInteractiveTarget(target, ["/tmp/project/other.md"]),
        false,
      );
    },
  );
});
