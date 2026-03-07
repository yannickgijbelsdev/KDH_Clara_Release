import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { format, parseISO } from 'date-fns';
import {
  Trash2,
  RotateCcw,
  FileText,
  Link,
  BookOpen,
  Eye,
  User,
  Folder,
  Globe,
  RefreshCw,
  Loader2,
  XCircle,
  AlertTriangle,
  Search,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../context/PermissionsContext';
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

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const typeIcons = {
  text: FileText,
  link: Link,
  reference: BookOpen,
};

// Helper to get featured image URL (S3 or local)
const getFeaturedImageUrl = (featuredImage) => {
  if (!featuredImage) return null;
  if (featuredImage.s3_url) return featuredImage.s3_url;
  return `${API}/uploads/featured_images/${featuredImage.file_storage_key}`;
};

const TrashPage = () => {
  const { isAdmin } = useAuth();
  const { canView, loading: permissionsLoading } = usePermissions();
  const { mainSiteSlug } = useParams();
  const navigate = useNavigate();
  const [deletedContent, setDeletedContent] = useState([]);
  const [filteredContent, setFilteredContent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [restoring, setRestoring] = useState(null);
  const [permanentDeleteItem, setPermanentDeleteItem] = useState(null);
  const [permanentDeleting, setPermanentDeleting] = useState(false);
  
  // Helper for context-aware navigation - uses URL param directly
  const navTo = (path) => mainSiteSlug ? `/${mainSiteSlug}${path}` : path;

  useEffect(() => {
    if (permissionsLoading) return;
    if (!isAdmin && !canView('trash')) {
      navigate(navTo('/'));
      return;
    }
    fetchDeletedContent();
  }, [isAdmin, navigate, mainSiteSlug, permissionsLoading]);

  const fetchDeletedContent = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API}/content/admin/deleted`);
      setDeletedContent(response.data);
    } catch (error) {
      toast.error('Failed to load deleted content');
    } finally {
      setLoading(false);
    }
  };

  // Client-side search filter
  useEffect(() => {
    let result = deletedContent;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(item =>
        item.title?.toLowerCase().includes(query) ||
        item.created_by_name?.toLowerCase().includes(query) ||
        item.deleted_by_name?.toLowerCase().includes(query)
      );
    }

    setFilteredContent(result);
  }, [deletedContent, searchQuery]);

  const handleRestore = async (item) => {
    setRestoring(item.id);
    try {
      await axios.post(`${API}/content/${item.id}/restore`);
      toast.success(`"${item.title}" has been restored`);
      setDeletedContent(prev => prev.filter(c => c.id !== item.id));
    } catch (error) {
      toast.error('Failed to restore content');
    } finally {
      setRestoring(null);
    }
  };

  const handlePermanentDelete = async () => {
    if (!permanentDeleteItem) return;
    
    setPermanentDeleting(true);
    try {
      await axios.delete(`${API}/content/${permanentDeleteItem.id}/permanent`);
      toast.success(`"${permanentDeleteItem.title}" permanently deleted`);
      setDeletedContent(prev => prev.filter(c => c.id !== permanentDeleteItem.id));
      setPermanentDeleteItem(null);
    } catch (error) {
      toast.error('Failed to permanently delete content');
    } finally {
      setPermanentDeleting(false);
    }
  };

  if (!isAdmin && !canView('trash')) {
    return null;
  }

  return (
    <div data-testid="trash-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 sm:mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-white mb-1 sm:mb-2 flex items-center gap-3">
            <Trash2 className="w-8 h-8 text-orange-400" />
            Trash
          </h1>
          <p className="text-sm sm:text-base text-zinc-400">
            {deletedContent.length > 0 ? (
              <span>
                {deletedContent.length} deleted item{deletedContent.length !== 1 ? 's' : ''}
              </span>
            ) : (
              'No deleted content'
            )}
          </p>
        </div>
        <Button
          onClick={fetchDeletedContent}
          variant="outline"
          className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </Button>
      </div>

      {/* Search */}
      {deletedContent.length > 0 && (
        <div className="mb-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search deleted content..."
              className="pl-10 bg-[#18181b] border-zinc-800 text-white placeholder:text-zinc-500"
            />
          </div>
        </div>
      )}

      {/* Content List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-[#18181b] border border-zinc-800 rounded-xl p-6 animate-pulse"
            >
              <div className="h-6 bg-zinc-800 rounded w-1/3 mb-3" />
              <div className="h-4 bg-zinc-800 rounded w-2/3" />
            </div>
          ))}
        </div>
      ) : filteredContent.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <Trash2 className="w-8 h-8 text-zinc-500" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">
            {deletedContent.length === 0 ? 'Trash is empty' : 'No matching content'}
          </h3>
          <p className="text-zinc-400">
            {deletedContent.length === 0
              ? 'Deleted content will appear here for restoration'
              : 'Try adjusting your search'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredContent.map((item) => {
            const TypeIcon = typeIcons[item.type] || FileText;
            const isRestoring = restoring === item.id;

            return (
              <div
                key={item.id}
                className="bg-[#18181b] border border-red-500/20 rounded-xl p-4 sm:p-5 hover:border-red-500/40 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    {/* Featured Image or Type Icon */}
                    {item.featured_image || item.external_featured_image ? (
                      <div className="w-16 h-16 rounded-lg overflow-hidden bg-zinc-800 flex-shrink-0 opacity-60">
                        <img
                          src={
                            item.external_featured_image ||
                            getFeaturedImageUrl(item.featured_image)
                          }
                          alt=""
                          className="w-full h-full object-cover grayscale"
                        />
                      </div>
                    ) : (
                      <div className="p-3 bg-zinc-800 rounded-lg opacity-60">
                        <TypeIcon className="w-6 h-6 text-zinc-400" />
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-white font-semibold truncate">{item.title}</h3>
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/20 text-red-400">
                          Deleted
                        </span>
                      </div>

                      {item.excerpt && (
                        <p className="text-zinc-500 text-sm line-clamp-1 mb-2">
                          {item.excerpt}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
                        {item.category && (
                          <span className="flex items-center gap-1 text-orange-400/70">
                            <Folder className="w-3 h-3" />
                            {item.category.name}
                          </span>
                        )}
                        
                        {item.created_by_name && (
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            Created by {item.created_by_name}
                          </span>
                        )}

                        {item.source && (
                          <span className="flex items-center gap-1 text-blue-400/70">
                            <Globe className="w-3 h-3" />
                            {item.source}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 mt-2 text-xs text-red-400">
                        <Trash2 className="w-3 h-3" />
                        <span>
                          Deleted {item.deleted_at && format(parseISO(item.deleted_at), 'MMM d, yyyy HH:mm')}
                          {item.deleted_by_name && ` by ${item.deleted_by_name}`}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(navTo(`/content/${item.id}`))}
                      className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 gap-1"
                    >
                      <Eye className="w-4 h-4" />
                      View
                    </Button>

                    <Button
                      size="sm"
                      onClick={() => handleRestore(item)}
                      disabled={isRestoring}
                      className="bg-green-600 hover:bg-green-700 text-white gap-1"
                    >
                      {isRestoring ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <RotateCcw className="w-4 h-4" />
                      )}
                      Restore
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPermanentDeleteItem(item)}
                      className="bg-transparent border-red-500/50 text-red-400 hover:bg-red-500/10 gap-1"
                    >
                      <XCircle className="w-4 h-4" />
                      Delete Forever
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Permanent Delete Confirmation Dialog */}
      <AlertDialog open={!!permanentDeleteItem} onOpenChange={() => setPermanentDeleteItem(null)}>
        <AlertDialogContent className="bg-[#18181b] border-zinc-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              Permanently Delete Content
            </AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              <p className="mb-3">
                Are you sure you want to permanently delete &quot;{permanentDeleteItem?.title}&quot;?
              </p>
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <p className="text-sm text-red-400">
                  <strong>Warning:</strong> This action cannot be undone. The content will be permanently removed from the database.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handlePermanentDelete}
              disabled={permanentDeleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {permanentDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete Forever'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default TrashPage;
