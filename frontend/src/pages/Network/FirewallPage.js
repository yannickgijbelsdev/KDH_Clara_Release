/* eslint-disable */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useMainSite } from '../../context/MainSiteContext';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';
import {
  Shield, ShieldAlert, ShieldCheck, ShieldOff, Plus, Trash2, Globe,
  Ban, CheckCircle, Clock, AlertTriangle, Activity, X, Loader2,
  Lock, Unlock, RefreshCw, Monitor, UserX, KeyRound, Scan,
  Users, Timer, LogOut, AlertCircle, Info, Network, Eye, EyeOff,
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
    { id: 'audit', label: 'Security Audit', icon: Scan },
    { id: 'sessions', label: 'Sessions', icon: Users },
    { id: 'endpoints', label: 'Endpoints', icon: Network },
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
                tab === t.id ? 'bg-red-600 text-white' : 'bg-zinc-100 text-zinc-600 border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-200'
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
      {tab === 'audit' && <AuditTab token={token} mainSiteId={mainSite?.id} />}
      {tab === 'sessions' && <SessionsTab token={token} mainSiteId={mainSite?.id} />}
      {tab === 'endpoints' && <EndpointsTab token={token} mainSiteId={mainSite?.id} />}
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
      } catch { /* noop */ }
      setLoading(false);
    })();
  }, [mainSiteId]);

  if (loading) return <Spinner />;

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
            <div key={c.label} className="bg-white/80 backdrop-blur rounded-xl border border-zinc-200 p-5">
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
        <div className="bg-white/80 backdrop-blur rounded-xl border border-zinc-200 p-5">
          <h3 className="text-base font-semibold mb-4 flex items-center gap-2"><Ban className="w-4 h-4 text-red-400" />Top Blocked IPs</h3>
          <div className="space-y-2">
            {stats.top_blocked_ips.map((item, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-zinc-200 last:border-0">
                <span className="text-sm font-mono text-zinc-600">{item.ip}</span>
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

// ============== SECURITY AUDIT TAB ==============
function AuditTab({ token, mainSiteId }) {
  const [audit, setAudit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState({});

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const runAudit = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/firewall/audit/${mainSiteId}`, { headers });
      if (res.ok) setAudit(await res.json());
    } catch { /* noop */ }
    setLoading(false);
  }, [mainSiteId]);

  useEffect(() => { runAudit(); }, [runAudit]);

  const forcePasswordChange = async (userId) => {
    setActionLoading(p => ({ ...p, [userId]: true }));
    try {
      const res = await fetch(`${API}/api/firewall/users/${userId}/force-password-change`, { method: 'POST', headers });
      if (res.ok) { toast.success('Password change forced'); runAudit(); }
    } catch { /* noop */ }
    setActionLoading(p => ({ ...p, [userId]: false }));
  };

  const blockUser = async (userId) => {
    setActionLoading(p => ({ ...p, [`block_${userId}`]: true }));
    try {
      const res = await fetch(`${API}/api/firewall/users/${userId}/block`, {
        method: 'POST', headers, body: JSON.stringify({ reason: 'Blocked from security audit' }),
      });
      if (res.ok) { toast.success('User blocked'); runAudit(); }
    } catch { /* noop */ }
    setActionLoading(p => ({ ...p, [`block_${userId}`]: false }));
  };

  if (loading) return <Spinner />;
  if (!audit) return <div className="text-zinc-500">Could not load audit</div>;

  const scoreColor = audit.score >= 80 ? 'text-green-400' : audit.score >= 50 ? 'text-amber-400' : 'text-red-400';
  const scoreBg = audit.score >= 80 ? 'bg-green-500/10' : audit.score >= 50 ? 'bg-amber-500/10' : 'bg-red-500/10';
  const gradeLabel = audit.grade === 'good' ? 'Good' : audit.grade === 'moderate' ? 'Moderate' : 'Poor';

  const severityIcon = { critical: AlertCircle, warning: AlertTriangle, info: Info };
  const severityColor = { critical: 'text-red-400 bg-red-500/10', warning: 'text-amber-400 bg-amber-500/10', info: 'text-blue-400 bg-blue-500/10' };

  return (
    <div className="space-y-6" data-testid="audit-tab">
      {/* Score Card */}
      <div className="bg-white/80 backdrop-blur rounded-xl border border-zinc-200 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-5">
            <div className={`w-20 h-20 rounded-2xl ${scoreBg} flex items-center justify-center`}>
              <span className={`text-3xl font-bold ${scoreColor}`}>{audit.score}</span>
            </div>
            <div>
              <h2 className={`text-xl font-bold ${scoreColor}`}>{gradeLabel}</h2>
              <p className="text-sm text-zinc-500 mt-1">
                {audit.total_users} users &middot; {audit.users_without_2fa} without 2FA &middot; {audit.users_with_weak_passwords} weak passwords &middot; {audit.active_blocks} blocks &middot; {audit.active_rules} rules
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={runAudit} data-testid="rerun-audit-btn">
            <RefreshCw className="w-4 h-4 mr-2" /> Rescan
          </Button>
        </div>
      </div>

      {/* Issues */}
      {audit.issues?.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-base font-semibold">Issues & Recommendations</h3>
          {audit.issues.map((issue, i) => {
            const SevIcon = severityIcon[issue.severity] || Info;
            const sevColor = severityColor[issue.severity] || severityColor.info;
            return (
              <div key={i} className="bg-white/80 backdrop-blur rounded-xl border border-zinc-200 p-4 flex items-start gap-4">
                <div className={`w-9 h-9 rounded-lg ${sevColor.split(' ')[1]} flex items-center justify-center flex-shrink-0`}>
                  <SevIcon className={`w-5 h-5 ${sevColor.split(' ')[0]}`} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{issue.message}</p>
                  <p className="text-xs text-zinc-500 mt-1">{issue.action}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${sevColor} font-medium`}>{issue.severity}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Weak Password Users */}
      {audit.weak_password_users?.length > 0 && (
        <div className="bg-white/80 backdrop-blur rounded-xl border border-zinc-200 p-5">
          <h3 className="text-base font-semibold mb-4 flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-amber-400" /> Users with Weak Passwords
          </h3>
          <div className="space-y-3">
            {audit.weak_password_users.map(u => (
              <div key={u.id} className="flex items-center justify-between py-2 border-b border-zinc-200 last:border-0">
                <div>
                  <span className="text-sm font-medium">{u.name}</span>
                  <span className="text-xs text-zinc-500 ml-2">{u.email}</span>
                  <span className="text-xs text-amber-400/70 ml-2">{u.reason}</span>
                </div>
                <div className="flex items-center gap-2">
                  {u.force_password_change ? (
                    <span className="text-xs bg-amber-500/10 text-amber-400 px-2 py-1 rounded-full">Forced</span>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => forcePasswordChange(u.id)} disabled={actionLoading[u.id]} data-testid={`force-pw-${u.id}`}>
                      {actionLoading[u.id] ? <Loader2 className="w-3 h-3 animate-spin" /> : <KeyRound className="w-3 h-3 mr-1" />}
                      Force Change
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="text-red-400 border-red-500/20 hover:bg-red-500/10" onClick={() => blockUser(u.id)} disabled={actionLoading[`block_${u.id}`]} data-testid={`block-user-${u.id}`}>
                    {actionLoading[`block_${u.id}`] ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserX className="w-3 h-3 mr-1" />}
                    Block
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Users without 2FA */}
      {audit.users_without_2fa_list?.length > 0 && (
        <div className="bg-white/80 backdrop-blur rounded-xl border border-zinc-200 p-5">
          <h3 className="text-base font-semibold mb-4 flex items-center gap-2">
            <ShieldOff className="w-4 h-4 text-red-400" /> Users without 2FA
          </h3>
          <div className="space-y-2">
            {audit.users_without_2fa_list.map(u => (
              <div key={u.id} className="flex items-center justify-between py-2 border-b border-zinc-200 last:border-0">
                <div>
                  <span className="text-sm font-medium">{u.name}</span>
                  <span className="text-xs text-zinc-500 ml-2">{u.email}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============== SESSIONS TAB ==============
function SessionsTab({ token, mainSiteId }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/firewall/sessions?main_site_id=${mainSiteId}`, { headers });
      if (res.ok) setSessions((await res.json()).sessions || []);
    } catch { /* noop */ }
    setLoading(false);
  }, [mainSiteId]);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  // Live timer update every second
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const terminateSession = async (sessionId) => {
    try {
      const res = await fetch(`${API}/api/firewall/sessions/${sessionId}/terminate`, { method: 'POST', headers });
      if (res.ok) { toast.success('Session terminated'); fetchSessions(); }
    } catch { /* noop */ }
  };

  const terminateAllForUser = async (userId) => {
    try {
      const res = await fetch(`${API}/api/firewall/sessions/terminate-user/${userId}`, { method: 'POST', headers });
      if (res.ok) { const d = await res.json(); toast.success(`${d.terminated_count} session(s) terminated`); fetchSessions(); }
    } catch { /* noop */ }
  };

  const formatDuration = (startedAt) => {
    const start = new Date(startedAt).getTime();
    const diff = Math.max(0, Math.floor((now - start) / 1000));
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    const s = diff % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6" data-testid="sessions-tab">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500">{sessions.length} active session(s)</p>
        <button onClick={fetchSessions} className="p-2 rounded-lg hover:bg-zinc-100 text-zinc-400">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {sessions.length === 0 ? (
        <div className="bg-white/80 backdrop-blur rounded-xl border border-zinc-200 p-12 text-center">
          <Users className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
          <p className="text-sm text-zinc-500">No active sessions</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map(session => (
            <div key={session.id} className="bg-white/80 backdrop-blur rounded-xl border border-zinc-200 p-5" data-testid={`session-${session.id}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                    <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{session.user_name}</span>
                      <span className="text-xs text-zinc-500">{session.user_email}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500">
                      <span className="font-mono">{session.ip}</span>
                      {session.country_name && session.country_name !== 'Unknown' && (
                        <span className="flex items-center gap-1"><Globe className="w-3 h-3" />{session.country_name} {session.city && `(${session.city})`}</span>
                      )}
                      <span className="flex items-center gap-1"><Monitor className="w-3 h-3" />{parseUA(session.user_agent)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="flex items-center gap-1.5 text-green-400">
                      <Timer className="w-4 h-4" />
                      <span className="text-sm font-mono font-medium" data-testid={`duration-${session.id}`}>{formatDuration(session.started_at)}</span>
                    </div>
                    <span className="text-xs text-zinc-600">since {new Date(session.started_at).toLocaleTimeString('nl-BE')}</span>
                  </div>
                  <Button size="sm" variant="outline" className="text-red-400 border-red-500/20 hover:bg-red-500/10" onClick={() => terminateSession(session.id)} data-testid={`terminate-${session.id}`}>
                    <LogOut className="w-4 h-4 mr-1" /> Terminate
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function parseUA(ua) {
  if (!ua) return 'Unknown';
  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Safari')) return 'Safari';
  if (ua.includes('Edge')) return 'Edge';
  return ua.substring(0, 30);
}


// ============== ENDPOINTS TAB ==============
function EndpointsTab({ token, mainSiteId }) {
  const [groups, setGroups] = useState([]);
  const [publicGroups, setPublicGroups] = useState([]);
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState(null);
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const fetchData = useCallback(async () => {
    try {
      const [epRes, connRes] = await Promise.all([
        fetch(`${API}/api/firewall/endpoints/${mainSiteId}`, { headers }),
        fetch(`${API}/api/firewall/endpoints/${mainSiteId}/connections`, { headers }),
      ]);
      if (epRes.ok) {
        const data = await epRes.json();
        setGroups(data.groups || []);
        setPublicGroups(data.public_groups || []);
      }
      if (connRes.ok) {
        setConnections((await connRes.json()).connections || []);
      }
    } catch { /* noop */ }
    setLoading(false);
  }, [mainSiteId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-refresh connections every 10s
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API}/api/firewall/endpoints/${mainSiteId}/connections`, { headers });
        if (res.ok) setConnections((await res.json()).connections || []);
      } catch { /* noop */ }
    }, 10000);
    return () => clearInterval(interval);
  }, [mainSiteId]);

  const toggleGroup = async (groupId) => {
    const newPublic = publicGroups.includes(groupId)
      ? publicGroups.filter(g => g !== groupId)
      : [...publicGroups, groupId];

    setSaving(true);
    try {
      const res = await fetch(`${API}/api/firewall/endpoints/${mainSiteId}`, {
        method: 'PUT', headers,
        body: JSON.stringify({ public_groups: newPublic }),
      });
      if (res.ok) {
        setPublicGroups(newPublic);
        toast.success(`${groupId} is now ${newPublic.includes(groupId) ? 'public' : 'private'}`);
      }
    } catch { /* noop */ }
    setSaving(false);
  };

  const getConnectionsForGroup = (groupId) => {
    return connections.find(c => c.group === groupId);
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6" data-testid="endpoints-tab">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-zinc-500">
            {publicGroups.length} of {groups.length} endpoint groups are public
          </p>
          <p className="text-xs text-zinc-600 mt-1">RDS endpoints are always public and cannot be locked.</p>
        </div>
        <button onClick={fetchData} className="p-2 rounded-lg hover:bg-zinc-100 text-zinc-400">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Always Public Notice */}
      <div className="bg-green-500/5 rounded-xl border border-green-500/20 p-4 flex items-center gap-3">
        <Eye className="w-5 h-5 text-green-400 flex-shrink-0" />
        <div>
          <p className="text-sm font-medium text-green-400">Always Public (not configurable)</p>
          <p className="text-xs text-zinc-500 mt-0.5">RDS Settings, RDS Builder Output, Public Schedules, Public Site Pages, Uploads, Share Links</p>
        </div>
      </div>

      {/* Endpoint Groups */}
      <div className="space-y-2">
        {groups.map(group => {
          const isPublic = publicGroups.includes(group.id);
          const conn = getConnectionsForGroup(group.id);
          const isExpanded = expandedGroup === group.id;

          return (
            <div key={group.id} className="bg-white/80 backdrop-blur rounded-xl border border-zinc-200 overflow-hidden" data-testid={`endpoint-${group.id}`}>
              <div className="p-4 flex items-center justify-between">
                <div
                  className="flex items-center gap-3 flex-1 cursor-pointer"
                  onClick={() => setExpandedGroup(isExpanded ? null : group.id)}
                >
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isPublic ? 'bg-green-500/10' : 'bg-zinc-100'}`}>
                    {isPublic ? <Eye className="w-4 h-4 text-green-400" /> : <EyeOff className="w-4 h-4 text-zinc-500" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{group.label}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${isPublic ? 'bg-green-500/10 text-green-400' : 'bg-zinc-100 text-zinc-500'}`}>
                        {isPublic ? 'public' : 'private'}
                      </span>
                      {conn && conn.total_requests > 0 && (
                        <span className="text-xs bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Activity className="w-3 h-3" />
                          {conn.total_requests} req ({conn.unique_ips} IPs)
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5">{group.description}</p>
                  </div>
                </div>
                <Toggle
                  checked={isPublic}
                  onChange={() => toggleGroup(group.id)}
                  testId={`toggle-${group.id}`}
                />
              </div>

              {/* Connection details when expanded and public */}
              {isExpanded && isPublic && conn && conn.connections?.length > 0 && (
                <div className="border-t border-zinc-200 p-4 bg-zinc-950/50">
                  <h4 className="text-xs font-semibold text-zinc-400 mb-3 flex items-center gap-2">
                    <Monitor className="w-3.5 h-3.5" />
                    Active Connections (last hour)
                  </h4>
                  <div className="space-y-2">
                    {conn.connections.map((c, i) => (
                      <div key={i} className="flex items-center justify-between py-2 border-b border-zinc-200/50 last:border-0">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-mono text-zinc-600">{c.ip}</span>
                          {c.country_name && c.country_name !== 'Unknown' && (
                            <span className="text-xs text-zinc-500 flex items-center gap-1">
                              <Globe className="w-3 h-3" />
                              {c.country_name} {c.city && `(${c.city})`}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-xs text-zinc-500">
                          <span>{c.request_count} requests</span>
                          {c.duration_seconds > 0 && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {c.duration_seconds < 60 ? `${c.duration_seconds}s` : `${Math.floor(c.duration_seconds / 60)}m`}
                            </span>
                          )}
                          <span className="text-zinc-600">{new Date(c.last_seen).toLocaleTimeString('nl-BE')}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {isExpanded && isPublic && (!conn || conn.connections?.length === 0) && (
                <div className="border-t border-zinc-200 p-4 bg-zinc-950/50 text-center">
                  <p className="text-xs text-zinc-600">No connections in the last hour</p>
                </div>
              )}

              {isExpanded && !isPublic && (
                <div className="border-t border-zinc-200 p-4 bg-zinc-950/50 text-center">
                  <p className="text-xs text-zinc-600">Endpoint is private — set to public to see connections</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
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
    } catch { /* noop */ }
    setLoading(false);
  }, [mainSiteId]);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  const createRule = async () => {
    if (!form.name || !form.ip_patterns.trim()) return;
    setSaving(true);
    try {
      const patterns = form.ip_patterns.split('\n').map(l => l.trim()).filter(Boolean);
      const res = await fetch(`${API}/api/firewall/rules/${mainSiteId}`, {
        method: 'POST', headers, body: JSON.stringify({ ...form, ip_patterns: patterns }),
      });
      if (res.ok) { toast.success('Rule created'); setShowForm(false); setForm({ name: '', type: 'blacklist', ip_patterns: '', description: '' }); fetchRules(); }
    } catch { /* noop */ }
    setSaving(false);
  };

  const toggleRule = async (rule) => {
    await fetch(`${API}/api/firewall/rules/${mainSiteId}/${rule.id}`, { method: 'PUT', headers, body: JSON.stringify({ active: !rule.active }) });
    fetchRules();
  };

  const deleteRule = async (ruleId) => {
    if (!window.confirm('Delete this rule?')) return;
    await fetch(`${API}/api/firewall/rules/${mainSiteId}/${ruleId}`, { method: 'DELETE', headers });
    toast.success('Rule deleted'); fetchRules();
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6" data-testid="rules-tab">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500">{rules.length} rules configured</p>
        <Button onClick={() => setShowForm(!showForm)} className="bg-red-600 hover:bg-red-700" data-testid="add-rule-btn">
          <Plus className="w-4 h-4 mr-2" /> Add Rule
        </Button>
      </div>
      {showForm && (
        <div className="bg-white/80 backdrop-blur rounded-xl border border-zinc-200 p-5 space-y-4" data-testid="rule-form">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Rule Name</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2.5 text-sm" placeholder="e.g. Block suspicious range" data-testid="rule-name-input" />
            </div>
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Type</label>
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2.5 text-sm" data-testid="rule-type-select">
                <option value="blacklist">Blacklist (block these IPs)</option>
                <option value="whitelist">Whitelist (only allow these IPs)</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">IP Addresses / CIDR Ranges (one per line)</label>
            <textarea value={form.ip_patterns} onChange={e => setForm({ ...form, ip_patterns: e.target.value })} rows={4} className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2.5 text-sm font-mono" placeholder={"192.168.1.100\n10.0.0.0/24"} data-testid="rule-patterns-input" />
          </div>
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Description</label>
            <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2.5 text-sm" placeholder="Optional description" />
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
          <EmptyState icon={Shield} text="No IP rules configured yet" />
        ) : rules.map(rule => (
          <div key={rule.id} className={`bg-white/80 backdrop-blur rounded-xl border p-5 ${rule.active ? 'border-zinc-200' : 'border-zinc-200/50 opacity-60'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${rule.type === 'whitelist' ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                  {rule.type === 'whitelist' ? <CheckCircle className="w-4 h-4 text-green-400" /> : <Ban className="w-4 h-4 text-red-400" />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{rule.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${rule.type === 'whitelist' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>{rule.type}</span>
                    {!rule.active && <span className="text-xs text-zinc-500">(disabled)</span>}
                  </div>
                  <p className="text-xs text-zinc-500 mt-1">{rule.ip_patterns?.length} pattern(s): {rule.ip_patterns?.slice(0, 3).join(', ')}{rule.ip_patterns?.length > 3 && ` +${rule.ip_patterns.length - 3} more`}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => toggleRule(rule)} className="p-2 rounded-lg hover:bg-zinc-100 transition-colors" title={rule.active ? 'Disable' : 'Enable'}>
                  {rule.active ? <ShieldCheck className="w-4 h-4 text-green-400" /> : <ShieldOff className="w-4 h-4 text-zinc-500" />}
                </button>
                <button onClick={() => deleteRule(rule.id)} className="p-2 rounded-lg hover:bg-zinc-100 transition-colors text-zinc-500 hover:text-red-400">
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
    } catch { /* noop */ }
    setLoading(false);
  }, [mainSiteId]);

  useEffect(() => { fetchBlocks(); }, [fetchBlocks]);

  const blockIp = async () => {
    if (!form.ip.trim()) return;
    setSaving(true);
    try {
      const body = { ip: form.ip.trim(), reason: form.reason || 'Manual block', duration_minutes: form.duration_minutes ? parseInt(form.duration_minutes) : null };
      const res = await fetch(`${API}/api/firewall/blocks`, { method: 'POST', headers, body: JSON.stringify(body) });
      if (res.ok) { toast.success(`IP ${form.ip} blocked`); setShowForm(false); setForm({ ip: '', reason: '', duration_minutes: '' }); fetchBlocks(); }
    } catch { /* noop */ }
    setSaving(false);
  };

  const unblockIp = async (ip) => {
    const res = await fetch(`${API}/api/firewall/blocks/${encodeURIComponent(ip)}`, { method: 'DELETE', headers });
    if (res.ok) { toast.success(`IP ${ip} unblocked`); fetchBlocks(); }
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6" data-testid="blocks-tab">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500">{blocks.length} active blocks</p>
        <Button onClick={() => setShowForm(!showForm)} className="bg-red-600 hover:bg-red-700" data-testid="block-ip-btn">
          <Ban className="w-4 h-4 mr-2" /> Block IP
        </Button>
      </div>
      {showForm && (
        <div className="bg-white/80 backdrop-blur rounded-xl border border-zinc-200 p-5 space-y-4" data-testid="block-form">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">IP Address</label>
              <input value={form.ip} onChange={e => setForm({ ...form, ip: e.target.value })} className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2.5 text-sm font-mono" placeholder="192.168.1.100" data-testid="block-ip-input" />
            </div>
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Reason</label>
              <input value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2.5 text-sm" placeholder="Suspicious activity" />
            </div>
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Duration (minutes, empty = permanent)</label>
              <input value={form.duration_minutes} onChange={e => setForm({ ...form, duration_minutes: e.target.value })} className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2.5 text-sm" placeholder="30" type="number" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={blockIp} disabled={saving} className="bg-red-600 hover:bg-red-700" data-testid="confirm-block-btn">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Block IP'}</Button>
          </div>
        </div>
      )}
      <div className="space-y-3">
        {blocks.length === 0 ? (
          <EmptyState icon={ShieldCheck} text="No blocked IPs" />
        ) : blocks.map(block => (
          <div key={block.id} className="bg-white/80 backdrop-blur rounded-xl border border-zinc-200 p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center"><Ban className="w-5 h-5 text-red-400" /></div>
                <div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-mono font-medium">{block.ip}</span>
                    {block.country_code && block.country_code !== 'XX' && (
                      <span className="text-xs bg-zinc-200 text-zinc-500 px-2 py-0.5 rounded-full flex items-center gap-1"><Globe className="w-3 h-3" />{block.country_name} ({block.city})</span>
                    )}
                    {block.auto_blocked && <span className="text-xs bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-full">auto</span>}
                  </div>
                  <p className="text-xs text-zinc-500 mt-1">{block.reason}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-zinc-600">
                    <span>{new Date(block.blocked_at).toLocaleString('nl-BE')}</span>
                    {block.expires_at ? <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Expires: {new Date(block.expires_at).toLocaleString('nl-BE')}</span> : <span className="text-red-400">Permanent</span>}
                  </div>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => unblockIp(block.ip)} data-testid={`unblock-${block.ip}`}><Unlock className="w-4 h-4 mr-1" /> Unblock</Button>
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

  const eventTypes = ['all', 'successful_login', 'failed_login', 'ip_blocked', 'ip_unblocked', 'rate_limit_exceeded', 'geo_blocked', 'ip_blacklisted', 'ip_not_whitelisted', 'session_terminated', 'user_blocked', 'user_unblocked', 'api_access'];

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      let url = `${API}/api/firewall/logs?limit=${limit}&offset=${page * limit}`;
      if (mainSiteId) url += `&main_site_id=${mainSiteId}`;
      if (filter !== 'all') url += `&event_type=${filter}`;
      const res = await fetch(url, { headers });
      if (res.ok) { const d = await res.json(); setLogs(d.logs || []); setTotal(d.total || 0); }
    } catch { /* noop */ }
    setLoading(false);
  }, [mainSiteId, filter, page]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const EC = {
    successful_login: 'text-green-400 bg-green-500/10', failed_login: 'text-red-400 bg-red-500/10',
    ip_blocked: 'text-red-400 bg-red-500/10', ip_unblocked: 'text-green-400 bg-green-500/10',
    rate_limit_exceeded: 'text-amber-400 bg-amber-500/10', geo_blocked: 'text-purple-400 bg-purple-500/10',
    ip_blacklisted: 'text-red-400 bg-red-500/10', ip_not_whitelisted: 'text-orange-400 bg-orange-500/10',
    session_terminated: 'text-red-400 bg-red-500/10', user_blocked: 'text-red-400 bg-red-500/10',
    user_unblocked: 'text-green-400 bg-green-500/10', api_access: 'text-blue-400 bg-blue-500/10',
  };

  return (
    <div className="space-y-6" data-testid="logs-tab">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500">{total} events</p>
        <button onClick={fetchLogs} className="p-2 rounded-lg hover:bg-zinc-100 text-zinc-400"><RefreshCw className="w-4 h-4" /></button>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {eventTypes.map(type => (
          <button key={type} onClick={() => { setFilter(type); setPage(0); }} className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${filter === type ? 'bg-red-600 text-white' : 'bg-zinc-100 text-zinc-600 border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-200'}`}>
            {type === 'all' ? 'All' : type.replace(/_/g, ' ')}
          </button>
        ))}
      </div>
      {loading ? <Spinner /> : (
        <div className="space-y-2">
          {logs.length === 0 ? <EmptyState icon={Activity} text="No events found" /> : logs.map(log => {
            const colors = EC[log.event_type] || 'text-zinc-400 bg-zinc-500/10';
            return (
              <div key={log.id} className="bg-white/80 backdrop-blur rounded-xl border border-zinc-200 px-5 py-3.5 flex items-center gap-4">
                <div className={`w-8 h-8 rounded-lg ${colors.split(' ')[1]} flex items-center justify-center flex-shrink-0`}>
                  <Activity className={`w-4 h-4 ${colors.split(' ')[0]}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${colors} font-medium`}>{log.event_type?.replace(/_/g, ' ')}</span>
                    {log.user_email && <span className="text-xs text-zinc-400">{log.user_email}</span>}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500">
                    <span className="font-mono">{log.ip}</span>
                    {log.country_name && log.country_name !== 'Unknown' && <span className="flex items-center gap-1"><Globe className="w-3 h-3" />{log.country_name} {log.city && `(${log.city})`}</span>}
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
      } catch { /* noop */ }
      setLoading(false);
    })();
  }, [mainSiteId]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/firewall/settings/${mainSiteId}`, { method: 'PUT', headers, body: JSON.stringify(settings) });
      if (res.ok) { toast.success('Settings saved'); setSettings(await res.json()); } else { toast.error('Failed to save'); }
    } catch { /* noop */ }
    setSaving(false);
  };

  if (loading || !settings) return <Spinner />;
  const update = (key, val) => setSettings(s => ({ ...s, [key]: val }));

  return (
    <div className="space-y-6" data-testid="settings-tab">
      <div className="bg-white/80 backdrop-blur rounded-xl border border-zinc-200 p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold">Firewall Enabled</h3>
            <p className="text-xs text-zinc-500 mt-1">Enable or disable the firewall for this site</p>
          </div>
          <Toggle checked={settings.enabled} onChange={v => update('enabled', v)} testId="toggle-enabled" />
        </div>
        <hr className="border-zinc-200" />
        <div>
          <h3 className="text-base font-semibold mb-4 flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-amber-400" />Brute Force Protection</h3>
          <div className="grid grid-cols-3 gap-4">
            <NumInput label="Max Attempts" value={settings.brute_force_max_attempts} onChange={v => update('brute_force_max_attempts', parseInt(v) || 5)} testId="bf-max" />
            <NumInput label="Window (minutes)" value={settings.brute_force_window_minutes} onChange={v => update('brute_force_window_minutes', parseInt(v) || 15)} testId="bf-window" />
            <NumInput label="Ban Duration (minutes)" value={settings.brute_force_ban_minutes} onChange={v => update('brute_force_ban_minutes', parseInt(v) || 30)} testId="bf-ban" />
          </div>
        </div>
        <hr className="border-zinc-200" />
        <div>
          <h3 className="text-base font-semibold mb-4 flex items-center gap-2"><Activity className="w-4 h-4 text-blue-400" />Rate Limiting</h3>
          <div className="grid grid-cols-2 gap-4">
            <NumInput label="Max Requests" value={settings.rate_limit_requests} onChange={v => update('rate_limit_requests', parseInt(v) || 200)} testId="rl-max" />
            <NumInput label="Window (seconds)" value={settings.rate_limit_window_seconds} onChange={v => update('rate_limit_window_seconds', parseInt(v) || 60)} testId="rl-window" />
          </div>
        </div>
        <hr className="border-zinc-200" />
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold flex items-center gap-2"><Globe className="w-4 h-4 text-purple-400" />Geo-Blocking</h3>
            <Toggle checked={settings.geo_blocking_enabled} onChange={v => update('geo_blocking_enabled', v)} testId="toggle-geo" />
          </div>
          {settings.geo_blocking_enabled && (
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Blocked Country Codes (comma-separated, e.g. CN,RU,KP)</label>
              <input value={settings.blocked_countries?.join(', ') || ''} onChange={e => update('blocked_countries', e.target.value.split(',').map(c => c.trim().toUpperCase()).filter(Boolean))} className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2.5 text-sm font-mono" placeholder="CN, RU, KP" data-testid="geo-countries-input" />
              <p className="text-xs text-zinc-600 mt-1">Use ISO 3166-1 alpha-2 codes. Network admins bypass geo-blocking.</p>
            </div>
          )}
        </div>
      </div>
      <div className="flex justify-end">
        <Button onClick={save} disabled={saving} className="bg-red-600 hover:bg-red-700" data-testid="save-settings-btn">
          {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Save Settings
        </Button>
      </div>
    </div>
  );
}

// ============== SHARED ==============
function Toggle({ checked, onChange, testId }) {
  return (
    <button onClick={() => onChange(!checked)} className={`relative w-12 h-7 rounded-full transition-colors ${checked ? 'bg-green-600' : 'bg-zinc-700'}`} data-testid={testId}>
      <span className={`absolute top-0.5 w-6 h-6 rounded-full bg-white transition-transform ${checked ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  );
}
function NumInput({ label, value, onChange, testId }) {
  return (
    <div>
      <label className="text-xs text-zinc-500 mb-1 block">{label}</label>
      <input type="number" value={value} onChange={e => onChange(e.target.value)} className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2.5 text-sm" data-testid={testId} />
    </div>
  );
}
function Spinner() {
  return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-red-500" /></div>;
}
function EmptyState({ icon: Icon, text }) {
  return (
    <div className="bg-white/80 backdrop-blur rounded-xl border border-zinc-200 p-12 text-center">
      <Icon className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
      <p className="text-sm text-zinc-500">{text}</p>
    </div>
  );
}
