import { useState, useEffect, useRef, useCallback } from 'react';
import { useMainSite } from '../context/MainSiteContext';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import {
  Code2, HeadphonesIcon, Send, Loader2, Plus, Trash2,
  ChevronLeft, Copy, Check, Eye, EyeOff, X
} from 'lucide-react';
import axios from 'axios';

const API = process.env.REACT_APP_BACKEND_URL;

const MODE_CONFIG = {
  code: {
    label: 'Code Assistant',
    description: 'Generate HTML, CSS & JS code that integrates with your Clara endpoints.',
    icon: Code2,
    color: 'from-violet-500 to-indigo-600',
    bgLight: 'bg-violet-50',
    borderLight: 'border-violet-200',
    textAccent: 'text-violet-600',
    btnBg: 'bg-violet-600 hover:bg-violet-500',
  },
  support: {
    label: 'Enterprise Support',
    description: 'Advanced technical troubleshooting, security settings, and site analytics.',
    icon: HeadphonesIcon,
    color: 'from-orange-500 to-amber-600',
    bgLight: 'bg-orange-50',
    borderLight: 'border-orange-200',
    textAccent: 'text-orange-600',
    btnBg: 'bg-orange-600 hover:bg-orange-500',
  },
};

function extractCodeBlock(text) {
  const match = text.match(/```html\n?([\s\S]*?)```/);
  return match ? match[1].trim() : null;
}

function formatMarkdown(text) {
  return text
    .replace(/```html\n?([\s\S]*?)```/g, '<pre class="bg-zinc-100 rounded-lg p-3 text-xs font-mono overflow-x-auto my-2 border border-zinc-200"><code>$1</code></pre>')
    .replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre class="bg-zinc-100 rounded-lg p-3 text-xs font-mono overflow-x-auto my-2 border border-zinc-200"><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code class="bg-zinc-100 px-1 py-0.5 rounded text-xs font-mono">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br/>');
}

export default function EnterpriseAssistantPage() {
  const { mainSite, mainSiteSlug } = useMainSite();
  const { token } = useAuth();
  const headers = { Authorization: `Bearer ${token}` };

  const [mode, setMode] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(null);
  const [previewTab, setPreviewTab] = useState('preview');
  const [copied, setCopied] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const mainSiteId = mainSite?.id;

  const fetchSessions = useCallback(async () => {
    if (!mainSiteId) return;
    try {
      const { data } = await axios.get(`${API}/api/enterprise-assistant/sessions?main_site_id=${mainSiteId}`, { headers });
      setSessions(data.sessions || []);
    } catch {}
  }, [mainSiteId]);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const loadSession = async (sessionId) => {
    try {
      const { data } = await axios.get(`${API}/api/enterprise-assistant/session/${sessionId}?main_site_id=${mainSiteId}`, { headers });
      setMessages(data.messages || []);
      setActiveSession(sessionId);
      setMode(data.mode || 'code');
    } catch {}
  };

  const startNewChat = (selectedMode) => {
    setMode(selectedMode);
    setActiveSession(null);
    setMessages([]);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const sessionId = activeSession || crypto.randomUUID();
    if (!activeSession) setActiveSession(sessionId);
    setMessages(prev => [...prev, { role: 'user', text }]);
    setInput('');
    setLoading(true);
    try {
      const { data } = await axios.post(`${API}/api/enterprise-assistant/chat`, {
        message: text, mode, session_id: sessionId, main_site_id: mainSiteId,
      }, { headers });
      setMessages(prev => [...prev, { role: 'assistant', text: data.response }]);
      fetchSessions();
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', text: 'An error occurred. Please try again.' }]);
    } finally { setLoading(false); }
  };

  const deleteSession = async (sid) => {
    try {
      await axios.delete(`${API}/api/enterprise-assistant/session/${sid}?main_site_id=${mainSiteId}`, { headers });
      setSessions(prev => prev.filter(s => s.session_id !== sid));
      if (activeSession === sid) { setActiveSession(null); setMessages([]); setMode(null); }
    } catch {}
  };

  const handleCopy = (text, idx) => {
    const code = extractCodeBlock(text);
    navigator.clipboard.writeText(code || text);
    setCopied(idx);
    setTimeout(() => setCopied(null), 2000);
  };

  // ─── Mode Selection Screen ───
  if (!mode) {
    return (
      <div className="h-full flex flex-col bg-white" data-testid="enterprise-assistant-page">
        <div className="px-6 py-4 border-b border-zinc-100">
          <h1 className="text-lg font-bold text-zinc-900 tracking-tight">Clara Enterprise Assistant</h1>
          <p className="text-xs text-zinc-400 mt-0.5">{mainSite?.name}</p>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-2xl w-full">
            <div className="text-center mb-10">
              <h2 className="text-2xl font-bold text-zinc-900 mb-2">What would you like to do?</h2>
              <p className="text-zinc-400 text-sm">Choose an assistant mode to get started</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {Object.entries(MODE_CONFIG).map(([key, cfg]) => {
                const Icon = cfg.icon;
                return (
                  <button key={key} onClick={() => startNewChat(key)}
                    className={`group relative p-6 rounded-2xl border ${cfg.borderLight} ${cfg.bgLight} hover:shadow-md transition-all text-left`}
                    data-testid={`mode-select-${key}`}>
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${cfg.color} flex items-center justify-center mb-4`}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <h3 className="text-zinc-900 font-semibold mb-1">{cfg.label}</h3>
                    <p className="text-zinc-500 text-xs leading-relaxed">{cfg.description}</p>
                  </button>
                );
              })}
            </div>
            {sessions.length > 0 && (
              <div className="mt-10">
                <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3">Recent conversations</h3>
                <div className="space-y-1">
                  {sessions.slice(0, 5).map(s => (
                    <button key={s.session_id} onClick={() => loadSession(s.session_id)}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-zinc-50 transition-colors text-left">
                      <div className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 ${s.mode === 'code' ? 'bg-violet-100 text-violet-500' : 'bg-orange-100 text-orange-500'}`}>
                        {s.mode === 'code' ? <Code2 className="w-3 h-3" /> : <HeadphonesIcon className="w-3 h-3" />}
                      </div>
                      <span className="text-sm text-zinc-600 truncate flex-1">{s.title}</span>
                      <span className="text-[10px] text-zinc-300">{new Date(s.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const cfg = MODE_CONFIG[mode];
  const CfgIcon = cfg.icon;

  return (
    <div className="h-full flex bg-white" data-testid="enterprise-chat-view">
      {/* Sidebar */}
      {sidebarOpen && (
        <div className="w-56 border-r border-zinc-100 flex flex-col bg-zinc-50/50 flex-shrink-0">
          <div className="p-3">
            <Button onClick={() => startNewChat(mode)} className="w-full justify-start gap-2 bg-zinc-900 hover:bg-zinc-800 text-white border-0 h-9 text-xs" data-testid="new-chat-btn">
              <Plus className="w-3.5 h-3.5" /> New chat
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
            {sessions.filter(s => s.mode === mode).map(s => (
              <div key={s.session_id}
                className={`group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-colors ${activeSession === s.session_id ? 'bg-white shadow-sm border border-zinc-200' : 'hover:bg-white/60'}`}
                onClick={() => loadSession(s.session_id)}>
                <span className="text-xs text-zinc-600 truncate flex-1">{s.title}</span>
                <button onClick={(e) => { e.stopPropagation(); deleteSession(s.session_id); }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-400 hover:text-red-500">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
          <div className="p-3 border-t border-zinc-100">
            <button onClick={() => setMode(null)} className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-white transition-colors text-xs text-zinc-400">
              <ChevronLeft className="w-3.5 h-3.5" /> Switch mode
            </button>
          </div>
        </div>
      )}

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="px-5 py-3 border-b border-zinc-100 flex items-center gap-3 flex-shrink-0">
          {!sidebarOpen && (
            <button onClick={() => setSidebarOpen(true)} className="text-zinc-400 hover:text-zinc-600 mr-1">
              <ChevronLeft className="w-4 h-4 rotate-180" />
            </button>
          )}
          <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${cfg.color} flex items-center justify-center`}>
            <CfgIcon className="w-3.5 h-3.5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-zinc-900">Clara Enterprise Assistant</h2>
            <p className="text-[10px] text-zinc-400">{cfg.label} — {mainSite?.name}</p>
          </div>
          {sidebarOpen && (
            <button onClick={() => setSidebarOpen(false)} className="text-zinc-300 hover:text-zinc-500 transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
            {messages.length === 0 && (
              <div className="text-center py-20">
                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${cfg.color} flex items-center justify-center mx-auto mb-4`}>
                  <CfgIcon className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-zinc-900 mb-1">
                  {mode === 'code' ? 'What would you like to build?' : 'How can I help?'}
                </h3>
                <p className="text-zinc-400 text-sm max-w-md mx-auto">
                  {mode === 'code'
                    ? "I'll generate HTML, CSS & JS code that connects to your station's API endpoints."
                    : 'Ask me anything about your Clara platform — security, stats, troubleshooting, and more.'}
                </p>
              </div>
            )}

            {messages.map((msg, idx) => {
              const isUser = msg.role === 'user';
              const codeBlock = !isUser ? extractCodeBlock(msg.text) : null;
              return (
                <div key={idx} className={`flex gap-3 ${isUser ? 'justify-end' : ''}`}>
                  {!isUser && (
                    <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${cfg.color} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                      <CfgIcon className="w-3.5 h-3.5 text-white" />
                    </div>
                  )}
                  <div className="max-w-[85%]">
                    <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                      isUser
                        ? 'bg-zinc-900 text-white rounded-br-md'
                        : 'bg-zinc-50 border border-zinc-200 text-zinc-700 rounded-bl-md'
                    }`}>
                      {isUser ? (
                        <p className="whitespace-pre-wrap">{msg.text}</p>
                      ) : (
                        <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: formatMarkdown(msg.text) }} />
                      )}
                    </div>
                    {codeBlock && (
                      <div className="flex items-center gap-1.5 mt-2 ml-1">
                        <button onClick={() => handleCopy(msg.text, idx)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-500 hover:text-zinc-700 text-[11px] transition-colors"
                          data-testid={`copy-code-${idx}`}>
                          {copied === idx ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                          {copied === idx ? 'Copied' : 'Copy code'}
                        </button>
                        <button onClick={() => { setShowPreview(showPreview === idx ? null : idx); setPreviewTab('preview'); }}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-500 hover:text-zinc-700 text-[11px] transition-colors"
                          data-testid={`preview-code-${idx}`}>
                          {showPreview === idx ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                          {showPreview === idx ? 'Hide preview' : 'Live preview'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {loading && (
              <div className="flex gap-3">
                <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${cfg.color} flex items-center justify-center flex-shrink-0`}>
                  <CfgIcon className="w-3.5 h-3.5 text-white" />
                </div>
                <div className="px-4 py-3 rounded-2xl bg-zinc-50 border border-zinc-200">
                  <div className="flex items-center gap-2 text-zinc-400 text-sm">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Thinking...
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input */}
        <div className="border-t border-zinc-100 p-4">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-end gap-3">
              <div className="flex-1 bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 focus-within:border-zinc-400 transition-colors">
                <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder={mode === 'code' ? 'Describe the widget or code you need...' : 'Ask a question about your platform...'}
                  rows={1} className="w-full bg-transparent text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none resize-none min-h-[22px] max-h-[120px]"
                  data-testid="enterprise-chat-input" />
              </div>
              <Button onClick={handleSend} disabled={!input.trim() || loading}
                className={`h-11 w-11 rounded-xl p-0 flex-shrink-0 ${cfg.btnBg} text-white border-0`}
                data-testid="enterprise-send-btn">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
            <p className="text-[10px] text-zinc-300 mt-2 text-center">Clara Enterprise {cfg.label} — {mainSite?.name}</p>
          </div>
        </div>
      </div>

      {/* ─── Preview Panel ─── */}
      {showPreview !== null && (() => {
        const msg = messages[showPreview];
        const code = msg ? extractCodeBlock(msg.text) : null;
        if (!code) return null;
        const watermarkHtml = code.includes('</body>')
          ? code.replace('</body>', `<div style="position:fixed;bottom:12px;right:12px;background:rgba(0,0,0,0.8);color:#a78bfa;font-size:10px;padding:4px 10px;border-radius:20px;font-family:system-ui;z-index:9999;">Generated by Clara Enterprise Code Assistant</div></body>`)
          : code + `<div style="position:fixed;bottom:12px;right:12px;background:rgba(0,0,0,0.8);color:#a78bfa;font-size:10px;padding:4px 10px;border-radius:20px;font-family:system-ui;z-index:9999;">Generated by Clara Enterprise Code Assistant</div>`;
        return (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowPreview(null)} data-testid="preview-backdrop" />
            <div className="fixed top-[64px] right-0 bottom-0 z-50 w-[560px] max-w-[80vw] bg-white border-l border-zinc-200 shadow-2xl flex flex-col animate-[slide-in-right_0.25s_ease-out]" data-testid="preview-panel">
              <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
                    <Code2 className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-900">Code Output</h3>
                    <p className="text-[10px] text-zinc-400">Clara Enterprise Code Assistant</p>
                  </div>
                </div>
                <button onClick={() => setShowPreview(null)} className="w-7 h-7 rounded-lg hover:bg-zinc-100 flex items-center justify-center text-zinc-400 hover:text-zinc-600 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex border-b border-zinc-100">
                <button onClick={() => setPreviewTab('preview')}
                  className={`flex-1 px-4 py-2.5 text-xs font-medium transition-colors ${previewTab === 'preview' ? 'text-violet-600 border-b-2 border-violet-500' : 'text-zinc-400 hover:text-zinc-600'}`}>
                  <Eye className="w-3 h-3 inline mr-1.5" />Live Preview
                </button>
                <button onClick={() => setPreviewTab('code')}
                  className={`flex-1 px-4 py-2.5 text-xs font-medium transition-colors ${previewTab === 'code' ? 'text-violet-600 border-b-2 border-violet-500' : 'text-zinc-400 hover:text-zinc-600'}`}>
                  <Code2 className="w-3 h-3 inline mr-1.5" />Source Code
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                {previewTab === 'preview' ? (
                  <div className="h-full flex flex-col">
                    <div className="flex items-center gap-2 px-3 py-2 bg-zinc-50 border-b border-zinc-100">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 rounded-full bg-red-400" />
                        <div className="w-2 h-2 rounded-full bg-yellow-400" />
                        <div className="w-2 h-2 rounded-full bg-green-400" />
                      </div>
                      <div className="flex-1 bg-white rounded-md px-3 py-1 border border-zinc-100">
                        <span className="text-[10px] text-zinc-400 font-mono">preview://localhost</span>
                      </div>
                    </div>
                    <iframe srcDoc={watermarkHtml} title="Preview" className="flex-1 w-full bg-white" style={{ border: 'none' }} sandbox="allow-scripts allow-same-origin" />
                  </div>
                ) : (
                  <div className="h-full overflow-auto p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[10px] text-zinc-400 font-mono uppercase tracking-wider">HTML</span>
                      <button onClick={() => { navigator.clipboard.writeText(code); setCopied('panel'); setTimeout(() => setCopied(null), 2000); }}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-500 text-[11px] transition-colors">
                        {copied === 'panel' ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                        {copied === 'panel' ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <pre className="text-xs text-zinc-700 font-mono leading-relaxed whitespace-pre-wrap break-all bg-zinc-50 rounded-xl p-4 border border-zinc-200">
                      <code>{code}</code>
                    </pre>
                    <div className="mt-4 flex items-center gap-2 text-[10px] text-zinc-400">
                      <div className="w-4 h-4 rounded bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
                        <Code2 className="w-2.5 h-2.5 text-white" />
                      </div>
                      Generated by Clara Enterprise Code Assistant
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
}
