import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { useClaraAssistant } from '../context/ClaraAssistantContext';
import axios from 'axios';
import {
  Sparkles, X, Send, FileText, Loader2,
  Copy, Check, Wand2, ArrowLeft, RotateCcw,
  LifeBuoy, CheckCircle2, ChevronRight,
} from 'lucide-react';
import { Button } from './ui/button';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

export default function ClaraAssistant() {
  const { user, token } = useAuth();
  const {
    isOpen, mode, initialError, initialMessage, errorContext, closeClara,
    editorContent, editorTitle, insertContentFn, insertTitleFn,
  } = useClaraAssistant();

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [copied, setCopied] = useState(null);
  const [view, setView] = useState('chat');
  const [generateTopic, setGenerateTopic] = useState('');
  const [generateKeywords, setGenerateKeywords] = useState('');
  const [generateLength, setGenerateLength] = useState('medium');
  const [showSupportForm, setShowSupportForm] = useState(false);
  const [supportForm, setSupportForm] = useState({ subject: '', description: '', steps_tried: '' });
  const [submittingTicket, setSubmittingTicket] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  useEffect(() => {
    if (isOpen) {
      setMessages([]);
      setSessionId(null);
      setInput('');
      setView('chat');
      setGenerateTopic('');
      setGenerateKeywords('');
      setShowSupportForm(false);
      setSupportForm({ subject: '', description: '', steps_tried: '' });
      if (mode === 'error' && initialError) {
        autoSendError(initialError, errorContext);
      } else if (mode === 'license' && initialMessage) {
        autoSendLicenseHelp(initialMessage);
      } else if (mode === 'support-help') {
        autoSendSupportHelp();
      }
    }
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, showSupportForm]);

  const autoSendError = async (errorMsg, ctx) => {
    setMessages([{ role: 'user', text: errorMsg }]);
    setLoading(true);
    try {
      const res = await axios.post(`${API}/api/clara-assistant/error-help`, {
        error_message: errorMsg,
        context: ctx,
      }, { headers });
      setSessionId(res.data.session_id);
      setMessages(prev => [...prev, { role: 'assistant', text: res.data.explanation, isErrorHelp: true }]);
      setSupportForm(prev => ({ ...prev, subject: `Error: ${errorMsg.slice(0, 80)}`, description: errorMsg, steps_tried: '' }));
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Sorry, something went wrong. Please try again.', error: true }]);
    }
    setLoading(false);
  };

  const autoSendLicenseHelp = async (msg) => {
    const helpText = `My site does not have an active license. What should I check?`;
    setMessages([{ role: 'user', text: helpText }]);
    setLoading(true);
    const licenseAdvice = `Happy to help! Please check the following:\n\n**1. Paid invoices**\nVerify that all invoices for your license have been paid. Check your accounting software or bank statements to confirm the payment was processed.\n\n**2. Quotes**\nDid you receive a quote for a license? Make sure it has been signed and returned.\n\n**3. Emails from Clara Support**\nCheck your inbox (and spam folder) for any emails from Clara Support regarding your license or activation instructions.\n\n---\n\nIf you've checked all these steps and the issue persists, click **Contact Support** below to create a ticket.`;
    setMessages(prev => [...prev, { role: 'assistant', text: licenseAdvice, isErrorHelp: true }]);
    setSupportForm(prev => ({ ...prev, subject: 'License activation - site has no active license', description: msg || 'My site is not licensed. I have completed the troubleshooting steps but the issue persists.', steps_tried: '' }));
    setLoading(false);
  };

  const autoSendSupportHelp = () => {
    const question = `How do I create a new support ticket?`;
    const answer = `Great question! Here's how it works:\n\n**Step 1 — Something goes wrong**\nWhenever you encounter an error or something isn't working as expected, I'll automatically pop up to help you troubleshoot.\n\n**Step 2 — Tell me what's happening**\nDescribe the issue to me — I'll analyse it and try to find a solution for you right away.\n\n**Step 3 — Create a support ticket**\nIf I can't resolve it, a **Contact Support** button will appear below my response. Click it to open the support ticket form.\n\n**Step 4 — Add details**\nFill in a subject, describe the problem, and optionally attach a screenshot or screen recording. Our support team gets notified immediately and will get back to you.\n\n**Step 5 — Track your ticket**\nYou can follow the status of your ticket via the orange support icon in the top navigation bar.\n\n---\n\nWant to try it out? Just describe your problem below and I'll help!`;
    setMessages([
      { role: 'user', text: question },
      { role: 'assistant', text: answer, isErrorHelp: true },
    ]);
    setSupportForm(prev => ({ ...prev, subject: '', description: '', steps_tried: '' }));
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
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Sorry, something went wrong. Please try again.', error: true }]);
    }
    setLoading(false);
  };

  const generateArticle = async () => {
    if (!generateTopic.trim() || loading) return;
    setLoading(true);
    setMessages([
      { role: 'user', text: `Generate an SEO article about: ${generateTopic}` },
      { role: 'assistant', text: '...', loading: true },
    ]);
    setView('chat');
    try {
      const res = await axios.post(`${API}/api/clara-assistant/seo/generate`, {
        topic: generateTopic, keywords: generateKeywords, length: generateLength,
      }, { headers });
      setMessages([
        { role: 'user', text: `Generate an SEO article about: ${generateTopic}` },
        {
          role: 'assistant',
          text: `**${res.data.title}**\n\n${res.data.body}\n\n*Meta: ${res.data.meta_description}*`,
          generated: true, title: res.data.title, body: res.data.body, meta: res.data.meta_description,
        },
      ]);
      setSessionId(res.data.session_id);
    } catch {
      setMessages([{ role: 'assistant', text: 'Generation failed. Check your connection.', error: true }]);
    }
    setLoading(false);
  };

  const improveContent = async () => {
    if (!editorContent || loading) return;
    setLoading(true);
    setMessages([
      { role: 'user', text: 'Improve my current content for SEO' },
      { role: 'assistant', text: '...', loading: true },
    ]);
    setView('chat');
    try {
      const res = await axios.post(`${API}/api/clara-assistant/seo/improve`, {
        content: editorContent, title: editorTitle || '', keywords: generateKeywords,
      }, { headers });
      setMessages([
        { role: 'user', text: 'Improve my current content for SEO' },
        {
          role: 'assistant', improved: true,
          text: `**SEO Score: ${res.data.score}**\n\n${res.data.analysis}\n\n---\n\n${res.data.improved_content}\n\n*Meta: ${res.data.meta_description}*`,
          body: res.data.improved_content, meta: res.data.meta_description, score: res.data.score,
        },
      ]);
      setSessionId(res.data.session_id);
    } catch {
      setMessages([{ role: 'assistant', text: 'Analysis failed.', error: true }]);
    }
    setLoading(false);
  };

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const insertIntoEditor = (msg) => {
    if (msg.body && insertContentFn) {
      insertContentFn(msg.body);
      toast.success('Content inserted into editor');
    }
    if (msg.title && insertTitleFn) insertTitleFn(msg.title);
    closeClara();
  };

  const submitSupportTicket = async () => {
    if (!supportForm.subject.trim() || !supportForm.description.trim()) return;
    setSubmittingTicket(true);
    try {
      // Build Clara conversation context
      const claraContext = messages
        .filter(m => !m.loading)
        .map(m => `[${m.role}] ${m.text}`)
        .join('\n\n');

      const fullDescription = `${supportForm.description}\n\n--- Clara Assistant Context ---\n${claraContext}${supportForm.steps_tried ? `\n\nSteps tried: ${supportForm.steps_tried}` : ''}`;

      await axios.post(`${API}/api/support-tickets`, {
        subject: supportForm.subject,
        description: fullDescription,
        error_message: initialError || '',
        steps_tried: supportForm.steps_tried || '',
        page_url: window.location.href,
        main_site_id: '',
      }, { headers });
      setShowSupportForm(false);
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: 'Your support ticket has been submitted! Our team will get back to you as soon as possible.',
        isSuccess: true,
      }]);
      toast.success('Support ticket submitted');
    } catch {
      toast.error('Could not submit ticket. Please try again.');
    }
    setSubmittingTicket(false);
  };

  const resetChat = () => {
    setMessages([]);
    setSessionId(null);
    setInput('');
    setView('chat');
    setShowSupportForm(false);
  };

  const modeLabel = mode === 'seo' ? 'SEO Writing Assistant' : mode === 'license' ? 'License Help' : 'Troubleshooting';

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[89] bg-black/30 backdrop-blur-sm"
            onClick={closeClara}
          />

          {/* Centered overlay */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed inset-0 z-[90] flex items-center justify-center p-4 pointer-events-none"
          >
            <div
              className="w-full max-w-lg bg-white rounded-3xl shadow-[0_25px_80px_rgba(0,0,0,0.15)] flex flex-col pointer-events-auto"
              style={{ maxHeight: 'min(640px, 85vh)' }}
              data-testid="clara-assistant-panel"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 rounded-t-3xl">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${mode === 'seo' ? 'from-orange-500 to-amber-500' : mode === 'license' ? 'from-amber-500 to-orange-500' : 'from-red-500 to-rose-500'} flex items-center justify-center shadow-lg`}>
                    <span className="text-white font-black text-lg leading-none">&lt;</span>
                  </div>
                  <div>
                    <h2 className="font-bold text-zinc-900 text-base">Clara Assistant</h2>
                    <p className="text-xs text-zinc-400">{modeLabel}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" onClick={resetChat} className="rounded-xl text-zinc-400 hover:text-zinc-700" data-testid="clara-reset-btn">
                    <RotateCcw className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={closeClara} className="rounded-xl text-zinc-400 hover:text-zinc-700" data-testid="clara-close-btn">
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Messages area */}
              <div className="flex-1 overflow-y-auto min-h-0">
                {messages.length === 0 && view === 'chat' ? (
                  <EmptyState
                    mode={mode}
                    editorContent={editorContent}
                    onGenerate={() => setView('generate')}
                    onImprove={improveContent}
                    onSetInput={setInput}
                  />
                ) : view === 'generate' ? (
                  <GenerateForm
                    topic={generateTopic}
                    keywords={generateKeywords}
                    length={generateLength}
                    loading={loading}
                    onTopicChange={setGenerateTopic}
                    onKeywordsChange={setGenerateKeywords}
                    onLengthChange={setGenerateLength}
                    onBack={() => setView('chat')}
                    onGenerate={generateArticle}
                  />
                ) : (
                  <div className="p-4 space-y-3">
                    {messages.map((msg, i) => (
                      <MessageBubble
                        key={i}
                        msg={msg}
                        index={i}
                        copied={copied}
                        onCopy={copyToClipboard}
                        onInsert={insertIntoEditor}
                        insertContentFn={insertContentFn}
                      />
                    ))}

                    {/* Support form after error help */}
                    {showSupportForm && (
                      <SupportForm
                        form={supportForm}
                        onChange={setSupportForm}
                        onSubmit={submitSupportTicket}
                        submitting={submittingTicket}
                        onCancel={() => setShowSupportForm(false)}
                      />
                    )}

                    {/* "Contact Support" button after error help messages */}
                    {(mode === 'error' || mode === 'license') && messages.some(m => m.isErrorHelp) && !showSupportForm && !loading && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex justify-center pt-2"
                      >
                        <button
                          onClick={() => setShowSupportForm(true)}
                          className="flex items-center gap-2 px-4 py-2.5 bg-zinc-100 hover:bg-zinc-200 rounded-full text-sm font-medium text-zinc-600 transition-colors"
                          data-testid="clara-contact-support-btn"
                        >
                          <LifeBuoy className="w-4 h-4" />
                          Not resolved? Contact Support
                        </button>
                      </motion.div>
                    )}

                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              {/* Input bar */}
              {view === 'chat' && !showSupportForm && (
                <div className="p-4 border-t border-zinc-100 rounded-b-3xl bg-white">
                  <div className="flex gap-2">
                    <input
                      ref={inputRef}
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                      placeholder={mode === 'seo' ? 'Ask a question about your content...' : 'Describe the issue...'}
                      disabled={loading}
                      className="flex-1 bg-zinc-50 border border-zinc-200 rounded-full px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-orange-500/20 disabled:opacity-50"
                      data-testid="clara-chat-input"
                    />
                    <Button
                      onClick={sendMessage}
                      disabled={!input.trim() || loading}
                      size="icon"
                      className="rounded-full bg-zinc-900 hover:bg-zinc-800 text-white w-10 h-10 shrink-0"
                      data-testid="clara-send-btn"
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </Button>
                  </div>
                  <p className="text-[10px] text-zinc-300 text-center mt-2">Powered by Clara AI</p>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ── Sub-components ── */

function MessageBubble({ msg, index, copied, onCopy, onInsert, insertContentFn }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] ${isUser
        ? 'bg-zinc-900 text-white rounded-2xl rounded-br-md'
        : msg.error
          ? 'bg-red-50 text-red-700 border border-red-100 rounded-2xl rounded-bl-md'
          : msg.isSuccess
            ? 'bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-2xl rounded-bl-md'
            : 'bg-zinc-50 text-zinc-700 border border-zinc-100 rounded-2xl rounded-bl-md'
      } px-4 py-3`}>
        {msg.loading ? (
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
            <span className="text-sm text-zinc-400">Clara denkt na...</span>
          </div>
        ) : msg.isSuccess ? (
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <span className="text-sm">{msg.text}</span>
          </div>
        ) : (
          <>
            <div className="text-sm whitespace-pre-wrap leading-relaxed" dangerouslySetInnerHTML={{ __html: formatResponse(msg.text) }} />
            {!isUser && !msg.error && !msg.isSuccess && (
              <div className="flex items-center gap-1 mt-2 pt-2 border-t border-zinc-200/50">
                <button
                  onClick={() => onCopy(msg.body || msg.text, index)}
                  className="p-1.5 rounded-lg hover:bg-white/80 text-zinc-400 hover:text-zinc-600 transition-colors"
                >
                  {copied === index ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                {(msg.generated || msg.improved) && insertContentFn && (
                  <button
                    onClick={() => onInsert(msg)}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-orange-600 hover:bg-orange-50 transition-colors"
                    data-testid={`clara-insert-${index}`}
                  >
                    <FileText className="w-3 h-3" /> Invoegen in editor
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function EmptyState({ mode, editorContent, onGenerate, onImprove, onSetInput }) {
  if (mode === 'seo') {
    return (
      <div className="p-5 space-y-3">
        <p className="text-sm text-zinc-500 mb-4">Hoe kan ik je helpen met je content?</p>
        <button onClick={onGenerate}
          className="w-full p-4 bg-zinc-50 hover:bg-zinc-100 rounded-2xl text-left transition-colors border border-zinc-100"
          data-testid="clara-action-generate">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center">
              <Wand2 className="w-5 h-5 text-orange-500" />
            </div>
            <div>
              <p className="font-medium text-zinc-900 text-sm">Generate new article</p>
              <p className="text-xs text-zinc-400">SEO-optimized article based on a topic</p>
            </div>
          </div>
        </button>
        <button onClick={onImprove} disabled={!editorContent}
          className={`w-full p-4 rounded-2xl text-left transition-colors border border-zinc-100 ${editorContent ? 'bg-zinc-50 hover:bg-zinc-100' : 'bg-zinc-50 opacity-50 cursor-not-allowed'}`}
          data-testid="clara-action-improve">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <FileText className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <p className="font-medium text-zinc-900 text-sm">Improve current content</p>
              <p className="text-xs text-zinc-400">{editorContent ? 'Analyze and improve your text for SEO' : 'Open an article in the editor first'}</p>
            </div>
          </div>
        </button>
        <div className="pt-2 border-t border-zinc-100">
          <p className="text-xs text-zinc-400 mb-2">Of stel een vraag over SEO...</p>
        </div>
      </div>
    );
  }
  return (
    <div className="p-5 space-y-3">
      <p className="text-sm text-zinc-500 mb-4">Describe the issue you're experiencing, and I'll help you step by step.</p>
      <div className="space-y-2">
        {['WordPress publishing failed', 'Cloudflare sync not working', 'RDS data not updating', 'Stream monitor shows offline'].map(example => (
          <button key={example} onClick={() => onSetInput(example)}
            className="w-full px-4 py-2.5 bg-zinc-50 hover:bg-zinc-100 rounded-xl text-left text-sm text-zinc-600 transition-colors border border-zinc-100 flex items-center justify-between"
          >
            <span>{example}</span>
            <ChevronRight className="w-3.5 h-3.5 text-zinc-300" />
          </button>
        ))}
      </div>
    </div>
  );
}

function GenerateForm({ topic, keywords, length, loading, onTopicChange, onKeywordsChange, onLengthChange, onBack, onGenerate }) {
  return (
    <div className="p-5 space-y-4">
      <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-600">
        <ArrowLeft className="w-3.5 h-3.5" /> Back
      </button>
      <div>
        <label className="text-xs font-medium text-zinc-500 mb-1.5 block">Topic *</label>
        <input value={topic} onChange={e => onTopicChange(e.target.value)}
          placeholder="e.g. The future of DAB+ radio in Belgium"
          className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
          data-testid="clara-topic-input" />
      </div>
      <div>
        <label className="text-xs font-medium text-zinc-500 mb-1.5 block">Keywords (optional)</label>
        <input value={keywords} onChange={e => onKeywordsChange(e.target.value)}
          placeholder="e.g. DAB+, digital radio, FM"
          className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
          data-testid="clara-keywords-input" />
      </div>
      <div>
        <label className="text-xs font-medium text-zinc-500 mb-1.5 block">Length</label>
        <div className="flex gap-2">
          {[['short', 'Short'], ['medium', 'Medium'], ['long', 'Long']].map(([val, label]) => (
            <button key={val} onClick={() => onLengthChange(val)}
              className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all ${length === val ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <Button onClick={onGenerate} disabled={!topic.trim() || loading}
        className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white rounded-xl gap-2"
        data-testid="clara-generate-btn">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
        Generate Article
      </Button>
    </div>
  );
}

function SupportForm({ form, onChange, onSubmit, submitting, onCancel }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-2 p-4 bg-white border border-zinc-200 rounded-2xl shadow-sm space-y-3"
      data-testid="clara-support-form"
    >
      <div className="flex items-center gap-2 mb-2">
        <LifeBuoy className="w-4 h-4 text-orange-500" />
        <span className="text-sm font-semibold text-zinc-800">Create Support Ticket</span>
      </div>
      <div>
        <label className="text-xs font-medium text-zinc-500 mb-1 block">Subject</label>
        <input
          value={form.subject}
          onChange={e => onChange({ ...form, subject: e.target.value })}
          placeholder="Brief description of the issue"
          className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
          data-testid="support-subject-input"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-zinc-500 mb-1 block">Description</label>
        <textarea
          value={form.description}
          onChange={e => onChange({ ...form, description: e.target.value })}
          placeholder="Wat ging er precies mis? Wat probeerde je te doen?"
          rows={3}
          className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-orange-500/20 resize-none"
          data-testid="support-description-input"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-zinc-500 mb-1 block">What steps have you already tried?</label>
        <textarea
          value={form.steps_tried}
          onChange={e => onChange({ ...form, steps_tried: e.target.value })}
          placeholder="e.g. Refreshed the page, logged in again..."
          rows={2}
          className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-orange-500/20 resize-none"
          data-testid="support-steps-input"
        />
      </div>
      <div className="flex gap-2 pt-1">
        <Button variant="outline" onClick={onCancel} className="flex-1 rounded-xl text-sm" data-testid="support-cancel-btn">
          Cancel
        </Button>
        <Button
          onClick={onSubmit}
          disabled={!form.subject.trim() || !form.description.trim() || submitting}
          className="flex-1 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm gap-1.5"
          data-testid="support-submit-btn"
        >
          {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          Submit
        </Button>
      </div>
    </motion.div>
  );
}

function formatResponse(text) {
  if (!text) return '';
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
