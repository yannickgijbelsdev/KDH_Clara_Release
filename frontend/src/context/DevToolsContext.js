import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

const DevToolsContext = createContext(null);

export const useDevTools = () => {
  const ctx = useContext(DevToolsContext);
  return ctx || { enabled: false, apiCalls: [], inspecting: false };
};

const MAX_CALLS = 200;

export const DevToolsProvider = ({ enabled, children }) => {
  const [apiCalls, setApiCalls] = useState([]);
  const [inspecting, setInspecting] = useState(false);
  const [selectedCall, setSelectedCall] = useState(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [panelTab, setPanelTab] = useState('network'); // 'network' | 'inspect' | 'snapshots'
  const originalFetch = useRef(null);
  const callIdRef = useRef(0);

  // Intercept fetch when enabled
  useEffect(() => {
    if (!enabled) return;

    originalFetch.current = window.fetch;

    window.fetch = async (...args) => {
      const [input, init] = args;
      const url = typeof input === 'string' ? input : input?.url || '';
      const method = init?.method || 'GET';
      const callId = ++callIdRef.current;
      const startTime = performance.now();

      // Only track API calls (not assets/static)
      const isApiCall = url.includes('/api/');

      if (isApiCall) {
        const entry = {
          id: callId,
          url: url.replace(/^https?:\/\/[^/]+/, ''),
          fullUrl: url,
          method: method.toUpperCase(),
          status: null,
          duration: null,
          timestamp: new Date().toISOString(),
          requestBody: null,
          responsePreview: null,
          pending: true,
        };

        // Try to capture request body
        if (init?.body) {
          try {
            entry.requestBody = typeof init.body === 'string'
              ? JSON.parse(init.body)
              : '[FormData/Blob]';
          } catch { entry.requestBody = init.body; }
        }

        setApiCalls(prev => [entry, ...prev].slice(0, MAX_CALLS));

        try {
          const response = await originalFetch.current(...args);
          const duration = Math.round(performance.now() - startTime);

          // Clone response to read body without consuming it
          const clone = response.clone();
          let preview = null;
          try {
            const text = await clone.text();
            if (text.length < 2000) {
              try { preview = JSON.parse(text); } catch { preview = text.slice(0, 500); }
            } else {
              preview = `[${(text.length / 1024).toFixed(1)} KB response]`;
            }
          } catch { /* ignore */ }

          setApiCalls(prev =>
            prev.map(c => c.id === callId ? {
              ...c, status: response.status, duration, pending: false,
              responsePreview: preview,
            } : c)
          );

          return response;
        } catch (err) {
          const duration = Math.round(performance.now() - startTime);
          setApiCalls(prev =>
            prev.map(c => c.id === callId ? {
              ...c, status: 'ERR', duration, pending: false,
              responsePreview: err.message,
            } : c)
          );
          throw err;
        }
      }

      return originalFetch.current(...args);
    };

    return () => {
      if (originalFetch.current) {
        window.fetch = originalFetch.current;
      }
    };
  }, [enabled]);

  const clearCalls = useCallback(() => setApiCalls([]), []);

  const value = {
    enabled,
    apiCalls,
    inspecting,
    setInspecting,
    selectedCall,
    setSelectedCall,
    panelOpen,
    setPanelOpen,
    panelTab,
    setPanelTab,
    clearCalls,
  };

  return (
    <DevToolsContext.Provider value={value}>
      {children}
    </DevToolsContext.Provider>
  );
};
