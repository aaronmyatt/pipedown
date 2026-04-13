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
  oncreate: function(vnode) {
    vnode.state._onKeyDown = function(e) {
      if (e.key === "Escape" && PD.state.drawerOpen) {
        PD.actions.closeDrawer();
        // Clear input/proposal mode so reopening doesn't show stale state.
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
  onremove: function(vnode) {
    document.removeEventListener("keydown", vnode.state._onKeyDown);
  },

  // ── onupdate ──
  // Auto-scroll the drawer body to the bottom while an operation is still
  // running so the user always sees the latest output as it streams in.
  // Once the operation finishes ("done" or "error") we stop scrolling so
  // the user can freely scroll up through the output.
  // Skip auto-scroll in input editor mode — the user is typing, not watching.
  onupdate: function(vnode) {
    if (PD.state.drawerStatus === "running" && PD.state.drawerMode !== "input") {
      const body = vnode.dom.querySelector(".run-drawer-body");
      if (body) {
        body.scrollTop = body.scrollHeight;
      }
    }
  },

  view: function() {
    // Always render the wrapper div so CSS transitions work. The `.open`
    // class controls visibility via transform.
    var isOpen = PD.state.drawerOpen;
    var isInputMode = PD.state.drawerMode === "input";
    var isProposalMode = PD.state.drawerMode === "proposal";

    // ── Proposal review mode ──
    // When a Pi proposal is active, render the proposal review view
    // with summary, rationale, operations, and action buttons.
    // Ref: WEB_FIRST_WORKFLOW_PLAN.md §6.5 — apply flow
    if (isProposalMode) {
      return m("div", [
        isOpen ? m(".drawer-backdrop", {
          onclick: function() {
            PD.actions.closeDrawer();
            PD.state.drawerMode = null;
          }
        }) : null,
        m(".run-drawer", { class: isOpen ? "open" : "" }, [
          m("div.run-drawer-header", [
            m("span.run-drawer-label", PD.state.drawerLabel || "Pi Proposal"),
            m("button.run-drawer-close", {
              onclick: function() {
                PD.actions.closeDrawer();
                PD.state.drawerMode = null;
              },
              title: "Close drawer (Esc)"
            }, "\u00D7")
          ]),
          m(".run-drawer-body", PD.utils.drawerProposalContent())
        ])
      ]);
    }

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
        isOpen ? m(".drawer-backdrop", {
          onclick: function() {
            PD.actions.closeDrawer();
            PD.state.drawerMode = null;
          }
        }) : null,
        m(".run-drawer", { class: isOpen ? "open" : "" }, [
          m("div.run-drawer-header", [
            m("span.run-drawer-label", PD.state.drawerLabel || "Custom Input"),
            m("button.run-drawer-close", {
              onclick: function() {
                PD.actions.closeDrawer();
                PD.state.drawerMode = null;
              },
              title: "Close drawer (Esc)"
            }, "\u00D7")
          ]),
          m(".run-drawer-body", { style: "display: flex; flex-direction: column;" },
            PD.utils.drawerInputEditorContent()
          )
        ])
      ]);
    }

    // ── Normal output mode ──
    // Build the status indicator string that appears next to the label.
    // When an error occurs and we have structured error info, include the
    // HTTP status code for quick identification (e.g. "(error 500)").
    var statusText = "";
    var isError = PD.state.drawerStatus === "error";
    if (PD.state.drawerStatus === "running") statusText = " ...";
    if (PD.state.drawerStatus === "done")    statusText = " (done)";
    if (isError) {
      var errStatus = PD.state.drawerError && PD.state.drawerError.status;
      statusText = errStatus ? " (error " + errStatus + ")" : " (error)";
    }

    // Build the CSS class string. The header gets a red-tinted background
    // when in error state via the run-drawer-header--error modifier class.
    var headerClass = isError ? "run-drawer-header run-drawer-header--error" : "run-drawer-header";

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
      isOpen ? m(".drawer-backdrop", {
        onclick: function() { PD.actions.closeDrawer(); }
      }) : null,
      m(".run-drawer", { class: isOpen ? "open" : "" }, [
        m("div", { class: headerClass }, [
          m("span.run-drawer-label", [
            PD.state.drawerLabel,
            statusText
          ]),
          m("button.run-drawer-close", {
            onclick: function() { PD.actions.closeDrawer(); },
            title: "Close drawer (Esc)"
          }, "\u00D7")
        ]),
        m(".run-drawer-body", PD.utils.drawerBodyContent())
      ])
    ]);
  }
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
PD.utils.drawerInputEditorContent = function() {
  // Validate the current buffer in real-time so the user sees parse errors
  // before clicking Run.
  var validationResult = null;
  try {
    JSON.parse(PD.state.drawerInputBuffer);
    validationResult = { valid: true };
  } catch (e) {
    validationResult = { valid: false, message: e.message };
  }

  // Check if the drawer has a non-input error to display (e.g. from a failed
  // parse attempt via executeFromDrawer).
  var parseError = PD.state.drawerError && PD.state.drawerError.statusText === "Invalid JSON"
    ? PD.state.drawerError.message
    : null;

  var sections = [];

  // ── Instruction ──
  sections.push(m("div", {
    style: "font-family: var(--font-sans); font-size: var(--font-size-0); color: var(--text-2); margin-block-end: var(--size-2);"
  }, "Enter JSON to use as pipeline input. Select a past input below or edit freely."));

  // ── Textarea ──
  // The textarea is the primary input surface. It supports Tab for indent
  // and Cmd/Ctrl+Enter to run.
  sections.push(m("textarea.input-editor-textarea", {
    value: PD.state.drawerInputBuffer,
    oninput: function(e) {
      PD.state.drawerInputBuffer = e.target.value;
      // Clear any previous parse error when the user types.
      if (PD.state.drawerError && PD.state.drawerError.statusText === "Invalid JSON") {
        PD.state.drawerError = null;
      }
    },
    onkeydown: function(e) {
      // Tab inserts two spaces instead of moving focus — same behaviour
      // as the markdown editor for consistency.
      // Ref: https://developer.mozilla.org/en-US/docs/Web/API/HTMLTextAreaElement/selectionStart
      if (e.key === "Tab") {
        e.preventDefault();
        var ta = e.target;
        var start = ta.selectionStart;
        var end = ta.selectionEnd;
        PD.state.drawerInputBuffer =
          PD.state.drawerInputBuffer.substring(0, start) +
          "  " +
          PD.state.drawerInputBuffer.substring(end);
        // Mithril will update the textarea value on next redraw, but we need
        // to restore cursor position after that redraw.
        requestAnimationFrame(function() {
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
    spellcheck: false
  }));

  // ── Validation status ──
  if (parseError) {
    sections.push(m("div.input-editor-status.input-editor-status--error", parseError));
  } else if (!validationResult.valid) {
    sections.push(m("div.input-editor-status.input-editor-status--error", validationResult.message));
  } else {
    sections.push(m("div.input-editor-status.input-editor-status--valid", "\u2713 Valid JSON"));
  }

  // ── Action bar ──
  sections.push(m("div.input-editor-actions", [
    m("button.tb-btn", {
      onclick: function() {
        PD.actions.closeDrawer();
        PD.state.drawerMode = null;
      }
    }, "Cancel"),
    m("button.tb-btn.primary", {
      onclick: PD.actions.executeFromDrawer,
      disabled: !validationResult.valid,
      title: validationResult.valid ? "Run with this input (Cmd+Enter)" : "Fix JSON errors first"
    }, PD.state.drawerInputTarget != null
      ? "Run to step " + PD.state.drawerInputTarget
      : "Run Pipe"
    )
  ]));

  // ── Past inputs quick-pick ──
  // Show clickable history items below the editor so the user can load
  // a past input into the textarea with one click.
  var history = PD.state.inputHistory;
  if (history && history.length > 0) {
    sections.push(m("div", {
      style: "margin-block-start: var(--size-3); border-block-start: var(--border-size-1) solid var(--surface-3); padding-block-start: var(--size-2);"
    }, [
      m("div", {
        style: "font-family: var(--font-sans); font-size: var(--font-size-0); color: var(--text-2); margin-block-end: var(--size-1); font-weight: var(--font-weight-5);"
      }, "Past inputs"),
      history.map(function(inputObj, i) {
        return m("button.dropdown-item.input-history-item", {
          title: "Click to load into editor",
          onclick: function() {
            // Load the selected past input into the textarea for editing
            // rather than executing immediately — the user opened the editor
            // because they want to review/modify before running.
            PD.state.drawerInputBuffer = JSON.stringify(inputObj, null, 2);
            // Clear any stale parse errors.
            if (PD.state.drawerError && PD.state.drawerError.statusText === "Invalid JSON") {
              PD.state.drawerError = null;
            }
          }
        }, m("code.input-preview", PD.utils.inputPreview(inputObj)));
      })
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
// ── Session Summary Panel ──
// Renders a compact session overview at the top of the drawer body when an
// active session exists. Shows session metadata, a clickable mini status bar
// for each step, and expandable per-step before/after/delta details.
//
// This appears ABOVE the normal drawer output (streaming text, jsonTree, etc.)
// so the user gets session context alongside the raw operation output.
//
// Ref: pipedown.d.ts — RunSession, SessionStepRecord, StepStatus
// Ref: PD.utils.stepStatusSymbol, PD.utils.stepStatusClass in state.js
PD.utils.sessionSummaryPanel = function() {
  var session = PD.state.activeSession;

  // ── Loading state ──
  // Show a spinner when session data is being fetched.
  // Ref: WEB_FIRST_WORKFLOW_PLAN.md Phase 5 — loading states
  if (PD.state.sessionLoading && !session) {
    return m("div.session-summary-panel", {
      style: "border: 1px solid var(--surface-3); border-radius: var(--radius-2); padding: var(--size-3); margin-block-end: var(--size-3); background: var(--surface-1); text-align: center; color: var(--text-2);"
    }, [
      m("div", { style: "font-size: var(--font-size-1); margin-block-end: var(--size-1);" }, "\u23F3"),
      m("div", "Loading session\u2026")
    ]);
  }

  // ── Empty state ──
  // When no active session exists, show a helpful message.
  // Ref: WEB_FIRST_WORKFLOW_PLAN.md Phase 5 — empty states
  if (!session) {
    return m("div.session-summary-panel", {
      style: "border: 1px solid var(--surface-3); border-radius: var(--radius-2); padding: var(--size-3); margin-block-end: var(--size-3); background: var(--surface-1); text-align: center; color: var(--text-2);"
    }, [
      m("div", { style: "font-size: var(--font-size-0);" }, "No session yet. Run the pipe to create one."),
      // ── Session history toggle ──
      m("button.tb-btn", {
        style: "margin-block-start: var(--size-2); font-size: var(--font-size-00);",
        onclick: function() {
          PD.state.showSessionHistory = !PD.state.showSessionHistory;
          if (PD.state.showSessionHistory) {
            PD.actions.loadSessionHistory();
          }
        }
      }, PD.state.showSessionHistory ? "Hide sessions" : "\uD83D\uDCCB Sessions"),
      // Render session history inline when toggled
      PD.state.showSessionHistory ? PD.utils.sessionHistoryPanel() : null
    ]);
  }

  var sections = [];

  // ── Session metadata ──
  // Show truncated session ID, mode, and overall status.
  var shortId = session.sessionId
    ? session.sessionId.substring(0, 8) + "\u2026"
    : "unknown";

  // Determine status CSS modifier for color-coding.
  var statusColor = "var(--text-2)";
  if (session.status === "completed") statusColor = "var(--green-6)";
  if (session.status === "failed") statusColor = "var(--red-6)";
  if (session.status === "running") statusColor = "var(--yellow-6)";

  sections.push(
    m("div.session-summary-header", {
      style: "display: flex; align-items: center; gap: var(--size-2); font-size: var(--font-size-0); color: var(--text-2); margin-block-end: var(--size-2);"
    }, [
      m("span", { title: session.sessionId }, ["Session: ", m("code", shortId)]),
      m("span", " \u00B7 "),
      m("span", "Mode: " + (session.mode || "unknown")),
      m("span", " \u00B7 "),
      m("span", { style: "color: " + statusColor + "; font-weight: var(--font-weight-6);" }, session.status || "unknown"),
      // Continue button — only show when session is completed or failed,
      // meaning we can resume from the last completed step.
      (session.status === "completed" || session.status === "failed")
        ? m("button.tb-btn.session-btn", {
            onclick: PD.actions.continueSession,
            style: "margin-inline-start: auto; font-size: var(--font-size-00);",
            title: "Continue from last completed step"
          }, "\u25B6 Continue")
        : null,
      // ── Session history toggle ──
      // Opens a section showing recent sessions for this pipe.
      // Ref: WEB_FIRST_WORKFLOW_PLAN.md Phase 5 — session history
      m("button.tb-btn", {
        onclick: function() {
          PD.state.showSessionHistory = !PD.state.showSessionHistory;
          if (PD.state.showSessionHistory) {
            PD.actions.loadSessionHistory();
          }
        },
        style: "font-size: var(--font-size-00);",
        title: "Browse recent sessions"
      }, PD.state.showSessionHistory ? "Hide sessions" : "\uD83D\uDCCB Sessions")
    ])
  );

  // ── Per-step mini status bar ──
  // A row of small colored squares, one per step, showing each step's status.
  // Clicking a square expands that step's before/after/delta details below.
  if (session.steps && session.steps.length > 0) {
    sections.push(
      m("div.session-step-bar", {
        style: "display: flex; gap: 2px; margin-block-end: var(--size-2); flex-wrap: wrap;"
      }, session.steps.map(function(step, i) {
        var symbol = PD.utils.stepStatusSymbol(step.status);
        var cssClass = "session-step-dot " + PD.utils.stepStatusClass(step.status);

        // Determine step name from pipeData if available.
        var stepName = "Step " + i;
        if (PD.state.pipeData && PD.state.pipeData.steps && PD.state.pipeData.steps[i]) {
          stepName = PD.state.pipeData.steps[i].name || stepName;
        }

        return m("button", {
          key: "step-" + i,
          class: cssClass,
          title: stepName + " (" + step.status + ")",
          onclick: function(e) {
            e.stopPropagation();
            // Toggle expanded step detail. We use a state property to track
            // which step is expanded in the session panel.
            if (PD.state._sessionExpandedStep === i) {
              PD.state._sessionExpandedStep = null;
            } else {
              PD.state._sessionExpandedStep = i;
            }
            m.redraw();
          },
          style: "cursor: pointer; padding: 2px 6px; border: 1px solid var(--surface-3); border-radius: var(--radius-1); font-size: var(--font-size-00); line-height: 1; background: var(--surface-2);"
        }, symbol);
      }))
    );

    // ── Expanded step detail ──
    // When a step dot is clicked, show its before/after/delta in a
    // collapsible section. Snapshot data is stored as JSON strings in
    // the session step records (afterSnapshotRef, beforeSnapshotRef, deltaRef).
    var expandedIdx = PD.state._sessionExpandedStep;
    if (expandedIdx != null && session.steps[expandedIdx]) {
      var expandedStep = session.steps[expandedIdx];

      // Determine step name for the header.
      var expandedStepName = "Step " + expandedIdx;
      if (PD.state.pipeData && PD.state.pipeData.steps && PD.state.pipeData.steps[expandedIdx]) {
        expandedStepName = PD.state.pipeData.steps[expandedIdx].name || expandedStepName;
      }

      var stepDetail = [];
      stepDetail.push(m("div", {
        style: "font-weight: var(--font-weight-6); font-size: var(--font-size-0); margin-block-end: var(--size-1);"
      }, expandedStepName + " (" + expandedStep.status + ")"));

      // Duration info
      if (expandedStep.durationMs != null) {
        stepDetail.push(m("div", {
          style: "font-size: var(--font-size-00); color: var(--text-2); margin-block-end: var(--size-1);"
        }, expandedStep.durationMs.toFixed(1) + "ms"));
      }

      // Error info
      if (expandedStep.errorRef) {
        stepDetail.push(m("div", {
          style: "color: var(--red-6); font-size: var(--font-size-0); margin-block-end: var(--size-1);"
        }, "Error: " + expandedStep.errorRef));
      }

      // Before snapshot — parse from JSON string ref
      if (expandedStep.beforeSnapshotRef && expandedStep.beforeSnapshotRef !== "[present]") {
        try {
          var before = JSON.parse(expandedStep.beforeSnapshotRef);
          stepDetail.push(m("div", { style: "margin-block-end: var(--size-1);" }, [
            m("strong", { style: "font-size: var(--font-size-00);" }, "Before:"),
            pd.jsonTree(before, "session-step-" + expandedIdx + "-before")
          ]));
        } catch (_) { /* unparseable snapshot */ }
      }

      // After snapshot
      if (expandedStep.afterSnapshotRef && expandedStep.afterSnapshotRef !== "[present]") {
        try {
          var after = JSON.parse(expandedStep.afterSnapshotRef);
          stepDetail.push(m("div", { style: "margin-block-end: var(--size-1);" }, [
            m("strong", { style: "font-size: var(--font-size-00);" }, "After:"),
            pd.jsonTree(after, "session-step-" + expandedIdx + "-after")
          ]));
        } catch (_) { /* unparseable snapshot */ }
      }

      // Delta
      if (expandedStep.deltaRef && expandedStep.deltaRef !== "[present]") {
        try {
          var delta = JSON.parse(expandedStep.deltaRef);
          stepDetail.push(m("div", { style: "margin-block-end: var(--size-1);" }, [
            m("strong", { style: "font-size: var(--font-size-00);" }, "Delta:"),
            pd.jsonTree(delta, "session-step-" + expandedIdx + "-delta")
          ]));
        } catch (_) { /* unparseable delta */ }
      }

      sections.push(m("div.session-step-detail", {
        style: "background: var(--surface-1); border: 1px solid var(--surface-3); border-radius: var(--radius-2); padding: var(--size-2); margin-block-end: var(--size-2);"
      }, stepDetail));
    }
  }

  // ── Session history section (inline, toggled by Sessions button) ──
  if (PD.state.showSessionHistory) {
    sections.push(PD.utils.sessionHistoryPanel());
  }

  // Wrap the entire session panel in a bordered container.
  return m("div.session-summary-panel", {
    style: "border: 1px solid var(--surface-3); border-radius: var(--radius-2); padding: var(--size-2); margin-block-end: var(--size-3); background: var(--surface-1);"
  }, sections);
};

// ── sessionHistoryPanel ──
// Renders the session history section showing a compact list of recent sessions.
// Each session shows: truncated ID, mode, status, createdAt (relative time),
// and a step summary. Clicking a session sets it as activeSession.
//
// Ref: WEB_FIRST_WORKFLOW_PLAN.md Phase 5 — session history browsing
PD.utils.sessionHistoryPanel = function() {
  // ── Loading state ──
  if (PD.state.sessionHistoryLoading) {
    return m("div", {
      style: "padding: var(--size-2); text-align: center; color: var(--text-2); font-size: var(--font-size-00);"
    }, "Loading sessions\u2026");
  }

  var history = PD.state.sessionHistory;
  if (!history || history.length === 0) {
    return m("div", {
      style: "padding: var(--size-2); text-align: center; color: var(--text-2); font-size: var(--font-size-00);"
    }, "No sessions found.");
  }

  return m("div", {
    style: "margin-block-start: var(--size-2); border-block-start: 1px solid var(--surface-3); padding-block-start: var(--size-2);"
  }, [
    m("div", {
      style: "font-weight: var(--font-weight-6); font-size: var(--font-size-00); margin-block-end: var(--size-1); color: var(--text-2);"
    }, "Recent Sessions"),
    history.map(function(s, i) {
      // Truncate session ID to first 8 chars for compact display.
      var shortId = s.sessionId ? s.sessionId.substring(0, 8) + "\u2026" : "unknown";

      // Determine status colour for visual distinction.
      var statusColor = "var(--text-2)";
      if (s.status === "completed") statusColor = "var(--green-6)";
      if (s.status === "failed") statusColor = "var(--red-6)";
      if (s.status === "running") statusColor = "var(--yellow-6)";

      // Build a step summary: e.g. "3/5 done"
      var stepSummary = "";
      if (s.steps && s.steps.length > 0) {
        var done = s.steps.filter(function(st) { return st.status === "done"; }).length;
        stepSummary = done + "/" + s.steps.length + " steps";
      }

      // Determine if this is the currently active session.
      var isActive = PD.state.activeSession && PD.state.activeSession.sessionId === s.sessionId;

      return m("button", {
        key: "hist-" + s.sessionId,
        onclick: function(e) {
          e.stopPropagation();
          // Set this session as the active session and refresh its full data.
          PD.state.activeSession = s;
          PD.actions.refreshActiveSession();
          m.redraw();
        },
        style: [
          "display: flex;",
          "align-items: center;",
          "gap: var(--size-2);",
          "width: 100%;",
          "padding: var(--size-1) var(--size-2);",
          "border: 1px solid " + (isActive ? "var(--green-4)" : "var(--surface-3)") + ";",
          "background: " + (isActive ? "var(--green-1, var(--surface-2))" : "var(--surface-2)") + ";",
          "border-radius: var(--radius-1);",
          "cursor: pointer;",
          "font-size: var(--font-size-00);",
          "color: var(--text-1);",
          "margin-block-end: 2px;",
          "text-align: left;",
          "font-family: var(--font-sans);"
        ].join(" "),
        title: "Session " + s.sessionId
      }, [
        m("code", { style: "font-size: var(--font-size-00);" }, shortId),
        m("span", s.mode || ""),
        m("span", { style: "color: " + statusColor + "; font-weight: var(--font-weight-6);" }, s.status || ""),
        s.createdAt ? m("span", { style: "color: var(--text-2); opacity: 0.7;" }, pd.relativeTime(s.createdAt)) : null,
        stepSummary ? m("span", { style: "color: var(--text-2); margin-inline-start: auto;" }, stepSummary) : null
      ]);
    })
  ]);
};

PD.utils.drawerBodyContent = function() {
  // ── Session summary (always rendered first when present) ──
  // This appears above the normal output content (streaming text, jsonTree, etc.)
  // to provide session context alongside raw operation output.
  var sessionPanel = PD.utils.sessionSummaryPanel();

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
    var runningText = PD.state.drawerOutput;
    if (!runningText) return [sessionPanel, m("div", "Running...")];
    return [sessionPanel, m("div", m.trust(pd.ansiToHtml(runningText)))];
  }

  // ── Error display ──
  // When an operation fails (HTTP error, network error, or stream error),
  // render a structured error panel with status code, message, and optional
  // raw output for partial stream errors.
  if (PD.state.drawerStatus === "error" && PD.state.drawerError) {
    var err = PD.state.drawerError;
    var sections = [];

    // Title row: warning indicator + "Request Failed" + optional HTTP badge.
    var titleChildren = [
      m("span.drawer-error-icon", "\u26A0"),
      m("span", " Request Failed")
    ];
    // Show the HTTP status code as an inline badge when available.
    // A status of 0 indicates a network-level failure (DNS, CORS, etc.)
    // rather than an HTTP response, so we show "Network" instead.
    if (err.status) {
      titleChildren.push(
        m("span.drawer-error-status", err.status + " " + err.statusText)
      );
    } else {
      titleChildren.push(
        m("span.drawer-error-status", err.statusText || "Network Error")
      );
    }
    sections.push(m("div.drawer-error-title", titleChildren));

    // Error message body — ANSI codes stripped / styled for readability.
    // Wrapped in a nested div so m.trust() has a stable parent for diffing.
    sections.push(m("div.drawer-error-message", m("div", m.trust(pd.ansiToHtml(err.message)))));

    // If the drawer accumulated partial output before the error (e.g. a
    // stream that broke mid-transfer), show it in a collapsible section
    // so the user can inspect what arrived before the failure.
    var rawOutput = PD.state.drawerOutput;
    if (rawOutput && rawOutput !== err.message) {
      sections.push(m("details.drawer-error-details", [
        m("summary", "Raw output"),
        m("pre", m("span", m.trust(pd.ansiToHtml(rawOutput))))
      ]));
    }

    return [sessionPanel, m("div.drawer-error-panel", sections)];
  }

  // ── Trace data (richest view) ──
  // After a run completes, loadDrawerTrace fetches the most recent trace
  // which contains the pipeline's structured input and output objects,
  // plus duration and step count metadata.
  var trace = PD.state.drawerTrace;
  if (trace) {
    var sections = [];

    // Metadata line: duration and step count.
    var meta = [];
    if (trace.durationMs != null) meta.push(trace.durationMs.toFixed(1) + "ms");
    if (trace.stepsTotal != null) meta.push(trace.stepsTotal + " steps");
    if (meta.length > 0) {
      sections.push(m("div", {
        style: "color: var(--text-2); font-size: var(--font-size-0); margin-block-end: var(--size-3);"
      }, meta.join(" · ")));
    }

    // Output tree — the pipeline's final state after all steps ran.
    if (trace.output != null && typeof trace.output === "object") {
      sections.push(m("div", { style: "margin-block-end: var(--size-3);" }, [
        m("strong", { style: "font-size: var(--font-size-0); display: block; margin-block-end: var(--size-1);" }, "Output"),
        pd.jsonTree(trace.output, "drawer-trace-output")
      ]));
    }

    // Input tree — the pipeline's initial state before any steps ran.
    if (trace.input != null && typeof trace.input === "object") {
      sections.push(m("div", { style: "margin-block-end: var(--size-3);" }, [
        m("strong", { style: "font-size: var(--font-size-0); display: block; margin-block-end: var(--size-1);" }, "Input"),
        pd.jsonTree(trace.input, "drawer-trace-input")
      ]));
    }

    if (sections.length > 0) {
      // Prepend session panel if present.
      if (sessionPanel) sections.unshift(sessionPanel);
      return sections;
    }
  }

  // ── Parsed stdout output ──
  // If the run output was valid JSON but no trace is available yet,
  // render the parsed object as a jsonTree.
  var parsed = PD.state.drawerParsedOutput;
  if (parsed != null && typeof parsed === "object") {
    return [sessionPanel, pd.jsonTree(parsed, "drawer-output")];
  }

  // ── Raw text fallback ──
  // Non-JSON output (e.g. LLM text streaming, test runner output).
  // ANSI escape codes are converted to styled HTML so Deno compiler errors
  // (bold red "error:" prefix, underline markers, etc.) render legibly.
  // Wrapped in a div for stable vdom diffing (same reason as the running state).
  var rawText = PD.state.drawerOutput;
  if (!rawText) return [sessionPanel, m("div")];
  return [sessionPanel, m("div", m.trust(pd.ansiToHtml(rawText)))];
};

// ── drawerProposalContent ──
// Renders the proposal review view inside the drawer body when
// drawerMode is "proposal". Shows:
//   1. Loading spinner while Pi is generating
//   2. Error message if generation failed
//   3. Summary and rationale
//   4. Each operation as a card showing type, target, and new value
//   5. Action buttons: Apply, Apply + Rerun, Refine, Discard
//
// Ref: WEB_FIRST_WORKFLOW_PLAN.md §6.5 — apply flow
// Ref: pipedown.d.ts — PatchProposal, PatchOperation
PD.utils.drawerProposalContent = function() {
  var sections = [];

  // ── Loading state ──
  if (PD.state.proposalLoading) {
    sections.push(m("div", {
      style: "text-align: center; padding: var(--size-5); color: var(--text-2);"
    }, [
      m("div.spinner", { style: "font-size: var(--font-size-3); margin-block-end: var(--size-2);" }, "\u23F3"),
      m("div", "Pi is generating a proposal...")
    ]));
    return sections;
  }

  // ── Error state ──
  if (PD.state.drawerStatus === "error" && PD.state.drawerError) {
    var err = PD.state.drawerError;
    sections.push(m("div.drawer-error-panel", [
      m("div.drawer-error-title", [
        m("span.drawer-error-icon", "\u26A0"),
        m("span", " Proposal generation failed"),
        err.status ? m("span.drawer-error-status", err.status + " " + err.statusText) : null
      ]),
      m("div.drawer-error-message", err.message)
    ]));
    // Still show a Discard button so the user can close cleanly.
    sections.push(m("div", { style: "margin-block-start: var(--size-3);" }, [
      m("button.tb-btn", { onclick: function() {
        PD.state.activeProposal = null;
        PD.state.proposalError = null;
        PD.state.drawerMode = null;
        PD.state.drawerOpen = false;
        m.redraw();
      } }, "Close")
    ]));
    return sections;
  }

  // ── No proposal yet ──
  var proposal = PD.state.activeProposal;
  if (!proposal) {
    sections.push(m("div", { style: "color: var(--text-2); padding: var(--size-3);" },
      "No active proposal."
    ));
    return sections;
  }

  // ── Summary ──
  sections.push(m("div", {
    style: "margin-block-end: var(--size-3);"
  }, [
    m("div", {
      style: "font-weight: var(--font-weight-6); font-size: var(--font-size-1); margin-block-end: var(--size-1);"
    }, proposal.summary || "Pi Proposal"),
    m("div", {
      style: "font-size: var(--font-size-0); color: var(--text-2);"
    }, [
      m("span", "Scope: "),
      m("code", proposal.scopeType),
      proposal.scopeRef && proposal.scopeRef.stepIndex != null
        ? m("span", " (step " + proposal.scopeRef.stepIndex + ")")
        : null
    ])
  ]));

  // ── Rationale ──
  if (proposal.rationale) {
    sections.push(m("div", {
      style: [
        "padding: var(--size-2);",
        "background: var(--surface-1);",
        "border: 1px solid var(--surface-3);",
        "border-radius: var(--radius-2);",
        "margin-block-end: var(--size-3);",
        "font-size: var(--font-size-0);",
        "color: var(--text-2);"
      ].join(" ")
    }, [
      m("strong", "Rationale: "),
      m("span", proposal.rationale)
    ]));
  }

  // ── Operations ──
  if (proposal.operations && proposal.operations.length > 0) {
    sections.push(m("div", {
      style: "margin-block-end: var(--size-3);"
    }, [
      m("div", {
        style: "font-weight: var(--font-weight-6); font-size: var(--font-size-0); margin-block-end: var(--size-2);"
      }, "Operations (" + proposal.operations.length + "):"),
      proposal.operations.map(function(op, i) {
        return PD.utils.renderOperationCard(op, i);
      })
    ]));
  }

  // ── Action buttons ──
  sections.push(m("div", {
    style: [
      "display: flex;",
      "gap: var(--size-2);",
      "flex-wrap: wrap;",
      "padding-block-start: var(--size-3);",
      "border-block-start: 1px solid var(--surface-3);"
    ].join(" ")
  }, [
    // Apply button (primary)
    m("button.tb-btn.primary", {
      onclick: PD.actions.applyProposal,
      disabled: PD.state.proposalLoading,
      title: "Apply this proposal to index.json"
    }, "\u2713 Apply"),
    // Apply + Rerun button
    m("button.tb-btn.primary", {
      onclick: function() {
        // Apply, then create and run a session.
        // We chain the apply action by overriding the completion logic.
        if (!PD.state.activeProposal || !PD.state.selectedPipe) return;
        var proposal = PD.state.activeProposal;
        var applyUrl = "/api/pi/proposals/" + encodeURIComponent(proposal.proposalId) + "/apply";
        PD.state.proposalLoading = true;
        m.redraw();
        fetch(applyUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project: PD.state.selectedPipe.projectName,
            pipe: PD.state.selectedPipe.pipeName
          })
        }).then(function(res) {
          if (!res.ok) throw new Error("Apply failed: " + res.statusText);
          return res.json();
        }).then(function() {
          PD.state.activeProposal = null;
          PD.state.proposalLoading = false;
          PD.state.drawerMode = null;
          PD.state.syncState = "json_dirty";
          PD.actions.refreshPipe();
          // Now run a session.
          PD.actions.createAndRunSession("full");
        }).catch(function(err) {
          PD.state.proposalError = err.message;
          PD.state.proposalLoading = false;
          m.redraw();
        });
      },
      disabled: PD.state.proposalLoading,
      title: "Apply this proposal, then run the full pipe"
    }, "\u2713 Apply + Rerun"),
    // Refine button — prompts for feedback, then calls refineProposal.
    m("button.tb-btn", {
      onclick: function() {
        // Use window.prompt for the first cut (as specified in the task).
        // Ref: https://developer.mozilla.org/en-US/docs/Web/API/Window/prompt
        var feedback = window.prompt("How should Pi refine this proposal?");
        if (feedback) {
          PD.actions.refineProposal(feedback);
        }
      },
      disabled: PD.state.proposalLoading,
      title: "Send feedback to Pi for a refined proposal"
    }, "\u270E Refine"),
    // Discard button
    m("button.tb-btn", {
      onclick: PD.actions.discardProposal,
      disabled: PD.state.proposalLoading,
      title: "Discard this proposal without applying",
      style: "color: var(--red-6);"
    }, "\u2717 Discard")
  ]));

  return sections;
};

// ── renderOperationCard ──
// Renders a single PatchOperation as a card in the proposal review view.
// Shows the operation type, target path, and the new value (with special
// handling for code values which get a monospace code block).
//
// @param {object} op — PatchOperation object
// @param {number} index — operation index (for keying)
// @return {Mithril.Vnode}
PD.utils.renderOperationCard = function(op, index) {
  // Format the operation type for display.
  // "replace_step_code" → "Replace step code"
  var typeLabel = (op.type || "unknown")
    .replace(/_/g, " ")
    .replace(/^\w/, function(c) { return c.toUpperCase(); });

  var children = [
    // ── Operation header ──
    m("div", {
      style: "display: flex; justify-content: space-between; align-items: center; margin-block-end: var(--size-1);"
    }, [
      m("span", {
        style: "font-weight: var(--font-weight-6); font-size: var(--font-size-0);"
      }, typeLabel),
      m("code", {
        style: "font-size: var(--font-size-00); color: var(--text-2);"
      }, op.path || "")
    ])
  ];

  // ── New value display ──
  if (op.newValue !== undefined && op.newValue !== null) {
    var isCode = op.type === "replace_step_code";
    var isConfig = op.type === "replace_step_config" || op.type === "insert_step_after";
    var value = typeof op.newValue === "string" ? op.newValue : JSON.stringify(op.newValue, null, 2);

    if (isCode) {
      // Code changes get a monospace pre block.
      children.push(m("pre", {
        style: [
          "padding: var(--size-2);",
          "background: var(--surface-2);",
          "border: 1px solid var(--surface-3);",
          "border-radius: var(--radius-1);",
          "font-family: var(--font-mono, monospace);",
          "font-size: var(--font-size-00);",
          "overflow-x: auto;",
          "white-space: pre-wrap;",
          "word-break: break-word;",
          "max-height: 300px;",
          "overflow-y: auto;"
        ].join(" ")
      }, m("code", value)));
    } else if (isConfig) {
      // Config/structural operations show JSON.
      children.push(m("pre", {
        style: [
          "padding: var(--size-2);",
          "background: var(--surface-2);",
          "border: 1px solid var(--surface-3);",
          "border-radius: var(--radius-1);",
          "font-family: var(--font-mono, monospace);",
          "font-size: var(--font-size-00);",
          "max-height: 200px;",
          "overflow-y: auto;"
        ].join(" ")
      }, m("code", value)));
    } else {
      // Text changes (title, description, pipe description, schema).
      children.push(m("div", {
        style: [
          "padding: var(--size-2);",
          "background: var(--surface-2);",
          "border: 1px solid var(--surface-3);",
          "border-radius: var(--radius-1);",
          "font-size: var(--font-size-0);"
        ].join(" ")
      }, value));
    }
  }

  return m("div", {
    key: "op-" + index,
    style: [
      "padding: var(--size-2);",
      "margin-block-end: var(--size-2);",
      "border: 1px solid var(--surface-3);",
      "border-radius: var(--radius-2);",
      "background: var(--surface-1);"
    ].join(" ")
  }, children);
};
