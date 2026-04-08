import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import axios from 'axios';
import { format, parseISO } from 'date-fns';
import {
  Plus,
  Search,
  Filter,
  FileText,
  Link,
  BookOpen,
  ChevronRight,
  Globe,
  Folder,
  CheckCircle,
  AlertCircle,
  User,
  CalendarDays,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../context/PermissionsContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import CreateContentDialog from '../components/CreateContentDialog';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const typeIcons = {
  text: FileText,
  link: Link,
  reference: BookOpen,
};

const typeLabels = {
  text: 'Text',
  link: 'Link',
  reference: 'Reference',
};

const statusColors = {
  draft: 'bg-zinc-500/20 text-zinc-400',
  ready: 'bg-violet-500/20 text-violet-400',
};

const statusLabels = {
  draft: 'Draft',
  ready: 'Ready',
};

// Helper to get featured image URL (S3 or local)
const getFeaturedImageUrl = (featuredImage) => {
  if (!featuredImage) return null;
  // Use S3 URL if available, otherwise use local API endpoint
  if (featuredImage.s3_url) {
    return featuredImage.s3_url;
  }
  return `${API}/uploads/featured_images/${featuredImage.file_storage_key}`;
};

// Helper to get the best available featured image for a content item
// Priority: 1) content-level featured_image, 2) site-specific from publish_statuses, 3) external_featured_image
const getBestFeaturedImage = (item) => {
  // 1. Content-level featured image (direct upload)
  if (item.featured_image) {
    return getFeaturedImageUrl(item.featured_image);
  }
  
  // 2. Site-specific featured image from publish_statuses
  if (item.publish_statuses && item.publish_statuses.length > 0) {
    for (const ps of item.publish_statuses) {
      if (ps.featured_image) {
        // Use S3 URL if available
        if (ps.featured_image.s3_url) {
          return ps.featured_image.s3_url;
        }
        // Fallback to local endpoint
        if (ps.featured_image.file_storage_key) {
          return `${API}/uploads/featured_images/${ps.featured_image.file_storage_key}`;
        }
      }
    }
  }
  
  // 3. External featured image (WordPress import)
  if (item.external_featured_image) {
    return item.external_featured_image;
  }
  
  return null;
};

const ContentLibraryPage = () => {
  const { isEditor: legacyIsEditor } = useAuth();
  const { canCreate, canEdit } = usePermissions();
  const isEditor = canCreate('content_library') || canEdit('content_library') || legacyIsEditor;
  const navigate = useNavigate();
  const location = useLocation();
  const { mainSiteSlug } = useParams();
  const [allContent, setAllContent] = useState([]);
  const [filteredContent, setFilteredContent] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Helper to build paths with main site slug
  const buildPath = (path) => mainSiteSlug ? `/${mainSiteSlug}${path}` : path;

  const fetchContent = useCallback(async () => {
    try {
      const [contentRes, categoriesRes] = await Promise.all([
        axios.get(`${API}/content`),
        axios.get(`${API}/content/categories`)
      ]);
      setAllContent(contentRes.data);
      setCategories(categoriesRes.data);
    } catch (error) {
      toast.error('Failed to load content');
    } finally {
      setLoading(false);
    }
  }, []);

  // Refetch content when navigating back to this page
  useEffect(() => {
    fetchContent();
  }, [fetchContent, location.key]);

  // Client-side instant filtering
  useEffect(() => {
    let result = allContent;
    
    // Search filter (instant, case-insensitive)
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(item => 
        item.title?.toLowerCase().includes(query) ||
        item.excerpt?.toLowerCase().includes(query) ||
        item.body?.toLowerCase().includes(query) ||
        item.created_by_name?.toLowerCase().includes(query)
      );
    }
    
    // Type filter
    if (typeFilter) {
      result = result.filter(item => item.type === typeFilter);
    }
    
    // Status filter
    if (statusFilter) {
      result = result.filter(item => item.status === statusFilter);
    }
    
    // Source filter (MFY, GRK, etc.)
    if (sourceFilter) {
      result = result.filter(item => item.source === sourceFilter);
    }
    
    // Category filter
    if (categoryFilter) {
      result = result.filter(item => item.category_id === categoryFilter);
    }
    
    setFilteredContent(result);
  }, [allContent, searchQuery, typeFilter, statusFilter, sourceFilter, categoryFilter]);

  const handleContentCreated = (newContent) => {
    setAllContent([newContent, ...allContent]);
    setIsCreateOpen(false);
    toast.success('Content created');
  };

  // Get unique sources for filter dropdown
  const availableSources = [...new Set(allContent.filter(item => item.source).map(item => item.source))];

  // Calculate publish summary for an item
  const getPublishSummary = (item) => {
    if (!item.publish_statuses || item.publish_statuses.length === 0) {
      return null;
    }
    
    const synced = item.publish_statuses.filter(ps => ps.sync_status === 'synced').length;
    const failed = item.publish_statuses.filter(ps => ps.sync_status === 'failed').length;
    const total = item.publish_statuses.length;
    
    return { synced, failed, total };
  };

  return (
    <div data-testid="content-library-page">
      {/* Quick Action Bar */}
      <div className="flex items-center justify-between mb-6 sm:mb-8">
        <div className="bg-white rounded-2xl border border-black/[0.05] shadow-[0_6px_30px_rgba(0,0,0,0.06)] p-4 flex items-center gap-4" data-testid="panel-content-count">
          <div className="text-3xl font-bold text-zinc-900">{loading ? '–' : allContent.length}</div>
          <div>
            <div className="text-[10px] text-zinc-400 uppercase tracking-wider font-medium">Content Library</div>
            <div className="text-sm font-semibold text-zinc-700">
              {loading ? 'Loading...' : (filteredContent.length === allContent.length ? 'Articles' : `${filteredContent.length} filtered`)}
            </div>
          </div>
          {isEditor && (
            <Button
              data-testid="create-content-btn"
              onClick={() => setIsCreateOpen(true)}
              className="ml-1 bg-orange-500 hover:bg-orange-600 text-white rounded-full px-4 gap-1.5 text-sm shadow-lg shadow-orange-500/20"
            >
              <Plus className="w-3.5 h-3.5" /> New Article
            </Button>
          )}
        </div>
        <Button
          data-testid="content-calendar-btn"
          onClick={() => navigate(buildPath('/content/calendar'))}
          variant="outline"
          className="bg-transparent border-zinc-300 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 gap-2"
        >
          <CalendarDays className="w-4 h-4" />
          Calendar
        </Button>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <Input
            data-testid="content-search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search content..."
            className="pl-10 bg-zinc-50 border-zinc-200 text-zinc-900 placeholder:text-zinc-400"
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              data-testid="type-filter-btn"
              className="bg-zinc-100 border-zinc-200 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 gap-2"
            >
              <Filter className="w-4 h-4" />
              {typeFilter ? typeLabels[typeFilter] : 'All Types'}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="bg-white border-zinc-200">
            <DropdownMenuItem
              onClick={() => setTypeFilter('')}
              className="text-zinc-600 focus:text-zinc-900 focus:bg-zinc-100"
            >
              All Types
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setTypeFilter('text')}
              className="text-zinc-600 focus:text-zinc-900 focus:bg-zinc-100"
            >
              <FileText className="w-4 h-4 mr-2" /> Text
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setTypeFilter('link')}
              className="text-zinc-600 focus:text-zinc-900 focus:bg-zinc-100"
            >
              <Link className="w-4 h-4 mr-2" /> Link
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setTypeFilter('reference')}
              className="text-zinc-600 focus:text-zinc-900 focus:bg-zinc-100"
            >
              <BookOpen className="w-4 h-4 mr-2" /> Reference
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              data-testid="status-filter-btn"
              className="bg-zinc-100 border-zinc-200 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 gap-2"
            >
              {statusFilter ? statusLabels[statusFilter] : 'All Status'}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="bg-white border-zinc-200">
            <DropdownMenuItem
              onClick={() => setStatusFilter('')}
              className="text-zinc-600 focus:text-zinc-900 focus:bg-zinc-100"
            >
              All Status
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setStatusFilter('draft')}
              className="text-zinc-600 focus:text-zinc-900 focus:bg-zinc-100"
            >
              Draft
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setStatusFilter('ready')}
              className="text-zinc-600 focus:text-zinc-900 focus:bg-zinc-100"
            >
              Ready
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Source Filter */}
        {availableSources.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                data-testid="source-filter-btn"
                className="bg-zinc-100 border-zinc-200 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 gap-2"
              >
                <Globe className="w-4 h-4" />
                {sourceFilter || 'All Sources'}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="bg-white border-zinc-200">
              <DropdownMenuItem
                onClick={() => setSourceFilter('')}
                className="text-zinc-600 focus:text-zinc-900 focus:bg-zinc-100"
              >
                All Sources
              </DropdownMenuItem>
              {availableSources.map(source => (
                <DropdownMenuItem
                  key={source}
                  onClick={() => setSourceFilter(source)}
                  className="text-zinc-600 focus:text-zinc-900 focus:bg-zinc-100"
                >
                  {source}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Category Filter */}
        {categories.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                data-testid="category-filter-btn"
                className="bg-zinc-100 border-zinc-200 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 gap-2"
              >
                <Folder className="w-4 h-4" />
                {categoryFilter ? categories.find(c => c.id === categoryFilter)?.name : 'All Categories'}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="bg-white border-zinc-200">
              <DropdownMenuItem
                onClick={() => setCategoryFilter('')}
                className="text-zinc-600 focus:text-zinc-900 focus:bg-zinc-100"
              >
                All Categories
              </DropdownMenuItem>
              {categories.map(cat => (
                <DropdownMenuItem
                  key={cat.id}
                  onClick={() => setCategoryFilter(cat.id)}
                  className="text-zinc-600 focus:text-zinc-900 focus:bg-zinc-100"
                >
                  {cat.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {(typeFilter || statusFilter || sourceFilter || categoryFilter) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setTypeFilter('');
              setStatusFilter('');
              setSourceFilter('');
              setCategoryFilter('');
            }}
            className="text-zinc-400 hover:text-zinc-700"
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Content List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-white border border-zinc-200 rounded-xl p-6 animate-pulse"
            >
              <div className="h-6 bg-zinc-100 rounded w-1/3 mb-3" />
              <div className="h-4 bg-zinc-100 rounded w-2/3" />
            </div>
          ))}
        </div>
      ) : filteredContent.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8 text-zinc-500" />
          </div>
          <h3 className="text-lg font-semibold text-zinc-900 mb-2">
            {allContent.length === 0 ? 'No content yet' : 'No matching content'}
          </h3>
          <p className="text-zinc-400 mb-6">
            {allContent.length === 0 ? 'Start building your content library' : 'Try adjusting your filters'}
          </p>
          {allContent.length === 0 && isEditor && (
            <Button
              onClick={() => setIsCreateOpen(true)}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Content
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredContent.map((item, index) => {
            const TypeIcon = typeIcons[item.type] || FileText;
            const publishSummary = getPublishSummary(item);
            const featuredImageUrl = getBestFeaturedImage(item);

            return (
              <div
                key={item.id}
                data-testid={`content-item-${index}`}
                onClick={() => navigate(buildPath(`/content/${item.id}`))}
                className="bg-white border border-zinc-200 rounded-xl p-5 cursor-pointer hover:bg-white/70 hover:border-white/80 transition-all duration-200 group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    {/* Featured Image Thumbnail or Type Icon */}
                    {featuredImageUrl ? (
                      <div className="w-16 h-16 rounded-lg overflow-hidden bg-zinc-200 flex-shrink-0">
                        <img
                          src={featuredImageUrl}
                          alt=""
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.target.style.display = 'none';
                            e.target.parentElement.innerHTML = '<div class="w-full h-full flex items-center justify-center"><svg class="w-5 h-5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg></div>';
                          }}
                        />
                      </div>
                    ) : (
                      <div className="p-2 bg-zinc-50 rounded-lg">
                        <TypeIcon className="w-5 h-5 text-zinc-400" />
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="text-lg font-semibold text-zinc-900 group-hover:text-rose-400 transition-colors">
                          {item.title}
                        </h3>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[item.status]}`}>
                          {statusLabels[item.status]}
                        </span>
                      </div>
                      
                      {item.excerpt && (
                        <p className="text-zinc-400 text-sm line-clamp-1 mb-2">
                          {item.excerpt}
                        </p>
                      )}
                      
                      <div className="flex items-center gap-4 text-xs text-zinc-500">
                        <span className="flex items-center gap-1">
                          <TypeIcon className="w-3 h-3" />
                          {typeLabels[item.type]}
                        </span>
                        
                        {item.category && (
                          <span className="flex items-center gap-1 text-orange-400">
                            <Folder className="w-3 h-3" />
                            {item.category.name}
                          </span>
                        )}
                        
                        {item.source && (
                          <span className="flex items-center gap-1 text-blue-400">
                            <Globe className="w-3 h-3" />
                            {item.source}
                          </span>
                        )}
                        
                        {item.created_by_name && (
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {item.created_by_name}
                          </span>
                        )}
                        
                        <span>
                          Updated {format(parseISO(item.updated_at), 'MMM d, yyyy')}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    {/* WordPress Publish Status Summary */}
                    {publishSummary && (
                      <div className="flex items-center gap-2">
                        {publishSummary.synced > 0 && (
                          <div className="flex items-center gap-1 text-green-500">
                            <CheckCircle className="w-4 h-4" />
                            <span className="text-xs">{publishSummary.synced}</span>
                          </div>
                        )}
                        {publishSummary.failed > 0 && (
                          <div className="flex items-center gap-1 text-orange-500">
                            <AlertCircle className="w-4 h-4" />
                            <span className="text-xs">{publishSummary.failed}</span>
                          </div>
                        )}
                        <span className="text-xs text-zinc-500">WP</span>
                      </div>
                    )}
                    <ChevronRight className="w-5 h-5 text-zinc-600 group-hover:text-rose-400 transition-colors" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CreateContentDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onContentCreated={handleContentCreated}
      />
    </div>
  );
};

export default ContentLibraryPage;
