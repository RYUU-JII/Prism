import React, { useEffect, useRef } from 'react';
import { EditorView, basicSetup } from "codemirror"
import { EditorState } from "@codemirror/state"
import { html } from "@codemirror/lang-html"

const ExpertEditor = ({ code, onCodeUpdate, theme, focusLine, focusToken }) => {
  const editorRef = useRef(null);
  const viewRef = useRef(null);
  const applyingRemoteRef = useRef(false);

  useEffect(() => {
    if (editorRef.current && !viewRef.current) {
      const state = EditorState.create({
        doc: code,
        extensions: [
          basicSetup,
          html(),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !applyingRemoteRef.current) {
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
      applyingRemoteRef.current = true;
      viewRef.current.dispatch({
        changes: { from: 0, to: viewRef.current.state.doc.length, insert: code }
      });
      applyingRemoteRef.current = false;
    }
  }, [code]);

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.dataset.theme = theme;
    }
  }, [theme]);

  useEffect(() => {
    if (!viewRef.current || !focusLine) return;
    const lineNumber = Number(focusLine);
    if (!Number.isFinite(lineNumber) || lineNumber < 1) return;
    const line = viewRef.current.state.doc.line(lineNumber);
    viewRef.current.dispatch({
      selection: { anchor: line.from, head: line.to },
      scrollIntoView: true,
    });
    viewRef.current.focus();
  }, [focusLine, focusToken]);

  return <div id="expert-editor-container" className="active"><div ref={editorRef} id="expert-editor"></div></div>;
};

export default ExpertEditor;
