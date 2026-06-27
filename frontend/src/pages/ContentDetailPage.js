/* eslint-disable */
import { useState, useEffect, useRef, useContext, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { format, parseISO } from 'date-fns';
import { motion } from 'framer-motion';
import ImageResizeDialog from '../components/ImageResizeDialog';
import ImageCopyrightDialog from '../components/ImageCopyrightDialog';
import ImageRightsModal from '../components/ImageRightsModal';
import LiveblogPanel from '../components/LiveblogPanel';
import MainSiteContext from '../context/MainSiteContext';
import PublishToButton from '../components/ClaraCustom/PublishToButton';
import { isImageFile, isOversized } from '../utils/imageResize';
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
  Folder,
  CheckCircle,
  AlertCircle,
  Clock,
  Upload,
  RefreshCw,
  ExternalLink,
  Check,
  Image,
  Loader2,
  User,
  History,
  Download,
  ChevronDown,
  ChevronUp,
  Calendar,
  Sparkles,
  Pencil,
  Undo2,
  Copyright,
  Send,
  Image as ImageIcon,
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
  DialogFooter,
} from '../components/ui/dialog';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../context/PermissionsContext';
import RichTextEditor from '../components/RichTextEditor';
import { claraToast } from '../utils/claraToast';
import { useClaraAssistant } from '../context/ClaraAssistantContext';
import ClaraErrorButton from '../components/ClaraErrorButton';

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
  not_synced: { icon: Clock, color: 'text-zinc-500', bgColor: 'bg-zinc-200', label: 'Not synced' },
  synced: { icon: CheckCircle, color: 'text-green-500', bgColor: 'bg-green-500/10', label: 'Synced' },
  scheduled: { icon: Calendar, color: 'text-orange-500', bgColor: 'bg-orange-500/10', label: 'Scheduled' },
  failed: { icon: AlertCircle, color: 'text-red-500', bgColor: 'bg-red-500/10', label: 'Failed' },
};

const ContentDetailPage = () => {
  const { contentId, mainSiteSlug } = useParams();
  const navigate = useNavigate();
  const mainSiteCtx = useContext(MainSiteContext);
  const parentMainSite = mainSiteCtx?.mainSite || null;
  const { isEditor: legacyIsEditor, isAdmin, token } = useAuth();
  const { canEdit, canDelete, canCreate } = usePermissions();
  const { registerEditor, unregisterEditor, openClara } = useClaraAssistant();
  const isEditor = canEdit('content_library') || canCreate('content_library') || legacyIsEditor;
  const [content, setContent] = useState(null);
  const [wpSites, setWpSites] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [editData, setEditData] = useState({});
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishStep, setPublishStep] = useState('configure'); // 'configure' | 'deploying'

  // Clara native publish (independent of WordPress)
  const [claraPublishBusy, setClaraPublishBusy] = useState(false);
  const claraPublishEnabled = useMemo(() => {
    const feats = parentMainSite?.enabled_features || [];
    return Array.isArray(feats) && feats.includes('clara_publish');
  }, [parentMainSite]);

  const publishViaClara = useCallback(async () => {
    if (!contentId) return;
    setClaraPublishBusy(true);
    try {
      const r = await axios.post(`${API}/content/${contentId}/publish-clara`, null);
      toast.success(r.data?.public_url ? `Published — ${r.data.public_url}` : 'Published to Clara News');
      // Reload content to refresh status
      fetchContent();
    } catch (e) {
      const detail = e.response?.data?.detail || 'Publish to Clara failed';
      toast.error(detail);
    } finally {
      setClaraPublishBusy(false);
    }
  }, [contentId]); // eslint-disable-line

  const unpublishViaClara = useCallback(async () => {
    if (!contentId) return;
    if (!window.confirm('Unpublish this article from Clara News? It will disappear from the public News API immediately.')) return;
    setClaraPublishBusy(true);
    try {
      await axios.post(`${API}/content/${contentId}/unpublish-clara`, null);
      toast.success('Unpublished from Clara News');
      fetchContent();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Unpublish failed');
    } finally {
      setClaraPublishBusy(false);
    }
  }, [contentId]); // eslint-disable-line
  const [deployStatus, setDeployStatus] = useState(0);
  const [deployDone, setDeployDone] = useState(false);
  const [deployFailed, setDeployFailed] = useState(false);
  const [deployFailStep, setDeployFailStep] = useState(-1);
  const [deployErrorMsg, setDeployErrorMsg] = useState('');
  // Multi-site publish state
  const [selectedSites, setSelectedSites] = useState({});
  const [publishSettings, setPublishSettings] = useState({});
  // Featured images state per site
  const [featuredImages, setFeaturedImages] = useState({});

  // Photo credit/copyright dialog state
  const [credDialogOpen, setCredDialogOpen] = useState(false);
  const [credDialogTarget, setCredDialogTarget] = useState(null); // { siteId, image }

  const openCreditDialog = (siteId, image) => {
    setCredDialogTarget({ siteId, image });
    setCredDialogOpen(true);
  };

  const saveCreditForTarget = async (data) => {
    if (!credDialogTarget) return;
    const { siteId } = credDialogTarget;
    try {
      const r = await axios.put(
        `${API}/content/${contentId}/featured-images/${siteId}/attribution`,
        data
      );
      setFeaturedImages((prev) => ({ ...prev, [siteId]: r.data.featured_image }));
      toast.success('Attribution saved');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not save attribution');
    }
  };
  const [uploadingSiteId, setUploadingSiteId] = useState(null);
  const fileInputRefs = useRef({});
  // Image resize state
  const [resizeFile, setResizeFile] = useState(null);
  const [resizeSiteId, setResizeSiteId] = useState(null);
  // Canva social media popup
  const [canvaPrompt, setCanvaPrompt] = useState({ open: false, slug: '', name: '' });
  // Audit log state
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLogsExpanded, setAuditLogsExpanded] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [loadingAuditLogs, setLoadingAuditLogs] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  // Rollback state
  const [rollbackTarget, setRollbackTarget] = useState(null); // holds the log entry to rollback
  const [rollingBack, setRollingBack] = useState(false);
  
  // Helper for context-aware navigation - uses URL param directly
  const navTo = (path) => mainSiteSlug ? `/${mainSiteSlug}${path}` : path;


  // Register editor content with Clara Assistant context
  useEffect(() => {
    if (isEditing && editData) {
      registerEditor(
        editData.body,
        editData.title,
        (newContent) => setEditData(prev => ({ ...prev, body: newContent })),
        (newTitle) => setEditData(prev => ({ ...prev, title: newTitle }))
      );
    }
    return () => unregisterEditor();
  }, [isEditing, editData?.body, editData?.title]);

  useEffect(() => {
    fetchContent();
    fetchWpSites();
    fetchCategories();
  }, [contentId]);

  const fetchCategories = async () => {
    try {
      const response = await axios.get(`${API}/content/categories`);
      setCategories(response.data);
    } catch {
      setCategories([]);
    }
  };

  const fetchAuditLogs = async () => {
    setLoadingAuditLogs(true);
    try {
      const response = await axios.get(`${API}/content/${contentId}/audit-logs`);
      setAuditLogs(response.data);
    } catch (error) {
      toast.error('Failed to load audit logs');
    } finally {
      setLoadingAuditLogs(false);
    }
  };

  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      const response = await axios.get(`${API}/content/${contentId}/audit-logs/export-pdf`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `audit_log_${contentId.slice(0, 8)}_${new Date().toISOString().slice(0, 10)}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success('PDF exported successfully');
    } catch (error) {
      toast.error('Failed to export PDF');
    } finally {
      setExportingPdf(false);
    }
  };

  const toggleAuditLogs = () => {
    if (!auditLogsExpanded && auditLogs.length === 0) {
      fetchAuditLogs();
    }
    setAuditLogsExpanded(!auditLogsExpanded);
  };

  const handleRollback = async () => {
    if (!rollbackTarget) return;
    setRollingBack(true);
    try {
      await axios.post(`${API}/content/${contentId}/rollback/${rollbackTarget.id}`);
      toast.success('Rolled back successfully');
      setRollbackTarget(null);
      await fetchContent();
      await fetchAuditLogs();
    } catch (error) {
      const detail = error.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Rollback failed');
    } finally {
      setRollingBack(false);
    }
  };

  const fetchContent = async () => {
    try {
      const response = await axios.get(`${API}/content/${contentId}`);
      setContent(response.data);
      setEditData({
        ...response.data,
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
      claraToast.error('Failed to load content', openClara, 'Content loading');
      navigate(navTo('/content'));
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
        category_id: editData.category_id || null,
        status: editData.status,
      });
      setContent(response.data);
      setIsEditing(false);
      toast.success('Content updated');
    } catch (error) {
      const detail = error.response?.data?.detail;
      const msg = typeof detail === 'string' ? detail
        : Array.isArray(detail) && detail[0]?.msg ? detail[0].msg
        : 'Failed to update content';
      claraToast.error(msg, openClara, 'Content editing');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      const r = await axios.delete(`${API}/content/${contentId}`);
      const wpFails = (r.data?.wordpress_deletions || []).filter((d) => !d.success).length;
      if (wpFails > 0) {
        toast.success(`Content deleted (WordPress sync failed on ${wpFails} site${wpFails === 1 ? '' : 's'})`);
      } else {
        toast.success('Content deleted');
      }
      navigate(navTo('/content'));
    } catch (error) {
      const detail = error.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Failed to delete content');
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
    setPublishStep('configure');
    setDeployStatus(0);
    setDeployDone(false);
    setDeployFailed(false);
    setDeployFailStep(-1);
    setDeployErrorMsg('');
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
    
    // Check if file needs resizing
    if (isOversized(file) && isImageFile(file)) {
      setResizeFile(file);
      setResizeSiteId(siteId);
      return;
    }
    
    await uploadFeaturedImage(siteId, file);
  };

  const uploadFeaturedImage = async (siteId, file) => {
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

  const handleResized = (resizedFile) => {
    const siteId = resizeSiteId;
    setResizeFile(null);
    setResizeSiteId(null);
    uploadFeaturedImage(siteId, resizedFile);
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

  // ── Image rights / inline attribution ────────────────────────────────
  const [imageRights, setImageRights] = useState({ images: [], featured: null, missing: 0, total: 0, all_credited: true });
  const [showRightsModal, setShowRightsModal] = useState(false);
  const [endLiveblogOpen, setEndLiveblogOpen] = useState(false);
  const [endingLiveblog, setEndingLiveblog] = useState(false);

  const endLiveblog = async (deleteEntries) => {
    setEndingLiveblog(true);
    try {
      const res = await axios.post(
        `${API}/content/${contentId}/liveblog/end?delete_entries=${deleteEntries}`,
        {},
      );
      setContent((prev) => ({ ...prev, ...res.data }));
      toast.success(deleteEntries ? 'Liveblog ended, entries deleted' : 'Liveblog ended — entries kept');
      setEndLiveblogOpen(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not end liveblog');
    } finally {
      setEndingLiveblog(false);
    }
  };
  const [rightsAutoOpenedFor, setRightsAutoOpenedFor] = useState(null); // contentId where popup already auto-opened

  const fetchImageRights = useCallback(async () => {
    if (!contentId) return;
    try {
      const res = await axios.get(`${API}/content/${contentId}/image-rights`);
      const data = res.data || { images: [], featured: null, missing: 0, total: 0, all_credited: true };
      setImageRights(data);
      // Auto-open the reminder popup once per article load if rights are missing
      if ((data.missing || 0) > 0 && rightsAutoOpenedFor !== contentId) {
        setShowRightsModal(true);
        setRightsAutoOpenedFor(contentId);
      }
    } catch (e) {
      // Silent — endpoint missing on older backends is fine.
    }
  }, [contentId, rightsAutoOpenedFor]);

  useEffect(() => { if (content) fetchImageRights(); }, [content, fetchImageRights]);

  const handleRightsSaved = (status) => {
    if (status) setImageRights(status);
    // Reload content so any related UI (publish button, library badge) refreshes
    fetchContent();
  };
  // ──────────────────────────────────────────────────────────────────────

  const getImageUrl = (image) => {
    if (!image) return null;
    // Use S3 URL if available, otherwise use local API endpoint
    if (image.s3_url) return image.s3_url;
    if (image.url) return image.url;
    if (image.file_storage_key) return `${API}/uploads/featured_images/${image.file_storage_key}`;
    return null;
  };

  // Resolve the article-level featured image (for the News API preview card)
  // following the same priority order the backend uses for `_build_image_url`.
  const getArticleFeaturedImage = () => {
    const fi = content?.featured_image;
    const url = getImageUrl(fi);
    if (url) return { url, source: 'featured' };
    const ext = content?.external_featured_image || content?.imported_image_url;
    if (ext) return { url: ext, source: 'imported' };
    return null;
  };

  // Delete the article-level featured image (the per-WordPress-site ones
  // have their own remove button on the WP cards below).
  const removeArticleFeaturedImage = async () => {
    if (!window.confirm('Remove the featured image?')) return;
    try {
      await axios.delete(`${API}/content/${contentId}/featured-image`);
      toast.success('Featured image removed');
      await fetchContent();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not remove image');
    }
  };

  // News API featured image upload — writes to the content item's own
  // `featured_image` field (different storage from the per-WordPress-site
  // featured images). Triggers a content reload so the publish button
  // becomes active immediately.
  const newsFeaturedInputRef = useRef(null);
  const [newsFeaturedUploading, setNewsFeaturedUploading] = useState(false);
  const handleNewsFeaturedSelected = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setNewsFeaturedUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await axios.post(`${API}/content/${contentId}/featured-image`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('Featured image uploaded');
      await fetchContent();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not upload featured image');
    } finally {
      setNewsFeaturedUploading(false);
    }
  };

  const handlePublish = async () => {
    const targets = Object.entries(selectedSites)
      .filter(([_, isSelected]) => isSelected)
      .map(([siteId]) => {
        const settings = publishSettings[siteId] || {};
        const target = {
          site_id: siteId,
          post_type: settings.post_type || 'post',
          wp_status: settings.wp_status || 'draft',
        };
        if (settings.wp_status === 'future' && settings.scheduled_date) {
          target.scheduled_date = new Date(settings.scheduled_date).toISOString();
        }
        return target;
      });

    if (targets.length === 0) {
      toast.error('Please select at least one site');
      return;
    }

    const scheduledWithoutDate = targets.filter(t => t.wp_status === 'future' && !t.scheduled_date);
    if (scheduledWithoutDate.length > 0) {
      toast.error('Please select a date and time for scheduled posts');
      return;
    }

    // Switch to deploy animation
    setPublishStep('deploying');
    setDeployStatus(0);
    setDeployDone(false);
    setDeployFailed(false);
    setDeployFailStep(-1);
    setDeployErrorMsg('');

    const targetSiteNames = targets.map(t => wpSites.find(s => s.id === t.site_id)?.name || 'WordPress').join(', ');

    // Step 0: Preparing content (local)
    await new Promise(r => setTimeout(r, 1000));
    setDeployStatus(1);

    // Step 1: API endpoint communication - make the actual call here
    await new Promise(r => setTimeout(r, 800));
    setPublishing(true);
    try {
      const response = await axios.post(`${API}/content/${contentId}/publish`, { targets });
      
      const successCount = response.data.results.filter(r => r.success).length;
      const failCount = response.data.results.filter(r => !r.success).length;

      if (failCount > 0 && successCount === 0) {
        // All failed - mark step 1 as failed
        const failedSites = response.data.results.filter(r => !r.success);
        const errorMsg = failedSites.map(f => `${f.site_name}: ${f.message}`).join('; ');
        setDeployFailed(true);
        setDeployFailStep(1);
        setDeployErrorMsg(errorMsg);
        setDeployDone(true);
        claraToast.error(`WordPress publish failed: ${errorMsg}`, openClara, 'WordPress publishing');
      } else {
        // Step 2: Publishing succeeded (at least partially)
        setDeployStatus(2);
        await new Promise(r => setTimeout(r, 1000));
        
        // Step 3: Finalizing
        setDeployStatus(3);
        await new Promise(r => setTimeout(r, 800));
        setDeployDone(true);

        if (successCount > 0 && failCount === 0) {
          toast.success(`Published to ${successCount} site(s) successfully!`);
        } else {
          const failedSites = response.data.results.filter(r => !r.success);
          toast.warning(`Published to ${successCount}, ${failCount} failed: ${failedSites.map(f => `${f.site_name}: ${f.message}`).join('; ')}`);
        }
      }
      
      await fetchContent();

      if (successCount > 0) {
        try {
          const mainSiteRes = await axios.get(`${API}/main-sites`);
          const site = mainSiteRes.data.find(s => s.slug === mainSiteSlug);
          if (site) {
            const canvaRes = await axios.get(`${API}/canva/check-linked/${site.id}`);
            if (canvaRes.data.available) {
              setCanvaPrompt({
                open: true,
                slug: canvaRes.data.canva_server_slug,
                name: canvaRes.data.canva_server_name,
              });
            }
          }
        } catch { /* Canva not available */ }
      }
    } catch (error) {
      // Network error or API unreachable - fail at step 1
      const detail = error?.response?.data?.detail || error?.response?.data?.message || error?.message || 'Unknown error';
      setDeployFailed(true);
      setDeployFailStep(1);
      setDeployErrorMsg(detail);
      setDeployDone(true);
      claraToast.error(`WordPress publish failed: ${detail}`, openClara, 'WordPress publishing');
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
        <div className="h-8 bg-zinc-100 rounded w-48 mb-8" />
        <div className="h-64 bg-zinc-100 rounded-xl" />
      </div>
    );
  }

  if (!content) return null;

  const TypeIcon = typeIcons[content.type] || FileText;
  const hasPublishedSites = content.publish_statuses?.some(ps => ps.sync_status === 'synced');
  const isApproved = content.approval_status === 'approved';
  const isPendingApproval = !content.approval_status || content.approval_status === 'pending';
  const isRejected = content.approval_status === 'rejected';
  
  // Publishing is blocked only for "ready" content that hasn't been approved
  const isPublishBlocked = content.status === 'ready' && !isApproved;

  // News API publish additionally requires a featured image (any source: inline,
  // per-site WP image, or an imported external image URL).
  const hasFeaturedImage = (() => {
    const fi = content?.featured_image;
    if (fi && (fi.s3_url || fi.url || fi.file_storage_key)) return true;
    if (content?.external_featured_image || content?.imported_image_url) return true;
    if (Object.values(featuredImages || {}).some((img) => img && (img.s3_url || img.file_storage_key))) return true;
    return false;
  })();
  const newsApiBlocked = isPublishBlocked || !hasFeaturedImage || (imageRights?.missing || 0) > 0;
  const rightsMissing = (imageRights?.missing || 0) > 0;

  return (
    <div data-testid="content-detail-page">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Button
          variant="ghost"
          size="icon"
          data-testid="back-btn"
          onClick={() => navigate(navTo('/content'))}
          className="text-zinc-400 hover:text-zinc-700 hover:bg-white/5"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-black text-zinc-900">{content.title}</h1>
            {/* Liveblog toggle — auto-save on change */}
            {isEditor && (
              <label
                className={`inline-flex items-center gap-1.5 cursor-pointer select-none px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider transition border ${
                  content.is_liveblog
                    ? 'bg-red-100 text-red-700 border-red-200'
                    : 'bg-white text-zinc-500 border-zinc-300 hover:bg-zinc-50'
                }`}
                data-testid="liveblog-toggle"
                title="Mark this article as a liveblog"
              >
                <input
                  type="checkbox"
                  checked={!!content.is_liveblog}
                  onChange={async (e) => {
                    const checked = e.target.checked;
                    setContent((prev) => ({ ...prev, is_liveblog: checked }));
                    try {
                      const res = await axios.put(`${API}/content/${contentId}`, { is_liveblog: checked });
                      setContent(res.data);
                      toast.success(checked ? 'Liveblog mode enabled' : 'Liveblog mode disabled');
                    } catch (err) {
                      toast.error(err.response?.data?.detail || 'Could not save liveblog setting');
                      setContent((prev) => ({ ...prev, is_liveblog: !checked }));
                    }
                  }}
                  className="w-3 h-3 rounded border-zinc-300 text-red-500 focus:ring-red-500"
                  data-testid="liveblog-toggle-checkbox"
                />
                {content.is_liveblog && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
                Liveblog
              </label>
            )}
            {isEditor && content.is_liveblog && (
              <button
                type="button"
                data-testid="end-liveblog-btn"
                onClick={() => setEndLiveblogOpen(true)}
                title="End liveblog"
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50"
              >
                End liveblog
              </button>
            )}
            {/* Ready check (purple) */}
            {content.status === 'ready' && (
              <span title="Ready" data-testid="ready-check" style={{ color: '#ffffff' }} className="w-6 h-6 rounded-full bg-[#7c1ac8] flex items-center justify-center flex-shrink-0">
                <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
              </span>
            )}
            {/* Approval state */}
            {content.status === 'ready' && isApproved && (
              <span
                title={`Approved by ${content.approved_by_name || 'Unknown'}`}
                data-testid="approved-check"
                className="inline-flex items-center gap-1 group cursor-default"
              >
                <span style={{ color: '#ffffff' }} className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
                  <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
                </span>
                {/* Tooltip */}
                <span className="hidden group-hover:inline-flex items-center gap-1.5 bg-zinc-900 text-white text-xs px-2 py-1 rounded-lg shadow-lg ml-1">
                  {content.approved_by_avatar ? (
                    <img src={content.approved_by_avatar} alt="" className="w-4 h-4 rounded-full object-cover" />
                  ) : (
                    <span className="w-4 h-4 rounded-full bg-zinc-700 flex items-center justify-center text-[8px] font-bold text-zinc-200">
                      {(content.approved_by_name || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  Approved by {content.approved_by_name || 'Unknown'}
                </span>
              </span>
            )}
            {content.status === 'ready' && isRejected && (
              <span title="Rejected" style={{ color: '#ffffff' }} className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0">
                <X className="w-3.5 h-3.5" strokeWidth={2.5} />
              </span>
            )}
            {content.status === 'ready' && !isApproved && !isRejected && (
              <span title="Pending approval" style={{ color: '#ffffff' }} className="w-6 h-6 rounded-full bg-amber-400 flex items-center justify-center flex-shrink-0">
                <Clock className="w-3.5 h-3.5" strokeWidth={2.5} />
              </span>
            )}
            {/* Non-ready status pill */}
            {content.status !== 'ready' && (
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[content.status]}`}>
                {statusLabels[content.status]}
              </span>
            )}
          </div>
          <div className="flex items-center gap-x-3 gap-y-1 text-xs text-zinc-500 flex-wrap">
            <span className="flex items-center gap-1">
              <TypeIcon className="w-3.5 h-3.5" />
              {content.type.charAt(0).toUpperCase() + content.type.slice(1)}
            </span>
            {content.category?.name && (
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: content.category.color || '#dd0c51' }} />
                <span className="text-zinc-700 font-medium">{content.category.name}</span>
              </span>
            )}
            {content.created_by_name && (
              <span className="inline-flex items-center gap-1" title={`Created by ${content.created_by_name}`}>
                {content.created_by_avatar ? (
                  <img src={content.created_by_avatar} alt="" className="w-4 h-4 rounded-full object-cover border border-zinc-200" />
                ) : (
                  <span className="w-4 h-4 rounded-full bg-zinc-200 flex items-center justify-center text-[8px] font-bold text-zinc-600">
                    {content.created_by_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                  </span>
                )}
                <span className="text-zinc-700 font-medium">{content.created_by_name}</span>
              </span>
            )}
            {content.last_edited_by_name && content.last_edited_by_name !== content.created_by_name && (
              <span className="inline-flex items-center gap-1" title={`Last edited by ${content.last_edited_by_name}`}>
                <Pencil className="w-3 h-3 text-zinc-400" />
                {content.last_edited_by_avatar ? (
                  <img src={content.last_edited_by_avatar} alt="" className="w-4 h-4 rounded-full object-cover border border-zinc-200" />
                ) : (
                  <span className="w-4 h-4 rounded-full bg-zinc-200 flex items-center justify-center text-[8px] font-bold text-zinc-600">
                    {content.last_edited_by_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                  </span>
                )}
                <span className="text-zinc-700 font-medium">{content.last_edited_by_name}</span>
              </span>
            )}
            <span>{format(parseISO(content.updated_at), 'MMM d, yyyy')}</span>
            {isEditor && (
              <button
                onClick={() => setShowRightsModal(true)}
                data-testid="open-image-rights-btn"
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium transition ${
                  rightsMissing
                    ? 'bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-300'
                    : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700'
                }`}
                title="Manage image rights"
              >
                {rightsMissing ? (
                  <AlertCircle className="w-3 h-3" />
                ) : (
                  <Copyright className="w-3 h-3" />
                )}
                Image rights
                {rightsMissing && (
                  <span className="ml-0.5 text-[10px] font-bold">· {imageRights.missing} missing</span>
                )}
              </button>
            )}
            {isAdmin && (
              <button
                onClick={() => { if (auditLogs.length === 0) fetchAuditLogs(); setHistoryDialogOpen(true); }}
                data-testid="edit-history-btn"
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-100 hover:bg-zinc-200 text-[11px] font-medium text-zinc-700 transition"
              >
                <History className="w-3 h-3" /> History
                {auditLogs.length > 0 && <span className="ml-0.5 text-[10px] text-zinc-500">· {auditLogs.length}</span>}
              </button>
            )}
          </div>
        </div>
        
        {/* WordPress Publish Button */}
        {isEditor && wpSites.length > 0 && (
          <div className="flex flex-col items-end gap-1">
            <Button
              data-testid="publish-wp-btn"
              onClick={() => !isPublishBlocked && openPublishDialog()}
              disabled={isPublishBlocked}
              className="gap-2 bg-zinc-900 hover:bg-zinc-900 text-white rounded-full px-5"
            >
              <Upload className="w-4 h-4" />
              {hasPublishedSites ? 'Sync to WordPress' : 'Publish to WordPress'}
            </Button>
            {isPublishBlocked && (
              <span className="text-xs text-amber-500">
                Requires admin approval
              </span>
            )}
          </div>
        )}

        {/* News API Publish Button — works on every main site.
            Same shape/size as the WordPress sync button; green only when synced. */}
        {isEditor && (
          <div className="flex flex-col items-end gap-1" data-testid="clara-publish-section">
            <Button
              data-testid="publish-clara-btn"
              onClick={() => publishViaClara()}
              disabled={newsApiBlocked || claraPublishBusy}
              className={`gap-2 rounded-full px-5 !text-white disabled:!text-white disabled:opacity-60 ${
                content?.status === 'published'
                  ? 'bg-emerald-600 hover:bg-emerald-700 border border-emerald-700'
                  : 'bg-violet-600 hover:bg-violet-700 border border-violet-700'
              }`}
            >
              {claraPublishBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {content?.status === 'published' ? 'Sync to News API' : 'Publish to News API'}
            </Button>
            {content?.status === 'published' && (
              <button
                onClick={() => unpublishViaClara()}
                disabled={claraPublishBusy}
                className="text-[11px] text-zinc-500 hover:text-rose-500 underline"
                data-testid="unpublish-clara-btn"
              >
                Unpublish from News API
              </button>
            )}
            {isPublishBlocked && (
              <span className="text-xs text-amber-500">Requires admin approval</span>
            )}
            {!isPublishBlocked && !hasFeaturedImage && (
              <span className="text-xs text-amber-600">
                Featured image required — see the section above to upload one.
              </span>
            )}
            {!isPublishBlocked && hasFeaturedImage && rightsMissing && (
              <button
                type="button"
                onClick={() => setShowRightsModal(true)}
                data-testid="rights-blocked-warning"
                className="text-xs text-amber-700 hover:text-amber-900 underline inline-flex items-center gap-1"
              >
                <AlertCircle className="w-3 h-3" />
                {imageRights.missing} image{imageRights.missing !== 1 ? 's' : ''} still missing rights — click to fill in
              </button>
            )}
          </div>
        )}
      </div>

      {/* Rejection Notice */}
      {isRejected && content.approval_notes && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-red-400 font-medium">Content Rejected</p>
              <p className="text-sm text-zinc-400 mt-1">{content.approval_notes}</p>
              {content.approved_by_name && (
                <p className="text-xs text-zinc-500 mt-2">By {content.approved_by_name}</p>
              )}
            </div>
          </div>
        </div>
      )}

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
                    : ps.sync_status === 'scheduled'
                    ? 'bg-orange-500/10 border-orange-500/30'
                    : ps.sync_status === 'failed'
                    ? 'bg-red-500/10 border-red-500/30'
                    : 'bg-zinc-100/70 border-zinc-300'
                }`}
              >
                <div className="flex items-start gap-4">
                  {/* Featured Image Thumbnail */}
                  {image && (
                    <div className="w-16 h-16 rounded-lg overflow-hidden bg-zinc-200 flex-shrink-0">
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
                      <p className="text-zinc-700 font-medium">
                        {ps.wordpress_site_name}
                      </p>
                      <p className="text-sm text-zinc-400">
                        {ps.wp_post_type} / {ps.wp_status}
                        {ps.wp_scheduled_date && (
                          <span className="ml-2 text-orange-400">
                            • Scheduled: {format(parseISO(ps.wp_scheduled_date), 'MMM d, yyyy HH:mm')}
                          </span>
                        )}
                        {image && (
                          <span className="ml-2 text-violet-400">
                            • Featured image {image.sync_status === 'synced' ? '✓' : image.sync_status === 'failed' ? '✗' : '...'}
                          </span>
                        )}
                        {ps.sync_status === 'synced' && ps.last_synced_at && (
                          <> • Synced {format(parseISO(ps.last_synced_at), 'MMM d, yyyy HH:mm')}</>
                        )}
                        {ps.sync_status === 'failed' && ps.sync_error_message && (
                          <span className="text-rose-400 block mt-1">{ps.sync_error_message}
                            <span className="inline-block ml-2"><ClaraErrorButton errorMessage={ps.sync_error_message} errorContext="WordPress sync failed" /></span>
                          </span>
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
                      className="gap-2 bg-transparent border-zinc-300 text-zinc-600 hover:bg-zinc-100"
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
      <div className="bg-white border border-zinc-200 rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-zinc-900">Content Details</h2>
          {!isEditing ? (
            isEditor && (
              <div className="flex gap-2">
                <PublishToButton contentId={content?.id} mainSiteId={content?.main_site_id || mainSiteCtx?.mainSite?.id} token={token} />
                <Button
                  variant="outline"
                  size="sm"
                  data-testid="edit-content-btn"
                  onClick={() => setIsEditing(true)}
                  className="gap-2 bg-transparent border-zinc-300 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                >
                  <Edit2 className="w-4 h-4" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  data-testid="delete-content-btn"
                  onClick={() => setDeleteDialogOpen(true)}
                  className="gap-2 bg-transparent border-zinc-300 text-orange-500 hover:bg-orange-500/10 hover:text-rose-400"
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
                onClick={() => openClara('seo')}
                className="gap-2 bg-transparent border-orange-200 text-orange-600 hover:bg-orange-50"
                data-testid="clara-seo-btn"
              >
                <Sparkles className="w-4 h-4" />
                Clara AI
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsEditing(false);
                  setEditData({ ...content });
                }}
                className="gap-2 bg-transparent border-zinc-300 text-zinc-600 hover:bg-zinc-100"
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
              <Label className="text-zinc-600">Title</Label>
              <Input
                data-testid="edit-title-input"
                value={editData.title}
                onChange={(e) => setEditData({ ...editData, title: e.target.value })}
                className="bg-zinc-100 border-zinc-300 text-zinc-900"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-zinc-600">Type</Label>
                <Select
                  value={editData.type}
                  onValueChange={(value) => setEditData({ ...editData, type: value })}
                >
                  <SelectTrigger className="bg-zinc-50 border-zinc-200 text-zinc-900">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-zinc-200">
                    <SelectItem value="text" className="text-zinc-600 focus:text-zinc-900 focus:bg-zinc-100">Text</SelectItem>
                    <SelectItem value="link" className="text-zinc-600 focus:text-zinc-900 focus:bg-zinc-100">Link</SelectItem>
                    <SelectItem value="reference" className="text-zinc-600 focus:text-zinc-900 focus:bg-zinc-100">Reference</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-zinc-600">Status</Label>
                <Select
                  value={editData.status}
                  onValueChange={(value) => setEditData({ ...editData, status: value })}
                >
                  <SelectTrigger className="bg-zinc-50 border-zinc-200 text-zinc-900">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-zinc-200">
                    <SelectItem value="draft" className="text-zinc-600 focus:text-zinc-900 focus:bg-zinc-100">Draft</SelectItem>
                    <SelectItem value="ready" className="text-zinc-600 focus:text-zinc-900 focus:bg-zinc-100">Ready</SelectItem>
                    <SelectItem value="published" className="text-zinc-600 focus:text-zinc-900 focus:bg-zinc-100">Published</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {editData.type === 'link' && (
              <div className="space-y-2">
                <Label className="text-zinc-600">External URL</Label>
                <Input
                  value={editData.external_url}
                  onChange={(e) => setEditData({ ...editData, external_url: e.target.value })}
                  className="bg-zinc-100 border-zinc-300 text-zinc-900"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-zinc-600">Body</Label>
              <RichTextEditor
                id="edit-content-body"
                value={editData.body}
                onChange={(content) => setEditData({ ...editData, body: content })}
                placeholder="Write your content here..."
                height={350}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-zinc-600">Category</Label>
              <Select
                value={editData.category_id || "none"}
                onValueChange={(value) => setEditData({ ...editData, category_id: value === "none" ? "" : value })}
              >
                <SelectTrigger className="bg-zinc-50 border-zinc-200 text-zinc-900">
                  <SelectValue placeholder="Select category..." />
                </SelectTrigger>
                <SelectContent className="bg-white border-zinc-200">
                  <SelectItem value="none" className="text-zinc-500 focus:text-zinc-900 focus:bg-zinc-100">
                    No category
                  </SelectItem>
                  {categories.map((cat) => (
                    <SelectItem
                      key={cat.id}
                      value={cat.id}
                      className="text-zinc-600 focus:text-zinc-900 focus:bg-zinc-100"
                    >
                      <div className="flex items-center gap-2">
                        <Folder className="w-4 h-4 text-orange-400" />
                        <span>{cat.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-zinc-500 text-xs uppercase tracking-wider">Featured Image</Label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    data-testid="change-featured-image-btn"
                    onClick={() => newsFeaturedInputRef.current?.click()}
                    disabled={newsFeaturedUploading}
                    className="text-xs font-medium text-violet-600 hover:text-violet-700 underline decoration-violet-300 hover:decoration-violet-500 disabled:opacity-50"
                  >
                    {newsFeaturedUploading
                      ? 'Uploading…'
                      : getArticleFeaturedImage()
                        ? 'Change image'
                        : 'Upload image'}
                  </button>
                  {getArticleFeaturedImage()?.source === 'featured' && (
                    <button
                      type="button"
                      onClick={removeArticleFeaturedImage}
                      data-testid="remove-featured-image-btn"
                      className="text-xs font-medium text-rose-500 hover:text-rose-600 underline decoration-rose-300 hover:decoration-rose-500"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
              {(() => {
                const fi = getArticleFeaturedImage();
                if (fi) {
                  return (
                    <div className="relative rounded-lg overflow-hidden bg-zinc-100 border border-zinc-200" data-testid="featured-image-preview">
                      <img
                        src={fi.url}
                        alt="Featured"
                        className="w-full max-h-80 object-cover"
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                      {fi.source === 'imported' && (
                        <span className="absolute top-2 left-2 text-[10px] uppercase tracking-wider bg-amber-100 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5">
                          Imported from source
                        </span>
                      )}
                    </div>
                  );
                }
                return (
                  <button
                    type="button"
                    onClick={() => newsFeaturedInputRef.current?.click()}
                    disabled={newsFeaturedUploading}
                    className="w-full rounded-lg border-2 border-dashed border-zinc-300 bg-zinc-50 hover:bg-zinc-100 transition-colors py-10 text-zinc-500 text-sm flex flex-col items-center gap-2 disabled:opacity-50"
                    data-testid="upload-featured-image-empty"
                  >
                    <ImageIcon className="w-6 h-6 text-zinc-400" />
                    {newsFeaturedUploading ? 'Uploading…' : 'No featured image — click to upload'}
                  </button>
                );
              })()}
              {/* Shared hidden input for both Upload + Change actions. */}
              <input
                ref={newsFeaturedInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif"
                className="hidden"
                onChange={handleNewsFeaturedSelected}
                data-testid="news-featured-image-input-inline"
              />
            </div>

            <div>
              <Label className="text-zinc-500 text-xs uppercase tracking-wider">Body</Label>
              <div className="mt-2 p-4 bg-zinc-50 rounded-lg prose prose-invert prose-sm max-w-none">
                {content.body ? (
                  <div 
                    className="text-zinc-600 content-body-display"
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

            {/* Liveblog timeline — visible when actively a liveblog
                OR when it was a liveblog (so archived entries remain
                visible under the article, in Clara and on the public API). */}
            {(content.is_liveblog || content.liveblog_ended_at) && (
              <div className="mt-6">
                <LiveblogPanel
                  contentId={contentId}
                  mainSiteId={parentMainSite?.id || ''}
                  token={token}
                  canEdit={isEditor && content.is_liveblog}
                  ended={!content.is_liveblog && !!content.liveblog_ended_at}
                  endedAt={content.liveblog_ended_at}
                />
              </div>
            )}

            {/* Source only — Category & Created By now live in the header */}
            {content.source && (
              <div>
                <Label className="text-zinc-500 text-xs uppercase tracking-wider">Source</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Globe className="w-4 h-4 text-blue-400" />
                  <span className="text-zinc-600">{content.source}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Edit History Dialog (admin only) */}
      {isAdmin && (
        <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
          <DialogContent className="bg-white max-w-3xl max-h-[85vh] flex flex-col p-0">
            <DialogHeader className="p-5 border-b border-zinc-200">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <History className="w-5 h-5 text-orange-500" />
                  <DialogTitle>Edit History</DialogTitle>
                  {auditLogs.length > 0 && (
                    <span className="px-2 py-0.5 bg-zinc-100 rounded-full text-xs text-zinc-600">{auditLogs.length} {auditLogs.length === 1 ? 'entry' : 'entries'}</span>
                  )}
                </div>
                {auditLogs.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExportPdf}
                    disabled={exportingPdf}
                    className="gap-2"
                    data-testid="export-history-pdf-btn"
                  >
                    {exportingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    Export PDF
                  </Button>
                )}
              </div>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto min-h-0">
              {loadingAuditLogs ? (
                <div className="p-10 text-center">
                  <Loader2 className="w-6 h-6 animate-spin text-orange-400 mx-auto" />
                  <p className="text-zinc-500 mt-3 text-sm">Loading history...</p>
                </div>
              ) : auditLogs.length === 0 ? (
                <div className="p-10 text-center">
                  <History className="w-10 h-10 text-zinc-300 mx-auto mb-3" />
                  <p className="text-zinc-500 font-medium">No edit history yet</p>
                  <p className="text-zinc-400 text-sm mt-1">Changes will be logged when someone edits this article</p>
                </div>
              ) : (
                <div className="divide-y divide-zinc-100">
                  {auditLogs.map((log, index) => {
                    const isRollbackable = isEditor && log.action === 'updated' && Array.isArray(log.changes) && log.changes.length > 0;
                    const truncate = (v) => {
                      if (v == null) return v;
                      const s = String(v);
                      // Strip HTML tags for readable preview
                      const plain = s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
                      return plain.length > 180 ? plain.slice(0, 180) + '…' : plain;
                    };
                    return (
                    <div key={log.id || index} className="p-4 hover:bg-zinc-50/70">
                      <div className="flex items-start justify-between mb-2 gap-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            log.action === 'updated' ? 'bg-blue-100 text-blue-700' :
                            log.action === 'deleted' ? 'bg-red-100 text-red-700' :
                            log.action === 'created' ? 'bg-green-100 text-green-700' :
                            'bg-zinc-100 text-zinc-700'
                          }`}>
                            {log.action}
                          </span>
                          <span className="text-sm font-semibold text-zinc-800">{log.user_name || 'Unknown user'}</span>
                        </div>
                        <div className="flex items-start gap-2 flex-shrink-0">
                          <div className="text-right">
                            <p className="text-xs font-medium text-zinc-700">{format(parseISO(log.timestamp), 'MMM d, yyyy')}</p>
                            <p className="text-[11px] text-zinc-400">{format(parseISO(log.timestamp), 'HH:mm:ss')}{log.ip_address ? ` · ${log.ip_address}` : ''}</p>
                          </div>
                          {isRollbackable && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setRollbackTarget(log)}
                              className="h-7 gap-1 text-[11px] text-zinc-700 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-700"
                              data-testid={`rollback-btn-${log.id}`}
                            >
                              <Undo2 className="w-3 h-3" /> Rollback
                            </Button>
                          )}
                        </div>
                      </div>

                      {log.changes && log.changes.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {log.changes.map((change, changeIdx) => (
                            <div key={changeIdx} className="bg-zinc-50 border border-zinc-100 rounded-lg p-3">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-[#dd0c51] mb-2">{change.field}</p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                                <div>
                                  <p className="text-[10px] text-zinc-400 uppercase mb-1">Before</p>
                                  <p className="text-zinc-600 break-words text-xs">
                                    {change.old_value ? truncate(change.old_value) : <span className="italic text-zinc-400">(empty)</span>}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-[10px] text-zinc-400 uppercase mb-1">After</p>
                                  <p className="text-zinc-800 break-words text-xs">
                                    {change.new_value ? truncate(change.new_value) : <span className="italic text-zinc-400">(empty)</span>}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {log.details && (
                        <p className="text-zinc-500 text-xs mt-2 italic">{log.details}</p>
                      )}
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Rollback Confirmation Dialog */}
      <AlertDialog open={!!rollbackTarget} onOpenChange={(open) => { if (!open && !rollingBack) setRollbackTarget(null); }}>
        <AlertDialogContent className="bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Undo2 className="w-5 h-5 text-amber-500" />
              Rollback this change?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will restore the article fields to the state <strong>before</strong> this edit.
              A new history entry will be added so the rollback itself is traceable.
              {rollbackTarget?.user_name && (
                <span className="block mt-2 text-xs text-zinc-500">
                  Undoing edit by <span className="font-semibold">{rollbackTarget.user_name}</span>
                  {rollbackTarget?.timestamp && <> on {format(parseISO(rollbackTarget.timestamp), 'MMM d, yyyy HH:mm')}</>}
                </span>
              )}
              {rollbackTarget?.changes?.length > 0 && (
                <span className="block mt-2 text-xs text-zinc-600">
                  Fields: <span className="font-medium">{rollbackTarget.changes.map(c => c.field).join(', ')}</span>
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={rollingBack} data-testid="rollback-cancel-btn">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRollback}
              disabled={rollingBack}
              className="bg-amber-500 hover:bg-amber-600 text-white"
              data-testid="rollback-confirm-btn"
            >
              {rollingBack ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Rolling back...</> : 'Confirm rollback'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Multi-site Publish Dialog - Wizard with Deploy Animation */}
      <Dialog open={publishDialogOpen} onOpenChange={(v) => { if (!publishing) setPublishDialogOpen(v); }}>
        <DialogContent hideClose className="bg-white border-zinc-200 max-w-[700px] max-h-[85vh] overflow-hidden p-0 rounded-[24px] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-8 pt-6 pb-0 flex-shrink-0">
            <h2 className="text-lg font-bold text-zinc-900">Publish to WordPress</h2>
            {!publishing && (
              <button onClick={() => setPublishDialogOpen(false)} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-zinc-100 transition-colors">
                <X className="w-4 h-4 text-zinc-400" />
              </button>
            )}
          </div>

          {publishStep === 'configure' ? (
            <>
              <div className="px-8 pt-4 pb-2 overflow-y-auto flex-1 min-h-0">
                <p className="text-sm text-zinc-500 mb-6">Select target sites and optionally add featured images.</p>

                <div className="space-y-4">
                  {wpSites.length === 0 ? (
                    <div className="text-center py-8">
                      <Globe className="w-12 h-12 text-zinc-300 mx-auto mb-3" />
                      <p className="text-zinc-500">No WordPress sites configured.</p>
                      <p className="text-sm text-zinc-400">Ask an admin to add a WordPress site.</p>
                    </div>
                  ) : (
                    wpSites.map((site) => {
                      const publishStatus = getPublishStatusForSite(site.id);
                      const isSelected = selectedSites[site.id];
                      const settings = publishSettings[site.id] || {};
                      const image = featuredImages[site.id];
                      const isUploading = uploadingSiteId === site.id;
                      
                      return (
                        <div key={site.id}
                          className={`p-4 rounded-xl border-2 transition-all ${
                            isSelected ? 'border-zinc-900 bg-zinc-50' : 'border-zinc-200 hover:border-zinc-300'
                          }`}>
                          <div className="flex items-start gap-3">
                            <Checkbox
                              id={`site-${site.id}`}
                              checked={isSelected}
                              onCheckedChange={() => toggleSiteSelection(site.id)}
                              className="mt-1 border-zinc-300 data-[state=checked]:bg-zinc-900 data-[state=checked]:border-zinc-900"
                            />
                            <div className="flex-1">
                              <label htmlFor={`site-${site.id}`} className="flex items-center gap-2 cursor-pointer">
                                <span className="font-medium text-zinc-900">{site.name}</span>
                                {publishStatus?.sync_status === 'synced' && (
                                  <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                                    <Check className="w-3 h-3" /> Published
                                  </span>
                                )}
                                {publishStatus?.sync_status === 'failed' && (
                                  <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600" title={publishStatus?.sync_error_message}>
                                    <AlertCircle className="w-3 h-3" /> Failed
                                  </span>
                                )}
                              </label>
                              <p className="text-sm text-zinc-400 mt-0.5">{site.wp_base_url}</p>
                              
                              {isSelected && (
                                <div className="mt-4 space-y-4">
                                  <div className="grid grid-cols-2 gap-3">
                                    <div>
                                      <Label className="text-xs text-zinc-500">Post Type</Label>
                                      <Select value={settings.post_type || 'post'}
                                        onValueChange={(value) => updateSiteSettings(site.id, 'post_type', value)}
                                        disabled={!!publishStatus?.wp_post_id}>
                                        <SelectTrigger className="h-9 bg-zinc-50 border-zinc-200 text-zinc-900 mt-1 rounded-xl">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-white border-zinc-200">
                                          <SelectItem value="post">Post</SelectItem>
                                          <SelectItem value="page">Page</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    <div>
                                      <Label className="text-xs text-zinc-500">Status</Label>
                                      <Select value={settings.wp_status || 'draft'}
                                        onValueChange={(value) => {
                                          updateSiteSettings(site.id, 'wp_status', value);
                                          if (value !== 'future') updateSiteSettings(site.id, 'scheduled_date', null);
                                        }}>
                                        <SelectTrigger className="h-9 bg-zinc-50 border-zinc-200 text-zinc-900 mt-1 rounded-xl">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-white border-zinc-200">
                                          <SelectItem value="draft">Draft</SelectItem>
                                          <SelectItem value="publish">Published</SelectItem>
                                          <SelectItem value="future">Schedule</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  </div>

                                  {settings.wp_status === 'future' && (
                                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                                      <Label className="text-xs text-amber-700 mb-2 block flex items-center gap-2">
                                        <Calendar className="w-3 h-3" /> Schedule Publication
                                      </Label>
                                      <Input type="datetime-local" value={settings.scheduled_date || ''}
                                        onChange={(e) => updateSiteSettings(site.id, 'scheduled_date', e.target.value)}
                                        min={new Date().toISOString().slice(0, 16)}
                                        className="bg-white border-amber-200 text-zinc-900 h-9 rounded-xl" />
                                    </div>
                                  )}

                                  <div className="border-t border-zinc-100 pt-4">
                                    <Label className="text-xs text-zinc-500 mb-2 block">Featured Image (Optional)</Label>
                                    {image ? (
                                      <div className="flex items-start gap-3">
                                        <div className="w-24 h-24 rounded-lg overflow-hidden bg-zinc-100 flex-shrink-0">
                                          <img src={getImageUrl(image)} alt="Featured" className="w-full h-full object-cover" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <p className="text-sm text-zinc-700 truncate max-w-[200px]">{image.file_name}</p>
                                          <p className="text-xs text-zinc-400">{(image.size / 1024).toFixed(1)} KB</p>
                                          <div className="flex gap-2 mt-2">
                                            <Button type="button" variant="outline" size="sm"
                                              onClick={() => fileInputRefs.current[site.id]?.click()}
                                              className="border-zinc-200 text-zinc-600 hover:bg-zinc-50 text-xs h-7 rounded-lg">Replace</Button>
                                            <Button type="button" variant="outline" size="sm"
                                              onClick={() => openCreditDialog(site.id, image)}
                                              data-testid={`open-credit-dialog-${site.id}`}
                                              className="border-zinc-200 text-zinc-600 hover:bg-zinc-50 text-xs h-7 rounded-lg gap-1">
                                              <Copyright className="w-3 h-3" />
                                              {image.photo_credit || image.photo_copyright ? 'Edit credit' : 'Add credit'}
                                            </Button>
                                            <Button type="button" variant="outline" size="sm"
                                              onClick={() => handleRemoveImage(site.id)}
                                              className="border-zinc-200 text-red-500 hover:bg-red-50 text-xs h-7 rounded-lg">Remove</Button>
                                          </div>
                                          {(image.photo_credit || image.photo_copyright) && (
                                            <p className="text-[11px] text-zinc-400 mt-1.5">
                                              {image.photo_credit && <span>Photo: <span className="text-zinc-600">{image.photo_credit}</span></span>}
                                              {image.photo_credit && image.photo_copyright && ' · '}
                                              {image.photo_copyright && <span>© <span className="text-zinc-600">{image.photo_copyright}</span></span>}
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                    ) : (
                                      <div onClick={() => fileInputRefs.current[site.id]?.click()}
                                        className="border-2 border-dashed border-zinc-200 rounded-xl p-4 text-center cursor-pointer hover:border-zinc-400 hover:bg-zinc-50 transition-colors">
                                        {isUploading ? (
                                          <div className="flex flex-col items-center">
                                            <Loader2 className="w-6 h-6 text-zinc-400 animate-spin mb-2" />
                                            <p className="text-sm text-zinc-500">Uploading...</p>
                                          </div>
                                        ) : (
                                          <div className="flex flex-col items-center">
                                            <Image className="w-6 h-6 text-zinc-400 mb-2" />
                                            <p className="text-sm text-zinc-500">Click to upload featured image</p>
                                            <p className="text-xs text-zinc-400 mt-1">JPEG, PNG, GIF, WebP</p>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                    <input ref={el => fileInputRefs.current[site.id] = el} type="file"
                                      accept="image/jpeg,image/png,image/gif,image/webp" className="hidden"
                                      onChange={(e) => handleImageSelect(site.id, e.target.files[0])} />
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
              </div>

              <div className="flex items-center justify-between px-8 py-4 border-t border-zinc-100 flex-shrink-0">
                <Button variant="ghost" onClick={() => setPublishDialogOpen(false)} className="text-zinc-500">Cancel</Button>
                <Button data-testid="confirm-publish-btn" onClick={handlePublish}
                  disabled={Object.values(selectedSites).filter(Boolean).length === 0}
                  className="gap-2 bg-zinc-900 hover:bg-zinc-900 text-white px-6 rounded-full">
                  <Upload className="w-4 h-4" />
                  Publish to {Object.values(selectedSites).filter(Boolean).length} Site(s)
                </Button>
              </div>
            </>
          ) : (
            /* Deploy Animation Step */
            <div className="px-8 pt-4 pb-8 flex-1">
              <div className="text-center mb-8">
                <h2 className="text-xl font-bold text-zinc-900 mb-1">
                  {deployFailed ? 'Publishing Failed' : deployDone ? 'Published!' : 'Clara is publishing your content'}
                </h2>
                <p className="text-sm text-zinc-500">
                  {deployFailed ? 'Could not reach the WordPress website.' : deployDone ? 'Your content is now live on WordPress.' : 'This will only take a moment...'}
                </p>
              </div>

              <div className="max-w-md mx-auto space-y-1">
                {[
                  { label: 'Preparing your content...' },
                  { label: 'Starting the Clara API endpoint to communicate with your WordPress website...' },
                  { label: `Publishing to ${wpSites.filter(s => selectedSites[s.id]).map(s => s.name).join(', ') || 'WordPress'}...` },
                  { label: 'Finalizing and syncing metadata...' },
                ].map((step, i) => {
                  let status;
                  if (deployFailed) {
                    if (i < deployFailStep) status = 'done';
                    else if (i === deployFailStep) status = 'failed';
                    else status = 'skipped';
                  } else {
                    status = deployDone ? 'done' : deployStatus > i ? 'done' : deployStatus === i ? 'loading' : 'pending';
                  }
                  return (
                    <motion.div key={i}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.15, duration: 0.4 }}
                      className="flex items-center gap-4 py-3">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0">
                        {status === 'done' ? (
                          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
                            className="w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center">
                            <Check className="w-5 h-5 text-white" />
                          </motion.div>
                        ) : status === 'failed' ? (
                          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
                            className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center">
                            <X className="w-5 h-5 text-white" />
                          </motion.div>
                        ) : status === 'skipped' ? (
                          <div className="w-10 h-10 rounded-full border-2 border-red-200 bg-red-50 flex items-center justify-center">
                            <X className="w-4 h-4 text-red-300" />
                          </div>
                        ) : status === 'loading' ? (
                          <div className="w-10 h-10 rounded-full border-[3px] border-zinc-200 border-t-zinc-900 animate-spin" />
                        ) : (
                          <div className="w-10 h-10 rounded-full border-2 border-zinc-200" />
                        )}
                      </div>
                      <span className={`text-sm font-medium transition-colors ${
                        status === 'done' ? 'text-emerald-700' : status === 'failed' ? 'text-red-600' : status === 'skipped' ? 'text-red-300' : status === 'loading' ? 'text-zinc-900' : 'text-zinc-400'
                      }`}>{step.label}</span>
                    </motion.div>
                  );
                })}
              </div>

              {deployFailed && deployErrorMsg && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  className="mt-6 max-w-md mx-auto bg-red-50 border border-red-200 rounded-xl p-4">
                  <p className="text-sm text-red-600 font-medium mb-1">Error Details</p>
                  <p className="text-xs text-red-500 mb-3">{deployErrorMsg}</p>
                  <button
                    onClick={() => openClara('error', { errorMessage: `WordPress publish failed: ${deployErrorMsg}`, errorContext: 'WordPress publishing' })}
                    className="group relative inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-white border border-red-200 text-red-600 hover:bg-red-100 transition-colors"
                    data-testid="clara-error-help-btn"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Clara Assistent
                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-zinc-900 text-white text-[11px] rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                      The Clara Assistent is there to help you with this fault in Clara
                    </span>
                  </button>
                </motion.div>
              )}

              {deployDone && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  className="mt-8 flex justify-center">
                  <Button onClick={() => setPublishDialogOpen(false)}
                    className={`${deployFailed ? 'bg-red-500 hover:bg-red-600' : 'bg-zinc-900 hover:bg-zinc-900'} text-white px-8 rounded-full`}>
                    {deployFailed ? 'Close' : 'Done'}
                  </Button>
                </motion.div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-white border-zinc-200">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-zinc-900">Delete Content</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              <p className="mb-3">Are you sure you want to delete "{content.title}"?</p>
              <div className="p-3 bg-zinc-100/70 rounded-lg space-y-2 text-sm">
                <p className="text-zinc-600">This will:</p>
                <ul className="list-disc list-inside space-y-1 text-zinc-400">
                  <li>Move the content to Trash</li>
                  {hasPublishedSites && (
                    <li className="text-orange-400">Delete the post from all linked WordPress sites</li>
                  )}
                </ul>
                <p className="text-zinc-500 text-xs mt-2 pt-2 border-t border-zinc-300">
                  Admins can restore deleted content from the Trash.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-zinc-300 text-zinc-600 hover:bg-zinc-100">
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

      {/* Image Resize Dialog */}
      <ImageResizeDialog
        file={resizeFile}
        open={!!resizeFile}
        onClose={() => { setResizeFile(null); setResizeSiteId(null); }}
        onResized={handleResized}
      />

      {/* Social Media / Canva Prompt */}
      <Dialog open={canvaPrompt.open} onOpenChange={open => !open && setCanvaPrompt({ open: false, slug: '', name: '' })}>
        <DialogContent className="sm:max-w-md bg-white border-zinc-200" data-testid="canva-social-prompt">
          <DialogHeader>
            <DialogTitle className="text-zinc-900">Create Social Media Post?</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Your content has been published successfully. Would you like to create a social media post for it in Canva?
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-4">
            <Button
              variant="outline"
              className="border-zinc-300 text-zinc-400"
              onClick={() => setCanvaPrompt({ open: false, slug: '', name: '' })}
              data-testid="canva-social-skip"
            >
              Skip
            </Button>
            <Button
              className="bg-[#7d2ae8] hover:bg-[#6b21c8] text-white"
              onClick={() => {
                setCanvaPrompt({ open: false, slug: '', name: '' });
                navigate(`/${canvaPrompt.slug}/canva`);
              }}
              data-testid="canva-social-go"
            >
              Open Canva Director
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Photo credit / copyright dialog */}
      <ImageCopyrightDialog
        open={credDialogOpen}
        onOpenChange={setCredDialogOpen}
        initial={credDialogTarget?.image || {}}
        onSave={saveCreditForTarget}
      />

      {/* Image rights enforcement modal — auto-opens on load if any image
          (featured or inline) is missing its credit. Publishing to News API
          is blocked while rights are missing. */}
      <ImageRightsModal
        open={showRightsModal}
        onOpenChange={setShowRightsModal}
        contentId={contentId}
        featured={imageRights.featured}
        images={imageRights.images || []}
        onSaved={handleRightsSaved}
        API={API}
      />

      <Dialog open={endLiveblogOpen} onOpenChange={setEndLiveblogOpen}>
        <DialogContent className="bg-white text-zinc-900 max-w-md" data-testid="end-liveblog-dialog">
          <DialogHeader>
            <DialogTitle className="text-zinc-900 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              End liveblog
            </DialogTitle>
            <DialogDescription className="text-zinc-500 text-sm">
              Stop the live updates for this article. Pick whether the entries should remain visible
              as a static timeline under the article, or be permanently deleted.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <button
              type="button"
              data-testid="end-liveblog-keep"
              disabled={endingLiveblog}
              onClick={() => endLiveblog(false)}
              className="w-full text-left border border-zinc-200 hover:border-zinc-400 rounded-lg p-3 transition disabled:opacity-50"
            >
              <div className="text-sm font-semibold text-zinc-900">Keep entries</div>
              <div className="text-xs text-zinc-500 mt-0.5">
                The article keeps showing the timeline; only the LIVE badge and auto-update disappear.
              </div>
            </button>
            <button
              type="button"
              data-testid="end-liveblog-delete"
              disabled={endingLiveblog}
              onClick={() => endLiveblog(true)}
              className="w-full text-left border border-red-200 hover:border-red-400 bg-red-50/40 rounded-lg p-3 transition disabled:opacity-50"
            >
              <div className="text-sm font-semibold text-red-700">Delete all entries</div>
              <div className="text-xs text-red-600/80 mt-0.5">
                Permanently wipes every timeline entry on this article. Cannot be undone.
              </div>
            </button>
          </div>
          <DialogFooter className="mt-3">
            <Button
              variant="ghost"
              onClick={() => setEndLiveblogOpen(false)}
              disabled={endingLiveblog}
              className="text-zinc-500"
              data-testid="end-liveblog-cancel"
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ContentDetailPage;
