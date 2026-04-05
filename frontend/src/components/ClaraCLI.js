import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useMainSite } from '../context/MainSiteContext';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Terminal, X, Send, Lock, ShieldCheck, Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';
import CLISaveWizard from './CLISaveWizard';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Commands that modify data and should show the save wizard
const WRITE_PREFIXES = [
  '/license assign', '/license remove',
  '/site update', '/site rename', '/site delete',
  '/user add', '/user remove', '/user update', '/user role',
  '/feature enable', '/feature disable',
  '/role create', '/role delete', '/role update',
  '/team create', '/team delete', '/team update',
  '/env create', '/env delete', '/env update',
  '/config set', '/config update', '/config delete',
  '/import', '/sync', '/migrate', '/reset',
  '/backup create', '/backup restore',
];

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
  const [showSaveWizard, setShowSaveWizard] = useState(false);
  const [featureConfig, setFeatureConfig] = useState(null);
  const [savingFeatures, setSavingFeatures] = useState(false);
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

  const isWriteCommand = useCallback((cmd) => {
    const lower = cmd.trim().toLowerCase();
    return WRITE_PREFIXES.some(prefix => lower.startsWith(prefix));
  }, []);

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

    const isWrite = isWriteCommand(command);
    if (isWrite) {
      setShowSaveWizard(true);
    }

    try {
      const res = await fetch(`${API}/cli/execute`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ main_site_id: mainSiteId, command: command.trim() })
      });
      const data = await res.json();
      setHistory(prev => [...prev, { type: data.type || 'info', text: data.output || 'No output' }]);
      // Handle feature configuration wizard
      if (data.type === 'feature_config' && data.data) {
        setFeatureConfig(data.data);
      }
    } catch {
      setHistory(prev => [...prev, { type: 'error', text: 'Connection error. Please try again.' }]);
      if (isWrite) setShowSaveWizard(false);
    }
  }, [token, mainSiteId, mainSite, isWriteCommand]);

  const toggleFeatureConfig = (featureId) => {
    if (!featureConfig) return;
    setFeatureConfig(prev => ({
      ...prev,
      features: prev.features.map(f => f.id === featureId ? { ...f, enabled: !f.enabled } : f)
    }));
  };

  const saveFeatureConfig = async () => {
    if (!featureConfig) return;
    setSavingFeatures(true);
    try {
      const enabled = featureConfig.features.filter(f => f.enabled).map(f => f.id);
      const res = await fetch(`${API}/cli/features-config/${featureConfig.main_site_id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ features: enabled })
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.output || 'Features updated');
        setHistory(prev => [...prev, { type: 'success', text: data.output || 'Features updated' }]);
        setFeatureConfig(null);
      } else {
        toast.error(data.detail || 'Save failed');
      }
    } catch {
      toast.error('Connection error');
    }
    setSavingFeatures(false);
  };

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
      default: return 'text-zinc-600';
    }
  };

  return (
    <>
      {/* CLI Toggle Button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-6 z-40 w-11 h-11 rounded-full bg-zinc-800 border border-zinc-300 hover:border-emerald-500/50 hover:bg-zinc-700 flex items-center justify-center transition-all shadow-lg group"
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
          <div className="relative w-full sm:max-w-3xl bg-white border border-zinc-200 sm:rounded-xl shadow-2xl overflow-hidden flex flex-col" style={{ height: 'min(520px, 80vh)' }}>
            {/* Title bar */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-white/70 border-b border-zinc-200">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-medium text-zinc-600">Clara CLI</span>
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
                  <div className="w-14 h-14 mx-auto rounded-full bg-zinc-800 border border-zinc-300 flex items-center justify-center">
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
                <div className="flex items-center gap-2 px-4 py-3 border-t border-zinc-200 bg-white/60">
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

      <CLISaveWizard
        open={showSaveWizard}
        onClose={() => setShowSaveWizard(false)}
      />

      {/* Feature Configuration Dialog */}
      <Dialog open={!!featureConfig} onOpenChange={(open) => { if (!open) setFeatureConfig(null); }}>
        <DialogContent className="bg-zinc-900 border-zinc-300 max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">
              Feature Configuration — {featureConfig?.site_name}
            </DialogTitle>
            <p className="text-xs text-zinc-500">Toggle features on/off for this {featureConfig?.site_type?.replace('_', ' ')} site</p>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            {featureConfig?.features?.map(f => (
              <button key={f.id} onClick={() => toggleFeatureConfig(f.id)}
                className={`w-full flex items-center gap-3 p-2.5 rounded-lg border text-left transition-all ${
                  f.enabled ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-zinc-800/50 border-zinc-300 hover:border-zinc-600'
                }`} data-testid={`feature-toggle-${f.id}`}>
                <div className={`w-5 h-5 rounded flex items-center justify-center ${f.enabled ? 'bg-emerald-500 text-white' : 'bg-zinc-700'}`}>
                  {f.enabled && <Check className="w-3 h-3" />}
                </div>
                <span className={`text-sm ${f.enabled ? 'text-zinc-200' : 'text-zinc-500'}`}>{f.name}</span>
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFeatureConfig(null)}>Cancel</Button>
            <Button onClick={saveFeatureConfig} disabled={savingFeatures} data-testid="save-feature-config-btn">
              {savingFeatures ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Save Configuration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
