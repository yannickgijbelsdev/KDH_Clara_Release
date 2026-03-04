import { useState, useEffect, useCallback } from 'react';
import { Button } from '../../components/ui/button';
import {
  X, ShieldAlert, Clock, User, Filter, ChevronDown,
  AlertTriangle, Loader2, RefreshCw, Search
} from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

const ACTION_COLORS = {
  view: 'bg-blue-500/10 text-blue-400',
  create: 'bg-green-500/10 text-green-400',
  edit: 'bg-amber-500/10 text-amber-400',
  delete: 'bg-red-500/10 text-red-400',
};

function timeAgo(isoString) {
  const diff = (Date.now() - new Date(isoString).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function PermissionAuditPanel({ token, onClose }) {
  const [stats, setStats] = useState(null);
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ email: '', feature: '' });
  const [appliedFilter, setAppliedFilter] = useState({});
  const headers = { Authorization: `Bearer ${token}` };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (appliedFilter.email) params.set('user_email', appliedFilter.email);
      if (appliedFilter.feature) params.set('feature', appliedFilter.feature);
      params.set('limit', '50');

      const [statsRes, logsRes] = await Promise.all([
        fetch(`${API}/api/roles/audit/stats`, { headers }),
        fetch(`${API}/api/roles/audit/logs?${params}`, { headers }),
      ]);

      if (statsRes.ok) setStats(await statsRes.json());
      if (logsRes.ok) {
        const data = await logsRes.json();
        setLogs(data.logs || []);
        setTotal(data.total || 0);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [token, appliedFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const applyFilter = () => {
    setAppliedFilter({ ...filter });
  };

  const clearFilter = () => {
    setFilter({ email: '', feature: '' });
    setAppliedFilter({});
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" data-testid="permission-audit-panel">
      <div className="bg-[#0a0a0b] border border-zinc-800 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-500" />
            <div>
              <h2 className="text-lg font-bold">Permission Audit Log</h2>
              <p className="text-xs text-zinc-500">Track blocked actions and troubleshoot access issues</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchData} className="gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </Button>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-500">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {loading && !stats ? (
          <div className="flex-1 flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
          </div>
        ) : (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-4 gap-3 px-6 py-4 border-b border-zinc-800">
              <StatCard label="Total Denials" value={stats?.total_denials || 0} icon={ShieldAlert} color="text-red-400" />
              <StatCard label="Last 24h" value={stats?.denials_24h || 0} icon={Clock} color="text-amber-400" />
              <StatCard
                label="Top Blocked User"
                value={stats?.top_blocked_users?.[0]?.email?.split('@')[0] || '-'}
                sub={stats?.top_blocked_users?.[0] ? `${stats.top_blocked_users[0].count}x (${stats.top_blocked_users[0].role})` : ''}
                icon={User}
                color="text-blue-400"
              />
              <StatCard
                label="Top Blocked Feature"
                value={stats?.top_blocked_features?.[0]?.feature || '-'}
                sub={stats?.top_blocked_features?.[0] ? `${stats.top_blocked_features[0].action} (${stats.top_blocked_features[0].count}x)` : ''}
                icon={AlertTriangle}
                color="text-orange-400"
              />
            </div>

            {/* Filter Bar */}
            <div className="px-6 py-3 border-b border-zinc-800/50 flex items-center gap-3">
              <Search className="w-4 h-4 text-zinc-600" />
              <input
                value={filter.email}
                onChange={e => setFilter(f => ({ ...f, email: e.target.value }))}
                placeholder="Filter by email..."
                className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm w-48"
                onKeyDown={e => e.key === 'Enter' && applyFilter()}
                data-testid="audit-filter-email"
              />
              <input
                value={filter.feature}
                onChange={e => setFilter(f => ({ ...f, feature: e.target.value }))}
                placeholder="Filter by feature..."
                className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm w-40"
                onKeyDown={e => e.key === 'Enter' && applyFilter()}
                data-testid="audit-filter-feature"
              />
              <Button size="sm" variant="outline" onClick={applyFilter} className="gap-1">
                <Filter className="w-3.5 h-3.5" /> Filter
              </Button>
              {(appliedFilter.email || appliedFilter.feature) && (
                <Button size="sm" variant="ghost" onClick={clearFilter} className="text-xs text-zinc-500">
                  Clear
                </Button>
              )}
              <span className="text-xs text-zinc-600 ml-auto">{total} results</span>
            </div>

            {/* Logs Table */}
            <div className="flex-1 overflow-y-auto" data-testid="audit-logs-list">
              {logs.length === 0 ? (
                <div className="flex items-center justify-center py-16 text-zinc-500">
                  <div className="text-center">
                    <ShieldAlert className="w-8 h-8 mx-auto mb-2 text-zinc-700" />
                    <p className="text-sm">No permission denials logged yet.</p>
                    <p className="text-xs text-zinc-600 mt-1">Denials will appear here when users try to access restricted features.</p>
                  </div>
                </div>
              ) : (
                <table className="w-full">
                  <thead className="sticky top-0 bg-zinc-900/80 backdrop-blur">
                    <tr className="text-xs text-zinc-500 border-b border-zinc-800/50">
                      <th className="text-left px-6 py-2.5 font-medium">When</th>
                      <th className="text-left px-3 py-2.5 font-medium">User</th>
                      <th className="text-left px-3 py-2.5 font-medium">Role</th>
                      <th className="text-left px-3 py-2.5 font-medium">Feature</th>
                      <th className="text-left px-3 py-2.5 font-medium">Action</th>
                      <th className="text-left px-3 py-2.5 font-medium">Path</th>
                      <th className="text-left px-3 py-2.5 font-medium">IP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log, i) => (
                      <tr key={i} className="border-b border-zinc-800/20 hover:bg-zinc-900/30" data-testid={`audit-row-${i}`}>
                        <td className="px-6 py-2.5 text-xs text-zinc-500 whitespace-nowrap" title={log.timestamp}>
                          {timeAgo(log.timestamp)}
                        </td>
                        <td className="px-3 py-2.5 text-sm text-zinc-300 font-mono truncate max-w-[180px]">
                          {log.user_email}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full">
                            {log.role}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-sm text-zinc-300">{log.feature}</td>
                        <td className="px-3 py-2.5">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${ACTION_COLORS[log.action] || 'bg-zinc-800 text-zinc-400'}`}>
                            {log.action}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-zinc-500 font-mono truncate max-w-[200px]" title={log.path}>
                          {log.method} {log.path}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-zinc-600 font-mono">{log.ip_address}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, icon: Icon, color }) {
  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-xs text-zinc-500">{label}</span>
      </div>
      <p className="text-lg font-bold truncate">{value}</p>
      {sub && <p className="text-xs text-zinc-600 mt-0.5 truncate">{sub}</p>}
    </div>
  );
}
