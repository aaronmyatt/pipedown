// Home MarkdownRenderer component (includes decorateHeadings + injectStepToolbars)

function decorateHeadings(container) {
  container.querySelectorAll("[data-step-index]").forEach(function(el) {
    if (el.parentNode.classList && el.parentNode.classList.contains("heading-wrapper")) return;
    var wrapper = document.createElement("div");
    wrapper.className = "heading-wrapper";
    el.parentNode.insertBefore(wrapper, el);
    wrapper.appendChild(el);
  });
  var h1 = container.querySelector(".pd-pipe-heading");
  if (h1 && !(h1.parentNode.classList && h1.parentNode.classList.contains("heading-wrapper"))) {
    var wrapper = document.createElement("div");
    wrapper.className = "heading-wrapper";
    h1.parentNode.insertBefore(wrapper, h1);
    wrapper.appendChild(h1);
  }
}

function injectStepToolbars(container) {
  if (!PD.state.pipeData || !PD.state.pipeData.steps) return;
  container.querySelectorAll("[data-step-index]").forEach(function(heading) {
    var idx = parseInt(heading.getAttribute("data-step-index"));
    if (isNaN(idx)) return;
    var step = PD.state.pipeData.steps[idx];
    if (!step) return;

    var wrapper = heading.parentNode;
    if (wrapper.querySelector(".toolbar-overlay")) return;

    var toolbar = document.createElement("div");
    toolbar.className = "toolbar-overlay";
    toolbar.innerHTML = "";
    wrapper.appendChild(toolbar);

    m.render(toolbar, [
      m("button.tb-btn", { onclick: function() { PD.actions.llmAction("step-title", { stepIndex: idx }); } }, "Title"),
      m("button.tb-btn", { onclick: function() { PD.actions.llmAction("step-description", { stepIndex: idx }); } }, "Describe"),
      m("button.tb-btn", { onclick: function() { PD.actions.llmAction("step-code", { stepIndex: idx }); } }, "Code"),
      m("button.tb-btn.primary", { onclick: function() { PD.actions.runToStep(idx); } }, "Run to here"),
      m("button.tb-btn", {
        onclick: function() { PD.actions.toggleDSL(idx); m.redraw(); },
        style: PD.utils.buildDSLLines(step.config).length === 0 ? "opacity: 0.4; pointer-events: none;" : ""
      }, "DSL"),
      m("button.tb-btn", { onclick: function() { PD.actions.loadStepTraces(idx); m.redraw(); } }, "I/O")
    ]);

    var extraId = "step-extra-" + idx;
    var existing = document.getElementById(extraId);
    if (!existing) {
      var extra = document.createElement("div");
      extra.id = extraId;
      wrapper.parentNode.insertBefore(extra, wrapper.nextSibling);
    }
  });

  // Update DSL/trace displays
  PD.state.pipeData.steps.forEach(function(step, idx) {
    var extraEl = document.getElementById("step-extra-" + idx);
    if (!extraEl) return;
    var children = [];
    if (PD.state.showListDSL[idx]) {
      var dslLines = PD.utils.buildDSLLines(step.config);
      if (dslLines.length > 0) {
        children.push(
          m(".dsl-block", dslLines.map(function(line) {
            return m(".dsl-line", [
              m("span.dsl-key", "- " + line[0] + ": "),
              m("span.dsl-val", line[1])
            ]);
          }))
        );
      }
    }
    if (PD.state.showStepTraces === idx) {
      var traces = PD.state.stepTraces[idx];
      if (traces) {
        if (traces.length === 0) {
          children.push(m(".step-traces", m("p", { style: "color: var(--text-2); font-size: var(--font-size-0)" }, "No traces found.")));
        } else {
          children.push(m(".step-traces", traces.map(function(t, ti) {
            return m("details", { key: ti }, [
              m("summary", t.timestamp),
              t.step ? [
                m("div", { style: "margin: var(--size-1) 0" }, [
                  m("strong", { style: "font-size: var(--font-size-0)" }, "After:"),
                  pd.jsonTree(t.step.after || t.step, "trace-" + idx + "-" + ti + "-after")
                ]),
                m("div", { style: "margin: var(--size-1) 0" }, [
                  m("strong", { style: "font-size: var(--font-size-0)" }, "Before:"),
                  pd.jsonTree(t.step.before || {}, "trace-" + idx + "-" + ti + "-before")
                ])
              ] : m("p", "No data")
            ]);
          })));
        }
      } else {
        children.push(m(".step-traces", m("p.spinner", "Loading traces...")));
      }
    }
    m.render(extraEl, children);
  });
}

PD.components.MarkdownRenderer = {
  oncreate: function(vnode) { decorateHeadings(vnode.dom); },
  onupdate: function(vnode) { decorateHeadings(vnode.dom); },
  view: function() {
    if (PD.state.markdownLoading) return m("p", "Loading...");
    if (!PD.state.markdownHtml) return m("p", "Failed to load file.");
    return m("div.md-viewer", m.trust(PD.state.markdownHtml));
  }
};

// Expose injectStepToolbars for MainContent to call
PD.utils.injectStepToolbars = injectStepToolbars;
