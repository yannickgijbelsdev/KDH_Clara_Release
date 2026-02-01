import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { toast } from 'sonner';
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
  ExternalLink
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
import { cn } from '../lib/utils';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const MediaLibraryPage = () => {
  const { isEditor, isAdmin } = useAuth();
  const canEdit = isEditor || isAdmin;
  
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [kindFilter, setKindFilter] = useState('all');
  const [editingAsset, setEditingAsset] = useState(null);
  const [newTitle, setNewTitle] = useState('');
  const [previewAsset, setPreviewAsset] = useState(null);
  const fileInputRef = useRef(null);
  const audioPreviewRef = useRef(null);

  useEffect(() => {
    fetchAssets();
  }, [kindFilter]);

  const fetchAssets = async () => {
    try {
      const params = new URLSearchParams();
      if (kindFilter && kindFilter !== 'all') {
        params.append('kind', kindFilter);
      }
      if (searchQuery) {
        params.append('search', searchQuery);
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

    setUploading(true);
    let successCount = 0;

    for (const file of files) {
      try {
        const formData = new FormData();
        formData.append('file', file);

        await axios.post(`${API}/media`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        successCount++;
      } catch (error) {
        const errorMsg = error.response?.data?.detail || 'Upload failed';
        toast.error(`Failed to upload ${file.name}: ${errorMsg}`);
      }
    }

    if (successCount > 0) {
      toast.success(`Uploaded ${successCount} file(s)`);
      fetchAssets();
    }
    
    setUploading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
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
    if (kind === 'image' || mimeType?.startsWith('image/')) return Image;
    if (mimeType?.includes('pdf')) return FileText;
    return File;
  };

  const getFileUrl = (asset) => {
    return `${API}/uploads/media/${asset.file_storage_key}`;
  };

  const canPreview = (asset) => {
    const mimeType = asset.mime_type?.toLowerCase() || '';
    return (
      asset.kind === 'audio' ||
      mimeType.startsWith('image/') ||
      mimeType === 'application/pdf' ||
      mimeType === 'text/plain'
    );
  };

  const getPreviewType = (asset) => {
    const mimeType = asset.mime_type?.toLowerCase() || '';
    if (asset.kind === 'audio') return 'audio';
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
          <h1 className="text-2xl sm:text-3xl font-black text-white mb-1 sm:mb-2">Media Library</h1>
          <p className="text-xs sm:text-sm text-zinc-400">Documents, audio files, and images</p>
        </div>

        {canEdit && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.txt,.mp3,.wav,.m4a,.jpg,.jpeg,.png,.gif,.webp"
              onChange={handleFileUpload}
              className="hidden"
            />
            <Button
              data-testid="upload-media-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="bg-orange-500 hover:bg-orange-600 w-full sm:w-auto"
            >
              {uploading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Upload className="w-4 h-4 mr-2" />
              )}
              Upload Files
            </Button>
          </>
        )}
      </div>

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
              className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-zinc-500"
            />
          </div>
        </form>

        <Select value={kindFilter} onValueChange={setKindFilter}>
          <SelectTrigger data-testid="kind-filter" className="w-full sm:w-40 bg-white/5 border-white/10 text-white">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent className="bg-[#18181b] border-zinc-800">
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="document">Documents</SelectItem>
            <SelectItem value="audio">Audio</SelectItem>
            <SelectItem value="image">Images</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Assets Grid */}
      {filteredAssets.length === 0 ? (
        <div className="glass-card rounded-xl p-12 text-center">
          <File className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">No media files</h3>
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
              <div
                key={asset.id}
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
                    asset.mime_type?.startsWith('image/') ? 'bg-green-500/20' :
                    'bg-blue-500/20'
                  )}>
                    <FileIcon className={cn(
                      'w-6 h-6',
                      asset.kind === 'audio' ? 'text-amber-500' : 
                      asset.mime_type?.startsWith('image/') ? 'text-green-500' :
                      'text-blue-500'
                    )} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-white truncate" title={asset.title}>
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
                    <DropdownMenuContent align="end" className="bg-[#18181b] border-zinc-800">
                      {canPreview(asset) && (
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreviewAsset(asset);
                          }}
                          className="text-zinc-300"
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
                        className="text-zinc-300"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Download
                      </DropdownMenuItem>
                      {canEdit && (
                        <>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingAsset(asset);
                              setNewTitle(asset.title);
                            }}
                            className="text-zinc-300"
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
                  <div className="mt-3 rounded-lg overflow-hidden bg-zinc-800 h-32">
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
                
                {/* Preview hint for PDF/text */}
                {(asset.mime_type === 'application/pdf' || asset.mime_type === 'text/plain') && (
                  <div className="mt-3 flex items-center gap-2 text-xs text-zinc-500">
                    <Eye className="w-3.5 h-3.5" />
                    <span>Click to preview</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Title Dialog */}
      <Dialog open={!!editingAsset} onOpenChange={() => setEditingAsset(null)}>
        <DialogContent className="bg-[#18181b] border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-white">Rename File</DialogTitle>
          </DialogHeader>
          <Input
            data-testid="rename-input"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Enter new title"
            className="bg-white/5 border-white/10 text-white"
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
        <DialogContent className="bg-[#18181b] border-zinc-800 max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="text-white flex items-center gap-3">
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
                <div className="flex items-center justify-center p-4 bg-zinc-900 rounded-lg">
                  <img
                    src={getFileUrl(previewAsset)}
                    alt={previewAsset.title}
                    className="max-w-full max-h-[60vh] object-contain rounded"
                  />
                </div>
              )}

              {/* PDF Preview */}
              {getPreviewType(previewAsset) === 'pdf' && (
                <div className="w-full h-[60vh] bg-zinc-900 rounded-lg overflow-hidden">
                  <iframe
                    src={`${getFileUrl(previewAsset)}#toolbar=1&navpanes=0`}
                    className="w-full h-full"
                    title={previewAsset.title}
                  />
                </div>
              )}

              {/* Audio Preview */}
              {getPreviewType(previewAsset) === 'audio' && (
                <div className="p-8 bg-zinc-900 rounded-lg">
                  <div className="flex flex-col items-center gap-6">
                    <div className="w-32 h-32 rounded-full bg-amber-500/20 flex items-center justify-center">
                      <Volume2 className="w-16 h-16 text-amber-500" />
                    </div>
                    <div className="text-center">
                      <h3 className="text-lg font-medium text-white mb-1">{previewAsset.title}</h3>
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

              {/* Text Preview */}
              {getPreviewType(previewAsset) === 'text' && (
                <TextFilePreview url={getFileUrl(previewAsset)} />
              )}

              {/* Unsupported Preview */}
              {getPreviewType(previewAsset) === 'unsupported' && (
                <div className="p-8 bg-zinc-900 rounded-lg text-center">
                  <File className="w-16 h-16 text-zinc-500 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-white mb-2">Preview not available</h3>
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
              className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
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
      <div className="flex items-center justify-center p-8 bg-zinc-900 rounded-lg">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 bg-zinc-900 rounded-lg text-center">
        <p className="text-zinc-400">Failed to load file content</p>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 rounded-lg p-4 max-h-[60vh] overflow-auto">
      <pre className="text-sm text-zinc-300 whitespace-pre-wrap font-mono">
        {content}
      </pre>
    </div>
  );
};

export default MediaLibraryPage;
