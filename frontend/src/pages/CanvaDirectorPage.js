import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useMainSite } from '../context/MainSiteContext';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import {
  Settings, Link2, Unlink, Palette, Download, Plus, RefreshCw,
  ExternalLink, Image, FileText, Video, Clock, User, Search,
  Loader2, CheckCircle, XCircle, AlertTriangle
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const CanvaDirectorPage = () => {
  const { token } = useAuth();
  const { mainSite, isAdmin } = useMainSite();
  const [activeTab, setActiveTab] = useState('designs');
  const [config, setConfig] = useState({ configured: false, client_id: '', client_secret: '' });
  const [authStatus, setAuthStatus] = useState({ connected: false });
  const [designs, setDesigns] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Config form
  const [configForm, setConfigForm] = useState({ client_id: '', client_secret: '', redirect_uri: '' });
  const [savingConfig, setSavingConfig] = useState(false);

  // Create design form
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ title: '', width: 1080, height: 1080 });
  const [creating, setCreating] = useState(false);

  // Export
  const [exporting, setExporting] = useState(null);

  // Include X-Main-Site-ID header for backend to identify the main site context
  const headers = mainSite ? { 
    Authorization: `Bearer ${token}`, 
    'Content-Type': 'application/json',
    'X-Main-Site-ID': mainSite.id 
  } : { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const fetchConfig = useCallback(async () => {
    if (!mainSite?.id) return;
    try {
      const res = await fetch(`${API}/canva/config`, { headers });
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
        setConfigForm({ client_id: data.client_id || '', client_secret: '', redirect_uri: data.redirect_uri || '' });
      }
    } catch { /* ignore */ }
  }, [token, mainSite?.id]);

  const fetchAuthStatus = useCallback(async () => {
    if (!mainSite?.id) return;
    try {
      const res = await fetch(`${API}/canva/auth/status`, { headers });
      if (res.ok) setAuthStatus(await res.json());
    } catch { /* ignore */ }
  }, [token, mainSite?.id]);

  const fetchDesigns = useCallback(async () => {
    if (!mainSite?.id) return;
    try {
      const params = searchQuery ? `?query=${encodeURIComponent(searchQuery)}` : '';
      const res = await fetch(`${API}/canva/designs${params}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setDesigns(data.items || []);
      }
    } catch { /* ignore */ }
  }, [token, searchQuery, mainSite?.id]);

  const fetchActivity = useCallback(async () => {
    if (!mainSite?.id) return;
    try {
      const res = await fetch(`${API}/canva/activity`, { headers });
      if (res.ok) setActivity(await res.json());
    } catch { /* ignore */ }
  }, [token, mainSite?.id]);

  useEffect(() => {
    const load = async () => {
      if (!mainSite) return; // Wait for mainSite context
      setLoading(true);
      await fetchConfig();
      await fetchAuthStatus();
      setLoading(false);
    };
    load();
  }, [fetchConfig, fetchAuthStatus, mainSite]);

  useEffect(() => {
    if (authStatus.connected && activeTab === 'designs') fetchDesigns();
    if (activeTab === 'activity') fetchActivity();
  }, [authStatus.connected, activeTab, fetchDesigns, fetchActivity]);

  // Listen for OAuth callback
  useEffect(() => {
    const handler = (e) => {
      if (e.data?.type === 'canva-auth-success') {
        toast.success('Canva account connected!');
        fetchAuthStatus();
        fetchDesigns();
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [fetchAuthStatus, fetchDesigns]);

  const saveConfig = async () => {
    if (!configForm.client_id) return toast.error('Client ID is required');
    if (!configForm.client_secret && !config.configured) return toast.error('Client Secret is required');
    setSavingConfig(true);
    try {
      const body = {
        client_id: configForm.client_id,
        client_secret: configForm.client_secret || config.client_secret?.replace('****', ''),
        redirect_uri: configForm.redirect_uri,
      };
      const res = await fetch(`${API}/canva/config`, { method: 'PUT', headers, body: JSON.stringify(body) });
      if (res.ok) {
        toast.success('Configuration saved');
        fetchConfig();
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Failed to save');
      }
    } catch {
      toast.error('Failed to save configuration');
    }
    setSavingConfig(false);
  };

  const connectCanva = async () => {
    try {
      const res = await fetch(`${API}/canva/auth/url`, { headers });
      if (res.ok) {
        const { url } = await res.json();
        window.open(url, 'canva-auth', 'width=600,height=700,popup=yes');
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Failed to get auth URL');
      }
    } catch {
      toast.error('Failed to connect');
    }
  };

  const disconnectCanva = async () => {
    try {
      await fetch(`${API}/canva/auth/disconnect`, { method: 'DELETE', headers });
      setAuthStatus({ connected: false });
      setDesigns([]);
      toast.success('Canva account disconnected');
    } catch {
      toast.error('Failed to disconnect');
    }
  };

  const createDesign = async () => {
    if (!createForm.title) return toast.error('Title is required');
    setCreating(true);
    try {
      const res = await fetch(`${API}/canva/designs`, {
        method: 'POST', headers,
        body: JSON.stringify({
          title: createForm.title,
          width: createForm.width,
          height: createForm.height,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        toast.success('Design created!');
        setCreateOpen(false);
        setCreateForm({ title: '', width: 1080, height: 1080 });
        fetchDesigns();
        // Open in Canva
        const editUrl = data.design?.urls?.edit_url;
        if (editUrl) window.open(editUrl, '_blank');
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Failed to create design');
      }
    } catch {
      toast.error('Failed to create design');
    }
    setCreating(false);
  };

  const exportDesign = async (designId, format = 'png') => {
    setExporting(designId);
    try {
      const res = await fetch(`${API}/canva/designs/export`, {
        method: 'POST', headers,
        body: JSON.stringify({ design_id: designId, format }),
      });
      if (res.ok) {
        const data = await res.json();
        toast.success('Export started! Check back shortly.');
        // Poll for export status
        if (data.job?.id) {
          pollExport(data.job.id);
        }
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Export failed');
      }
    } catch {
      toast.error('Export failed');
    }
    setExporting(null);
  };

  const pollExport = async (exportId) => {
    let attempts = 0;
    const poll = async () => {
      attempts++;
      try {
        const res = await fetch(`${API}/canva/exports/${exportId}`, { headers });
        if (res.ok) {
          const data = await res.json();
          if (data.job?.status === 'success' && data.job?.urls?.[0]) {
            toast.success('Export ready!');
            window.open(data.job.urls[0], '_blank');
            return;
          }
          if (data.job?.status === 'failed') {
            toast.error('Export failed');
            return;
          }
        }
      } catch { /* ignore */ }
      if (attempts < 10) setTimeout(poll, 3000);
      else toast.error('Export timed out');
    };
    setTimeout(poll, 3000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
      </div>
    );
  }

  const TABS = [
    { id: 'designs', label: 'Designs', icon: Palette },
    { id: 'activity', label: 'Activity', icon: Clock },
    ...(isAdmin ? [{ id: 'config', label: 'Configuration', icon: Settings }] : []),
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6" data-testid="canva-director">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Canva Director</h1>
          <p className="text-sm text-zinc-400 mt-1">Design, create and export directly from Canva</p>
        </div>
        <div className="flex items-center gap-2">
          {authStatus.connected ? (
            <>
              <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                <CheckCircle className="w-3.5 h-3.5" />
                Connected
              </span>
              <Button size="sm" variant="outline" className="border-zinc-700 text-zinc-400 gap-1.5" onClick={disconnectCanva}>
                <Unlink className="w-3.5 h-3.5" />
                Disconnect
              </Button>
            </>
          ) : config.configured ? (
            <Button size="sm" className="bg-[#7d2ae8] hover:bg-[#6b21c8] text-white gap-1.5" onClick={connectCanva}>
              <Link2 className="w-3.5 h-3.5" />
              Connect Canva
            </Button>
          ) : null}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-zinc-800 pb-2">
        {TABS.map(tab => (
          <button
            key={tab.id}
            data-testid={`canva-tab-${tab.id}`}
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

      {/* Not configured state */}
      {!config.configured && activeTab !== 'config' && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertTriangle className="w-12 h-12 text-amber-500 mb-4" />
            <p className="text-white font-medium mb-2">Canva not configured</p>
            <p className="text-zinc-400 text-sm mb-4">An admin needs to configure the Canva API credentials first.</p>
            {isAdmin && (
              <Button size="sm" onClick={() => setActiveTab('config')} className="bg-orange-500 hover:bg-orange-600 text-white gap-1.5">
                <Settings className="w-4 h-4" />
                Configure Now
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Not connected state */}
      {config.configured && !authStatus.connected && activeTab === 'designs' && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Palette className="w-12 h-12 text-[#7d2ae8] mb-4" />
            <p className="text-white font-medium mb-2">Connect your Canva account</p>
            <p className="text-zinc-400 text-sm mb-4">Authorize Clara to access your Canva designs and assets.</p>
            <Button size="sm" className="bg-[#7d2ae8] hover:bg-[#6b21c8] text-white gap-1.5" onClick={connectCanva}>
              <Link2 className="w-4 h-4" />
              Connect Canva
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Designs Tab */}
      {activeTab === 'designs' && config.configured && authStatus.connected && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <Input
                placeholder="Search designs..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && fetchDesigns()}
                className="pl-10 bg-zinc-900 border-zinc-700 text-white"
                data-testid="canva-search"
              />
            </div>
            <Button size="sm" variant="outline" className="border-zinc-700 text-zinc-400" onClick={fetchDesigns}>
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button size="sm" className="bg-orange-500 hover:bg-orange-600 text-white gap-1.5" onClick={() => setCreateOpen(true)} data-testid="canva-create-btn">
              <Plus className="w-4 h-4" />
              New Design
            </Button>
          </div>

          {/* Create Design Form */}
          {createOpen && (
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="p-4 space-y-3">
                <h3 className="text-sm font-medium text-white">Create New Design</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-zinc-400 text-xs">Title</Label>
                    <Input
                      value={createForm.title}
                      onChange={e => setCreateForm(p => ({ ...p, title: e.target.value }))}
                      placeholder="My Design"
                      className="bg-zinc-800 border-zinc-700 text-white mt-1"
                      data-testid="canva-design-title"
                    />
                  </div>
                  <div>
                    <Label className="text-zinc-400 text-xs">Width (px)</Label>
                    <Input
                      type="number"
                      value={createForm.width}
                      onChange={e => setCreateForm(p => ({ ...p, width: parseInt(e.target.value) || 0 }))}
                      className="bg-zinc-800 border-zinc-700 text-white mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-zinc-400 text-xs">Height (px)</Label>
                    <Input
                      type="number"
                      value={createForm.height}
                      onChange={e => setCreateForm(p => ({ ...p, height: parseInt(e.target.value) || 0 }))}
                      className="bg-zinc-800 border-zinc-700 text-white mt-1"
                    />
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button size="sm" variant="outline" className="border-zinc-700 text-zinc-400" onClick={() => setCreateOpen(false)}>Cancel</Button>
                  <Button size="sm" className="bg-orange-500 hover:bg-orange-600 text-white gap-1.5" onClick={createDesign} disabled={creating} data-testid="canva-create-submit">
                    {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Create
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Designs Grid */}
          {designs.length === 0 ? (
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Palette className="w-12 h-12 text-zinc-600 mb-3" />
                <p className="text-zinc-400 text-sm">No designs found</p>
                <p className="text-zinc-500 text-xs mt-1">Create a new design or search for existing ones</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {designs.map(design => {
                const d = design.design || design;
                const thumbnail = d.thumbnail?.url || d.urls?.thumbnail_url;
                const editUrl = d.urls?.edit_url;
                const viewUrl = d.urls?.view_url;
                return (
                  <Card key={d.id} className="bg-zinc-900 border-zinc-800 overflow-hidden group" data-testid={`canva-design-${d.id}`}>
                    <div className="aspect-video bg-zinc-800 relative overflow-hidden">
                      {thumbnail ? (
                        <img src={thumbnail} alt={d.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="flex items-center justify-center h-full">
                          <Image className="w-8 h-8 text-zinc-600" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        {editUrl && (
                          <Button size="sm" className="bg-[#7d2ae8] hover:bg-[#6b21c8] text-white gap-1" onClick={() => window.open(editUrl, '_blank')}>
                            <ExternalLink className="w-3.5 h-3.5" />
                            Edit
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-zinc-600 text-white gap-1"
                          onClick={() => exportDesign(d.id)}
                          disabled={exporting === d.id}
                        >
                          {exporting === d.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                          Export
                        </Button>
                      </div>
                    </div>
                    <CardContent className="p-3">
                      <p className="text-sm font-medium text-white truncate">{d.title || 'Untitled'}</p>
                      <p className="text-xs text-zinc-500 mt-1">
                        {d.created_at ? new Date(d.created_at * 1000).toLocaleDateString('nl-BE') : ''}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Activity Tab */}
      {activeTab === 'activity' && (
        <div className="space-y-3">
          {activity.length === 0 ? (
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Clock className="w-12 h-12 text-zinc-600 mb-3" />
                <p className="text-zinc-400 text-sm">No activity yet</p>
              </CardContent>
            </Card>
          ) : (
            activity.map((act, i) => (
              <Card key={i} className="bg-zinc-900 border-zinc-800">
                <CardContent className="p-3 flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${act.action === 'create_design' ? 'bg-emerald-500/15' : 'bg-blue-500/15'}`}>
                    {act.action === 'create_design' ? (
                      <Plus className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Download className="w-4 h-4 text-blue-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white">
                      <span className="font-medium">{act.user_name}</span>
                      {' '}
                      {act.action === 'create_design' ? 'created' : 'exported'}
                      {' '}
                      <span className="text-zinc-400">{act.design_title || act.design_id}</span>
                    </p>
                    <p className="text-xs text-zinc-500">
                      {new Date(act.created_at).toLocaleString('nl-BE')}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Config Tab */}
      {activeTab === 'config' && isAdmin && (
        <div className="space-y-6 max-w-xl">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-[#7d2ae8]/20 rounded-lg">
                  <Palette className="w-5 h-5 text-[#7d2ae8]" />
                </div>
                <div>
                  <h3 className="text-white font-medium">Canva API Configuration</h3>
                  <p className="text-xs text-zinc-500">
                    Get your credentials from{' '}
                    <a href="https://www.canva.com/developers/" target="_blank" rel="noreferrer" className="text-[#7d2ae8] hover:underline">
                      canva.com/developers
                    </a>
                  </p>
                </div>
              </div>

              <div>
                <Label className="text-zinc-400 text-xs">Client ID</Label>
                <Input
                  value={configForm.client_id}
                  onChange={e => setConfigForm(p => ({ ...p, client_id: e.target.value }))}
                  placeholder="OC-AZ..."
                  className="bg-zinc-800 border-zinc-700 text-white mt-1 font-mono text-sm"
                  data-testid="canva-client-id"
                />
              </div>

              <div>
                <Label className="text-zinc-400 text-xs">Client Secret</Label>
                <Input
                  type="password"
                  value={configForm.client_secret}
                  onChange={e => setConfigForm(p => ({ ...p, client_secret: e.target.value }))}
                  placeholder={config.configured ? '••••••••' : 'Enter client secret'}
                  className="bg-zinc-800 border-zinc-700 text-white mt-1 font-mono text-sm"
                  data-testid="canva-client-secret"
                />
              </div>

              <div>
                <Label className="text-zinc-400 text-xs">Redirect URI (optional)</Label>
                <Input
                  value={configForm.redirect_uri}
                  onChange={e => setConfigForm(p => ({ ...p, redirect_uri: e.target.value }))}
                  placeholder="Auto-detected if empty"
                  className="bg-zinc-800 border-zinc-700 text-white mt-1 font-mono text-sm"
                  data-testid="canva-redirect-uri"
                />
                <p className="text-[11px] text-zinc-600 mt-1">Set this in your Canva Developer Portal as the callback URL</p>
              </div>

              <Button
                className="bg-orange-500 hover:bg-orange-600 text-white w-full gap-2"
                onClick={saveConfig}
                disabled={savingConfig}
                data-testid="canva-save-config"
              >
                {savingConfig ? <Loader2 className="w-4 h-4 animate-spin" /> : <Settings className="w-4 h-4" />}
                Save Configuration
              </Button>

              {config.configured && (
                <div className="flex items-center gap-2 pt-2 border-t border-zinc-800">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs text-emerald-400">Canva API configured</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default CanvaDirectorPage;
