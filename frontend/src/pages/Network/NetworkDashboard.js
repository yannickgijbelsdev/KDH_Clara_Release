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
    </div>
  );
}
