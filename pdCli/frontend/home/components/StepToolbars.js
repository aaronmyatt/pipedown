// Home StepToolbars component (hidden container for step toolbar state)
PD.components.StepToolbars = {
  view: function() {
    if (!PD.state.pipeData || !PD.state.pipeData.steps) return null;
    return PD.state.pipeData.steps.map(function(step, idx) {
      var dslLines = PD.utils.buildDSLLines(step.config);
      return m("div", { key: "step-toolbar-" + idx, style: "display: none;" }, [
        PD.state.showListDSL[idx] && dslLines.length > 0 ?
          m(".dsl-block", dslLines.map(function(line) {
            return m(".dsl-line", [
              m("span.dsl-key", "- " + line[0] + ": "),
              m("span.dsl-val", line[1])
            ]);
          }))
        : null,
        PD.state.showStepTraces === idx ?
          m(".step-traces", [
            PD.state.stepTraces[idx] ?
              (PD.state.stepTraces[idx].length === 0 ?
                m("p", { style: "color: var(--text-2); font-size: var(--font-size-0)" }, "No traces found for this step.")
                : PD.state.stepTraces[idx].map(function(t, ti) {
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
                })
              )
            : m("p.spinner", "Loading traces...")
          ])
        : null
      ]);
    });
  }
};
