import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useMainSite } from '../context/MainSiteContext';
import { Button } from './ui/button';
import { Terminal, X, Send, Lock, ShieldCheck, Loader2 } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function ClaraCLI() {
  const { token, user } = useAuth();
  const { mainSite } = useMainSite();
  const [open, setOpen] = useState(false);
  const [accessStatus, setAccessStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState([]);
  const [cmdHistory, setCmdHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [requesting, setRequesting] = useState(false);
  const inputRef = useRef(null);
  const scrollRef = useRef(null);

  const mainSiteId = mainSite?.id;
  const isAdmin = user?.role === 'admin' || user?.is_network_admin || user?.is_system_admin;

  // Check access status when opened
  useEffect(() => {
    if (open && mainSiteId) {
      checkAccess();
    }
  }, [open, mainSiteId]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history]);

  // Focus input when opened
  useEffect(() => {
    if (open && accessStatus === 'approved' && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, accessStatus]);

  const checkAccess = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/cli/access-status/${mainSiteId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAccessStatus(data.status);
        if (data.status === 'approved' && history.length === 0) {
          setHistory([{
            type: 'system',
            text: `Clara CLI v1.0 — Connected to ${mainSite?.name || 'site'}\nType /commands to see available commands.\n`
          }]);
        }
      }
    } catch {
      setAccessStatus('error');
    } finally {
      setLoading(false);
    }
  };

  const requestAccess = async () => {
    setRequesting(true);
    try {
      const res = await fetch(`${API}/cli/request-access`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ main_site_id: mainSiteId })
      });
      if (res.ok) {
        const data = await res.json();
        setAccessStatus(data.status);
      }
    } catch {} finally {
      setRequesting(false);
    }
  };

  const executeCommand = useCallback(async (command) => {
    if (!command.trim()) return;

    // Add to visual history
    setHistory(prev => [...prev, { type: 'input', text: command }]);
    setCmdHistory(prev => [command, ...prev]);
    setHistoryIndex(-1);
    setInput('');

    // Client-side /clear
    if (command.trim() === '/clear') {
      setHistory([{ type: 'system', text: `Clara CLI v1.0 — Connected to ${mainSite?.name || 'site'}\nType /commands to see available commands.\n` }]);
      return;
    }

    try {
      const res = await fetch(`${API}/cli/execute`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ main_site_id: mainSiteId, command: command.trim() })
      });
      const data = await res.json();
      setHistory(prev => [...prev, { type: data.type || 'info', text: data.output || 'No output' }]);
    } catch {
      setHistory(prev => [...prev, { type: 'error', text: 'Connection error. Please try again.' }]);
    }
  }, [token, mainSiteId, mainSite]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      executeCommand(input);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (cmdHistory.length > 0) {
        const newIdx = Math.min(historyIndex + 1, cmdHistory.length - 1);
        setHistoryIndex(newIdx);
        setInput(cmdHistory[newIdx]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIdx = historyIndex - 1;
        setHistoryIndex(newIdx);
        setInput(cmdHistory[newIdx]);
      } else {
        setHistoryIndex(-1);
        setInput('');
      }
    }
  };

  if (!isAdmin) return null;

  const typeColor = (type) => {
    switch (type) {
      case 'error': return 'text-red-400';
      case 'warning': return 'text-amber-400';
      case 'success': return 'text-emerald-400';
      case 'input': return 'text-cyan-400';
      case 'system': return 'text-zinc-500';
      default: return 'text-zinc-300';
    }
  };

  return (
    <>
      {/* CLI Toggle Button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-6 z-40 w-11 h-11 rounded-full bg-zinc-800 border border-zinc-700 hover:border-emerald-500/50 hover:bg-zinc-700 flex items-center justify-center transition-all shadow-lg group"
        data-testid="cli-toggle-btn"
        title="Clara CLI"
      >
        <Terminal className="w-5 h-5 text-emerald-400 group-hover:text-emerald-300" />
      </button>

      {/* CLI Panel */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" data-testid="cli-panel">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />

          {/* Terminal */}
          <div className="relative w-full sm:max-w-3xl bg-[#0c0c0c] border border-zinc-800 sm:rounded-xl shadow-2xl overflow-hidden flex flex-col" style={{ height: 'min(520px, 80vh)' }}>
            {/* Title bar */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-900/80 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-medium text-zinc-300">Clara CLI</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500 font-mono">v1.0</span>
              </div>
              <button onClick={() => setOpen(false)} className="text-zinc-500 hover:text-white transition-colors" data-testid="cli-close-btn">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            {loading ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
              </div>
            ) : accessStatus !== 'approved' ? (
              /* Access Gate */
              <div className="flex-1 flex items-center justify-center p-8">
                <div className="text-center space-y-4 max-w-sm">
                  <div className="w-14 h-14 mx-auto rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center">
                    {accessStatus === 'pending' ? (
                      <ShieldCheck className="w-7 h-7 text-amber-400" />
                    ) : (
                      <Lock className="w-7 h-7 text-zinc-500" />
                    )}
                  </div>
                  {accessStatus === 'pending' ? (
                    <>
                      <h3 className="text-lg font-semibold text-white">Access Request Pending</h3>
                      <p className="text-sm text-zinc-400">
                        Your CLI access request has been submitted and is awaiting approval from Clara Support.
                        You will be notified once your request is reviewed.
                      </p>
                    </>
                  ) : accessStatus === 'denied' ? (
                    <>
                      <h3 className="text-lg font-semibold text-white">Access Denied</h3>
                      <p className="text-sm text-zinc-400">
                        Your CLI access request has been denied. Please contact Clara Support for more information.
                      </p>
                    </>
                  ) : (
                    <>
                      <h3 className="text-lg font-semibold text-white">CLI Access Required</h3>
                      <p className="text-sm text-zinc-400">
                        The Clara CLI provides server-level operations for advanced administration.
                        Access requires approval from Clara Support to ensure security and compliance.
                      </p>
                      <Button
                        onClick={requestAccess}
                        disabled={requesting}
                        className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                        data-testid="cli-request-access-btn"
                      >
                        {requesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                        Request CLI Access
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ) : (
              /* Terminal */
              <>
                <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 font-mono text-[13px] leading-relaxed" data-testid="cli-output">
                  {history.map((entry, i) => (
                    <div key={i} className={`whitespace-pre-wrap mb-1 ${typeColor(entry.type)}`}>
                      {entry.type === 'input' ? (
                        <span><span className="text-emerald-500">$</span> {entry.text}</span>
                      ) : (
                        entry.text
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2 px-4 py-3 border-t border-zinc-800 bg-zinc-900/50">
                  <span className="text-emerald-500 font-mono text-sm">$</span>
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="flex-1 bg-transparent text-white font-mono text-[13px] outline-none placeholder:text-zinc-600"
                    placeholder="Type a command..."
                    autoComplete="off"
                    spellCheck={false}
                    data-testid="cli-input"
                  />
                  <button
                    onClick={() => executeCommand(input)}
                    className="text-zinc-500 hover:text-emerald-400 transition-colors"
                    data-testid="cli-send-btn"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
