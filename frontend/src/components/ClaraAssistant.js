import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import {
  Sparkles, X, Send, FileText, AlertTriangle, Loader2,
  Copy, Check, Wand2, ArrowLeft, RotateCcw
} from 'lucide-react';
import { Button } from './ui/button';
import { toast } from 'sonner';
import { useClaraAssistant } from '../context/ClaraAssistantContext';

const API = process.env.REACT_APP_BACKEND_URL;

const MODE_CONFIG = {
  seo: {
    label: 'SEO Schrijfhulp',
    icon: FileText,
    placeholder: 'Beschrijf je artikel onderwerp of plak je tekst...',
    color: 'from-orange-500 to-amber-500',
  },
  error: {
    label: 'Foutmelding Hulp',
    icon: AlertTriangle,
    placeholder: 'Plak de foutmelding of beschrijf het probleem...',
    color: 'from-red-500 to-rose-500',
  },
};

export default function ClaraAssistant() {
  const { token } = useAuth();
  const { editorContent, editorTitle, insertContentFn, insertTitleFn } = useClaraAssistant();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('seo');
  const [view, setView] = useState('chat'); // 'chat' | 'generate' | 'improve'
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [copied, setCopied] = useState(null);
  const [generateTopic, setGenerateTopic] = useState('');
  const [generateKeywords, setGenerateKeywords] = useState('');
  const [generateLength, setGenerateLength] = useState('medium');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const resetChat = () => {
    setMessages([]);
    setSessionId(null);
    setInput('');
    setView('chat');
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setLoading(true);

    try {
      const res = await axios.post(`${API}/api/clara-assistant/chat`, {
        message: userMsg,
        session_id: sessionId,
        mode,
        content_context: mode === 'seo' ? editorContent : '',
      }, { headers });

      setSessionId(res.data.session_id);
      setMessages(prev => [...prev, { role: 'assistant', text: res.data.response }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Sorry, er ging iets mis. Probeer het opnieuw.', error: true }]);
    }
    setLoading(false);
  };

  const generateArticle = async () => {
    if (!generateTopic.trim() || loading) return;
    setLoading(true);
    setMessages([
      { role: 'user', text: `Genereer een SEO-artikel over: ${generateTopic}` },
      { role: 'assistant', text: '...', loading: true },
    ]);
    setView('chat');

    try {
      const res = await axios.post(`${API}/api/clara-assistant/seo/generate`, {
        topic: generateTopic,
        keywords: generateKeywords,
        length: generateLength,
      }, { headers });

      setMessages([
        { role: 'user', text: `Genereer een SEO-artikel over: ${generateTopic}` },
        {
          role: 'assistant',
          text: `**${res.data.title}**\n\n${res.data.body}\n\n*Meta: ${res.data.meta_description}*`,
          generated: true,
          title: res.data.title,
          body: res.data.body,
          meta: res.data.meta_description,
        },
      ]);
      setSessionId(res.data.session_id);
    } catch (err) {
      setMessages([{ role: 'assistant', text: 'Genereren mislukt. Controleer je verbinding.', error: true }]);
    }
    setLoading(false);
  };

  const improveContent = async () => {
    if (!editorContent || loading) return;
    setLoading(true);
    setMessages([
      { role: 'user', text: 'Verbeter mijn huidige content voor SEO' },
      { role: 'assistant', text: '...', loading: true },
    ]);
    setView('chat');

    try {
      const res = await axios.post(`${API}/api/clara-assistant/seo/improve`, {
        content: editorContent,
        title: editorTitle || '',
        keywords: generateKeywords,
      }, { headers });

      setMessages([
        { role: 'user', text: 'Verbeter mijn huidige content voor SEO' },
        {
          role: 'assistant',
          text: `**SEO Score: ${res.data.score}**\n\n${res.data.analysis}\n\n---\n\n${res.data.improved_content}\n\n*Meta: ${res.data.meta_description}*`,
          improved: true,
          body: res.data.improved_content,
          meta: res.data.meta_description,
          score: res.data.score,
        },
      ]);
      setSessionId(res.data.session_id);
    } catch (err) {
      setMessages([{ role: 'assistant', text: 'Analyse mislukt. Controleer je verbinding.', error: true }]);
    }
    setLoading(false);
  };

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
    toast.success('Gekopieerd!');
  };

  const insertIntoEditor = (msg) => {
    if (msg.body && insertContentFn) {
      insertContentFn(msg.body);
      toast.success('Content ingevoegd in editor');
    }
    if (msg.title && insertTitleFn) {
      insertTitleFn(msg.title);
    }
    setOpen(false);
  };

  const ModeIcon = MODE_CONFIG[mode].icon;

  return (
    <>
      {/* Floating Button */}
      <AnimatePresence>
        {!open && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            onClick={() => setOpen(true)}
            className="fixed bottom-6 right-6 z-[80] w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40 hover:scale-105 transition-all flex items-center justify-center"
            data-testid="clara-assistant-btn"
          >
            <Sparkles className="w-6 h-6" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Panel */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[89] bg-black/20 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ x: 400, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 400, opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="fixed right-0 top-0 bottom-0 z-[90] w-full max-w-md bg-white shadow-2xl flex flex-col"
              data-testid="clara-assistant-panel"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${MODE_CONFIG[mode].color} flex items-center justify-center`}>
                    <Sparkles className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="font-bold text-zinc-900 text-base">Clara Assistent</h2>
                    <p className="text-xs text-zinc-400">{MODE_CONFIG[mode].label}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" onClick={resetChat} className="rounded-xl text-zinc-400 hover:text-zinc-700" data-testid="clara-reset-btn">
                    <RotateCcw className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setOpen(false)} className="rounded-xl text-zinc-400 hover:text-zinc-700" data-testid="clara-close-btn">
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Mode Tabs */}
              <div className="flex gap-1 px-4 py-2 border-b border-zinc-100 bg-zinc-50/50">
                {Object.entries(MODE_CONFIG).map(([key, cfg]) => {
                  const Icon = cfg.icon;
                  return (
                    <button
                      key={key}
                      onClick={() => { setMode(key); resetChat(); }}
                      className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-medium transition-all ${
                        mode === key ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-400 hover:text-zinc-600'
                      }`}
                      data-testid={`clara-mode-${key}`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {cfg.label}
                    </button>
                  );
                })}
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto">
                {messages.length === 0 && view === 'chat' ? (
                  /* Empty State - Quick Actions */
                  <div className="p-5 space-y-3">
                    {mode === 'seo' ? (
                      <>
                        <p className="text-sm text-zinc-500 mb-4">Hoe kan ik je helpen met je content?</p>

                        <button
                          onClick={() => setView('generate')}
                          className="w-full p-4 bg-zinc-50 hover:bg-zinc-100 rounded-2xl text-left transition-colors border border-zinc-100"
                          data-testid="clara-action-generate"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center">
                              <Wand2 className="w-5 h-5 text-orange-500" />
                            </div>
                            <div>
                              <p className="font-medium text-zinc-900 text-sm">Nieuw artikel genereren</p>
                              <p className="text-xs text-zinc-400">SEO-geoptimaliseerd artikel op basis van een onderwerp</p>
                            </div>
                          </div>
                        </button>

                        <button
                          onClick={improveContent}
                          disabled={!editorContent}
                          className={`w-full p-4 rounded-2xl text-left transition-colors border border-zinc-100 ${
                            editorContent ? 'bg-zinc-50 hover:bg-zinc-100' : 'bg-zinc-50 opacity-50 cursor-not-allowed'
                          }`}
                          data-testid="clara-action-improve"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                              <FileText className="w-5 h-5 text-blue-500" />
                            </div>
                            <div>
                              <p className="font-medium text-zinc-900 text-sm">Huidige content verbeteren</p>
                              <p className="text-xs text-zinc-400">
                                {editorContent ? 'Analyseer en verbeter je tekst voor SEO' : 'Open eerst een artikel in de editor'}
                              </p>
                            </div>
                          </div>
                        </button>

                        <div className="pt-2 border-t border-zinc-100">
                          <p className="text-xs text-zinc-400 mb-2">Of stel een vraag over SEO...</p>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="text-sm text-zinc-500 mb-4">Beschrijf de foutmelding die je ziet, en ik help je het op te lossen.</p>
                        <div className="space-y-2">
                          {[
                            'Failed to publish to WordPress',
                            'Cloudflare WAF sync failed',
                            'RDS data is not updating',
                            'Stream monitor shows offline',
                          ].map(example => (
                            <button
                              key={example}
                              onClick={() => { setInput(example); }}
                              className="w-full px-4 py-2.5 bg-zinc-50 hover:bg-zinc-100 rounded-xl text-left text-sm text-zinc-600 transition-colors border border-zinc-100"
                            >
                              {example}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                ) : view === 'generate' ? (
                  /* Generate Form */
                  <div className="p-5 space-y-4">
                    <button onClick={() => setView('chat')} className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-600">
                      <ArrowLeft className="w-3.5 h-3.5" /> Terug
                    </button>
                    <div>
                      <label className="text-xs font-medium text-zinc-500 mb-1.5 block">Onderwerp *</label>
                      <input
                        value={generateTopic}
                        onChange={e => setGenerateTopic(e.target.value)}
                        placeholder="bijv. De toekomst van DAB+ radio in Belgie"
                        className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                        data-testid="clara-topic-input"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-zinc-500 mb-1.5 block">Keywords (optioneel)</label>
                      <input
                        value={generateKeywords}
                        onChange={e => setGenerateKeywords(e.target.value)}
                        placeholder="bijv. DAB+, digitale radio, FM"
                        className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                        data-testid="clara-keywords-input"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-zinc-500 mb-1.5 block">Lengte</label>
                      <div className="flex gap-2">
                        {[['short', 'Kort'], ['medium', 'Middel'], ['long', 'Lang']].map(([val, label]) => (
                          <button
                            key={val}
                            onClick={() => setGenerateLength(val)}
                            className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all ${
                              generateLength === val ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <Button
                      onClick={generateArticle}
                      disabled={!generateTopic.trim() || loading}
                      className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white rounded-xl gap-2"
                      data-testid="clara-generate-btn"
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                      Genereer Artikel
                    </Button>
                  </div>
                ) : (
                  /* Chat Messages */
                  <div className="p-4 space-y-3">
                    {messages.map((msg, i) => (
                      <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                          msg.role === 'user'
                            ? 'bg-zinc-900 text-white'
                            : msg.error
                              ? 'bg-red-50 text-red-700 border border-red-100'
                              : 'bg-zinc-50 text-zinc-700 border border-zinc-100'
                        }`}>
                          {msg.loading ? (
                            <div className="flex items-center gap-2">
                              <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
                              <span className="text-sm text-zinc-400">Clara denkt na...</span>
                            </div>
                          ) : (
                            <>
                              <div className="text-sm whitespace-pre-wrap leading-relaxed" dangerouslySetInnerHTML={{ __html: formatResponse(msg.text) }} />
                              {msg.role === 'assistant' && !msg.error && (
                                <div className="flex items-center gap-1 mt-2 pt-2 border-t border-zinc-200/50">
                                  <button
                                    onClick={() => copyToClipboard(msg.body || msg.text, i)}
                                    className="p-1.5 rounded-lg hover:bg-white/80 text-zinc-400 hover:text-zinc-600 transition-colors"
                                    data-testid={`clara-copy-${i}`}
                                  >
                                    {copied === i ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                                  </button>
                                  {(msg.generated || msg.improved) && insertContentFn && (
                                    <button
                                      onClick={() => insertIntoEditor(msg)}
                                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-orange-600 hover:bg-orange-50 transition-colors"
                                      data-testid={`clara-insert-${i}`}
                                    >
                                      <FileText className="w-3 h-3" />
                                      Invoegen in editor
                                    </button>
                                  )}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              {/* Input */}
              {view === 'chat' && (
                <div className="p-4 border-t border-zinc-100 bg-white">
                  <div className="flex gap-2">
                    <input
                      ref={inputRef}
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                      placeholder={MODE_CONFIG[mode].placeholder}
                      disabled={loading}
                      className="flex-1 bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-orange-500/20 disabled:opacity-50"
                      data-testid="clara-chat-input"
                    />
                    <Button
                      onClick={sendMessage}
                      disabled={!input.trim() || loading}
                      size="icon"
                      className="rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white w-10 h-10 shrink-0"
                      data-testid="clara-send-btn"
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </Button>
                  </div>
                  <p className="text-[10px] text-zinc-300 text-center mt-2">Clara AI wordt aangedreven door GPT-5.2</p>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function formatResponse(text) {
  if (!text) return '';
  // Basic markdown-like formatting
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^### (.*$)/gm, '<h4 class="font-semibold text-zinc-900 mt-3 mb-1">$1</h4>')
    .replace(/^## (.*$)/gm, '<h3 class="font-bold text-zinc-900 mt-4 mb-1">$1</h3>')
    .replace(/^- (.*$)/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/^(\d+)\. (.*$)/gm, '<li class="ml-4 list-decimal">$1. $2</li>')
    .replace(/---/g, '<hr class="my-3 border-zinc-200" />')
    .replace(/\n/g, '<br />');
}
