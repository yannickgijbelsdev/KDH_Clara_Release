/* eslint-disable */
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { toast } from 'sonner';
import ImageResizeDialog from '../components/ImageResizeDialog';
import { isImageFile, isOversized } from '../utils/imageResize';
import MediaCompressDialog from '../components/MediaCompressDialog';
import { isAudioFile, isVideoFile, isMediaOversized } from '../utils/mediaCompress';
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  FileText,
  Music,
  Upload,
  Search,
  Trash2,
  Download,
  Loader2,
  File,
  Filter,
  MoreVertical,
  Pencil,
  X,
  Eye,
  Image,
  Play,
  Pause,
  Volume2,
  Share2,
  Link,
  Copy,
  Check,
  ExternalLink,
  Folder,
  FolderPlus,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Users,
  Tv,
  GripVertical
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { Switch } from '../components/ui/switch';
import { cn } from '../lib/utils';
import { usePermissions } from '../context/PermissionsContext';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const MediaLibraryPage = () => {
  const { isAdmin } = useAuth();
  const { canCreate, canEdit: canEditPerm } = usePermissions();
  const canEdit = canEditPerm('media_library') || canCreate('media_library') || isAdmin;
  
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [kindFilter, setKindFilter] = useState('all');
  const [editingAsset, setEditingAsset] = useState(null);
  const [newTitle, setNewTitle] = useState('');
  const [previewAsset, setPreviewAsset] = useState(null);
  const [shareAsset, setShareAsset] = useState(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareInfo, setShareInfo] = useState(null);
  const [copied, setCopied] = useState(false);
  const [shareBaseUrl, setShareBaseUrl] = useState('');
  
  // Folder state
  const [folders, setFolders] = useState([]);
  const [currentFolder, setCurrentFolder] = useState(null);
  const [expandedFolders, setExpandedFolders] = useState(new Set());
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderParent, setNewFolderParent] = useState(null);
  const [folderLoading, setFolderLoading] = useState(false);
  const [editingFolder, setEditingFolder] = useState(null);
  const [showShareFolderDialog, setShowShareFolderDialog] = useState(false);
  const [sharingFolder, setSharingFolder] = useState(null);
  const [deletingFolder, setDeletingFolder] = useState(null);
  
  // Folder sharing state
  const [teamUsers, setTeamUsers] = useState([]);
  const [showSeries, setShowSeries] = useState([]);
  const [individualShows, setIndividualShows] = useState([]);
  const [folderShares, setFolderShares] = useState([]);
  const [sharingLoading, setSharingLoading] = useState(false);
  const [selectedUsersToShare, setSelectedUsersToShare] = useState([]);
  const [selectedSeriesToShare, setSelectedSeriesToShare] = useState([]);
  const [selectedShowsToShare, setSelectedShowsToShare] = useState([]);
  
  // Drag and drop state
  const [activeAsset, setActiveAsset] = useState(null);
  
  // Image resize state
  const [resizeFile, setResizeFile] = useState(null);
  const [pendingFiles, setPendingFiles] = useState([]);
  
  // Media compress state
  const [compressFile, setCompressFile] = useState(null);
  const [compressPendingFiles, setCompressPendingFiles] = useState([]);
  
  // Upload progress state
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadFileName, setUploadFileName] = useState('');
  
  const fileInputRef = useRef(null);
  const audioPreviewRef = useRef(null);

  // DnD sensors with activation constraint to prevent accidental drags
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px movement required before drag starts
      },
    })
  );

  useEffect(() => {
    fetchAssets();
    fetchConfig();
    fetchFolders();
  }, [kindFilter, currentFolder]);

  const fetchConfig = async () => {
    try {
      const response = await axios.get(`${API}/config`);
      setShareBaseUrl(response.data.share_base_url || window.location.origin);
    } catch (error) {
      // Fallback to current origin
      setShareBaseUrl(window.location.origin);
    }
  };

  const fetchFolders = async () => {
    try {
      const response = await axios.get(`${API}/media/folders/tree`);
      setFolders(response.data);
    } catch (error) {
      console.error('Failed to load folders');
    }
  };

  const fetchAssets = async () => {
    try {
      const params = new URLSearchParams();
      if (kindFilter && kindFilter !== 'all') {
        params.append('kind', kindFilter);
      }
      if (searchQuery) {
        params.append('search', searchQuery);
      }
      if (currentFolder) {
        params.append('folder_id', currentFolder);
      }
      const response = await axios.get(`${API}/media?${params}`);
      setAssets(response.data);
    } catch (error) {
      toast.error('Failed to load media assets');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    fetchAssets();
  };

  const handleFileUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const filesToUpload = [];
    let oversizedImage = null;
    let oversizedMedia = null;
    const remaining = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      // Check for oversized images
      if (isImageFile(file) && isOversized(file)) {
        if (!oversizedImage) {
          oversizedImage = file;
          remaining.push(...Array.from(files).slice(i + 1));
          break;
        }
      }
      // Check for oversized audio/video
      else if ((isAudioFile(file) || isVideoFile(file)) && isMediaOversized(file)) {
        if (!oversizedMedia) {
          oversizedMedia = file;
          remaining.push(...Array.from(files).slice(i + 1));
          break;
        }
      }
      else {
        filesToUpload.push(file);
      }
    }

    // Upload files that are fine
    if (filesToUpload.length > 0) {
      await uploadFiles(filesToUpload);
    }

    // Show resize dialog for oversized image
    if (oversizedImage) {
      setPendingFiles(remaining);
      setResizeFile(oversizedImage);
    }
    // Show compress dialog for oversized audio/video
    else if (oversizedMedia) {
      setCompressPendingFiles(remaining);
      setCompressFile(oversizedMedia);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const uploadFiles = async (files) => {
    setUploading(true);
    let successCount = 0;

    for (const file of files) {
      try {
        setUploadFileName(file.name);
        setUploadProgress(0);
        
        const formData = new FormData();
        formData.append('file', file);

        await axios.post(`${API}/media`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 300000, // 5 minute timeout for large files
          onUploadProgress: (e) => {
            if (e.total) {
              setUploadProgress(Math.round((e.loaded / e.total) * 100));
            }
          }
        });
        successCount++;
      } catch (error) {
        const errorMsg = error.response?.data?.detail || error.message || 'Upload failed';
        toast.error(`Failed to upload ${file.name}: ${errorMsg}`);
      }
    }

    if (successCount > 0) {
      toast.success(`Uploaded ${successCount} file(s)`);
      fetchAssets();
    }
    
    setUploading(false);
    setUploadProgress(0);
    setUploadFileName('');
  };

  const handleResized = async (resizedFile) => {
    setResizeFile(null);
    await uploadFiles([resizedFile, ...pendingFiles]);
    setPendingFiles([]);
  };

  const handleCompressed = async (compressedFile) => {
    setCompressFile(null);
    await uploadFiles([compressedFile, ...compressPendingFiles]);
    setCompressPendingFiles([]);
  };

  const handleCompressSkip = async (originalFile) => {
    setCompressFile(null);
    await uploadFiles([originalFile, ...compressPendingFiles]);
    setCompressPendingFiles([]);
  };

  const handleDeleteAsset = async (asset) => {
    if (!confirm(`Delete "${asset.title}"? This will remove it from all attached shows.`)) {
      return;
    }

    try {
      await axios.delete(`${API}/media/${asset.id}`);
      toast.success('Asset deleted');
      setAssets(assets.filter(a => a.id !== asset.id));
    } catch (error) {
      toast.error('Failed to delete asset');
    }
  };

  const handleEditTitle = async () => {
    if (!editingAsset || !newTitle.trim()) return;

    try {
      const response = await axios.put(`${API}/media/${editingAsset.id}`, {
        title: newTitle.trim()
      });
      setAssets(assets.map(a => a.id === editingAsset.id ? response.data : a));
      toast.success('Title updated');
      setEditingAsset(null);
    } catch (error) {
      toast.error('Failed to update title');
    }
  };

  const handleOpenShareDialog = async (asset) => {
    setShareAsset(asset);
    setShareLoading(true);
    setShareInfo(null);
    setCopied(false);
    
    try {
      // Check if share link already exists
      const response = await axios.get(`${API}/media/${asset.id}/share`);
      setShareInfo(response.data);
    } catch (error) {
      // No existing share link is fine
      setShareInfo({ has_share_link: false });
    } finally {
      setShareLoading(false);
    }
  };

  const handleCreateShareLink = async () => {
    if (!shareAsset) return;
    setShareLoading(true);
    
    try {
      const response = await axios.post(`${API}/media/${shareAsset.id}/share`);
      setShareInfo({
        has_share_link: true,
        share_token: response.data.share_token,
        created_at: response.data.created_at
      });
      toast.success('Share link created');
    } catch (error) {
      toast.error('Failed to create share link');
    } finally {
      setShareLoading(false);
    }
  };

  const handleRevokeShareLink = async () => {
    if (!shareAsset) return;
    setShareLoading(true);
    
    try {
      await axios.delete(`${API}/media/${shareAsset.id}/share`);
      setShareInfo({ has_share_link: false });
      toast.success('Share link revoked');
    } catch (error) {
      toast.error('Failed to revoke share link');
    } finally {
      setShareLoading(false);
    }
  };

  const getShareUrl = (token) => {
    // Use configured share base URL (e.g., https://clara.koodh.com)
    const baseUrl = shareBaseUrl || window.location.origin;
    return `${baseUrl}/api/share/${token}`;
  };

  const handleCopyShareLink = async () => {
    if (!shareInfo?.share_token) return;
    
    try {
      await navigator.clipboard.writeText(getShareUrl(shareInfo.share_token));
      setCopied(true);
      toast.success('Link copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error('Failed to copy link');
    }
  };

  // ============== FOLDER FUNCTIONS ==============

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    setFolderLoading(true);
    
    try {
      await axios.post(`${API}/media/folders`, {
        name: newFolderName.trim(),
        parent_id: newFolderParent
      });
      toast.success('Folder created');
      setShowNewFolderDialog(false);
      setNewFolderName('');
      setNewFolderParent(null);
      fetchFolders();
    } catch (error) {
      toast.error('Failed to create folder');
    } finally {
      setFolderLoading(false);
    }
  };

  const handleDeleteFolder = async (folderId) => {
    try {
      await axios.delete(`${API}/media/folders/${folderId}?move_to_root=true`);
      toast.success('Folder deleted');
      if (currentFolder === folderId) {
        setCurrentFolder(null);
      }
      setDeletingFolder(null);
      fetchFolders();
      fetchAssets();
    } catch (error) {
      toast.error('Failed to delete folder');
    }
  };

  const openDeleteFolderDialog = (folder) => {
    setDeletingFolder(folder);
  };

  // ============== FOLDER SHARING FUNCTIONS ==============

  const openShareFolderDialog = async (folder) => {
    setSharingFolder(folder);
    setShowShareFolderDialog(true);
    setSharingLoading(true);
    setSelectedUsersToShare([]);
    setSelectedSeriesToShare([]);
    setSelectedShowsToShare([]);
    
    try {
      // Fetch team users, series, shows, and existing shares in parallel
      const [usersRes, seriesRes, showsRes, sharesRes] = await Promise.all([
        axios.get(`${API}/users`),
        axios.get(`${API}/series`),
        axios.get(`${API}/shows`),
        axios.get(`${API}/media/folders/${folder.id}/shares`)
      ]);
      
      setTeamUsers(usersRes.data);
      setShowSeries(seriesRes.data);
      setIndividualShows(showsRes.data);
      setFolderShares(sharesRes.data);
    } catch (error) {
      toast.error('Failed to load sharing data');
    } finally {
      setSharingLoading(false);
    }
  };

  const handleShareFolderWithUsers = async () => {
    if (!sharingFolder || selectedUsersToShare.length === 0) return;
    setSharingLoading(true);
    
    try {
      await axios.post(`${API}/media/folders/${sharingFolder.id}/shares`, {
        user_ids: selectedUsersToShare
      });
      toast.success('Folder shared with users');
      
      // Refresh shares
      const sharesRes = await axios.get(`${API}/media/folders/${sharingFolder.id}/shares`);
      setFolderShares(sharesRes.data);
      setSelectedUsersToShare([]);
    } catch (error) {
      toast.error('Failed to share folder');
    } finally {
      setSharingLoading(false);
    }
  };

  const handleLinkFolderToSeries = async () => {
    if (!sharingFolder || selectedSeriesToShare.length === 0) return;
    setSharingLoading(true);
    
    try {
      await axios.post(`${API}/media/folders/${sharingFolder.id}/shares`, {
        series_ids: selectedSeriesToShare
      });
      toast.success('Folder linked to shows');
      
      // Refresh shares
      const sharesRes = await axios.get(`${API}/media/folders/${sharingFolder.id}/shares`);
      setFolderShares(sharesRes.data);
      setSelectedSeriesToShare([]);
    } catch (error) {
      toast.error('Failed to link folder');
    } finally {
      setSharingLoading(false);
    }
  };

  const handleLinkFolderToShows = async () => {
    if (!sharingFolder || selectedShowsToShare.length === 0) return;
    setSharingLoading(true);
    
    try {
      await axios.post(`${API}/media/folders/${sharingFolder.id}/shares`, {
        show_ids: selectedShowsToShare
      });
      toast.success('Folder linked to shows');
      
      // Refresh shares
      const sharesRes = await axios.get(`${API}/media/folders/${sharingFolder.id}/shares`);
      setFolderShares(sharesRes.data);
      setSelectedShowsToShare([]);
    } catch (error) {
      toast.error('Failed to link folder');
    } finally {
      setSharingLoading(false);
    }
  };

  const handleRemoveFolderShare = async (shareId) => {
    if (!sharingFolder) return;
    
    try {
      await axios.delete(`${API}/media/folders/${sharingFolder.id}/shares/${shareId}`);
      toast.success('Share removed');
      
      // Refresh shares
      const sharesRes = await axios.get(`${API}/media/folders/${sharingFolder.id}/shares`);
      setFolderShares(sharesRes.data);
    } catch (error) {
      toast.error('Failed to remove share');
    }
  };

  const toggleUserSelection = (userId) => {
    setSelectedUsersToShare(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const toggleSeriesSelection = (seriesId) => {
    setSelectedSeriesToShare(prev => 
      prev.includes(seriesId) 
        ? prev.filter(id => id !== seriesId)
        : [...prev, seriesId]
    );
  };

  const toggleShowSelection = (showId) => {
    setSelectedShowsToShare(prev => 
      prev.includes(showId) 
        ? prev.filter(id => id !== showId)
        : [...prev, showId]
    );
  };

  const handleRenameFolder = async () => {
    if (!editingFolder || !newFolderName.trim()) return;
    
    try {
      await axios.put(`${API}/media/folders/${editingFolder.id}`, {
        name: newFolderName.trim()
      });
      toast.success('Folder renamed');
      setEditingFolder(null);
      setNewFolderName('');
      fetchFolders();
    } catch (error) {
      toast.error('Failed to rename folder');
    }
  };

  const toggleFolderExpand = (folderId) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const handleMoveAssetToFolder = async (assetId, folderId) => {
    try {
      await axios.put(`${API}/media/${assetId}`, {
        folder_id: folderId
      });
      toast.success('Asset moved');
      fetchAssets();
    } catch (error) {
      toast.error('Failed to move asset');
    }
  };

  // Drag and drop handlers
  const handleDragStart = (event) => {
    const { active } = event;
    const asset = assets.find(a => a.id === active.id);
    setActiveAsset(asset);
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    setActiveAsset(null);
    
    if (!over) return;
    
    const assetId = active.id;
    const targetFolderId = over.id;
    
    // Ignore if dropping on same folder or not a valid target
    if (!targetFolderId) return;
    
    // Check if dropping on "all-files" (root)
    if (targetFolderId === 'all-files') {
      // Move to root (remove folder_id)
      try {
        await axios.put(`${API}/media/${assetId}`, {
          folder_id: null
        });
        toast.success('Asset moved to root');
        fetchAssets();
      } catch (error) {
        toast.error('Failed to move asset');
      }
      return;
    }
    
    // Move to a specific folder
    handleMoveAssetToFolder(assetId, targetFolderId);
  };

  // Recursive folder tree renderer with droppable support
  const renderFolderTree = (folderList, depth = 0) => {
    return folderList.map(folder => {
      const isExpanded = expandedFolders.has(folder.id);
      const isSelected = currentFolder === folder.id;
      const hasChildren = folder.children && folder.children.length > 0;
      
      return (
        <DroppableFolderItem
          key={folder.id}
          folder={folder}
          isExpanded={isExpanded}
          isSelected={isSelected}
          hasChildren={hasChildren}
          depth={depth}
          onSelect={() => setCurrentFolder(folder.id)}
          onToggleExpand={() => toggleFolderExpand(folder.id)}
          canEdit={canEdit}
          onNewSubfolder={() => {
            setNewFolderParent(folder.id);
            setShowNewFolderDialog(true);
          }}
          onRename={() => {
            setEditingFolder(folder);
            setNewFolderName(folder.name);
          }}
          onShare={() => openShareFolderDialog(folder)}
          onDelete={() => openDeleteFolderDialog(folder)}
        >
          {isExpanded && hasChildren && (
            <div>{renderFolderTree(folder.children, depth + 1)}</div>
          )}
        </DroppableFolderItem>
      );
    });
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString();
  };

  const getFileIcon = (kind, mimeType) => {
    if (kind === 'audio') return Music;
    if (kind === 'video') return Tv;
    if (kind === 'image' || mimeType?.startsWith('image/')) return Image;
    if (mimeType?.includes('pdf')) return FileText;
    return File;
  };

  const getFileUrl = (asset) => {
    // Use direct S3 URL when available (faster, no proxy needed)
    if (asset.s3_url) {
      return asset.s3_url;
    }
    // Fallback to proxy endpoint for local files
    return `${API}/media/serve/${asset.id}`;
  };

  const canPreview = (asset) => {
    const mimeType = asset.mime_type?.toLowerCase() || '';
    return (
      asset.kind === 'audio' ||
      asset.kind === 'video' ||
      mimeType.startsWith('image/') ||
      mimeType === 'application/pdf' ||
      mimeType === 'text/plain'
    );
  };

  const getPreviewType = (asset) => {
    const mimeType = asset.mime_type?.toLowerCase() || '';
    if (asset.kind === 'audio') return 'audio';
    if (asset.kind === 'video' || mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType === 'application/pdf') return 'pdf';
    if (mimeType === 'text/plain') return 'text';
    return 'unsupported';
  };

  const filteredAssets = assets.filter(asset =>
    asset.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div data-testid="media-library-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 sm:mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-zinc-900 mb-1 sm:mb-2">Media Library</h1>
          <p className="text-xs sm:text-sm text-zinc-400">
            {currentFolder ? folders.find(f => f.id === currentFolder)?.name || 'Folder' : 'All files and folders'}
          </p>
        </div>

        <div className="flex gap-2">
          {canEdit && (
            <>
              <Button
                data-testid="new-folder-btn"
                onClick={() => setShowNewFolderDialog(true)}
                variant="outline"
                className="border-zinc-300 text-zinc-600 hover:bg-zinc-100"
              >
                <FolderPlus className="w-4 h-4 mr-2" />
                New Folder
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.docx,.txt,.mp3,.wav,.m4a,.ogg,.aac,.flac,.jpg,.jpeg,.png,.gif,.webp,.mp4,.mov,.webm"
                onChange={handleFileUpload}
                className="hidden"
              />
              <Button
                data-testid="upload-media-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="bg-orange-500 hover:bg-orange-600"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {uploadProgress > 0 ? `${uploadProgress}%` : 'Uploading...'}
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Upload
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Main layout with sidebar wrapped in DndContext */}
      <DndContext 
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-6">
          {/* Folder Sidebar */}
          <div className="w-64 flex-shrink-0 hidden lg:block">
            <div className="bg-white/5 rounded-xl p-3 border border-white/10">
              <h3 className="text-sm font-semibold text-zinc-400 mb-3 px-2">Folders</h3>
              
              {/* All Files option (droppable) */}
              <DroppableAllFiles 
                isSelected={!currentFolder}
                assetCount={assets.length}
                onSelect={() => setCurrentFolder(null)}
              />
              
              {/* Folder tree */}
              <div className="space-y-0.5">
                {renderFolderTree(folders)}
              </div>
            </div>
          </div>

          {/* Main content area */}
          <div className="flex-1 min-w-0">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 mb-6">
              <form onSubmit={handleSearch} className="flex-1 sm:max-w-md">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                  <Input
                    data-testid="media-search-input"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search media..."
                    className="pl-9 bg-zinc-50 border-zinc-200 text-zinc-900 placeholder:text-zinc-400"
                  />
                </div>
              </form>

              <Select value={kindFilter} onValueChange={setKindFilter}>
                <SelectTrigger data-testid="kind-filter" className="w-full sm:w-40 bg-zinc-50 border-zinc-200 text-zinc-900">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent className="bg-white border-zinc-200">
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="document">Documents</SelectItem>
                  <SelectItem value="audio">Audio</SelectItem>
                  <SelectItem value="video">Video</SelectItem>
                  <SelectItem value="image">Images</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Breadcrumb for current folder */}
            {currentFolder && (
              <div className="flex items-center gap-2 mb-4 text-sm">
                <button
                  onClick={() => setCurrentFolder(null)}
                  className="text-zinc-400 hover:text-zinc-700 transition-colors"
                >
                  All Files
                </button>
                <ChevronRight className="w-4 h-4 text-zinc-600" />
                <span className="text-orange-400">
                  {folders.find(f => f.id === currentFolder)?.name || 'Folder'}
                </span>
              </div>
            )}

            {/* Assets Grid */}
        {filteredAssets.length === 0 ? (
          <div className="glass-card rounded-xl p-12 text-center">
            <File className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-zinc-900 mb-2">No media files</h3>
            <p className="text-zinc-400 mb-4">
              {searchQuery || kindFilter !== 'all'
                ? 'No files match your filters'
                : 'Upload documents and audio files to get started'}
            </p>
            {canEdit && !searchQuery && kindFilter === 'all' && (
              <Button
                onClick={() => fileInputRef.current?.click()}
                className="bg-orange-500 hover:bg-orange-600"
              >
                <Upload className="w-4 h-4 mr-2" />
                Upload Files
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredAssets.map((asset) => {
            const FileIcon = getFileIcon(asset.kind, asset.mime_type);
            return (
              <DraggableAssetCard key={asset.id} asset={asset}>
                <div
                  data-testid={`media-asset-${asset.id}`}
                  className={cn(
                    "glass-card rounded-xl p-4 hover:border-orange-500/30 transition-all group",
                    canPreview(asset) && "cursor-pointer"
                  )}
                  onClick={() => canPreview(asset) && setPreviewAsset(asset)}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      'p-3 rounded-lg flex-shrink-0',
                      asset.kind === 'audio' ? 'bg-amber-500/20' : 
                      asset.kind === 'video' ? 'bg-purple-500/20' :
                      asset.mime_type?.startsWith('image/') ? 'bg-green-500/20' :
                      'bg-blue-500/20'
                    )}>
                      <FileIcon className={cn(
                        'w-6 h-6',
                        asset.kind === 'audio' ? 'text-amber-500' : 
                        asset.kind === 'video' ? 'text-purple-500' :
                        asset.mime_type?.startsWith('image/') ? 'text-green-500' :
                        'text-blue-500'
                      )} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-zinc-900 truncate" title={asset.title}>
                        {asset.title}
                      </h3>
                      <p className="text-xs text-zinc-500 truncate">
                        {asset.original_filename}
                      </p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-zinc-400">
                        <span>{formatFileSize(asset.size)}</span>
                        <span>•</span>
                        <span>{formatDate(asset.created_at)}</span>
                      </div>
                    </div>
                    
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="bg-white border-zinc-200">
                        {canPreview(asset) && (
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewAsset(asset);
                            }}
                            className="text-zinc-600"
                          >
                            <Eye className="w-4 h-4 mr-2" />
                            Preview
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(getFileUrl(asset), '_blank');
                          }}
                          className="text-zinc-600"
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Download
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          data-testid={`share-asset-${asset.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenShareDialog(asset);
                          }}
                          className="text-zinc-600"
                        >
                          <Share2 className="w-4 h-4 mr-2" />
                          Share
                        </DropdownMenuItem>
                        {canEdit && (
                          <>
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingAsset(asset);
                                setNewTitle(asset.title);
                              }}
                              className="text-zinc-600"
                            >
                              <Pencil className="w-4 h-4 mr-2" />
                              Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteAsset(asset);
                              }}
                              className="text-orange-500 focus:text-orange-500"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Image Thumbnail Preview */}
                  {asset.mime_type?.startsWith('image/') && (
                    <div className="mt-3 rounded-lg overflow-hidden bg-zinc-200 h-32">
                      <img
                        src={getFileUrl(asset)}
                        alt={asset.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}

                  {/* Audio Player */}
                  {asset.kind === 'audio' && (
                    <div className="mt-3" onClick={(e) => e.stopPropagation()}>
                      <audio
                        controls
                        className="w-full h-8"
                        src={getFileUrl(asset)}
                      />
                    </div>
                  )}

                  {/* Video Thumbnail */}
                  {asset.kind === 'video' && (
                    <div className="mt-3 rounded-lg overflow-hidden bg-zinc-200 h-32 flex items-center justify-center">
                      <Tv className="w-8 h-8 text-purple-400" />
                    </div>
                  )}
                  
                  {/* Preview hint for PDF/text */}
                  {(asset.mime_type === 'application/pdf' || asset.mime_type === 'text/plain') && (
                    <div className="mt-3 flex items-center gap-2 text-xs text-zinc-500">
                      <Eye className="w-3.5 h-3.5" />
                      <span>Click to preview</span>
                    </div>
                  )}
                </div>
              </DraggableAssetCard>
            );
          })}
        </div>
      )}
          </div>
        </div>

        {/* Drag Overlay */}
        <DragOverlay>
          {activeAsset && (
            <div className="glass-card rounded-xl p-4 opacity-90 shadow-2xl border-orange-500/50">
              <div className="flex items-center gap-3">
                <div className={cn(
                  'p-2 rounded-lg',
                  activeAsset.kind === 'audio' ? 'bg-amber-500/20' : 
                  activeAsset.mime_type?.startsWith('image/') ? 'bg-green-500/20' :
                  'bg-blue-500/20'
                )}>
                  <File className="w-5 h-5 text-orange-400" />
                </div>
                <span className="text-sm text-zinc-700 font-medium truncate max-w-[200px]">
                  {activeAsset.title}
                </span>
              </div>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* New Folder Dialog */}
      <Dialog open={showNewFolderDialog} onOpenChange={setShowNewFolderDialog}>
        <DialogContent className="bg-white border-zinc-200">
          <DialogHeader>
            <DialogTitle className="text-zinc-900 flex items-center gap-2">
              <FolderPlus className="w-5 h-5 text-orange-500" />
              New Folder
            </DialogTitle>
          </DialogHeader>
          <Input
            data-testid="folder-name-input"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="Folder name"
            className="bg-zinc-50 border-zinc-200 text-zinc-900"
            autoFocus
          />
          {newFolderParent && (
            <p className="text-sm text-zinc-400">
              Creating inside: <span className="text-orange-400">{folders.find(f => f.id === newFolderParent)?.name}</span>
            </p>
          )}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setShowNewFolderDialog(false);
                setNewFolderName('');
                setNewFolderParent(null);
              }}
            >
              Cancel
            </Button>
            <Button
              data-testid="create-folder-btn"
              onClick={handleCreateFolder}
              disabled={folderLoading || !newFolderName.trim()}
              className="bg-orange-500 hover:bg-orange-600"
            >
              {folderLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Folder Dialog */}
      <Dialog open={!!editingFolder} onOpenChange={() => setEditingFolder(null)}>
        <DialogContent className="bg-white border-zinc-200">
          <DialogHeader>
            <DialogTitle className="text-zinc-900">Rename Folder</DialogTitle>
          </DialogHeader>
          <Input
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="Folder name"
            className="bg-zinc-50 border-zinc-200 text-zinc-900"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditingFolder(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleRenameFolder}
              disabled={!newFolderName.trim()}
              className="bg-orange-500 hover:bg-orange-600"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Folder Confirmation Dialog */}
      <Dialog open={!!deletingFolder} onOpenChange={() => setDeletingFolder(null)}>
        <DialogContent className="bg-white border-zinc-200 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-zinc-900 flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-red-500" />
              Delete Folder
            </DialogTitle>
          </DialogHeader>
          
          <div className="py-4">
            <p className="text-zinc-600 mb-2">
              Are you sure you want to delete <span className="font-semibold text-zinc-900">&ldquo;{deletingFolder?.name}&rdquo;</span>?
            </p>
            <p className="text-sm text-zinc-400">
              All files in this folder will be moved to the root level. This action cannot be undone.
            </p>
          </div>
          
          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => setDeletingFolder(null)}
              className="text-zinc-400"
            >
              Cancel
            </Button>
            <Button
              data-testid="confirm-delete-folder-btn"
              onClick={() => handleDeleteFolder(deletingFolder?.id)}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Folder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share Folder Dialog */}
      <Dialog open={showShareFolderDialog} onOpenChange={(open) => {
        if (!open) {
          setShowShareFolderDialog(false);
          setSharingFolder(null);
          setSelectedUsersToShare([]);
          setSelectedSeriesToShare([]);
        }
      }}>
        <DialogContent className="bg-white border-zinc-200 sm:max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-zinc-900 flex items-center gap-2">
              <Share2 className="w-5 h-5 text-orange-500" />
              Share &ldquo;{sharingFolder?.name}&rdquo;
            </DialogTitle>
          </DialogHeader>
          
          {sharingLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-6 py-2">
              {/* Current Shares */}
              {folderShares.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-zinc-400 mb-2">Current Shares</h4>
                  <div className="space-y-2">
                    {folderShares.map(share => (
                      <div key={share.id} className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2">
                          {share.user_id ? (
                            <>
                              <Users className="w-4 h-4 text-blue-400" />
                              <span className="text-sm text-zinc-600">{share.user_name}</span>
                            </>
                          ) : share.series_id ? (
                            <>
                              <Tv className="w-4 h-4 text-green-400" />
                              <span className="text-sm text-zinc-600">{share.series_title} <span className="text-xs text-zinc-500">(Series)</span></span>
                            </>
                          ) : share.show_id ? (
                            <>
                              <Tv className="w-4 h-4 text-purple-400" />
                              <span className="text-sm text-zinc-600">{share.show_title} <span className="text-xs text-zinc-500">(Show)</span></span>
                            </>
                          ) : (
                            <span className="text-sm text-zinc-400">Unknown</span>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveFolderShare(share.id)}
                          className="h-7 w-7 p-0 text-zinc-500 hover:text-red-400"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Share with Users */}
              <div>
                <h4 className="text-sm font-medium text-zinc-400 mb-2 flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Share with Team Members
                </h4>
                <div className="max-h-32 overflow-y-auto bg-white/5 rounded-lg p-2 space-y-1">
                  {teamUsers
                    .filter(user => !folderShares.some(s => s.user_id === user.id))
                    .map(user => (
                      <label
                        key={user.id}
                        className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-white/5 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedUsersToShare.includes(user.id)}
                          onChange={() => toggleUserSelection(user.id)}
                          className="rounded border-zinc-300 bg-zinc-100 text-orange-500 focus:ring-orange-500"
                        />
                        <span className="text-sm text-zinc-600">{user.name}</span>
                        <span className="text-xs text-zinc-500">{user.role}</span>
                      </label>
                    ))}
                  {teamUsers.filter(u => !folderShares.some(s => s.user_id === u.id)).length === 0 && (
                    <p className="text-sm text-zinc-500 text-center py-2">All team members already have access</p>
                  )}
                </div>
                {selectedUsersToShare.length > 0 && (
                  <Button
                    onClick={handleShareFolderWithUsers}
                    disabled={sharingLoading}
                    className="mt-2 bg-blue-600 hover:bg-blue-700"
                    size="sm"
                  >
                    Share with {selectedUsersToShare.length} user{selectedUsersToShare.length > 1 ? 's' : ''}
                  </Button>
                )}
              </div>

              {/* Link to Series (Recurring Shows) */}
              {showSeries.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-zinc-400 mb-2 flex items-center gap-2">
                    <Tv className="w-4 h-4 text-green-400" />
                    Link to Series (Recurring Shows)
                  </h4>
                  <div className="max-h-32 overflow-y-auto bg-white/5 rounded-lg p-2 space-y-1">
                    {showSeries
                      .filter(series => !folderShares.some(s => s.series_id === series.id))
                      .map(series => (
                        <label
                          key={series.id}
                          className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-white/5 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedSeriesToShare.includes(series.id)}
                            onChange={() => toggleSeriesSelection(series.id)}
                            className="rounded border-zinc-300 bg-zinc-100 text-orange-500 focus:ring-orange-500"
                          />
                          <span className="text-sm text-zinc-600">{series.title}</span>
                        </label>
                      ))}
                    {showSeries.filter(s => !folderShares.some(fs => fs.series_id === s.id)).length === 0 && (
                      <p className="text-sm text-zinc-500 text-center py-2">All series already linked</p>
                    )}
                  </div>
                  {selectedSeriesToShare.length > 0 && (
                    <Button
                      onClick={handleLinkFolderToSeries}
                      disabled={sharingLoading}
                      className="mt-2 bg-green-600 hover:bg-green-700"
                      size="sm"
                    >
                      Link to {selectedSeriesToShare.length} series
                    </Button>
                  )}
                </div>
              )}

              {/* Link to Individual Shows */}
              {individualShows.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-zinc-400 mb-2 flex items-center gap-2">
                    <Tv className="w-4 h-4 text-purple-400" />
                    Link to Individual Shows
                  </h4>
                  <div className="max-h-32 overflow-y-auto bg-white/5 rounded-lg p-2 space-y-1">
                    {individualShows
                      .filter(show => !folderShares.some(s => s.show_id === show.id))
                      .map(show => (
                        <label
                          key={show.id}
                          className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-white/5 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedShowsToShare.includes(show.id)}
                            onChange={() => toggleShowSelection(show.id)}
                            className="rounded border-zinc-300 bg-zinc-100 text-orange-500 focus:ring-orange-500"
                          />
                          <span className="text-sm text-zinc-600">{show.title}</span>
                          {show.scheduled_date && (
                            <span className="text-xs text-zinc-500">
                              {new Date(show.scheduled_date).toLocaleDateString()}
                            </span>
                          )}
                        </label>
                      ))}
                    {individualShows.filter(s => !folderShares.some(fs => fs.show_id === s.id)).length === 0 && (
                      <p className="text-sm text-zinc-500 text-center py-2">All shows already linked</p>
                    )}
                  </div>
                  {selectedShowsToShare.length > 0 && (
                    <Button
                      onClick={handleLinkFolderToShows}
                      disabled={sharingLoading}
                      className="mt-2 bg-purple-600 hover:bg-purple-700"
                      size="sm"
                    >
                      Link to {selectedShowsToShare.length} show{selectedShowsToShare.length > 1 ? 's' : ''}
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
          
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setShowShareFolderDialog(false);
                setSharingFolder(null);
              }}
              className="text-zinc-400"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Title Dialog */}
      <Dialog open={!!editingAsset} onOpenChange={() => setEditingAsset(null)}>
        <DialogContent className="bg-white border-zinc-200">
          <DialogHeader>
            <DialogTitle className="text-zinc-900">Rename File</DialogTitle>
          </DialogHeader>
          <Input
            data-testid="rename-input"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Enter new title"
            className="bg-zinc-50 border-zinc-200 text-zinc-900"
          />
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setEditingAsset(null)}
            >
              Cancel
            </Button>
            <Button
              data-testid="save-rename-btn"
              onClick={handleEditTitle}
              className="bg-orange-500 hover:bg-orange-600"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={!!previewAsset} onOpenChange={() => setPreviewAsset(null)}>
        <DialogContent className="bg-white border-zinc-200 max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="text-zinc-900 flex items-center gap-3">
              {previewAsset && (
                <>
                  {(() => {
                    const FileIcon = getFileIcon(previewAsset.kind, previewAsset.mime_type);
                    return <FileIcon className="w-5 h-5 text-orange-500" />;
                  })()}
                  <span className="truncate">{previewAsset?.title}</span>
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          
          {previewAsset && (
            <div className="flex-1 overflow-auto min-h-0">
              {/* Image Preview */}
              {getPreviewType(previewAsset) === 'image' && (
                <div className="flex items-center justify-center p-4 bg-white/80 backdrop-blur rounded-lg">
                  <img
                    src={getFileUrl(previewAsset)}
                    alt={previewAsset.title}
                    className="max-w-full max-h-[60vh] object-contain rounded"
                  />
                </div>
              )}

              {/* PDF Preview */}
              {getPreviewType(previewAsset) === 'pdf' && (
                <div className="w-full h-[60vh] bg-white/80 backdrop-blur rounded-lg overflow-hidden">
                  <iframe
                    src={`${getFileUrl(previewAsset)}#toolbar=1&navpanes=0`}
                    className="w-full h-full"
                    title={previewAsset.title}
                  />
                </div>
              )}

              {/* Audio Preview */}
              {getPreviewType(previewAsset) === 'audio' && (
                <div className="p-8 bg-white/80 backdrop-blur rounded-lg">
                  <div className="flex flex-col items-center gap-6">
                    <div className="w-32 h-32 rounded-full bg-amber-500/20 flex items-center justify-center">
                      <Volume2 className="w-16 h-16 text-amber-500" />
                    </div>
                    <div className="text-center">
                      <h3 className="text-lg font-medium text-zinc-900 mb-1">{previewAsset.title}</h3>
                      <p className="text-sm text-zinc-400">{previewAsset.original_filename}</p>
                      <p className="text-xs text-zinc-500 mt-1">{formatFileSize(previewAsset.size)}</p>
                    </div>
                    <audio
                      ref={audioPreviewRef}
                      controls
                      autoPlay
                      className="w-full max-w-md"
                      src={getFileUrl(previewAsset)}
                    />
                  </div>
                </div>
              )}

              {/* Video Preview */}
              {getPreviewType(previewAsset) === 'video' && (
                <div className="p-4 bg-white/80 backdrop-blur rounded-lg">
                  <video
                    controls
                    autoPlay
                    className="w-full max-h-[60vh] rounded"
                    src={getFileUrl(previewAsset)}
                  />
                  <div className="text-center mt-3">
                    <p className="text-sm text-zinc-400">{previewAsset.original_filename}</p>
                    <p className="text-xs text-zinc-500 mt-1">{formatFileSize(previewAsset.size)}</p>
                  </div>
                </div>
              )}

              {/* Text Preview */}
              {getPreviewType(previewAsset) === 'text' && (
                <TextFilePreview url={getFileUrl(previewAsset)} />
              )}

              {/* Unsupported Preview */}
              {getPreviewType(previewAsset) === 'unsupported' && (
                <div className="p-8 bg-white/80 backdrop-blur rounded-lg text-center">
                  <File className="w-16 h-16 text-zinc-500 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-zinc-900 mb-2">Preview not available</h3>
                  <p className="text-zinc-400 mb-4">
                    This file type cannot be previewed. You can download it instead.
                  </p>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="flex-shrink-0 mt-4">
            <Button
              variant="outline"
              onClick={() => setPreviewAsset(null)}
              className="border-zinc-300 text-zinc-600 hover:bg-zinc-100"
            >
              Close
            </Button>
            <Button
              onClick={() => window.open(getFileUrl(previewAsset), '_blank')}
              className="bg-orange-500 hover:bg-orange-600"
            >
              <Download className="w-4 h-4 mr-2" />
              Download
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share Dialog */}
      <Dialog open={!!shareAsset} onOpenChange={() => setShareAsset(null)}>
        <DialogContent className="bg-white border-zinc-200 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-zinc-900 flex items-center gap-2">
              <Share2 className="w-5 h-5 text-orange-500" />
              Share &ldquo;{shareAsset?.title}&rdquo;
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {shareLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
              </div>
            ) : shareInfo?.has_share_link ? (
              <>
                {/* Share link active */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-green-500">
                    <Link className="w-4 h-4" />
                    <span>Public link is active</span>
                  </div>
                  
                  <div className="flex gap-2">
                    <Input
                      data-testid="share-url-input"
                      readOnly
                      value={getShareUrl(shareInfo.share_token)}
                      className="bg-white/5 border-white/10 text-zinc-600 text-sm font-mono"
                    />
                    <Button
                      data-testid="copy-share-link-btn"
                      variant="outline"
                      size="icon"
                      onClick={handleCopyShareLink}
                      className="flex-shrink-0 border-zinc-300 hover:bg-zinc-100"
                    >
                      {copied ? (
                        <Check className="w-4 h-4 text-green-500" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => window.open(getShareUrl(shareInfo.share_token), '_blank')}
                      className="flex-shrink-0 border-zinc-300 hover:bg-zinc-100"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                  </div>
                  
                  <p className="text-xs text-zinc-500">
                    Anyone with this link can view and download this file without logging in.
                  </p>
                  
                  <div className="pt-2 border-t border-zinc-200">
                    <Button
                      data-testid="revoke-share-link-btn"
                      variant="ghost"
                      onClick={handleRevokeShareLink}
                      disabled={shareLoading}
                      className="text-red-500 hover:text-red-400 hover:bg-red-500/10"
                    >
                      <X className="w-4 h-4 mr-2" />
                      Revoke Share Link
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* No share link yet */}
                <div className="text-center py-4">
                  <div className="w-16 h-16 rounded-full bg-zinc-200 flex items-center justify-center mx-auto mb-4">
                    <Link className="w-8 h-8 text-zinc-500" />
                  </div>
                  <h3 className="text-zinc-900 font-medium mb-2">Create a public link</h3>
                  <p className="text-sm text-zinc-400 mb-4">
                    Generate a shareable URL that allows anyone to view and download this file.
                  </p>
                  <Button
                    data-testid="create-share-link-btn"
                    onClick={handleCreateShareLink}
                    disabled={shareLoading}
                    className="bg-orange-500 hover:bg-orange-600"
                  >
                    {shareLoading ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Link className="w-4 h-4 mr-2" />
                    )}
                    Generate Share Link
                  </Button>
                </div>
              </>
            )}
          </div>
          
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setShareAsset(null)}
              className="text-zinc-400"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Image Resize Dialog */}
      <ImageResizeDialog
        file={resizeFile}
        open={!!resizeFile}
        onClose={() => { setResizeFile(null); setPendingFiles([]); }}
        onResized={handleResized}
      />

      {/* Media Compress Dialog (Audio/Video) */}
      <MediaCompressDialog
        file={compressFile}
        open={!!compressFile}
        onClose={() => { setCompressFile(null); setCompressPendingFiles([]); }}
        onCompressed={handleCompressed}
        onSkip={handleCompressSkip}
      />

      {/* Upload Progress Overlay */}
      {uploading && uploadFileName && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center backdrop-blur-sm z-50"
          data-testid="upload-progress-overlay"
        >
          <div className="bg-white border border-zinc-200 rounded-xl p-6 shadow-2xl min-w-[320px]">
            <div className="flex items-center gap-3 mb-4">
              <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
              <div>
                <p className="text-zinc-700 font-medium">Uploading file...</p>
                <p className="text-zinc-400 text-sm truncate max-w-[220px]">{uploadFileName}</p>
              </div>
            </div>
            <div className="w-full bg-zinc-100 rounded-full h-3 overflow-hidden">
              <div
                className="bg-gradient-to-r from-orange-500 to-orange-400 h-full rounded-full transition-all duration-300 ease-out"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <p className="text-center text-orange-400 text-sm font-medium mt-2">{uploadProgress}%</p>
          </div>
        </div>
      )}
    </div>
  );
};

// Droppable "All Files" (root) component
const DroppableAllFiles = ({ isSelected, assetCount, onSelect }) => {
  const { isOver, setNodeRef } = useDroppable({
    id: 'all-files',
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors mb-1",
        isSelected ? "bg-orange-500/20 text-orange-400" : "hover:bg-white/5 text-zinc-400",
        isOver && "bg-orange-500/30 ring-2 ring-orange-500/50"
      )}
      onClick={onSelect}
    >
      <Folder className="w-4 h-4" />
      <span className="text-sm flex-1">All Files</span>
      <span className="text-xs text-zinc-500">{assetCount}</span>
    </div>
  );
};

// Droppable folder item component
const DroppableFolderItem = ({ 
  folder, 
  isExpanded, 
  isSelected, 
  hasChildren, 
  depth, 
  onSelect, 
  onToggleExpand, 
  canEdit,
  onNewSubfolder,
  onRename,
  onShare,
  onDelete,
  children 
}) => {
  const { isOver, setNodeRef } = useDroppable({
    id: folder.id,
  });

  return (
    <div ref={setNodeRef}>
      <div
        className={cn(
          "flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors group",
          isSelected ? "bg-orange-500/20 text-orange-400" : "hover:bg-white/5 text-zinc-400",
          isOver && "bg-orange-500/30 ring-2 ring-orange-500/50",
          depth > 0 && "ml-4"
        )}
        onClick={onSelect}
      >
        {hasChildren ? (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}
            className="p-0.5 hover:bg-white/10 rounded"
          >
            {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
        ) : (
          <span className="w-4" />
        )}
        {isSelected ? <FolderOpen className="w-4 h-4 flex-shrink-0" /> : <Folder className="w-4 h-4 flex-shrink-0" />}
        <span className="truncate flex-1 text-sm">{folder.name}</span>
        <span className="text-xs text-zinc-500">{folder.asset_count}</span>
        
        {canEdit && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <button 
                data-testid={`folder-menu-${folder.id}`}
                className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-white/10"
              >
                <MoreVertical className="w-3 h-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-zinc-100 border-zinc-300">
              <DropdownMenuItem
                onClick={(e) => { e.stopPropagation(); onNewSubfolder(); }}
                className="text-zinc-600"
              >
                <FolderPlus className="w-4 h-4 mr-2" />
                New Subfolder
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => { e.stopPropagation(); onRename(); }}
                className="text-zinc-600"
              >
                <Pencil className="w-4 h-4 mr-2" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => { e.stopPropagation(); onShare(); }}
                className="text-zinc-600"
              >
                <Users className="w-4 h-4 mr-2" />
                Share / Link
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="text-red-400"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {children}
    </div>
  );
};

// Draggable asset card component
const DraggableAssetCard = ({ asset, children }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: asset.id,
  });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
  } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative group/drag",
        isDragging && "opacity-50 z-50"
      )}
    >
      {/* Drag handle */}
      <div
        {...listeners}
        {...attributes}
        className="absolute top-4 left-4 p-1.5 rounded bg-zinc-700/90 opacity-0 group-hover/drag:opacity-100 cursor-grab active:cursor-grabbing transition-opacity z-20 hover:bg-zinc-200 shadow-lg"
        title="Sleep naar een map"
      >
        <GripVertical className="w-4 h-4 text-zinc-600" />
      </div>
      {children}
    </div>
  );
};

// Text file preview component
const TextFilePreview = ({ url }) => {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchText = async () => {
      try {
        const response = await fetch(url);
        const text = await response.text();
        setContent(text);
      } catch (err) {
        setError(true);
      } finally {
        setLoading(false);
      }
    };
    fetchText();
  }, [url]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8 bg-white/80 backdrop-blur rounded-lg">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 bg-white/80 backdrop-blur rounded-lg text-center">
        <p className="text-zinc-400">Failed to load file content</p>
      </div>
    );
  }

  return (
    <div className="bg-white/80 backdrop-blur rounded-lg p-4 max-h-[60vh] overflow-auto">
      <pre className="text-sm text-zinc-600 whitespace-pre-wrap font-mono">
        {content}
      </pre>
    </div>
  );
};

export default MediaLibraryPage;
