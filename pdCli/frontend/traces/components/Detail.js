// Traces Detail component (includes renderDeltaTags, renderSteps)

function renderDeltaTags(delta) {
  var tags = [];
  if (delta.added && delta.added.length) {
    delta.added.forEach(function(k) {
      tags.push(m("span.delta-tag.delta-added", "+" + k));
    });
  }
  if (delta.modified && delta.modified.length) {
    delta.modified.forEach(function(k) {
      tags.push(m("span.delta-tag.delta-modified", "~" + k));
    });
  }
  if (delta.removed && delta.removed.length) {
    delta.removed.forEach(function(k) {
      tags.push(m("span.delta-tag.delta-removed", "-" + k));
    });
  }
  return tags;
}

function renderSteps(trace) {
  return m("ul.step-list", trace.steps.map(function(step) {
    var isExp = PD.state.expandedSteps[step.index];
    var items = [
      m("div.step-item" + (isExp ? ".expanded" : ""), {
        onclick: function() {
          PD.state.expandedSteps[step.index] = !PD.state.expandedSteps[step.index];
        }
      }, [
        m("span.step-index", step.index),
        m("span.step-name", step.name || "(anonymous)"),
        m("span.step-duration", step.durationMs + "ms")
      ])
    ];
    if (isExp) {
      items.push(m("div.step-detail", [
        m("div.delta-tags", renderDeltaTags(step.delta)),
        m("details", { open: true }, [
          m("summary", "After"),
          pd.jsonTree(step.after, "s" + step.index + "-after")
        ]),
        m("details", [
          m("summary", "Before"),
          pd.jsonTree(step.before, "s" + step.index + "-before")
        ])
      ]));
    }
    return m("li", items);
  }));
}

PD.components.Detail = {
  view: function() {
    if (!PD.state.selected) {
      return m("div.detail", m("div.empty-state", [
        m("p", "Select a trace from the sidebar")
      ]));
    }
    if (PD.state.traceLoading) {
      return m("div.detail", m("p", "Loading trace..."));
    }
    if (!PD.state.traceData) {
      return m("div.detail", m("p", "Failed to load trace."));
    }
    var t = PD.state.traceData;
    var hasErrors = t.errors && t.errors.length > 0;
    return m("div.detail", [
      m("div.detail-header", [
        m("h2", [
          t.pipeName,
          hasErrors ? m("span.error-badge", { style: "margin-inline-start: var(--size-2)" }, t.errors.length + " error(s)") : null
        ]),
        m("div.meta", [
          m("span", "Project: " + t.project),
          m("span", t.stepsTotal + " steps"),
          m("span", t.durationMs + "ms total"),
          m("span", new Date(t.timestamp).toLocaleString())
        ])
      ]),
      m("div.tabs", [
        ["steps", "Steps", "input", "Input", "output", "Output", "raw", "Raw JSON"].reduce(function(acc, val, i, arr) {
          if (i % 2 === 0) {
            var key = arr[i];
            var label = arr[i + 1];
            acc.push(m("button.tab" + (PD.state.detailTab === key ? ".active" : ""), {
              onclick: function() { PD.state.detailTab = key; }
            }, label));
          }
          return acc;
        }, [])
      ]),
      PD.state.detailTab === "steps" ? renderSteps(t) : null,
      PD.state.detailTab === "input" ? pd.jsonTree(t.input, "tab-input") : null,
      PD.state.detailTab === "output" ? pd.jsonTree(t.output, "tab-output") : null,
      PD.state.detailTab === "raw" ? pd.jsonTree(t, "tab-raw") : null
    ]);
  }
};
