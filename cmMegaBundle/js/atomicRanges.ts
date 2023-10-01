import {basicSetup, EditorView} from "codemirror";
import {EditorState, StateField, StateEffect} from "@codemirror/state"
import {Decoration, DecorationSet, keymap, MatchDecorator, ViewPlugin, WidgetType} from "@codemirror/view"

class PlaceholderWidget extends WidgetType {
    constructor(readonly placeholder: string) { super() }
    eq(other: PlaceholderWidget) { return this.placeholder == other.placeholder }
    toDOM() {
        let wrap = document.createElement('span');
        wrap.className = "cm-placeholder"
        wrap.innerText = this.placeholder
        return wrap
    }
    ignoreEvent() { return false }
}

const placeholderMatcher = new MatchDecorator({
    regexp: /\[\[(\w+)\]\]/g,
    decoration: match => Decoration.replace({
        widget: new PlaceholderWidget(match[1]),
    })
})

const placeholders = ViewPlugin.fromClass(class {
    decorations: DecorationSet

    constructor(readonly view: EditorView) {
        this.decorations = placeholderMatcher.createDeco(view)
    }

    update(update: ViewUpdate) {
        this.decorations = placeholderMatcher.updateDeco(update, this.decorations)
    }
}, {
    decorations: (v) => {
        return v.decorations
    },
    provide: plugin => {
        return EditorView.atomicRanges.of(view => {
            return view.plugin(plugin)?.decorations || Decoration.none;
        })
    }
})

function atomicRanges(options: {step?: number} = {}): Extension {
    return [
        placeholders
    ]
}

window["atomicRanges"] = ({el, code, onChange}) => {
    const minHeightEditor = EditorView.theme({
        ".cm-content, .cm-gutter": {minHeight: "200px", whiteSpace: "pre-wrap"},
    })

    const extensions = [basicSetup, minHeightEditor, atomicRanges()];

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
