import { useState, useEffect } from 'react';
import { useMainSite } from '../../context/MainSiteContext';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'sonner';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { ConnectionStatus } from '../../components/ConnectionStatus';
import ClaraErrorButton from '../../components/ClaraErrorButton';
import {
  Shield, Globe, Lock, Ban, Check, Loader2, Trash2, Cloud, Zap,
  ShieldCheck, Copy, AlertTriangle, CheckCircle, XCircle, Bug, Search,
  ExternalLink, Eye, EyeOff, RefreshCw
} from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

function StepIndicator({ steps, current }) {
  return (
    <div className="flex items-center gap-1 mb-4 flex-wrap">
      {steps.map((s, i) => (
        <div key={i} className="flex items-center gap-1">
          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${i <= current ? 'bg-red-500/20 text-red-400 border border-red-500/50' : 'bg-zinc-100 text-zinc-500 border border-zinc-200'}`}>
            {i < current ? <Check className="w-3 h-3" /> : i + 1}
          </div>
          <span className={`text-[10px] hidden sm:inline ${i <= current ? 'text-zinc-600' : 'text-zinc-600'}`}>{s}</span>
          {i < steps.length - 1 && <div className={`w-4 h-px ${i < current ? 'bg-red-500/50' : 'bg-zinc-700'}`} />}
        </div>
      ))}
    </div>
  );
}

function SyncBadge({ result }) {
  if (!result) return <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500 border border-zinc-300">Local only</span>;
  if (result.status === 'ok') return <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Synced to Cloudflare</span>;

  const steps = result.steps || [];
  const tooltip = steps.length > 0 ? steps.join('\n') : result.message;
  return (
    <span className="inline-flex items-center gap-1.5 text-[9px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 cursor-help" title={tooltip}>
      Sync failed: {result.message?.substring(0, 50)}
      <ClaraErrorButton errorMessage={`WAF Sync failed: ${result.message}`} errorContext="WordPress Security — Cloudflare WAF sync" className="text-[9px] px-1.5 py-0.5" />
    </span>
  );
}

export default function WpSecurityPage() {
  const { mainSite } = useMainSite();
  const { token } = useAuth();

  const [setupStep, setSetupStep] = useState(0);
  const [editStep, setEditStep] = useState(null);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState(null);

  // Step 1: WordPress URL
  const [wpUrl, setWpUrl] = useState('');
  const [wpSaving, setWpSaving] = useState(false);

  // Step 2: Cloudflare Credentials
  const [cfToken, setCfToken] = useState('');
  const [cfZoneId, setCfZoneId] = useState('');
  const [cfSaving, setCfSaving] = useState(false);
  const [cfTestResult, setCfTestResult] = useState(null);
  const [cfTesting, setCfTesting] = useState(false);
  const [showCfToken, setShowCfToken] = useState(false);

  // Step 3: WAF Rules
  const [wafRules, setWafRules] = useState([]);
  const [wafSaving, setWafSaving] = useState(false);
  const [wafSyncResult, setWafSyncResult] = useState(null);

  // Step 4: IP Blocklist
  const [blocklist, setBlocklist] = useState([]);
  const [newBlockIp, setNewBlockIp] = useState('');
  const [newBlockNote, setNewBlockNote] = useState('');
  const [blockSaving, setBlockSaving] = useState(false);

  // Step 5: Login Protection
  const [loginProtection, setLoginProtection] = useState({ enabled: false, block_xmlrpc: true, limit_login_attempts: true, max_attempts: 5 });
  const [loginSaving, setLoginSaving] = useState(false);

  // Step 6: Wordfence
  const [wfStatus, setWfStatus] = useState(null);
  const [wfLoading, setWfLoading] = useState(false);

  const mainSiteId = mainSite?.id;

  const getHeaders = () => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'x-main-site-id': mainSiteId || '',
  });

  const [refetchCount, setRefetchCount] = useState(0);
  const refetch = () => setRefetchCount(c => c + 1);

  useEffect(() => {
    if (!mainSiteId) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API}/api/wp-security/config`, {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'x-main-site-id': mainSiteId }
        });
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          setConfig(data);
          setWpUrl(data.wordpress_url || '');
          setCfZoneId(data.cf_zone_id || '');
          setCfToken('');
          setWafRules(data.waf_rules || getDefaultWafRules());
          setBlocklist(data.ip_blocklist || []);
          setLoginProtection(data.login_protection || { enabled: false, block_xmlrpc: true, limit_login_attempts: true, max_attempts: 5 });

          // Restore cached Wordfence scan from DB
          if (data.last_wordfence_scan) {
            setWfStatus(data.last_wordfence_scan);
          }

          // Determine wizard step
          if (!data.wordpress_url) { setSetupStep(0); }
          else if (!data.cf_api_token_set) { setSetupStep(1); }
          else if (!data.waf_rules?.length) { setSetupStep(2); }
          else if (!data.login_protection?.enabled) { setSetupStep(4); }
          else { setSetupStep(6); }
        } else {
          setSetupStep(0);
          setWafRules(getDefaultWafRules());
        }
      } catch { if (!cancelled) toast.error('Failed to load security config'); }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [mainSiteId, token, refetchCount]);

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

  // ─── Save functions ───────────────────────────────────────────────

  const saveWpUrl = async () => {
    setWpSaving(true);
    try {
      const res = await fetch(`${API}/api/wp-security/config`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify({ wordpress_url: wpUrl }) });
      if (res.ok) { toast.success('WordPress URL saved'); setEditStep(null); refetch(); }
      else { const e = await res.json(); toast.error(e.detail || 'Save failed'); }
    } catch { toast.error('Save failed'); }
    setWpSaving(false);
  };

  const saveCfConfig = async () => {
    setCfSaving(true);
    try {
      const body = {};
      if (cfToken.trim()) body.cf_api_token = cfToken.trim();
      if (cfZoneId.trim()) body.cf_zone_id = cfZoneId.trim();
      const res = await fetch(`${API}/api/wp-security/cloudflare-config`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(body) });
      if (res.ok) { toast.success('Cloudflare credentials saved'); setCfToken(''); setEditStep(null); refetch(); }
      else { const e = await res.json(); toast.error(e.detail || 'Save failed'); }
    } catch { toast.error('Save failed'); }
    setCfSaving(false);
  };

  const testCfConnection = async () => {
    setCfTesting(true);
    try {
      const res = await fetch(`${API}/api/wp-security/cloudflare-test`, { headers: getHeaders() });
      const data = await res.json();
      setCfTestResult(data);
    } catch { setCfTestResult({ status: 'error', message: 'Test failed' }); }
    setCfTesting(false);
  };

  const saveWafRules = async () => {
    setWafSaving(true);
    setWafSyncResult(null);
    try {
      const res = await fetch(`${API}/api/wp-security/waf-rules`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify({ rules: wafRules }) });
      if (res.ok) {
        const data = await res.json();
        setWafSyncResult(data.cloudflare_sync);
        toast.success(data.cloudflare_sync?.status === 'ok' ? `${data.active} rules synced to Cloudflare` : 'WAF rules saved locally');
        setEditStep(null);
        refetch();
      } else { const e = await res.json(); toast.error(e.detail || 'Save failed'); }
    } catch { toast.error('Save failed'); }
    setWafSaving(false);
  };

  const addToBlocklist = async () => {
    if (!newBlockIp.trim()) return;
    setBlockSaving(true);
    try {
      const res = await fetch(`${API}/api/wp-security/blocklist`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ ip: newBlockIp.trim(), note: newBlockNote.trim() }) });
      if (res.ok) {
        const data = await res.json();
        const msg = data.cloudflare_sync?.status === 'ok' ? `${newBlockIp} blocked in Cloudflare` : `${newBlockIp} blocked locally`;
        toast.success(msg);
        setNewBlockIp(''); setNewBlockNote('');
        refetch();
      } else { const e = await res.json(); toast.error(e.detail || 'Failed to add IP'); }
    } catch { toast.error('Failed to add IP'); }
    setBlockSaving(false);
  };

  const removeFromBlocklist = async (ip) => {
    try {
      const res = await fetch(`${API}/api/wp-security/blocklist/${encodeURIComponent(ip)}`, { method: 'DELETE', headers: getHeaders() });
      if (res.ok) { toast.success(`${ip} removed`); refetch(); }
      else toast.error('Failed to remove IP');
    } catch { toast.error('Failed to remove IP'); }
  };

  const saveLoginProtection = async () => {
    setLoginSaving(true);
    try {
      const res = await fetch(`${API}/api/wp-security/login-protection`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(loginProtection) });
      if (res.ok) {
        const data = await res.json();
        toast.success(data.cloudflare_sync?.status === 'ok' ? 'Login protection synced to Cloudflare' : 'Login protection saved');
        setEditStep(null);
        refetch();
      } else { const e = await res.json(); toast.error(e.detail || 'Save failed'); }
    } catch { toast.error('Save failed'); }
    setLoginSaving(false);
  };

  const loadWordfenceStatus = async () => {
    setWfLoading(true);
    try {
      const res = await fetch(`${API}/api/wp-security/wordfence-status`, { headers: getHeaders() });
      if (res.ok) setWfStatus(await res.json());
      else toast.error('Failed to load Wordfence status');
    } catch { toast.error('Failed to load Wordfence status'); }
    setWfLoading(false);
  };

  const toggleWafRule = (id) => setWafRules(rules => rules.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));

  const severityColors = {
    critical: 'bg-red-500/10 text-red-400 border-red-500/20',
    high: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    medium: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    low: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
  };

  const hasCf = config?.cf_api_token_set;

  if (loading) return <div className="flex items-center justify-center h-64 text-zinc-500"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading security config...</div>;

  return (
    <div className="space-y-4" data-testid="wp-security-page">
      <div>
        <h2 className="text-lg font-semibold text-zinc-100 flex items-center gap-2"><Shield className="w-5 h-5 text-red-400" /> WordPress Security</h2>
        <p className="text-xs text-zinc-500">Firewall, WAF rules, IP blocklist & brute force protection</p>
      </div>

      <ConnectionStatus testUrl={config?.wordpress_url ? `${API}/api/wp-security/test-connection` : null} headers={getHeaders()} label="WordPress Site" autoCheck={!!config?.wordpress_url} />

      <StepIndicator steps={['WordPress URL', 'Cloudflare API', 'WAF Rules', 'IP Blocklist', 'Login Protection', 'Wordfence']} current={setupStep} />

      {/* ─── Step 1: WordPress URL ──────────────────────────────── */}
      <WizardStep
        stepNum={0} title="WordPress URL" icon={<Globe className="w-4 h-4" />}
        completed={!!config?.wordpress_url} summary={config?.wordpress_url}
        active={setupStep === 0} editStep={editStep} setEditStep={setEditStep}
      >
        <TipBox color="red" title="Which WordPress site do you want to protect?">
          Enter the full URL of your WordPress installation. This is used to verify connectivity and configure Cloudflare WAF rules.
        </TipBox>
        <div className="space-y-2">
          <Label className="text-xs text-zinc-400">WordPress URL</Label>
          <Input value={wpUrl} onChange={e => setWpUrl(e.target.value)} placeholder="https://example.com" className="bg-zinc-50 border-zinc-200 text-zinc-900 font-mono text-sm" data-testid="wp-url-input" />
        </div>
        <Button onClick={saveWpUrl} disabled={!wpUrl.trim() || wpSaving} className="bg-red-600 hover:bg-red-700" data-testid="save-wp-url-btn">
          {wpSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />} Save & Continue
        </Button>
      </WizardStep>

      {/* ─── Step 2: Cloudflare Credentials ─────────────────────── */}
      <WizardStep
        stepNum={1} title="Cloudflare API" icon={<Cloud className="w-4 h-4" />}
        completed={hasCf} summary={hasCf ? `Zone: ${config?.cf_zone_id || '?'}` : null}
        active={setupStep === 1} editStep={editStep} setEditStep={setEditStep}
        badge={hasCf ? <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Connected</span> : null}
        prerequisite={setupStep < 1 && editStep !== 1}
      >
        <TipBox color="orange" title="Connect Cloudflare to enable real protection">
          Without Cloudflare, rules are only stored locally. With Cloudflare credentials, Clara will automatically create WAF rules, block IPs, and add rate limiting directly in your Cloudflare zone.
        </TipBox>
        <div className="rounded-md bg-zinc-100/60 border border-zinc-200 p-3 space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold">How to get your API Token:</p>
          <ol className="space-y-1 text-xs text-zinc-400 list-decimal list-inside">
            <li>Go to <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noopener noreferrer" className="text-orange-400 hover:text-orange-300">dash.cloudflare.com/profile/api-tokens</a></li>
            <li>Click <strong className="text-zinc-200">Create Token</strong></li>
            <li>Use the <strong className="text-zinc-200">Edit zone DNS</strong> template (or custom)</li>
            <li>Add permissions: <code className="bg-zinc-900 px-1 rounded text-[10px]">Zone - Firewall Services - Edit</code> and <code className="bg-zinc-900 px-1 rounded text-[10px]">Zone - Zone - Read</code></li>
            <li>Set Zone Resources to your WordPress domain</li>
            <li>Click <strong className="text-zinc-200">Continue → Create Token</strong>, then copy it</li>
          </ol>
        </div>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs text-zinc-400">API Token {config?.cf_api_token_set && <span className="text-emerald-400 ml-1">(saved: {config.cf_api_token_preview})</span>}</Label>
            <div className="relative">
              <Input type={showCfToken ? 'text' : 'password'} value={cfToken} onChange={e => setCfToken(e.target.value)} placeholder={config?.cf_api_token_set ? 'Leave blank to keep current token' : 'Paste your API Token here'} className="bg-zinc-50 border-zinc-200 text-zinc-900 font-mono text-sm pr-10" data-testid="cf-token-input" />
              <button onClick={() => setShowCfToken(!showCfToken)} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-600">
                {showCfToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-zinc-400">Zone ID <span className="text-zinc-600">(from Cloudflare dashboard → Overview → right sidebar)</span></Label>
            <Input value={cfZoneId} onChange={e => setCfZoneId(e.target.value)} placeholder="e.g. abc123def456..." className="bg-zinc-50 border-zinc-200 text-zinc-900 font-mono text-sm" data-testid="cf-zone-input" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={saveCfConfig} disabled={(!cfToken.trim() && !cfZoneId.trim()) || cfSaving} className="bg-red-600 hover:bg-red-700" data-testid="save-cf-config-btn">
            {cfSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />} Save Credentials
          </Button>
          {config?.cf_api_token_set && (
            <Button onClick={testCfConnection} disabled={cfTesting} variant="outline" className="border-zinc-300 text-zinc-600" data-testid="test-cf-btn">
              {cfTesting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Zap className="w-4 h-4 mr-2" />} Test Connection
            </Button>
          )}
        </div>
        {cfTestResult && (
          <div className={`rounded-md border p-2.5 text-xs ${cfTestResult.status === 'ok' ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400' : 'bg-red-500/5 border-red-500/20 text-red-400'}`} data-testid="cf-test-result">
            <div className="flex items-center gap-1.5">
              {cfTestResult.status === 'ok' ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
              <span>{cfTestResult.message}</span>
            </div>
            {cfTestResult.zone_name && <p className="mt-1 text-zinc-400">Zone: {cfTestResult.zone_name} | Plan: {cfTestResult.plan}</p>}
            {cfTestResult.steps && (
              <ol className="mt-2 space-y-1 list-decimal list-inside text-zinc-400">
                {cfTestResult.steps.map((s, i) => <li key={i}>{s}</li>)}
              </ol>
            )}
          </div>
        )}
      </WizardStep>

      {/* ─── Step 3: WAF Rules ──────────────────────────────────── */}
      <WizardStep
        stepNum={2} title="WAF Rules" icon={<ShieldCheck className="w-4 h-4" />}
        completed={config?.waf_rules?.length > 0} summary={config?.waf_rules?.length > 0 ? `${config.waf_rules.filter(r => r.enabled).length} active` : null}
        active={setupStep === 2} editStep={editStep} setEditStep={setEditStep}
        badge={<SyncBadge result={wafSyncResult} />}
        prerequisite={setupStep < 2 && editStep !== 2}
      >
        <TipBox color="red" title="Web Application Firewall">
          These rules block the most common WordPress attack vectors. {hasCf ? 'Rules will be synced to your Cloudflare zone.' : 'Connect Cloudflare in Step 2 to enforce these rules live.'}
        </TipBox>
        <div className="space-y-2">
          {wafRules.map(rule => (
            <div key={rule.id} className={`flex items-center justify-between p-3 rounded-lg border ${rule.enabled ? 'bg-zinc-100/70 border-zinc-300' : 'bg-white/60 border-zinc-200 opacity-60'}`} data-testid={`waf-rule-${rule.id}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-zinc-200">{rule.name}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded border ${severityColors[rule.severity]}`}>{rule.severity}</span>
                  <code className="text-[10px] bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded">{rule.target}</code>
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
          {hasCf ? 'Save & Sync to Cloudflare' : 'Save WAF Rules'}
        </Button>
      </WizardStep>

      {/* ─── Step 4: IP Blocklist ───────────────────────────────── */}
      <WizardStep
        stepNum={3} title="IP Blocklist" icon={<Ban className="w-4 h-4" />}
        completed={blocklist.length > 0} summary={blocklist.length > 0 ? `${blocklist.length} blocked` : null}
        active={setupStep === 3} editStep={editStep} setEditStep={setEditStep}
        prerequisite={setupStep < 2 && editStep !== 3} alwaysShowContent={setupStep >= 3}
      >
        <TipBox color="red" title="Manual IP blocking">
          Block specific IP addresses. {hasCf ? 'IPs will be blocked directly in Cloudflare.' : 'Connect Cloudflare in Step 2 to block IPs at the edge.'}
        </TipBox>
        <div className="flex gap-2">
          <Input value={newBlockIp} onChange={e => setNewBlockIp(e.target.value)} placeholder="IP address (e.g. 192.168.1.1)" className="bg-zinc-50 border-zinc-200 text-zinc-900 font-mono text-sm flex-1" data-testid="block-ip-input" />
          <Input value={newBlockNote} onChange={e => setNewBlockNote(e.target.value)} placeholder="Note (optional)" className="bg-zinc-50 border-zinc-200 text-zinc-900 text-sm w-48" data-testid="block-note-input" />
          <Button onClick={addToBlocklist} disabled={!newBlockIp.trim() || blockSaving} variant="destructive" size="sm" data-testid="add-block-btn">
            {blockSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
          </Button>
        </div>
        {blocklist.length > 0 && (
          <div className="rounded-md border border-zinc-300/50 overflow-hidden">
            <table className="w-full text-xs">
              <thead><tr className="bg-zinc-100"><th className="text-left px-3 py-1.5 text-zinc-500">IP</th><th className="text-left px-3 py-1.5 text-zinc-500">Note</th><th className="text-left px-3 py-1.5 text-zinc-500">Added</th><th className="w-8"></th></tr></thead>
              <tbody>
                {blocklist.map(entry => (
                  <tr key={entry.ip} className="border-t border-zinc-200" data-testid={`blocked-ip-${entry.ip}`}>
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
      </WizardStep>

      {/* ─── Step 5: Login Protection ───────────────────────────── */}
      <WizardStep
        stepNum={4} title="Login Protection" icon={<Lock className="w-4 h-4" />}
        completed={loginProtection.enabled} summary={loginProtection.enabled ? 'Active' : null}
        active={setupStep === 4} editStep={editStep} setEditStep={setEditStep}
        prerequisite={setupStep < 3 && editStep !== 4}
      >
        <TipBox color="red" title="Brute force protection">
          Automatically blocks IPs that attempt too many failed logins. {hasCf ? 'Rules are enforced via Cloudflare WAF.' : 'Connect Cloudflare to enforce at the edge.'} Works alongside Wordfence.
        </TipBox>
        <div className="space-y-3">
          <label className="flex items-center gap-3 p-3 rounded-lg border border-zinc-300 bg-zinc-100/70 cursor-pointer">
            <input type="checkbox" checked={loginProtection.enabled} onChange={e => setLoginProtection({...loginProtection, enabled: e.target.checked})} className="rounded bg-zinc-200 border-zinc-600 text-red-500" />
            <div><p className="text-sm text-zinc-200">Enable Login Protection</p><p className="text-xs text-zinc-500">Master switch for all login protection features</p></div>
          </label>
          <label className="flex items-center gap-3 p-3 rounded-lg border border-zinc-300 bg-zinc-100/70 cursor-pointer">
            <input type="checkbox" checked={loginProtection.block_xmlrpc} onChange={e => setLoginProtection({...loginProtection, block_xmlrpc: e.target.checked})} className="rounded bg-zinc-200 border-zinc-600 text-red-500" />
            <div><p className="text-sm text-zinc-200">Block XML-RPC Authentication</p><p className="text-xs text-zinc-500">Blocks authentication via xmlrpc.php — the #1 brute force vector</p></div>
          </label>
          <label className="flex items-center gap-3 p-3 rounded-lg border border-zinc-300 bg-zinc-100/70 cursor-pointer">
            <input type="checkbox" checked={loginProtection.limit_login_attempts} onChange={e => setLoginProtection({...loginProtection, limit_login_attempts: e.target.checked})} className="rounded bg-zinc-200 border-zinc-600 text-red-500" />
            <div><p className="text-sm text-zinc-200">Limit Login Attempts</p><p className="text-xs text-zinc-500">Auto-block after too many failed attempts</p></div>
          </label>
          {loginProtection.limit_login_attempts && (
            <div className="ml-8 space-y-1">
              <Label className="text-xs text-zinc-400">Max attempts before block</Label>
              <Input type="number" value={loginProtection.max_attempts} onChange={e => setLoginProtection({...loginProtection, max_attempts: parseInt(e.target.value) || 5})} className="bg-zinc-50 border-zinc-200 text-zinc-900 w-24 text-sm" min={1} max={50} />
            </div>
          )}
        </div>
        <Button onClick={saveLoginProtection} disabled={loginSaving} className="bg-red-600 hover:bg-red-700" data-testid="save-login-protection-btn">
          {loginSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Lock className="w-4 h-4 mr-2" />}
          {hasCf ? 'Save & Sync to Cloudflare' : 'Save Login Protection'}
        </Button>
      </WizardStep>

      {/* ─── Step 6: Wordfence Monitor ──────────────────────────── */}
      <WizardStep
        stepNum={5} title="Wordfence Monitor" icon={<Bug className="w-4 h-4" />}
        completed={wfStatus?.wordfence?.installed}
        summary={wfStatus?.wordfence?.installed ? 'Installed' : null}
        active={setupStep === 5} editStep={editStep} setEditStep={setEditStep}
        prerequisite={setupStep < 3 && editStep !== 5} alwaysShowContent={setupStep >= 5}
      >
        <TipBox color="orange" title="Wordfence Security Plugin">
          Clara checks if Wordfence is installed on your WordPress site and scans for known vulnerabilities in your plugins and themes using the Wordfence Intelligence database.
        </TipBox>

        <Button onClick={loadWordfenceStatus} disabled={wfLoading} variant="outline" className="border-zinc-300 text-zinc-600" data-testid="scan-wordfence-btn">
          {wfLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />}
          {wfStatus ? 'Re-scan' : 'Scan Now'}
        </Button>

        {wfStatus && (
          <div className="space-y-3">
            {/* Wordfence install status */}
            <div className={`rounded-md border p-3 ${wfStatus.wordfence.installed ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-amber-500/5 border-amber-500/20'}`}>
              <div className="flex items-center gap-2 mb-1">
                {wfStatus.wordfence.installed ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 text-amber-400" />}
                <span className={`text-sm font-medium ${wfStatus.wordfence.installed ? 'text-emerald-400' : 'text-amber-400'}`}>{wfStatus.wordfence.message}</span>
              </div>
              {wfStatus.wordfence.indicators?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {wfStatus.wordfence.indicators.map((ind, i) => (
                    <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">{ind}</span>
                  ))}
                </div>
              )}
              {wfStatus.wordfence.install_steps && (
                <ol className="mt-2 space-y-1 list-decimal list-inside text-xs text-zinc-400">
                  {wfStatus.wordfence.install_steps.map((s, i) => <li key={i}>{s}</li>)}
                </ol>
              )}
            </div>

            {/* Vulnerability scan */}
            {wfStatus.vulnerability_scan && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-medium text-zinc-600">Vulnerability Scan</h4>
                  <span className="text-[10px] text-zinc-500">
                    {wfStatus.vulnerability_scan.scanned_count} software detected
                    {wfStatus.vulnerability_scan.wordpress_version && ` | WP ${wfStatus.vulnerability_scan.wordpress_version}`}
                  </span>
                </div>
                {wfStatus.vulnerability_scan.vulnerability_count === 0 && (
                  <div className="rounded-md bg-emerald-500/5 border border-emerald-500/20 p-2.5 text-xs text-emerald-400 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" /> No known vulnerabilities found
                  </div>
                )}
                {wfStatus.vulnerability_scan.vulnerabilities?.map((vuln, i) => (
                  <div key={i} className="rounded-md bg-red-500/5 border border-red-500/20 p-2.5 text-xs">
                    <div className="flex items-center gap-2">
                      <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                      <span className="text-zinc-200 font-medium">{vuln.title}</span>
                      {vuln.cvss_score && <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">{vuln.severity} ({vuln.cvss_score})</span>}
                    </div>
                    <p className="text-zinc-500 mt-1 ml-5">Software: {vuln.software} v{vuln.version} {vuln.patched_in && `→ Update to ${vuln.patched_in}`}</p>
                  </div>
                ))}
                {wfStatus.vulnerability_scan.detected_software?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {wfStatus.vulnerability_scan.detected_software.map((sw, i) => (
                      <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500 border border-zinc-200">{sw.type}/{sw.slug} v{sw.version}</span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </WizardStep>
    </div>
  );
}

// ─── Reusable sub-components ─────────────────────────────────────

function WizardStep({ stepNum, title, icon, completed, summary, active, editStep, setEditStep, badge, prerequisite, alwaysShowContent, children }) {
  const isOpen = active || editStep === stepNum || alwaysShowContent;
  return (
    <Card className={`border-zinc-200 ${active ? 'bg-gradient-to-r from-red-100 to-white ring-1 ring-red-500/30' : 'bg-white'}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3 cursor-pointer" onClick={() => setEditStep(editStep === stepNum ? null : stepNum)}>
          <div className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${completed ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-100 text-zinc-500'}`}>
              {completed ? <Check className="w-3 h-3" /> : stepNum + 1}
            </div>
            <span className="text-sm font-medium text-zinc-700">{title}</span>
            {summary && <code className="text-[10px] bg-zinc-100 text-zinc-500 px-2 py-0.5 rounded">{summary}</code>}
            {badge}
          </div>
          <span className="text-zinc-600">{icon}</span>
        </div>
        {isOpen && <div className="space-y-3">{children}</div>}
        {prerequisite && <p className="text-xs text-zinc-500">Complete the previous steps first.</p>}
      </CardContent>
    </Card>
  );
}

function TipBox({ color = 'red', title, children }) {
  const colors = { red: 'text-red-400', orange: 'text-orange-400', emerald: 'text-emerald-400' };
  return (
    <div className="rounded-md bg-zinc-100/60 border border-zinc-200 p-3">
      <p className={`text-[10px] uppercase tracking-wider ${colors[color]} font-semibold mb-1`}>{title}</p>
      <p className="text-xs text-zinc-400">{children}</p>
    </div>
  );
}
