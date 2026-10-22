import { basicSetup } from "codemirror";
import { EditorView } from "@codemirror/view";
import { EditorState, Compartment } from "@codemirror/state";
import { StreamLanguage } from "@codemirror/language";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { sql } from "@codemirror/lang-sql";
import { python } from "@codemirror/lang-python";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { markdown } from "@codemirror/lang-markdown";
import { go } from "@codemirror/legacy-modes/mode/go";
import { shell } from "@codemirror/legacy-modes/mode/shell";

const language = new Compartment();

const theme = EditorView.theme(
  {
    "&": {
      backgroundColor: "#0F120D",
      color: "#EEF1E8",
      height: "100%",
    },
    ".cm-content": {
      caretColor: "#A8C66C",
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: "13px",
      lineHeight: "1.55",
      padding: "8px 0 40px",
    },
    ".cm-scroller": {
      fontFamily: "'IBM Plex Mono', monospace",
      overflow: "auto",
    },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#A8C66C" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
      backgroundColor: "#33421F",
    },
    ".cm-panels": {
      backgroundColor: "#171B14",
      color: "#EEF1E8",
    },
    ".cm-gutters": {
      backgroundColor: "#0F120D",
      color: "#566050",
      border: "none",
    },
    ".cm-activeLine": { backgroundColor: "#171B14" },
    ".cm-activeLineGutter": { backgroundColor: "#171B14", color: "#A3AA99" },
    ".cm-foldPlaceholder": { backgroundColor: "#20261C", border: "none", color: "#A3AA99" },
    ".cm-tooltip": { backgroundColor: "#20261C", border: "1px solid #31392B" },
    ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
      backgroundColor: "#2B3520",
      color: "#EEF1E8",
    },
    ".cm-searchMatch": { backgroundColor: "#3A4727" },
    ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "#526735" },
  },
  { dark: true },
);

function languageFor(name) {
  switch (name) {
    case "javascript":
    case "jsx":
      return javascript({ jsx: true });
    case "typescript":
    case "tsx":
      return javascript({ jsx: name === "tsx", typescript: true });
    case "json":
      return json();
    case "sql":
      return sql();
    case "python":
      return python();
    case "html":
      return html();
    case "css":
      return css();
    case "markdown":
      return markdown();
    case "go":
      return StreamLanguage.define(go);
    case "shell":
      return StreamLanguage.define(shell);
    default:
      return [];
  }
}

const view = new EditorView({
  parent: document.getElementById("editor"),
  state: EditorState.create({
    doc: "",
    extensions: [
      basicSetup,
      theme,
      EditorView.lineWrapping,
      language.of([]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged && window.TophAndroid?.onChange) {
          window.TophAndroid.onChange(update.state.doc.toString());
        }
      }),
    ],
  }),
});

window.TophEditor = {
  setValue(value, languageName) {
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
        effects: language.reconfigure(languageFor(languageName)),
      });
    } else {
      view.dispatch({ effects: language.reconfigure(languageFor(languageName)) });
    }
  },
  getValue() {
    return view.state.doc.toString();
  },
  focus() {
    view.focus();
  },
  ready: true,
};
