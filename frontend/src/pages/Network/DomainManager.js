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
import {
  Globe, Plus, Edit, Trash2, Check, Loader2, Shield,
  ExternalLink, AlertTriangle, CheckCircle, Clock, XCircle, Copy,
  Link2, RefreshCw, Settings, ArrowRight, Lock, Eye, EyeOff, Layers,
  ChevronRight
} from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

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

  // Setup wizard
  const [setupStep, setSetupStep] = useState(0);
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
      const res = await fetch(`${API}/api/domains/cloudflare/verify-token`, { method: 'POST', headers });
      const data = await res.json();
      if (res.ok) { setCfVerifyResult(data); data.valid ? toast.success(`Connected to zone: ${data.zone_name}`) : toast.error('Token invalid or inactive'); }
      else toast.error(data.detail || 'Verification failed');
    } catch { toast.error('Verification failed'); }
    setCfVerifying(false);
  };

  const fetchCfDnsRecords = async () => {
    setCfLoadingRecords(true);
    try {
      const res = await fetch(`${API}/api/domains/cloudflare/dns-records`, { headers });
      const data = await res.json();
      if (res.ok) { setCfDnsRecords(data.records || []); toast.success(`${data.total || 0} DNS records loaded`); }
      else toast.error(data.detail || 'Failed to load DNS records');
    } catch { toast.error('Connection error'); }
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

  const copyToClipboard = (text) => { navigator.clipboard.writeText(text); toast.success('Copied to clipboard'); };
  const baseDomain = overview?.base_domain || 'koodh.com';
  const unconfiguredSites = mainSites.filter(s => !configs.find(c => c.main_site_id === s.id));
  const cfZoneUrl = cfConfig?.zone_id ? `https://dash.cloudflare.com/${cfConfig.zone_id}` : 'https://dash.cloudflare.com';
  const cfDnsUrl = cfConfig?.zone_id ? `https://dash.cloudflare.com/${cfConfig.zone_id}/dns/records` : 'https://dash.cloudflare.com';

  if (loading) return <div className="flex items-center justify-center py-12" data-testid="domain-manager-loading"><Loader2 className="w-6 h-6 animate-spin text-zinc-400" /></div>;

  return (
    <div className="space-y-6" data-testid="domain-manager">
      {/* Tabs */}
      <div className="flex gap-2 border-b border-zinc-800 pb-2">
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
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="p-4 flex items-center gap-3">
                <Shield className="w-5 h-5 text-zinc-500 flex-shrink-0" />
                <div>
                  <p className="text-sm text-zinc-300 font-medium">Cloudflare API not configured</p>
                  <p className="text-xs text-zinc-500">Set up your Cloudflare API Token to manage DNS records automatically</p>
                </div>
                <Button size="sm" variant="outline" className="ml-auto" onClick={() => setActiveTab('cloudflare')}>Set up</Button>
              </CardContent>
            </Card>
          )}

          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-zinc-400 flex items-center gap-2"><ArrowRight className="w-4 h-4" />Active Subdomain Routes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {routes.filter(r => r.is_active).map(route => (
                  <div key={route.id} className="flex items-center justify-between bg-zinc-800/50 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-0.5 rounded text-xs border ${ROUTE_TYPE_COLORS[route.route_type] || 'bg-zinc-700 text-zinc-300 border-zinc-600'}`}>
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
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-emerald-400 flex items-center gap-2"><CheckCircle className="w-4 h-4" />Configured Domains ({configs.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {configs.map(config => {
                  const verStatus = STATUS_CONFIGS[config.verification_status] || STATUS_CONFIGS.pending;
                  const VerIcon = verStatus.icon;
                  return (
                    <div key={config.id} className="bg-zinc-800/50 rounded-lg px-4 py-3" data-testid={`domain-config-${config.main_site_id}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className={`px-2 py-0.5 rounded text-xs ${SITE_TYPE_COLORS[config.site_type] || 'bg-zinc-700 text-zinc-300'}`}>{SITE_TYPE_LABELS[config.site_type] || config.site_type}</span>
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
                          <span className="font-mono text-zinc-300">{config.full_domain || `${config.subdomain}.${baseDomain}`}</span>
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
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-amber-400 flex items-center gap-2"><AlertTriangle className="w-4 h-4" />Not Configured ({unconfiguredSites.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {unconfiguredSites.map(site => (
                  <div key={site.id} className="flex items-center justify-between bg-zinc-800/50 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-xs ${SITE_TYPE_COLORS[site.site_type] || 'bg-zinc-700 text-zinc-300'}`}>{SITE_TYPE_LABELS[site.site_type] || site.site_type}</span>
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
            <Button onClick={openCreateRoute} size="sm" data-testid="create-route-btn"><Plus className="w-4 h-4 mr-1" /> New Route</Button>
          </div>
          <div className="space-y-3">
            {routes.map(route => (
              <Card key={route.id} className={`border-zinc-800 ${route.is_active ? 'bg-zinc-900' : 'bg-zinc-950/50 opacity-60'}`} data-testid={`route-card-${route.subdomain}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${route.is_active ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-mono text-white font-medium">{route.subdomain}.{baseDomain}</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] border ${ROUTE_TYPE_COLORS[route.route_type] || 'bg-zinc-700 text-zinc-300 border-zinc-600'}`}>{ROUTE_TYPE_LABELS[route.route_type] || route.route_type}</span>
                          {route.is_system && <span className="px-1.5 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-500">System</span>}
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
            ))}
          </div>
          {routes.length === 0 && (
            <Card className="bg-zinc-900 border-zinc-800"><CardContent className="flex flex-col items-center justify-center py-12"><ArrowRight className="w-12 h-12 text-zinc-600 mb-3" /><p className="text-zinc-400 text-sm">No subdomain routes configured yet</p></CardContent></Card>
          )}
        </div>
      )}

      {/* ═══════ CLOUDFLARE (Step-based Setup) ═══════ */}
      {activeTab === 'cloudflare' && (
        <div className="space-y-4">
          <StepIndicator steps={['API Token', 'Zone ID', 'Verify Connection', 'Sync DNS']} current={setupStep} />

          {/* Step 1: API Token */}
          <Card className={`border-zinc-800 ${setupStep === 0 ? 'bg-zinc-900 ring-1 ring-orange-500/30' : 'bg-zinc-900'}`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${cfConfig?.api_token_set ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-500'}`}>
                    {cfConfig?.api_token_set ? <Check className="w-3.5 h-3.5" /> : '1'}
                  </div>
                  <span className="text-sm font-medium text-zinc-200">API Token</span>
                  {cfConfig?.api_token_set && <span className="text-xs font-mono text-zinc-500">{cfConfig.api_token_preview}</span>}
                </div>
                <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noopener noreferrer"
                  className="text-xs text-orange-400 hover:text-orange-300 flex items-center gap-1" data-testid="cf-token-link">
                  Open Cloudflare <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              {setupStep === 0 && (
                <div className="space-y-3">
                  <p className="text-xs text-zinc-400">
                    Create an API Token in Cloudflare with <strong className="text-zinc-300">Zone:DNS:Edit</strong> permissions.
                    Go to <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noopener noreferrer" className="text-orange-400 hover:underline">Cloudflare Dashboard &rarr; Profile &rarr; API Tokens</a> and click "Create Token".
                  </p>
                  <div className="relative">
                    <Input type={showToken ? 'text' : 'password'} value={cfForm.api_token} onChange={e => setCfForm(p => ({ ...p, api_token: e.target.value }))}
                      placeholder="Paste your Cloudflare API Token here" className="pr-10 font-mono" data-testid="cf-api-token-input" />
                    <button type="button" onClick={() => setShowToken(!showToken)} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
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
          <Card className={`border-zinc-800 ${setupStep === 1 ? 'bg-zinc-900 ring-1 ring-orange-500/30' : 'bg-zinc-900'}`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${cfConfig?.zone_id ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-500'}`}>
                    {cfConfig?.zone_id ? <Check className="w-3.5 h-3.5" /> : '2'}
                  </div>
                  <span className="text-sm font-medium text-zinc-200">Zone ID & Base Domain</span>
                  {cfConfig?.zone_id && <span className="text-xs font-mono text-zinc-500 truncate max-w-[200px]">{cfConfig.zone_id}</span>}
                </div>
                <a href={cfZoneUrl} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-orange-400 hover:text-orange-300 flex items-center gap-1" data-testid="cf-zone-link">
                  Open Zone <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              {setupStep === 1 && (
                <div className="space-y-3">
                  <p className="text-xs text-zinc-400">
                    Find your Zone ID on the <a href="https://dash.cloudflare.com" target="_blank" rel="noopener noreferrer" className="text-orange-400 hover:underline">Cloudflare Dashboard</a> &rarr; select your domain &rarr; look in the right sidebar under "API".
                  </p>
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
          <Card className={`border-zinc-800 ${setupStep === 2 ? 'bg-zinc-900 ring-1 ring-orange-500/30' : 'bg-zinc-900'}`}>
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
                          {cfVerifyResult.valid ? `Connected — Zone: ${cfVerifyResult.zone_name} (${cfVerifyResult.zone_status})` : `Token status: ${cfVerifyResult.token_status}`}
                        </span>
                      </div>
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
          <Card className={`border-zinc-800 ${setupStep === 3 ? 'bg-gradient-to-r from-orange-950/30 to-zinc-900 ring-1 ring-orange-500/30' : 'bg-zinc-900'}`}>
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
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-zinc-400 flex items-center gap-2"><Layers className="w-4 h-4" />DNS Records ({cfDnsRecords.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
                  {cfDnsRecords.map(record => (
                    <div key={record.id} className="flex items-center justify-between bg-zinc-800/50 rounded-lg px-3 py-2 group" data-testid={`cf-dns-record-${record.name}`}>
                      <div className="flex items-center gap-3">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                          record.type === 'A' ? 'bg-blue-500/20 text-blue-400' : record.type === 'CNAME' ? 'bg-emerald-500/20 text-emerald-400' :
                          record.type === 'MX' ? 'bg-purple-500/20 text-purple-400' : record.type === 'TXT' ? 'bg-amber-500/20 text-amber-400' : 'bg-zinc-700 text-zinc-400'
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
        </div>
      )}

      {/* ═══════ DOMAIN SETUP WIZARD ═══════ */}
      <Dialog open={domainDialog} onOpenChange={setDomainDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-700 max-w-lg">
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
                  className={`flex flex-col items-center gap-1.5 p-4 rounded-lg border transition-colors ${domainForm.domain_type === 'koodh' ? 'bg-blue-600/15 border-blue-500/40 text-blue-400' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'}`}>
                  <Globe className="w-5 h-5" /><span className="text-sm font-medium">{baseDomain} Subdomain</span><span className="text-[10px] opacity-70">*.{baseDomain}</span>
                </button>
                <button onClick={() => setDomainForm(p => ({ ...p, domain_type: 'custom' }))} data-testid="domain-type-custom"
                  className={`flex flex-col items-center gap-1.5 p-4 rounded-lg border transition-colors ${domainForm.domain_type === 'custom' ? 'bg-purple-600/15 border-purple-500/40 text-purple-400' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'}`}>
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
                <div className="bg-zinc-950 rounded-lg p-3 border border-zinc-800">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-zinc-500 uppercase">CNAME Record (required)</span>
                    <button onClick={() => copyToClipboard(`${domainForm.custom_domain} CNAME clara.${baseDomain}`)} className="text-zinc-500 hover:text-zinc-300"><Copy className="w-3 h-3" /></button>
                  </div>
                  <code className="text-xs text-emerald-400 font-mono">{domainForm.custom_domain} &rarr; clara.{baseDomain}</code>
                </div>
                <div className="bg-zinc-950 rounded-lg p-3 border border-zinc-800">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-zinc-500 uppercase">Verification CNAME (required)</span>
                    <button onClick={() => copyToClipboard(`_clara-verify.${domainForm.custom_domain} CNAME verify.${baseDomain}`)} className="text-zinc-500 hover:text-zinc-300"><Copy className="w-3 h-3" /></button>
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
                <p className="text-xs text-zinc-400 mt-1"><span className="font-mono text-zinc-300">{domainForm.subdomain}.{baseDomain}</span> is ready to use.</p>
                {cfConfig?.configured && <p className="text-xs text-zinc-500 mt-2">Use "Sync with Cloudflare" to push DNS records automatically.</p>}
              </div>
              <Button onClick={() => setDomainDialog(false)} className="w-full">Done</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ═══════ ROUTE DIALOG ═══════ */}
      <Dialog open={routeDialog} onOpenChange={setRouteDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-700 max-w-md">
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
                <select className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 mt-1" value={routeForm.route_type} onChange={e => setRouteForm(p => ({ ...p, route_type: e.target.value }))} data-testid="route-type-select">
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
        <DialogContent className="bg-zinc-900 border-zinc-700 max-w-lg">
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
                  <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-center">
                    <p className="text-lg font-bold text-zinc-300">{cfSyncResult.unchanged?.length || 0}</p><p className="text-[10px] text-zinc-500">Unchanged</p>
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
        <AlertDialogContent className="bg-zinc-900 border-zinc-700">
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
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-1"><Icon className={`w-4 h-4 ${color}`} /><span className="text-xs text-zinc-500">{label}</span></div>
      <p className="text-2xl font-bold text-zinc-100">{value}{total !== undefined && <span className="text-sm text-zinc-500 font-normal">/{total}</span>}</p>
    </div>
  );
}
