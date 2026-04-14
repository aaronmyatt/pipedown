import type { CliInput } from "../pipedown.d.ts";
import { keypress, pd, Select, std } from "../deps.ts";
import { pdBuild } from "../pdBuild.ts";
import { pdRun } from "./helpers.ts";
import { notifyTauri } from "./notifyTauri.ts";
import {
  dedupeReplayableInputs,
  escapeRegExp,
  eventTouchesInteractiveTarget,
  findReplayableInputChoice,
  INTERACTIVE_COMMANDS_FOOTER,
  type InteractiveTarget,
  normalizeInteractiveAction,
  type ReplayableInputChoice,
  resolveInteractiveTarget,
  toAbsoluteInteractivePath,
} from "./interactiveRunHelpers.ts";
import {
  extractReplayableInput,
  latestTraceForAliases,
  readTrace,
  recentTracesForAliases,
} from "./traceDashboard.ts";

// ── Terminal helpers ──────────────────────────────────────────────────────────

const terminalEncoder = new TextEncoder();
const PIPE_DOWN_FRAMES = [
  ["      │      ", "      ▼      "],
  ["      │      ", "      │      ", "      ▼      "],
  ["      │      ", "      │      ", "      │      ", "      ▼      "],
];

/**
 * Quote a file path for shell execution.
 *
 * Single-quote escaping is the safest portable option here because it disables
 * interpolation and only needs to special-case embedded single quotes.
 * Ref: https://pubs.opengroup.org/onlinepubs/9699919799/utilities/V3_chap02.html#tag_18_02
 *
 * @param value - The raw path that will be interpolated into `sh -lc`.
 * @returns A shell-safe single-quoted string.
 */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

/**
 * Render a compact single-line preview of the current replay input.
 *
 * The footer should stay readable even for large JSON payloads, so we keep the
 * preview intentionally short and fall back to an ellipsis when needed.
 * Ref: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify
 *
 * @param input - Current replay input object.
 * @returns A shortened JSON preview suitable for the footer.
 */
function summarizeReplayInput(input: Record<string, unknown>): string {
  const raw = JSON.stringify(input);
  if (raw.length <= 120) return raw;
  return `${raw.slice(0, 117)}...`;
}

/**
 * Format a high-contrast rerun banner.
 *
 * Save-triggered reruns are easy to miss in a stream of pipe output, so we use
 * a louder label for file-watch events while keeping the rest of the logging
 * minimal.
 *
 * @param reason - Human-readable rerun reason.
 * @returns A colorized banner string.
 */
function formatRerunBanner(reason: string): string {
  const isAuto = reason.includes("file changed") || reason.includes("queued");
  const label = isAuto ? "AUTO RERUN" : "RERUN";
  const color = isAuto ? std.colors.brightYellow : std.colors.brightGreen;
  return color(std.colors.bold(`\n━━ ${label}: ${reason} ━━`));
}

/**
 * Play a tiny downward-arrow animation before each run.
 *
 * The interactive session is about repeatedly "piping down" markdown changes
 * into executable code, so a very short arrow animation makes reruns obvious
 * without introducing a full TUI renderer or a long delay.
 * Ref: https://developer.mozilla.org/en-US/docs/Web/API/Window/setTimeout
 *
 * @param reason - Human-readable run reason shown beside the animation.
 */
async function playPipeDownAnimation(reason: string) {
  const isAuto = reason.includes("file changed") || reason.includes("queued");
  const color = isAuto ? std.colors.brightYellow : std.colors.brightGreen;
  const title = color(std.colors.bold(`PIPE ↓ DOWN — ${reason}`));

  if (!Deno.stdout.isTerminal()) {
    console.log(title);
    return;
  }

  for (let index = 0; index < PIPE_DOWN_FRAMES.length; index++) {
    const frame = PIPE_DOWN_FRAMES[index];
    const lines = [title, ...frame.map((line) => color(line))];
    Deno.stdout.writeSync(terminalEncoder.encode(lines.join("\n") + "\n"));

    if (index < PIPE_DOWN_FRAMES.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 65));
      Deno.stdout.writeSync(
        terminalEncoder.encode(`\u001b[${lines.length}F\u001b[J`),
      );
    }
  }
}

/**
 * Load the trace-directory aliases for the current pipe.
 *
 * Historical traces may be stored under the pipe's title (`name`) while newer
 * runs use the stable `fileName`. Reading the built index lets the interactive
 * selector find both shapes without guessing.
 *
 * @param target - Interactive markdown target.
 * @returns All known pipe aliases for trace lookup.
 */
async function loadTracePipeAliases(
  target: InteractiveTarget,
): Promise<string[]> {
  const aliases = new Set<string>([
    target.pipeName,
    std.parsePath(target.path).name,
  ]);

  try {
    const raw = JSON.parse(
      await Deno.readTextFile(`.pd/${target.pipeName}/index.json`),
    ) as {
      fileName?: unknown;
      name?: unknown;
      cleanName?: unknown;
      mdPath?: unknown;
    };

    for (const candidate of [raw.fileName, raw.name, raw.cleanName]) {
      if (typeof candidate === "string" && candidate.trim()) {
        aliases.add(candidate);
      }
    }

    if (typeof raw.mdPath === "string" && raw.mdPath.trim()) {
      aliases.add(std.parsePath(raw.mdPath).name);
    }
  } catch {
    // The first interactive run may happen before a fresh build has produced
    // `.pd/<pipe>/index.json`, so we fall back to filename-derived aliases.
  }

  return [...aliases];
}

/**
 * Minimal sticky footer renderer for the interactive loop.
 *
 * We intentionally avoid introducing a full-screen TUI. Instead we redraw a
 * tiny footer only when it is the last thing on screen, which keeps the code
 * small while still giving the user a persistent status + hotkey summary.
 * ANSI cursor movement is only used when stdout is a terminal.
 * Ref: https://en.wikipedia.org/wiki/ANSI_escape_code
 */
class InteractiveFooter {
  #visible = false;
  #lineCount = 0;

  /**
   * Clear the previously rendered footer, if it is still the last terminal
   * output.
   */
  clear() {
    if (!this.#visible || !Deno.stdout.isTerminal()) return;

    Deno.stdout.writeSync(
      terminalEncoder.encode(`\u001b[${this.#lineCount}F\u001b[J`),
    );
    this.#visible = false;
    this.#lineCount = 0;
  }

  /**
   * Draw the current status line and the canonical command footer.
   *
   * @param status - Short human-readable state summary.
   * @param replayInput - The replay payload currently selected for reruns.
   */
  render(status: string, replayInput: Record<string, unknown>) {
    if (!Deno.stdout.isTerminal()) return;

    this.clear();

    const lines = [
      std.colors.dim(`Status: ${status}`),
      std.colors.dim(`Replay input: ${summarizeReplayInput(replayInput)}`),
      std.colors.brightCyan(INTERACTIVE_COMMANDS_FOOTER),
    ];

    for (const line of lines) {
      console.log(line);
    }

    this.#visible = true;
    this.#lineCount = lines.length;
  }
}

// ── Interactive actions ───────────────────────────────────────────────────────

/**
 * Wait for a single interactive hotkey.
 *
 * Cliffy's `keypress()` helper temporarily switches stdin into raw mode for one
 * read, which gives us immediate hotkeys without keeping a background listener
 * attached while prompts or editors need the terminal.
 * Ref: https://cliffy.io/docs/v1.0.0-rc.4/keypress
 *
 * @returns One of the supported action keys, or `null` for ignored keys.
 */
async function readInteractiveAction(): Promise<string | null> {
  const event = await keypress();
  return normalizeInteractiveAction(event.key, event.ctrlKey);
}

/**
 * Open a user-configured editor and wait for it to exit.
 *
 * @param path - File path to open.
 * @returns A promise that resolves when the editor exits.
 */
async function openEditor(path: string) {
  const editor = Deno.env.get("EDITOR");
  if (!editor) {
    throw new Error("EDITOR is not set; cannot open an editor interactively.");
  }

  // We intentionally invoke the editor through the shell so users can set
  // compound commands like `code --wait` or `nvim +'set ft=json'`.
  const command = new Deno.Command("sh", {
    args: ["-lc", `${editor} ${shellQuote(path)}`],
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  await command.output();
}

/**
 * Let the user edit the current replay input as JSON in their editor.
 *
 * @param currentInput - Current replay payload.
 * @returns The parsed JSON object saved by the editor.
 */
async function editJsonInput(currentInput: Record<string, unknown>) {
  const tempFile = await Deno.makeTempFile({ suffix: ".json" });
  await Deno.writeTextFile(tempFile, JSON.stringify(currentInput, null, 2));

  try {
    await openEditor(tempFile);
    const raw = await Deno.readTextFile(tempFile);
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Interactive input must be a JSON object.");
    }
    return parsed as Record<string, unknown>;
  } finally {
    try {
      await Deno.remove(tempFile);
    } catch {
      // Temp-file cleanup failures are harmless and should not interrupt the
      // interactive session.
    }
  }
}

/**
 * Load the newest replayable trace input for a pipe.
 *
 * @param projectName - Pipedown project name.
 * @param pipeName - Sanitized pipe identity used in trace directories.
 * @returns The latest replayable input, or `{}` when no trace is usable.
 */
async function loadLatestReplayInput(
  projectNames: string[],
  pipeNames: string[],
): Promise<Record<string, unknown>> {
  const latest = await latestTraceForAliases(projectNames, pipeNames);
  if (!latest) return {};

  try {
    const trace = await readTrace(latest.filePath);
    return extractReplayableInput(trace);
  } catch {
    return {};
  }
}

/**
 * Build just the selected pipe and execute it with tracing enabled.
 *
 * @param input - Original CLI input object.
 * @param target - Interactive markdown target.
 * @param replayInput - Replay payload to pass into the run.
 */
async function buildAndRunOnce(
  input: CliInput,
  target: InteractiveTarget,
  replayInput: Record<string, unknown>,
) {
  // Build only the requested markdown file so the interactive loop stays fast
  // and unrelated pipes are not rebuilt on every save.
  await pdBuild(Object.assign({}, input, {
    match: escapeRegExp(target.path),
  }));

  notifyTauri({
    type: "run_start",
    title: "Interactive Pipe Run Started",
    message: target.pipeName,
    pipe: target.pipeName,
    success: true,
  });

  await pdRun({
    scriptName: target.pipeName,
    testInput: JSON.stringify(replayInput),
    entryPoint: "trace.ts",
  });

  notifyTauri({
    type: "run_complete",
    title: "Interactive Pipe Run Complete",
    message: target.pipeName,
    pipe: target.pipeName,
    success: true,
  });
}

/**
 * Prompt the user to choose a replayable input from trace history.
 *
 * Cliffy's Select prompt gives us a compact searchable chooser while keeping
 * the implementation small. We preselect the latest trace's replayable input
 * when it exists so `s` behaves like "start from the most recent good input,
 * unless I explicitly choose something older."
 * Ref: https://cliffy.io/docs/v1.0.0-rc.3/prompt
 *
 * @param projectName - Pipedown project name.
 * @param pipeName - Sanitized pipe identity used in trace directories.
 * @returns The selected replay input, or `null` when the current input should stay.
 */
async function chooseReplayInput(
  projectNames: string[],
  pipeNames: string[],
): Promise<Record<string, unknown> | null> {
  const recent = await recentTracesForAliases(
    projectNames,
    pipeNames,
    50,
  );
  const choices: ReplayableInputChoice[] = [];

  for (const trace of recent) {
    try {
      const payload = await readTrace(trace.filePath) as { input?: unknown };
      const replayable = extractReplayableInput(payload);
      if (Object.keys(replayable).length === 0) continue;

      choices.push({
        label: `${trace.timestamp} — ${JSON.stringify(replayable)}`,
        timestamp: trace.timestamp,
        input: replayable,
      });
    } catch {
      // Ignore unreadable trace files so one partial trace does not poison the
      // whole selector.
    }
  }

  const deduped = dedupeReplayableInputs(choices);
  if (deduped.length === 0) {
    console.log(
      std.colors.brightYellow(
        "No reusable trace input found; keeping the current input.",
      ),
    );
    return null;
  }

  const latestReplayInput = await loadLatestReplayInput(
    projectNames,
    pipeNames,
  );
  const defaultChoice = findReplayableInputChoice(
    deduped,
    latestReplayInput,
  );

  const selected = await Select.prompt<ReplayableInputChoice | null>({
    message: "Choose replay input",
    hint: defaultChoice
      ? "Defaults to the latest trace input for this pipe."
      : "Use arrows to pick a past input, or keep the current one.",
    search: true,
    info: true,
    maxRows: 12,
    default: defaultChoice ?? null,
    options: [
      {
        name: "Keep current input",
        value: null,
      },
      ...deduped.map((choice) => ({
        name: choice.label,
        value: choice,
      })),
    ],
  });

  return selected?.input ?? null;
}

// ── Main interactive loop ─────────────────────────────────────────────────────

/**
 * Build, replay, and hot-reload a single markdown pipe from the terminal.
 *
 * The workflow stays intentionally small: reuse the existing build/run path,
 * layer immediate hotkeys on top with Cliffy keypress support, and redraw a
 * tiny footer so the available actions stay visible between runs.
 *
 * @param input - Parsed CLI input.
 * @returns The same input object for CLI pipeline compatibility.
 */
export async function interactiveRun(input: CliInput) {
  const requested = String(input.flags._[1] ?? "").trim();
  const target = resolveInteractiveTarget(requested, input.projectPipes);
  if (!target) {
    console.error("Error: missing required markdown file argument.");
    return input;
  }

  const noTraceFlag = Deno.args.includes("--no-trace") ||
    Boolean(pd.$p.get(input, "/flags/no-trace"));
  const configTrace = input.globalConfig?.trace;
  if (noTraceFlag || configTrace === false) {
    console.error(
      "Error: interactive mode requires tracing. Remove --no-trace and/or enable trace in config.",
    );
    return input;
  }

  if (!Deno.stdin.isTerminal()) {
    console.error("Error: interactive mode requires a terminal (TTY).");
    return input;
  }

  const projectAliases = [
    input.globalConfig?.name,
    std.parsePath(Deno.cwd()).name,
  ].filter((value): value is string => Boolean(value && value.trim()));
  const footer = new InteractiveFooter();

  let pipeAliases = await loadTracePipeAliases(target);
  let currentInput = await loadLatestReplayInput(projectAliases, pipeAliases);
  let lastTrace: { filePath: string; timestamp: string } | null = null;
  let lastStatus = "Preparing initial run...";
  let running = false;
  let uiBusy = false;
  let rerunRequested = false;
  let queuedReason = "queued rerun";
  let watcherClosed = false;

  /**
   * Render the idle footer after any action that returns control to the hotkey
   * loop.
   */
  const renderIdleFooter = () => {
    footer.render(lastStatus, currentInput);
  };

  /**
   * Queue a rerun while the editor/prompt is active or another run is already
   * in progress. Only the most recent reason matters.
   */
  const queueRerun = (reason: string) => {
    rerunRequested = true;
    queuedReason = reason;
  };

  /**
   * Execute the pending queued rerun, if any.
   *
   * @returns True when a rerun was started.
   */
  const flushQueuedRerun = async (): Promise<boolean> => {
    if (!rerunRequested || running || uiBusy) return false;

    const reason = queuedReason;
    rerunRequested = false;
    queuedReason = "queued rerun";
    await runNow(reason);
    return true;
  };

  /**
   * Build + run immediately, then restore the footer once stdout goes quiet.
   *
   * @param reason - Human-readable reason shown in the rerun banner.
   */
  const runNow = async (reason: string) => {
    if (running || uiBusy) {
      queueRerun(reason);
      if (running) {
        footer.clear();
        console.log(
          std.colors.brightYellow(
            "⏳ Another rerun is already in progress; queued one more pass.",
          ),
        );
      }
      return;
    }

    footer.clear();
    running = true;

    try {
      console.log(formatRerunBanner(reason));
      await playPipeDownAnimation(reason);
      await buildAndRunOnce(input, target, currentInput);
      pipeAliases = await loadTracePipeAliases(target);
      lastTrace = await latestTraceForAliases(projectAliases, pipeAliases);
      lastStatus = lastTrace
        ? `Ready — latest trace ${lastTrace.timestamp}`
        : "Ready — run completed without a readable trace";

      if (lastTrace) {
        console.log(
          std.colors.brightCyan(`Latest trace: ${lastTrace.filePath}`),
        );
      }
    } catch (error) {
      lastStatus = `Last run failed — ${(error as Error).message}`;
      console.error(
        std.colors.brightRed(
          `Interactive run failed: ${(error as Error).message}`,
        ),
      );
    } finally {
      running = false;
    }

    if (rerunRequested) {
      await flushQueuedRerun();
      return;
    }

    renderIdleFooter();
  };

  /**
   * Request a rerun from a watcher or command action.
   *
   * @param reason - Human-readable rerun reason.
   */
  const requestRerun = async (reason: string) => {
    if (running || uiBusy) {
      queueRerun(reason);
      return;
    }
    await runNow(reason);
  };

  const rerunDebounced = std.debounce((reason: string) => {
    void requestRerun(reason);
  }, 250);

  console.log(std.colors.brightCyan(`Interactive pipe: ${target.path}`));
  await runNow("initial run");

  const targetAbsolutePath = toAbsoluteInteractivePath(target.path);
  const watcher = Deno.watchFs(std.dirname(targetAbsolutePath), {
    recursive: false,
  });
  const watcherTask = (async () => {
    for await (const event of watcher) {
      if (watcherClosed) break;

      // Editors often save by rename/write rather than a plain modify, so we
      // treat all content-changing events as rerun triggers.
      // Ref: https://docs.deno.com/api/deno/~/Deno.watchFs

      if (
        (event.kind === "modify" ||
          event.kind === "create" ||
          event.kind === "remove",
          event.kind === "rename") &&
        eventTouchesInteractiveTarget(targetAbsolutePath, event.paths)
      ) {
        rerunDebounced(`file changed (${event.kind})`);
      }
    }
  })();

  while (true) {
    const action = await readInteractiveAction();
    if (!action) continue;

    if (action === "q") {
      footer.clear();
      break;
    }

    if (action === "r") {
      await runNow("manual rerun");
      continue;
    }

    if (action === "i") {
      footer.clear();
      uiBusy = true;
      let inputUpdated = false;
      try {
        currentInput = await editJsonInput(currentInput);
        inputUpdated = true;
        lastStatus = "Replay input updated from editor";
      } catch (error) {
        lastStatus = `Input edit failed — ${(error as Error).message}`;
        console.error(
          std.colors.brightRed(
            `Could not update replay input: ${(error as Error).message}`,
          ),
        );
      } finally {
        uiBusy = false;
      }

      if (await flushQueuedRerun()) continue;
      if (!inputUpdated) {
        renderIdleFooter();
        continue;
      }
      await runNow("edited input");
      continue;
    }

    if (action === "s") {
      footer.clear();
      uiBusy = true;
      let chosen: Record<string, unknown> | null = null;
      try {
        pipeAliases = await loadTracePipeAliases(target);
        chosen = await chooseReplayInput(projectAliases, pipeAliases);
      } catch (error) {
        lastStatus = `Replay input chooser failed — ${
          (error as Error).message
        }`;
        console.error(
          std.colors.brightRed(
            `Could not choose a replay input: ${(error as Error).message}`,
          ),
        );
      } finally {
        uiBusy = false;
      }

      if (chosen) {
        currentInput = chosen;
        lastStatus = "Replay input selected from trace history";
        if (await flushQueuedRerun()) continue;
        await runNow("selected past input");
        continue;
      }

      if (await flushQueuedRerun()) continue;
      lastStatus = "Keeping the current replay input";
      renderIdleFooter();
      continue;
    }

    if (action === "e") {
      footer.clear();
      uiBusy = true;
      try {
        await openEditor(target.path);
        lastStatus = "Pipe editor closed — waiting for save or rerun";
      } catch (error) {
        lastStatus = `Pipe editor failed — ${(error as Error).message}`;
        console.error(
          std.colors.brightRed(
            `Could not open the pipe editor: ${(error as Error).message}`,
          ),
        );
      } finally {
        uiBusy = false;
      }

      if (await flushQueuedRerun()) continue;
      renderIdleFooter();
      continue;
    }

    if (action === "t") {
      footer.clear();

      pipeAliases = await loadTracePipeAliases(target);
      const trace = await latestTraceForAliases(projectAliases, pipeAliases);
      if (!trace) {
        lastStatus = "No trace found yet";
        renderIdleFooter();
        continue;
      }

      lastTrace = trace;
      try {
        const payload = await readTrace(trace.filePath);
        console.log(JSON.stringify(payload, null, 2));
        lastStatus = `Showing latest trace ${trace.timestamp}`;
      } catch (error) {
        lastStatus = `Could not read latest trace — ${
          (error as Error).message
        }`;
        console.error(
          std.colors.brightRed(
            `Could not read trace: ${(error as Error).message}`,
          ),
        );
      }

      renderIdleFooter();
      continue;
    }

    lastStatus = `Ignored key: ${action}`;
    renderIdleFooter();
  }

  watcherClosed = true;
  watcher.close();
  await watcherTask.catch(() => undefined);
  return input;
}
