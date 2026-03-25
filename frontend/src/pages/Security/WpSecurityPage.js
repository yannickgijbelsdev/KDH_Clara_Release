import { useState, useEffect, useCallback } from 'react';
import { useMainSite } from '../../context/MainSiteContext';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'sonner';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { ConnectionStatus } from '../../components/ConnectionStatus';
import {
  Shield, Globe, Lock, Ban, CheckCircle, XCircle, AlertTriangle,
  Loader2, RefreshCw, Plus, Trash2, Check, ExternalLink, Zap,
  ShieldAlert, ShieldCheck, ShieldOff, Eye, EyeOff, Copy
} from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

function StepIndicator({ steps, current }) {
  return (
    <div className="flex items-center gap-1 mb-4">
      {steps.map((s, i) => (
        <div key={i} className="flex items-center gap-1">
          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${i <= current ? 'bg-red-500/20 text-red-400 border border-red-500/50' : 'bg-zinc-800 text-zinc-600 border border-zinc-700'}`}>
            {i < current ? <Check className="w-3 h-3" /> : i + 1}
          </div>
          <span className={`text-[10px] hidden sm:inline ${i <= current ? 'text-zinc-300' : 'text-zinc-600'}`}>{s}</span>
          {i < steps.length - 1 && <div className={`w-4 h-px ${i < current ? 'bg-red-500/50' : 'bg-zinc-700'}`} />}
        </div>
      ))}
    </div>
  );
}

export default function WpSecurityPage() {
  const { currentSite } = useMainSite();
  const { token } = useAuth();
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'x-main-site-id': currentSite?.id };

  // Wizard state
  const [setupStep, setSetupStep] = useState(0);
  const [editStep, setEditStep] = useState(null);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState(null);

  // Step 1: WordPress URL
  const [wpUrl, setWpUrl] = useState('');
  const [wpSaving, setWpSaving] = useState(false);

  // Step 2: WAF Rules
  const [wafRules, setWafRules] = useState([]);
  const [wafSaving, setWafSaving] = useState(false);

  // Step 3: IP Blocklist
  const [blocklist, setBlocklist] = useState([]);
  const [newBlockIp, setNewBlockIp] = useState('');
  const [newBlockNote, setNewBlockNote] = useState('');
  const [blockSaving, setBlockSaving] = useState(false);

  // Step 4: Login Protection
  const [loginProtection, setLoginProtection] = useState({ enabled: false, block_xmlrpc: true, limit_login_attempts: true, max_attempts: 5 });
  const [loginSaving, setLoginSaving] = useState(false);

  const mainSiteId = currentSite?.id;

  const fetchConfig = useCallback(async () => {
    if (!mainSiteId) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/wp-security/config`, { headers });
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
        setWpUrl(data.wordpress_url || '');
        setWafRules(data.waf_rules || getDefaultWafRules());
        setBlocklist(data.ip_blocklist || []);
        setLoginProtection(data.login_protection || { enabled: false, block_xmlrpc: true, limit_login_attempts: true, max_attempts: 5 });

        // Determine wizard step
        if (data.wordpress_url) {
          if (data.waf_rules?.length > 0) {
            if (data.login_protection?.enabled) setSetupStep(4);
            else setSetupStep(3);
          } else setSetupStep(2);
        } else setSetupStep(0);
      } else {
        setSetupStep(0);
        setWafRules(getDefaultWafRules());
      }
    } catch { toast.error('Failed to load security config'); }
    setLoading(false);
  }, [mainSiteId]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  function getDefaultWafRules() {
    return [
      { id: 'block_xmlrpc', name: 'Block XML-RPC', description: 'Blocks xmlrpc.php — #1 attack vector for WordPress brute force and DDoS', target: '/xmlrpc.php', action: 'block', enabled: true, severity: 'critical' },
      { id: 'protect_wp_login', name: 'Rate Limit wp-login.php', description: 'Limits login attempts to prevent brute force attacks', target: '/wp-login.php', action: 'rate_limit', rate_limit: '10/min', enabled: true, severity: 'high' },
      { id: 'block_wp_config', name: 'Block wp-config.php Access', description: 'Prevents direct access to configuration file', target: '/wp-config.php', action: 'block', enabled: true, severity: 'critical' },
      { id: 'protect_wp_admin', name: 'Rate Limit wp-admin', description: 'Rate limits admin area to slow down automated attacks', target: '/wp-admin/', action: 'rate_limit', rate_limit: '30/min', enabled: true, severity: 'medium' },
      { id: 'block_debug_log', name: 'Block debug.log', description: 'Prevents access to debug log which may contain sensitive info', target: '/wp-content/debug.log', action: 'block', enabled: true, severity: 'high' },
      { id: 'block_readme', name: 'Block readme.html', description: 'Hides WordPress version info from attackers', target: '/readme.html', action: 'block', enabled: false, severity: 'low' },
    ];
  }

  const saveWpUrl = async () => {
    setWpSaving(true);
    try {
      const res = await fetch(`${API}/api/wp-security/config`, {
        method: 'PUT', headers, body: JSON.stringify({ wordpress_url: wpUrl })
      });
      if (res.ok) { toast.success('WordPress URL saved'); setSetupStep(Math.max(setupStep, 1)); setEditStep(null); await fetchConfig(); }
      else { const e = await res.json(); toast.error(e.detail || 'Save failed'); }
    } catch { toast.error('Save failed'); }
    setWpSaving(false);
  };

  const saveWafRules = async () => {
    setWafSaving(true);
    try {
      const res = await fetch(`${API}/api/wp-security/waf-rules`, {
        method: 'PUT', headers, body: JSON.stringify({ rules: wafRules })
      });
      if (res.ok) { toast.success('WAF rules saved'); setSetupStep(Math.max(setupStep, 2)); setEditStep(null); await fetchConfig(); }
      else { const e = await res.json(); toast.error(e.detail || 'Save failed'); }
    } catch { toast.error('Save failed'); }
    setWafSaving(false);
  };

  const addToBlocklist = async () => {
    if (!newBlockIp.trim()) return;
    setBlockSaving(true);
    try {
      const res = await fetch(`${API}/api/wp-security/blocklist`, {
        method: 'POST', headers, body: JSON.stringify({ ip: newBlockIp.trim(), note: newBlockNote.trim() })
      });
      if (res.ok) { toast.success(`${newBlockIp} blocked`); setNewBlockIp(''); setNewBlockNote(''); await fetchConfig(); }
      else { const e = await res.json(); toast.error(e.detail || 'Failed to add IP'); }
    } catch { toast.error('Failed to add IP'); }
    setBlockSaving(false);
  };

  const removeFromBlocklist = async (ip) => {
    try {
      const res = await fetch(`${API}/api/wp-security/blocklist/${encodeURIComponent(ip)}`, { method: 'DELETE', headers });
      if (res.ok) { toast.success(`${ip} removed from blocklist`); await fetchConfig(); }
      else toast.error('Failed to remove IP');
    } catch { toast.error('Failed to remove IP'); }
  };

  const saveLoginProtection = async () => {
    setLoginSaving(true);
    try {
      const res = await fetch(`${API}/api/wp-security/login-protection`, {
        method: 'PUT', headers, body: JSON.stringify(loginProtection)
      });
      if (res.ok) { toast.success('Login protection saved'); setSetupStep(Math.max(setupStep, 4)); setEditStep(null); await fetchConfig(); }
      else { const e = await res.json(); toast.error(e.detail || 'Save failed'); }
    } catch { toast.error('Save failed'); }
    setLoginSaving(false);
  };

  const toggleWafRule = (id) => {
    setWafRules(rules => rules.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));
  };

  const severityColors = {
    critical: 'bg-red-500/10 text-red-400 border-red-500/20',
    high: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    medium: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    low: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-zinc-500"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading security config...</div>;

  return (
    <div className="space-y-4 max-w-4xl" data-testid="wp-security-page">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100 flex items-center gap-2"><Shield className="w-5 h-5 text-red-400" /> WordPress Security</h2>
          <p className="text-xs text-zinc-500">Firewall, WAF rules, IP blocklist & brute force protection</p>
        </div>
      </div>

      <ConnectionStatus
        testUrl={config?.wordpress_url ? `${API}/api/wp-security/test-connection` : null}
        headers={headers}
        label="WordPress Site"
        autoCheck={!!config?.wordpress_url}
      />

      <StepIndicator steps={['WordPress URL', 'WAF Rules', 'IP Blocklist', 'Login Protection']} current={setupStep} />

      {/* Step 1: WordPress URL */}
      <Card className={`border-zinc-800 ${setupStep === 0 ? 'bg-gradient-to-r from-red-950/30 to-zinc-900 ring-1 ring-red-500/30' : 'bg-zinc-900'}`}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3 cursor-pointer" onClick={() => setEditStep(editStep === 0 ? null : 0)}>
            <div className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${config?.wordpress_url ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-500'}`}>
                {config?.wordpress_url ? <Check className="w-3 h-3" /> : '1'}
              </div>
              <span className="text-sm font-medium text-zinc-200">WordPress URL</span>
              {config?.wordpress_url && <code className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded">{config.wordpress_url}</code>}
            </div>
          </div>
          {(setupStep === 0 || editStep === 0) && (
            <div className="space-y-3">
              <div className="rounded-md bg-zinc-800/60 border border-zinc-700/50 p-3">
                <p className="text-[10px] uppercase tracking-wider text-red-400 font-semibold mb-1">Which WordPress site do you want to protect?</p>
                <p className="text-xs text-zinc-400">Enter the full URL of your WordPress installation. This is used to verify connectivity and configure Cloudflare WAF rules.</p>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-zinc-400">WordPress URL</Label>
                <Input value={wpUrl} onChange={e => setWpUrl(e.target.value)} placeholder="https://example.com" className="bg-zinc-800 border-zinc-700 text-white font-mono text-sm" data-testid="wp-url-input" />
              </div>
              <Button onClick={saveWpUrl} disabled={!wpUrl.trim() || wpSaving} className="bg-red-600 hover:bg-red-700" data-testid="save-wp-url-btn">
                {wpSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
                Save & Continue
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 2: WAF Rules */}
      <Card className={`border-zinc-800 ${setupStep === 1 ? 'bg-gradient-to-r from-red-950/30 to-zinc-900 ring-1 ring-red-500/30' : 'bg-zinc-900'}`}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3 cursor-pointer" onClick={() => setEditStep(editStep === 1 ? null : 1)}>
            <div className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${config?.waf_rules?.length > 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-500'}`}>
                {config?.waf_rules?.length > 0 ? <Check className="w-3 h-3" /> : '2'}
              </div>
              <span className="text-sm font-medium text-zinc-200">WAF Rules</span>
              {config?.waf_rules?.length > 0 && <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">{config.waf_rules.filter(r => r.enabled).length} active</span>}
            </div>
          </div>
          {(setupStep === 1 || editStep === 1) && (
            <div className="space-y-3">
              <div className="rounded-md bg-zinc-800/60 border border-zinc-700/50 p-3">
                <p className="text-[10px] uppercase tracking-wider text-red-400 font-semibold mb-1">Web Application Firewall</p>
                <p className="text-xs text-zinc-400">These rules block the most common WordPress attack vectors. Toggle rules on/off based on your needs.</p>
              </div>
              <div className="space-y-2">
                {wafRules.map(rule => (
                  <div key={rule.id} className={`flex items-center justify-between p-3 rounded-lg border ${rule.enabled ? 'bg-zinc-800/50 border-zinc-700' : 'bg-zinc-900/50 border-zinc-800 opacity-60'}`} data-testid={`waf-rule-${rule.id}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-zinc-200">{rule.name}</span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded border ${severityColors[rule.severity]}`}>{rule.severity}</span>
                        <code className="text-[10px] bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded">{rule.target}</code>
                      </div>
                      <p className="text-xs text-zinc-500 mt-0.5">{rule.description}</p>
                    </div>
                    <button onClick={() => toggleWafRule(rule.id)} className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ml-3 ${rule.enabled ? 'bg-red-600' : 'bg-zinc-700'}`} data-testid={`toggle-waf-${rule.id}`}>
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${rule.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                ))}
              </div>
              <Button onClick={saveWafRules} disabled={wafSaving} className="bg-red-600 hover:bg-red-700" data-testid="save-waf-rules-btn">
                {wafSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
                Save WAF Rules
              </Button>
            </div>
          )}
          {setupStep < 1 && editStep !== 1 && <p className="text-xs text-zinc-500">Complete the previous step first.</p>}
        </CardContent>
      </Card>

      {/* Step 3: IP Blocklist */}
      <Card className={`border-zinc-800 ${setupStep === 2 ? 'bg-gradient-to-r from-red-950/30 to-zinc-900 ring-1 ring-red-500/30' : 'bg-zinc-900'}`}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3 cursor-pointer" onClick={() => setEditStep(editStep === 2 ? null : 2)}>
            <div className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${blocklist.length > 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-500'}`}>
                {blocklist.length > 0 ? <Check className="w-3 h-3" /> : '3'}
              </div>
              <span className="text-sm font-medium text-zinc-200">IP Blocklist</span>
              {blocklist.length > 0 && <span className="text-[10px] px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">{blocklist.length} blocked</span>}
            </div>
          </div>
          {(setupStep >= 2 || editStep === 2) && (
            <div className="space-y-3">
              <div className="rounded-md bg-zinc-800/60 border border-zinc-700/50 p-3">
                <p className="text-[10px] uppercase tracking-wider text-red-400 font-semibold mb-1">Manual IP blocking</p>
                <p className="text-xs text-zinc-400">Block specific IP addresses or ranges. These IPs will be blocked across all your WordPress sites via Cloudflare.</p>
              </div>
              <div className="flex gap-2">
                <Input value={newBlockIp} onChange={e => setNewBlockIp(e.target.value)} placeholder="IP address (e.g. 192.168.1.1)" className="bg-zinc-800 border-zinc-700 text-white font-mono text-sm flex-1" data-testid="block-ip-input" />
                <Input value={newBlockNote} onChange={e => setNewBlockNote(e.target.value)} placeholder="Note (optional)" className="bg-zinc-800 border-zinc-700 text-white text-sm w-48" data-testid="block-note-input" />
                <Button onClick={addToBlocklist} disabled={!newBlockIp.trim() || blockSaving} variant="destructive" size="sm" data-testid="add-block-btn">
                  {blockSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
                </Button>
              </div>
              {blocklist.length > 0 && (
                <div className="rounded-md border border-zinc-700/50 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-zinc-800/80"><th className="text-left px-3 py-1.5 text-zinc-400">IP Address</th><th className="text-left px-3 py-1.5 text-zinc-400">Note</th><th className="text-left px-3 py-1.5 text-zinc-400">Added</th><th className="w-8"></th></tr></thead>
                    <tbody>
                      {blocklist.map(entry => (
                        <tr key={entry.ip} className="border-t border-zinc-800" data-testid={`blocked-ip-${entry.ip}`}>
                          <td className="px-3 py-2 font-mono text-zinc-200">{entry.ip}</td>
                          <td className="px-3 py-2 text-zinc-500">{entry.note || '—'}</td>
                          <td className="px-3 py-2 text-zinc-600">{entry.added_at ? new Date(entry.added_at).toLocaleDateString() : '—'}</td>
                          <td className="px-2 py-2"><button onClick={() => removeFromBlocklist(entry.ip)} className="text-zinc-600 hover:text-red-400"><Trash2 className="w-3 h-3" /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {blocklist.length === 0 && <p className="text-xs text-zinc-600 text-center py-4">No IP addresses blocked yet.</p>}
            </div>
          )}
          {setupStep < 2 && editStep !== 2 && <p className="text-xs text-zinc-500">Complete the previous steps first.</p>}
        </CardContent>
      </Card>

      {/* Step 4: Login Protection */}
      <Card className={`border-zinc-800 ${setupStep === 3 ? 'bg-gradient-to-r from-red-950/30 to-zinc-900 ring-1 ring-red-500/30' : 'bg-zinc-900'}`}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3 cursor-pointer" onClick={() => setEditStep(editStep === 3 ? null : 3)}>
            <div className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${loginProtection.enabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-500'}`}>
                {loginProtection.enabled ? <Check className="w-3 h-3" /> : '4'}
              </div>
              <span className="text-sm font-medium text-zinc-200">Login Protection</span>
              {loginProtection.enabled && <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Active</span>}
            </div>
          </div>
          {(setupStep >= 3 || editStep === 3) && (
            <div className="space-y-3">
              <div className="rounded-md bg-zinc-800/60 border border-zinc-700/50 p-3">
                <p className="text-[10px] uppercase tracking-wider text-red-400 font-semibold mb-1">Brute force protection</p>
                <p className="text-xs text-zinc-400">Automatically blocks IPs that attempt too many failed logins. Works alongside Wordfence.</p>
              </div>
              <div className="space-y-3">
                <label className="flex items-center gap-3 p-3 rounded-lg border border-zinc-700 bg-zinc-800/50 cursor-pointer">
                  <input type="checkbox" checked={loginProtection.enabled} onChange={e => setLoginProtection({...loginProtection, enabled: e.target.checked})} className="rounded bg-zinc-700 border-zinc-600 text-red-500" />
                  <div><p className="text-sm text-zinc-200">Enable Login Protection</p><p className="text-xs text-zinc-500">Master switch for all login protection features</p></div>
                </label>
                <label className="flex items-center gap-3 p-3 rounded-lg border border-zinc-700 bg-zinc-800/50 cursor-pointer">
                  <input type="checkbox" checked={loginProtection.block_xmlrpc} onChange={e => setLoginProtection({...loginProtection, block_xmlrpc: e.target.checked})} className="rounded bg-zinc-700 border-zinc-600 text-red-500" />
                  <div><p className="text-sm text-zinc-200">Block XML-RPC Authentication</p><p className="text-xs text-zinc-500">Blocks authentication via xmlrpc.php — the #1 brute force vector</p></div>
                </label>
                <label className="flex items-center gap-3 p-3 rounded-lg border border-zinc-700 bg-zinc-800/50 cursor-pointer">
                  <input type="checkbox" checked={loginProtection.limit_login_attempts} onChange={e => setLoginProtection({...loginProtection, limit_login_attempts: e.target.checked})} className="rounded bg-zinc-700 border-zinc-600 text-red-500" />
                  <div><p className="text-sm text-zinc-200">Limit Login Attempts</p><p className="text-xs text-zinc-500">Auto-block after too many failed attempts</p></div>
                </label>
                {loginProtection.limit_login_attempts && (
                  <div className="ml-8 space-y-1">
                    <Label className="text-xs text-zinc-400">Max attempts before block</Label>
                    <Input type="number" value={loginProtection.max_attempts} onChange={e => setLoginProtection({...loginProtection, max_attempts: parseInt(e.target.value) || 5})} className="bg-zinc-800 border-zinc-700 text-white w-24 text-sm" min={1} max={50} />
                  </div>
                )}
              </div>
              <Button onClick={saveLoginProtection} disabled={loginSaving} className="bg-red-600 hover:bg-red-700" data-testid="save-login-protection-btn">
                {loginSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Lock className="w-4 h-4 mr-2" />}
                Save Login Protection
              </Button>
            </div>
          )}
          {setupStep < 3 && editStep !== 3 && <p className="text-xs text-zinc-500">Complete the previous steps first.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
