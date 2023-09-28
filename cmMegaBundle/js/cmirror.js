import {EditorView, basicSetup} from "codemirror"
import {javascript} from "@codemirror/lang-javascript"

window.CodeMirror = ({el, code, onChange}) => {
    console.log('CodeMirror', el, code, onChange);
    const minHeightEditor = EditorView.theme({
        ".cm-content, .cm-gutter": {minHeight: "200px", whiteSpace: "pre-wrap"},
    })

    const extensions = [basicSetup, minHeightEditor]

    if (onChange)
        extensions.push(EditorView.updateListener.of((v) => {
            if (v.docChanged) {
                onChange(v.state.doc.toString())
            }
        }))
    
    return new EditorView({
        extensions,
        parent: el,
        doc: code,
        lineWrapping: true,
    })
}
