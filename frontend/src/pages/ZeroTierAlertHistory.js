/* eslint-disable */
import { useState, useEffect, useCallback } from 'react';
import { Bell, BellOff, Wifi, WifiOff, Clock, Server, RefreshCw, Filter } from 'lucide-react';
import { Button } from '../components/ui/button';
import axios from 'axios';

const API = process.env.REACT_APP_BACKEND_URL + '/api';

export default function ZeroTierAlertHistory({ mainSiteId, token }) {
  const [events, setEvents] = useState([]);
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterMember, setFilterMember] = useState('');

  const fetchHistory = useCallback(async () => {
    if (!mainSiteId) return;
    setLoading(true);
    try {
      const params = filterMember ? `?member_id=${filterMember}` : '';
      const res = await axios.get(`${API}/zerotier/${mainSiteId}/alert-history${params}`);
      setEvents(res.data.events || []);
      setStats(res.data.stats || []);
    } catch { /* noop */ }
    setLoading(false);
  }, [mainSiteId, filterMember]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const uniqueMembers = [...new Set(events.map(e => e.member_id))];

  const formatTime = (ts) => {
    if (!ts) return '-';
    const d = new Date(ts);
    return d.toLocaleString('nl-BE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const timeSince = (ts) => {
    if (!ts) return '';
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <div className="space-y-6" data-testid="zt-alert-history">
      {/* Stats cards */}
      {stats.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {stats.map(s => (
            <div key={s.member_id} className="bg-white border border-zinc-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Server className="w-4 h-4 text-zinc-400" />
                  <span className="text-sm font-medium text-zinc-900 truncate">{s.member_id}</span>
                </div>
                <div className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                  s.last_known_status === 'online'
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : s.last_known_status === 'offline'
                    ? 'bg-red-500/15 text-red-400'
                    : 'bg-zinc-200 text-zinc-400'
                }`}>
                  {s.last_known_status === 'online' ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                  {s.last_known_status || 'unknown'}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3">
                <div className="text-center">
                  <div className="text-lg font-bold text-red-400">{s.offline_events}</div>
                  <div className="text-[10px] text-zinc-500 uppercase">Offline</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-emerald-400">{s.recovery_events}</div>
                  <div className="text-[10px] text-zinc-500 uppercase">Recovered</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-amber-400">{s.recipients_count}</div>
                  <div className="text-[10px] text-zinc-500 uppercase">Notified</div>
                </div>
              </div>
              {s.last_checked && (
                <div className="text-[10px] text-zinc-600 mt-2 text-right">
                  Last check: {timeSince(s.last_checked)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Filter + refresh */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <Filter className="w-4 h-4" />
          <select
            value={filterMember}
            onChange={e => setFilterMember(e.target.value)}
            className="bg-zinc-50 border border-zinc-200 rounded-lg px-2 py-1 text-sm text-zinc-900"
            data-testid="zt-history-filter"
          >
            <option value="">All clients</option>
            {uniqueMembers.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        <Button variant="ghost" size="sm" onClick={fetchHistory} className="text-zinc-400" data-testid="zt-history-refresh">
          <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
        <span className="text-xs text-zinc-600 ml-auto">{events.length} events</span>
      </div>

      {/* Timeline */}
      {events.length === 0 ? (
        <div className="text-center py-12">
          <Bell className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
          <p className="text-zinc-500 text-sm">No alert events yet</p>
          <p className="text-zinc-600 text-xs mt-1">Events will appear here when monitored clients change status</p>
        </div>
      ) : (
        <div className="relative pl-6 space-y-0">
          {/* Vertical line */}
          <div className="absolute left-2.5 top-2 bottom-2 w-px bg-zinc-200" />

          {events.map((evt, i) => {
            const isOffline = evt.new_status === 'offline';
            return (
              <div key={i} className="relative flex items-start gap-3 py-2" data-testid={`zt-event-${i}`}>
                {/* Dot */}
                <div className={`absolute left-[-14px] top-3 w-3 h-3 rounded-full border-2 ${
                  isOffline
                    ? 'bg-red-500 border-red-400'
                    : 'bg-emerald-500 border-emerald-400'
                }`} />

                <div className="flex-1 flex items-center gap-3">
                  <div className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium ${
                    isOffline ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'
                  }`}>
                    {isOffline ? <WifiOff className="w-3 h-3" /> : <Wifi className="w-3 h-3" />}
                    {isOffline ? 'OFFLINE' : 'ONLINE'}
                  </div>

                  <span className="text-sm text-zinc-700 font-medium">{evt.member_name || evt.member_id}</span>

                  {evt.site_name && (
                    <span className="text-xs text-zinc-500">on {evt.site_name}</span>
                  )}

                  <span className="text-xs text-zinc-600 ml-auto flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatTime(evt.timestamp)}
                  </span>

                  {evt.notified_count > 0 && (
                    <span className="text-[10px] text-amber-500/70 flex items-center gap-0.5">
                      <Bell className="w-2.5 h-2.5" /> {evt.notified_count}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
