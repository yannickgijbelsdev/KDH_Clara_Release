import { useState, useEffect, useRef, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  LifeBuoy, Send, Image, Smile, X, Monitor, Circle,
  Shield, ChevronLeft, Loader2
} from 'lucide-react';
import { Button } from './ui/button';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const API = process.env.REACT_APP_BACKEND_URL;

const STATUS_CONFIG = {
  open: { label: 'Open', textColor: 'text-red-600', bgColor: 'bg-red-50', color: 'bg-red-500' },
  searching: { label: 'Searching', textColor: 'text-amber-600', bgColor: 'bg-amber-50', color: 'bg-amber-500' },
  solved: { label: 'Solved', textColor: 'text-green-600', bgColor: 'bg-green-50', color: 'bg-green-500' },
  closed: { label: 'Closed', textColor: 'text-zinc-500', bgColor: 'bg-zinc-100', color: 'bg-zinc-400' },
};

export default function UserTicketsPanel({ open, onClose }) {
  const { token, user } = useAuth();
  const headers = { Authorization: `Bearer ${token}` };

  const [tickets, setTickets] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msgInput, setMsgInput] = useState('');
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [pendingAttachments, setPendingAttachments] = useState([]);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const fetchTickets = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/support-tickets`, { headers });
      setTickets(res.data.tickets || []);
    } catch { }
    setLoading(false);
  }, [token]);

  const fetchDetail = useCallback(async (id) => {
    try {
      const res = await axios.get(`${API}/api/support-tickets/${id}`, { headers });
      setDetail(res.data);
    } catch { }
  }, [token]);

  useEffect(() => { if (open) { fetchTickets(); setSelectedId(null); setDetail(null); } }, [open, fetchTickets]);
  useEffect(() => { if (selectedId) fetchDetail(selectedId); }, [selectedId, fetchDetail]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [detail?.messages]);

  const handleSend = async () => {
    if (!msgInput.trim() && pendingAttachments.length === 0) return;
    setSending(true);
    try {
      await axios.post(`${API}/api/support-tickets/${selectedId}/messages`, { text: msgInput, attachments: pendingAttachments }, { headers });
      setMsgInput('');
      setPendingAttachments([]);
      await fetchDetail(selectedId);
      await fetchTickets();
    } catch { }
    setSending(false);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await axios.post(`${API}/api/support-tickets/${selectedId}/messages/attachment`, formData, {
        headers: { ...headers, 'Content-Type': 'multipart/form-data' },
      });
      setPendingAttachments(prev => [...prev, res.data.attachment]);
    } catch { }
    e.target.value = '';
  };

  const handleStartRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
      const chunks = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunks, { type: 'video/webm' });
        const formData = new FormData();
        formData.append('file', blob, 'recording.webm');
        try {
          const res = await axios.post(`${API}/api/support-tickets/${selectedId}/recording`, formData, {
            headers: { ...headers, 'Content-Type': 'multipart/form-data' },
          });
          setPendingAttachments(prev => [...prev, res.data.attachment]);
        } catch { }
        setRecording(false);
        setMediaRecorder(null);
      };
      recorder.start();
      setMediaRecorder(recorder);
      setRecording(true);
    } catch { setRecording(false); }
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-[300]" onClick={onClose} />

          {/* Centered messenger popup */}
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="fixed z-[301] bottom-6 right-6 w-[380px] h-[520px] bg-white rounded-2xl shadow-[0_25px_80px_rgba(0,0,0,0.15)] border border-zinc-200/60 flex flex-col overflow-hidden"
            data-testid="user-tickets-panel"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-zinc-100">
              {selectedId && (
                <button onClick={() => { setSelectedId(null); setDetail(null); }} className="p-1 rounded-lg hover:bg-zinc-100">
                  <ChevronLeft className="w-4 h-4 text-zinc-400" />
                </button>
              )}
              <div className="w-8 h-8 rounded-xl bg-zinc-900 flex items-center justify-center">
                <LifeBuoy className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-zinc-900">
                  {selectedId ? (detail?.subject || 'Loading...') : 'Clara Support'}
                </h3>
                {selectedId && detail && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_CONFIG[detail.status]?.bgColor} ${STATUS_CONFIG[detail.status]?.textColor}`}>
                    {STATUS_CONFIG[detail.status]?.label}
                  </span>
                )}
              </div>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-100" data-testid="close-tickets-panel">
                <X className="w-4 h-4 text-zinc-400" />
              </button>
            </div>

            {!selectedId ? (
              /* ── Ticket List ── */
              <div className="flex-1 overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-zinc-300" /></div>
                ) : tickets.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                    <LifeBuoy className="w-10 h-10 text-zinc-200 mb-3" />
                    <p className="text-sm text-zinc-400">No tickets yet</p>
                    <p className="text-xs text-zinc-300 mt-1">Use Clara Assistant to create a support ticket</p>
                  </div>
                ) : (
                  tickets.map(t => {
                    const sc = STATUS_CONFIG[t.status] || STATUS_CONFIG.open;
                    return (
                      <button
                        key={t.id}
                        onClick={() => setSelectedId(t.id)}
                        className="w-full text-left px-4 py-3 border-b border-zinc-50 hover:bg-zinc-50 transition-all"
                        data-testid={`user-ticket-${t.id}`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${sc.color}`} />
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm truncate ${t.has_unread_user ? 'font-bold text-zinc-900' : 'font-medium text-zinc-600'}`}>{t.subject}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${sc.bgColor} ${sc.textColor}`}>{sc.label}</span>
                              <span className="text-[10px] text-zinc-300">{new Date(t.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                            </div>
                          </div>
                          {t.has_unread_user && <div className="w-2 h-2 rounded-full bg-orange-500 flex-shrink-0" />}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            ) : !detail ? (
              <div className="flex-1 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-zinc-300" /></div>
            ) : (
              <>
                {/* ── Messages ── */}
                <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5" data-testid="user-messages">
                  {detail.messages?.map(msg => {
                    const isOwn = msg.sender_id === user?.id;
                    if (msg.is_system) {
                      return (
                        <div key={msg.id} className="flex justify-center py-1">
                          <span className="text-[10px] text-zinc-400 bg-zinc-100 px-2.5 py-0.5 rounded-full">{msg.text}</span>
                        </div>
                      );
                    }
                    return (
                      <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                        <div className="max-w-[80%]">
                          {!isOwn && (
                            <p className="text-[10px] text-zinc-400 mb-0.5 ml-1">
                              {msg.sender_name} {msg.sender_role === 'admin' && <Shield className="w-2.5 h-2.5 inline text-orange-400" />}
                            </p>
                          )}
                          <div className={`px-3 py-2 rounded-2xl text-[13px] leading-relaxed ${isOwn ? 'bg-zinc-900 text-white rounded-br-md' : 'bg-zinc-100 text-zinc-800 rounded-bl-md'}`}>
                            <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                            {msg.attachments?.map(att => (
                              <div key={att.id} className="mt-1.5">
                                {att.is_recording ? (
                                  <video src={att.data_url} controls className="rounded-lg max-w-full" style={{ maxHeight: 140 }} />
                                ) : att.content_type?.startsWith('image') ? (
                                  <img src={att.data_url} alt={att.filename} className="rounded-lg max-w-full" style={{ maxHeight: 140 }} />
                                ) : (
                                  <a href={att.data_url} download={att.filename} className="text-xs underline">{att.filename}</a>
                                )}
                              </div>
                            ))}
                          </div>
                          <p className={`text-[9px] text-zinc-300 mt-0.5 ${isOwn ? 'text-right mr-1' : 'ml-1'}`}>
                            {new Date(msg.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>

                {/* Pending attachments */}
                {pendingAttachments.length > 0 && (
                  <div className="px-3 pb-1 flex gap-1.5 flex-wrap">
                    {pendingAttachments.map((att, i) => (
                      <div key={i} className="relative group">
                        {att.content_type?.startsWith('image') ? (
                          <img src={att.data_url} alt="" className="w-12 h-12 rounded-lg object-cover border border-zinc-200" />
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-zinc-100 flex items-center justify-center border border-zinc-200">
                            <Monitor className="w-4 h-4 text-zinc-400" />
                          </div>
                        )}
                        <button onClick={() => setPendingAttachments(prev => prev.filter((_, idx) => idx !== i))} className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100">
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* ── Input ── */}
                <div className="px-3 py-2.5 border-t border-zinc-100">
                  <div className="flex items-end gap-2">
                    <div className="flex-1 bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 flex items-end gap-1.5">
                      <textarea
                        value={msgInput}
                        onChange={e => setMsgInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                        placeholder="Type a message..."
                        rows={1}
                        className="flex-1 bg-transparent text-sm text-zinc-900 placeholder:text-zinc-300 focus:outline-none resize-none min-h-[22px] max-h-[60px]"
                        data-testid="user-msg-input"
                      />
                      <div className="flex items-center gap-1">
                        <button onClick={() => fileInputRef.current?.click()} className="text-zinc-300 hover:text-zinc-500 transition-colors"><Image className="w-4 h-4" /></button>
                        {recording ? (
                          <button onClick={() => mediaRecorder?.stop()} className="text-red-500 animate-pulse"><Circle className="w-4 h-4 fill-current" /></button>
                        ) : (
                          <button onClick={handleStartRecording} className="text-zinc-300 hover:text-zinc-500 transition-colors"><Monitor className="w-4 h-4" /></button>
                        )}
                      </div>
                    </div>
                    <Button onClick={handleSend} disabled={sending || (!msgInput.trim() && pendingAttachments.length === 0)} className="h-9 w-9 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white p-0 flex-shrink-0">
                      {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    </Button>
                  </div>
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                </div>
              </>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
