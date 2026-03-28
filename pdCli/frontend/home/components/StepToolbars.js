// StepToolbars — intentionally empty.
//
// Step-level toolbars (including the I/O button and trace display) are injected
// directly into the rendered markdown DOM by MarkdownRenderer.js's
// injectStepToolbars function. This file previously held a Mithril component
// that was never mounted; it has been removed to avoid confusion.
//
// Ref: MarkdownRenderer.js injectStepToolbars()
// Ref: state.js PD.actions.loadStepTraces
