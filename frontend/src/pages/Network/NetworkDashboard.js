import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../components/ui/alert-dialog';
import { Checkbox } from '../../components/ui/checkbox';
import { toast } from 'sonner';
import { 
  Plus, Globe, Users, Layers, Settings, Trash2, Edit, ExternalLink,
  Tv, FileText, MessageSquare, Radio, Cog, Activity, Bug, CheckCircle,
  AlertTriangle, Info, X, Clock, Loader2, ChevronDown, ChevronUp
} from 'lucide-react';
import MigrationTool from './MigrationTool';

const API = process.env.REACT_APP_BACKEND_URL;

// Feature groups for display with Lucide icons
const FEATURE_GROUPS = {
  shows: { name: 'Shows', Icon: Tv },
  content: { name: 'Content', Icon: FileText },
  communication: { name: 'Communication', Icon: MessageSquare },
  streaming: { name: 'Streaming & RDS', Icon: Radio },
  sites: { name: 'Sites', Icon: Globe },
  admin: { name: 'Administration', Icon: Cog }
};

// Debug Content Component
function DebugContent({ data }) {
  const [expandedSections, setExpandedSections] = useState({});
  
  const toggle = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const Section = ({ id, title, icon: Icon, color, count, children }) => (
    <div className="bg-zinc-800/50 rounded-lg overflow-hidden">
      <button
        onClick={() => toggle(id)}
        className="w-full flex items-center gap-3 p-3 hover:bg-zinc-800/80 transition"
      >
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-sm font-medium text-white flex-1 text-left">{title}</span>
        {count !== undefined && <span className="text-xs text-zinc-500 font-mono">{count}</span>}
        {expandedSections[id] ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
      </button>
      {expandedSections[id] && <div className="px-3 pb-3">{children}</div>}
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Header info */}
      <div className="flex items-center gap-4 p-3 bg-zinc-800/30 rounded-lg text-xs text-zinc-400">
        <span><Clock className="w-3 h-3 inline mr-1" />{data.brussels_time}</span>
        <span>Team IDs: {data.team_ids_resolved?.length || 0}</span>
        <span>Sites: {data.child_sites?.length || 0}</span>
      </div>

      {/* Today's Shows */}
      <Section id="shows" title="Shows Vandaag" icon={Tv} color="text-orange-400" count={data.todays_shows?.length || 0}>
        {data.todays_shows?.length > 0 ? (
          <div className="space-y-1">
            {data.todays_shows.map((show, i) => (
              <div key={i} className={`flex items-center gap-2 text-xs p-2 rounded ${show.is_live ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-zinc-800/50'}`}>
                {show.is_live && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />}
                <span className="text-white font-medium">{show.title}</span>
                <span className="text-zinc-500">{show.start_time}–{show.end_time}</span>
                <span className="text-zinc-600">{show.rds_station || 'no rds'}</span>
                <span className={`ml-auto text-xs ${show.status === 'scheduled' ? 'text-emerald-400' : 'text-zinc-500'}`}>{show.status}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-zinc-500 p-2">Geen shows vandaag</p>
        )}
      </Section>

      {/* Traffic last hour */}
      <Section id="traffic" title="Traffic (laatste uur)" icon={Activity} color="text-blue-400" count={data.traffic_last_hour?.reduce((s, t) => s + t.count, 0) || 0}>
        {data.traffic_last_hour?.length > 0 ? (
          <div className="space-y-1">
            {data.traffic_last_hour.map((t, i) => (
              <div key={i} className="flex items-center justify-between text-xs p-1.5">
                <span className="text-zinc-300">{t.action}</span>
                <span className="text-zinc-500 font-mono">{t.count}x</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-zinc-500 p-2">Geen traffic</p>
        )}
      </Section>

      {/* RDS Cache Logs */}
      <Section id="rds" title="RDS Cache Logs" icon={Radio} color="text-violet-400" count={data.rds_cache_logs?.length || 0}>
        {data.rds_cache_logs?.length > 0 ? (
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {data.rds_cache_logs.map((log, i) => (
              <div key={i} className={`text-xs p-2 rounded ${log.status === 'success' ? 'bg-emerald-500/10' : log.status === 'no_show' ? 'bg-zinc-800/50' : 'bg-red-500/10'}`}>
                <div className="flex justify-between">
                  <span className={`font-medium ${log.status === 'success' ? 'text-emerald-400' : log.status === 'no_show' ? 'text-amber-400' : 'text-red-400'}`}>
                    {log.status}
                  </span>
                  <span className="text-zinc-500">{log.timestamp?.slice(11, 19)}</span>
                </div>
                <p className="text-zinc-400 mt-0.5">{log.message}</p>
                {log.show_title && <p className="text-zinc-300 mt-0.5">{log.show_title}</p>}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-zinc-500 p-2">Geen cache logs</p>
        )}
      </Section>

      {/* Active Rundowns */}
      <Section id="rundowns" title="Actieve Rundowns" icon={FileText} color="text-emerald-400" count={data.active_rundowns?.length || 0}>
        {data.active_rundowns?.length > 0 ? (
          <div className="space-y-1">
            {data.active_rundowns.map((r, i) => (
              <div key={i} className="text-xs p-2 bg-zinc-800/50 rounded">
                <span className="text-white">{r.show_title}</span>
                <span className="text-zinc-500 ml-2">{r.show_start_time}–{r.show_end_time}</span>
                <span className="text-zinc-600 ml-2">{r.rds_station}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-zinc-500 p-2">Geen actieve rundowns</p>
        )}
      </Section>

      {/* Shoutcast Logs */}
      <Section id="shoutcast" title="Shoutcast Logs" icon={Radio} color="text-pink-400" count={data.shoutcast_logs?.length || 0}>
        {data.shoutcast_logs?.length > 0 ? (
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {data.shoutcast_logs.map((log, i) => (
              <div key={i} className="text-xs p-1.5 flex items-center gap-2">
                <span className="text-zinc-500">{log.timestamp?.slice(11, 19)}</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${log.station === 'grk' ? 'bg-violet-500/20 text-violet-300' : 'bg-orange-500/20 text-orange-300'}`}>
                  {log.station?.toUpperCase()}
                </span>
                <span className="text-zinc-300 truncate">{log.title || log.current_song}</span>
                <span className="text-zinc-600 ml-auto">{log.listeners} listeners</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-zinc-500 p-2">Geen shoutcast logs</p>
        )}
      </Section>

      {/* Recent Audit Logs */}
      <Section id="audit" title="Recente Activiteit" icon={Clock} color="text-amber-400" count={data.recent_logs?.length || 0}>
        {data.recent_logs?.length > 0 ? (
          <div className="space-y-1 max-h-60 overflow-y-auto">
            {data.recent_logs.slice(0, 20).map((log, i) => (
              <div key={i} className="text-xs p-1.5 flex items-center gap-2 border-b border-zinc-800/50 last:border-0">
                <span className="text-zinc-500 w-14 flex-shrink-0">{log.timestamp?.slice(11, 19)}</span>
                <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 text-[10px]">{log.category}</span>
                <span className="text-zinc-300">{log.action}</span>
                <span className="text-zinc-500 truncate ml-auto">{log.user_name}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-zinc-500 p-2">Geen activiteit</p>
        )}
      </Section>

      {/* Child Sites */}
      <Section id="sites" title="Child Sites & Team IDs" icon={Globe} color="text-cyan-400" count={data.child_sites?.length || 0}>
        <div className="space-y-1">
          {data.child_sites?.map((s, i) => (
            <div key={i} className="text-xs p-1.5 flex justify-between">
              <span className="text-zinc-300">{s.name}</span>
              <span className="text-zinc-600 font-mono text-[10px]">{s.team_id}</span>
            </div>
          ))}
          <div className="text-[10px] text-zinc-600 pt-2">
            All IDs: {data.team_ids_resolved?.join(', ')}
          </div>
        </div>
      </Section>
    </div>
  );
}

export default function NetworkDashboard() {
  const { user, token } = useAuth();
  const [mainSites, setMainSites] = useState([]);
  const [availableFeatures, setAvailableFeatures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingSite, setEditingSite] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    enabled_features: []
  });
  const [deleteDialog, setDeleteDialog] = useState({ open: false, siteId: null, siteName: '' });
  const [healthCheck, setHealthCheck] = useState({ open: false, siteId: null, siteName: '', loading: false, result: null, history: [] });
  const [debugPanel, setDebugPanel] = useState({ open: false, siteId: null, siteName: '', loading: false, data: null });

  useEffect(() => {
    fetchMainSites();
    fetchFeatures();
  }, []);

  const fetchMainSites = async () => {
    try {
      const res = await fetch(`${API}/api/main-sites`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setMainSites(data);
      }
    } catch (err) {
      console.error('Failed to fetch main sites:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchFeatures = async () => {
    try {
      const res = await fetch(`${API}/api/main-sites/features`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAvailableFeatures(data.features);
      }
    } catch (err) {
      console.error('Failed to fetch features:', err);
    }
  };

  const handleCreateSite = async () => {
    if (!formData.name || !formData.slug) {
      toast.error('Name and URL are required');
      return;
    }

    try {
      const res = await fetch(`${API}/api/main-sites`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      if (res.ok) {
        toast.success('Main site created successfully');
        setShowCreateDialog(false);
        setFormData({ name: '', slug: '', enabled_features: [] });
        fetchMainSites();
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Failed to create main site');
      }
    } catch (err) {
      toast.error('Failed to create main site');
    }
  };

  const handleUpdateSite = async () => {
    if (!editingSite) return;

    try {
      const res = await fetch(`${API}/api/main-sites/${editingSite.id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      if (res.ok) {
        toast.success('Main site updated successfully');
        setEditingSite(null);
        setFormData({ name: '', slug: '', enabled_features: [] });
        fetchMainSites();
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Failed to update main site');
      }
    } catch (err) {
      toast.error('Failed to update main site');
    }
  };

  const handleDeleteSite = async (siteId) => {
    try {
      const res = await fetch(`${API}/api/main-sites/${siteId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.ok) {
        toast.success('Main site deleted');
        setDeleteDialog({ open: false, siteId: null, siteName: '' });
        fetchMainSites();
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Failed to delete main site');
      }
    } catch (err) {
      toast.error('Failed to delete main site');
    }
  };

  const handleDeleteClick = (siteId, siteName) => {
    setDeleteDialog({ open: true, siteId, siteName });
  };

  const openEditDialog = (site) => {
    setEditingSite(site);
    setFormData({
      name: site.name,
      slug: site.slug,
      description: site.description || '',
      enabled_features: site.enabled_features || []
    });
  };

  const toggleFeature = (featureId) => {
    setFormData(prev => ({
      ...prev,
      enabled_features: prev.enabled_features.includes(featureId)
        ? prev.enabled_features.filter(f => f !== featureId)
        : [...prev.enabled_features, featureId]
    }));
  };

  const runHealthCheck = async (siteId, siteName) => {
    setHealthCheck({ open: true, siteId, siteName, loading: true, result: null, history: [] });
    try {
      const [checkRes, historyRes] = await Promise.all([
        fetch(`${API}/api/main-sites/${siteId}/health-check`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${API}/api/main-sites/${siteId}/health-history?limit=10`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);
      const result = checkRes.ok ? await checkRes.json() : null;
      const history = historyRes.ok ? await historyRes.json() : [];
      setHealthCheck(prev => ({ ...prev, loading: false, result, history }));
    } catch (err) {
      toast.error('Health check mislukt');
      setHealthCheck(prev => ({ ...prev, loading: false }));
    }
  };

  const openDebugPanel = async (siteId, siteName) => {
    setDebugPanel({ open: true, siteId, siteName, loading: true, data: null });
    try {
      const res = await fetch(`${API}/api/main-sites/${siteId}/debug`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = res.ok ? await res.json() : null;
      setDebugPanel(prev => ({ ...prev, loading: false, data }));
    } catch (err) {
      toast.error('Debug info ophalen mislukt');
      setDebugPanel(prev => ({ ...prev, loading: false }));
    }
  };

  const refreshDebug = () => {
    if (debugPanel.siteId) openDebugPanel(debugPanel.siteId, debugPanel.siteName);
  };

  const groupedFeatures = availableFeatures.reduce((acc, feature) => {
    const group = feature.group || 'other';
    if (!acc[group]) acc[group] = [];
    acc[group].push(feature);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <div className="animate-pulse text-zinc-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Network Admin</h1>
              <p className="text-sm text-zinc-400">Manage all main sites</p>
            </div>
            <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              New Main Site
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {mainSites.length === 0 ? (
          <div className="space-y-6">
            {/* Empty State */}
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <Globe className="w-16 h-16 text-zinc-600 mb-4" />
                <h3 className="text-xl font-semibold text-zinc-300 mb-2">No Main Sites Yet</h3>
                <p className="text-zinc-500 mb-6">Use the Migration Tool below to migrate your existing data, or create a new main site</p>
                <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
                  <Plus className="w-4 h-4" />
                  Create Main Site
                </Button>
              </CardContent>
            </Card>
            
            {/* Migration Tool - always visible */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              <MigrationTool />
            </div>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {mainSites.map(site => (
              <Card key={site.id} className="bg-zinc-900 border-zinc-800 hover:border-zinc-700 transition-colors">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      {site.logo_url ? (
                        <img src={site.logo_url} alt="" className="w-10 h-10 rounded-lg object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center">
                          <Globe className="w-5 h-5 text-zinc-500" />
                        </div>
                      )}
                      <div>
                        <CardTitle className="text-lg">{site.name}</CardTitle>
                        <CardDescription className="text-zinc-500">/{site.slug}</CardDescription>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEditDialog(site)}>
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteClick(site.id, site.name)}>
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {site.description && (
                    <p className="text-sm text-zinc-400 mb-4">{site.description}</p>
                  )}
                  <div className="flex items-center gap-4 text-sm text-zinc-500 mb-4">
                    <span className="flex items-center gap-1">
                      <Layers className="w-4 h-4" />
                      {site.site_count} sites
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="w-4 h-4" />
                      {site.user_count} users
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 mb-4">
                    {site.enabled_features?.slice(0, 5).map(f => (
                      <span key={f} className="px-2 py-0.5 text-xs bg-zinc-800 rounded-full text-zinc-400">
                        {f}
                      </span>
                    ))}
                    {site.enabled_features?.length > 5 && (
                      <span className="px-2 py-0.5 text-xs bg-zinc-800 rounded-full text-zinc-400">
                        +{site.enabled_features.length - 5} more
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 gap-1.5 text-xs"
                      data-testid={`health-check-${site.slug}`}
                      onClick={() => runHealthCheck(site.id, site.name)}
                    >
                      <Activity className="w-3.5 h-3.5" />
                      Test
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 gap-1.5 text-xs"
                      data-testid={`debug-${site.slug}`}
                      onClick={() => openDebugPanel(site.id, site.name)}
                    >
                      <Bug className="w-3.5 h-3.5" />
                      Debug
                    </Button>
                  </div>
                  <Link to={`/${site.slug}`}>
                    <Button variant="outline" className="w-full gap-2 mt-2">
                      <ExternalLink className="w-4 h-4" />
                      Open Dashboard
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
            
            {/* Migration Tool Card */}
            <MigrationTool />
          </div>
        )}
      </main>

      {/* Create/Edit Dialog */}
      <Dialog open={showCreateDialog || !!editingSite} onOpenChange={(open) => {
        if (!open) {
          setShowCreateDialog(false);
          setEditingSite(null);
          setFormData({ name: '', slug: '', enabled_features: [] });
        }
      }}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingSite ? 'Edit Main Site' : 'Create Main Site'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="My Awesome Project"
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>
              <div className="space-y-2">
                <Label>URL Slug</Label>
                <div className="flex items-center">
                  <span className="text-zinc-500 text-sm mr-1">/</span>
                  <Input
                    value={formData.slug}
                    onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                    placeholder="my-awesome-project"
                    className="bg-zinc-800 border-zinc-700"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <Label>Enabled Features</Label>
              <div className="grid gap-4">
                {Object.entries(groupedFeatures).map(([groupId, features]) => {
                  const GroupIcon = FEATURE_GROUPS[groupId]?.Icon || Layers;
                  return (
                  <div key={groupId} className="space-y-2">
                    <h4 className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                      <GroupIcon className="w-4 h-4" />
                      {FEATURE_GROUPS[groupId]?.name || groupId}
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {features.map(feature => (
                        <div
                          key={feature.id}
                          className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
                            formData.enabled_features.includes(feature.id)
                              ? 'bg-orange-500/20 border border-orange-500/50'
                              : 'bg-zinc-800 border border-zinc-700 hover:border-zinc-600'
                          }`}
                          onClick={() => toggleFeature(feature.id)}
                        >
                          <Checkbox
                            checked={formData.enabled_features.includes(feature.id)}
                            className="pointer-events-none"
                          />
                          <span className="text-sm">{feature.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateDialog(false);
                setEditingSite(null);
                setFormData({ name: '', slug: '', enabled_features: [] });
              }}
            >
              Cancel
            </Button>
            <Button onClick={editingSite ? handleUpdateSite : handleCreateSite}>
              {editingSite ? 'Save Changes' : 'Create Main Site'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialog.open} onOpenChange={(open) => !open && setDeleteDialog({ open: false, siteId: null, siteName: '' })}>
        <AlertDialogContent className="bg-zinc-900 border-zinc-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Main Site</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              Are you sure you want to delete "{deleteDialog.siteName}"? This will also delete all associated mini-sites and data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => handleDeleteSite(deleteDialog.siteId)}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Health Check Panel */}
      <Dialog open={healthCheck.open} onOpenChange={(open) => !open && setHealthCheck({ open: false, siteId: null, siteName: '', loading: false, result: null, history: [] })}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-orange-500" />
              Health Check — {healthCheck.siteName}
            </DialogTitle>
          </DialogHeader>
          
          {healthCheck.loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
              <span className="ml-3 text-zinc-400">Tests uitvoeren...</span>
            </div>
          ) : healthCheck.result ? (
            <div className="space-y-4">
              {/* Overall Status */}
              <div className={`flex items-center gap-3 p-4 rounded-lg ${
                healthCheck.result.overall_status === 'ok' ? 'bg-emerald-500/10' :
                healthCheck.result.overall_status === 'error' ? 'bg-red-500/10' : 'bg-amber-500/10'
              }`}>
                {healthCheck.result.overall_status === 'ok' ? (
                  <CheckCircle className="w-6 h-6 text-emerald-500" />
                ) : healthCheck.result.overall_status === 'error' ? (
                  <X className="w-6 h-6 text-red-500" />
                ) : (
                  <AlertTriangle className="w-6 h-6 text-amber-500" />
                )}
                <div>
                  <p className="font-semibold text-white">
                    {healthCheck.result.overall_status === 'ok' ? 'Alles OK' :
                     healthCheck.result.overall_status === 'error' ? 'Fouten Gevonden' : 'Waarschuwingen'}
                  </p>
                  <p className="text-xs text-zinc-400">{healthCheck.result.timestamp?.slice(0, 19)}</p>
                </div>
              </div>
              
              {/* Individual Checks */}
              <div className="space-y-2">
                {healthCheck.result.checks?.map((check, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 bg-zinc-800/50 rounded-lg">
                    {check.status === 'ok' ? (
                      <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    ) : check.status === 'error' ? (
                      <X className="w-4 h-4 text-red-500 flex-shrink-0" />
                    ) : check.status === 'warning' ? (
                      <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    ) : (
                      <Info className="w-4 h-4 text-blue-400 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white">{check.name}</p>
                      <p className="text-xs text-zinc-400">{check.message}</p>
                    </div>
                    {check.count !== undefined && (
                      <span className="text-sm font-mono text-zinc-300">{check.count}</span>
                    )}
                  </div>
                ))}
              </div>

              {/* Team IDs resolved */}
              <div className="text-xs text-zinc-500 p-2 bg-zinc-800/30 rounded">
                Team IDs doorzocht: {healthCheck.result.team_ids_resolved?.length || 0}
              </div>

              {/* History */}
              {healthCheck.history?.length > 1 && (
                <div className="pt-2">
                  <p className="text-xs text-zinc-500 mb-2">Vorige checks</p>
                  <div className="space-y-1">
                    {healthCheck.history.slice(1, 6).map((h, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-zinc-500">
                        {h.overall_status === 'ok' ? (
                          <CheckCircle className="w-3 h-3 text-emerald-500" />
                        ) : (
                          <AlertTriangle className="w-3 h-3 text-amber-500" />
                        )}
                        <span>{h.timestamp?.slice(0, 19)}</span>
                        <span className="text-zinc-600">—</span>
                        <span>{h.checks?.filter(c => c.status === 'ok').length}/{h.checks?.length} OK</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-zinc-500 text-center py-8">Geen resultaten</p>
          )}
        </DialogContent>
      </Dialog>

      {/* Debug Panel */}
      <Dialog open={debugPanel.open} onOpenChange={(open) => !open && setDebugPanel({ open: false, siteId: null, siteName: '', loading: false, data: null })}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <Bug className="w-5 h-5 text-violet-400" />
                Debug — {debugPanel.siteName}
              </DialogTitle>
              <Button variant="ghost" size="sm" onClick={refreshDebug} className="gap-1.5">
                <Activity className="w-3.5 h-3.5" />
                Refresh
              </Button>
            </div>
          </DialogHeader>
          
          {debugPanel.loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-violet-400" />
              <span className="ml-3 text-zinc-400">Debug info ophalen...</span>
            </div>
          ) : debugPanel.data ? (
            <DebugContent data={debugPanel.data} />
          ) : (
            <p className="text-zinc-500 text-center py-8">Geen data</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
