/* eslint-disable */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useMainSite } from '../../context/MainSiteContext';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';
import {
  ArrowLeft, MessageSquare, Clock, User, Send, Loader2,
  CheckCircle, AlertCircle, AlertTriangle, Circle, ChevronRight,
  Globe, Monitor, MapPin,
} from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

const STATUS_CONFIG = {
  open: { label: 'Open', color: 'text-blue-400', bg: 'bg-blue-500/10', icon: Circle },
  in_progress: { label: 'In Progress', color: 'text-amber-400', bg: 'bg-amber-500/10', icon: Clock },
  resolved: { label: 'Resolved', color: 'text-green-400', bg: 'bg-green-500/10', icon: CheckCircle },
  closed: { label: 'Closed', color: 'text-zinc-400', bg: 'bg-zinc-500/10', icon: CheckCircle },
};

const PRIORITY_CONFIG = {
  low: { label: 'Low', color: 'text-zinc-400', bg: 'bg-zinc-500/10' },
  normal: { label: 'Normal', color: 'text-blue-400', bg: 'bg-blue-500/10' },
  high: { label: 'High', color: 'text-amber-400', bg: 'bg-amber-500/10' },
  urgent: { label: 'Urgent', color: 'text-red-400', bg: 'bg-red-500/10' },
};

export default function TicketsPage() {
  const { ticketId } = useParams();

  if (ticketId) return <TicketDetail ticketId={ticketId} />;
  return <TicketList />;
}

function TicketList() {
  const { token } = useAuth();
  const { mainSite, mainSiteSlug } = useMainSite();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  const headers = {
    Authorization: `Bearer ${token}`,
    'X-Main-Site-ID': mainSite?.id || '',
  };

  const fetchTickets = useCallback(async () => {
    try {
      const url = filter === 'all'
        ? `${API}/api/tickets/`
        : `${API}/api/tickets/?status=${filter}`;
      const res = await fetch(url, { headers });
      if (res.ok) setTickets((await res.json()).tickets || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [mainSite?.id, token, filter]);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  const statusFilters = ['all', 'open', 'in_progress', 'resolved', 'closed'];

  return (
    <div className="p-6" data-testid="tickets-page">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Support Tickets</h1>
          <p className="text-sm text-zinc-500 mt-1">{tickets.length} tickets</p>
        </div>
      </div>

      {/* Status Filters */}
      <div className="flex gap-2 mb-8 overflow-x-auto" data-testid="ticket-filters">
        {statusFilters.map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              filter === s
                ? 'bg-orange-600 text-white'
                : 'bg-zinc-100 text-zinc-600 border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-200'
            }`}
            data-testid={`filter-${s}`}
          >
            {s === 'all' ? 'All' : STATUS_CONFIG[s]?.label || s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
        </div>
      ) : tickets.length === 0 ? (
        <div className="bg-white/80 backdrop-blur rounded-xl border border-zinc-200 p-16 text-center">
          <MessageSquare className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
          <p className="text-base text-zinc-500">No tickets yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map(ticket => {
            const sc = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.open;
            const pc = PRIORITY_CONFIG[ticket.priority] || PRIORITY_CONFIG.normal;
            const StatusIcon = sc.icon;
            return (
              <div
                key={ticket.id}
                onClick={() => navigate(`/${mainSiteSlug}/tickets/${ticket.id}`)}
                className="bg-white/80 backdrop-blur rounded-xl border border-zinc-200 hover:border-zinc-300 p-5 cursor-pointer transition-colors"
                data-testid={`ticket-row-${ticket.id}`}
              >
                <div className="flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-lg ${sc.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                    <StatusIcon className={`w-5 h-5 ${sc.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="text-base font-medium truncate">{ticket.title}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${pc.bg} ${pc.color}`}>
                        {pc.label}
                      </span>
                    </div>
                    <p className="text-sm text-zinc-500 truncate">{ticket.description}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-zinc-500">
                      <span className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5" />
                        {ticket.creator_name || ticket.creator_email}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5" />
                        {ticket.page_name}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        {new Date(ticket.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {ticket.message_count > 0 && (
                        <span className="flex items-center gap-1.5">
                          <MessageSquare className="w-3.5 h-3.5" />
                          {ticket.message_count}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-zinc-700 flex-shrink-0 mt-1" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TicketDetail({ ticketId }) {
  const { user, token } = useAuth();
  const { mainSite, mainSiteSlug } = useMainSite();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'X-Main-Site-ID': mainSite?.id || '',
  };

  const fetchTicket = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/tickets/${ticketId}`, {
        headers: { Authorization: `Bearer ${token}`, 'X-Main-Site-ID': mainSite?.id || '' },
      });
      if (res.ok) setTicket(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, [ticketId, token, mainSite?.id]);

  useEffect(() => { fetchTicket(); }, [fetchTicket]);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [ticket?.messages]);

  const sendMessage = async () => {
    if (!message.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`${API}/api/tickets/${ticketId}/messages`, {
        method: 'POST', headers,
        body: JSON.stringify({ message: message.trim() }),
      });
      if (res.ok) {
        setMessage('');
        fetchTicket();
      }
    } catch { toast.error('Could not send message'); }
    setSending(false);
  };

  const updateStatus = async (status) => {
    try {
      await fetch(`${API}/api/tickets/${ticketId}/status`, {
        method: 'PUT', headers,
        body: JSON.stringify({ status }),
      });
      fetchTicket();
      toast.success(`Status changed to ${status}`);
    } catch { toast.error('Could not update status'); }
  };

  const isAdmin = user?.is_network_admin || false;

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-orange-500" /></div>;
  }
  if (!ticket) {
    return <div className="text-center py-20 text-zinc-500 text-base">Ticket not found</div>;
  }

  const sc = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.open;
  const pc = PRIORITY_CONFIG[ticket.priority] || PRIORITY_CONFIG.normal;

  return (
    <div className="mx-auto p-6" data-testid="ticket-detail">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/${mainSiteSlug}/tickets`)} data-testid="ticket-back-btn">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{ticket.title}</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className={`text-xs px-2.5 py-1 rounded-full ${sc.bg} ${sc.color} font-medium`}>{sc.label}</span>
            <span className={`text-xs px-2.5 py-1 rounded-full ${pc.bg} ${pc.color} font-medium`}>{pc.label}</span>
            <span className="text-sm text-zinc-500">by {ticket.creator_name || ticket.creator_email}</span>
          </div>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            {['open', 'in_progress', 'resolved', 'closed'].map(s => (
              <button
                key={s}
                onClick={() => updateStatus(s)}
                disabled={ticket.status === s}
                className={`text-xs px-3 py-1.5 rounded-lg transition-all font-medium ${
                  ticket.status === s
                    ? `${STATUS_CONFIG[s]?.bg} ${STATUS_CONFIG[s]?.color}`
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                }`}
                data-testid={`status-btn-${s}`}
              >
                {STATUS_CONFIG[s]?.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: Conversation */}
        <div className="lg:col-span-2 space-y-5">
          {/* Original Description */}
          <div className="bg-white/80 backdrop-blur rounded-xl border border-zinc-200 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-400 text-sm font-bold">
                {ticket.creator_name?.charAt(0)?.toUpperCase() || '?'}
              </div>
              <div>
                <span className="text-sm font-medium">{ticket.creator_name || ticket.creator_email}</span>
                <span className="text-xs text-zinc-500 ml-3">
                  {new Date(ticket.created_at).toLocaleString('en-GB')}
                </span>
              </div>
            </div>
            <p className="text-base text-zinc-600 whitespace-pre-wrap leading-relaxed">{ticket.description}</p>
          </div>

          {/* Messages */}
          {ticket.messages?.map(msg => (
            <div
              key={msg.id}
              className={`rounded-xl border p-5 ${
                msg.is_admin
                  ? 'bg-blue-500/5 border-blue-500/20'
                  : 'bg-white border-zinc-200'
              }`}
              data-testid={`message-${msg.id}`}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${
                  msg.is_admin ? 'bg-blue-500/20 text-blue-400' : 'bg-zinc-200 text-zinc-600'
                }`}>
                  {msg.user_name?.charAt(0)?.toUpperCase() || '?'}
                </div>
                <div>
                  <span className="text-sm font-medium">{msg.user_name || msg.user_email}</span>
                  {msg.is_admin && <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full ml-2">Admin</span>}
                  <span className="text-xs text-zinc-500 ml-3">
                    {new Date(msg.created_at).toLocaleString('en-GB')}
                  </span>
                </div>
              </div>
              <p className="text-base text-zinc-600 whitespace-pre-wrap leading-relaxed">{msg.message}</p>
            </div>
          ))}

          <div ref={messagesEndRef} />

          {/* Reply Input */}
          {ticket.status !== 'closed' && (
            <div className="flex gap-3" data-testid="reply-input">
              <input
                type="text"
                value={message}
                onChange={e => setMessage(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                placeholder="Type a reply..."
                className="flex-1 bg-zinc-50 border border-zinc-200 rounded-xl px-5 py-3 text-base text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-orange-500"
                data-testid="reply-message-input"
              />
              <Button
                onClick={sendMessage}
                disabled={sending || !message.trim()}
                className="bg-orange-600 hover:bg-orange-700 h-auto px-5"
                data-testid="reply-send-btn"
              >
                {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              </Button>
            </div>
          )}
        </div>

        {/* Right: Info + Visual Journey */}
        <div className="space-y-6">
          {/* Ticket Meta */}
          <div className="bg-white/80 backdrop-blur rounded-xl border border-zinc-200 p-5 space-y-4" data-testid="ticket-meta">
            <MetaRow icon={Globe} label="Page" value={ticket.page_name} />
            <MetaRow icon={MapPin} label="URL" value={ticket.page_url?.replace(/^https?:\/\/[^/]+/, '')} />
            <MetaRow icon={Monitor} label="Browser" value={ticket.browser_info} />
            <MetaRow icon={Globe} label="IP" value={ticket.ip_address} />
            <MetaRow icon={Globe} label="Site" value={ticket.site_name} />
          </div>

          {/* Visual User Journey */}
          {ticket.user_journey?.length > 0 && (
            <div className="bg-white/80 backdrop-blur rounded-xl border border-zinc-200 p-5" data-testid="visual-journey">
              <h3 className="text-sm font-semibold text-zinc-400 mb-4 flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                User Journey
              </h3>
              <VisualJourney steps={ticket.user_journey} errorPage={ticket.page_name} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MetaRow({ icon: Icon, label, value }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3">
      <Icon className="w-4 h-4 text-zinc-500 mt-0.5 flex-shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-zinc-500">{label}</p>
        <p className="text-sm text-zinc-600 break-all">{value}</p>
      </div>
    </div>
  );
}

function VisualJourney({ steps, errorPage }) {
  if (!steps?.length) return null;

  return (
    <div className="relative" data-testid="journey-timeline">
      <div className="absolute left-[17px] top-5 bottom-5 w-[2px] bg-gradient-to-b from-green-500/30 via-blue-500/30 to-red-500/30" />

      <div className="space-y-1">
        {steps.map((step, i) => {
          const isLast = i === steps.length - 1;
          const time = new Date(step.timestamp);
          const prevTime = i > 0 ? new Date(steps[i - 1].timestamp) : null;
          const duration = prevTime ? Math.round((time - prevTime) / 1000) : null;

          const progress = steps.length > 1 ? i / (steps.length - 1) : 0;
          let dotColor, dotBg;
          if (isLast) {
            dotColor = 'bg-red-500'; dotBg = 'bg-red-500/20';
          } else if (progress < 0.33) {
            dotColor = 'bg-green-500'; dotBg = 'bg-green-500/10';
          } else if (progress < 0.66) {
            dotColor = 'bg-blue-500'; dotBg = 'bg-blue-500/10';
          } else {
            dotColor = 'bg-amber-500'; dotBg = 'bg-amber-500/10';
          }

          return (
            <div key={i} className="relative flex items-start gap-3 py-2.5">
              <div className={`relative z-10 w-[34px] h-[34px] rounded-full ${dotBg} flex items-center justify-center flex-shrink-0`}>
                <div className={`w-3.5 h-3.5 rounded-full ${dotColor} ${isLast ? 'animate-pulse' : ''}`} />
              </div>

              <div className={`flex-1 rounded-lg p-3 border transition-all ${
                isLast
                  ? 'bg-red-500/5 border-red-500/20'
                  : 'bg-zinc-100/70 border-zinc-200 hover:border-zinc-300'
              }`}>
                <div className="flex items-center justify-between">
                  <span className={`text-sm font-medium ${isLast ? 'text-red-400' : 'text-zinc-200'}`}>
                    {step.name}
                    {isLast && (
                      <span className="ml-2 text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">
                        Issue reported here
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {time.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>
                <p className="text-xs text-zinc-500 mt-1 truncate">{step.url}</p>
                {duration !== null && duration > 0 && (
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <Clock className="w-3 h-3 text-zinc-600" />
                    <span className="text-xs text-zinc-500">
                      {duration < 60 ? `${duration}s on previous page` : `${Math.floor(duration / 60)}m ${duration % 60}s on previous page`}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
