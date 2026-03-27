import { useCallback, useRef } from 'react';
import { type OnMount } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';

export function useEditorToolbar() {
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

  const handleEditorMount: OnMount = useCallback((editor) => {
    editorRef.current = editor;
  }, []);

  const wrapSelection = useCallback((prefix: string, suffix: string = prefix) => {
    const editor = editorRef.current;
    if (!editor) return;

    const selection = editor.getSelection();
    const model = editor.getModel();
    if (!selection || !model) return;

    const selectedText = model.getValueInRange(selection);
    const newText = `${prefix}${selectedText}${suffix}`;
    editor.executeEdits('toolbar', [{ range: selection, text: newText, forceMoveMarkers: true }]);

    if (!selectedText) {
      const position = editor.getPosition();
      if (position) {
        editor.setPosition({ lineNumber: position.lineNumber, column: position.column - suffix.length });
      }
    }

    editor.focus();
  }, []);

  const prefixLine = useCallback((prefix: string) => {
    const editor = editorRef.current;
    if (!editor) return;

    const position = editor.getPosition();
    const model = editor.getModel();
    if (!position || !model) return;

    const lineContent = model.getLineContent(position.lineNumber);
    if (lineContent.startsWith(prefix)) {
      editor.executeEdits('toolbar', [{
        range: {
          startLineNumber: position.lineNumber,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: prefix.length + 1,
        },
        text: '',
        forceMoveMarkers: true,
      }]);
    } else {
      editor.executeEdits('toolbar', [{
        range: {
          startLineNumber: position.lineNumber,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: 1,
        },
        text: prefix,
        forceMoveMarkers: true,
      }]);
    }

    editor.focus();
  }, []);

  return {
    handleEditorMount,
    prefixLine,
    wrapSelection,
  };
}
