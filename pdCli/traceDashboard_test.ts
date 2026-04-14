import { assertEquals } from "@std/assert";
import {
  coerceReplayableInputValue,
  extractReplayableInput,
  latestTraceForAliasesFromEntries,
  latestTraceForPipeFromEntries,
  recentTracesForAliasesFromEntries,
  recentTracesForPipeFromEntries,
  sortTraceIndexEntries,
  type TraceIndexEntry,
} from "./traceDashboard.ts";

Deno.test("traceDashboard: extractReplayableInput strips runtime metadata", async (t) => {
  await t.step("keeps user-authored fields and removes flags/mode", () => {
    const replay = extractReplayableInput({
      input: {
        title: "example",
        count: 3,
        flags: { json: true },
        mode: { cli: true, trace: true },
      },
    });

    assertEquals(replay, {
      title: "example",
      count: 3,
    });
  });

  await t.step(
    "prefers nested input.input when the business payload is wrapped",
    () => {
      assertEquals(
        extractReplayableInput({
          input: {
            input: {
              issueKey: "PD-123",
              dryRun: true,
            },
            flags: { input: '{"issueKey":"ignored"}' },
            mode: { cli: true },
          },
        }),
        {
          issueKey: "PD-123",
          dryRun: true,
        },
      );
    },
  );

  await t.step(
    "falls back to flags.input JSON when no direct fields remain",
    () => {
      assertEquals(
        extractReplayableInput({
          input: {
            flags: { input: '{"email":"test@example.com"}' },
            mode: { cli: true },
          },
        }),
        {
          email: "test@example.com",
        },
      );
    },
  );

  await t.step(
    "returns an empty object when nothing replayable remains",
    () => {
      assertEquals(
        extractReplayableInput({
          input: {
            flags: { json: true },
            mode: { cli: true },
          },
        }),
        {},
      );
      assertEquals(extractReplayableInput({}), {});
    },
  );
});

Deno.test("traceDashboard: coerceReplayableInputValue normalizes legacy shapes", () => {
  assertEquals(coerceReplayableInputValue({ hello: "world" }), {
    hello: "world",
  });
  assertEquals(
    coerceReplayableInputValue('{"hello":"world"}'),
    { hello: "world" },
  );
  assertEquals(coerceReplayableInputValue("[]"), null);
  assertEquals(coerceReplayableInputValue("not-json"), null);
});

Deno.test("traceDashboard: latest trace helpers order newest-first", async (t) => {
  const traces: TraceIndexEntry[] = [
    {
      project: "alpha",
      pipe: "pipe-a",
      timestamp: "1000",
      filePath: "/tmp/alpha/pipe-a/1000.json",
    },
    {
      project: "alpha",
      pipe: "pipe-a",
      timestamp: "2000",
      filePath: "/tmp/alpha/pipe-a/2000.json",
    },
    {
      project: "alpha",
      pipe: "pipe-a",
      timestamp: "2025-01-01T00:00:00.000Z",
      filePath: "/tmp/alpha/pipe-a/2025.json",
    },
    {
      project: "alpha",
      pipe: "pipe-b",
      timestamp: "9999",
      filePath: "/tmp/alpha/pipe-b/9999.json",
    },
  ];

  await t.step(
    "sortTraceIndexEntries sorts numeric and ISO timestamps together",
    () => {
      const sorted = sortTraceIndexEntries(traces);
      assertEquals(sorted[0].timestamp, "2025-01-01T00:00:00.000Z");
      assertEquals(sorted[1].timestamp, "9999");
      assertEquals(sorted[2].timestamp, "2000");
      assertEquals(sorted[3].timestamp, "1000");
    },
  );

  await t.step(
    "latestTraceForPipeFromEntries returns the most recent matching trace",
    () => {
      const latest = latestTraceForPipeFromEntries(traces, "alpha", "pipe-a");
      assertEquals(latest?.timestamp, "2025-01-01T00:00:00.000Z");
      assertEquals(latest?.filePath, "/tmp/alpha/pipe-a/2025.json");
    },
  );

  await t.step(
    "recentTracesForPipeFromEntries keeps only the requested pipe and limit",
    () => {
      const recent = recentTracesForPipeFromEntries(
        traces,
        "alpha",
        "pipe-a",
        2,
      );
      assertEquals(recent.length, 2);
      assertEquals(recent[0].timestamp, "2025-01-01T00:00:00.000Z");
      assertEquals(recent[1].timestamp, "2000");
    },
  );

  await t.step(
    "alias helpers bridge legacy title-based trace directories",
    () => {
      const aliased: TraceIndexEntry[] = [
        ...traces,
        {
          project: "renamed-project",
          pipe: "Human Friendly Pipe",
          timestamp: "3000",
          filePath: "/tmp/renamed/Human Friendly Pipe/3000.json",
        },
      ];

      const recent = recentTracesForAliasesFromEntries(
        aliased,
        ["alpha"],
        ["pipe-a", "Human Friendly Pipe"],
        2,
      );
      assertEquals(recent.length, 2);
      assertEquals(recent[0].timestamp, "2025-01-01T00:00:00.000Z");
      assertEquals(recent[1].timestamp, "2000");

      const fallbackLatest = latestTraceForAliasesFromEntries(
        aliased,
        ["missing-project"],
        ["Human Friendly Pipe"],
      );
      assertEquals(fallbackLatest?.timestamp, "3000");
    },
  );
});
