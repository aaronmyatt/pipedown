// Home MarkdownRenderer component (includes decorateHeadings + injectStepToolbars)

function decorateHeadings(container) {
  // Wrap ALL step boundary headings (both executable and non-executable) in
  // a .heading-wrapper div. In pipedown every h2 is a step boundary — those
  // with data-step-index are executable, those without are skipped or lack a
  // valid language specifier.
  container.querySelectorAll("h2.pd-step-boundary").forEach(function (el) {
    if (
      el.parentNode.classList &&
      el.parentNode.classList.contains("heading-wrapper")
    ) return;
    const wrapper = document.createElement("div");
    wrapper.className = "heading-wrapper";
    el.parentNode.insertBefore(wrapper, el);
    wrapper.appendChild(el);
  });

  // Also wrap the pipe-level h1 heading.
  const h1 = container.querySelector(".pd-pipe-heading");
  if (
    h1 &&
    !(h1.parentNode.classList &&
      h1.parentNode.classList.contains("heading-wrapper"))
  ) {
    const wrapper = document.createElement("div");
    wrapper.className = "heading-wrapper";
    h1.parentNode.insertBefore(wrapper, h1);
    wrapper.appendChild(h1);
  }
}

// ── Step Section Wrapping ──
// Wraps each step's full section (from its h2 heading through all content
// until the next step's h2 heading) inside a `.step-section` div.
// This allows the toolbar to be revealed when the cursor is anywhere within
// the step section, not just on the heading itself.
//
// Sections whose heading does NOT have a data-step-index are non-executable
// (skipped or missing a valid language specifier). These receive the
// additional `step-section--inactive` class so CSS can render them in a
// muted/faded style.
// Ref: CSS `.step-section:hover .toolbar-overlay` handles toolbar visibility.
function wrapStepSections(container) {
  // Gather ALL heading-wrappers that contain a step boundary heading (h2).
  // Both executable (data-step-index) and non-executable headings are
  // included so that every step section gets wrapped. The h1 pipe heading
  // also lives in a .heading-wrapper but is NOT a step boundary, so it is
  // excluded by querying for .pd-step-boundary specifically.
  const stepWrappers = [];
  container.querySelectorAll("h2.pd-step-boundary").forEach(function (heading) {
    const wrapper = heading.parentNode;
    if (wrapper.classList && wrapper.classList.contains("heading-wrapper")) {
      stepWrappers.push({
        el: wrapper,
        isExecutable: heading.hasAttribute("data-step-index"),
      });
    }
  });

  stepWrappers.forEach(function (item, i) {
    const wrapper = item.el;

    // Idempotency: skip if this heading-wrapper is already inside a .step-section.
    if (
      wrapper.parentNode.classList &&
      wrapper.parentNode.classList.contains("step-section")
    ) return;

    // Create the section container and insert it where the heading-wrapper currently sits.
    // Non-executable steps get the --inactive modifier class.
    const section = document.createElement("div");
    section.className = item.isExecutable
      ? "step-section"
      : "step-section step-section--inactive";
    wrapper.parentNode.insertBefore(section, wrapper);
    // Move the heading-wrapper into the section.
    section.appendChild(wrapper);

    // Collect all following siblings until we hit the next step's heading-wrapper
    // (or another .step-section from a previous pass).
    const nextEl = stepWrappers[i + 1] ? stepWrappers[i + 1].el : null;
    while (section.nextSibling) {
      const sibling = section.nextSibling;
      // Stop before the next step's heading wrapper.
      if (sibling === nextEl) break;
      // Stop before an already-wrapped step section.
      if (sibling.classList && sibling.classList.contains("step-section")) {
        break;
      }
      // Safety: stop before any heading-wrapper that holds a step boundary heading.
      if (
        sibling.classList && sibling.classList.contains("heading-wrapper") &&
        sibling.querySelector("h2.pd-step-boundary")
      ) break;
      section.appendChild(sibling);
    }
  });
}

function injectStepToolbars(container) {
  if (!PD.state.pipeData || !PD.state.pipeData.steps) return;

  // Wrap each step section first so hover zones cover full step content.
  wrapStepSections(container);

  // ── Inject toolbars for ALL step boundary headings ──
  // Every h2.pd-step-boundary gets a toolbar. Executable steps (those with
  // data-step-index) get the full button set. Non-executable steps (skipped
  // or missing a valid language) get the LLM-generation buttons only — this
  // supports the workflow of writing a heading + description first, then
  // using the "Code" button to have the LLM generate the code block.
  container.querySelectorAll("h2.pd-step-boundary").forEach(function (heading) {
    const wrapper = heading.parentNode;

    // Re-use existing toolbar div if present (required for split-button
    // dropdown state updates), or create a new one. Unlike the old guard
    // that returned early, we always m.render() below so the dropdown
    // toggle reflects the current PD.state.inputDropdownStep value.
    let toolbar = wrapper.querySelector(".toolbar-overlay");
    if (!toolbar) {
      toolbar = document.createElement("div");
      toolbar.className = "toolbar-overlay";
      wrapper.appendChild(toolbar);
    }

    const isExecutable = heading.hasAttribute("data-step-index");

    if (isExecutable) {
      // ── Executable step: full toolbar ──
      const idx = parseInt(heading.getAttribute("data-step-index"));
      const step = PD.state.pipeData.steps[idx];
      if (!step) return;

      // ── Extract mode: step-section highlighting ──
      // When extract mode is active, add/remove the `extract-selected` class
      // on the step's .step-section container for visual highlighting.
      // Ref: styles.css — `.step-section.extract-selected` border/outline
      const stepSection = wrapper.closest(".step-section");
      if (stepSection) {
        if (PD.state.extractMode && PD.state.extractSelected[idx]) {
          stepSection.classList.add("extract-selected");
        } else {
          stepSection.classList.remove("extract-selected");
        }
      }

      // ── Extract mode: checkbox toolbar ──
      // In extract mode, replace the normal action buttons with a simple
      // checkbox toggle. Clicking the checkbox or the step section toggles
      // the step's selection state.
      // Ref: PD.actions.toggleExtractStep in state.js
      if (PD.state.extractMode) {
        const isSelected = !!PD.state.extractSelected[idx];
        m.render(toolbar, [
          m("label.extract-checkbox", {
            onclick: function (e) {
              e.stopPropagation();
              PD.actions.toggleExtractStep(idx);
              // Re-inject toolbars after state change to update checkbox and
              // step-section highlight classes.
              requestAnimationFrame(function () {
                const mdViewer = document.querySelector(".md-viewer");
                if (mdViewer) injectStepToolbars(mdViewer);
              });
            },
          }, [
            m("input[type=checkbox]", {
              checked: isSelected,
              // Prevent default so the label onclick handles the toggle.
              // Without this, the checkbox fires twice (label + input).
              onclick: function (e) {
                e.preventDefault();
              },
            }),
            m("span", isSelected ? " Selected" : " Select for extraction"),
          ]),
        ]);

        // Skip the extras section in extract mode — no DSL/trace panels needed
        return;
      }

      // ── Normal mode: full step toolbar ──
      // Split "Run to here" button with input dropdown, LLM buttons, and
      // the Extract button that enters extraction mode.
      // Ref: PD.utils.renderInputDropdownItems, state.js inputDropdownStep
      m.render(toolbar, [
        m("button.tb-btn", {
          onclick: function () {
            PD.actions.llmAction("step-title", { stepIndex: idx });
          },
        }, "Title"),
        m("button.tb-btn", {
          onclick: function () {
            PD.actions.llmAction("step-description", { stepIndex: idx });
          },
        }, "Describe"),
        m("button.tb-btn", {
          onclick: function () {
            PD.actions.llmAction("step-code", { stepIndex: idx });
          },
        }, "Code"),
        m(".split-btn-group", [
          m("button.tb-btn.primary", {
            onclick: function () {
              PD.actions.runToStep(idx);
            },
          }, "Run to here"),
          m("button.tb-btn.primary.split-toggle", {
            onclick: function (e) {
              e.stopPropagation();
              // Toggle this step's dropdown; close pipe-level dropdown and
              // any other step dropdown that might be open.
              PD.state.inputDropdownOpen = false;
              PD.state.inputDropdownStep = PD.state.inputDropdownStep === idx
                ? null
                : idx;
              // Lazy-load input history on first open.
              if (PD.state.inputDropdownStep === idx) {
                PD.actions.loadInputHistory();
              }
              // Step toolbars are rendered via m.render (outside the Mithril
              // auto-redraw tree), so we need to manually re-render all step
              // extras and toolbars to update the dropdown visibility.
              // Ref: https://mithril.js.org/render.html
              m.redraw();
              // Re-inject toolbars after redraw to pick up the new dropdown state.
              // Use requestAnimationFrame so the DOM has been updated first.
              requestAnimationFrame(function () {
                const mdViewer = document.querySelector(".md-viewer");
                if (mdViewer) injectStepToolbars(mdViewer);
              });
            },
            title: "Run to here with past input or custom JSON",
          }, "\u25BE"),
          // Render the dropdown if this step's toggle is active.
          PD.state.inputDropdownStep === idx
            ? m(".dropdown-menu.input-dropdown", {
              onclick: function (e) {
                e.stopPropagation();
              },
            }, PD.utils.renderInputDropdownItems(idx))
            : null,
        ]),
        m("button.tb-btn", {
          onclick: function () {
            PD.actions.toggleDSL(idx);
            m.redraw();
          },
          style: PD.utils.buildDSLLines(step.config).length === 0
            ? "opacity: 0.4; pointer-events: none;"
            : "",
        }, "DSL"),
        m("button.tb-btn", {
          onclick: function () {
            PD.actions.loadStepTraces(idx);
            m.redraw();
          },
        }, "I/O"),
        // ── Extract button ──
        // Enters extract mode with this step pre-selected. The step toolbars
        // switch to checkbox mode and the ExtractBar appears at the bottom.
        // Ref: PD.actions.enterExtractMode in state.js
        m("button.tb-btn", {
          onclick: function () {
            PD.actions.enterExtractMode(idx);
            // Re-inject toolbars after entering extract mode to switch
            // all step toolbars from normal to checkbox rendering.
            requestAnimationFrame(function () {
              const mdViewer = document.querySelector(".md-viewer");
              if (mdViewer) injectStepToolbars(mdViewer);
            });
          },
        }, "Extract"),
      ]);

      const extraId = "step-extra-" + idx;
      const existing = document.getElementById(extraId);
      if (!existing) {
        const extra = document.createElement("div");
        extra.id = extraId;
        wrapper.parentNode.insertBefore(extra, wrapper.nextSibling);
      }
    } else {
      // ── Non-executable step: LLM-generation buttons only ──
      // Pass headingName so the backend can locate the heading by text rather
      // than by stepIndex. Runtime buttons (Run, DSL, I/O) are omitted since
      // there is no compiled step to operate on.
      const headingName = heading.textContent.trim();
      m.render(toolbar, [
        m("button.tb-btn", {
          onclick: function () {
            PD.actions.llmAction("step-title", { headingName: headingName });
          },
        }, "Title"),
        m("button.tb-btn", {
          onclick: function () {
            PD.actions.llmAction("step-description", {
              headingName: headingName,
            });
          },
        }, "Describe"),
        m("button.tb-btn", {
          onclick: function () {
            PD.actions.llmAction("step-code", { headingName: headingName });
          },
        }, "Code"),
      ]);
    }
  });

  // Update DSL/trace displays
  PD.state.pipeData.steps.forEach(function (step, idx) {
    const extraEl = document.getElementById("step-extra-" + idx);
    if (!extraEl) return;
    const children = [];
    if (PD.state.showListDSL[idx]) {
      const dslLines = PD.utils.buildDSLLines(step.config);
      if (dslLines.length > 0) {
        children.push(
          m(
            ".dsl-block",
            dslLines.map(function (line) {
              return m(".dsl-line", [
                m("span.dsl-key", "- " + line[0] + ": "),
                m("span.dsl-val", line[1]),
              ]);
            }),
          ),
        );
      }
    }
    if (PD.state.showStepTraces === idx) {
      const traces = PD.state.stepTraces[idx];
      if (traces) {
        if (traces.length === 0) {
          children.push(
            m(
              ".step-traces",
              m("p", {
                style: "color: var(--text-2); font-size: var(--font-size-0)",
              }, "No traces found."),
            ),
          );
        } else {
          children.push(m(
            ".step-traces",
            traces.map(function (t, ti) {
              return m("details", { key: ti }, [
                m("summary", t.timestamp),
                t.step
                  ? [
                    m("div", { style: "margin: var(--size-1) 0" }, [
                      m(
                        "strong",
                        { style: "font-size: var(--font-size-0)" },
                        "After:",
                      ),
                      pd.jsonTree(
                        t.step.after || t.step,
                        "trace-" + idx + "-" + ti + "-after",
                      ),
                    ]),
                    m("div", { style: "margin: var(--size-1) 0" }, [
                      m(
                        "strong",
                        { style: "font-size: var(--font-size-0)" },
                        "Before:",
                      ),
                      pd.jsonTree(
                        t.step.before || {},
                        "trace-" + idx + "-" + ti + "-before",
                      ),
                    ]),
                  ]
                  : m("p", "No data"),
              ]);
            }),
          ));
        }
      } else {
        children.push(m(".step-traces", m("p.spinner", "Loading traces...")));
      }
    }
    m.render(extraEl, children);
  });
}

PD.components.MarkdownRenderer = {
  oncreate: function (vnode) {
    decorateHeadings(vnode.dom);
  },
  onupdate: function (vnode) {
    decorateHeadings(vnode.dom);
  },
  view: function () {
    if (PD.state.markdownLoading) return m("p", "Loading...");
    if (!PD.state.markdownHtml) return m("p", "Failed to load file.");
    return m("div.md-viewer", m.trust(PD.state.markdownHtml));
  },
};

// Expose injectStepToolbars for MainContent to call
PD.utils.injectStepToolbars = injectStepToolbars;
