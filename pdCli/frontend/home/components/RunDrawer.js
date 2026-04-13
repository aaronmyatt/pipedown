// ── RunDrawer Component ──
// Right-hand sliding drawer panel that displays output from all operations
// (pipe runs, step runs, LLM actions, tests, pack) AND an interactive JSON
// editor for custom pipeline input.
//
// The drawer operates in two modes controlled by PD.state.drawerMode:
//   - null (default): shows operation output (streaming text, jsonTree, errors)
//   - "input": shows a JSON textarea where the user can define custom input
//     and execute the pipe with it
//
// The drawer is always in the DOM (required for the CSS slide transition)
// but lives offscreen via `transform: translateX(100%)` when closed. The
// `.open` class slides it into view.
//
// Ref: Mithril lifecycle hooks — https://mithril.js.org/lifecycle-methods.html

PD.components.RunDrawer = {
  // ── oncreate ──
  // Register a global keydown listener so the user can press Escape to
  // close the drawer. We store the handler on the vnode's state object
  // so onremove can deregister the exact same function reference.
  oncreate: function (vnode) {
    vnode.state._onKeyDown = function (e) {
      if (e.key === "Escape" && PD.state.drawerOpen) {
        PD.actions.closeDrawer();
        // Also clear input mode so reopening doesn't show stale editor state.
        PD.state.drawerMode = null;
        // Mithril auto-redraws after DOM event handlers, but this keydown
        // is registered on document (outside Mithril's event delegation),
        // so we trigger a manual synchronous redraw.
        // Ref: https://mithril.js.org/redraw.html#mredrawsync
        m.redraw.sync();
      }
    };
    document.addEventListener("keydown", vnode.state._onKeyDown);
  },

  // ── onremove ──
  // Clean up the global keydown listener to prevent memory leaks.
  onremove: function (vnode) {
    document.removeEventListener("keydown", vnode.state._onKeyDown);
  },

  // ── onupdate ──
  // Auto-scroll the drawer body to the bottom while an operation is still
  // running so the user always sees the latest output as it streams in.
  // Once the operation finishes ("done" or "error") we stop scrolling so
  // the user can freely scroll up through the output.
  // Skip auto-scroll in input editor mode — the user is typing, not watching.
  onupdate: function (vnode) {
    if (
      PD.state.drawerStatus === "running" && PD.state.drawerMode !== "input"
    ) {
      const body = vnode.dom.querySelector(".run-drawer-body");
      if (body) {
        body.scrollTop = body.scrollHeight;
      }
    }
  },

  view: function () {
    // Always render the wrapper div so CSS transitions work. The `.open`
    // class controls visibility via transform.
    const isOpen = PD.state.drawerOpen;
    const isInputMode = PD.state.drawerMode === "input";

    // ── Input editor mode ──
    // When the user opened "Custom Input...", render the JSON editor view
    // with a textarea, validation status, and a Run button.
    if (isInputMode) {
      // Wrap backdrop + drawer in a single container div because Mithril
      // components must return one vnode (arrays are not supported).
      // Both children use position: fixed so the wrapper doesn't affect layout.
      return m("div", [
        // ── Backdrop ──
        // Clicking outside the drawer (on this overlay) closes it.
        // Only rendered when the drawer is open so it doesn't block
        // interaction with the rest of the page when hidden.
        // Ref: styles.css .drawer-backdrop
        isOpen
          ? m(".drawer-backdrop", {
            onclick: function () {
              PD.actions.closeDrawer();
              PD.state.drawerMode = null;
            },
          })
          : null,
        m(".run-drawer", { class: isOpen ? "open" : "" }, [
          m("div.run-drawer-header", [
            m("span.run-drawer-label", PD.state.drawerLabel || "Custom Input"),
            m("button.run-drawer-close", {
              onclick: function () {
                PD.actions.closeDrawer();
                PD.state.drawerMode = null;
              },
              title: "Close drawer (Esc)",
            }, "\u00D7"),
          ]),
          m(".run-drawer-body", {
            style: "display: flex; flex-direction: column;",
          }, PD.utils.drawerInputEditorContent()),
        ]),
      ]);
    }

    // ── Normal output mode ──
    // Build the status indicator string that appears next to the label.
    // When an error occurs and we have structured error info, include the
    // HTTP status code for quick identification (e.g. "(error 500)").
    let statusText = "";
    const isError = PD.state.drawerStatus === "error";
    if (PD.state.drawerStatus === "running") statusText = " ...";
    if (PD.state.drawerStatus === "done") statusText = " (done)";
    if (isError) {
      const errStatus = PD.state.drawerError && PD.state.drawerError.status;
      statusText = errStatus ? " (error " + errStatus + ")" : " (error)";
    }

    // Build the CSS class string. The header gets a red-tinted background
    // when in error state via the run-drawer-header--error modifier class.
    const headerClass = isError
      ? "run-drawer-header run-drawer-header--error"
      : "run-drawer-header";

    // Use a static selector (".run-drawer") and a dynamic `class` attr for
    // the "open" toggle. In Mithril v2 the `class` attr is merged with
    // selector classes. Changing the selector string between renders
    // (e.g. ".run-drawer" → ".run-drawer.open") can confuse the vdom diff
    // and prevent class updates from reaching the DOM.
    // Ref: https://mithril.js.org/hyperscript.html#css-selectors
    // Wrap backdrop + drawer in a single container div because Mithril
    // components must return one vnode (arrays are not supported).
    // Both children use position: fixed so the wrapper doesn't affect layout.
    return m("div", [
      // ── Backdrop ──
      // Clicking outside the drawer (on this overlay) closes it.
      // Only rendered when open to avoid blocking clicks in the main UI.
      // Ref: styles.css .drawer-backdrop
      isOpen
        ? m(".drawer-backdrop", {
          onclick: function () {
            PD.actions.closeDrawer();
          },
        })
        : null,
      m(".run-drawer", { class: isOpen ? "open" : "" }, [
        m("div", { class: headerClass }, [
          m("span.run-drawer-label", [
            PD.state.drawerLabel,
            statusText,
          ]),
          m("button.run-drawer-close", {
            onclick: function () {
              PD.actions.closeDrawer();
            },
            title: "Close drawer (Esc)",
          }, "\u00D7"),
        ]),
        m(".run-drawer-body", PD.utils.drawerBodyContent()),
      ]),
    ]);
  },
};

// ── drawerInputEditorContent ──
// Renders the JSON editor view inside the drawer body when drawerMode is
// "input". Contains:
//   1. A brief instruction line
//   2. A <textarea> bound to PD.state.drawerInputBuffer
//   3. Real-time JSON validation feedback
//   4. A "Run" primary button that parses and executes
//   5. Clickable history items below for quick selection
//
// The textarea uses Tab to insert spaces (like the markdown editor) and
// Cmd/Ctrl+Enter as a shortcut to execute.
// Ref: https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key
PD.utils.drawerInputEditorContent = function () {
  // Validate the current buffer in real-time so the user sees parse errors
  // before clicking Run.
  let validationResult = null;
  try {
    JSON.parse(PD.state.drawerInputBuffer);
    validationResult = { valid: true };
  } catch (e) {
    validationResult = { valid: false, message: e.message };
  }

  // Check if the drawer has a non-input error to display (e.g. from a failed
  // parse attempt via executeFromDrawer).
  const parseError =
    PD.state.drawerError && PD.state.drawerError.statusText === "Invalid JSON"
      ? PD.state.drawerError.message
      : null;

  const sections = [];

  // ── Instruction ──
  sections.push(m(
    "div",
    {
      style:
        "font-family: var(--font-sans); font-size: var(--font-size-0); color: var(--text-2); margin-block-end: var(--size-2);",
    },
    "Enter JSON to use as pipeline input. Select a past input below or edit freely.",
  ));

  // ── Textarea ──
  // The textarea is the primary input surface. It supports Tab for indent
  // and Cmd/Ctrl+Enter to run.
  sections.push(m("textarea.input-editor-textarea", {
    value: PD.state.drawerInputBuffer,
    oninput: function (e) {
      PD.state.drawerInputBuffer = e.target.value;
      // Clear any previous parse error when the user types.
      if (
        PD.state.drawerError &&
        PD.state.drawerError.statusText === "Invalid JSON"
      ) {
        PD.state.drawerError = null;
      }
    },
    onkeydown: function (e) {
      // Tab inserts two spaces instead of moving focus — same behaviour
      // as the markdown editor for consistency.
      // Ref: https://developer.mozilla.org/en-US/docs/Web/API/HTMLTextAreaElement/selectionStart
      if (e.key === "Tab") {
        e.preventDefault();
        const ta = e.target;
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        PD.state.drawerInputBuffer =
          PD.state.drawerInputBuffer.substring(0, start) +
          "  " +
          PD.state.drawerInputBuffer.substring(end);
        // Mithril will update the textarea value on next redraw, but we need
        // to restore cursor position after that redraw.
        requestAnimationFrame(function () {
          ta.selectionStart = ta.selectionEnd = start + 2;
        });
      }
      // Cmd/Ctrl+Enter runs the pipe with the current input.
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        PD.actions.executeFromDrawer();
      }
    },
    placeholder: '{\n  "key": "value"\n}',
    spellcheck: false,
  }));

  // ── Validation status ──
  if (parseError) {
    sections.push(
      m("div.input-editor-status.input-editor-status--error", parseError),
    );
  } else if (!validationResult.valid) {
    sections.push(
      m(
        "div.input-editor-status.input-editor-status--error",
        validationResult.message,
      ),
    );
  } else {
    sections.push(
      m(
        "div.input-editor-status.input-editor-status--valid",
        "\u2713 Valid JSON",
      ),
    );
  }

  // ── Action bar ──
  sections.push(m("div.input-editor-actions", [
    m("button.tb-btn", {
      onclick: function () {
        PD.actions.closeDrawer();
        PD.state.drawerMode = null;
      },
    }, "Cancel"),
    m(
      "button.tb-btn.primary",
      {
        onclick: PD.actions.executeFromDrawer,
        disabled: !validationResult.valid,
        title: validationResult.valid
          ? "Run with this input (Cmd+Enter)"
          : "Fix JSON errors first",
      },
      PD.state.drawerInputTarget != null
        ? "Run to step " + PD.state.drawerInputTarget
        : "Run Pipe",
    ),
  ]));

  // ── Past inputs quick-pick ──
  // Show clickable history items below the editor so the user can load
  // a past input into the textarea with one click.
  const history = PD.state.inputHistory;
  if (history && history.length > 0) {
    sections.push(m("div", {
      style:
        "margin-block-start: var(--size-3); border-block-start: var(--border-size-1) solid var(--surface-3); padding-block-start: var(--size-2);",
    }, [
      m("div", {
        style:
          "font-family: var(--font-sans); font-size: var(--font-size-0); color: var(--text-2); margin-block-end: var(--size-1); font-weight: var(--font-weight-5);",
      }, "Past inputs"),
      history.map(function (inputObj, _i) {
        return m("button.dropdown-item.input-history-item", {
          title: "Click to load into editor",
          onclick: function () {
            // Load the selected past input into the textarea for editing
            // rather than executing immediately — the user opened the editor
            // because they want to review/modify before running.
            PD.state.drawerInputBuffer = JSON.stringify(inputObj, null, 2);
            // Clear any stale parse errors.
            if (
              PD.state.drawerError &&
              PD.state.drawerError.statusText === "Invalid JSON"
            ) {
              PD.state.drawerError = null;
            }
          },
        }, m("code.input-preview", PD.utils.inputPreview(inputObj)));
      }),
    ]));
  }

  return sections;
};

// ── drawerBodyContent ──
// Decides what to render inside the drawer body based on the current state.
// Priority:
//   1. While streaming ("running") → raw text so the user sees live output
//   2. When done + trace data available → structured jsonTree of input/output
//   3. When done + parsed JSON available → jsonTree of the stdout output
//   4. Fallback → raw text output
//
// Uses pd.jsonTree() — the shared collapsible JSON tree viewer that returns
// Mithril vnodes. Each tree instance gets a unique rootPath so expand/collapse
// state is isolated.
// Ref: pdCli/frontend/shared/jsonTree.js
PD.utils.drawerBodyContent = function () {
  // While running, show live streaming text. ANSI escape codes (bold, colour)
  // are converted to styled HTML via pd.ansiToHtml() so Deno error output
  // renders with proper formatting instead of raw escape sequences.
  // m.trust() tells Mithril to inject the pre-sanitised HTML string directly.
  //
  // IMPORTANT: m.trust() content is wrapped in a <div> container so Mithril
  // can cleanly swap/remove it during vdom diffing. Without the wrapper,
  // transitioning from m.trust() to regular vnodes (e.g. when the operation
  // finishes or the drawer closes) causes a "removeChild" error because the
  // browser's HTML parser may restructure the trusted HTML, making the DOM
  // tree diverge from what Mithril's diff algorithm expects.
  // Ref: https://mithril.js.org/trust.html#avoid-trusting-html
  if (PD.state.drawerStatus === "running") {
    const runningText = PD.state.drawerOutput;
    if (!runningText) return m("div", "Running...");
    return m("div", m.trust(pd.ansiToHtml(runningText)));
  }

  // ── Error display ──
  // When an operation fails (HTTP error, network error, or stream error),
  // render a structured error panel with status code, message, and optional
  // raw output for partial stream errors.
  if (PD.state.drawerStatus === "error" && PD.state.drawerError) {
    const err = PD.state.drawerError;
    const sections = [];

    // Title row: warning indicator + "Request Failed" + optional HTTP badge.
    const titleChildren = [
      m("span.drawer-error-icon", "\u26A0"),
      m("span", " Request Failed"),
    ];
    // Show the HTTP status code as an inline badge when available.
    // A status of 0 indicates a network-level failure (DNS, CORS, etc.)
    // rather than an HTTP response, so we show "Network" instead.
    if (err.status) {
      titleChildren.push(
        m("span.drawer-error-status", err.status + " " + err.statusText),
      );
    } else {
      titleChildren.push(
        m("span.drawer-error-status", err.statusText || "Network Error"),
      );
    }
    sections.push(m("div.drawer-error-title", titleChildren));

    // Error message body — ANSI codes stripped / styled for readability.
    // Wrapped in a nested div so m.trust() has a stable parent for diffing.
    sections.push(
      m(
        "div.drawer-error-message",
        m("div", m.trust(pd.ansiToHtml(err.message))),
      ),
    );

    // If the drawer accumulated partial output before the error (e.g. a
    // stream that broke mid-transfer), show it in a collapsible section
    // so the user can inspect what arrived before the failure.
    const rawOutput = PD.state.drawerOutput;
    if (rawOutput && rawOutput !== err.message) {
      sections.push(m("details.drawer-error-details", [
        m("summary", "Raw output"),
        m("pre", m("span", m.trust(pd.ansiToHtml(rawOutput)))),
      ]));
    }

    return m("div.drawer-error-panel", sections);
  }

  // ── Trace data (richest view) ──
  // After a run completes, loadDrawerTrace fetches the most recent trace
  // which contains the pipeline's structured input and output objects,
  // plus duration and step count metadata.
  const trace = PD.state.drawerTrace;
  if (trace) {
    const sections = [];

    // Metadata line: duration and step count.
    const meta = [];
    if (trace.durationMs != null) meta.push(trace.durationMs.toFixed(1) + "ms");
    if (trace.stepsTotal != null) meta.push(trace.stepsTotal + " steps");
    if (meta.length > 0) {
      sections.push(m("div", {
        style:
          "color: var(--text-2); font-size: var(--font-size-0); margin-block-end: var(--size-3);",
      }, meta.join(" · ")));
    }

    // Output tree — the pipeline's final state after all steps ran.
    if (trace.output != null && typeof trace.output === "object") {
      sections.push(m("div", { style: "margin-block-end: var(--size-3);" }, [
        m("strong", {
          style:
            "font-size: var(--font-size-0); display: block; margin-block-end: var(--size-1);",
        }, "Output"),
        pd.jsonTree(trace.output, "drawer-trace-output"),
      ]));
    }

    // Input tree — the pipeline's initial state before any steps ran.
    if (trace.input != null && typeof trace.input === "object") {
      sections.push(m("div", { style: "margin-block-end: var(--size-3);" }, [
        m("strong", {
          style:
            "font-size: var(--font-size-0); display: block; margin-block-end: var(--size-1);",
        }, "Input"),
        pd.jsonTree(trace.input, "drawer-trace-input"),
      ]));
    }

    if (sections.length > 0) return sections;
  }

  // ── Parsed stdout output ──
  // If the run output was valid JSON but no trace is available yet,
  // render the parsed object as a jsonTree.
  const parsed = PD.state.drawerParsedOutput;
  if (parsed != null && typeof parsed === "object") {
    return pd.jsonTree(parsed, "drawer-output");
  }

  // ── Raw text fallback ──
  // Non-JSON output (e.g. LLM text streaming, test runner output).
  // ANSI escape codes are converted to styled HTML so Deno compiler errors
  // (bold red "error:" prefix, underline markers, etc.) render legibly.
  // Wrapped in a div for stable vdom diffing (same reason as the running state).
  const rawText = PD.state.drawerOutput;
  if (!rawText) return m("div");
  return m("div", m.trust(pd.ansiToHtml(rawText)));
};
