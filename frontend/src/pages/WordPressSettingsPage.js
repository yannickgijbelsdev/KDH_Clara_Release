import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import {
  Globe,
  Key,
  User,
  CheckCircle,
  AlertCircle,
  Loader2,
  Trash2,
  Save,
  Plus,
  Edit2,
  X,
  Info,
  Power,
  PowerOff,
  Sparkles,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../components/ui/dialog';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { useMainSite } from '../context/MainSiteContext';
import { useClaraAssistant } from '../context/ClaraAssistantContext';
import { claraToast } from '../utils/claraToast';
import { ShieldAlert } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const WordPressSettingsPage = () => {
  const { isAdmin: isGlobalAdmin } = useAuth();
  const { mainSiteSlug } = useParams();
  const navigate = useNavigate();
  const { openClara } = useClaraAssistant();
  
  // Use site-specific permission when in main site context
  let hasSiteAdmin = false;
  try {
    const mainSiteCtx = useMainSite();
    hasSiteAdmin = mainSiteCtx?.isAdmin?.() || false;
  } catch (e) {
    // Not in MainSiteProvider context (legacy route)
    hasSiteAdmin = false;
  }
  
  const hasAccess = isGlobalAdmin || hasSiteAdmin;
  
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState(null);
  const [testResults, setTestResults] = useState({});
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteSiteId, setDeleteSiteId] = useState(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingSite, setEditingSite] = useState(null);
  const [syncingCategoriesId, setSyncingCategoriesId] = useState(null);
  const [importingPostsId, setImportingPostsId] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    wp_base_url: '',
    username: '',
    app_password: '',
    default_post_type: 'post',
    default_publish_status: 'draft',
    is_active: true,
  });
  
  // Helper for context-aware navigation - uses URL param directly
  const navTo = (path) => mainSiteSlug ? `/${mainSiteSlug}${path}` : path;

  useEffect(() => {
    if (hasAccess) {
      fetchSites();
    } else {
      setLoading(false);
    }
  }, [hasAccess, mainSiteSlug]);

  const fetchSites = async () => {
    try {
      const response = await axios.get(`${API}/wordpress/sites`);
      setSites(response.data);
    } catch (error) {
      claraToast.error('Failed to load WordPress sites', openClara, 'WordPress settings');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      wp_base_url: '',
      username: '',
      app_password: '',
      default_post_type: 'post',
      default_publish_status: 'draft',
      is_active: true,
    });
    setEditingSite(null);
  };

  const openAddDialog = () => {
    resetForm();
    setEditDialogOpen(true);
  };

  const openEditDialog = (site) => {
    setEditingSite(site);
    setFormData({
      name: site.name,
      wp_base_url: site.wp_base_url,
      username: site.username,
      app_password: '',
      default_post_type: site.default_post_type,
      default_publish_status: site.default_publish_status,
      is_active: site.is_active,
    });
    setEditDialogOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      if (editingSite) {
        // Update existing
        const updateData = { ...formData };
        if (!updateData.app_password) {
          delete updateData.app_password;
        }
        const response = await axios.put(`${API}/wordpress/sites/${editingSite.id}`, updateData);
        setSites(sites.map(s => s.id === editingSite.id ? response.data : s));
        toast.success('WordPress site updated');
      } else {
        // Create new
        if (!formData.app_password) {
          toast.error('Application password is required');
          setSaving(false);
          return;
        }
        const response = await axios.post(`${API}/wordpress/sites`, formData);
        setSites([...sites, response.data]);
        toast.success('WordPress site added');
      }
      setEditDialogOpen(false);
      resetForm();
    } catch (error) {
      claraToast.error('Failed to save WordPress site', openClara, 'WordPress settings');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (siteId) => {
    setTestingId(siteId);
    setTestResults(prev => ({ ...prev, [siteId]: null }));

    try {
      const response = await axios.post(`${API}/wordpress/sites/${siteId}/test`);
      setTestResults(prev => ({ ...prev, [siteId]: response.data }));
      
      if (response.data.success) {
        toast.success('Connection successful!');
      } else {
        claraToast.error('WordPress connection failed', openClara, 'WordPress connection test');
      }
    } catch (error) {
      setTestResults(prev => ({ ...prev, [siteId]: { success: false, message: 'Failed to test connection' } }));
      claraToast.error('Failed to test WordPress connection', openClara, 'WordPress connection test');
    } finally {
      setTestingId(null);
    }
  };

  const handleDelete = async () => {
    try {
      await axios.delete(`${API}/wordpress/sites/${deleteSiteId}`);
      setSites(sites.filter(s => s.id !== deleteSiteId));
      setDeleteDialogOpen(false);
      setDeleteSiteId(null);
      toast.success('WordPress site removed');
    } catch (error) {
      toast.error('Failed to remove site');
    }
  };

  const confirmDelete = (siteId) => {
    setDeleteSiteId(siteId);
    setDeleteDialogOpen(true);
  };

  const handleSyncCategories = async (siteId) => {
    setSyncingCategoriesId(siteId);
    try {
      const response = await axios.post(`${API}/wordpress/sites/${siteId}/sync-categories`);
      toast.success(`Synced ${response.data.synced} categories (${response.data.created} new, ${response.data.updated} updated)`);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to sync categories');
    } finally {
      setSyncingCategoriesId(null);
    }
  };

  const handleImportPosts = async (siteId) => {
    setImportingPostsId(siteId);
    try {
      const response = await axios.post(`${API}/wordpress/sites/${siteId}/import-posts`);
      const { imported, updated, total_wp_posts, site_name } = response.data;
      toast.success(`${site_name}: ${imported} imported, ${updated} updated (from ${total_wp_posts} posts)`);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to import posts');
    } finally {
      setImportingPostsId(null);
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-8 bg-zinc-100 rounded w-48 mb-8" />
        <div className="h-64 bg-zinc-100 rounded-xl" />
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center" data-testid="no-access-message">
        <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-6">
          <ShieldAlert className="w-8 h-8 text-red-400" />
        </div>
        <h2 className="text-xl font-bold text-zinc-900 mb-2">Geen toegang</h2>
        <p className="text-zinc-400 max-w-md">
          Je hebt geen beheerdersrechten om WordPress-instellingen te bekijken of aan te passen.
          Neem contact op met een beheerder als je denkt dat dit een fout is.
        </p>
      </div>
    );
  }

  return (
    <div data-testid="wordpress-settings-page">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-black text-zinc-900 mb-2">WordPress Sites</h1>
          <p className="text-zinc-400">Connect multiple WordPress sites to publish content</p>
        </div>
        <Button
          data-testid="add-wp-site-btn"
          onClick={openAddDialog}
          className="bg-violet-500 hover:bg-violet-600 text-white gap-2"
        >
          <Plus className="w-5 h-5" />
          Add Site
        </Button>
      </div>

      {/* Info Box */}
      <div className="bg-violet-500/10 border border-violet-500/30 rounded-xl p-4 mb-8">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-violet-400 mt-0.5" />
          <div>
            <h3 className="text-zinc-900 font-medium mb-1">WordPress Application Passwords</h3>
            <p className="text-sm text-zinc-400 mb-2">
              To connect to WordPress, you need to create an Application Password:
            </p>
            <ol className="text-sm text-zinc-400 list-decimal list-inside space-y-1">
              <li>Log in to your WordPress admin dashboard</li>
              <li>Go to Users → Profile</li>
              <li>Scroll down to "Application Passwords"</li>
              <li>Enter a name (e.g., "ShowPrep") and click "Add New"</li>
              <li>Copy the generated password and paste it when adding a site</li>
            </ol>
          </div>
        </div>
      </div>

      {/* Sites List */}
      {sites.length === 0 ? (
        <div className="text-center py-16 bg-white border border-zinc-200 rounded-xl">
          <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Globe className="w-8 h-8 text-zinc-500" />
          </div>
          <h3 className="text-lg font-semibold text-zinc-900 mb-2">No WordPress sites connected</h3>
          <p className="text-zinc-400 mb-6">Add your first WordPress site to start publishing content</p>
          <Button
            onClick={openAddDialog}
            className="bg-violet-500 hover:bg-violet-600 text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add WordPress Site
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {sites.map((site) => {
            const testResult = testResults[site.id];
            return (
              <div
                key={site.id}
                data-testid={`wp-site-${site.id}`}
                className="bg-white border border-zinc-200 rounded-xl p-6"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className={`p-2.5 rounded-lg ${site.is_active ? 'bg-violet-500/20' : 'bg-zinc-100'}`}>
                      <Globe className={`w-5 h-5 ${site.is_active ? 'text-violet-500' : 'text-zinc-500'}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="text-lg font-semibold text-zinc-900">{site.name}</h3>
                        {site.is_active ? (
                          <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-green-500/20 text-green-400">
                            <Power className="w-3 h-3" />
                            Active
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-zinc-100 text-zinc-500">
                            <PowerOff className="w-3 h-3" />
                            Inactive
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-zinc-400 mb-2">{site.wp_base_url}</p>
                      <div className="flex items-center gap-4 text-xs text-zinc-500">
                        <span>User: {site.username}</span>
                        <span>Default: {site.default_post_type} / {site.default_publish_status}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleTest(site.id)}
                      disabled={testingId === site.id}
                      className="gap-2 bg-transparent border-zinc-300 text-zinc-600 hover:bg-zinc-100"
                    >
                      {testingId === site.id ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Testing...
                        </>
                      ) : (
                        'Test'
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSyncCategories(site.id)}
                      disabled={syncingCategoriesId === site.id || !site.is_active}
                      className="gap-2 bg-transparent border-zinc-300 text-zinc-600 hover:bg-zinc-100"
                      title="Sync categories from WordPress"
                    >
                      {syncingCategoriesId === site.id ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Syncing...
                        </>
                      ) : (
                        'Sync Categories'
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleImportPosts(site.id)}
                      disabled={importingPostsId === site.id || !site.is_active}
                      className="gap-2 bg-transparent border-zinc-300 text-zinc-600 hover:bg-zinc-100"
                      data-testid={`import-posts-${site.id}`}
                      title="Import published and scheduled posts from WordPress"
                    >
                      {importingPostsId === site.id ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Importing...
                        </>
                      ) : (
                        'Import Posts'
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      data-testid={`edit-site-${site.id}`}
                      onClick={() => openEditDialog(site)}
                      className="gap-2 bg-transparent border-zinc-300 text-zinc-600 hover:bg-zinc-100"
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      data-testid={`delete-site-${site.id}`}
                      onClick={() => confirmDelete(site.id)}
                      className="bg-transparent border-zinc-300 text-rose-500 hover:bg-rose-500/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Test Result */}
                {testResult && (
                  <div className={`flex items-center gap-3 p-3 rounded-lg mt-4 ${
                    testResult.success 
                      ? 'bg-green-500/10 border border-green-500/30' 
                      : 'bg-rose-500/10 border border-rose-500/30'
                  }`}>
                    {testResult.success ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-500" />
                    )}
                    <span className={`text-sm ${testResult.success ? 'text-green-400' : 'text-rose-400'}`}>
                      {testResult.message}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Site Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="bg-white border-zinc-200 text-zinc-900 sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              {editingSite ? 'Edit WordPress Site' : 'Add WordPress Site'}
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              {editingSite 
                ? 'Update the connection details for this WordPress site.'
                : 'Enter the details to connect a new WordPress site.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSave} className="space-y-5 mt-4">
            <div className="space-y-2">
              <Label className="text-zinc-600">Site Name</Label>
              <Input
                data-testid="wp-name-input"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Station A Website"
                required
                className="bg-zinc-50 border-zinc-200 text-zinc-900 placeholder:text-zinc-400"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-zinc-600">WordPress Site URL</Label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <Input
                  data-testid="wp-url-input"
                  type="url"
                  value={formData.wp_base_url}
                  onChange={(e) => setFormData({ ...formData, wp_base_url: e.target.value })}
                  placeholder="https://your-site.com"
                  required
                  className="pl-10 bg-zinc-50 border-zinc-200 text-zinc-900 placeholder:text-zinc-400"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-zinc-600">Username</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <Input
                  data-testid="wp-username-input"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  placeholder="admin"
                  required
                  className="pl-10 bg-zinc-50 border-zinc-200 text-zinc-900 placeholder:text-zinc-400"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-zinc-600">Application Password</Label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <Input
                  data-testid="wp-password-input"
                  type="password"
                  value={formData.app_password}
                  onChange={(e) => setFormData({ ...formData, app_password: e.target.value })}
                  placeholder={editingSite ? '••••••••••••••••' : 'xxxx xxxx xxxx xxxx xxxx xxxx'}
                  required={!editingSite}
                  className="pl-10 bg-zinc-50 border-zinc-200 text-zinc-900 placeholder:text-zinc-400"
                />
              </div>
              {editingSite && (
                <p className="text-xs text-zinc-500">Leave blank to keep existing password</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-600">Default Post Type</Label>
                <Select
                  value={formData.default_post_type}
                  onValueChange={(value) => setFormData({ ...formData, default_post_type: value })}
                >
                  <SelectTrigger className="bg-zinc-50 border-zinc-200 text-zinc-900">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-zinc-200">
                    <SelectItem value="post" className="text-zinc-600 focus:text-zinc-900 focus:bg-zinc-100">Post</SelectItem>
                    <SelectItem value="page" className="text-zinc-600 focus:text-zinc-900 focus:bg-zinc-100">Page</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-zinc-600">Default Status</Label>
                <Select
                  value={formData.default_publish_status}
                  onValueChange={(value) => setFormData({ ...formData, default_publish_status: value })}
                >
                  <SelectTrigger className="bg-zinc-50 border-zinc-200 text-zinc-900">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-zinc-200">
                    <SelectItem value="draft" className="text-zinc-600 focus:text-zinc-900 focus:bg-zinc-100">Draft</SelectItem>
                    <SelectItem value="publish" className="text-zinc-600 focus:text-zinc-900 focus:bg-zinc-100">Published</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditDialogOpen(false);
                  resetForm();
                }}
                className="flex-1 bg-transparent border-zinc-300 text-zinc-600 hover:bg-zinc-100"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                data-testid="save-wp-btn"
                disabled={saving}
                className="flex-1 bg-violet-500 hover:bg-violet-600 text-white"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    {editingSite ? 'Update Site' : 'Add Site'}
                  </>
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-white border-zinc-200">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-zinc-900">Remove WordPress Site</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              Are you sure you want to remove this WordPress site? All publish history for this site will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-zinc-300 text-zinc-600 hover:bg-zinc-100">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-rose-500 hover:bg-rose-600 text-white"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default WordPressSettingsPage;
