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
  Clock,
  User,
  Check,
  CalendarDays,
  CheckSquare,
  Square,
  Send,
  Trash2,
  Copy,} from 'lucide-react';
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
  const { isEditor: legacyIsEditor, isAdmin: legacyIsAdmin, user } = useAuth();
  const { canCreate, canEdit } = usePermissions();
  const isEditor = canCreate('content_library') || canEdit('content_library') || legacyIsEditor;
  const isAdmin = legacyIsAdmin || user?.role === 'system_admin' || user?.is_network_admin === true;
  const navigate = useNavigate();
  const location = useLocation();
  const { mainSiteSlug } = useParams();
  const [allContent, setAllContent] = useState([]);
  const [filteredContent, setFilteredContent] = useState([]);
  const [categories, setCategories] = useState([]);
  const [rdsStations, setRdsStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Bulk-select state for "Publish to News API"
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkPublishing, setBulkPublishing] = useState(false);
  const [mainSite, setMainSite] = useState(null);
  // Always show bulk select. Backend gates the actual publish call —
  // sites without `clara_publish` get a clear 403 with instructions.
  const claraPublishEnabled = true;

  const toggleSelect = (id) => {
    setSelectedIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAllVisible = () => {
    setSelectedIds((cur) => {
      const visibleIds = filteredContent.map((c) => c.id);
      const allSelected = visibleIds.every((id) => cur.has(id));
      if (allSelected) {
        const next = new Set(cur);
        visibleIds.forEach((id) => next.delete(id));
        return next;
      }
      const next = new Set(cur);
      visibleIds.forEach((id) => next.add(id));
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());

  // Admin-only: nuke every published News API article on this site.
  // Optionally also deletes the WordPress posts in the same call.
  const unpublishAllNews = async () => {
    const confirm1 = window.confirm(
      'Unpublish ALL News API articles for this main site?\n\n' +
      'Drafts stay safe — only the public API will go empty.'
    );
    if (!confirm1) return;
    const alsoWp = window.confirm(
      'Also DELETE the matching WordPress posts? (Moves them to the WP Trash.)\n\n' +
      'Click "OK" to also wipe WordPress, "Cancel" to keep WordPress intact and only unpublish from the News API.'
    );
    const confirm2 = window.prompt(
      'Type DELETE to confirm.\n\nThis affects everyone reading /api/news/*' +
      (alsoWp ? ' AND the connected WordPress site(s).' : '.')
    );
    if (confirm2 !== 'DELETE') return;
    try {
      const r = await axios.post(
        `${API}/content/unpublish-all-news?include_wordpress=${alsoWp}`
      );
      const wp = r.data.wordpress;
      const wpSuffix = wp
        ? ` · WP deleted ${wp.deleted}${wp.failed ? ` (failed ${wp.failed})` : ''}`
        : '';
      toast.success(`Unpublished ${r.data.unpublished} article${r.data.unpublished === 1 ? '' : 's'} from the News API${wpSuffix}`);
      fetchContent();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not unpublish');
    }
  };

  const bulkApprove = async () => {
    if (selectedIds.size === 0) return;
    setBulkPublishing(true);
    try {
      const ids = Array.from(selectedIds);
      // Walk one-by-one — each request goes through the existing approval audit log
      const results = await Promise.allSettled(
        ids.map((id) => axios.put(`${API}/content/${id}/approval`, { approval_status: 'approved' }))
      );
      const ok = results.filter((r) => r.status === 'fulfilled').length;
      const fail = results.length - ok;
      toast.success(`Approved ${ok}${fail ? ` — ${fail} failed` : ''}`);
      fetchContent();
    } catch (err) {
      toast.error('Bulk approve failed');
    } finally {
      setBulkPublishing(false);
    }
  };

  const bulkDelete = async () => {
    if (selectedIds.size === 0) return;
    const ok = window.confirm(
      `Delete ${selectedIds.size} article${selectedIds.size === 1 ? '' : 's'}?\n\n` +
      'They will be moved to the Trash (soft delete) and disappear from the News API immediately.'
    );
    if (!ok) return;
    setBulkPublishing(true);
    try {
      const r = await axios.post(`${API}/content/bulk-delete`, {
        content_ids: Array.from(selectedIds),
      });
      toast.success(
        `Deleted ${r.data.deleted}${r.data.skipped ? ` · ${r.data.skipped} skipped` : ''}`
      );
      clearSelection();
      fetchContent();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Bulk delete failed');
    } finally {
      setBulkPublishing(false);
    }
  };

  const bulkPublishToApi = async () => {
    if (selectedIds.size === 0) return;
    // Pre-check: warn about items that aren't approved yet.
    const notApproved = filteredContent.filter(
      (c) => selectedIds.has(c.id) && c.approval_status !== 'approved'
    );
    if (notApproved.length > 0) {
      toast.error(
        `${notApproved.length} item${notApproved.length === 1 ? ' is' : 's are'} not approved yet — approve first.`,
        { duration: 5000 }
      );
      return;
    }
    setBulkPublishing(true);
    try {
      const r = await axios.post(`${API}/content/bulk-publish-clara`, {
        content_ids: Array.from(selectedIds),
      });
      const skipped = r.data.skipped || 0;
      const published = r.data.published || 0;
      const noImg = (r.data.results || []).filter((x) => x.reason === 'missing_featured_image').length;
      if (skipped > 0) {
        const reasonText = noImg > 0 ? ` (${noImg} missing featured image)` : '';
        toast.message(`Published ${published} · skipped ${skipped}${reasonText}`);
      } else {
        toast.success(`Published ${published} article${published === 1 ? '' : 's'} to News API`);
      }
      clearSelection();
      fetchContent();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Bulk publish failed');
    } finally {
      setBulkPublishing(false);
    }
  };

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

      // Fetch RDS stations for current main site → drives the source filter.
      // This makes the dropdown dynamic instead of hardcoded MFY/GRK.
      if (mainSiteSlug) {
        try {
          const [stationsRes, siteRes] = await Promise.all([
            axios.get(`${API}/rds-stations/by-slug/${mainSiteSlug}`),
            axios.get(`${API}/main-sites/by-slug/${mainSiteSlug}`).catch(() => ({ data: null })),
          ]);
          setRdsStations(stationsRes.data?.stations || []);
          setMainSite(siteRes.data || null);
        } catch {
          setRdsStations([]);
          setMainSite(null);
        }
      } else {
        setRdsStations([]);
        setMainSite(null);
      }
    } catch (error) {
      toast.error('Failed to load content');
    } finally {
      setLoading(false);
    }
  }, [mainSiteSlug]);

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
    
    // Source filter — case-insensitive match against either the station code
    // or the human-readable station name (legacy data may store "GRK" while
    // a station is named "GRK 90.7" with code "grk").
    if (sourceFilter) {
      const needle = sourceFilter.toLowerCase();
      result = result.filter((item) => (item.source || '').toLowerCase() === needle);
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

  // Quick inline category creation — used by the "+ New category" entry in the
  // filter dropdown. Prompts for a name, posts to the backend, refreshes the
  // list and immediately filters by the new category so the user sees what
  // they just created.
  const createCategoryInline = async () => {
    const name = window.prompt('New category name')?.trim();
    if (!name) return;
    try {
      const r = await axios.post(`${API}/content/categories`, { name });
      const newCat = r.data;
      setCategories((cur) => [...cur, newCat].sort((a, b) => a.name.localeCompare(b.name)));
      setCategoryFilter(newCat.id);
      toast.success(`Category "${newCat.name}" created`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not create category');
    }
  };

  const deleteCategoryInline = async (cat) => {
    if (!window.confirm(`Delete category "${cat.name}"?\n\nArticles in this category will be kept but un-categorised.`)) return;
    try {
      await axios.delete(`${API}/content/categories/${cat.id}`);
      setCategories((cur) => cur.filter((c) => c.id !== cat.id));
      if (categoryFilter === cat.id) setCategoryFilter('');
      toast.success(`Category "${cat.name}" removed`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not delete category');
    }
  };

  // Source options = UNION of (RDS station names) + (sources currently
  // present on content items). This way legacy "MFY"/"GRK" tags remain
  // filterable even after a site reconfiguration, while new stations
  // appear automatically as soon as they are added in RDS Settings.
  const availableSources = (() => {
    const fromStations = rdsStations
      .map((s) => s?.name || (s?.code ? s.code.toUpperCase() : null))
      .filter(Boolean);
    const fromContent = allContent
      .map((item) => item?.source)
      .filter(Boolean);
    const merged = new Set([...fromStations, ...fromContent]);
    return Array.from(merged);
  })();

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
          {isAdmin && (
            <Button
              data-testid="unpublish-all-news-btn"
              onClick={unpublishAllNews}
              variant="outline"
              className="ml-1 border-rose-200 text-rose-600 hover:bg-rose-50 rounded-full px-4 gap-1.5 text-sm"
              title="Admin-only: unpublish every News API article on this site"
            >
              <Trash2 className="w-3.5 h-3.5" /> /delete all-news
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

        {/* Category Filter — always shown so users can create the first
            category if none exist yet. */}
        {isEditor || categories.length > 0 ? (
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
            <DropdownMenuContent className="bg-white border-zinc-200 min-w-[220px]">
              <DropdownMenuItem
                onClick={() => setCategoryFilter('')}
                className="text-zinc-600 focus:text-zinc-900 focus:bg-zinc-100"
              >
                All Categories
              </DropdownMenuItem>
              {categories.map(cat => (
                <DropdownMenuItem
                  key={cat.id}
                  onSelect={(e) => { e.preventDefault(); setCategoryFilter(cat.id); }}
                  data-testid={`category-option-${cat.slug}`}
                  className="text-zinc-600 focus:text-zinc-900 focus:bg-zinc-100 flex items-center justify-between"
                >
                  <span>{cat.name}</span>
                  {isEditor && (
                    <button
                      type="button"
                      data-testid={`delete-category-${cat.slug}`}
                      onClick={(e) => { e.stopPropagation(); deleteCategoryInline(cat); }}
                      className="ml-3 w-5 h-5 rounded text-zinc-400 hover:text-rose-500 hover:bg-rose-50 flex items-center justify-center"
                      aria-label={`Delete category ${cat.name}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </DropdownMenuItem>
              ))}
              {isEditor && (
                <DropdownMenuItem
                  data-testid="create-category-btn"
                  onSelect={(e) => { e.preventDefault(); createCategoryInline(); }}
                  className="text-orange-600 focus:text-orange-700 focus:bg-orange-50 border-t border-zinc-100 mt-1 pt-2"
                >
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  New category
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}

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

      {/* News API Endpoints panel — surfaces the per-category public URLs so
          users know exactly where their content will be served. Only shown
          when the site has the clara_publish feature AND we have a slug. */}
      {mainSiteSlug && claraPublishEnabled && categories.length > 0 && (
        <div
          data-testid="news-api-endpoints"
          className="mb-4 rounded-2xl border border-zinc-200 bg-gradient-to-br from-white to-zinc-50/60 px-4 py-3"
        >
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <Send className="w-3.5 h-3.5 text-emerald-600" />
              </div>
              <div>
                <div className="text-sm font-semibold text-zinc-900">News API endpoints</div>
                <div className="text-[11px] text-zinc-500">
                  Public, read-only. One endpoint per category — perfect for your
                  website or app to fetch the latest articles.
                </div>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {categories.map((cat) => {
              const url = `${process.env.REACT_APP_BACKEND_URL}/api/news/${mainSiteSlug}/${cat.slug}`;
              return (
                <div
                  key={cat.id}
                  data-testid={`news-endpoint-${cat.slug}`}
                  className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="text-[11px] uppercase tracking-wider text-zinc-400 font-semibold">{cat.name}</div>
                    <code className="block text-xs text-zinc-700 truncate" title={url}>{url}</code>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(url);
                      toast.success(`Copied ${cat.name} endpoint`);
                    }}
                    data-testid={`copy-news-endpoint-${cat.slug}`}
                    className="flex-shrink-0 w-7 h-7 rounded-md text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 flex items-center justify-center transition-colors"
                    title="Copy endpoint URL"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Bulk Publish Bar — only visible when items selected AND clara_publish enabled */}
      {selectedIds.size > 0 && claraPublishEnabled && (
        <div
          data-testid="bulk-publish-bar"
          className="mb-4 flex items-center justify-between gap-3 rounded-2xl bg-zinc-900 text-white px-4 py-3 shadow-[0_10px_40px_rgba(0,0,0,0.18)]"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center">
              <Globe className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-semibold">
                {selectedIds.size} article{selectedIds.size === 1 ? '' : 's'} selected
              </div>
              <div className="text-xs text-white/60">
                Push directly to <code className="bg-white/10 px-1.5 rounded">/api/news/{mainSiteSlug}</code> — no WordPress needed
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={clearSelection}
              data-testid="bulk-clear-btn"
              className="text-white/70 hover:text-white hover:bg-white/10"
            >
              Clear
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={bulkPublishing}
              onClick={bulkApprove}
              data-testid="bulk-approve-btn"
              className="text-white border border-white/20 hover:bg-white/10 gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              Approve all
            </Button>
            {isEditor && (
              <Button
                variant="ghost"
                size="sm"
                disabled={bulkPublishing}
                onClick={bulkDelete}
                data-testid="bulk-delete-btn"
                className="text-rose-100 border border-rose-300/40 hover:bg-rose-500/20 gap-1.5"
                title="Soft-delete the selected articles"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </Button>
            )}
            <Button
              size="sm"
              disabled={bulkPublishing}
              onClick={bulkPublishToApi}
              data-testid="bulk-publish-clara-btn"
              className="bg-white text-zinc-900 hover:bg-zinc-100 gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              {bulkPublishing ? 'Publishing…' : 'Publish to News API'}
            </Button>
          </div>
        </div>
      )}

      {/* Select-all chip (only shown if bulk publish feature is enabled) */}
      {claraPublishEnabled && filteredContent.length > 0 && (
        <div className="flex items-center gap-2 mb-3 text-xs text-zinc-500">
          <button
            type="button"
            onClick={toggleSelectAllVisible}
            data-testid="select-all-visible-btn"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-100 hover:bg-zinc-200 transition-colors text-zinc-600"
          >
            <CheckSquare className="w-3.5 h-3.5" />
            {filteredContent.every((c) => selectedIds.has(c.id)) ? 'Deselect all' : `Select all (${filteredContent.length})`}
          </button>
          <span className="text-zinc-400">Bulk push to News API instead of WordPress</span>
        </div>
      )}

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
                className={`bg-white border rounded-xl p-5 cursor-pointer hover:bg-white/70 hover:border-white/80 transition-all duration-200 group ${
                  selectedIds.has(item.id) ? 'border-orange-300 ring-2 ring-orange-200/60' : 'border-zinc-200'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    {/* Bulk-select checkbox (only when clara_publish is enabled) */}
                    {claraPublishEnabled && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); toggleSelect(item.id); }}
                        data-testid={`select-item-${item.id}`}
                        className="mt-1 w-5 h-5 rounded-md flex items-center justify-center text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
                        aria-label="Select for bulk publish"
                      >
                        {selectedIds.has(item.id) ? (
                          <CheckSquare className="w-4 h-4 text-orange-500" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    )}
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
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg font-semibold text-zinc-900 group-hover:text-rose-400 transition-colors">
                          {item.title}
                        </h3>
                        {item.status === 'ready' ? (
                          <span title="Ready" style={{ color: '#ffffff' }} className="w-5 h-5 rounded-full bg-[#7c1ac8] flex items-center justify-center flex-shrink-0">
                            <Check className="w-3 h-3" strokeWidth={2.5} />
                          </span>
                        ) : (
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[item.status]}`}>
                            {statusLabels[item.status]}
                          </span>
                        )}
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
                        
                        {/* Distribution channel badges — News API and/or WordPress.
                            News API: item.status === 'published' (set by /publish-clara).
                            WordPress: any synced publish_statuses row. */}
                        {item.status === 'published' && (
                          <span
                            data-testid="badge-news-api"
                            className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-medium"
                          >
                            <Send className="w-2.5 h-2.5" /> News API
                          </span>
                        )}
                        {(item.publish_statuses || []).some((ps) => ps.sync_status === 'synced') && (
                          <span
                            data-testid="badge-wordpress"
                            className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200 text-[10px] font-medium"
                          >
                            <Globe className="w-2.5 h-2.5" /> WordPress
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
                    {/* Published destinations — show actual site names */}
                    {item.publish_statuses && item.publish_statuses.length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap justify-end max-w-[260px]" title="Published destinations">
                        {item.publish_statuses
                          .filter(ps => ps.wordpress_site_name && ps.wordpress_site_name !== 'Unknown')
                          .map((ps, i) => {
                            const synced = ps.sync_status === 'synced' || ps.sync_status === 'ok';
                            const failed = ps.sync_status === 'failed' || ps.sync_status === 'error';
                            return (
                              <span
                                key={i}
                                className={`inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                                  synced ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                  : failed ? 'bg-red-50 border-red-200 text-red-700'
                                  : 'bg-zinc-50 border-zinc-200 text-zinc-600'
                                }`}
                              >
                                {ps.wordpress_site_name}
                              </span>
                            );
                          })}
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
