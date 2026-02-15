import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Globe, ExternalLink, Settings, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../../components/ui/dialog';
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
import { toast } from 'sonner';
import axios from 'axios';
import { useMainSite } from '../../context/MainSiteContext';

const API = process.env.REACT_APP_BACKEND_URL;

export default function SitesListPage() {
  const navigate = useNavigate();
  const { mainSiteSlug } = useParams();
  const { mainSite: contextMainSite } = useMainSite();
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newSite, setNewSite] = useState({ name: '', slug: '' });
  const [creating, setCreating] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState({ open: false, siteId: null, siteName: '' });

  // Use mainSite from context when available
  const mainSite = contextMainSite;

  useEffect(() => {
    fetchSites();
  }, [mainSiteSlug, mainSite]);

  const fetchSites = async () => {
    try {
      const token = localStorage.getItem('token');
      // Use axios which automatically includes the X-Main-Site-ID header via interceptor
      const res = await axios.get(`${API}/api/sites`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSites(res.data);
    } catch (error) {
      console.error('Error fetching sites:', error);
    } finally {
      setLoading(false);
    }
  };

  const createSite = async () => {
    if (!newSite.name || !newSite.slug) {
      toast.error('Vul alle velden in');
      return;
    }

    setCreating(true);
    try {
      const token = localStorage.getItem('token');
      // Use axios which automatically includes the X-Main-Site-ID header via interceptor
      const res = await axios.post(`${API}/api/sites`, newSite, {
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      
      toast.success('Site aangemaakt');
      setShowCreateDialog(false);
      setNewSite({ name: '', slug: '' });
      const basePath = mainSiteSlug ? `/${mainSiteSlug}` : '';
      navigate(`${basePath}/sites/${res.data.id}`);
    } catch (error) {
      const errorMsg = error.response?.data?.detail || 'Fout bij aanmaken site';
      toast.error(errorMsg);
    } finally {
      setCreating(false);
    }
  };

  const deleteSite = async (siteId) => {
    try {
      const token = localStorage.getItem('token');
      // Use axios which automatically includes the X-Main-Site-ID header via interceptor
      await axios.delete(`${API}/api/sites/${siteId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      toast.success('Site verwijderd');
      setDeleteDialog({ open: false, siteId: null, siteName: '' });
      fetchSites();
    } catch (error) {
      toast.error('Fout bij verwijderen site');
    }
  };

  const handleDeleteClick = (siteId, siteName) => {
    setDeleteDialog({ open: true, siteId, siteName });
  };

  // Helper to get correct image URL
  const getImageUrl = (url) => {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    return `${API}${url}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Globe className="h-8 w-8 text-orange-500" />
          <div>
            <h1 className="text-2xl font-bold text-white">Sites</h1>
            <p className="text-sm text-zinc-400">Manage your public landing pages</p>
          </div>
        </div>
        <Button 
          onClick={() => setShowCreateDialog(true)}
          className="bg-orange-500 hover:bg-orange-600"
        >
          <Plus className="h-4 w-4 mr-2" />
          New site
        </Button>
      </div>

      {/* Sites Grid */}
      {sites.length === 0 ? (
        <div className="text-center py-16 bg-zinc-900/50 rounded-xl border border-zinc-800">
          <Globe className="h-16 w-16 text-zinc-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">No sites yet</h3>
          <p className="text-zinc-400 mb-6">
            Create your first public landing page
          </p>
          <Button 
            onClick={() => setShowCreateDialog(true)}
            className="bg-orange-500 hover:bg-orange-600"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create site
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {sites.map(site => (
            <div 
              key={site.id}
              className="bg-zinc-900/50 rounded-xl border border-zinc-800 overflow-hidden hover:border-zinc-700 transition group"
            >
              <div className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {site.logo_url ? (
                      <img 
                        src={getImageUrl(site.logo_url)}
                        alt={site.name}
                        className="h-12 w-12 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="h-12 w-12 rounded-lg bg-zinc-800 flex items-center justify-center">
                        <Globe className="h-6 w-6 text-zinc-500" />
                      </div>
                    )}
                    <div>
                      <h3 className="font-semibold text-white">{site.name}</h3>
                      <a 
                        href={mainSiteSlug 
                          ? `${window.location.origin}/${mainSiteSlug}/${site.slug}`
                          : `${window.location.origin}/${site.slug}`
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-orange-400 hover:text-orange-300 flex items-center gap-1"
                      >
                        {mainSiteSlug ? `/${mainSiteSlug}/${site.slug}` : `/${site.slug}`}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {site.audio_enabled && (
                    <span className="text-xs px-2 py-1 bg-blue-500/20 text-blue-400 rounded">
                      Audio
                    </span>
                  )}
                  {site.video_enabled && (
                    <span className="text-xs px-2 py-1 bg-purple-500/20 text-purple-400 rounded">
                      Video
                    </span>
                  )}
                  {site.form_enabled && (
                    <span className="text-xs px-2 py-1 bg-green-500/20 text-green-400 rounded">
                      Form
                    </span>
                  )}
                  {site.password_protected && (
                    <span className="text-xs px-2 py-1 bg-yellow-500/20 text-yellow-400 rounded">
                      Protected
                    </span>
                  )}
                </div>
              </div>

              <div className="px-6 py-3 bg-zinc-800/50 border-t border-zinc-800 flex justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate(`${mainSiteSlug ? `/${mainSiteSlug}` : ''}/sites/${site.id}`)}
                  className="text-zinc-400 hover:text-white"
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Settings
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteSite(site.id)}
                  className="text-red-400 hover:text-red-300"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle>Create new site</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <Label>Name</Label>
              <Input
                value={newSite.name}
                onChange={(e) => setNewSite(prev => ({ ...prev, name: e.target.value }))}
                placeholder="My Radio Page"
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
            
            <div>
              <Label>URL</Label>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-zinc-400 text-sm">
                  {window.location.origin}/{mainSiteSlug ? `${mainSiteSlug}/` : ''}
                </span>
                <Input
                  value={newSite.slug}
                  onChange={(e) => setNewSite(prev => ({ 
                    ...prev, 
                    slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') 
                  }))}
                  placeholder="my-page"
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={createSite} 
              disabled={creating}
              className="bg-orange-500 hover:bg-orange-600"
            >
              {creating ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
