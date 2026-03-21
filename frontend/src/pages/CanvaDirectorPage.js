import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useMainSite } from '../context/MainSiteContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { toast } from 'sonner';
import {
  Settings, Link2, Unlink, Palette, Download, Plus, RefreshCw,
  ExternalLink, Image, Clock, Search, Save, Eye, EyeOff,
  Loader2, CheckCircle, AlertCircle
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

  // Config panel (collapsible, like ZeroTier)
  const [configOpen, setConfigOpen] = useState(false);
  const [configForm, setConfigForm] = useState({ client_id: '', client_secret: '', redirect_uri: '', linked_main_site_ids: [] });
  const [savingConfig, setSavingConfig] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [allMainSites, setAllMainSites] = useState([]);

  // Create design
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ title: '', width: 1080, height: 1080 });
  const [creating, setCreating] = useState(false);

  // Export
  const [exporting, setExporting] = useState(null);

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
        setConfigForm({
          client_id: data.client_id || '',
          client_secret: '',
          redirect_uri: data.redirect_uri || '',
          linked_main_site_ids: data.linked_main_site_ids || [],
        });
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
  }, [token, mainSite?.id, searchQuery]);

  const fetchActivity = useCallback(async () => {
    if (!mainSite?.id) return;
    try {
      const res = await fetch(`${API}/canva/activity`, { headers });
      if (res.ok) setActivity(await res.json());
    } catch { /* ignore */ }
  }, [token, mainSite?.id]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await fetchConfig();
      await fetchAuthStatus();
      // Fetch all main sites for linking
      try {
        const res = await fetch(`${API}/main-sites`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const sites = await res.json();
          setAllMainSites(sites.filter(s => s.site_type !== 'server' && s.site_type !== 'task_scheduler'));
        }
      } catch { /* ignore */ }
      setLoading(false);
    };
    load();
  }, [fetchConfig, fetchAuthStatus]);

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

  const handleSaveConfig = async () => {
    if (!configForm.client_id) return toast.error('Client ID is required');
    if (!configForm.client_secret && !config.configured) return toast.error('Client Secret is required');
    setSavingConfig(true);
    try {
      const body = {
        client_id: configForm.client_id,
        client_secret: configForm.client_secret || config.client_secret?.replace('****', ''),
        redirect_uri: configForm.redirect_uri,
        linked_main_site_ids: configForm.linked_main_site_ids,
      };
      const res = await fetch(`${API}/canva/config`, { method: 'PUT', headers, body: JSON.stringify(body) });
      if (res.ok) {
        toast.success('Configuration saved');
        setConfigOpen(false);
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
        body: JSON.stringify({ title: createForm.title, width: createForm.width, height: createForm.height }),
      });
      if (res.ok) {
        const data = await res.json();
        toast.success('Design created!');
        setCreateOpen(false);
        setCreateForm({ title: '', width: 1080, height: 1080 });
        fetchDesigns();
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
        if (data.job?.id) pollExport(data.job.id);
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
          if (data.job?.status === 'failed') { toast.error('Export failed'); return; }
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

  const isConfigured = config.configured;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6" data-testid="canva-director">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#7d2ae8]/20 rounded-xl">
            <Palette className="w-5 h-5 text-[#7d2ae8]" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Canva Director</h1>
            <p className="text-sm text-zinc-500">Design, create and export directly from Canva</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfigOpen(!configOpen)}
              className="border-zinc-700 text-zinc-300"
              data-testid="canva-config-btn"
            >
              <Settings className="w-4 h-4 mr-1" /> Config
            </Button>
          )}
          {isConfigured && authStatus.connected && (
            <>
              <Button size="sm" variant="outline" className="border-zinc-700 text-zinc-300" onClick={disconnectCanva}>
                <Unlink className="w-4 h-4 mr-1" /> Disconnect
              </Button>
              <Button size="sm" variant="outline" className="border-zinc-700 text-zinc-300" onClick={fetchDesigns}>
                <RefreshCw className="w-4 h-4 mr-1" /> Refresh
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      {isConfigured && (
        <div className="flex gap-1 bg-zinc-900 rounded-lg p-1 w-fit" data-testid="canva-tabs">
          <button
            onClick={() => setActiveTab('designs')}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'designs' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-300'
            }`}
            data-testid="canva-tab-designs"
          >
            <Palette className="w-3.5 h-3.5" /> Designs
          </button>
          <button
            onClick={() => setActiveTab('activity')}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'activity' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-300'
            }`}
            data-testid="canva-tab-activity"
          >
            <Clock className="w-3.5 h-3.5" /> Activity
          </button>
        </div>
      )}

      {/* Config Panel (collapsible, like ZeroTier) */}
      {configOpen && (
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-5 mb-6" data-testid="canva-config-panel">
          <h3 className="text-white font-medium mb-4">Canva API Configuration</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Client ID</label>
              <Input
                value={configForm.client_id}
                onChange={e => setConfigForm(p => ({ ...p, client_id: e.target.value }))}
                placeholder={config.client_id || 'OC-AZ...'}
                className="bg-zinc-800 border-zinc-700 text-white font-mono text-sm"
                data-testid="canva-client-id"
              />
              <p className="text-xs text-zinc-600 mt-1">
                Get from <a href="https://www.canva.com/developers/" target="_blank" rel="noreferrer" className="text-[#7d2ae8] hover:underline">canva.com/developers</a>
              </p>
            </div>
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Client Secret</label>
              <div className="flex gap-2">
                <Input
                  type={showSecret ? 'text' : 'password'}
                  value={configForm.client_secret}
                  onChange={e => setConfigForm(p => ({ ...p, client_secret: e.target.value }))}
                  placeholder={config.configured ? '••••••••' : 'Enter client secret'}
                  className="bg-zinc-800 border-zinc-700 text-white font-mono text-sm"
                  data-testid="canva-client-secret"
                />
                <Button variant="ghost" size="icon" onClick={() => setShowSecret(!showSecret)} className="text-zinc-400">
                  {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          </div>
          <div className="mb-4">
            <label className="text-sm text-zinc-400 mb-1 block">Redirect URI (optional)</label>
            <Input
              value={configForm.redirect_uri}
              onChange={e => setConfigForm(p => ({ ...p, redirect_uri: e.target.value }))}
              placeholder="Auto-detected if empty"
              className="bg-zinc-800 border-zinc-700 text-white font-mono text-sm max-w-md"
              data-testid="canva-redirect-uri"
            />
            <p className="text-xs text-zinc-600 mt-1">Set this in your Canva Developer Portal as the callback URL</p>
          </div>
          <div className="mb-4">
            <label className="text-sm text-zinc-400 mb-2 block">Linked Main Sites</label>
            <p className="text-xs text-zinc-600 mb-2">Select which main sites can use this Canva Director for social media posts after publishing.</p>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {allMainSites.map(site => {
                const isLinked = configForm.linked_main_site_ids.includes(site.id);
                return (
                  <label
                    key={site.id}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                      isLinked ? 'bg-[#7d2ae8]/15 border border-[#7d2ae8]/30' : 'bg-zinc-800/50 border border-zinc-800 hover:border-zinc-700'
                    }`}
                    data-testid={`canva-link-site-${site.id}`}
                  >
                    <input
                      type="checkbox"
                      checked={isLinked}
                      onChange={() => {
                        setConfigForm(p => ({
                          ...p,
                          linked_main_site_ids: isLinked
                            ? p.linked_main_site_ids.filter(id => id !== site.id)
                            : [...p.linked_main_site_ids, site.id]
                        }));
                      }}
                      className="accent-[#7d2ae8] w-4 h-4"
                    />
                    <span className="text-sm text-white">{site.name}</span>
                    <span className="text-[10px] text-zinc-500 ml-auto">{site.site_type === 'technical' ? 'Data Connection' : site.site_type === 'server' ? 'Virtual Datacenter' : site.site_type === 'task_scheduler' ? 'Tasks' : site.site_type === 'external_host' ? 'External Host' : 'Radio'}</span>
                  </label>
                );
              })}
              {allMainSites.length === 0 && (
                <p className="text-xs text-zinc-500 py-2">No main sites available</p>
              )}
            </div>
          </div>
          <Button
            onClick={handleSaveConfig}
            disabled={savingConfig}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
            data-testid="canva-save-config"
          >
            <Save className="w-4 h-4 mr-1" /> {savingConfig ? 'Saving...' : 'Save Configuration'}
          </Button>
        </div>
      )}

      {/* Not Configured State */}
      {!isConfigured && (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-12 text-center">
          <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h2 className="text-white text-lg font-semibold mb-2">Canva Not Configured</h2>
          <p className="text-zinc-400 mb-4">Enter your Client ID and Client Secret to start using Canva.</p>
          {isAdmin && (
            <Button onClick={() => setConfigOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="canva-configure-now-btn">
              <Settings className="w-4 h-4 mr-1" /> Configure Now
            </Button>
          )}
        </div>
      )}

      {/* Not Connected State */}
      {isConfigured && !authStatus.connected && activeTab === 'designs' && (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-12 text-center">
          <Palette className="w-12 h-12 text-[#7d2ae8] mx-auto mb-4" />
          <h2 className="text-white text-lg font-semibold mb-2">Connect your Canva account</h2>
          <p className="text-zinc-400 mb-4">Authorize Clara to access your Canva designs and assets.</p>
          <Button className="bg-[#7d2ae8] hover:bg-[#6b21c8] text-white" onClick={connectCanva} data-testid="canva-connect-btn">
            <Link2 className="w-4 h-4 mr-1" /> Connect Canva
          </Button>
          {authStatus.connected && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <span className="text-sm text-emerald-400">Connected</span>
            </div>
          )}
        </div>
      )}

      {/* Designs Tab */}
      {activeTab === 'designs' && isConfigured && authStatus.connected && (
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
            <Button size="sm" className="bg-orange-500 hover:bg-orange-600 text-white" onClick={() => setCreateOpen(true)} data-testid="canva-create-btn">
              <Plus className="w-4 h-4 mr-1" /> New Design
            </Button>
          </div>

          {/* Create Design Form */}
          {createOpen && (
            <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-5">
              <h3 className="text-white font-medium mb-4">Create New Design</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="text-sm text-zinc-400 mb-1 block">Title</label>
                  <Input
                    value={createForm.title}
                    onChange={e => setCreateForm(p => ({ ...p, title: e.target.value }))}
                    placeholder="My Design"
                    className="bg-zinc-800 border-zinc-700 text-white"
                    data-testid="canva-design-title"
                  />
                </div>
                <div>
                  <label className="text-sm text-zinc-400 mb-1 block">Width (px)</label>
                  <Input
                    type="number"
                    value={createForm.width}
                    onChange={e => setCreateForm(p => ({ ...p, width: parseInt(e.target.value) || 0 }))}
                    className="bg-zinc-800 border-zinc-700 text-white"
                  />
                </div>
                <div>
                  <label className="text-sm text-zinc-400 mb-1 block">Height (px)</label>
                  <Input
                    type="number"
                    value={createForm.height}
                    onChange={e => setCreateForm(p => ({ ...p, height: parseInt(e.target.value) || 0 }))}
                    className="bg-zinc-800 border-zinc-700 text-white"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="border-zinc-700 text-zinc-400" onClick={() => setCreateOpen(false)}>Cancel</Button>
                <Button size="sm" className="bg-orange-500 hover:bg-orange-600 text-white" onClick={createDesign} disabled={creating} data-testid="canva-create-submit">
                  {creating ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
                  Create
                </Button>
              </div>
            </div>
          )}

          {/* Designs Grid */}
          {designs.length === 0 ? (
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-12 text-center">
              <Palette className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
              <p className="text-zinc-400 text-sm">No designs found</p>
              <p className="text-zinc-500 text-xs mt-1">Create a new design or search for existing ones</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {designs.map(design => {
                const d = design.design || design;
                const thumbnail = d.thumbnail?.url || d.urls?.thumbnail_url;
                const editUrl = d.urls?.edit_url;
                return (
                  <div key={d.id} className="bg-zinc-900/80 border border-zinc-800 rounded-xl overflow-hidden group" data-testid={`canva-design-${d.id}`}>
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
                          <Button size="sm" className="bg-[#7d2ae8] hover:bg-[#6b21c8] text-white" onClick={() => window.open(editUrl, '_blank')}>
                            <ExternalLink className="w-3.5 h-3.5 mr-1" /> Edit
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-zinc-600 text-white"
                          onClick={() => exportDesign(d.id)}
                          disabled={exporting === d.id}
                        >
                          {exporting === d.id ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-1" />}
                          Export
                        </Button>
                      </div>
                    </div>
                    <div className="p-3">
                      <p className="text-sm font-medium text-white truncate">{d.title || 'Untitled'}</p>
                      <p className="text-xs text-zinc-500 mt-1">
                        {d.created_at ? new Date(d.created_at * 1000).toLocaleDateString('nl-BE') : ''}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Activity Tab */}
      {activeTab === 'activity' && isConfigured && (
        <div className="space-y-3">
          {activity.length === 0 ? (
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-12 text-center">
              <Clock className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
              <p className="text-zinc-400 text-sm">No activity yet</p>
            </div>
          ) : (
            activity.map((act, i) => (
              <div key={i} className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-3 flex items-center gap-3">
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
                    {' '}{act.action === 'create_design' ? 'created' : 'exported'}{' '}
                    <span className="text-zinc-400">{act.design_title || act.design_id}</span>
                  </p>
                  <p className="text-xs text-zinc-500">{new Date(act.created_at).toLocaleString('nl-BE')}</p>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default CanvaDirectorPage;
