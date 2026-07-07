/* eslint-disable */
import { useState, useEffect, useCallback } from 'react';
import {
  Shield, ShieldCheck, ShieldOff, Globe, MapPin, Search, X, Ban,
  CheckCircle, AlertTriangle, Clock, Unlock, Lock, ChevronDown, ChevronUp, Loader2
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

const API = process.env.REACT_APP_BACKEND_URL;
const headers = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('token')}`,
});

const SEVERITY_STYLES = {
  critical: 'bg-red-500/10 text-red-600 border-red-200',
  warning: 'bg-amber-500/10 text-amber-600 border-amber-200',
  info: 'bg-blue-500/10 text-blue-600 border-blue-200',
};

const EVENT_ICONS = {
  brute_force_detected: <Ban className="w-3.5 h-3.5 text-red-500" />,
  ip_blocked: <Lock className="w-3.5 h-3.5 text-amber-500" />,
  ip_unblocked: <Unlock className="w-3.5 h-3.5 text-emerald-500" />,
  login_failed: <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />,
  geo_blocked: <Globe className="w-3.5 h-3.5 text-red-400" />,
  default: <Shield className="w-3.5 h-3.5 text-zinc-400" />,
};

export default function RackFirewallPanel({ rackId, rackName, onClose }) {
  const [tab, setTab] = useState('logs');
  const [logs, setLogs] = useState([]);
  const [blockedIps, setBlockedIps] = useState([]);
  const [geoRules, setGeoRules] = useState(null);
  const [allCountries, setAllCountries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [countrySearch, setCountrySearch] = useState('');
  const [blockIpInput, setBlockIpInput] = useState('');
  const [actionLoading, setActionLoading] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [logsRes, ipsRes, geoRes, countriesRes] = await Promise.all([
        fetch(`${API}/api/firewall/rack/${rackId}/logs`, { headers: headers() }),
        fetch(`${API}/api/firewall/rack/${rackId}/blocked-ips`, { headers: headers() }),
        fetch(`${API}/api/firewall/rack/${rackId}/geo-rules`, { headers: headers() }),
        fetch(`${API}/api/firewall/countries`, { headers: headers() }),
      ]);
      if (logsRes.ok) { const d = await logsRes.json(); setLogs(d.logs || []); }
      if (ipsRes.ok) { const d = await ipsRes.json(); setBlockedIps(d.blocked_ips || []); }
      if (geoRes.ok) { const d = await geoRes.json(); setGeoRules(d); }
      if (countriesRes.ok) { const d = await countriesRes.json(); setAllCountries(d.countries || []); }
    } catch { /* noop */ }
    setLoading(false);
  }, [rackId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleUnblockIp = async (ip) => {
    setActionLoading(ip);
    try {
      await fetch(`${API}/api/firewall/rack/${rackId}/unblock-ip`, {
        method: 'POST', headers: headers(),
        body: JSON.stringify({ ip, rack_id: rackId }),
      });
      fetchData();
    } catch { /* noop */ }
    setActionLoading(null);
  };

  const handleBlockIp = async () => {
    if (!blockIpInput.trim()) return;
    setActionLoading('block-new');
    try {
      await fetch(`${API}/api/firewall/rack/${rackId}/block-ip?ip=${encodeURIComponent(blockIpInput.trim())}&reason=manual`, {
        method: 'POST', headers: headers(),
      });
      setBlockIpInput('');
      fetchData();
    } catch { /* noop */ }
    setActionLoading(null);
  };

  const handleToggleCountry = async (code, isAllowed) => {
    setActionLoading(code);
    const endpoint = isAllowed ? 'remove-country' : 'add-country';
    try {
      const res = await fetch(`${API}/api/firewall/rack/${rackId}/geo-rules/${endpoint}?country_code=${code}`, {
        method: 'POST', headers: headers(),
      });
      if (res.ok) {
        const d = await res.json();
        setGeoRules(prev => ({ ...prev, allowed_countries: d.allowed_countries }));
      }
    } catch { /* noop */ }
    setActionLoading(null);
  };

  const allowedSet = new Set(geoRules?.allowed_countries || []);
  const filteredCountries = allCountries.filter(c =>
    c.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
    c.code.toLowerCase().includes(countrySearch.toLowerCase())
  );
  const allowedCount = allowedSet.size;
  const blockedCount = allCountries.length - allowedCount;

  const tabs = [
    { id: 'logs', label: 'Logs', icon: Clock, count: logs.length },
    { id: 'blocked', label: 'Blocked IPs', icon: Ban, count: blockedIps.length },
    { id: 'geo', label: 'Geo Blocking', icon: Globe, count: blockedCount },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-[680px] max-h-[85vh] flex flex-col overflow-hidden border border-zinc-200" onClick={e => e.stopPropagation()} data-testid="rack-firewall-panel">

        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-orange-500" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-900">Clara Global Protect</h2>
              <p className="text-xs text-zinc-400">{rackName}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-zinc-100 transition-colors" data-testid="close-firewall-panel">
            <X className="w-4 h-4 text-zinc-400" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-3 border-b border-zinc-100 flex-shrink-0">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-t-lg transition-colors -mb-px ${
                tab === t.id ? 'bg-white border border-zinc-200 border-b-white text-zinc-900' : 'text-zinc-400 hover:text-zinc-600'
              }`}
              data-testid={`firewall-tab-${t.id}`}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
              {t.count > 0 && (
                <span className={`min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[10px] font-bold ${
                  tab === t.id ? 'bg-orange-500 text-white' : 'bg-zinc-100 text-zinc-500'
                }`}>{t.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-zinc-300 animate-spin" /></div>
          ) : tab === 'logs' ? (
            /* === LOGS TAB === */
            <div className="space-y-2">
              {logs.length === 0 ? (
                <div className="text-center py-12">
                  <ShieldCheck className="w-10 h-10 text-emerald-300 mx-auto mb-3" />
                  <p className="text-sm text-zinc-400">No security events recorded</p>
                  <p className="text-xs text-zinc-300 mt-1">All systems operating normally</p>
                </div>
              ) : logs.map((log, i) => (
                <div key={log.id || i} className={`flex items-start gap-3 p-3 rounded-xl border ${SEVERITY_STYLES[log.severity] || SEVERITY_STYLES.info}`} data-testid={`firewall-log-${i}`}>
                  <div className="mt-0.5">{EVENT_ICONS[log.event] || EVENT_ICONS.default}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold capitalize">{(log.event || '').replace(/_/g, ' ')}</span>
                      {log.ip && <span className="text-[10px] font-mono bg-black/5 px-1.5 py-0.5 rounded">{log.ip}</span>}
                    </div>
                    <p className="text-[11px] opacity-70 mt-0.5 truncate">{log.details}</p>
                    <p className="text-[10px] opacity-50 mt-1">{new Date(log.timestamp).toLocaleString('en-GB')}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : tab === 'blocked' ? (
            /* === BLOCKED IPs TAB === */
            <div className="space-y-3">
              {/* Manual block input */}
              <div className="flex gap-2">
                <Input
                  value={blockIpInput}
                  onChange={(e) => setBlockIpInput(e.target.value)}
                  placeholder="Enter IP to block (e.g. 192.168.1.1)"
                  className="bg-zinc-50 border-zinc-200 text-sm h-9"
                  data-testid="block-ip-input"
                />
                <Button size="sm" onClick={handleBlockIp} disabled={!blockIpInput.trim() || actionLoading === 'block-new'} className="bg-red-500 hover:bg-red-600 text-white h-9 px-3 text-xs" data-testid="block-ip-btn">
                  {actionLoading === 'block-new' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Ban className="w-3.5 h-3.5 mr-1" />Block</>}
                </Button>
              </div>
              {blockedIps.length === 0 ? (
                <div className="text-center py-10">
                  <CheckCircle className="w-10 h-10 text-emerald-300 mx-auto mb-3" />
                  <p className="text-sm text-zinc-400">No blocked IP addresses</p>
                </div>
              ) : blockedIps.map((b, i) => (
                <div key={b.ip + i} className="flex items-center gap-3 p-3 rounded-xl border border-zinc-200 bg-zinc-50 group" data-testid={`blocked-ip-${i}`}>
                  <Ban className="w-4 h-4 text-red-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-mono text-zinc-800">{b.ip}</span>
                    <p className="text-[11px] text-zinc-400 truncate">{b.reason} &mdash; {new Date(b.blocked_at).toLocaleString('en-GB')}</p>
                    {b.blocked_by && <p className="text-[10px] text-zinc-300">by {b.blocked_by}</p>}
                  </div>
                  <Button size="sm" variant="outline" onClick={() => handleUnblockIp(b.ip)} disabled={actionLoading === b.ip} className="opacity-0 group-hover:opacity-100 transition-opacity h-7 text-xs border-emerald-200 text-emerald-600 hover:bg-emerald-50" data-testid={`unblock-ip-${i}`}>
                    {actionLoading === b.ip ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Unlock className="w-3 h-3 mr-1" />Unblock</>}
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            /* === GEO BLOCKING TAB === */
            <div className="space-y-3">
              {/* Stats bar */}
              <div className="flex gap-3">
                <div className="flex-1 bg-emerald-50 rounded-xl p-3 text-center border border-emerald-100">
                  <div className="text-lg font-bold text-emerald-600">{allowedCount}</div>
                  <div className="text-[10px] text-emerald-500 uppercase tracking-wider">Allowed</div>
                </div>
                <div className="flex-1 bg-red-50 rounded-xl p-3 text-center border border-red-100">
                  <div className="text-lg font-bold text-red-500">{blockedCount}</div>
                  <div className="text-[10px] text-red-400 uppercase tracking-wider">Blocked</div>
                </div>
              </div>

              {geoRules?.is_default && (
                <div className="flex items-center gap-2 p-2.5 bg-blue-50 border border-blue-100 rounded-xl">
                  <Globe className="w-4 h-4 text-blue-500 flex-shrink-0" />
                  <p className="text-xs text-blue-600">Default policy: Only European countries are allowed. Customize below.</p>
                </div>
              )}

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-300" />
                <Input
                  value={countrySearch}
                  onChange={(e) => setCountrySearch(e.target.value)}
                  placeholder="Search countries..."
                  className="pl-9 bg-zinc-50 border-zinc-200 h-9 text-sm"
                  data-testid="geo-search"
                />
              </div>

              {/* Country list */}
              <div className="space-y-1 max-h-[340px] overflow-y-auto">
                {filteredCountries.map(c => {
                  const isAllowed = allowedSet.has(c.code);
                  return (
                    <div key={c.code} className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors ${
                      isAllowed ? 'border-emerald-100 bg-emerald-50/50' : 'border-red-100 bg-red-50/30'
                    }`} data-testid={`country-${c.code}`}>
                      <span className="text-sm">{c.code}</span>
                      <span className="text-sm text-zinc-700 flex-1">{c.name}</span>
                      {c.is_european && <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-600 font-medium">EU</span>}
                      <button
                        onClick={() => handleToggleCountry(c.code, isAllowed)}
                        disabled={actionLoading === c.code}
                        className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                          isAllowed ? 'bg-emerald-100 text-emerald-600 hover:bg-red-100 hover:text-red-500' : 'bg-red-100 text-red-500 hover:bg-emerald-100 hover:text-emerald-600'
                        }`}
                        data-testid={`toggle-country-${c.code}`}
                      >
                        {actionLoading === c.code ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : isAllowed ? <CheckCircle className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
