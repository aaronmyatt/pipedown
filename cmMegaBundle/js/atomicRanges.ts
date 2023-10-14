import {basicSetup, EditorView} from "codemirror";
import {EditorState} from "@codemirror/state"
import {Decoration, DecorationSet, MatchDecorator, ViewPlugin, WidgetType} from "@codemirror/view"

class PipeLinkWidget extends WidgetType {
    constructor(readonly placeholder: string, readonly pipeName: string) { super() }
    eq(other: PipeLinkWidget) { return this.placeholder == other.placeholder }
    toDOM() {
        const pipeLink = document.createElement('a');
        pipeLink.style.paddingLeft = "0.5em"
        pipeLink.innerText = ' 🔗 '
        pipeLink.className = "cm-placeholder"

        fetch("http://localhost:8000/api/pipebyname/" + this.pipeName).then((response) => {
            return response.json()
        }).then((data) => {
            console.log(data)
            pipeLink.href = "http://localhost:8000/pipe/" + data.id
        })

        return pipeLink;
    }
    ignoreEvent() { return false }
}
class SettingsWidget extends WidgetType {
    constructor(readonly placeholder: string, readonly pipeName: string) { super() }
    eq(other: SettingsWidget) { return this.placeholder == other.placeholder }
    toDOM() {
        let settingsLink = document.createElement('a');
        settingsLink.style.paddingLeft = "0.5em"
        settingsLink.innerText = "⚙️"
        settingsLink.href = "https://www.google.com/search?q=" + this.placeholder
        settingsLink.target = "_blank"
        return settingsLink
    }
    ignoreEvent() { return false }
}

const pdMatcher = new MatchDecorator({
    regexp: /PD\.(\w+)\([^)]*\)/g,
    // decoration: match => {
    //     return Decoration.widget({
    //         widget: new PlaceholderWidget(match[0], match[1]),
    //         side: 1,
    //     })
    // }
    decorate: (add, from, to, match) => {
        const settingsDeco = Decoration.widget({
            widget: new SettingsWidget(match[0], match[1]),
            side: 1,
        })
        add(to, to, settingsDeco);

        const pipeLinkDeco = Decoration.widget({
            widget: new PipeLinkWidget(match[0], match[1]),
            side: 1,
        })
        add(to, to, pipeLinkDeco);
    }
})

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
})

function atomicRanges(options: {step?: number} = {}): Extension {
    return [
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
