import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { format, parseISO } from 'date-fns';
import {
  ArrowLeft,
  Edit2,
  Trash2,
  Save,
  X,
  FileText,
  Link,
  BookOpen,
  Globe,
  Tag,
  CheckCircle,
  AlertCircle,
  Clock,
  Upload,
  RefreshCw,
  ExternalLink,
  Check,
  Image,
  Loader2,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
import { Checkbox } from '../components/ui/checkbox';
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
import RichTextEditor from '../components/RichTextEditor';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const typeIcons = {
  text: FileText,
  link: Link,
  reference: BookOpen,
};

const statusColors = {
  draft: 'bg-zinc-500/20 text-zinc-400',
  ready: 'bg-violet-500/20 text-violet-400',
};

const statusLabels = {
  draft: 'Draft',
  ready: 'Ready',
};

const syncStatusConfig = {
  not_synced: { icon: Clock, color: 'text-zinc-500', bgColor: 'bg-zinc-800', label: 'Not synced' },
  synced: { icon: CheckCircle, color: 'text-green-500', bgColor: 'bg-green-500/10', label: 'Synced' },
  failed: { icon: AlertCircle, color: 'text-orange-500', bgColor: 'bg-orange-500/10', label: 'Failed' },
};

const ContentDetailPage = () => {
  const { contentId } = useParams();
  const navigate = useNavigate();
  const { isEditor } = useAuth();
  const [content, setContent] = useState(null);
  const [wpSites, setWpSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [editData, setEditData] = useState({});
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  // Multi-site publish state
  const [selectedSites, setSelectedSites] = useState({});
  const [publishSettings, setPublishSettings] = useState({});
  // Featured images state per site
  const [featuredImages, setFeaturedImages] = useState({});
  const [uploadingSiteId, setUploadingSiteId] = useState(null);
  const fileInputRefs = useRef({});

  useEffect(() => {
    fetchContent();
    fetchWpSites();
  }, [contentId]);

  const fetchContent = async () => {
    try {
      const response = await axios.get(`${API}/content/${contentId}`);
      setContent(response.data);
      setEditData({
        ...response.data,
        tags: response.data.tags?.join(', ') || '',
      });
      
      // Initialize featured images from publish statuses
      const images = {};
      response.data.publish_statuses?.forEach(ps => {
        if (ps.featured_image) {
          images[ps.wordpress_site_id] = ps.featured_image;
        }
      });
      setFeaturedImages(images);
    } catch (error) {
      toast.error('Failed to load content');
      navigate('/content');
    } finally {
      setLoading(false);
    }
  };

  const fetchWpSites = async () => {
    try {
      const response = await axios.get(`${API}/wordpress/sites`);
      setWpSites(response.data.filter(s => s.is_active));
      
      // Initialize publish settings for each site
      const settings = {};
      response.data.forEach(site => {
        settings[site.id] = {
          post_type: site.default_post_type || 'post',
          wp_status: site.default_publish_status || 'draft',
        };
      });
      setPublishSettings(settings);
    } catch {
      setWpSites([]);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await axios.put(`${API}/content/${contentId}`, {
        title: editData.title,
        type: editData.type,
        body: editData.body,
        excerpt: editData.excerpt,
        external_url: editData.external_url,
        tags: editData.tags ? editData.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        status: editData.status,
      });
      setContent(response.data);
      setIsEditing(false);
      toast.success('Content updated');
    } catch (error) {
      toast.error('Failed to update content');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await axios.delete(`${API}/content/${contentId}`);
      toast.success('Content deleted');
      navigate('/content');
    } catch (error) {
      toast.error('Failed to delete content');
    }
  };

  const openPublishDialog = () => {
    // Pre-select sites that already have this content published
    const preSelected = {};
    content.publish_statuses?.forEach(ps => {
      preSelected[ps.wordpress_site_id] = true;
      // Update settings to match existing publish settings
      setPublishSettings(prev => ({
        ...prev,
        [ps.wordpress_site_id]: {
          post_type: ps.wp_post_type || 'post',
          wp_status: ps.wp_status || 'draft',
        }
      }));
    });
    setSelectedSites(preSelected);
    setPublishDialogOpen(true);
  };

  const toggleSiteSelection = (siteId) => {
    setSelectedSites(prev => ({
      ...prev,
      [siteId]: !prev[siteId]
    }));
  };

  const updateSiteSettings = (siteId, field, value) => {
    setPublishSettings(prev => ({
      ...prev,
      [siteId]: {
        ...prev[siteId],
        [field]: value
      }
    }));
  };

  // Featured Image handlers
  const handleImageSelect = async (siteId, file) => {
    if (!file) return;
    
    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Invalid file type. Please use JPEG, PNG, GIF, or WebP.');
      return;
    }
    
    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File too large. Maximum size is 5MB.');
      return;
    }
    
    setUploadingSiteId(siteId);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await axios.post(
        `${API}/content/${contentId}/featured-images/${siteId}`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      
      setFeaturedImages(prev => ({
        ...prev,
        [siteId]: response.data
      }));
      
      toast.success('Featured image uploaded');
    } catch (error) {
      toast.error('Failed to upload image');
    } finally {
      setUploadingSiteId(null);
    }
  };

  const handleRemoveImage = async (siteId) => {
    try {
      await axios.delete(`${API}/content/${contentId}/featured-images/${siteId}`);
      setFeaturedImages(prev => {
        const newImages = { ...prev };
        delete newImages[siteId];
        return newImages;
      });
      toast.success('Featured image removed');
    } catch (error) {
      toast.error('Failed to remove image');
    }
  };

  const getImageUrl = (image) => {
    if (!image) return null;
    return `${API}/uploads/featured_images/${image.file_storage_key}`;
  };

  const handlePublish = async () => {
    const targets = Object.entries(selectedSites)
      .filter(([_, isSelected]) => isSelected)
      .map(([siteId]) => ({
        site_id: siteId,
        post_type: publishSettings[siteId]?.post_type || 'post',
        wp_status: publishSettings[siteId]?.wp_status || 'draft',
      }));

    if (targets.length === 0) {
      toast.error('Please select at least one site');
      return;
    }

    setPublishing(true);
    try {
      const response = await axios.post(`${API}/content/${contentId}/publish`, { targets });
      
      // Show results
      const successCount = response.data.results.filter(r => r.success).length;
      const failCount = response.data.results.filter(r => !r.success).length;
      
      if (successCount > 0 && failCount === 0) {
        toast.success(`Published to ${successCount} site(s) successfully!`);
      } else if (successCount > 0 && failCount > 0) {
        toast.warning(`Published to ${successCount} site(s), ${failCount} failed`);
      } else {
        toast.error('Failed to publish to all selected sites');
      }
      
      // Refresh content to get updated publish statuses
      await fetchContent();
      setPublishDialogOpen(false);
    } catch (error) {
      toast.error('Failed to publish to WordPress');
    } finally {
      setPublishing(false);
    }
  };

  const getPublishStatusForSite = (siteId) => {
    return content?.publish_statuses?.find(ps => ps.wordpress_site_id === siteId);
  };

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-8 bg-zinc-800 rounded w-48 mb-8" />
        <div className="h-64 bg-zinc-800 rounded-xl" />
      </div>
    );
  }

  if (!content) return null;

  const TypeIcon = typeIcons[content.type] || FileText;
  const hasPublishedSites = content.publish_statuses?.some(ps => ps.sync_status === 'synced');

  return (
    <div data-testid="content-detail-page">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Button
          variant="ghost"
          size="icon"
          data-testid="back-btn"
          onClick={() => navigate('/content')}
          className="text-zinc-400 hover:text-white hover:bg-white/5"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-white">{content.title}</h1>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[content.status]}`}>
              {statusLabels[content.status]}
            </span>
          </div>
          <div className="flex items-center gap-4 text-sm text-zinc-500">
            <span className="flex items-center gap-1">
              <TypeIcon className="w-4 h-4" />
              {content.type.charAt(0).toUpperCase() + content.type.slice(1)}
            </span>
            <span>Updated {format(parseISO(content.updated_at), 'MMM d, yyyy')}</span>
          </div>
        </div>
        
        {isEditor && wpSites.length > 0 && (
          <Button
            data-testid="publish-wp-btn"
            onClick={openPublishDialog}
            className="gap-2 bg-violet-500 hover:bg-violet-600 text-white"
          >
            <Upload className="w-4 h-4" />
            {hasPublishedSites ? 'Sync to WordPress' : 'Publish to WordPress'}
          </Button>
        )}
      </div>

      {/* WordPress Publish Statuses */}
      {content.publish_statuses && content.publish_statuses.length > 0 && (
        <div className="mb-6 space-y-3">
          <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">WordPress Publishing</h3>
          {content.publish_statuses.map((ps) => {
            const config = syncStatusConfig[ps.sync_status] || syncStatusConfig.not_synced;
            const SyncIcon = config.icon;
            const image = ps.featured_image;
            
            return (
              <div
                key={ps.id}
                className={`flex items-start justify-between p-4 rounded-xl border ${
                  ps.sync_status === 'synced' 
                    ? 'bg-green-500/10 border-green-500/30' 
                    : ps.sync_status === 'failed'
                    ? 'bg-orange-500/10 border-orange-500/30'
                    : 'bg-zinc-800/50 border-zinc-700'
                }`}
              >
                <div className="flex items-start gap-4">
                  {/* Featured Image Thumbnail */}
                  {image && (
                    <div className="w-16 h-16 rounded-lg overflow-hidden bg-zinc-800 flex-shrink-0">
                      <img
                        src={getImageUrl(image)}
                        alt="Featured"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <div className="flex items-start gap-3">
                    <SyncIcon className={`w-5 h-5 mt-0.5 ${config.color}`} />
                    <div>
                      <p className="text-white font-medium">
                        {ps.wordpress_site_name}
                      </p>
                      <p className="text-sm text-zinc-400">
                        {ps.wp_post_type} / {ps.wp_status}
                        {image && (
                          <span className="ml-2 text-violet-400">
                            • Featured image {image.sync_status === 'synced' ? '✓' : image.sync_status === 'failed' ? '✗' : '...'}
                          </span>
                        )}
                        {ps.sync_status === 'synced' && ps.last_synced_at && (
                          <> • Synced {format(parseISO(ps.last_synced_at), 'MMM d, yyyy HH:mm')}</>
                        )}
                        {ps.sync_status === 'failed' && ps.sync_error_message && (
                          <span className="text-rose-400 block mt-1">{ps.sync_error_message}</span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {ps.wp_permalink && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(ps.wp_permalink, '_blank')}
                      className="gap-2 bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                    >
                      <ExternalLink className="w-4 h-4" />
                      View
                    </Button>
                  )}
                  {ps.sync_status === 'failed' && isEditor && (
                    <Button
                      size="sm"
                      onClick={openPublishDialog}
                      className="gap-2 bg-orange-500 hover:bg-orange-600 text-white"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Retry
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Content Details */}
      <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-white">Content Details</h2>
          {!isEditing ? (
            isEditor && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  data-testid="edit-content-btn"
                  onClick={() => setIsEditing(true)}
                  className="gap-2 bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                >
                  <Edit2 className="w-4 h-4" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  data-testid="delete-content-btn"
                  onClick={() => setDeleteDialogOpen(true)}
                  className="gap-2 bg-transparent border-zinc-700 text-orange-500 hover:bg-orange-500/10 hover:text-rose-400"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </Button>
              </div>
            )
          ) : (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsEditing(false);
                  setEditData({ ...content, tags: content.tags?.join(', ') || '' });
                }}
                className="gap-2 bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              >
                <X className="w-4 h-4" />
                Cancel
              </Button>
              <Button
                size="sm"
                data-testid="save-content-btn"
                onClick={handleSave}
                disabled={saving}
                className="gap-2 bg-orange-500 hover:bg-orange-600 text-white"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          )}
        </div>

        {isEditing ? (
          <div className="space-y-5">
            <div className="space-y-2">
              <Label className="text-zinc-300">Title</Label>
              <Input
                data-testid="edit-title-input"
                value={editData.title}
                onChange={(e) => setEditData({ ...editData, title: e.target.value })}
                className="bg-[#27272a] border-zinc-700 text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-300">Type</Label>
                <Select
                  value={editData.type}
                  onValueChange={(value) => setEditData({ ...editData, type: value })}
                >
                  <SelectTrigger className="bg-[#27272a] border-zinc-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#18181b] border-zinc-800">
                    <SelectItem value="text" className="text-zinc-300 focus:text-white focus:bg-zinc-800">Text</SelectItem>
                    <SelectItem value="link" className="text-zinc-300 focus:text-white focus:bg-zinc-800">Link</SelectItem>
                    <SelectItem value="reference" className="text-zinc-300 focus:text-white focus:bg-zinc-800">Reference</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-zinc-300">Status</Label>
                <Select
                  value={editData.status}
                  onValueChange={(value) => setEditData({ ...editData, status: value })}
                >
                  <SelectTrigger className="bg-[#27272a] border-zinc-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#18181b] border-zinc-800">
                    <SelectItem value="draft" className="text-zinc-300 focus:text-white focus:bg-zinc-800">Draft</SelectItem>
                    <SelectItem value="ready" className="text-zinc-300 focus:text-white focus:bg-zinc-800">Ready</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {editData.type === 'link' && (
              <div className="space-y-2">
                <Label className="text-zinc-300">External URL</Label>
                <Input
                  value={editData.external_url}
                  onChange={(e) => setEditData({ ...editData, external_url: e.target.value })}
                  className="bg-[#27272a] border-zinc-700 text-white"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-zinc-300">Body</Label>
              <RichTextEditor
                id="edit-content-body"
                value={editData.body}
                onChange={(content) => setEditData({ ...editData, body: content })}
                placeholder="Write your content here..."
                height={350}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-zinc-300">Excerpt</Label>
              <Textarea
                value={editData.excerpt}
                onChange={(e) => setEditData({ ...editData, excerpt: e.target.value })}
                className="bg-[#27272a] border-zinc-700 text-white resize-none"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-zinc-300">Tags (comma-separated)</Label>
              <Input
                value={editData.tags}
                onChange={(e) => setEditData({ ...editData, tags: e.target.value })}
                className="bg-[#27272a] border-zinc-700 text-white"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {content.external_url && (
              <div>
                <Label className="text-zinc-500 text-xs uppercase tracking-wider">External URL</Label>
                <a
                  href={content.external_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-violet-400 hover:text-violet-300 mt-1"
                >
                  <Globe className="w-4 h-4" />
                  {content.external_url}
                </a>
              </div>
            )}

            {content.excerpt && (
              <div>
                <Label className="text-zinc-500 text-xs uppercase tracking-wider">Excerpt</Label>
                <p className="text-zinc-300 mt-1">{content.excerpt}</p>
              </div>
            )}

            <div>
              <Label className="text-zinc-500 text-xs uppercase tracking-wider">Body</Label>
              <div className="mt-2 p-4 bg-[#27272a] rounded-lg prose prose-invert prose-sm max-w-none">
                {content.body ? (
                  <div 
                    className="text-zinc-300 content-body-display"
                    dangerouslySetInnerHTML={{ __html: content.body }}
                  />
                ) : (
                  <span className="text-zinc-500 italic">No content</span>
                )}
              </div>
              <style>{`
                .content-body-display {
                  font-size: 14px;
                  line-height: 1.6;
                }
                .content-body-display p { margin: 0 0 1em 0; }
                .content-body-display h1, 
                .content-body-display h2, 
                .content-body-display h3, 
                .content-body-display h4 { 
                  color: #ffffff; 
                  margin-top: 1.5em; 
                  margin-bottom: 0.5em; 
                  font-weight: 600;
                }
                .content-body-display h1 { font-size: 1.5em; }
                .content-body-display h2 { font-size: 1.3em; }
                .content-body-display h3 { font-size: 1.15em; }
                .content-body-display a { color: #a78bfa; text-decoration: underline; }
                .content-body-display ul, .content-body-display ol { padding-left: 1.5em; margin: 0.5em 0; }
                .content-body-display li { margin: 0.25em 0; }
                .content-body-display blockquote { 
                  border-left: 3px solid #a78bfa; 
                  margin: 1em 0;
                  padding-left: 1em; 
                  color: #a1a1aa;
                  font-style: italic;
                }
                .content-body-display pre { 
                  background-color: #18181b; 
                  padding: 1em; 
                  border-radius: 6px; 
                  overflow-x: auto;
                  margin: 1em 0;
                }
                .content-body-display code { 
                  background-color: #18181b; 
                  padding: 0.2em 0.4em; 
                  border-radius: 3px; 
                  font-size: 0.9em;
                  font-family: monospace;
                }
                .content-body-display table { 
                  border-collapse: collapse; 
                  width: 100%; 
                  margin: 1em 0;
                }
                .content-body-display td, .content-body-display th { 
                  border: 1px solid #3f3f46; 
                  padding: 8px; 
                }
                .content-body-display th { background-color: #18181b; }
                .content-body-display img { max-width: 100%; height: auto; border-radius: 6px; margin: 1em 0; }
                .content-body-display strong, .content-body-display b { font-weight: 600; }
                .content-body-display em, .content-body-display i { font-style: italic; }
              `}</style>
            </div>

            {content.tags && content.tags.length > 0 && (
              <div>
                <Label className="text-zinc-500 text-xs uppercase tracking-wider">Tags</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {content.tags.map((tag, index) => (
                    <span
                      key={index}
                      className="px-2 py-1 bg-zinc-800 text-zinc-300 rounded text-sm flex items-center gap-1"
                    >
                      <Tag className="w-3 h-3" />
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Multi-site Publish Dialog with Featured Images */}
      <Dialog open={publishDialogOpen} onOpenChange={setPublishDialogOpen}>
        <DialogContent className="bg-[#18181b] border-zinc-800 text-white sm:max-w-[700px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              Publish to WordPress
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              Select target sites and optionally add featured images for each.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            {wpSites.length === 0 ? (
              <div className="text-center py-8">
                <Globe className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
                <p className="text-zinc-400">No WordPress sites configured.</p>
                <p className="text-sm text-zinc-500">Ask an admin to add a WordPress site.</p>
              </div>
            ) : (
              wpSites.map((site) => {
                const publishStatus = getPublishStatusForSite(site.id);
                const isSelected = selectedSites[site.id];
                const settings = publishSettings[site.id] || {};
                const image = featuredImages[site.id];
                const isUploading = uploadingSiteId === site.id;
                
                return (
                  <div
                    key={site.id}
                    className={`p-4 rounded-xl border transition-colors ${
                      isSelected 
                        ? 'border-violet-500/50 bg-violet-500/5' 
                        : 'border-zinc-800 bg-[#27272a]'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox
                        id={`site-${site.id}`}
                        checked={isSelected}
                        onCheckedChange={() => toggleSiteSelection(site.id)}
                        className="mt-1 border-zinc-600 data-[state=checked]:bg-violet-500 data-[state=checked]:border-violet-500"
                      />
                      <div className="flex-1">
                        <label 
                          htmlFor={`site-${site.id}`}
                          className="flex items-center gap-2 cursor-pointer"
                        >
                          <span className="font-medium text-white">{site.name}</span>
                          {publishStatus?.sync_status === 'synced' && (
                            <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-green-500/20 text-green-400">
                              <Check className="w-3 h-3" />
                              Published
                            </span>
                          )}
                          {publishStatus?.sync_status === 'failed' && (
                            <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-orange-500/20 text-rose-400">
                              <AlertCircle className="w-3 h-3" />
                              Failed
                            </span>
                          )}
                        </label>
                        <p className="text-sm text-zinc-500 mt-0.5">{site.wp_base_url}</p>
                        
                        {isSelected && (
                          <div className="mt-4 space-y-4">
                            {/* Post Settings */}
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <Label className="text-xs text-zinc-400">Post Type</Label>
                                <Select
                                  value={settings.post_type || 'post'}
                                  onValueChange={(value) => updateSiteSettings(site.id, 'post_type', value)}
                                  disabled={!!publishStatus?.wp_post_id}
                                >
                                  <SelectTrigger className="h-9 bg-[#18181b] border-zinc-700 text-white mt-1">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="bg-[#18181b] border-zinc-800">
                                    <SelectItem value="post" className="text-zinc-300 focus:text-white focus:bg-zinc-800">Post</SelectItem>
                                    <SelectItem value="page" className="text-zinc-300 focus:text-white focus:bg-zinc-800">Page</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div>
                                <Label className="text-xs text-zinc-400">Status</Label>
                                <Select
                                  value={settings.wp_status || 'draft'}
                                  onValueChange={(value) => updateSiteSettings(site.id, 'wp_status', value)}
                                >
                                  <SelectTrigger className="h-9 bg-[#18181b] border-zinc-700 text-white mt-1">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="bg-[#18181b] border-zinc-800">
                                    <SelectItem value="draft" className="text-zinc-300 focus:text-white focus:bg-zinc-800">Draft</SelectItem>
                                    <SelectItem value="publish" className="text-zinc-300 focus:text-white focus:bg-zinc-800">Published</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>

                            {/* Featured Image Section */}
                            <div className="border-t border-zinc-700 pt-4">
                              <Label className="text-xs text-zinc-400 mb-2 block">Featured Image (Optional)</Label>
                              
                              {image ? (
                                <div className="flex items-start gap-3">
                                  <div className="w-24 h-24 rounded-lg overflow-hidden bg-zinc-800 flex-shrink-0">
                                    <img
                                      src={getImageUrl(image)}
                                      alt="Featured"
                                      className="w-full h-full object-cover"
                                    />
                                  </div>
                                  <div className="flex-1">
                                    <p className="text-sm text-zinc-300 truncate">{image.file_name}</p>
                                    <p className="text-xs text-zinc-500">
                                      {(image.size / 1024).toFixed(1)} KB
                                      {image.wp_media_id && (
                                        <span className="text-green-400 ml-2">• Synced to WP</span>
                                      )}
                                    </p>
                                    <div className="flex gap-2 mt-2">
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => fileInputRefs.current[site.id]?.click()}
                                        className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-xs h-7"
                                      >
                                        Replace
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleRemoveImage(site.id)}
                                        className="bg-transparent border-zinc-700 text-rose-400 hover:bg-orange-500/10 text-xs h-7"
                                      >
                                        Remove
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div
                                  onClick={() => fileInputRefs.current[site.id]?.click()}
                                  className="border-2 border-dashed border-zinc-700 rounded-lg p-4 text-center cursor-pointer hover:border-violet-500/50 hover:bg-violet-500/5 transition-colors"
                                >
                                  {isUploading ? (
                                    <div className="flex flex-col items-center">
                                      <Loader2 className="w-6 h-6 text-violet-400 animate-spin mb-2" />
                                      <p className="text-sm text-zinc-400">Uploading...</p>
                                    </div>
                                  ) : (
                                    <div className="flex flex-col items-center">
                                      <Image className="w-6 h-6 text-zinc-500 mb-2" />
                                      <p className="text-sm text-zinc-400">Click to upload featured image</p>
                                      <p className="text-xs text-zinc-500 mt-1">JPEG, PNG, GIF, WebP • Max 5MB</p>
                                    </div>
                                  )}
                                </div>
                              )}
                              
                              <input
                                ref={el => fileInputRefs.current[site.id] = el}
                                type="file"
                                accept="image/jpeg,image/png,image/gif,image/webp"
                                className="hidden"
                                onChange={(e) => handleImageSelect(site.id, e.target.files[0])}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="flex gap-3 pt-4 border-t border-zinc-800 mt-4">
            <Button
              variant="outline"
              onClick={() => setPublishDialogOpen(false)}
              className="flex-1 bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            >
              Cancel
            </Button>
            <Button
              data-testid="confirm-publish-btn"
              onClick={handlePublish}
              disabled={publishing || Object.values(selectedSites).filter(Boolean).length === 0}
              className="flex-1 bg-violet-500 hover:bg-violet-600 text-white"
            >
              {publishing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Publishing...
                </>
              ) : (
                `Publish to ${Object.values(selectedSites).filter(Boolean).length} Site(s)`
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-[#18181b] border-zinc-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Content</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              Are you sure you want to delete "{content.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ContentDetailPage;
