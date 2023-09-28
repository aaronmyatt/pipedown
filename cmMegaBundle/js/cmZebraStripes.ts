import {basicSetup, EditorView} from "codemirror";
import {RangeSetBuilder, EditorState, Extension, Facet} from "@codemirror/state"
import {ViewPlugin, DecorationSet, ViewUpdate, Decoration} from "@codemirror/view"

const stripe = Decoration.line({attributes: {class: "cm-zebraStripe"}})

function zebraStripesDeco(view: EditorView): Decoration[] {
    let step = view.state.facet(stepSize)
    let builder = new RangeSetBuilder<Decoration>()
    for (let {from, to} of view.visibleRanges) {
        for(let pos = from; pos <= to;) {
            let line = view.state.doc.lineAt(pos);
            if((line.number % step) === 0) {
                builder.add(line.from, line.from, stripe)
            }
            pos = line.to + 1
        }
    }
    return builder.finish();
}

const baseTheme = EditorView.baseTheme({
    "&light .cm-zebraStripe": {backgroundColor: "#f5f5f5"},
    "&dark .cm-zebraStripe": {backgroundColor: "#555555"},
})

const stepSize = Facet.define<number, number>({
    combine: values => values.length ? Math.min(...values) : 2,
})

const showZebraStripes = ViewPlugin.fromClass(class {
    decorations: DecorationSet
    constructor(view: EditorView) {
        this.decorations = zebraStripesDeco(view)
    }

    update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
            this.decorations = zebraStripesDeco(update.view)
        }
    }
}, {decorations: v => v.decorations})


function zebraStripes(options: {step?: number} = {}): Extension {
    return [
        baseTheme,
        options.step ? stepSize.of(options.step) : [],
        showZebraStripes
    ]
}

window.ZebraStripes = ({el, code, onChange}) => {
    console.log('CodeMirror', el, code, onChange);
    const minHeightEditor = EditorView.theme({
        ".cm-content, .cm-gutter": {minHeight: "200px", whiteSpace: "pre-wrap"},
    })

    const extensions = [basicSetup, minHeightEditor, zebraStripes()];

    if (onChange){
        extensions.push(EditorView.updateListener.of((v) => {
            if (v.docChanged) {
                onChange(v.state.doc.toString())
            }
        }))
    }

    return new EditorView({
        state: EditorState.create({
            extensions,
            doc: code
        }),
        // doc: code,
        // extensions,
        parent: el,
        lineWrapping: true,
    })
}
