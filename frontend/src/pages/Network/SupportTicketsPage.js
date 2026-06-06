/* eslint-disable */
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LifeBuoy, Send, Paperclip, Image, Video, Smile, X, ChevronLeft,
  Circle, Search as SearchIcon, Clock, CheckCircle2, XCircle, Loader2,
  Monitor, User, Shield, AlertCircle
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';

const API = process.env.REACT_APP_BACKEND_URL;

// Helper to get the correct attachment URL (supports both S3 urls and legacy base64 data_urls)
function getAttachmentUrl(att, token) {
  if (att.url) return `${API}${att.url}?auth=${token}`;
  return att.data_url || '';
}

const STATUS_CONFIG = {
  open: { label: 'Open', color: 'bg-red-500', textColor: 'text-red-600', bgColor: 'bg-red-50', icon: AlertCircle },
  searching: { label: 'Searching', color: 'bg-amber-500', textColor: 'text-amber-600', bgColor: 'bg-amber-50', icon: SearchIcon },
  solved: { label: 'Solved', color: 'bg-green-500', textColor: 'text-green-600', bgColor: 'bg-green-50', icon: CheckCircle2 },
  closed: { label: 'Closed', color: 'bg-zinc-400', textColor: 'text-zinc-500', bgColor: 'bg-zinc-100', icon: XCircle },
};

export default function SupportTicketsPage({ inline, onClose }) {
  const { token, user } = useAuth();
  const headers = { Authorization: `Bearer ${token}` };
  const isAdmin = user?.is_system_admin || user?.is_network_admin;

  const [tickets, setTickets] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [ticketDetail, setTicketDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msgInput, setMsgInput] = useState('');
  const [sending, setSending] = useState(false);
  const [filter, setFilter] = useState('all');
  const [showEmoji, setShowEmoji] = useState(false);
  const [recording, setRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [pendingAttachments, setPendingAttachments] = useState([]);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const fetchTickets = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/support-tickets`, { headers });
      setTickets(res.data.tickets || []);
    } catch { /* noop */ }
    setLoading(false);
  }, [token]);

  const fetchTicketDetail = useCallback(async (id) => {
    try {
      const res = await axios.get(`${API}/api/support-tickets/${id}`, { headers });
      setTicketDetail(res.data);
    } catch { /* noop */ }
  }, [token]);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  useEffect(() => {
    if (selectedTicket) fetchTicketDetail(selectedTicket);
  }, [selectedTicket, fetchTicketDetail]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [ticketDetail?.messages]);

  const handleSendMessage = async () => {
    if (!msgInput.trim() && pendingAttachments.length === 0) return;
    setSending(true);
    try {
      await axios.post(`${API}/api/support-tickets/${selectedTicket}/messages`, {
        text: msgInput,
        attachments: pendingAttachments,
      }, { headers });
      setMsgInput('');
      setPendingAttachments([]);
      setShowEmoji(false);
      await fetchTicketDetail(selectedTicket);
      await fetchTickets();
    } catch { /* noop */ }
    setSending(false);
  };

  const handleStatusChange = async (status) => {
    try {
      await axios.put(`${API}/api/support-tickets/${selectedTicket}/status`, { status }, { headers });
      await fetchTicketDetail(selectedTicket);
      await fetchTickets();
    } catch { /* noop */ }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await axios.post(`${API}/api/support-tickets/${selectedTicket}/messages/attachment`, formData, {
        headers: { ...headers, 'Content-Type': 'multipart/form-data' },
      });
      setPendingAttachments(prev => [...prev, res.data.attachment]);
    } catch { /* noop */ }
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
          const res = await axios.post(`${API}/api/support-tickets/${selectedTicket}/recording`, formData, {
            headers: { ...headers, 'Content-Type': 'multipart/form-data' },
          });
          setPendingAttachments(prev => [...prev, res.data.attachment]);
        } catch { /* noop */ }
        setRecording(false);
        setMediaRecorder(null);
      };
      recorder.start();
      setMediaRecorder(recorder);
      setRecording(true);
    } catch { setRecording(false); }
  };

  const handleStopRecording = () => {
    if (mediaRecorder) mediaRecorder.stop();
  };

  const handleImpersonate = async (userId, mainSiteId) => {
    try {
      const res = await axios.post(`${API}/api/admin/impersonate`, { user_id: userId, main_site_id: mainSiteId }, { headers });
      const { token: newToken, user: targetUser, original_user } = res.data;
      localStorage.setItem('token', newToken);
      localStorage.setItem('impersonating', JSON.stringify(original_user));
      window.location.href = ticketDetail?.page_url || '/';
    } catch { /* noop */ }
  };

  const filteredTickets = tickets.filter(t => filter === 'all' || t.status === filter);

  // --- Render ---
  return (
    <div className="flex h-[calc(100vh-120px)] bg-white rounded-2xl border border-zinc-200/60 shadow-sm overflow-hidden" data-testid="support-tickets-page">
      {/* Ticket List Sidebar */}
      <div className={`${selectedTicket ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-[340px] md:min-w-[340px] border-r border-zinc-100`}>
        {/* Header */}
        <div className="p-4 border-b border-zinc-100">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-zinc-900" data-testid="support-title">Support Tickets</h2>
            <span className="text-xs text-zinc-400">{tickets.length} tickets</span>
          </div>
          {/* Filters */}
          <div className="flex gap-1.5">
            {[
              { key: 'all', label: 'All' },
              { key: 'open', label: 'Open' },
              { key: 'searching', label: 'In Progress' },
              { key: 'solved', label: 'Solved' },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${filter === f.key ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'}`}
                data-testid={`filter-${f.key}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Ticket List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-zinc-300" /></div>
          ) : filteredTickets.length === 0 ? (
            <div className="text-center py-12 text-sm text-zinc-300">No tickets found</div>
          ) : (
            filteredTickets.map(t => {
              const sc = STATUS_CONFIG[t.status] || STATUS_CONFIG.open;
              const isSelected = selectedTicket === t.id;
              const hasUnread = isAdmin ? t.has_unread_admin : t.has_unread_user;
              return (
                <button
                  key={t.id}
                  onClick={() => setSelectedTicket(t.id)}
                  className={`w-full text-left p-4 border-b border-zinc-50 transition-all hover:bg-zinc-50 ${isSelected ? 'bg-orange-50/50' : ''}`}
                  data-testid={`ticket-item-${t.id}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${sc.color}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm truncate ${hasUnread ? 'font-bold text-zinc-900' : 'font-medium text-zinc-700'}`}>{t.subject}</p>
                      </div>
                      <p className="text-xs text-zinc-400 truncate mt-0.5">{t.user_name}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${sc.bgColor} ${sc.textColor}`}>{sc.label}</span>
                        <span className="text-[10px] text-zinc-300">{new Date(t.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                      </div>
                    </div>
                    {hasUnread && <div className="w-2.5 h-2.5 rounded-full bg-orange-500 mt-2 flex-shrink-0" />}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className={`${selectedTicket ? 'flex' : 'hidden md:flex'} flex-1 flex-col`}>
        {!selectedTicket ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <LifeBuoy className="w-10 h-10 text-zinc-200 mx-auto mb-3" />
              <p className="text-sm text-zinc-300">Select a ticket to view</p>
            </div>
          </div>
        ) : !ticketDetail ? (
          <div className="flex-1 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-zinc-300" /></div>
        ) : (
          <>
            {/* Chat Header */}
            <div className="p-4 border-b border-zinc-100 flex items-center gap-3">
              <button onClick={() => { setSelectedTicket(null); setTicketDetail(null); }} className="md:hidden p-1.5 rounded-lg hover:bg-zinc-100" data-testid="back-to-list">
                <ChevronLeft className="w-5 h-5 text-zinc-400" />
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-zinc-900 truncate" data-testid="ticket-subject">{ticketDetail.subject}</p>
                <p className="text-xs text-zinc-400">{ticketDetail.user_name} &bull; {ticketDetail.id}</p>
              </div>
              {/* Status dropdown (admin only) */}
              {isAdmin && (
                <div className="flex items-center gap-2">
                  <select
                    value={ticketDetail.status}
                    onChange={e => handleStatusChange(e.target.value)}
                    className="text-xs bg-zinc-50 border border-zinc-200 rounded-lg px-2 py-1.5 text-zinc-600 focus:outline-none"
                    data-testid="status-dropdown"
                  >
                    <option value="open">Open</option>
                    <option value="searching">Searching for a solution</option>
                    <option value="solved">Solution found</option>
                    <option value="closed">Closed</option>
                  </select>
                  {/* Impersonate button */}
                  {ticketDetail.user_id && ticketDetail.user_id !== user?.id && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleImpersonate(ticketDetail.user_id, ticketDetail.main_site_id)}
                      className="gap-1.5 text-xs border-zinc-200"
                      data-testid="impersonate-user-btn"
                    >
                      <Monitor className="w-3.5 h-3.5" /> Login as user
                    </Button>
                  )}
                </div>
              )}
              {!isAdmin && (
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_CONFIG[ticketDetail.status]?.bgColor} ${STATUS_CONFIG[ticketDetail.status]?.textColor}`}>
                  {STATUS_CONFIG[ticketDetail.status]?.label}
                </span>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3" data-testid="messages-container">
              {ticketDetail.messages?.map((msg) => {
                const isAdmin = msg.sender_role === 'admin';
                const isSystem = msg.is_system;
                if (isSystem) {
                  return (
                    <div key={msg.id} className="flex justify-center" data-testid={`msg-system-${msg.id}`}>
                      <span className="text-[11px] text-zinc-400 bg-zinc-100 px-3 py-1 rounded-full">{msg.text}</span>
                    </div>
                  );
                }
                return (
                  <div key={msg.id} className={`flex ${isAdmin ? 'justify-end' : 'justify-start'}`} data-testid={`msg-${msg.id}`}>
                    <div className="max-w-[70%]">
                      {!isAdmin && <p className="text-[10px] text-zinc-400 mb-1 ml-1">{msg.sender_name} <User className="w-3 h-3 inline text-zinc-300" /></p>}
                      {isAdmin && <p className="text-[10px] text-zinc-400 mb-1 mr-1 text-right">{msg.sender_name} <Shield className="w-3 h-3 inline text-orange-400" /></p>}
                      <div className={`px-4 py-2.5 rounded-2xl text-sm shadow-sm ${isAdmin ? 'bg-zinc-900 text-white rounded-br-md' : 'bg-zinc-200/70 text-zinc-800 rounded-bl-md border border-zinc-300/60'}`}>
                        <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                        {msg.attachments?.map(att => (
                          <div key={att.id} className="mt-2">
                            {att.is_recording ? (
                              <video src={getAttachmentUrl(att, token)} controls className="rounded-lg max-w-full" style={{ maxHeight: 200 }} />
                            ) : att.content_type?.startsWith('image') ? (
                              <img src={getAttachmentUrl(att, token)} alt={att.filename} className="rounded-lg max-w-full" style={{ maxHeight: 200 }} />
                            ) : (
                              <a href={getAttachmentUrl(att, token)} download={att.filename} className="text-xs underline">{att.filename}</a>
                            )}
                          </div>
                        ))}
                      </div>
                      <p className={`text-[10px] text-zinc-300 mt-1 ${isAdmin ? 'text-right mr-1' : 'ml-1'}`}>
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
              <div className="px-4 pb-1 flex gap-2 flex-wrap">
                {pendingAttachments.map((att, i) => (
                  <div key={i} className="relative group">
                    {att.content_type?.startsWith('image') ? (
                      <img src={getAttachmentUrl(att, token)} alt="" className="w-16 h-16 rounded-lg object-cover border border-zinc-200" />
                    ) : (
                      <div className="w-16 h-16 rounded-lg bg-zinc-100 flex items-center justify-center border border-zinc-200">
                        <Video className="w-5 h-5 text-zinc-400" />
                      </div>
                    )}
                    <button
                      onClick={() => setPendingAttachments(prev => prev.filter((_, idx) => idx !== i))}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Message Input */}
            <div className="p-3 border-t border-zinc-100 relative">
              {/* Emoji Picker */}
              <AnimatePresence>
                {showEmoji && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
                    className="absolute bottom-full left-3 mb-2 z-50">
                    <Picker data={data} onEmojiSelect={e => setMsgInput(prev => prev + e.native)} theme="light" previewPosition="none" skinTonePosition="none" />
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex items-end gap-2">
                <div className="flex-1 bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 flex items-end gap-2">
                  <textarea
                    value={msgInput}
                    onChange={e => setMsgInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                    placeholder="Type a message..."
                    rows={1}
                    className="flex-1 bg-transparent text-sm text-zinc-900 placeholder:text-zinc-300 focus:outline-none resize-none min-h-[24px] max-h-[100px]"
                    data-testid="message-input"
                  />
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setShowEmoji(!showEmoji)} className="text-zinc-300 hover:text-zinc-500 transition-colors" data-testid="emoji-btn">
                      <Smile className="w-4.5 h-4.5" />
                    </button>
                    <button onClick={() => fileInputRef.current?.click()} className="text-zinc-300 hover:text-zinc-500 transition-colors" data-testid="attach-btn">
                      <Image className="w-4.5 h-4.5" />
                    </button>
                    {recording ? (
                      <button onClick={handleStopRecording} className="text-red-500 animate-pulse" data-testid="stop-record-btn">
                        <Circle className="w-4.5 h-4.5 fill-current" />
                      </button>
                    ) : (
                      <button onClick={handleStartRecording} className="text-zinc-300 hover:text-zinc-500 transition-colors" data-testid="start-record-btn">
                        <Monitor className="w-4.5 h-4.5" />
                      </button>
                    )}
                  </div>
                </div>
                <Button
                  onClick={handleSendMessage}
                  disabled={sending || (!msgInput.trim() && pendingAttachments.length === 0)}
                  className="h-10 w-10 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white p-0 flex-shrink-0"
                  data-testid="send-msg-btn"
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
