import React, { useEffect, useRef } from 'react';
import { EditorView, basicSetup } from "codemirror"
import { EditorState } from "@codemirror/state"
import { html } from "@codemirror/lang-html"

const ExpertEditor = ({ code, onCodeUpdate, theme }) => {
  const editorRef = useRef(null);
  const viewRef = useRef(null);

  useEffect(() => {
    if (editorRef.current && !viewRef.current) {
      const state = EditorState.create({
        doc: code,
        extensions: [
          basicSetup,
          html(),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onCodeUpdate(update.state.doc.toString());
            }
          })
        ]
      });

      const view = new EditorView({
        state,
        parent: editorRef.current
      });
      viewRef.current = view;
    }
  }, [code, onCodeUpdate]);

  useEffect(() => {
    if (viewRef.current && code !== viewRef.current.state.doc.toString()) {
      viewRef.current.dispatch({
        changes: { from: 0, to: viewRef.current.state.doc.length, insert: code }
      });
    }
  }, [code]);

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.dataset.theme = theme;
    }
  }, [theme]);

  return <div id="expert-editor-container" className="active"><div ref={editorRef} id="expert-editor"></div></div>;
};

export default ExpertEditor;
