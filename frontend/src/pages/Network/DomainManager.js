import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../../components/ui/alert-dialog';
import { toast } from 'sonner';
import { ConnectionStatus } from '../../components/ConnectionStatus';
import {
  Globe, Plus, Edit, Trash2, Check, Loader2, Shield,
  ExternalLink, AlertTriangle, CheckCircle, Clock, XCircle, Copy,
  Link2, RefreshCw, Settings, ArrowRight, Lock, Eye, EyeOff, Layers,
  ChevronRight, Code, Zap, Terminal
} from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

// Cloudflare Worker script — embedded for copy-paste
const WORKER_SCRIPT = `/**
 * Clara Subdomain Router — Cloudflare Worker
 */
const CONFIG = {
  BASE_DOMAIN: 'koodh.com',
  APP_SUBDOMAIN: 'clara',
  ORIGIN: 'https://clara.koodh.com',
  ROUTES_API: 'https://clara.koodh.com/api/domains/routes/public',
  CACHE_TTL: 300,
};

let routeCache = null;
let routeCacheTime = 0;

async function getRoutes() {
  const now = Date.now();
  if (routeCache && (now - routeCacheTime) < CONFIG.CACHE_TTL * 1000) return routeCache;
  try {
    const res = await fetch(CONFIG.ROUTES_API, { headers: { 'User-Agent': 'Clara-Worker/1.0' } });
    if (res.ok) { routeCache = await res.json(); routeCacheTime = now; return routeCache; }
  } catch (e) { console.error('[Clara Worker] Route fetch failed:', e); }
  return routeCache || { routes: [], base_domain: CONFIG.BASE_DOMAIN };
}

async function handleRequest(request) {
  const url = new URL(request.url);
  const hostname = url.hostname;
  if (!hostname.endsWith('.' + CONFIG.BASE_DOMAIN)) return fetch(request);
  const subdomain = hostname.replace('.' + CONFIG.BASE_DOMAIN, '');
  if (subdomain === CONFIG.APP_SUBDOMAIN) return fetch(request);

  const data = await getRoutes();
  const route = data.routes?.find(r => r.subdomain === subdomain);

  if (!route) {
    return new Response('<html><body style="font-family:system-ui;background:#09090b;color:#a1a1aa;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0"><div style="text-align:center"><h1 style="color:#f4f4f5">Subdomain niet geconfigureerd</h1><p>' + hostname + ' is niet ingesteld.</p><a href="https://' + CONFIG.APP_SUBDOMAIN + '.' + CONFIG.BASE_DOMAIN + '" style="color:#f97316">Naar Clara</a></div></body></html>',
      { status: 404, headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
  }

  const originHostname = new URL(CONFIG.ORIGIN).hostname;
  const originUrl = new URL(request.url);
  originUrl.hostname = originHostname;
  originUrl.protocol = 'https:';
  const headers = new Headers(request.headers);
  headers.set('Host', originHostname);
  headers.set('X-Forwarded-Host', hostname);
  headers.set('X-Original-Subdomain', subdomain);

  const response = await fetch(originUrl.toString(), {
    method: request.method, headers,
    body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
    redirect: 'manual',
  });

  const respHeaders = new Headers(response.headers);
  const location = respHeaders.get('Location');
  if (location) {
    try { const l = new URL(location, originUrl); if (l.hostname === originHostname) { l.hostname = hostname; respHeaders.set('Location', l.toString()); } } catch {}
  }
  respHeaders.delete('X-Frame-Options');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: respHeaders });
}

addEventListener('fetch', event => { event.respondWith(handleRequest(event.request)); });`;

const ROUTE_TYPE_LABELS = { auth: 'Authentication', network: 'Management', firewall: 'Firewall', app: 'Application' };
const ROUTE_TYPE_COLORS = {
  auth: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  network: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  firewall: 'bg-red-500/20 text-red-400 border-red-500/30',
  app: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
};
const SITE_TYPE_COLORS = { radio: 'bg-orange-500/20 text-orange-400', technical: 'bg-emerald-500/20 text-emerald-400', server: 'bg-blue-500/20 text-blue-400', task_scheduler: 'bg-violet-500/20 text-violet-400', external_host: 'bg-cyan-500/20 text-cyan-400' };
const SITE_TYPE_LABELS = { radio: 'Radio', technical: 'Data Connection', server: 'Virtual Datacenter', task_scheduler: 'Tasks', external_host: 'External Host' };
const STATUS_CONFIGS = {
  verified: { icon: CheckCircle, color: 'text-emerald-400', label: 'Verified' },
  pending: { icon: Clock, color: 'text-amber-400', label: 'Pending' },
  failed: { icon: XCircle, color: 'text-red-400', label: 'Failed' },
  active: { icon: CheckCircle, color: 'text-emerald-400', label: 'Active' },
  cname_missing: { icon: AlertTriangle, color: 'text-amber-400', label: 'CNAME missing' },
  pending_issuance: { icon: Clock, color: 'text-blue-400', label: 'SSL pending' },
};

// ─── Step Indicator ───
function StepIndicator({ steps, current }) {
  return (
    <div className="flex items-center gap-1 mb-6">
      {steps.map((s, i) => (
        <div key={i} className="flex items-center gap-1">
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
            i < current ? 'bg-emerald-500/20 text-emerald-400' :
            i === current ? 'bg-orange-500/20 text-orange-400 ring-1 ring-orange-500/40' :
            'bg-zinc-800 text-zinc-500'
          }`}>
            {i < current ? <Check className="w-3 h-3" /> : <span className="w-3 text-center">{i + 1}</span>}
            <span className="hidden sm:inline">{s}</span>
          </div>
          {i < steps.length - 1 && <ChevronRight className="w-3 h-3 text-zinc-700" />}
        </div>
      ))}
    </div>
  );
}

export default function DomainManager() {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);

  // Data
  const [overview, setOverview] = useState(null);
  const [configs, setConfigs] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [cfConfig, setCfConfig] = useState(null);
  const [mainSites, setMainSites] = useState([]);

  // Cloudflare
  const [cfDnsRecords, setCfDnsRecords] = useState([]);
  const [cfSyncing, setCfSyncing] = useState(false);
  const [cfSyncResult, setCfSyncResult] = useState(null);
  const [cfVerifying, setCfVerifying] = useState(false);
  const [cfVerifyResult, setCfVerifyResult] = useState(null);
  const [cfLoadingRecords, setCfLoadingRecords] = useState(false);
  const [cfSyncDialog, setCfSyncDialog] = useState(false);

  // Worker test
  const [workerTesting, setWorkerTesting] = useState(false);
  const [workerResult, setWorkerResult] = useState(null);
  const [workerScriptCopied, setWorkerScriptCopied] = useState(false);

  // Setup wizard
  const [setupStep, setSetupStep] = useState(0);
  const [editStep, setEditStep] = useState(null);
  const [cfForm, setCfForm] = useState({ api_token: '', zone_id: '', base_domain: 'koodh.com' });
  const [showToken, setShowToken] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);

  // Domain dialog (step-based)
  const [domainDialog, setDomainDialog] = useState(false);
  const [domainStep, setDomainStep] = useState(0);
  const [editingSite, setEditingSite] = useState(null);
  const [domainForm, setDomainForm] = useState({ domain_type: 'koodh', subdomain: '', custom_domain: '' });
  const [domainSaving, setDomainSaving] = useState(false);

  // Routes
  const [routeDialog, setRouteDialog] = useState(false);
  const [editingRoute, setEditingRoute] = useState(null);
  const [routeForm, setRouteForm] = useState({ subdomain: '', label: '', description: '', route_type: 'app', target_path: '/', is_active: true });

  // Delete
  const [deleteDialog, setDeleteDialog] = useState({ open: false, type: '', id: '', name: '' });
  const [verifying, setVerifying] = useState(null);

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try { const r = await fetch(`${API}/api/domains/overview`, { headers }); if (r.ok) setOverview(await r.json()); } catch {}
    try { const r = await fetch(`${API}/api/domains/configs`, { headers }); if (r.ok) setConfigs(await r.json()); } catch {}
    try { const r = await fetch(`${API}/api/domains/routes`, { headers }); if (r.ok) setRoutes(await r.json()); } catch {}
    try { const r = await fetch(`${API}/api/domains/cloudflare/config`, { headers }); if (r.ok) setCfConfig(await r.json()); } catch {}
    try { const r = await fetch(`${API}/api/main-sites`, { headers }); if (r.ok) { const d = await r.json(); setMainSites(Array.isArray(d) ? d : []); } } catch {}
    setLoading(false);
  }, [token]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-load Cloudflare DNS records when config is available
  useEffect(() => {
    if (cfConfig?.configured && cfConfig?.zone_id) {
      fetchCfDnsRecords(true);
    }
  }, [cfConfig?.configured, cfConfig?.zone_id]);

  // Determine setup step based on config state
  useEffect(() => {
    if (!cfConfig) return;
    if (!cfConfig.api_token_set) setSetupStep(0);
    else if (!cfConfig.zone_id) setSetupStep(1);
    else if (cfVerifyResult?.valid) setSetupStep(3);
    else setSetupStep(2);
  }, [cfConfig, cfVerifyResult]);

  // ─── Domain Config ───
  const openDomainConfig = (site) => {
    const existing = configs.find(c => c.main_site_id === site.id);
    setEditingSite(site);
    setDomainForm({ domain_type: existing?.domain_type || 'koodh', subdomain: existing?.subdomain || site.slug || '', custom_domain: existing?.custom_domain || '' });
    setDomainStep(0);
    setDomainDialog(true);
  };

  const saveDomainConfig = async () => {
    setDomainSaving(true);
    try {
      const res = await fetch(`${API}/api/domains/configs`, {
        method: 'POST', headers, body: JSON.stringify({ main_site_id: editingSite.id, ...domainForm }),
      });
      if (!res.ok) { const e = await res.json(); toast.error(e.detail || 'Save failed'); setDomainSaving(false); return; }
      toast.success('Domain configuration saved');
      setDomainStep(domainForm.domain_type === 'custom' ? 2 : 3);
      fetchData();
    } catch { toast.error('Save failed'); }
    setDomainSaving(false);
  };

  const removeDomainConfig = async () => {
    try {
      const res = await fetch(`${API}/api/domains/configs/${deleteDialog.id}`, { method: 'DELETE', headers });
      if (res.ok) { toast.success('Domain configuration removed'); fetchData(); }
      else toast.error('Delete failed');
    } catch { toast.error('Delete failed'); }
    setDeleteDialog({ open: false, type: '', id: '', name: '' });
  };

  const verifyDomain = async (mainSiteId) => {
    setVerifying(mainSiteId);
    try {
      const res = await fetch(`${API}/api/domains/configs/${mainSiteId}/verify`, { method: 'POST', headers });
      const data = await res.json();
      if (data.verified) toast.success('Domain verified successfully!');
      else toast.error(data.error || 'Verification failed');
      fetchData();
    } catch { toast.error('Verification failed'); }
    setVerifying(null);
  };

  // ─── Routes ───
  const openCreateRoute = () => {
    setEditingRoute(null);
    setRouteForm({ subdomain: '', label: '', description: '', route_type: 'app', target_path: '/', is_active: true });
    setRouteDialog(true);
  };
  const openEditRoute = (route) => {
    setEditingRoute(route);
    setRouteForm({ subdomain: route.subdomain, label: route.label, description: route.description || '', route_type: route.route_type, target_path: route.target_path, is_active: route.is_active });
    setRouteDialog(true);
  };
  const saveRoute = async () => {
    try {
      const url = editingRoute ? `${API}/api/domains/routes/${editingRoute.id}` : `${API}/api/domains/routes`;
      const method = editingRoute ? 'PUT' : 'POST';
      const body = editingRoute ? { label: routeForm.label, description: routeForm.description, route_type: routeForm.route_type, target_path: routeForm.target_path, is_active: routeForm.is_active } : routeForm;
      const res = await fetch(url, { method, headers, body: JSON.stringify(body) });
      if (!res.ok) { const e = await res.json(); toast.error(e.detail || 'Save failed'); return; }
      toast.success(editingRoute ? 'Route updated' : 'Route created');
      setRouteDialog(false); fetchData();
    } catch { toast.error('Save failed'); }
  };
  const toggleRouteActive = async (route) => {
    try { await fetch(`${API}/api/domains/routes/${route.id}`, { method: 'PUT', headers, body: JSON.stringify({ is_active: !route.is_active }) }); fetchData(); } catch { toast.error('Update failed'); }
  };
  const deleteRoute = async () => {
    try {
      const res = await fetch(`${API}/api/domains/routes/${deleteDialog.id}`, { method: 'DELETE', headers });
      if (res.ok) { toast.success('Route deleted'); fetchData(); }
      else { const e = await res.json(); toast.error(e.detail || 'Delete failed'); }
    } catch { toast.error('Delete failed'); }
    setDeleteDialog({ open: false, type: '', id: '', name: '' });
  };

  // ─── Cloudflare ───
  const saveCfConfig = async () => {
    setSavingConfig(true);
    try {
      const body = {};
      if (cfForm.api_token) body.api_token = cfForm.api_token;
      if (cfForm.zone_id) body.zone_id = cfForm.zone_id;
      if (cfForm.base_domain) body.base_domain = cfForm.base_domain;
      const res = await fetch(`${API}/api/domains/cloudflare/config`, { method: 'PUT', headers, body: JSON.stringify(body) });
      if (res.ok) { toast.success('Configuration saved'); setCfVerifyResult(null); fetchData(); }
      else toast.error('Save failed');
    } catch { toast.error('Save failed'); }
    setSavingConfig(false);
  };

  const verifyCfToken = async () => {
    setCfVerifying(true); setCfVerifyResult(null);
    try {
      // Use test-connection endpoint which returns detailed steps on error
      const testRes = await fetch(`${API}/api/domains/cloudflare/test-connection`, { headers });
      const testData = await testRes.json();
      
      if (testRes.ok && testData.status === 'ok') {
        // Also get zone details via verify-token
        const res = await fetch(`${API}/api/domains/cloudflare/verify-token`, { method: 'POST', headers });
        const data = await res.json();
        if (res.ok) { 
          setCfVerifyResult({ ...data, valid: true }); 
          toast.success(`Connected to zone: ${data.zone_name}`); 
        } else {
          setCfVerifyResult({ valid: false, token_status: 'error', steps: testData.steps || [], message: data.detail || 'Verification failed' });
          toast.error(data.detail || 'Verification failed');
        }
      } else {
        // Show the structured error with steps
        setCfVerifyResult({ valid: false, token_status: 'error', steps: testData.steps || [], message: testData.message || 'Connection test failed', link: testData.link, link_label: testData.link_label });
        toast.error(testData.message || 'Connection test failed');
      }
    } catch { 
      setCfVerifyResult({ valid: false, token_status: 'error', steps: ['An unexpected error occurred', 'Check your network connection and try again'], message: 'Connection error' });
      toast.error('Connection error'); 
    }
    setCfVerifying(false);
  };

  const fetchCfDnsRecords = async (silent = false) => {
    setCfLoadingRecords(true);
    try {
      const res = await fetch(`${API}/api/domains/cloudflare/dns-records`, { headers });
      const data = await res.json();
      if (res.ok) { setCfDnsRecords(data.records || []); if (!silent) toast.success(`${data.total || 0} DNS records loaded`); }
      else if (!silent) toast.error(data.detail || 'Failed to load DNS records');
    } catch { if (!silent) toast.error('Connection error'); }
    setCfLoadingRecords(false);
  };

  const syncWithCloudflare = async () => {
    setCfSyncing(true); setCfSyncResult(null);
    try {
      const res = await fetch(`${API}/api/domains/cloudflare/sync`, { method: 'POST', headers });
      const data = await res.json();
      if (res.ok) {
        setCfSyncResult(data);
        const total = (data.created?.length || 0) + (data.updated?.length || 0);
        if (total > 0) toast.success(`${total} DNS record(s) synced`);
        else if (data.errors?.length > 0) toast.error(`${data.errors.length} error(s) during sync`);
        else toast.success('All records are up to date');
        fetchCfDnsRecords(); fetchData();
      } else toast.error(data.detail || 'Sync failed');
    } catch { toast.error('Sync failed'); }
    setCfSyncing(false);
  };

  const deleteCfRecord = async (recordId, name) => {
    try {
      const res = await fetch(`${API}/api/domains/cloudflare/dns-records/${recordId}`, { method: 'DELETE', headers });
      if (res.ok) { toast.success(`DNS record ${name} deleted`); fetchCfDnsRecords(); }
      else { const e = await res.json(); toast.error(e.detail || 'Delete failed'); }
    } catch { toast.error('Delete failed'); }
  };

  const testWorker = async () => {
    setWorkerTesting(true); setWorkerResult(null);
    try {
      const res = await fetch(`${API}/api/domains/cloudflare/test-worker`, { method: 'POST', headers });
      const data = await res.json();
      setWorkerResult(data);
      if (data.status === 'ok') toast.success(data.message);
      else if (data.status === 'warning') toast.info(data.message);
      else toast.error(data.message || 'Worker test failed');
    } catch { 
      setWorkerResult({ status: 'error', message: 'Connection error', steps: ['Could not reach the test endpoint', 'Check your connection and try again'], domains: [] });
      toast.error('Worker test failed'); 
    }
    setWorkerTesting(false);
  };

  const copyWorkerScript = () => {
    navigator.clipboard.writeText(WORKER_SCRIPT);
    setWorkerScriptCopied(true);
    toast.success('Worker script copied to clipboard!');
    setTimeout(() => setWorkerScriptCopied(false), 3000);
  };

  const copyToClipboard = (text) => { navigator.clipboard.writeText(text); toast.success('Copied to clipboard'); };
  const baseDomain = overview?.base_domain || 'koodh.com';
  const unconfiguredSites = mainSites.filter(s => !configs.find(c => c.main_site_id === s.id));
  const cfZoneUrl = cfConfig?.zone_id ? `https://dash.cloudflare.com/${cfConfig.zone_id}` : 'https://dash.cloudflare.com';
  const cfDnsUrl = cfConfig?.zone_id ? `https://dash.cloudflare.com/${cfConfig.zone_id}/dns/records` : 'https://dash.cloudflare.com';

  // Build DNS lookup map: "subdomain.basedomain" → record
  const dnsLookup = {};
  cfDnsRecords.forEach(r => { dnsLookup[r.name] = r; });

  // Check DNS status for a route
  const getRouteDnsStatus = (route) => {
    const fqdn = `${route.subdomain}.${baseDomain}`;
    const record = dnsLookup[fqdn];
    if (record) return { exists: true, record, type: record.type, proxied: record.proxied };
    return { exists: false };
  };

  // Count routes missing DNS
  const activeRoutes = routes.filter(r => r.is_active);
  const routesMissingDns = activeRoutes.filter(r => !getRouteDnsStatus(r).exists);

  if (loading) return <div className="flex items-center justify-center py-12" data-testid="domain-manager-loading"><Loader2 className="w-6 h-6 animate-spin text-zinc-400" /></div>;

  return (
    <div className="space-y-6" data-testid="domain-manager">
      {/* Tabs */}
      <div className="flex gap-2 border-b border-zinc-200 pb-2">
        {[
          { id: 'overview', label: 'Overview', icon: Globe },
          { id: 'sites', label: 'Site Domains', icon: Link2 },
          { id: 'routing', label: 'Subdomain Routing', icon: ArrowRight },
          { id: 'cloudflare', label: 'Cloudflare', icon: Shield },
        ].map(tab => (
          <button key={tab.id} data-testid={`domain-tab-${tab.id}`} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === tab.id ? 'bg-zinc-800 text-white border-b-2 border-orange-500' : 'text-zinc-400 hover:text-zinc-200'}`}>
            <tab.icon className="w-4 h-4" />{tab.label}
          </button>
        ))}
      </div>

      {/* ═══════ OVERVIEW ═══════ */}
      {activeTab === 'overview' && overview && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Configured" value={overview.configured_domains} total={overview.total_sites} icon={Link2} color="text-emerald-400" />
            <StatCard label="Koodh.com" value={overview.koodh_domains} icon={Globe} color="text-blue-400" />
            <StatCard label="Custom Domains" value={overview.custom_domains} icon={ExternalLink} color="text-purple-400" />
            <StatCard label="Verified" value={overview.verified} icon={CheckCircle} color="text-green-400" />
          </div>

          {overview.unconfigured > 0 && (
            <Card className="bg-amber-950/20 border-amber-900/40">
              <CardContent className="p-4 flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
                <div>
                  <p className="text-sm text-amber-300 font-medium">{overview.unconfigured} site{overview.unconfigured !== 1 ? 's' : ''} without domain configuration</p>
                  <p className="text-xs text-amber-400/70">Go to "Site Domains" to assign domains</p>
                </div>
                <Button size="sm" variant="outline" className="ml-auto border-amber-700 text-amber-400 hover:bg-amber-950" onClick={() => setActiveTab('sites')}>Configure</Button>
              </CardContent>
            </Card>
          )}

          {!overview.cloudflare_configured && (
            <Card className="bg-white/50 backdrop-blur-lg border-white/60">
              <CardContent className="p-4 flex items-center gap-3">
                <Shield className="w-5 h-5 text-zinc-500 flex-shrink-0" />
                <div>
                  <p className="text-sm text-zinc-600 font-medium">Cloudflare API not configured</p>
                  <p className="text-xs text-zinc-500">Set up your Cloudflare API Token to manage DNS records automatically</p>
                </div>
                <Button size="sm" variant="outline" className="ml-auto" onClick={() => setActiveTab('cloudflare')}>Set up</Button>
              </CardContent>
            </Card>
          )}

          <Card className="bg-white/50 backdrop-blur-lg border-white/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-zinc-400 flex items-center gap-2"><ArrowRight className="w-4 h-4" />Active Subdomain Routes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {routes.filter(r => r.is_active).map(route => (
                  <div key={route.id} className="flex items-center justify-between bg-zinc-100/70 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-0.5 rounded text-xs border ${ROUTE_TYPE_COLORS[route.route_type] || 'bg-zinc-200 text-zinc-600 border-zinc-600'}`}>
                        {ROUTE_TYPE_LABELS[route.route_type] || route.route_type}
                      </span>
                      <span className="text-sm font-mono text-zinc-200">{route.subdomain}.{baseDomain}</span>
                      <ArrowRight className="w-3 h-3 text-zinc-600" />
                      <span className="text-xs text-zinc-400">{route.target_path}</span>
                    </div>
                    <span className="text-xs text-zinc-500">{route.label}</span>
                  </div>
                ))}
                {routes.filter(r => r.is_active).length === 0 && <p className="text-sm text-zinc-500 text-center py-4">No active routes</p>}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ═══════ SITE DOMAINS ═══════ */}
      {activeTab === 'sites' && (
        <div className="space-y-4">
          {configs.length > 0 && (
            <Card className="bg-white/50 backdrop-blur-lg border-white/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-emerald-400 flex items-center gap-2"><CheckCircle className="w-4 h-4" />Configured Domains ({configs.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {configs.map(config => {
                  const verStatus = STATUS_CONFIGS[config.verification_status] || STATUS_CONFIGS.pending;
                  const VerIcon = verStatus.icon;
                  return (
                    <div key={config.id} className="bg-zinc-100/70 rounded-lg px-4 py-3" data-testid={`domain-config-${config.main_site_id}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className={`px-2 py-0.5 rounded text-xs ${SITE_TYPE_COLORS[config.site_type] || 'bg-zinc-200 text-zinc-600'}`}>{SITE_TYPE_LABELS[config.site_type] || config.site_type}</span>
                          <span className="text-sm text-zinc-200 font-medium">{config.site_name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="ghost" onClick={() => openDomainConfig({ id: config.main_site_id, slug: config.site_slug, name: config.site_name })} className="h-7 w-7 p-0"><Edit className="w-3.5 h-3.5" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => setDeleteDialog({ open: true, type: 'domain', id: config.main_site_id, name: config.site_name })} className="h-7 w-7 p-0 text-red-400 hover:text-red-300"><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center gap-4 text-xs">
                        <div className="flex items-center gap-1.5">
                          {config.domain_type === 'koodh' ? <Globe className="w-3 h-3 text-blue-400" /> : <ExternalLink className="w-3 h-3 text-purple-400" />}
                          <span className="font-mono text-zinc-600">{config.full_domain || `${config.subdomain}.${baseDomain}`}</span>
                        </div>
                        <div className={`flex items-center gap-1 ${verStatus.color}`}><VerIcon className="w-3 h-3" /><span>{verStatus.label}</span></div>
                        {config.ssl_enabled && <div className="flex items-center gap-1 text-emerald-400"><Lock className="w-3 h-3" /><span>SSL</span></div>}
                        {config.domain_type === 'custom' && config.verification_status !== 'verified' && (
                          <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => verifyDomain(config.main_site_id)} disabled={verifying === config.main_site_id} data-testid={`verify-domain-${config.main_site_id}`}>
                            {verifying === config.main_site_id ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RefreshCw className="w-3 h-3 mr-1" />}Verify
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {unconfiguredSites.length > 0 && (
            <Card className="bg-white/50 backdrop-blur-lg border-white/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-amber-400 flex items-center gap-2"><AlertTriangle className="w-4 h-4" />Not Configured ({unconfiguredSites.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {unconfiguredSites.map(site => (
                  <div key={site.id} className="flex items-center justify-between bg-zinc-100/70 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-xs ${SITE_TYPE_COLORS[site.site_type] || 'bg-zinc-200 text-zinc-600'}`}>{SITE_TYPE_LABELS[site.site_type] || site.site_type}</span>
                      <span className="text-sm text-zinc-200">{site.name}</span>
                      <span className="text-xs text-zinc-600 font-mono">/{site.slug}</span>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => openDomainConfig(site)} className="h-7 text-xs" data-testid={`configure-domain-${site.slug}`}>
                      <Link2 className="w-3 h-3 mr-1" />Set up domain
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ═══════ ROUTING ═══════ */}
      {activeTab === 'routing' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-zinc-400">Configure which subdomains route to which part of the platform.</p>
            <div className="flex items-center gap-2">
              {cfConfig?.configured && (
                <Button variant="outline" size="sm" onClick={() => { setCfSyncDialog(true); syncWithCloudflare(); }} disabled={cfSyncing} data-testid="routing-sync-dns-btn">
                  {cfSyncing ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />}
                  Sync DNS
                </Button>
              )}
              <Button onClick={openCreateRoute} size="sm" data-testid="create-route-btn"><Plus className="w-4 h-4 mr-1" /> New Route</Button>
            </div>
          </div>

          {/* Warning: routes without DNS records */}
          {cfConfig?.configured && cfDnsRecords.length > 0 && routesMissingDns.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3" data-testid="dns-missing-warning">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-amber-300">{routesMissingDns.length} active route(s) without DNS record</p>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    These subdomains won't work until their DNS records are created in Cloudflare.
                    Click <strong className="text-zinc-600">"Sync DNS"</strong> to automatically create the missing records.
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {routesMissingDns.map(r => (
                      <span key={r.id} className="px-2 py-0.5 rounded text-[10px] bg-amber-500/10 border border-amber-500/20 text-amber-300 font-mono">
                        {r.subdomain}.{baseDomain}
                      </span>
                    ))}
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => { setCfSyncDialog(true); syncWithCloudflare(); }} disabled={cfSyncing} className="flex-shrink-0 border-amber-500/30 text-amber-400 hover:bg-amber-500/10">
                  {cfSyncing ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />}
                  Fix now
                </Button>
              </div>
            </div>
          )}

          {/* Warning: Cloudflare not configured */}
          {!cfConfig?.configured && routes.length > 0 && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3" data-testid="cf-not-configured-warning">
              <div className="flex items-start gap-2">
                <XCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-red-300">Cloudflare not configured</p>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Subdomain routes require DNS records in Cloudflare to work.
                    Go to the <button onClick={() => setActiveTab('cloudflare')} className="text-orange-400 hover:underline font-medium">Cloudflare tab</button> to set up your API credentials first.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {routes.map(route => {
              const dns = getRouteDnsStatus(route);
              return (
              <Card key={route.id} className={`border-zinc-200 ${route.is_active ? 'bg-zinc-900' : 'bg-zinc-950/50 opacity-60'}`} data-testid={`route-card-${route.subdomain}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${route.is_active ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-mono text-white font-medium">{route.subdomain}.{baseDomain}</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] border ${ROUTE_TYPE_COLORS[route.route_type] || 'bg-zinc-200 text-zinc-600 border-zinc-600'}`}>{ROUTE_TYPE_LABELS[route.route_type] || route.route_type}</span>
                          {route.is_system && <span className="px-1.5 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-500">System</span>}
                          {/* DNS status badge */}
                          {cfConfig?.configured && route.is_active && (
                            dns.exists ? (
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1" data-testid={`dns-ok-${route.subdomain}`}>
                                <CheckCircle className="w-2.5 h-2.5" /> DNS
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1" data-testid={`dns-missing-${route.subdomain}`}>
                                <AlertTriangle className="w-2.5 h-2.5" /> No DNS
                              </span>
                            )
                          )}
                        </div>
                        <p className="text-xs text-zinc-500 mt-0.5">{route.label}{route.description ? ` — ${route.description}` : ''}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right mr-2">
                        <div className="flex items-center gap-1 text-xs text-zinc-400"><ArrowRight className="w-3 h-3" /><span className="font-mono">{route.target_path}</span></div>
                      </div>
                      <button onClick={() => toggleRouteActive(route)} className={`relative w-10 h-5 rounded-full transition-colors ${route.is_active ? 'bg-emerald-600' : 'bg-zinc-700'}`} data-testid={`toggle-route-${route.subdomain}`}>
                        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${route.is_active ? 'translate-x-5' : 'translate-x-0.5'}`} />
                      </button>
                      <Button size="sm" variant="ghost" onClick={() => openEditRoute(route)} className="h-7 w-7 p-0" data-testid={`edit-route-${route.subdomain}`}><Edit className="w-3.5 h-3.5" /></Button>
                      {!route.is_system && (
                        <Button size="sm" variant="ghost" onClick={() => setDeleteDialog({ open: true, type: 'route', id: route.id, name: `${route.subdomain}.${baseDomain}` })} className="h-7 w-7 p-0 text-red-400 hover:text-red-300" data-testid={`delete-route-${route.subdomain}`}><Trash2 className="w-3.5 h-3.5" /></Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
              );
            })}
          </div>
          {routes.length === 0 && (
            <Card className="bg-white/50 backdrop-blur-lg border-white/60"><CardContent className="flex flex-col items-center justify-center py-12"><ArrowRight className="w-12 h-12 text-zinc-600 mb-3" /><p className="text-zinc-400 text-sm">No subdomain routes configured yet</p></CardContent></Card>
          )}
        </div>
      )}

      {/* ═══════ CLOUDFLARE (Step-based Setup) ═══════ */}
      {activeTab === 'cloudflare' && (
        <div className="space-y-4">
          <StepIndicator steps={['API Token', 'Zone ID', 'Verify', 'Sync DNS', 'Worker']} current={setupStep} />

          {/* Connection Status - Auto-check when configured */}
          {cfConfig?.api_token_set && cfConfig?.zone_id && (
            <ConnectionStatus
              testUrl={`${API}/api/domains/cloudflare/test-connection`}
              headers={{ Authorization: `Bearer ${token}` }}
              label="Cloudflare API"
              autoCheck={true}
            />
          )}

          {/* Step 1: API Token */}
          <Card className={`border-zinc-200 ${(setupStep === 0 || editStep === 0) ? 'bg-zinc-900 ring-1 ring-orange-500/30' : 'bg-zinc-900'}`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3 cursor-pointer" onClick={() => setEditStep(editStep === 0 ? null : 0)}>
                <div className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${cfConfig?.api_token_set ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-500'}`}>
                    {cfConfig?.api_token_set ? <Check className="w-3.5 h-3.5" /> : '1'}
                  </div>
                  <span className="text-sm font-medium text-zinc-200">API Token</span>
                  {cfConfig?.api_token_set && <span className="text-xs font-mono text-zinc-500">{cfConfig.api_token_preview}</span>}
                  {cfConfig?.api_token_set && setupStep !== 0 && <span className="text-[10px] text-zinc-600 ml-1">(click to edit)</span>}
                </div>
                <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noopener noreferrer"
                  className="text-xs text-orange-400 hover:text-orange-300 flex items-center gap-1" data-testid="cf-token-link"
                  onClick={e => e.stopPropagation()}>
                  Open Cloudflare <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              {(setupStep === 0 || editStep === 0) && (
                <div className="space-y-3">
                  <div className="rounded-md bg-zinc-800/60 border border-zinc-300/50 p-3 space-y-2">
                    <p className="text-[10px] uppercase tracking-wider text-orange-400 font-semibold">How to create your Cloudflare API Token:</p>
                    <ol className="space-y-1.5 list-none">
                      <li className="flex items-start gap-2 text-xs text-zinc-600">
                        <span className="flex-shrink-0 w-4 h-4 rounded-full bg-zinc-200 text-zinc-400 flex items-center justify-center text-[10px] font-bold mt-0.5">1</span>
                        <span>Go to <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noopener noreferrer" className="text-orange-400 hover:underline">dash.cloudflare.com/profile/api-tokens</a></span>
                      </li>
                      <li className="flex items-start gap-2 text-xs text-zinc-600">
                        <span className="flex-shrink-0 w-4 h-4 rounded-full bg-zinc-200 text-zinc-400 flex items-center justify-center text-[10px] font-bold mt-0.5">2</span>
                        <span>Click <strong className="text-zinc-100">"Create Token"</strong></span>
                      </li>
                      <li className="flex items-start gap-2 text-xs text-zinc-600">
                        <span className="flex-shrink-0 w-4 h-4 rounded-full bg-zinc-200 text-zinc-400 flex items-center justify-center text-[10px] font-bold mt-0.5">3</span>
                        <span>Find the template <strong className="text-zinc-100">"Edit zone DNS"</strong> and click <strong className="text-zinc-100">"Use template"</strong></span>
                      </li>
                      <li className="flex items-start gap-2 text-xs text-zinc-600">
                        <span className="flex-shrink-0 w-4 h-4 rounded-full bg-zinc-200 text-zinc-400 flex items-center justify-center text-[10px] font-bold mt-0.5">4</span>
                        <span>Under <strong className="text-zinc-100">"Zone Resources"</strong>, select your domain (e.g. koodh.com)</span>
                      </li>
                      <li className="flex items-start gap-2 text-xs text-zinc-600">
                        <span className="flex-shrink-0 w-4 h-4 rounded-full bg-zinc-200 text-zinc-400 flex items-center justify-center text-[10px] font-bold mt-0.5">5</span>
                        <span>Click <strong className="text-zinc-100">"Continue to summary"</strong> → <strong className="text-zinc-100">"Create Token"</strong></span>
                      </li>
                      <li className="flex items-start gap-2 text-xs text-zinc-600">
                        <span className="flex-shrink-0 w-4 h-4 rounded-full bg-zinc-200 text-zinc-400 flex items-center justify-center text-[10px] font-bold mt-0.5">6</span>
                        <span>Copy the token and paste it below</span>
                      </li>
                    </ol>
                    <p className="text-[10px] text-amber-500/80 mt-1">Important: This is an <strong>API Token</strong>, not your Cloudflare password or Global API Key.</p>
                  </div>
                  <div className="relative">
                    <Input type={showToken ? 'text' : 'password'} value={cfForm.api_token} onChange={e => setCfForm(p => ({ ...p, api_token: e.target.value }))}
                      placeholder="Paste your Cloudflare API Token here" className="pr-10 font-mono" data-testid="cf-api-token-input" />
                    <button type="button" onClick={() => setShowToken(!showToken)} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-600">
                      {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => { saveCfConfig(); }} disabled={!cfForm.api_token || savingConfig} className="flex-1" data-testid="save-cf-token-btn">
                      {savingConfig ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}Save & Continue
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Step 2: Zone ID */}
          <Card className={`border-zinc-200 ${(setupStep === 1 || editStep === 1) ? 'bg-zinc-900 ring-1 ring-orange-500/30' : 'bg-zinc-900'}`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3 cursor-pointer" onClick={() => setEditStep(editStep === 1 ? null : 1)}>
                <div className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${cfConfig?.zone_id ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-500'}`}>
                    {cfConfig?.zone_id ? <Check className="w-3.5 h-3.5" /> : '2'}
                  </div>
                  <span className="text-sm font-medium text-zinc-200">Zone ID & Base Domain</span>
                  {cfConfig?.zone_id && <span className="text-xs font-mono text-zinc-500 truncate max-w-[200px]">{cfConfig.zone_id}</span>}
                  {cfConfig?.zone_id && setupStep !== 1 && <span className="text-[10px] text-zinc-600 ml-1">(click to edit)</span>}
                </div>
                <a href={cfZoneUrl} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-orange-400 hover:text-orange-300 flex items-center gap-1" data-testid="cf-zone-link"
                  onClick={e => e.stopPropagation()}>
                  Open Zone <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              {(setupStep === 1 || editStep === 1) && (
                <div className="space-y-3">
                  <div className="rounded-md bg-zinc-800/60 border border-zinc-300/50 p-3 space-y-2">
                    <p className="text-[10px] uppercase tracking-wider text-orange-400 font-semibold">How to find your Zone ID:</p>
                    <ol className="space-y-1.5 list-none">
                      <li className="flex items-start gap-2 text-xs text-zinc-600">
                        <span className="flex-shrink-0 w-4 h-4 rounded-full bg-zinc-200 text-zinc-400 flex items-center justify-center text-[10px] font-bold mt-0.5">1</span>
                        <span>Go to <a href="https://dash.cloudflare.com" target="_blank" rel="noopener noreferrer" className="text-orange-400 hover:underline">dash.cloudflare.com</a></span>
                      </li>
                      <li className="flex items-start gap-2 text-xs text-zinc-600">
                        <span className="flex-shrink-0 w-4 h-4 rounded-full bg-zinc-200 text-zinc-400 flex items-center justify-center text-[10px] font-bold mt-0.5">2</span>
                        <span>Click on your <strong className="text-zinc-100">domain name</strong> (e.g. koodh.com)</span>
                      </li>
                      <li className="flex items-start gap-2 text-xs text-zinc-600">
                        <span className="flex-shrink-0 w-4 h-4 rounded-full bg-zinc-200 text-zinc-400 flex items-center justify-center text-[10px] font-bold mt-0.5">3</span>
                        <span>On the <strong className="text-zinc-100">Overview</strong> page, scroll down on the <strong className="text-zinc-100">right sidebar</strong></span>
                      </li>
                      <li className="flex items-start gap-2 text-xs text-zinc-600">
                        <span className="flex-shrink-0 w-4 h-4 rounded-full bg-zinc-200 text-zinc-400 flex items-center justify-center text-[10px] font-bold mt-0.5">4</span>
                        <span>Find <strong className="text-zinc-100">"Zone ID"</strong> under the "API" section — it looks like <code className="text-[10px] bg-zinc-200 px-1 py-0.5 rounded">a1b2c3d4e5f6...</code></span>
                      </li>
                      <li className="flex items-start gap-2 text-xs text-zinc-600">
                        <span className="flex-shrink-0 w-4 h-4 rounded-full bg-zinc-200 text-zinc-400 flex items-center justify-center text-[10px] font-bold mt-0.5">5</span>
                        <span>Copy it and paste it below</span>
                      </li>
                    </ol>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-zinc-500">Zone ID</Label>
                      <Input value={cfForm.zone_id} onChange={e => setCfForm(p => ({ ...p, zone_id: e.target.value }))}
                        placeholder="Your Cloudflare Zone ID" className="font-mono mt-1" data-testid="cf-zone-id-input" />
                    </div>
                    <div>
                      <Label className="text-xs text-zinc-500">Base Domain</Label>
                      <Input value={cfForm.base_domain} onChange={e => setCfForm(p => ({ ...p, base_domain: e.target.value }))}
                        placeholder="koodh.com" className="font-mono mt-1" data-testid="cf-base-domain-input" />
                    </div>
                  </div>
                  <Button onClick={saveCfConfig} disabled={!cfForm.zone_id || savingConfig} className="w-full" data-testid="save-cf-zone-btn">
                    {savingConfig ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}Save & Continue
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Step 3: Verify Connection */}
          <Card className={`border-zinc-200 ${setupStep === 2 ? 'bg-zinc-900 ring-1 ring-orange-500/30' : 'bg-zinc-900'}`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${cfVerifyResult?.valid ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-500'}`}>
                    {cfVerifyResult?.valid ? <Check className="w-3.5 h-3.5" /> : '3'}
                  </div>
                  <span className="text-sm font-medium text-zinc-200">Verify Connection</span>
                </div>
              </div>
              {setupStep === 2 && (
                <div className="space-y-3">
                  <p className="text-xs text-zinc-400">Test that your API Token has the correct permissions and can access your Cloudflare zone.</p>
                  <Button onClick={verifyCfToken} disabled={cfVerifying} className="w-full" data-testid="verify-cf-token-btn">
                    {cfVerifying ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Verifying...</> : <><CheckCircle className="w-4 h-4 mr-2" />Verify Connection</>}
                  </Button>
                  {cfVerifyResult && (
                    <div className={`p-3 rounded-lg border ${cfVerifyResult.valid ? 'bg-emerald-950/30 border-emerald-800' : 'bg-red-950/30 border-red-800'}`}>
                      <div className="flex items-center gap-2">
                        {cfVerifyResult.valid ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
                        <span className={`text-sm font-medium ${cfVerifyResult.valid ? 'text-emerald-300' : 'text-red-300'}`}>
                          {cfVerifyResult.valid ? `Connected — Zone: ${cfVerifyResult.zone_name} (${cfVerifyResult.zone_status})` : (cfVerifyResult.message || `Token status: ${cfVerifyResult.token_status}`)}
                        </span>
                      </div>
                      {/* Show structured steps on error */}
                      {!cfVerifyResult.valid && Array.isArray(cfVerifyResult.steps) && cfVerifyResult.steps.length > 0 && (
                        <div className="mt-2.5 rounded-md bg-zinc-900/60 border border-zinc-300/50 p-2.5">
                          <p className="text-[10px] uppercase tracking-wider text-amber-500 font-semibold mb-1.5">How to fix this:</p>
                          <ol className="space-y-1 list-none">
                            {cfVerifyResult.steps.map((step, i) => (
                              <li key={i} className="flex items-start gap-2 text-xs text-zinc-600">
                                <span className="flex-shrink-0 w-4 h-4 rounded-full bg-zinc-800 text-zinc-500 flex items-center justify-center text-[10px] font-bold mt-0.5">{i + 1}</span>
                                <span>{step}</span>
                              </li>
                            ))}
                          </ol>
                          {cfVerifyResult.link && (
                            <a href={cfVerifyResult.link} target="_blank" rel="noopener noreferrer"
                              className="mt-2 inline-flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300 transition-colors">
                              <ExternalLink className="w-3 h-3" />
                              {cfVerifyResult.link_label || 'Open link'}
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              {setupStep > 2 && cfVerifyResult?.valid && (
                <p className="text-xs text-emerald-400">Connected to zone: {cfVerifyResult.zone_name}</p>
              )}
            </CardContent>
          </Card>

          {/* Step 4: Sync DNS */}
          <Card className={`border-zinc-200 ${setupStep === 3 ? 'bg-gradient-to-r from-orange-950/30 to-zinc-900 ring-1 ring-orange-500/30' : 'bg-zinc-900'}`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold bg-zinc-800 text-zinc-500">4</div>
                  <span className="text-sm font-medium text-zinc-200">Sync DNS Records</span>
                </div>
                <a href={cfDnsUrl} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-orange-400 hover:text-orange-300 flex items-center gap-1" data-testid="cf-dns-link">
                  View in Cloudflare <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              {setupStep >= 2 && cfConfig?.configured && (
                <div className="space-y-3">
                  <p className="text-xs text-zinc-400">Automatically create or update DNS records in Cloudflare for all your subdomain routes and site domains.</p>
                  <div className="flex gap-2">
                    <Button onClick={() => { setCfSyncDialog(true); syncWithCloudflare(); }} disabled={cfSyncing} className="flex-1 bg-orange-600 hover:bg-orange-700 text-white" data-testid="sync-cloudflare-btn">
                      {cfSyncing ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Syncing...</> : <><RefreshCw className="w-4 h-4 mr-2" />Sync with Cloudflare</>}
                    </Button>
                    <Button variant="outline" onClick={fetchCfDnsRecords} disabled={cfLoadingRecords} data-testid="refresh-cf-dns-btn">
                      {cfLoadingRecords ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
              )}
              {setupStep < 2 && <p className="text-xs text-zinc-500">Complete the previous steps first to enable DNS sync.</p>}
            </CardContent>
          </Card>

          {/* DNS Records Table */}
          {cfDnsRecords.length > 0 && (
            <Card className="bg-white/50 backdrop-blur-lg border-white/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-zinc-400 flex items-center gap-2"><Layers className="w-4 h-4" />DNS Records ({cfDnsRecords.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
                  {cfDnsRecords.map(record => (
                    <div key={record.id} className="flex items-center justify-between bg-zinc-100/70 rounded-lg px-3 py-2 group" data-testid={`cf-dns-record-${record.name}`}>
                      <div className="flex items-center gap-3">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                          record.type === 'A' ? 'bg-blue-500/20 text-blue-400' : record.type === 'CNAME' ? 'bg-emerald-500/20 text-emerald-400' :
                          record.type === 'MX' ? 'bg-purple-500/20 text-purple-400' : record.type === 'TXT' ? 'bg-amber-500/20 text-amber-400' : 'bg-zinc-200 text-zinc-400'
                        }`}>{record.type}</span>
                        <span className="text-sm font-mono text-zinc-200">{record.name}</span>
                        <ArrowRight className="w-3 h-3 text-zinc-600" />
                        <span className="text-xs text-zinc-400 font-mono truncate max-w-[200px]">{record.content}</span>
                        {record.proxied && <span className="px-1.5 py-0.5 rounded text-[10px] bg-orange-500/15 text-orange-400">Proxied</span>}
                      </div>
                      <button onClick={() => deleteCfRecord(record.id, record.name)} className="opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-300 p-1" data-testid={`delete-cf-record-${record.id}`}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 5: Cloudflare Worker */}
          <Card className={`border-zinc-200 ${setupStep === 4 ? 'bg-gradient-to-r from-orange-950/30 to-zinc-900 ring-1 ring-orange-500/30' : 'bg-zinc-900'}`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3 cursor-pointer" onClick={() => setEditStep(editStep === 4 ? null : 4)}>
                <div className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${workerResult?.status === 'ok' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-500'}`}>
                    {workerResult?.status === 'ok' ? <Check className="w-3 h-3" /> : '5'}
                  </div>
                  <span className="text-sm font-medium text-zinc-200">Cloudflare Worker</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-500/20">Required for subdomains</span>
                </div>
                {workerResult?.status === 'ok' && <span className="text-xs text-emerald-400 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Worker active</span>}
              </div>
              {(setupStep >= 2 || editStep === 4) && (
                <div className="space-y-4">
                  <div className="rounded-md bg-zinc-800/60 border border-zinc-300/50 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-orange-400 font-semibold mb-2">What is this?</p>
                    <p className="text-xs text-zinc-400">The Cloudflare Worker makes subdomains like <code className="text-[10px] bg-zinc-200 px-1 py-0.5 rounded">login.{baseDomain}</code> work by proxying them to Clara. Without it, subdomains just show an error page.</p>
                  </div>
                  <div className="rounded-md bg-zinc-800/60 border border-zinc-300/50 p-3 space-y-2">
                    <p className="text-[10px] uppercase tracking-wider text-orange-400 font-semibold">How to deploy:</p>
                    <ol className="space-y-1.5 list-none">
                      {[
                        <>Go to <a href="https://dash.cloudflare.com" target="_blank" rel="noopener noreferrer" className="text-orange-400 hover:underline">dash.cloudflare.com</a> → <strong className="text-zinc-100">Workers & Pages</strong></>,
                        <>Click <strong className="text-zinc-100">"Create"</strong> → <strong className="text-zinc-100">"Create Worker"</strong> → name: <code className="text-[10px] bg-zinc-200 px-1 py-0.5 rounded">clara-subdomain-router</code></>,
                        <>Click <strong className="text-zinc-100">"Deploy"</strong> → then <strong className="text-zinc-100">"Edit code"</strong></>,
                        <>Delete all placeholder code → <strong className="text-zinc-100">paste the script below</strong></>,
                        <>Click <strong className="text-zinc-100">"Save and Deploy"</strong></>,
                        <>Go to <strong className="text-zinc-100">Settings → Domains & Routes</strong> → <strong className="text-zinc-100">"Add"</strong> → Route</>,
                        <>Route: <code className="text-[10px] bg-zinc-200 px-1 py-0.5 rounded">*.{baseDomain}/*</code> — Zone: <code className="text-[10px] bg-zinc-200 px-1 py-0.5 rounded">{baseDomain}</code></>,
                      ].map((content, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-zinc-600">
                          <span className="flex-shrink-0 w-4 h-4 rounded-full bg-zinc-200 text-zinc-400 flex items-center justify-center text-[10px] font-bold mt-0.5">{i + 1}</span>
                          <span>{content}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Code className="w-3.5 h-3.5 text-zinc-500" />
                        <span className="text-xs font-medium text-zinc-600">Worker Script</span>
                      </div>
                      <Button size="sm" variant="outline" onClick={copyWorkerScript} className="h-7 text-xs" data-testid="copy-worker-script-btn">
                        {workerScriptCopied ? <><Check className="w-3 h-3 mr-1 text-emerald-400" />Copied!</> : <><Copy className="w-3 h-3 mr-1" />Copy script</>}
                      </Button>
                    </div>
                    <div className="relative rounded-lg border border-zinc-300 bg-zinc-950 overflow-hidden">
                      <pre className="p-3 text-[10px] leading-relaxed text-zinc-400 font-mono overflow-x-auto max-h-[200px] overflow-y-auto" data-testid="worker-script-preview">
                        <code>{WORKER_SCRIPT.substring(0, 600)}...</code>
                      </pre>
                      <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-zinc-950 to-transparent pointer-events-none" />
                    </div>
                    <p className="text-[10px] text-zinc-600">Full script will be copied when you click "Copy script"</p>
                  </div>
                  <div className="space-y-2">
                    <Button onClick={testWorker} disabled={workerTesting} className="w-full bg-orange-600 hover:bg-orange-700 text-white" data-testid="test-worker-btn">
                      {workerTesting ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Testing Worker...</> : <><Zap className="w-4 h-4 mr-2" />Test Worker Connection</>}
                    </Button>
                    {workerResult && (
                      <div className={`rounded-lg border ${
                        workerResult.status === 'ok' ? 'bg-emerald-950/30 border-emerald-800' :
                        workerResult.status === 'warning' ? 'bg-amber-950/30 border-amber-800' :
                        'bg-red-950/30 border-red-800'
                      }`} data-testid="worker-test-result">
                        <div className="flex items-center gap-2 p-3 pb-2">
                          {workerResult.status === 'ok' ? <CheckCircle className="w-4 h-4 text-emerald-400" /> :
                           workerResult.status === 'warning' ? <AlertTriangle className="w-4 h-4 text-amber-400" /> :
                           <XCircle className="w-4 h-4 text-red-400" />}
                          <span className={`text-sm font-medium ${
                            workerResult.status === 'ok' ? 'text-emerald-300' :
                            workerResult.status === 'warning' ? 'text-amber-300' : 'text-red-300'
                          }`}>{workerResult.message}</span>
                        </div>

                        {/* Domain status table */}
                        {workerResult.domains?.length > 0 && (
                          <div className="px-3 pb-3">
                            <div className="rounded-md border border-zinc-300/50 overflow-hidden">
                              <table className="w-full text-xs" data-testid="worker-domain-table">
                                <thead>
                                  <tr className="bg-zinc-800/80">
                                    <th className="text-left px-3 py-1.5 text-zinc-400 font-medium">Subdomain</th>
                                    <th className="text-center px-2 py-1.5 text-zinc-400 font-medium">DNS</th>
                                    <th className="text-center px-2 py-1.5 text-zinc-400 font-medium">Worker</th>
                                    <th className="text-center px-2 py-1.5 text-zinc-400 font-medium">HTTP</th>
                                    <th className="text-left px-3 py-1.5 text-zinc-400 font-medium">Status</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {workerResult.domains.map((d) => {
                                    const statusConfig = {
                                      ok: { icon: <CheckCircle className="w-3 h-3 text-emerald-400" />, label: 'OK', color: 'text-emerald-400' },
                                      no_dns: { icon: <XCircle className="w-3 h-3 text-red-400" />, label: 'No DNS record', color: 'text-red-400' },
                                      not_in_worker: { icon: <AlertTriangle className="w-3 h-3 text-amber-400" />, label: 'Not in Worker', color: 'text-amber-400' },
                                      dns_only: { icon: <AlertTriangle className="w-3 h-3 text-amber-400" />, label: 'DNS only', color: 'text-amber-400' },
                                      error: { icon: <XCircle className="w-3 h-3 text-red-400" />, label: 'Error', color: 'text-red-400' },
                                      unknown: { icon: <Clock className="w-3 h-3 text-zinc-500" />, label: 'Unknown', color: 'text-zinc-500' },
                                    };
                                    const st = statusConfig[d.status] || statusConfig.unknown;
                                    const checkIcon = (val) => val === 'ok' || val === 'passthrough' 
                                      ? <CheckCircle className="w-3 h-3 text-emerald-400" />
                                      : val === 'missing' || val === 'not_in_worker' 
                                        ? <XCircle className="w-3 h-3 text-red-400" />
                                        : val === 'unreachable'
                                          ? <XCircle className="w-3 h-3 text-red-400" />
                                          : <Clock className="w-3 h-3 text-zinc-500" />;
                                    return (
                                      <tr key={d.subdomain} className="border-t border-zinc-200" data-testid={`worker-domain-${d.subdomain}`}>
                                        <td className="px-3 py-2">
                                          <div className="flex items-center gap-2">
                                            <span className="font-mono text-zinc-200">{d.fqdn}</span>
                                            {d.is_app && <span className="text-[9px] px-1 py-0.5 rounded bg-zinc-200 text-zinc-400">Main</span>}
                                          </div>
                                          <span className="text-[10px] text-zinc-600">→ {d.target_path}</span>
                                        </td>
                                        <td className="text-center px-2 py-2">{checkIcon(d.dns)}</td>
                                        <td className="text-center px-2 py-2">{checkIcon(d.worker)}</td>
                                        <td className="text-center px-2 py-2">{checkIcon(d.http)}</td>
                                        <td className="px-3 py-2">
                                          <div className="flex items-center gap-1.5">
                                            {st.icon}
                                            <span className={`${st.color}`}>{st.label}</span>
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>

                            {/* Worker route table comparison */}
                            {workerResult.worker_route_table && (
                              <div className="mt-2 text-[10px] text-zinc-600">
                                Worker herkent: {workerResult.worker_route_table.join(', ')}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Steps on error */}
                        {Array.isArray(workerResult.steps) && workerResult.steps.length > 0 && workerResult.status !== 'ok' && (
                          <div className="mx-3 mb-3 rounded-md bg-zinc-900/60 border border-zinc-300/50 p-2.5">
                            <p className="text-[10px] uppercase tracking-wider text-amber-500 font-semibold mb-1.5">How to fix this:</p>
                            <ol className="space-y-1 list-none">
                              {workerResult.steps.map((step, i) => (
                                <li key={i} className="flex items-start gap-2 text-xs text-zinc-600">
                                  <span className="flex-shrink-0 w-4 h-4 rounded-full bg-zinc-800 text-zinc-500 flex items-center justify-center text-[10px] font-bold mt-0.5">{i + 1}</span>
                                  <span>{step}</span>
                                </li>
                              ))}
                            </ol>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
              {setupStep < 2 && <p className="text-xs text-zinc-500">Complete the previous steps first.</p>}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ═══════ DOMAIN SETUP WIZARD ═══════ */}
      <Dialog open={domainDialog} onOpenChange={setDomainDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-300 max-w-lg">
          <DialogHeader>
            <DialogTitle>Set up domain — {editingSite?.name}</DialogTitle>
          </DialogHeader>

          <StepIndicator steps={domainForm.domain_type === 'custom' ? ['Type', 'Domain', 'DNS Records', 'Verify'] : ['Type', 'Subdomain', 'Done']} current={domainStep} />

          {/* Step 0: Choose type */}
          {domainStep === 0 && (
            <div className="space-y-4">
              <p className="text-xs text-zinc-400">Choose how this site will be accessed.</p>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setDomainForm(p => ({ ...p, domain_type: 'koodh' }))} data-testid="domain-type-koodh"
                  className={`flex flex-col items-center gap-1.5 p-4 rounded-lg border transition-colors ${domainForm.domain_type === 'koodh' ? 'bg-blue-600/15 border-blue-500/40 text-blue-400' : 'bg-zinc-800 border-zinc-300 text-zinc-400 hover:border-zinc-600'}`}>
                  <Globe className="w-5 h-5" /><span className="text-sm font-medium">{baseDomain} Subdomain</span><span className="text-[10px] opacity-70">*.{baseDomain}</span>
                </button>
                <button onClick={() => setDomainForm(p => ({ ...p, domain_type: 'custom' }))} data-testid="domain-type-custom"
                  className={`flex flex-col items-center gap-1.5 p-4 rounded-lg border transition-colors ${domainForm.domain_type === 'custom' ? 'bg-purple-600/15 border-purple-500/40 text-purple-400' : 'bg-zinc-800 border-zinc-300 text-zinc-400 hover:border-zinc-600'}`}>
                  <ExternalLink className="w-5 h-5" /><span className="text-sm font-medium">Custom Domain</span><span className="text-[10px] opacity-70">your-domain.com</span>
                </button>
              </div>
              <Button onClick={() => setDomainStep(1)} className="w-full">Next</Button>
            </div>
          )}

          {/* Step 1: Enter domain */}
          {domainStep === 1 && (
            <div className="space-y-4">
              {domainForm.domain_type === 'koodh' ? (
                <>
                  <p className="text-xs text-zinc-400">Enter the subdomain for this site. DNS will be managed automatically via Cloudflare.</p>
                  <div>
                    <Label>Subdomain</Label>
                    <div className="flex items-center gap-1 mt-1">
                      <Input value={domainForm.subdomain} onChange={e => setDomainForm(p => ({ ...p, subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))} placeholder="sitename" className="font-mono" data-testid="domain-subdomain-input" />
                      <span className="text-sm text-zinc-500 whitespace-nowrap">.{baseDomain}</span>
                    </div>
                    <p className="text-xs text-zinc-500 mt-1">Result: <span className="font-mono text-zinc-400">{domainForm.subdomain || 'sitename'}.{baseDomain}</span></p>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-xs text-zinc-400">Enter the custom domain you want to use for this site.</p>
                  <div>
                    <Label>Domain</Label>
                    <Input value={domainForm.custom_domain} onChange={e => setDomainForm(p => ({ ...p, custom_domain: e.target.value.toLowerCase().trim() }))} placeholder="radio.yourdomain.com" className="font-mono mt-1" data-testid="domain-custom-input" />
                  </div>
                </>
              )}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setDomainStep(0)} className="flex-1">Back</Button>
                <Button onClick={saveDomainConfig} disabled={domainSaving || (domainForm.domain_type === 'koodh' && !domainForm.subdomain) || (domainForm.domain_type === 'custom' && !domainForm.custom_domain)} className="flex-1" data-testid="save-domain-config-btn">
                  {domainSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}{domainForm.domain_type === 'koodh' ? 'Save & Finish' : 'Save & Continue'}
                </Button>
              </div>
            </div>
          )}

          {/* Step 2 (custom only): DNS records instructions */}
          {domainStep === 2 && domainForm.domain_type === 'custom' && (
            <div className="space-y-4">
              <p className="text-xs text-zinc-400">Add the following DNS records at your domain provider or Cloudflare.</p>
              <div className="space-y-2">
                <div className="bg-zinc-950 rounded-lg p-3 border border-zinc-200">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-zinc-500 uppercase">CNAME Record (required)</span>
                    <button onClick={() => copyToClipboard(`${domainForm.custom_domain} CNAME clara.${baseDomain}`)} className="text-zinc-500 hover:text-zinc-600"><Copy className="w-3 h-3" /></button>
                  </div>
                  <code className="text-xs text-emerald-400 font-mono">{domainForm.custom_domain} &rarr; clara.{baseDomain}</code>
                </div>
                <div className="bg-zinc-950 rounded-lg p-3 border border-zinc-200">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-zinc-500 uppercase">Verification CNAME (required)</span>
                    <button onClick={() => copyToClipboard(`_clara-verify.${domainForm.custom_domain} CNAME verify.${baseDomain}`)} className="text-zinc-500 hover:text-zinc-600"><Copy className="w-3 h-3" /></button>
                  </div>
                  <code className="text-xs text-amber-400 font-mono">_clara-verify.{domainForm.custom_domain} &rarr; verify.{baseDomain}</code>
                </div>
              </div>
              <a href={cfDnsUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 w-full py-2 px-4 rounded-lg bg-orange-600/15 border border-orange-600/30 text-orange-400 text-sm hover:bg-orange-600/25 transition-colors">
                <ExternalLink className="w-4 h-4" /> Add records in Cloudflare
              </a>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setDomainStep(1)} className="flex-1">Back</Button>
                <Button onClick={() => setDomainStep(3)} className="flex-1">I've added the records</Button>
              </div>
            </div>
          )}

          {/* Step 3 (custom): Verify / Done */}
          {domainStep === 3 && domainForm.domain_type === 'custom' && (
            <div className="space-y-4">
              <div className="flex flex-col items-center py-4">
                <Clock className="w-8 h-8 text-amber-400 mb-2" />
                <p className="text-sm text-zinc-200 font-medium">Waiting for DNS propagation</p>
                <p className="text-xs text-zinc-400 mt-1 text-center">DNS changes can take up to 24 hours to propagate. You can verify the connection at any time.</p>
              </div>
              <Button onClick={() => { verifyDomain(editingSite?.id); }} disabled={verifying === editingSite?.id} className="w-full" data-testid="verify-domain-wizard-btn">
                {verifying === editingSite?.id ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Verifying...</> : <><RefreshCw className="w-4 h-4 mr-2" />Verify Now</>}
              </Button>
              <Button variant="outline" onClick={() => setDomainDialog(false)} className="w-full">Close</Button>
            </div>
          )}

          {/* Done (koodh) */}
          {domainStep === 3 && domainForm.domain_type === 'koodh' && (
            <div className="space-y-4">
              <div className="flex flex-col items-center py-4">
                <CheckCircle className="w-8 h-8 text-emerald-400 mb-2" />
                <p className="text-sm text-zinc-200 font-medium">Domain configured</p>
                <p className="text-xs text-zinc-400 mt-1"><span className="font-mono text-zinc-600">{domainForm.subdomain}.{baseDomain}</span> is ready to use.</p>
                {cfConfig?.configured && <p className="text-xs text-zinc-500 mt-2">Use "Sync with Cloudflare" to push DNS records automatically.</p>}
              </div>
              <Button onClick={() => setDomainDialog(false)} className="w-full">Done</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ═══════ ROUTE DIALOG ═══════ */}
      <Dialog open={routeDialog} onOpenChange={setRouteDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-300 max-w-md">
          <DialogHeader><DialogTitle>{editingRoute ? 'Edit Route' : 'New Route'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Subdomain</Label>
              <div className="flex items-center gap-1 mt-1">
                <Input value={routeForm.subdomain} onChange={e => setRouteForm(p => ({ ...p, subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))} placeholder="login" className="font-mono" disabled={!!editingRoute?.is_system} data-testid="route-subdomain-input" />
                <span className="text-sm text-zinc-500 whitespace-nowrap">.{baseDomain}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Label</Label><Input value={routeForm.label} onChange={e => setRouteForm(p => ({ ...p, label: e.target.value }))} placeholder="Login Portal" data-testid="route-label-input" /></div>
              <div><Label>Type</Label>
                <select className="w-full rounded-md border border-zinc-300 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 mt-1" value={routeForm.route_type} onChange={e => setRouteForm(p => ({ ...p, route_type: e.target.value }))} data-testid="route-type-select">
                  <option value="auth">Authentication</option><option value="network">Management</option><option value="firewall">Firewall</option><option value="app">Application</option>
                </select>
              </div>
            </div>
            <div><Label>Description</Label><Input value={routeForm.description} onChange={e => setRouteForm(p => ({ ...p, description: e.target.value }))} placeholder="What does this subdomain point to?" /></div>
            <div><Label>Target Path</Label><Input value={routeForm.target_path} onChange={e => setRouteForm(p => ({ ...p, target_path: e.target.value }))} placeholder="/login" className="font-mono" data-testid="route-target-input" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRouteDialog(false)}>Cancel</Button>
            <Button onClick={saveRoute} disabled={!routeForm.subdomain || !routeForm.label} data-testid="save-route-btn">{editingRoute ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════ SYNC RESULTS DIALOG ═══════ */}
      <Dialog open={cfSyncDialog} onOpenChange={setCfSyncDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-300 max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className={`w-5 h-5 text-orange-400 ${cfSyncing ? 'animate-spin' : ''}`} />Cloudflare DNS Sync
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {cfSyncing && (
              <div className="flex flex-col items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-orange-400 mb-3" />
                <p className="text-sm text-zinc-400">Syncing DNS records with Cloudflare...</p>
              </div>
            )}
            {cfSyncResult && !cfSyncing && (
              <>
                <div className="grid grid-cols-4 gap-2">
                  <div className="bg-emerald-950/30 border border-emerald-900/40 rounded-lg p-2 text-center">
                    <p className="text-lg font-bold text-emerald-400">{cfSyncResult.created?.length || 0}</p><p className="text-[10px] text-emerald-400/70">Created</p>
                  </div>
                  <div className="bg-blue-950/30 border border-blue-900/40 rounded-lg p-2 text-center">
                    <p className="text-lg font-bold text-blue-400">{cfSyncResult.updated?.length || 0}</p><p className="text-[10px] text-blue-400/70">Updated</p>
                  </div>
                  <div className="bg-zinc-800 border border-zinc-300 rounded-lg p-2 text-center">
                    <p className="text-lg font-bold text-zinc-600">{cfSyncResult.unchanged?.length || 0}</p><p className="text-[10px] text-zinc-500">Unchanged</p>
                  </div>
                  <div className="bg-red-950/30 border border-red-900/40 rounded-lg p-2 text-center">
                    <p className="text-lg font-bold text-red-400">{cfSyncResult.errors?.length || 0}</p><p className="text-[10px] text-red-400/70">Errors</p>
                  </div>
                </div>
                <div className="max-h-[300px] overflow-y-auto space-y-1.5">
                  {cfSyncResult.created?.map((r, i) => <div key={`c-${i}`} className="flex items-center gap-2 bg-emerald-950/20 rounded px-3 py-1.5"><Plus className="w-3 h-3 text-emerald-400 flex-shrink-0" /><span className="text-xs font-mono text-emerald-300">{r.fqdn}</span><span className="text-[10px] text-zinc-500 ml-auto">{r.label}</span></div>)}
                  {cfSyncResult.updated?.map((r, i) => <div key={`u-${i}`} className="flex items-center gap-2 bg-blue-950/20 rounded px-3 py-1.5"><Edit className="w-3 h-3 text-blue-400 flex-shrink-0" /><span className="text-xs font-mono text-blue-300">{r.fqdn}</span><span className="text-[10px] text-zinc-500 ml-auto">{r.label}</span></div>)}
                  {cfSyncResult.unchanged?.map((r, i) => <div key={`nc-${i}`} className="flex items-center gap-2 bg-zinc-800/30 rounded px-3 py-1.5"><Check className="w-3 h-3 text-zinc-500 flex-shrink-0" /><span className="text-xs font-mono text-zinc-400">{r.fqdn}</span><span className="text-[10px] text-zinc-600 ml-auto">{r.label}</span></div>)}
                  {cfSyncResult.errors?.map((r, i) => <div key={`e-${i}`} className="flex items-center gap-2 bg-red-950/20 rounded px-3 py-1.5"><XCircle className="w-3 h-3 text-red-400 flex-shrink-0" /><span className="text-xs font-mono text-red-300">{r.fqdn}</span><span className="text-[10px] text-red-400/70 ml-auto">{r.error}</span></div>)}
                </div>
              </>
            )}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setCfSyncDialog(false)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════ DELETE DIALOG ═══════ */}
      <AlertDialog open={deleteDialog.open} onOpenChange={open => !open && setDeleteDialog(prev => ({ ...prev, open: false }))}>
        <AlertDialogContent className="bg-zinc-900 border-zinc-300">
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteDialog.type === 'domain' ? 'Remove domain configuration?' : 'Delete route?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteDialog.type === 'domain' ? `This will remove the domain configuration for "${deleteDialog.name}".` : `This will delete the route "${deleteDialog.name}".`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteDialog.type === 'domain' ? removeDomainConfig : deleteRoute} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatCard({ label, value, total, icon: Icon, color }) {
  return (
    <div className="bg-zinc-900 border border-zinc-200 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-1"><Icon className={`w-4 h-4 ${color}`} /><span className="text-xs text-zinc-500">{label}</span></div>
      <p className="text-2xl font-bold text-zinc-100">{value}{total !== undefined && <span className="text-sm text-zinc-500 font-normal">/{total}</span>}</p>
    </div>
  );
}
