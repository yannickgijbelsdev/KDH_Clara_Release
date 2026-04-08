import { createContext, useContext, useState, useCallback } from 'react';

const ClaraAssistantContext = createContext({});

export function ClaraAssistantProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState('seo'); // 'seo' | 'error'
  const [initialError, setInitialError] = useState('');
  const [errorContext, setErrorContext] = useState('');
  const [editorContent, setEditorContent] = useState('');
  const [editorTitle, setEditorTitle] = useState('');
  const [insertContentFn, setInsertContentFn] = useState(null);
  const [insertTitleFn, setInsertTitleFn] = useState(null);
  const [initialMessage, setInitialMessage] = useState('');
  const [voiceCallRequested, setVoiceCallRequested] = useState(false);

  const openClara = useCallback((openMode = 'seo', opts = {}) => {
    setMode(openMode);
    setInitialError(opts.errorMessage || '');
    setErrorContext(opts.errorContext || '');
    setInitialMessage(opts.initialMessage || '');
    setIsOpen(true);
  }, []);

  const closeClara = useCallback(() => {
    setIsOpen(false);
    setInitialError('');
    setErrorContext('');
  }, []);

  const requestVoiceCall = useCallback(() => {
    setIsOpen(false);
    setVoiceCallRequested(true);
  }, []);

  const clearVoiceCallRequest = useCallback(() => {
    setVoiceCallRequested(false);
  }, []);

  const registerEditor = useCallback((content, title, onInsertContent, onInsertTitle) => {
    setEditorContent(content || '');
    setEditorTitle(title || '');
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
      isOpen,
      mode,
      initialError,
      initialMessage,
      errorContext,
      openClara,
      closeClara,
      editorContent,
      editorTitle,
      insertContentFn,
      insertTitleFn,
      registerEditor,
      unregisterEditor,
      voiceCallRequested,
      requestVoiceCall,
      clearVoiceCallRequest,
    }}>
      {children}
    </ClaraAssistantContext.Provider>
  );
}

export function useClaraAssistant() {
  return useContext(ClaraAssistantContext);
}

export default ClaraAssistantContext;
