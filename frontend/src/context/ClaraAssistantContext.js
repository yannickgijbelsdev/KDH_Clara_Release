import { createContext, useContext, useState, useCallback } from 'react';

const ClaraAssistantContext = createContext({});

export function ClaraAssistantProvider({ children }) {
  const [editorContent, setEditorContent] = useState('');
  const [editorTitle, setEditorTitle] = useState('');
  const [insertContentFn, setInsertContentFn] = useState(null);
  const [insertTitleFn, setInsertTitleFn] = useState(null);

  const registerEditor = useCallback((content, title, onInsertContent, onInsertTitle) => {
    setEditorContent(content || '');
    setEditorTitle(title || '');
    // Store callback functions wrapped to avoid state-as-function issues
    setInsertContentFn(() => onInsertContent || null);
    setInsertTitleFn(() => onInsertTitle || null);
  }, []);

  const unregisterEditor = useCallback(() => {
    setEditorContent('');
    setEditorTitle('');
    setInsertContentFn(null);
    setInsertTitleFn(null);
  }, []);

  return (
    <ClaraAssistantContext.Provider value={{
      editorContent,
      editorTitle,
      insertContentFn,
      insertTitleFn,
      registerEditor,
      unregisterEditor,
    }}>
      {children}
    </ClaraAssistantContext.Provider>
  );
}

export function useClaraAssistant() {
  return useContext(ClaraAssistantContext);
}

export default ClaraAssistantContext;
