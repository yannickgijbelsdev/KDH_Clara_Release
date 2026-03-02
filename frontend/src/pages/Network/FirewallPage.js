import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useMainSite } from '../../context/MainSiteContext';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';
import {
  Shield, ShieldAlert, ShieldCheck, ShieldOff, Plus, Trash2, Globe,
  Ban, CheckCircle, Clock, AlertTriangle, Activity, Eye, X, Loader2,
  Lock, Unlock, Filter, RefreshCw, MapPin, Monitor,
} from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

export default function FirewallPage() {
  const { user, token } = useAuth();
  const { mainSite } = useMainSite();
  const [tab, setTab] = useState('overview');

  if (!user?.is_network_admin) {
    return <div className="p-6 text-zinc-500">Network admin access required.</div>;
  }

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Shield },
    { id: 'rules', label: 'IP Rules', icon: Lock },
    { id: 'blocks', label: 'Blocked IPs', icon: Ban },
    { id: 'logs', label: 'Security Logs', icon: Activity },
    { id: 'settings', label: 'Settings', icon: ShieldCheck },
  ];

  return (
    <div className="p-6" data-testid="firewall-page">
      <div className="flex items-center gap-3 mb-8">
        <Shield className="w-7 h-7 text-red-500" />
        <div>
          <h1 className="text-2xl font-bold">Firewall</h1>
          <p className="text-sm text-zinc-500">{mainSite?.name} — Security & Access Control</p>
        </div>
      </div>

      <div className="flex gap-2 mb-8 overflow-x-auto" data-testid="firewall-tabs">
        {tabs.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                tab === t.id
                  ? 'bg-red-600 text-white'
                  : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:border-zinc-700'
              }`}
              data-testid={`tab-${t.id}`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'overview' && <OverviewTab token={token} mainSiteId={mainSite?.id} />}
      {tab === 'rules' && <RulesTab token={token} mainSiteId={mainSite?.id} />}
      {tab === 'blocks' && <BlocksTab token={token} mainSiteId={mainSite?.id} />}
      {tab === 'logs' && <LogsTab token={token} mainSiteId={mainSite?.id} />}
      {tab === 'settings' && <SettingsTab token={token} mainSiteId={mainSite?.id} />}
    </div>
  );
}

// ============== OVERVIEW TAB ==============
function OverviewTab({ token, mainSiteId }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API}/api/firewall/logs/stats?main_site_id=${mainSiteId}`, { headers });
        if (res.ok) setStats(await res.json());
      } catch {}
      setLoading(false);
    })();
  }, [mainSiteId]);

  if (loading) return <LoadingSpinner />;

  const cards = [
    { label: 'Active Blocks', value: stats?.active_blocks || 0, icon: Ban, color: 'text-red-400', bg: 'bg-red-500/10' },
    { label: 'Events (24h)', value: stats?.recent_events_24h || 0, icon: Activity, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { label: 'Failed Logins', value: stats?.event_counts?.failed_login || 0, icon: ShieldAlert, color: 'text-amber-400', bg: 'bg-amber-500/10' },
    { label: 'Rate Limited', value: stats?.event_counts?.rate_limit_exceeded || 0, icon: AlertTriangle, color: 'text-orange-400', bg: 'bg-orange-500/10' },
    { label: 'Geo Blocked', value: stats?.event_counts?.geo_blocked || 0, icon: Globe, color: 'text-purple-400', bg: 'bg-purple-500/10' },
    { label: 'Successful Logins', value: stats?.event_counts?.successful_login || 0, icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-500/10' },
  ];

  return (
    <div className="space-y-6" data-testid="overview-tab">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map(c => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="bg-zinc-900 rounded-xl border border-zinc-800 p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-10 h-10 rounded-lg ${c.bg} flex items-center justify-center`}>
                  <Icon className={`w-5 h-5 ${c.color}`} />
                </div>
                <span className="text-sm text-zinc-400">{c.label}</span>
              </div>
              <p className="text-3xl font-bold">{c.value}</p>
            </div>
          );
        })}
      </div>

      {stats?.top_blocked_ips?.length > 0 && (
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5">
          <h3 className="text-base font-semibold mb-4 flex items-center gap-2">
            <Ban className="w-4 h-4 text-red-400" />
            Top Blocked IPs
          </h3>
          <div className="space-y-2">
            {stats.top_blocked_ips.map((item, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-zinc-800 last:border-0">
                <span className="text-sm font-mono text-zinc-300">{item.ip}</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-500 truncate max-w-[200px]">{item.reason}</span>
                  <span className="text-xs bg-red-500/10 text-red-400 px-2 py-0.5 rounded-full">{item.count}x</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============== RULES TAB ==============
function RulesTab({ token, mainSiteId }) {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'blacklist', ip_patterns: '', description: '' });
  const [saving, setSaving] = useState(false);

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const fetchRules = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/firewall/rules/${mainSiteId}`, { headers });
      if (res.ok) setRules((await res.json()).rules || []);
    } catch {}
    setLoading(false);
  }, [mainSiteId]);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  const createRule = async () => {
    if (!form.name || !form.ip_patterns.trim()) return;
    setSaving(true);
    try {
      const patterns = form.ip_patterns.split('\n').map(l => l.trim()).filter(Boolean);
      const res = await fetch(`${API}/api/firewall/rules/${mainSiteId}`, {
        method: 'POST', headers,
        body: JSON.stringify({ ...form, ip_patterns: patterns }),
      });
      if (res.ok) {
        toast.success('Rule created');
        setShowForm(false);
        setForm({ name: '', type: 'blacklist', ip_patterns: '', description: '' });
        fetchRules();
      } else {
        toast.error('Failed to create rule');
      }
    } catch { toast.error('Error'); }
    setSaving(false);
  };

  const toggleRule = async (rule) => {
    try {
      await fetch(`${API}/api/firewall/rules/${mainSiteId}/${rule.id}`, {
        method: 'PUT', headers,
        body: JSON.stringify({ active: !rule.active }),
      });
      fetchRules();
    } catch {}
  };

  const deleteRule = async (ruleId) => {
    if (!window.confirm('Delete this rule?')) return;
    try {
      await fetch(`${API}/api/firewall/rules/${mainSiteId}/${ruleId}`, { method: 'DELETE', headers });
      toast.success('Rule deleted');
      fetchRules();
    } catch {}
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6" data-testid="rules-tab">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500">{rules.length} rules configured</p>
        <Button onClick={() => setShowForm(!showForm)} className="bg-red-600 hover:bg-red-700" data-testid="add-rule-btn">
          <Plus className="w-4 h-4 mr-2" /> Add Rule
        </Button>
      </div>

      {showForm && (
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5 space-y-4" data-testid="rule-form">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Rule Name</label>
              <input
                value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm"
                placeholder="e.g. Block suspicious range"
                data-testid="rule-name-input"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Type</label>
              <select
                value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm"
                data-testid="rule-type-select"
              >
                <option value="blacklist">Blacklist (block these IPs)</option>
                <option value="whitelist">Whitelist (only allow these IPs)</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">IP Addresses / CIDR Ranges (one per line)</label>
            <textarea
              value={form.ip_patterns} onChange={e => setForm({ ...form, ip_patterns: e.target.value })}
              rows={4}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm font-mono"
              placeholder="192.168.1.100&#10;10.0.0.0/24"
              data-testid="rule-patterns-input"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Description</label>
            <input
              value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm"
              placeholder="Optional description"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={createRule} disabled={saving} className="bg-red-600 hover:bg-red-700" data-testid="save-rule-btn">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Rule'}
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {rules.length === 0 ? (
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-12 text-center">
            <Shield className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
            <p className="text-sm text-zinc-500">No IP rules configured yet</p>
          </div>
        ) : rules.map(rule => (
          <div key={rule.id} className={`bg-zinc-900 rounded-xl border p-5 ${rule.active ? 'border-zinc-800' : 'border-zinc-800/50 opacity-60'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                  rule.type === 'whitelist' ? 'bg-green-500/10' : 'bg-red-500/10'
                }`}>
                  {rule.type === 'whitelist'
                    ? <CheckCircle className="w-4 h-4 text-green-400" />
                    : <Ban className="w-4 h-4 text-red-400" />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{rule.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      rule.type === 'whitelist' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                    }`}>{rule.type}</span>
                    {!rule.active && <span className="text-xs text-zinc-500">(disabled)</span>}
                  </div>
                  <p className="text-xs text-zinc-500 mt-1">
                    {rule.ip_patterns?.length} pattern(s): {rule.ip_patterns?.slice(0, 3).join(', ')}
                    {rule.ip_patterns?.length > 3 && ` +${rule.ip_patterns.length - 3} more`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => toggleRule(rule)} className="p-2 rounded-lg hover:bg-zinc-800 transition-colors" title={rule.active ? 'Disable' : 'Enable'}>
                  {rule.active ? <ShieldCheck className="w-4 h-4 text-green-400" /> : <ShieldOff className="w-4 h-4 text-zinc-500" />}
                </button>
                <button onClick={() => deleteRule(rule.id)} className="p-2 rounded-lg hover:bg-zinc-800 transition-colors text-zinc-500 hover:text-red-400">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============== BLOCKS TAB ==============
function BlocksTab({ token, mainSiteId }) {
  const [blocks, setBlocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ip: '', reason: '', duration_minutes: '' });
  const [saving, setSaving] = useState(false);

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const fetchBlocks = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/firewall/blocks?main_site_id=${mainSiteId}`, { headers });
      if (res.ok) setBlocks((await res.json()).blocks || []);
    } catch {}
    setLoading(false);
  }, [mainSiteId]);

  useEffect(() => { fetchBlocks(); }, [fetchBlocks]);

  const blockIp = async () => {
    if (!form.ip.trim()) return;
    setSaving(true);
    try {
      const body = {
        ip: form.ip.trim(),
        reason: form.reason || 'Manual block',
        duration_minutes: form.duration_minutes ? parseInt(form.duration_minutes) : null,
      };
      const res = await fetch(`${API}/api/firewall/blocks`, { method: 'POST', headers, body: JSON.stringify(body) });
      if (res.ok) {
        toast.success(`IP ${form.ip} blocked`);
        setShowForm(false);
        setForm({ ip: '', reason: '', duration_minutes: '' });
        fetchBlocks();
      }
    } catch {}
    setSaving(false);
  };

  const unblockIp = async (ip) => {
    try {
      const res = await fetch(`${API}/api/firewall/blocks/${encodeURIComponent(ip)}`, { method: 'DELETE', headers });
      if (res.ok) {
        toast.success(`IP ${ip} unblocked`);
        fetchBlocks();
      }
    } catch {}
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6" data-testid="blocks-tab">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500">{blocks.length} active blocks</p>
        <Button onClick={() => setShowForm(!showForm)} className="bg-red-600 hover:bg-red-700" data-testid="block-ip-btn">
          <Ban className="w-4 h-4 mr-2" /> Block IP
        </Button>
      </div>

      {showForm && (
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5 space-y-4" data-testid="block-form">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">IP Address</label>
              <input
                value={form.ip} onChange={e => setForm({ ...form, ip: e.target.value })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm font-mono"
                placeholder="192.168.1.100"
                data-testid="block-ip-input"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Reason</label>
              <input
                value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm"
                placeholder="Suspicious activity"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Duration (minutes, empty = permanent)</label>
              <input
                value={form.duration_minutes} onChange={e => setForm({ ...form, duration_minutes: e.target.value })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm"
                placeholder="30"
                type="number"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={blockIp} disabled={saving} className="bg-red-600 hover:bg-red-700" data-testid="confirm-block-btn">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Block IP'}
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {blocks.length === 0 ? (
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-12 text-center">
            <ShieldCheck className="w-8 h-8 text-green-500/50 mx-auto mb-2" />
            <p className="text-sm text-zinc-500">No blocked IPs</p>
          </div>
        ) : blocks.map(block => (
          <div key={block.id} className="bg-zinc-900 rounded-xl border border-zinc-800 p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
                  <Ban className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-mono font-medium">{block.ip}</span>
                    {block.country_code && block.country_code !== 'XX' && (
                      <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Globe className="w-3 h-3" />
                        {block.country_name} ({block.city})
                      </span>
                    )}
                    {block.auto_blocked && (
                      <span className="text-xs bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-full">auto</span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500 mt-1">{block.reason}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-zinc-600">
                    <span>{new Date(block.blocked_at).toLocaleString('nl-BE')}</span>
                    {block.expires_at && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Expires: {new Date(block.expires_at).toLocaleString('nl-BE')}
                      </span>
                    )}
                    {!block.expires_at && <span className="text-red-400">Permanent</span>}
                  </div>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => unblockIp(block.ip)} data-testid={`unblock-${block.ip}`}>
                <Unlock className="w-4 h-4 mr-1" /> Unblock
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============== LOGS TAB ==============
function LogsTab({ token, mainSiteId }) {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(0);

  const headers = { Authorization: `Bearer ${token}` };
  const limit = 50;

  const eventTypes = [
    'all', 'successful_login', 'failed_login', 'ip_blocked', 'ip_unblocked',
    'rate_limit_exceeded', 'geo_blocked', 'ip_blacklisted', 'ip_not_whitelisted', 'api_access',
  ];

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      let url = `${API}/api/firewall/logs?limit=${limit}&offset=${page * limit}`;
      if (mainSiteId) url += `&main_site_id=${mainSiteId}`;
      if (filter !== 'all') url += `&event_type=${filter}`;
      const res = await fetch(url, { headers });
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
        setTotal(data.total || 0);
      }
    } catch {}
    setLoading(false);
  }, [mainSiteId, filter, page]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const EVENT_COLORS = {
    successful_login: 'text-green-400 bg-green-500/10',
    failed_login: 'text-red-400 bg-red-500/10',
    ip_blocked: 'text-red-400 bg-red-500/10',
    ip_unblocked: 'text-green-400 bg-green-500/10',
    rate_limit_exceeded: 'text-amber-400 bg-amber-500/10',
    geo_blocked: 'text-purple-400 bg-purple-500/10',
    ip_blacklisted: 'text-red-400 bg-red-500/10',
    ip_not_whitelisted: 'text-orange-400 bg-orange-500/10',
    api_access: 'text-blue-400 bg-blue-500/10',
  };

  return (
    <div className="space-y-6" data-testid="logs-tab">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500">{total} events</p>
        <button onClick={fetchLogs} className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {eventTypes.map(type => (
          <button
            key={type}
            onClick={() => { setFilter(type); setPage(0); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
              filter === type ? 'bg-red-600 text-white' : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:border-zinc-700'
            }`}
          >
            {type === 'all' ? 'All' : type.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      {loading ? <LoadingSpinner /> : (
        <div className="space-y-2">
          {logs.length === 0 ? (
            <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-12 text-center">
              <Activity className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
              <p className="text-sm text-zinc-500">No events found</p>
            </div>
          ) : logs.map(log => {
            const colors = EVENT_COLORS[log.event_type] || 'text-zinc-400 bg-zinc-500/10';
            return (
              <div key={log.id} className="bg-zinc-900 rounded-xl border border-zinc-800 px-5 py-3.5 flex items-center gap-4">
                <div className={`w-8 h-8 rounded-lg ${colors.split(' ')[1]} flex items-center justify-center flex-shrink-0`}>
                  <Activity className={`w-4 h-4 ${colors.split(' ')[0]}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${colors} font-medium`}>
                      {log.event_type?.replace(/_/g, ' ')}
                    </span>
                    {log.user_email && <span className="text-xs text-zinc-400">{log.user_email}</span>}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500">
                    <span className="font-mono">{log.ip}</span>
                    {log.country_name && log.country_name !== 'Unknown' && (
                      <span className="flex items-center gap-1"><Globe className="w-3 h-3" />{log.country_name} {log.city && `(${log.city})`}</span>
                    )}
                    {log.details?.path && <span className="truncate max-w-[200px]">{log.details.method} {log.details.path}</span>}
                    {log.details?.reason && <span className="truncate max-w-[250px]">{log.details.reason}</span>}
                    {log.details?.email && <span>{log.details.email}</span>}
                  </div>
                </div>
                <span className="text-xs text-zinc-600 whitespace-nowrap flex-shrink-0">
                  {new Date(log.timestamp).toLocaleString('nl-BE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>
            );
          })}

          {/* Pagination */}
          {total > limit && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</Button>
              <span className="text-xs text-zinc-500">Page {page + 1} of {Math.ceil(total / limit)}</span>
              <Button variant="outline" size="sm" disabled={(page + 1) * limit >= total} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============== SETTINGS TAB ==============
function SettingsTab({ token, mainSiteId }) {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API}/api/firewall/settings/${mainSiteId}`, { headers });
        if (res.ok) setSettings(await res.json());
      } catch {}
      setLoading(false);
    })();
  }, [mainSiteId]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/firewall/settings/${mainSiteId}`, {
        method: 'PUT', headers,
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        toast.success('Settings saved');
        setSettings(await res.json());
      } else {
        toast.error('Failed to save');
      }
    } catch {}
    setSaving(false);
  };

  if (loading || !settings) return <LoadingSpinner />;

  const update = (key, val) => setSettings(s => ({ ...s, [key]: val }));

  return (
    <div className="space-y-6" data-testid="settings-tab">
      <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold">Firewall Enabled</h3>
            <p className="text-xs text-zinc-500 mt-1">Enable or disable the firewall for this site</p>
          </div>
          <ToggleSwitch checked={settings.enabled} onChange={v => update('enabled', v)} testId="toggle-enabled" />
        </div>

        <hr className="border-zinc-800" />

        <div>
          <h3 className="text-base font-semibold mb-4 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-400" />
            Brute Force Protection
          </h3>
          <div className="grid grid-cols-3 gap-4">
            <SettingInput label="Max Attempts" value={settings.brute_force_max_attempts} onChange={v => update('brute_force_max_attempts', parseInt(v) || 5)} testId="bf-max" />
            <SettingInput label="Window (minutes)" value={settings.brute_force_window_minutes} onChange={v => update('brute_force_window_minutes', parseInt(v) || 15)} testId="bf-window" />
            <SettingInput label="Ban Duration (minutes)" value={settings.brute_force_ban_minutes} onChange={v => update('brute_force_ban_minutes', parseInt(v) || 30)} testId="bf-ban" />
          </div>
        </div>

        <hr className="border-zinc-800" />

        <div>
          <h3 className="text-base font-semibold mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-400" />
            Rate Limiting
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <SettingInput label="Max Requests" value={settings.rate_limit_requests} onChange={v => update('rate_limit_requests', parseInt(v) || 200)} testId="rl-max" />
            <SettingInput label="Window (seconds)" value={settings.rate_limit_window_seconds} onChange={v => update('rate_limit_window_seconds', parseInt(v) || 60)} testId="rl-window" />
          </div>
        </div>

        <hr className="border-zinc-800" />

        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold flex items-center gap-2">
              <Globe className="w-4 h-4 text-purple-400" />
              Geo-Blocking
            </h3>
            <ToggleSwitch checked={settings.geo_blocking_enabled} onChange={v => update('geo_blocking_enabled', v)} testId="toggle-geo" />
          </div>
          {settings.geo_blocking_enabled && (
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Blocked Country Codes (comma-separated, e.g. CN,RU,KP)</label>
              <input
                value={settings.blocked_countries?.join(', ') || ''}
                onChange={e => update('blocked_countries', e.target.value.split(',').map(c => c.trim().toUpperCase()).filter(Boolean))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm font-mono"
                placeholder="CN, RU, KP"
                data-testid="geo-countries-input"
              />
              <p className="text-xs text-zinc-600 mt-1">Use ISO 3166-1 alpha-2 codes. Network admins bypass geo-blocking.</p>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving} className="bg-red-600 hover:bg-red-700" data-testid="save-settings-btn">
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Save Settings
        </Button>
      </div>
    </div>
  );
}

// ============== SHARED COMPONENTS ==============

function ToggleSwitch({ checked, onChange, testId }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative w-12 h-7 rounded-full transition-colors ${checked ? 'bg-green-600' : 'bg-zinc-700'}`}
      data-testid={testId}
    >
      <span className={`absolute top-0.5 w-6 h-6 rounded-full bg-white transition-transform ${checked ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  );
}

function SettingInput({ label, value, onChange, testId }) {
  return (
    <div>
      <label className="text-xs text-zinc-500 mb-1 block">{label}</label>
      <input
        type="number"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm"
        data-testid={testId}
      />
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex justify-center py-16">
      <Loader2 className="w-6 h-6 animate-spin text-red-500" />
    </div>
  );
}
