import {basicSetup, EditorView} from "codemirror";
import {EditorState, StateField, StateEffect} from "@codemirror/state"
import {Decoration, DecorationSet, keymap} from "@codemirror/view"

const addUnderline = StateEffect.define<{from: number, to: number}>({
    map: ({from, to}, change) => ({ from: change.mapPos(from), to: change.mapPos(to) })
})

const underlineField = StateField.define<DecorationSet>({
    create() {
        return Decoration.none
    },
    update(underlines, tr) {
        underlines = underlines.map(tr.changes)
        for(let effect of tr.effects) {
            if (effect.is(addUnderline)) {
                underlines = underlines.update({
                    add: [underlineMark.range(effect.value.from, effect.value.to)]
                })
            }
        }
        return underlines;
    },
    provide: f => EditorView.decorations.from(f)
})

const underlineMark = Decoration.mark({
    class: "cm-underline",
})

const underlineTheme = EditorView.baseTheme({
    ".cm-underline": {
        textDecoration: "underline 3px red",
    }
})

function underlineSelection(view: EditorView){
    let effects: StateEffect<unknown>[] = view.state.selection.ranges
        .filter(r => !r.empty)
        .map(r => addUnderline.of({from: r.from, to: r.to}))
    console.log(effects.length);
    if (!effects.length) return false
    if(!view.state.field(underlineField, false)) {
        effects.push(StateEffect.appendConfig.of([underlineField, underlineTheme]))
    }
    view.dispatch({
        effects
    })
    return true;
}

const underlineKeymap = keymap.of([
    {
        key: "Ctrl-u",
        preventDefault: true,
        run: underlineSelection
}])

function underlineCommand(options: {step?: number} = {}): Extension {
    return [
        underlineKeymap,
    ]
}

window.underlineCommand = ({el, code, onChange}) => {
    const minHeightEditor = EditorView.theme({
        ".cm-content, .cm-gutter": {minHeight: "200px", whiteSpace: "pre-wrap"},
    })

    const extensions = [basicSetup, minHeightEditor, underlineCommand()];

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
