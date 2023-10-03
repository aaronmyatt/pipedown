import {basicSetup, EditorView} from "codemirror";
import {EditorState, StateField, StateEffect} from "@codemirror/state"
import {Decoration, DecorationSet, keymap, MatchDecorator, ViewPlugin, WidgetType} from "@codemirror/view"

class PlaceholderWidget extends WidgetType {
    constructor(readonly placeholder: string, readonly pipeName: string) { super() }
    eq(other: PlaceholderWidget) { return this.placeholder == other.placeholder }
    toDOM() {
        let wrap = document.createElement('span');

        const pipeLink = document.createElement('a');
        pipeLink.innerText = this.placeholder.trim()
        pipeLink.className = "cm-placeholder"
        wrap.appendChild(pipeLink)

        fetch("http://localhost:8000/api/pipebyname/" + 'pdPipeToolbar').then((response) => {
            return response.json()
        }).then((data) => {
            console.log(data)
            pipeLink.href = "http://localhost:8000/pipe/" + data.id
        })

        // append a link element with an emoji gear as text
        let settingsLink = document.createElement('a');
        settingsLink.style.paddingLeft = "0.5em"
        settingsLink.innerText = "⚙️"
        settingsLink.href = "https://www.google.com/search?q=" + this.placeholder
        settingsLink.target = "_blank"
        wrap.appendChild(settingsLink)
        return wrap
    }
    ignoreEvent() { return false }
}

// const placeholderMatcher = new MatchDecorator({
//     regexp: /\[\[(\w+)\]\]/g,
//     decoration: match => {
//         return Decoration.replace({
//             widget: new PlaceholderWidget(match[1]),
//         })
//     }
// })

const pdMatcher = new MatchDecorator({
    regexp: /PD\.(\w+)\([^)]*\)/g,
    decoration: match => {
        console.log(match);
        return Decoration.replace({
            widget: new PlaceholderWidget(match.input, match[1]),
        })
    }
})

// const placeholders = ViewPlugin.fromClass(class {
//     decorations: DecorationSet
//
//     constructor(readonly view: EditorView) {
//         this.decorations = placeholderMatcher.createDeco(view)
//     }
//
//     update(update: ViewUpdate) {
//         this.decorations = placeholderMatcher.updateDeco(update, this.decorations)
//     }
// }, {
//     decorations: (v) => {
//         return v.decorations
//     },
//     provide: plugin => {
//         return EditorView.atomicRanges.of(view => {
//             return view.plugin(plugin)?.decorations || Decoration.none;
//         })
//     }
// })

const pdDecorations = ViewPlugin.fromClass(class {
    decorations: DecorationSet

    constructor(readonly view: EditorView) {
        this.decorations = pdMatcher.createDeco(view)
    }

    update(update: ViewUpdate) {
        this.decorations = pdMatcher.updateDeco(update, this.decorations)
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
        // placeholders,
        pdDecorations,
    ]
}

window["CodeMirror"] = ({el, code, onChange}) => {
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
