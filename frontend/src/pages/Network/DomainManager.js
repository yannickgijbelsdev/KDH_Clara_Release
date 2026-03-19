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
  Globe, Plus, Edit, Trash2, Check, X, Loader2, Shield, Server,
  ExternalLink, AlertTriangle, CheckCircle, Clock, XCircle, Copy,
  Link2, Unlink, RefreshCw, Settings, ArrowRight, Lock, Eye, EyeOff,
  Radio, Layers
} from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

const ROUTE_TYPE_LABELS = {
  auth: 'Authenticatie',
  network: 'Network Management',
  firewall: 'Firewall',
  app: 'Applicatie',
};

const ROUTE_TYPE_COLORS = {
  auth: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  network: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  firewall: 'bg-red-500/20 text-red-400 border-red-500/30',
  app: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
};

const SITE_TYPE_COLORS = {
  radio: 'bg-blue-500/20 text-blue-400',
  technical: 'bg-purple-500/20 text-purple-400',
  server: 'bg-emerald-500/20 text-emerald-400',
  task_scheduler: 'bg-amber-500/20 text-amber-400',
};

const SITE_TYPE_LABELS = {
  radio: 'Main Site',
  technical: 'Technical',
  server: 'Server',
  task_scheduler: 'Task',
};

const STATUS_CONFIGS = {
  verified: { icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/15', label: 'Geverifieerd' },
  pending: { icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/15', label: 'In afwachting' },
  failed: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/15', label: 'Mislukt' },
  active: { icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/15', label: 'Actief' },
  cname_missing: { icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-500/15', label: 'CNAME ontbreekt' },
  pending_issuance: { icon: Clock, color: 'text-blue-400', bg: 'bg-blue-500/15', label: 'SSL in aanvraag' },
};

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

  // Dialogs
  const [domainDialog, setDomainDialog] = useState(false);
  const [editingSite, setEditingSite] = useState(null);
  const [domainForm, setDomainForm] = useState({ domain_type: 'koodh', subdomain: '', custom_domain: '' });
  const [routeDialog, setRouteDialog] = useState(false);
  const [editingRoute, setEditingRoute] = useState(null);
  const [routeForm, setRouteForm] = useState({ subdomain: '', label: '', description: '', route_type: 'app', target_path: '/', is_active: true });
  const [cfDialog, setCfDialog] = useState(false);
  const [cfForm, setCfForm] = useState({ api_token: '', zone_id: '', base_domain: 'koodh.com' });
  const [showToken, setShowToken] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState({ open: false, type: '', id: '', name: '' });
  const [verifying, setVerifying] = useState(null);

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const fetchData = useCallback(async () => {
    setLoading(true);

    try {
      const res = await fetch(`${API}/api/domains/overview`, { headers });
      if (res.ok) setOverview(await res.json());
    } catch { /* skip */ }

    try {
      const res = await fetch(`${API}/api/domains/configs`, { headers });
      if (res.ok) setConfigs(await res.json());
    } catch { /* skip */ }

    try {
      const res = await fetch(`${API}/api/domains/routes`, { headers });
      if (res.ok) setRoutes(await res.json());
    } catch { /* skip */ }

    try {
      const res = await fetch(`${API}/api/domains/cloudflare/config`, { headers });
      if (res.ok) setCfConfig(await res.json());
    } catch { /* skip */ }

    try {
      const res = await fetch(`${API}/api/main-sites`, { headers });
      if (res.ok) {
        const data = await res.json();
        setMainSites(Array.isArray(data) ? data : []);
      }
    } catch { /* skip */ }

    setLoading(false);
  }, [token]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ---- Domain Config ----
  const openDomainConfig = (site) => {
    const existing = configs.find(c => c.main_site_id === site.id);
    setEditingSite(site);
    setDomainForm({
      domain_type: existing?.domain_type || 'koodh',
      subdomain: existing?.subdomain || site.slug || '',
      custom_domain: existing?.custom_domain || '',
    });
    setDomainDialog(true);
  };

  const saveDomainConfig = async () => {
    try {
      const res = await fetch(`${API}/api/domains/configs`, {
        method: 'POST', headers,
        body: JSON.stringify({ main_site_id: editingSite.id, ...domainForm }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.detail || 'Opslaan mislukt');
        return;
      }
      toast.success('Domeinconfiguratie opgeslagen');
      setDomainDialog(false);
      fetchData();
    } catch {
      toast.error('Opslaan mislukt');
    }
  };

  const removeDomainConfig = async () => {
    try {
      const res = await fetch(`${API}/api/domains/configs/${deleteDialog.id}`, { method: 'DELETE', headers });
      if (res.ok) {
        toast.success('Domeinconfiguratie verwijderd');
        fetchData();
      } else {
        toast.error('Verwijderen mislukt');
      }
    } catch {
      toast.error('Verwijderen mislukt');
    }
    setDeleteDialog({ open: false, type: '', id: '', name: '' });
  };

  const verifyDomain = async (mainSiteId) => {
    setVerifying(mainSiteId);
    try {
      const res = await fetch(`${API}/api/domains/configs/${mainSiteId}/verify`, { method: 'POST', headers });
      const data = await res.json();
      if (data.verified) {
        toast.success('Domein succesvol geverifieerd!');
      } else {
        toast.error(data.error || 'Verificatie mislukt');
      }
      fetchData();
    } catch {
      toast.error('Verificatie mislukt');
    }
    setVerifying(null);
  };

  // ---- Subdomain Routes ----
  const openCreateRoute = () => {
    setEditingRoute(null);
    setRouteForm({ subdomain: '', label: '', description: '', route_type: 'app', target_path: '/', is_active: true });
    setRouteDialog(true);
  };

  const openEditRoute = (route) => {
    setEditingRoute(route);
    setRouteForm({
      subdomain: route.subdomain,
      label: route.label,
      description: route.description || '',
      route_type: route.route_type,
      target_path: route.target_path,
      is_active: route.is_active,
    });
    setRouteDialog(true);
  };

  const saveRoute = async () => {
    try {
      const url = editingRoute ? `${API}/api/domains/routes/${editingRoute.id}` : `${API}/api/domains/routes`;
      const method = editingRoute ? 'PUT' : 'POST';
      const body = editingRoute
        ? { label: routeForm.label, description: routeForm.description, route_type: routeForm.route_type, target_path: routeForm.target_path, is_active: routeForm.is_active }
        : routeForm;
      const res = await fetch(url, { method, headers, body: JSON.stringify(body) });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.detail || 'Opslaan mislukt');
        return;
      }
      toast.success(editingRoute ? 'Route bijgewerkt' : 'Route aangemaakt');
      setRouteDialog(false);
      fetchData();
    } catch {
      toast.error('Opslaan mislukt');
    }
  };

  const toggleRouteActive = async (route) => {
    try {
      await fetch(`${API}/api/domains/routes/${route.id}`, {
        method: 'PUT', headers,
        body: JSON.stringify({ is_active: !route.is_active }),
      });
      fetchData();
    } catch {
      toast.error('Bijwerken mislukt');
    }
  };

  const deleteRoute = async () => {
    try {
      const res = await fetch(`${API}/api/domains/routes/${deleteDialog.id}`, { method: 'DELETE', headers });
      if (res.ok) {
        toast.success('Route verwijderd');
        fetchData();
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Verwijderen mislukt');
      }
    } catch {
      toast.error('Verwijderen mislukt');
    }
    setDeleteDialog({ open: false, type: '', id: '', name: '' });
  };

  // ---- Cloudflare Config ----
  const openCfConfig = () => {
    setCfForm({
      api_token: '',
      zone_id: cfConfig?.zone_id || '',
      base_domain: cfConfig?.base_domain || 'koodh.com',
    });
    setShowToken(false);
    setCfDialog(true);
  };

  const saveCfConfig = async () => {
    try {
      const body = {};
      if (cfForm.api_token) body.api_token = cfForm.api_token;
      if (cfForm.zone_id) body.zone_id = cfForm.zone_id;
      if (cfForm.base_domain) body.base_domain = cfForm.base_domain;

      const res = await fetch(`${API}/api/domains/cloudflare/config`, {
        method: 'PUT', headers, body: JSON.stringify(body),
      });
      if (res.ok) {
        toast.success('Cloudflare configuratie opgeslagen');
        setCfDialog(false);
        fetchData();
      } else {
        toast.error('Opslaan mislukt');
      }
    } catch {
      toast.error('Opslaan mislukt');
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Gekopieerd naar klembord');
  };

  const baseDomain = overview?.base_domain || 'koodh.com';

  // Sites that don't have domain config yet
  const unconfiguredSites = mainSites.filter(s => !configs.find(c => c.main_site_id === s.id));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12" data-testid="domain-manager-loading">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="domain-manager">
      {/* Tabs */}
      <div className="flex gap-2 border-b border-zinc-800 pb-2">
        {[
          { id: 'overview', label: 'Overzicht', icon: Globe },
          { id: 'sites', label: 'Site Domeinen', icon: Link2 },
          { id: 'routing', label: 'Subdomain Routing', icon: ArrowRight },
          { id: 'cloudflare', label: 'Cloudflare', icon: Shield },
        ].map(tab => (
          <button
            key={tab.id}
            data-testid={`domain-tab-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === tab.id
                ? 'bg-zinc-800 text-white border-b-2 border-orange-500'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ═══════ OVERVIEW TAB ═══════ */}
      {activeTab === 'overview' && overview && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Geconfigureerd" value={overview.configured_domains} total={overview.total_sites} icon={Link2} color="text-emerald-400" />
            <StatCard label="Koodh.com" value={overview.koodh_domains} icon={Globe} color="text-blue-400" />
            <StatCard label="Custom Domein" value={overview.custom_domains} icon={ExternalLink} color="text-purple-400" />
            <StatCard label="Geverifieerd" value={overview.verified} icon={CheckCircle} color="text-green-400" />
          </div>

          {overview.unconfigured > 0 && (
            <Card className="bg-amber-950/20 border-amber-900/40">
              <CardContent className="p-4 flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
                <div>
                  <p className="text-sm text-amber-300 font-medium">
                    {overview.unconfigured} site{overview.unconfigured !== 1 ? 's' : ''} zonder domeinconfiguratie
                  </p>
                  <p className="text-xs text-amber-400/70">
                    Ga naar "Site Domeinen" om domeinen toe te wijzen
                  </p>
                </div>
                <Button size="sm" variant="outline" className="ml-auto border-amber-700 text-amber-400 hover:bg-amber-950" onClick={() => setActiveTab('sites')}>
                  Configureren
                </Button>
              </CardContent>
            </Card>
          )}

          {!overview.cloudflare_configured && (
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="p-4 flex items-center gap-3">
                <Shield className="w-5 h-5 text-zinc-500 flex-shrink-0" />
                <div>
                  <p className="text-sm text-zinc-300 font-medium">Cloudflare API niet geconfigureerd</p>
                  <p className="text-xs text-zinc-500">Configureer je Cloudflare API-token om DNS automatisch te beheren</p>
                </div>
                <Button size="sm" variant="outline" className="ml-auto" onClick={() => setActiveTab('cloudflare')}>
                  Instellen
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Active Subdomain Routes */}
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-zinc-400 flex items-center gap-2">
                <ArrowRight className="w-4 h-4" />
                Actieve Subdomain Routes
              </CardTitle>
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
                {routes.filter(r => r.is_active).length === 0 && (
                  <p className="text-sm text-zinc-500 text-center py-4">Geen actieve routes</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ═══════ SITE DOMAINS TAB ═══════ */}
      {activeTab === 'sites' && (
        <div className="space-y-4">
          {/* Configured sites */}
          {configs.length > 0 && (
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-emerald-400 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  Geconfigureerde Domeinen ({configs.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {configs.map(config => {
                  const verStatus = STATUS_CONFIGS[config.verification_status] || STATUS_CONFIGS.pending;
                  const VerIcon = verStatus.icon;
                  return (
                    <div key={config.id} className="bg-zinc-800/50 rounded-lg px-4 py-3" data-testid={`domain-config-${config.main_site_id}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className={`px-2 py-0.5 rounded text-xs ${SITE_TYPE_COLORS[config.site_type] || 'bg-zinc-700 text-zinc-300'}`}>
                            {SITE_TYPE_LABELS[config.site_type] || config.site_type}
                          </span>
                          <span className="text-sm text-zinc-200 font-medium">{config.site_name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="ghost" onClick={() => openDomainConfig({ id: config.main_site_id, slug: config.site_slug, name: config.site_name })} className="h-7 w-7 p-0">
                            <Edit className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setDeleteDialog({ open: true, type: 'domain', id: config.main_site_id, name: config.site_name })} className="h-7 w-7 p-0 text-red-400 hover:text-red-300">
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center gap-4 text-xs">
                        <div className="flex items-center gap-1.5">
                          {config.domain_type === 'koodh' ? (
                            <Globe className="w-3 h-3 text-blue-400" />
                          ) : (
                            <ExternalLink className="w-3 h-3 text-purple-400" />
                          )}
                          <span className="font-mono text-zinc-300">{config.full_domain || `${config.subdomain}.${baseDomain}`}</span>
                        </div>
                        <div className={`flex items-center gap-1 ${verStatus.color}`}>
                          <VerIcon className="w-3 h-3" />
                          <span>{verStatus.label}</span>
                        </div>
                        {config.ssl_enabled && (
                          <div className="flex items-center gap-1 text-emerald-400">
                            <Lock className="w-3 h-3" />
                            <span>SSL</span>
                          </div>
                        )}
                        {config.domain_type === 'custom' && config.verification_status !== 'verified' && (
                          <Button
                            size="sm" variant="outline"
                            className="h-6 text-[10px] px-2"
                            onClick={() => verifyDomain(config.main_site_id)}
                            disabled={verifying === config.main_site_id}
                            data-testid={`verify-domain-${config.main_site_id}`}
                          >
                            {verifying === config.main_site_id ? (
                              <Loader2 className="w-3 h-3 animate-spin mr-1" />
                            ) : (
                              <RefreshCw className="w-3 h-3 mr-1" />
                            )}
                            Verifieer
                          </Button>
                        )}
                      </div>
                      {config.domain_type === 'custom' && config.verification_status !== 'verified' && config.verification_token && (
                        <div className="mt-2 p-2 bg-zinc-950 rounded border border-zinc-800">
                          <p className="text-[10px] text-zinc-500 uppercase mb-1">CNAME Verificatie Record</p>
                          <div className="flex items-center gap-2">
                            <code className="text-xs text-amber-400 font-mono flex-1">
                              _clara-verify.{config.custom_domain} CNAME verify.{baseDomain}
                            </code>
                            <button
                              onClick={() => copyToClipboard(`_clara-verify.${config.custom_domain} CNAME verify.${baseDomain}`)}
                              className="text-zinc-500 hover:text-zinc-300"
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* Unconfigured sites */}
          {unconfiguredSites.length > 0 && (
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-amber-400 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Zonder Domeinconfiguratie ({unconfiguredSites.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {unconfiguredSites.map(site => (
                  <div key={site.id} className="flex items-center justify-between bg-zinc-800/50 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-xs ${SITE_TYPE_COLORS[site.site_type] || 'bg-zinc-700 text-zinc-300'}`}>
                        {SITE_TYPE_LABELS[site.site_type] || site.site_type}
                      </span>
                      <span className="text-sm text-zinc-200">{site.name}</span>
                      <span className="text-xs text-zinc-600 font-mono">/{site.slug}</span>
                    </div>
                    <Button
                      size="sm" variant="outline"
                      onClick={() => openDomainConfig(site)}
                      className="h-7 text-xs"
                      data-testid={`configure-domain-${site.slug}`}
                    >
                      <Link2 className="w-3 h-3 mr-1" />
                      Domein instellen
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ═══════ ROUTING TAB ═══════ */}
      {activeTab === 'routing' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-zinc-400">
                Configureer welk subdomein naar welk deel van Clara leidt.
                Zoals bij Microsoft: login via een apart subdomein, beheer via een ander.
              </p>
            </div>
            <Button onClick={openCreateRoute} size="sm" data-testid="create-route-btn">
              <Plus className="w-4 h-4 mr-1" /> Nieuwe Route
            </Button>
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
                          <span className="text-sm font-mono text-white font-medium">
                            {route.subdomain}.{baseDomain}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[10px] border ${ROUTE_TYPE_COLORS[route.route_type] || 'bg-zinc-700 text-zinc-300 border-zinc-600'}`}>
                            {ROUTE_TYPE_LABELS[route.route_type] || route.route_type}
                          </span>
                          {route.is_system && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-500">Systeem</span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-500 mt-0.5">{route.label} — {route.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right mr-2">
                        <div className="flex items-center gap-1 text-xs text-zinc-400">
                          <ArrowRight className="w-3 h-3" />
                          <span className="font-mono">{route.target_path}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => toggleRouteActive(route)}
                        className={`relative w-10 h-5 rounded-full transition-colors ${route.is_active ? 'bg-emerald-600' : 'bg-zinc-700'}`}
                        data-testid={`toggle-route-${route.subdomain}`}
                      >
                        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${route.is_active ? 'translate-x-5' : 'translate-x-0.5'}`} />
                      </button>
                      <Button size="sm" variant="ghost" onClick={() => openEditRoute(route)} className="h-7 w-7 p-0" data-testid={`edit-route-${route.subdomain}`}>
                        <Edit className="w-3.5 h-3.5" />
                      </Button>
                      {!route.is_system && (
                        <Button size="sm" variant="ghost" onClick={() => setDeleteDialog({ open: true, type: 'route', id: route.id, name: `${route.subdomain}.${baseDomain}` })} className="h-7 w-7 p-0 text-red-400 hover:text-red-300" data-testid={`delete-route-${route.subdomain}`}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {routes.length === 0 && (
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <ArrowRight className="w-12 h-12 text-zinc-600 mb-3" />
                <p className="text-zinc-400 text-sm">Nog geen subdomain routes geconfigureerd</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ═══════ CLOUDFLARE TAB ═══════ */}
      {activeTab === 'cloudflare' && (
        <div className="space-y-4">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="w-5 h-5 text-orange-400" />
                Cloudflare Configuratie
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-zinc-400">
                Verbind je Cloudflare account om automatisch DNS records en SSL certificaten te beheren voor alle Clara domeinen.
              </p>

              <div className="bg-zinc-800/50 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${cfConfig?.configured ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                    <span className="text-sm text-zinc-200">API Status</span>
                  </div>
                  <span className={`text-xs ${cfConfig?.configured ? 'text-emerald-400' : 'text-zinc-500'}`}>
                    {cfConfig?.configured ? 'Verbonden' : 'Niet geconfigureerd'}
                  </span>
                </div>

                {cfConfig?.api_token_set && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-500">API Token</span>
                    <span className="text-xs text-zinc-400 font-mono">{cfConfig.api_token_preview}</span>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500">Zone ID</span>
                  <span className="text-xs text-zinc-400 font-mono">{cfConfig?.zone_id || '—'}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500">Base Domain</span>
                  <span className="text-xs text-zinc-400 font-mono">{cfConfig?.base_domain || 'koodh.com'}</span>
                </div>

                {cfConfig?.updated_at && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-500">Laatst bijgewerkt</span>
                    <span className="text-xs text-zinc-400">
                      {new Date(cfConfig.updated_at).toLocaleDateString('nl-BE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      {cfConfig.updated_by && ` door ${cfConfig.updated_by}`}
                    </span>
                  </div>
                )}
              </div>

              <Button onClick={openCfConfig} className="w-full" data-testid="configure-cloudflare-btn">
                <Settings className="w-4 h-4 mr-2" />
                {cfConfig?.configured ? 'Configuratie wijzigen' : 'Cloudflare configureren'}
              </Button>

              <div className="border-t border-zinc-800 pt-4">
                <p className="text-xs text-zinc-500 mb-2">Je hebt het volgende nodig van Cloudflare:</p>
                <div className="space-y-1.5">
                  <div className="flex items-start gap-2 text-xs">
                    <span className="text-zinc-600">1.</span>
                    <span className="text-zinc-400">
                      <strong className="text-zinc-300">API Token</strong> — Maak een token aan via{' '}
                      <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noopener noreferrer" className="text-orange-400 hover:underline">
                        Cloudflare Dashboard &rarr; API Tokens
                      </a>{' '}
                      met "Zone:DNS:Edit" rechten
                    </span>
                  </div>
                  <div className="flex items-start gap-2 text-xs">
                    <span className="text-zinc-600">2.</span>
                    <span className="text-zinc-400">
                      <strong className="text-zinc-300">Zone ID</strong> — Te vinden op de overzichtspagina van je domein in Cloudflare (rechterkolom)
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ═══════ DOMAIN CONFIG DIALOG ═══════ */}
      <Dialog open={domainDialog} onOpenChange={setDomainDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-700 max-w-md">
          <DialogHeader>
            <DialogTitle>Domein instellen — {editingSite?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="mb-2 block">Type domein</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setDomainForm(p => ({ ...p, domain_type: 'koodh' }))}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-colors ${
                    domainForm.domain_type === 'koodh'
                      ? 'bg-blue-600/15 border-blue-500/40 text-blue-400'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'
                  }`}
                  data-testid="domain-type-koodh"
                >
                  <Globe className="w-5 h-5" />
                  <span className="text-sm font-medium">Koodh.com</span>
                  <span className="text-[10px] opacity-70">*.koodh.com</span>
                </button>
                <button
                  onClick={() => setDomainForm(p => ({ ...p, domain_type: 'custom' }))}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-colors ${
                    domainForm.domain_type === 'custom'
                      ? 'bg-purple-600/15 border-purple-500/40 text-purple-400'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'
                  }`}
                  data-testid="domain-type-custom"
                >
                  <ExternalLink className="w-5 h-5" />
                  <span className="text-sm font-medium">Eigen domein</span>
                  <span className="text-[10px] opacity-70">jouwdomein.com</span>
                </button>
              </div>
            </div>

            {domainForm.domain_type === 'koodh' && (
              <div>
                <Label>Subdomain</Label>
                <div className="flex items-center gap-1 mt-1">
                  <Input
                    value={domainForm.subdomain}
                    onChange={e => setDomainForm(p => ({ ...p, subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
                    placeholder="sitenaam"
                    className="font-mono"
                    data-testid="domain-subdomain-input"
                  />
                  <span className="text-sm text-zinc-500 whitespace-nowrap">.{baseDomain}</span>
                </div>
                <p className="text-xs text-zinc-500 mt-1">
                  Resultaat: <span className="font-mono text-zinc-400">{domainForm.subdomain || 'sitenaam'}.{baseDomain}</span>
                </p>
              </div>
            )}

            {domainForm.domain_type === 'custom' && (
              <div>
                <Label>Domein</Label>
                <Input
                  value={domainForm.custom_domain}
                  onChange={e => setDomainForm(p => ({ ...p, custom_domain: e.target.value.toLowerCase().trim() }))}
                  placeholder="radio.jouwdomein.com"
                  className="font-mono mt-1"
                  data-testid="domain-custom-input"
                />
                <div className="mt-3 p-3 bg-zinc-950 rounded-lg border border-zinc-800">
                  <p className="text-xs text-zinc-400 mb-2">
                    Na het opslaan moet je twee CNAME records toevoegen bij je DNS provider:
                  </p>
                  <div className="space-y-1.5 text-xs font-mono">
                    <div className="flex items-center gap-2 text-amber-400">
                      <span className="text-zinc-600">1.</span>
                      {domainForm.custom_domain || 'jouwdomein.com'} &rarr; clara.{baseDomain}
                    </div>
                    <div className="flex items-center gap-2 text-amber-400">
                      <span className="text-zinc-600">2.</span>
                      _clara-verify.{domainForm.custom_domain || 'jouwdomein.com'} &rarr; verify.{baseDomain}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDomainDialog(false)}>Annuleren</Button>
            <Button
              onClick={saveDomainConfig}
              disabled={
                (domainForm.domain_type === 'koodh' && !domainForm.subdomain) ||
                (domainForm.domain_type === 'custom' && !domainForm.custom_domain)
              }
              data-testid="save-domain-config-btn"
            >
              Opslaan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════ ROUTE DIALOG ═══════ */}
      <Dialog open={routeDialog} onOpenChange={setRouteDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-700 max-w-md">
          <DialogHeader>
            <DialogTitle>{editingRoute ? 'Route bewerken' : 'Nieuwe Route'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Subdomain</Label>
              <div className="flex items-center gap-1 mt-1">
                <Input
                  value={routeForm.subdomain}
                  onChange={e => setRouteForm(p => ({ ...p, subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
                  placeholder="login"
                  className="font-mono"
                  disabled={!!editingRoute?.is_system}
                  data-testid="route-subdomain-input"
                />
                <span className="text-sm text-zinc-500 whitespace-nowrap">.{baseDomain}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Label</Label>
                <Input value={routeForm.label} onChange={e => setRouteForm(p => ({ ...p, label: e.target.value }))} placeholder="Login Portal" data-testid="route-label-input" />
              </div>
              <div>
                <Label>Type</Label>
                <select
                  className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 mt-1"
                  value={routeForm.route_type}
                  onChange={e => setRouteForm(p => ({ ...p, route_type: e.target.value }))}
                  data-testid="route-type-select"
                >
                  <option value="auth">Authenticatie</option>
                  <option value="network">Network Management</option>
                  <option value="firewall">Firewall</option>
                  <option value="app">Applicatie</option>
                </select>
              </div>
            </div>
            <div>
              <Label>Beschrijving</Label>
              <Input value={routeForm.description} onChange={e => setRouteForm(p => ({ ...p, description: e.target.value }))} placeholder="Waar leidt dit subdomein naartoe?" />
            </div>
            <div>
              <Label>Doel pad</Label>
              <Input
                value={routeForm.target_path}
                onChange={e => setRouteForm(p => ({ ...p, target_path: e.target.value }))}
                placeholder="/login"
                className="font-mono"
                data-testid="route-target-input"
              />
              <p className="text-xs text-zinc-500 mt-1">Het pad in Clara waar dit subdomein naar verwijst</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRouteDialog(false)}>Annuleren</Button>
            <Button
              onClick={saveRoute}
              disabled={!routeForm.subdomain || !routeForm.label}
              data-testid="save-route-btn"
            >
              {editingRoute ? 'Bijwerken' : 'Aanmaken'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════ CLOUDFLARE CONFIG DIALOG ═══════ */}
      <Dialog open={cfDialog} onOpenChange={setCfDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-700 max-w-md">
          <DialogHeader>
            <DialogTitle>Cloudflare Configuratie</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>API Token</Label>
              <div className="relative mt-1">
                <Input
                  type={showToken ? 'text' : 'password'}
                  value={cfForm.api_token}
                  onChange={e => setCfForm(p => ({ ...p, api_token: e.target.value }))}
                  placeholder={cfConfig?.api_token_set ? 'Laat leeg om huidige token te behouden' : 'Cloudflare API Token'}
                  className="pr-10 font-mono"
                  data-testid="cf-api-token-input"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                >
                  {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <Label>Zone ID</Label>
              <Input
                value={cfForm.zone_id}
                onChange={e => setCfForm(p => ({ ...p, zone_id: e.target.value }))}
                placeholder="Cloudflare Zone ID voor koodh.com"
                className="font-mono mt-1"
                data-testid="cf-zone-id-input"
              />
            </div>
            <div>
              <Label>Base Domain</Label>
              <Input
                value={cfForm.base_domain}
                onChange={e => setCfForm(p => ({ ...p, base_domain: e.target.value }))}
                placeholder="koodh.com"
                className="font-mono mt-1"
                data-testid="cf-base-domain-input"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCfDialog(false)}>Annuleren</Button>
            <Button onClick={saveCfConfig} data-testid="save-cf-config-btn">
              Opslaan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════ DELETE DIALOG ═══════ */}
      <AlertDialog open={deleteDialog.open} onOpenChange={open => !open && setDeleteDialog(prev => ({ ...prev, open: false }))}>
        <AlertDialogContent className="bg-zinc-900 border-zinc-700">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteDialog.type === 'domain' ? 'Domeinconfiguratie verwijderen?' : 'Route verwijderen?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteDialog.type === 'domain'
                ? `Dit verwijdert de domeinconfiguratie voor "${deleteDialog.name}".`
                : `Dit verwijdert de route "${deleteDialog.name}".`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteDialog.type === 'domain' ? removeDomainConfig : deleteRoute}
              className="bg-red-600 hover:bg-red-700"
            >
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatCard({ label, value, total, icon: Icon, color }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-xs text-zinc-500">{label}</span>
      </div>
      <p className="text-2xl font-bold text-zinc-100">
        {value}
        {total !== undefined && <span className="text-sm text-zinc-500 font-normal">/{total}</span>}
      </p>
    </div>
  );
}
