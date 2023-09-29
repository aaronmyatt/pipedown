import {basicSetup, EditorView} from "codemirror";
import {EditorState} from "@codemirror/state"
import {WidgetType, Decoration, ViewUpdate, ViewPlugin, DecorationSet} from "@codemirror/view"
import {syntaxTree} from "@codemirror/language"
// import codemirror javascript language support
import {javascript} from "@codemirror/lang-javascript"


class CheckboxWidget extends WidgetType {
    constructor(readonly checked: boolean) { super() }
    eq(other: CheckboxWidget) { return this.checked == other.checked }
    toDOM() {
        let wrap = document.createElement('span');
        wrap.className = "cm-boolean-toggle"
        let input = document.createElement("input")
        input.type = "checkbox"
        input.checked = this.checked
        wrap.appendChild(input)
        return input
    }
    ignoreEvent() { return false }
}

function checkboxes(view: EditorView){
    let widgets = [];
    for(let {from, to} of view.visibleRanges) {
        syntaxTree(view.state).iterate({
            from, to,
            enter: (node) => {
                if(node.name == "BooleanLiteral") {
                    let isTrue = view.state.doc.sliceString(node.from, node.to) == "true";
                    let deco = Decoration.widget({
                        widget: new CheckboxWidget(isTrue),
                        side: 1,
                    })
                    widgets.push(deco.range(node.to))
                }
            }
        })
    }
    return Decoration.set(widgets)
}

const boolTogglePlugin = ViewPlugin.fromClass(class {
    decorations: DecorationSet

    constructor(readonly view: EditorView) {
        this.decorations = checkboxes(view)
    }

    update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
            this.decorations = checkboxes(this.view)
        }
    }
}, {
    decorations: (v) => v.decorations,
    eventHandlers: {
        mousedown: (event, view) => {
            let target = event.target as HTMLElement
            console.log(target);
            if (target.nodeName === 'INPUT' && target.parentElement!.classList.contains("cm-boolean-toggle")) {
                toggleBoolean(view, view.posAtDOM(target));
            }
        }
    }
})

function toggleBoolean(view: EditorView, pos: number){
    let before = view.state.doc.sliceString(Math.max(0, pos - 5), pos)
    let change;
    if (before == "false") {
        change = {from: pos - 5, to: pos, insert: "true"}
    }
    else if (before == "true") {
        change = {from: pos - 4, to: pos, insert: "false"}
    } else {
        return false
    }
    view.dispatch({
        changes: [change],
        selection: {anchor: pos, head: pos}
    })
    return true;
}

function boolToggle(): Extension {
    return [
        boolTogglePlugin
    ]
}

window.boolToggle = ({el, code, onChange}) => {
    const minHeightEditor = EditorView.theme({
        ".cm-content, .cm-gutter": {minHeight: "200px", whiteSpace: "pre-wrap"},
    })

    const extensions = [javascript(), basicSetup, minHeightEditor, boolToggle()];

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
