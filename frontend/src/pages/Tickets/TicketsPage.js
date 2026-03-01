import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useMainSite } from '../../context/MainSiteContext';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';
import {
  ArrowLeft, MessageSquare, Clock, User, Send, Loader2,
  CheckCircle, AlertCircle, AlertTriangle, Circle, ChevronRight,
  Globe, Monitor, MapPin, Filter,
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
  const { user, token } = useAuth();
  const { mainSite } = useMainSite();
  const navigate = useNavigate();

  if (ticketId) return <TicketDetail ticketId={ticketId} />;
  return <TicketList />;
}

function TicketList() {
  const { user, token } = useAuth();
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
    <div className="p-6 max-w-5xl mx-auto" data-testid="tickets-page">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">Support Tickets</h1>
          <p className="text-xs text-zinc-500 mt-1">{tickets.length} tickets</p>
        </div>
      </div>

      {/* Status Filters */}
      <div className="flex gap-2 mb-6 overflow-x-auto" data-testid="ticket-filters">
        {statusFilters.map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
              filter === s
                ? 'bg-orange-600 text-white'
                : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:border-zinc-700'
            }`}
            data-testid={`filter-${s}`}
          >
            {s === 'all' ? 'All' : STATUS_CONFIG[s]?.label || s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin text-orange-500" />
        </div>
      ) : tickets.length === 0 ? (
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-12 text-center">
          <MessageSquare className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
          <p className="text-sm text-zinc-500">No tickets yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tickets.map(ticket => {
            const sc = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.open;
            const pc = PRIORITY_CONFIG[ticket.priority] || PRIORITY_CONFIG.normal;
            const StatusIcon = sc.icon;
            return (
              <div
                key={ticket.id}
                onClick={() => navigate(`/${mainSiteSlug}/tickets/${ticket.id}`)}
                className="bg-zinc-900 rounded-xl border border-zinc-800 hover:border-zinc-700 p-4 cursor-pointer transition-colors"
                data-testid={`ticket-row-${ticket.id}`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-lg ${sc.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                    <StatusIcon className={`w-4 h-4 ${sc.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className="text-sm font-medium truncate">{ticket.title}</h3>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${pc.bg} ${pc.color}`}>
                        {pc.label}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 truncate">{ticket.description}</p>
                    <div className="flex items-center gap-3 mt-1.5 text-[10px] text-zinc-600">
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {ticket.creator_name || ticket.creator_email}
                      </span>
                      <span className="flex items-center gap-1">
                        <Globe className="w-3 h-3" />
                        {ticket.page_name}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(ticket.created_at).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {ticket.message_count > 0 && (
                        <span className="flex items-center gap-1">
                          <MessageSquare className="w-3 h-3" />
                          {ticket.message_count}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-zinc-700 flex-shrink-0" />
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

  // Check if current user is admin
  const isAdmin = user?.is_network_admin || false;

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-5 h-5 animate-spin text-orange-500" /></div>;
  }
  if (!ticket) {
    return <div className="text-center py-20 text-zinc-500">Ticket not found</div>;
  }

  const sc = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.open;
  const pc = PRIORITY_CONFIG[ticket.priority] || PRIORITY_CONFIG.normal;

  return (
    <div className="max-w-5xl mx-auto p-6" data-testid="ticket-detail">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/${mainSiteSlug}/tickets`)} data-testid="ticket-back-btn">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-bold">{ticket.title}</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${sc.bg} ${sc.color}`}>{sc.label}</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${pc.bg} ${pc.color}`}>{pc.label}</span>
            <span className="text-[10px] text-zinc-500">by {ticket.creator_name || ticket.creator_email}</span>
          </div>
        </div>
        {isAdmin && (
          <div className="flex gap-1">
            {['open', 'in_progress', 'resolved', 'closed'].map(s => (
              <button
                key={s}
                onClick={() => updateStatus(s)}
                disabled={ticket.status === s}
                className={`text-[10px] px-2 py-1 rounded-lg transition-all ${
                  ticket.status === s
                    ? `${STATUS_CONFIG[s]?.bg} ${STATUS_CONFIG[s]?.color}`
                    : 'bg-zinc-900 text-zinc-500 hover:bg-zinc-800'
                }`}
                data-testid={`status-btn-${s}`}
              >
                {STATUS_CONFIG[s]?.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Conversation */}
        <div className="lg:col-span-2 space-y-4">
          {/* Original Description */}
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-400 text-xs font-bold">
                {ticket.creator_name?.charAt(0)?.toUpperCase() || '?'}
              </div>
              <div>
                <span className="text-xs font-medium">{ticket.creator_name || ticket.creator_email}</span>
                <span className="text-[10px] text-zinc-500 ml-2">
                  {new Date(ticket.created_at).toLocaleString('nl-BE')}
                </span>
              </div>
            </div>
            <p className="text-sm text-zinc-300 whitespace-pre-wrap">{ticket.description}</p>
          </div>

          {/* Messages */}
          {ticket.messages?.map(msg => (
            <div
              key={msg.id}
              className={`rounded-xl border p-4 ${
                msg.is_admin
                  ? 'bg-blue-500/5 border-blue-500/20'
                  : 'bg-zinc-900 border-zinc-800'
              }`}
              data-testid={`message-${msg.id}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                  msg.is_admin ? 'bg-blue-500/20 text-blue-400' : 'bg-zinc-700 text-zinc-300'
                }`}>
                  {msg.user_name?.charAt(0)?.toUpperCase() || '?'}
                </div>
                <div>
                  <span className="text-xs font-medium">{msg.user_name || msg.user_email}</span>
                  {msg.is_admin && <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded-full ml-1.5">Admin</span>}
                  <span className="text-[10px] text-zinc-500 ml-2">
                    {new Date(msg.created_at).toLocaleString('nl-BE')}
                  </span>
                </div>
              </div>
              <p className="text-sm text-zinc-300 whitespace-pre-wrap">{msg.message}</p>
            </div>
          ))}

          <div ref={messagesEndRef} />

          {/* Reply Input */}
          {ticket.status !== 'closed' && (
            <div className="flex gap-2" data-testid="reply-input">
              <input
                type="text"
                value={message}
                onChange={e => setMessage(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                placeholder="Type a reply..."
                className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-orange-500"
                data-testid="reply-message-input"
              />
              <Button
                onClick={sendMessage}
                disabled={sending || !message.trim()}
                className="bg-orange-600 hover:bg-orange-700"
                data-testid="reply-send-btn"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
          )}
        </div>

        {/* Right: Info + Visual Journey */}
        <div className="space-y-4">
          {/* Ticket Meta */}
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 space-y-3" data-testid="ticket-meta">
            <MetaRow icon={Globe} label="Page" value={ticket.page_name} />
            <MetaRow icon={MapPin} label="URL" value={ticket.page_url?.replace(/^https?:\/\/[^/]+/, '')} />
            <MetaRow icon={Monitor} label="Browser" value={ticket.browser_info} />
            <MetaRow icon={Globe} label="IP" value={ticket.ip_address} />
            <MetaRow icon={Globe} label="Site" value={ticket.site_name} />
          </div>

          {/* Visual User Journey */}
          {ticket.user_journey?.length > 0 && (
            <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4" data-testid="visual-journey">
              <h3 className="text-xs font-semibold text-zinc-400 mb-3 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" />
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
    <div className="flex items-start gap-2">
      <Icon className="w-3.5 h-3.5 text-zinc-600 mt-0.5 flex-shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] text-zinc-600">{label}</p>
        <p className="text-xs text-zinc-300 truncate">{value}</p>
      </div>
    </div>
  );
}

function VisualJourney({ steps, errorPage }) {
  if (!steps?.length) return null;

  return (
    <div className="relative" data-testid="journey-timeline">
      {/* Vertical connector line */}
      <div className="absolute left-[15px] top-4 bottom-4 w-[2px] bg-gradient-to-b from-green-500/30 via-blue-500/30 to-red-500/30" />

      <div className="space-y-0">
        {steps.map((step, i) => {
          const isLast = i === steps.length - 1;
          const isError = isLast || step.name === errorPage;
          const time = new Date(step.timestamp);
          const prevTime = i > 0 ? new Date(steps[i - 1].timestamp) : null;
          const duration = prevTime ? Math.round((time - prevTime) / 1000) : null;

          // Color progression: green -> blue -> amber -> red
          const progress = steps.length > 1 ? i / (steps.length - 1) : 0;
          let dotColor, dotBg, lineColor;
          if (isLast) {
            dotColor = 'bg-red-500'; dotBg = 'bg-red-500/20'; lineColor = 'text-red-400';
          } else if (progress < 0.33) {
            dotColor = 'bg-green-500'; dotBg = 'bg-green-500/10'; lineColor = 'text-green-400';
          } else if (progress < 0.66) {
            dotColor = 'bg-blue-500'; dotBg = 'bg-blue-500/10'; lineColor = 'text-blue-400';
          } else {
            dotColor = 'bg-amber-500'; dotBg = 'bg-amber-500/10'; lineColor = 'text-amber-400';
          }

          return (
            <div key={i} className="relative flex items-start gap-3 py-2">
              {/* Dot */}
              <div className={`relative z-10 w-[30px] h-[30px] rounded-full ${dotBg} flex items-center justify-center flex-shrink-0`}>
                <div className={`w-3 h-3 rounded-full ${dotColor} ${isLast ? 'animate-pulse' : ''}`} />
              </div>

              {/* Content */}
              <div className={`flex-1 rounded-lg p-2.5 border transition-all ${
                isLast
                  ? 'bg-red-500/5 border-red-500/20'
                  : 'bg-zinc-800/50 border-zinc-800 hover:border-zinc-700'
              }`}>
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-medium ${isLast ? 'text-red-400' : 'text-zinc-200'}`}>
                    {step.name}
                    {isLast && (
                      <span className="ml-1.5 text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full">
                        Issue reported here
                      </span>
                    )}
                  </span>
                  <span className="text-[10px] text-zinc-600">
                    {time.toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>
                <p className="text-[10px] text-zinc-600 mt-0.5 truncate">{step.url}</p>
                {duration !== null && duration > 0 && (
                  <div className="flex items-center gap-1 mt-1">
                    <Clock className="w-2.5 h-2.5 text-zinc-600" />
                    <span className="text-[10px] text-zinc-600">
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
