// Traces Detail component (includes renderDeltaTags, renderSteps)

function renderDeltaTags(delta) {
  const tags = [];
  if (delta.added?.length) {
    delta.added.forEach(function (k) {
      tags.push(m("span.delta-tag.delta-added", "+" + k));
    });
  }
  if (delta.modified?.length) {
    delta.modified.forEach(function (k) {
      tags.push(m("span.delta-tag.delta-modified", "~" + k));
    });
  }
  if (delta.removed?.length) {
    delta.removed.forEach(function (k) {
      tags.push(m("span.delta-tag.delta-removed", "-" + k));
    });
  }
  return tags;
}

function renderSteps(trace) {
  return m(
    "ul.step-list",
    trace.steps.map(function (step) {
      const isExpanded = PD.state.expandedSteps[step.index];
      const items = [
        m("div.step-item", {
          class: isExpanded ? "expanded" : "",
          onclick: function () {
            // Toggle step expansion and persist to localStorage so the user's
            // drill-down state survives page reloads.
            PD.state.expandedSteps[step.index] = !PD.state
              .expandedSteps[step.index];
            try {
              localStorage.setItem(
                "pd-traces-expandedSteps",
                JSON.stringify(PD.state.expandedSteps),
              );
            } catch (_e) { /* ignore */ }
          },
        }, [
          m("span.step-index", step.index),
          m("span.step-name", step.name || "(anonymous)"),
          m("span.step-duration", step.durationMs + "ms"),
        ]),
      ];
      // neat: it just adds the "opened" content to the <li> child list,
      // re-rendering just this <li> rather than managing some sort of accordion.
      if (isExpanded) {
        items.push(m("div.step-detail", [
          m("div.delta-tags", renderDeltaTags(step.delta)),
          m("details", { open: true }, [
            m("summary", "After"),
            pd.jsonTree(step.after, "s" + step.index + "-after"),
          ]),
          m("details", [
            m("summary", "Before"),
            pd.jsonTree(step.before, "s" + step.index + "-before"),
          ]),
        ]));
      }
      return m("li", {
        key: step.index, // helps Mithril efficiently update the list on expand/collapse
      }, items);
    }),
  );
}

PD.components.Detail = {
  view: function () {
    // Empty state
    if (!PD.state.selected) {
      return m(
        "div.detail",
        m("div.empty-state", [
          m("p", "Select a trace from the sidebar"),
        ]),
      );
    }

    // Loading state
    if (PD.state.traceLoading) {
      return m("div.detail", m("p", "Loading trace..."));
    }

    // Error state
    if (!PD.state.traceData) {
      return m("div.detail", m("p", "Failed to load trace."));
    }

    // Main detail view
    const t = PD.state.traceData;
    const hasErrors = t.errors && t.errors.length > 0;
    return m("div.detail", [
      m("div.detail-header", [
        m("h2", [
          t.pipeName,
          hasErrors
            ? m("span.error-badge", {
              style: "margin-inline-start: var(--size-2)",
            }, t.errors.length + " error(s)")
            : null,
        ]),
        m("div.meta", [
          m("span", "Project: " + t.project),
          m("span", t.stepsTotal + " steps"),
          m("span", t.durationMs + "ms total"),
          m("span", new Date(t.timestamp).toLocaleString()),
        ]),
      ]),
      m("div.tabs", [
        [
          { key: "steps", label: "Steps" },
          { key: "input", label: "Input" },
          { key: "output", label: "Output" },
          { key: "raw", label: "Raw JSON" },
        ].map(function ({ key, label }) {
          return m("button.tab", {
            class: PD.state.detailTab === key ? "active" : "",
            onclick: function () {
              // Persist active tab to localStorage so returning to this
              // page lands on the same tab the user was viewing.
              PD.state.detailTab = key;
              localStorage.setItem("pd-traces-detailTab", key);
            },
          }, label);
        }),
      ]),
      PD.state.detailTab === "steps" ? renderSteps(t) : null,
      PD.state.detailTab === "input" ? pd.jsonTree(t.input, "tab-input") : null,
      PD.state.detailTab === "output"
        ? pd.jsonTree(t.output, "tab-output")
        : null,
      PD.state.detailTab === "raw" ? pd.jsonTree(t, "tab-raw") : null,
    ]);
  },
};
