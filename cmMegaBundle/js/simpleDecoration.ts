import {basicSetup, EditorView} from "codemirror";
import {EditorState, StateField, StateEffect} from "@codemirror/state"
import {Decoration, DecorationSet, keymap, MatchDecorator, ViewPlugin, WidgetType} from "@codemirror/view"
const regexDecoration = (editorView) => {
    const regex = /PD\.(\w+)\([^)]*\)/g;
    const decorations = [];
    const { doc } = editorView.state;

    // Only iterate through visible ranges
    for (let range of editorView.visibleRanges) {
        for (let pos = range.from; pos <= range.to;) {
            const { text, to } = doc.lineAt(pos);
            while ((match = regex.exec(text)) !== null) {
                const fromPos = pos + match.index;
                const toPos = pos + match.index + match[0].length;

                const widget = document.createElement('span');
                widget.textContent = "⚙️";

                // Fetching information remotely (using a dummy URL for this example)
                fetch('https://api.example.com/data?key=' + encodeURIComponent(match[0]))
                    .then(response => response.json())
                    .then(data => {
                        widget.title = data.description;
                    });

                decorations.push(
                    EditorView.widget({
                        widget,
                        side: 1
                    }).range(fromPos)
                );
            }

            pos = to + 1;
        }
    }

    return decorations;
};

const highlighterExtension = EditorView.decorations.compute([
    EditorState
], (view) => {
    return regexDecoration(view);
});

window["simpleDecoration"] = ({el, code, onChange}) => {
    const minHeightEditor = EditorView.theme({
        ".cm-content, .cm-gutter": {minHeight: "200px", whiteSpace: "pre-wrap"},
    })

    const extensions = [basicSetup, minHeightEditor, highlighterExtension];

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
        extensions,
        parent: el,
        lineWrapping: true,
    })
}
