// ── RunDrawer Component ──
// Right-hand sliding drawer panel that displays output from all operations
// (pipe runs, step runs, LLM actions, tests, pack). Replaces the old
// bottom-fixed OperationPanel and the view-mode output tab system with a
// single unified output surface.
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
  onupdate: function(vnode) {
    if (PD.state.drawerStatus === "running") {
      var body = vnode.dom.querySelector(".run-drawer-body");
      if (body) {
        body.scrollTop = body.scrollHeight;
      }
    }
  },

  view: function() {
    // Always render the wrapper div so CSS transitions work. The `.open`
    // class controls visibility via transform.
    var isOpen = PD.state.drawerOpen;

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
    return m(".run-drawer", { class: isOpen ? "open" : "" }, [
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
    ]);
  }
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
PD.utils.drawerBodyContent = function() {
  // While running, show raw streaming text so the user sees live progress.
  if (PD.state.drawerStatus === "running") {
    return PD.state.drawerOutput || "Running...";
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

    // Error message body.
    sections.push(m("div.drawer-error-message", err.message));

    // If the drawer accumulated partial output before the error (e.g. a
    // stream that broke mid-transfer), show it in a collapsible section
    // so the user can inspect what arrived before the failure.
    var rawOutput = PD.state.drawerOutput;
    if (rawOutput && rawOutput !== err.message) {
      sections.push(m("details.drawer-error-details", [
        m("summary", "Raw output"),
        m("pre", rawOutput)
      ]));
    }

    return m("div.drawer-error-panel", sections);
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

    if (sections.length > 0) return sections;
  }

  // ── Parsed stdout output ──
  // If the run output was valid JSON but no trace is available yet,
  // render the parsed object as a jsonTree.
  var parsed = PD.state.drawerParsedOutput;
  if (parsed != null && typeof parsed === "object") {
    return pd.jsonTree(parsed, "drawer-output");
  }

  // ── Raw text fallback ──
  // Non-JSON output (e.g. LLM text streaming, test runner output).
  return PD.state.drawerOutput || "";
};
