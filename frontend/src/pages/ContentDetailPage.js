import { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
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

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const typeIcons = {
  text: FileText,
  link: Link,
  reference: BookOpen,
};

const statusColors = {
  draft: 'bg-zinc-500/20 text-zinc-400',
  ready: 'bg-violet-500/20 text-violet-400',
  published: 'bg-green-500/20 text-green-400',
};

const statusLabels = {
  draft: 'Draft',
  ready: 'Ready',
  published: 'Published',
};

const syncStatusConfig = {
  not_synced: { icon: Clock, color: 'text-zinc-500', label: 'Not synced' },
  synced: { icon: CheckCircle, color: 'text-green-500', label: 'Synced' },
  failed: { icon: AlertCircle, color: 'text-rose-500', label: 'Failed' },
};

const ContentDetailPage = () => {
  const { contentId } = useParams();
  const navigate = useNavigate();
  const { isEditor } = useAuth();
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [editData, setEditData] = useState({});
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishOptions, setPublishOptions] = useState({
    post_type: 'post',
    wp_status: 'draft',
  });
  const [hasWpConnection, setHasWpConnection] = useState(false);

  useEffect(() => {
    fetchContent();
    checkWpConnection();
  }, [contentId]);

  const fetchContent = async () => {
    try {
      const response = await axios.get(`${API}/content/${contentId}`);
      setContent(response.data);
      setEditData({
        ...response.data,
        tags: response.data.tags?.join(', ') || '',
      });
    } catch (error) {
      toast.error('Failed to load content');
      navigate('/content');
    } finally {
      setLoading(false);
    }
  };

  const checkWpConnection = async () => {
    try {
      const response = await axios.get(`${API}/wordpress/connection`);
      setHasWpConnection(!!response.data);
    } catch {
      setHasWpConnection(false);
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

  const handlePublish = async () => {
    setPublishing(true);
    try {
      const response = await axios.post(`${API}/content/${contentId}/publish`, publishOptions);
      setContent(response.data);
      setPublishDialogOpen(false);
      
      if (response.data.sync_status === 'synced') {
        toast.success('Published to WordPress!');
      } else {
        toast.error(`Publish failed: ${response.data.sync_error_message}`);
      }
    } catch (error) {
      toast.error('Failed to publish to WordPress');
    } finally {
      setPublishing(false);
    }
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
  const syncConfig = syncStatusConfig[content.sync_status];
  const SyncIcon = syncConfig?.icon || Clock;

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
        
        {isEditor && hasWpConnection && (
          <Button
            data-testid="publish-wp-btn"
            onClick={() => setPublishDialogOpen(true)}
            className="gap-2 bg-violet-500 hover:bg-violet-600 text-white"
          >
            <Upload className="w-4 h-4" />
            {content.wp_post_id ? 'Sync to WordPress' : 'Publish to WordPress'}
          </Button>
        )}
      </div>

      {/* WordPress Sync Status */}
      {content.wp_post_id && (
        <div className={`flex items-center justify-between p-4 mb-6 rounded-xl border ${
          content.sync_status === 'synced' 
            ? 'bg-green-500/10 border-green-500/30' 
            : content.sync_status === 'failed'
            ? 'bg-rose-500/10 border-rose-500/30'
            : 'bg-zinc-800/50 border-zinc-700'
        }`}>
          <div className="flex items-center gap-3">
            <SyncIcon className={`w-5 h-5 ${syncConfig.color}`} />
            <div>
              <p className="text-white font-medium">
                WordPress {content.wp_post_type}: {content.wp_status}
              </p>
              <p className="text-sm text-zinc-400">
                {content.sync_status === 'synced' && content.last_synced_at && (
                  <>Last synced {format(parseISO(content.last_synced_at), 'MMM d, yyyy HH:mm')}</>
                )}
                {content.sync_status === 'failed' && content.sync_error_message && (
                  <span className="text-rose-400">{content.sync_error_message}</span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {content.wp_permalink && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(content.wp_permalink, '_blank')}
                className="gap-2 bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              >
                <ExternalLink className="w-4 h-4" />
                View on WP
              </Button>
            )}
            {content.sync_status === 'failed' && isEditor && (
              <Button
                size="sm"
                onClick={() => setPublishDialogOpen(true)}
                className="gap-2 bg-rose-500 hover:bg-rose-600 text-white"
              >
                <RefreshCw className="w-4 h-4" />
                Retry
              </Button>
            )}
          </div>
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
                  className="gap-2 bg-transparent border-zinc-700 text-rose-500 hover:bg-rose-500/10 hover:text-rose-400"
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
                className="gap-2 bg-rose-500 hover:bg-rose-600 text-white"
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
                    <SelectItem value="published" className="text-zinc-300 focus:text-white focus:bg-zinc-800">Published</SelectItem>
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
              <Textarea
                value={editData.body}
                onChange={(e) => setEditData({ ...editData, body: e.target.value })}
                className="bg-[#27272a] border-zinc-700 text-white resize-none min-h-[200px]"
                rows={8}
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
              <div className="mt-2 p-4 bg-[#27272a] rounded-lg">
                <pre className="text-zinc-300 whitespace-pre-wrap font-sans text-sm">
                  {content.body || <span className="text-zinc-500 italic">No content</span>}
                </pre>
              </div>
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

      {/* Publish to WordPress Dialog */}
      <Dialog open={publishDialogOpen} onOpenChange={setPublishDialogOpen}>
        <DialogContent className="bg-[#18181b] border-zinc-800 text-white sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              {content.wp_post_id ? 'Sync to WordPress' : 'Publish to WordPress'}
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              {content.wp_post_id 
                ? 'Update the existing WordPress post with latest content.'
                : 'Create a new post on your WordPress site.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label className="text-zinc-300">Post Type</Label>
              <Select
                value={publishOptions.post_type}
                onValueChange={(value) => setPublishOptions({ ...publishOptions, post_type: value })}
                disabled={!!content.wp_post_id}
              >
                <SelectTrigger className="bg-[#27272a] border-zinc-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#18181b] border-zinc-800">
                  <SelectItem value="post" className="text-zinc-300 focus:text-white focus:bg-zinc-800">Post</SelectItem>
                  <SelectItem value="page" className="text-zinc-300 focus:text-white focus:bg-zinc-800">Page</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-zinc-300">WordPress Status</Label>
              <Select
                value={publishOptions.wp_status}
                onValueChange={(value) => setPublishOptions({ ...publishOptions, wp_status: value })}
              >
                <SelectTrigger className="bg-[#27272a] border-zinc-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#18181b] border-zinc-800">
                  <SelectItem value="draft" className="text-zinc-300 focus:text-white focus:bg-zinc-800">Draft</SelectItem>
                  <SelectItem value="publish" className="text-zinc-300 focus:text-white focus:bg-zinc-800">Published</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
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
              disabled={publishing}
              className="flex-1 bg-violet-500 hover:bg-violet-600 text-white"
            >
              {publishing ? 'Publishing...' : content.wp_post_id ? 'Sync' : 'Publish'}
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
              className="bg-rose-500 hover:bg-rose-600 text-white"
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
