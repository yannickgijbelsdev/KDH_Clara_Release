import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { format, parseISO } from 'date-fns';
import { Plus, Calendar, Clock, ChevronRight, ChevronDown, Filter, Repeat, Layers, Trash2, Loader2, Radio } from 'lucide-react';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../context/PermissionsContext';
import CreateShowDialog from '../components/CreateShowDialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const statusColors = {
  draft: 'status-draft',
  scheduled: 'status-scheduled',
  completed: 'status-completed',
};

const statusLabels = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  completed: 'Completed',
};

// Individual show card component
const ShowCard = ({ show, index, onClick }) => (
  <div
    data-testid={`show-card-${index}`}
    onClick={onClick}
    className="show-card bg-zinc-100 rounded-xl overflow-hidden cursor-pointer group"
    style={{ animationDelay: `${index * 50}ms` }}
  >
    {/* Show Image */}
    {show.image && (
      <div className="w-full h-32 bg-zinc-200">
        <img
          src={show.image.s3_url || `${API}/uploads/show_title_images/${show.image.file_key}`}
          alt={show.title}
          className="w-full h-full object-cover"
        />
      </div>
    )}
    
    <div className="p-5">
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-lg font-semibold text-zinc-900 group-hover:text-orange-500 transition-colors line-clamp-1">
          {show.title}
        </h3>
        <ChevronRight className="w-5 h-5 text-zinc-600 group-hover:text-orange-500 transition-all group-hover:translate-x-1 flex-shrink-0" />
      </div>

      {show.description && (
        <p className="text-zinc-400 text-sm mb-3 line-clamp-2">
          {show.description}
        </p>
      )}

      <div className="flex items-center gap-4 text-sm text-zinc-500 mb-3">
        <div className="flex items-center gap-1.5">
          <Calendar className="w-4 h-4" />
          <span className="font-mono">
            {format(parseISO(show.date), 'MMM d, yyyy')}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Clock className="w-4 h-4" />
          <span className="font-mono">
            {show.start_time} - {show.end_time}
          </span>
        </div>
        {show.studio_name && (
          <div className="flex items-center gap-1.5">
            <Radio className="w-4 h-4" />
            <span>{show.studio_name}</span>
          </div>
        )}
      </div>

      <span
        className={`inline-block px-3 py-1 rounded-full text-xs font-medium uppercase tracking-wider ${statusColors[show.status]}`}
      >
        {statusLabels[show.status]}
      </span>
    </div>
  </div>
);

// Recurring series bundle component
const RecurringSeriesBundle = ({ seriesName, shows, onShowClick, onDeleteSeries, isEditor }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);
  
  // Sort shows by date (most recent first)
  const sortedShows = [...shows].sort((a, b) => 
    new Date(b.date) - new Date(a.date)
  );
  
  // Get next upcoming show
  const now = new Date();
  const upcomingShows = sortedShows.filter(s => new Date(s.date) >= now);
  const nextShow = upcomingShows.length > 0 ? upcomingShows[upcomingShows.length - 1] : sortedShows[0];
  
  // Count statuses
  const statusCounts = shows.reduce((acc, show) => {
    acc[show.status] = (acc[show.status] || 0) + 1;
    return acc;
  }, {});

  const handleDelete = async () => {
    setDeleting(true);
    try {
      // Use first show's ID to delete all with delete_all=true
      await onDeleteSeries(shows[0].id);
      setShowDeleteDialog(false);
    } catch (error) {
      // Error handled by parent
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
        {/* Series Header */}
        <div
          data-testid={`series-bundle-${seriesName.replace(/\s+/g, '-').toLowerCase()}`}
          className="p-5 cursor-pointer hover:bg-zinc-100/70 transition-colors"
        >
          <div className="flex items-center justify-between">
            <div 
              className="flex items-center gap-3 flex-1"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              <div className="p-2 bg-orange-500/20 rounded-lg">
                <Repeat className="w-5 h-5 text-orange-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-zinc-900 flex items-center gap-2">
                  {seriesName}
                  <span className="text-sm font-normal text-zinc-500">
                    ({shows.length} episodes)
                  </span>
                </h3>
                <div className="flex items-center gap-3 mt-1 text-sm text-zinc-500">
                  {nextShow && (
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      Next: {format(parseISO(nextShow.date), 'MMM d')}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {nextShow?.start_time} - {nextShow?.end_time}
                  </span>
                  {nextShow?.studio_name && (
                    <span className="flex items-center gap-1">
                      <Radio className="w-3.5 h-3.5" />
                      {nextShow.studio_name}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Status summary badges */}
              <div className="hidden sm:flex items-center gap-2">
                {statusCounts.scheduled > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium status-scheduled">
                    {statusCounts.scheduled} scheduled
                  </span>
                )}
                {statusCounts.completed > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium status-completed">
                    {statusCounts.completed} completed
                  </span>
                )}
                {statusCounts.draft > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium status-draft">
                    {statusCounts.draft} draft
                  </span>
                )}
              </div>
              {/* Delete button */}
              {isEditor && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDeleteDialog(true);
                  }}
                  className="h-8 w-8 text-zinc-500 hover:text-orange-500 hover:bg-orange-500/10"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
              <div onClick={() => setIsExpanded(!isExpanded)}>
                <ChevronDown 
                  className={`w-5 h-5 text-zinc-500 transition-transform cursor-pointer ${isExpanded ? 'rotate-180' : ''}`} 
                />
              </div>
            </div>
          </div>
        </div>

      {/* Expanded Episodes List */}
      {isExpanded && (
        <div className="border-t border-zinc-200 bg-white/60">
          <div className="p-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {sortedShows.map((show, idx) => (
              <div
                key={show.id}
                onClick={() => onShowClick(show.id)}
                className="p-4 bg-zinc-50 rounded-lg cursor-pointer hover:bg-zinc-100 transition-colors group"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-zinc-900 group-hover:text-rose-400">
                    {format(parseISO(show.date), 'EEEE, MMM d, yyyy')}
                  </span>
                  <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-rose-400" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500 font-mono">
                    {show.start_time} - {show.end_time}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[show.status]}`}>
                    {statusLabels[show.status]}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>

    {/* Delete Series Confirmation Dialog */}
    <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
      <AlertDialogContent className="bg-white border-zinc-200">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-zinc-900 flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-orange-500" />
            Delete Recurring Series
          </AlertDialogTitle>
          <AlertDialogDescription className="text-zinc-400">
            Are you sure you want to delete <span className="text-zinc-700 font-medium">"{seriesName}"</span> and all <span className="text-zinc-700 font-medium">{shows.length} episodes</span>? 
            This will permanently delete all rundowns and cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="bg-transparent border-zinc-300 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900">
            Cancel
          </AlertDialogCancel>
          <Button
            onClick={handleDelete}
            disabled={deleting}
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            {deleting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Deleting...
              </>
            ) : (
              <>Delete All {shows.length} Episodes</>
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
};

const ShowsPage = () => {
  const { isEditor: legacyIsEditor } = useAuth();
  const { canCreate, canEdit, canDelete } = usePermissions();
  const isEditor = canCreate('shows') || canEdit('shows') || legacyIsEditor;
  const canCreateShows = canCreate('shows');
  const canDeleteShows = canDelete('shows');
  const { mainSiteSlug } = useParams();
  const [shows, setShows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const navigate = useNavigate();
  
  // Helper for context-aware navigation - uses URL param directly
  const navTo = (path) => {
    navigate(mainSiteSlug ? `/${mainSiteSlug}${path}` : path);
  };

  const fetchShows = async () => {
    try {
      const params = statusFilter ? { status: statusFilter } : {};
      const response = await axios.get(`${API}/shows`, { params });
      setShows(response.data);
    } catch (error) {
      toast.error('Failed to load shows');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShows();
  }, [statusFilter]);

  const handleShowCreated = (newShow) => {
    setShows([newShow, ...shows]);
    setIsCreateOpen(false);
    toast.success('Show created successfully');
  };

  const handleDeleteSeries = async (showId) => {
    try {
      await axios.delete(`${API}/shows/${showId}?delete_all=true`);
      toast.success('Recurring series deleted successfully');
      fetchShows(); // Refresh the list
    } catch (error) {
      toast.error('Failed to delete series');
      throw error;
    }
  };

  // Organize shows into standalone and recurring series
  const organizeShows = () => {
    const standalone = shows.filter(s => !s.parent_show_id);
    const recurring = shows.filter(s => s.parent_show_id);
    
    // Group recurring shows by parent_show_id
    const seriesMap = {};
    recurring.forEach(show => {
      const parentId = show.parent_show_id;
      if (!seriesMap[parentId]) {
        seriesMap[parentId] = {
          name: show.title,
          shows: []
        };
      }
      seriesMap[parentId].shows.push(show);
    });
    
    return { standalone, series: Object.values(seriesMap) };
  };

  const { standalone, series } = organizeShows();

  return (
    <div data-testid="shows-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-zinc-900 mb-1 sm:mb-2">Shows</h1>
          <p className="text-sm sm:text-base text-zinc-400">Plan and manage your radio shows</p>
        </div>
        {canCreateShows && (
          <Button
            data-testid="create-show-btn"
            onClick={() => setIsCreateOpen(true)}
            className="bg-orange-500 hover:bg-orange-600 text-white gap-2 h-10 sm:h-11 px-4 sm:px-5 btn-primary w-full sm:w-auto"
          >
            <Plus className="w-5 h-5" />
            New Show
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 mb-6">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              data-testid="status-filter-btn"
              className="bg-zinc-100 border-zinc-200 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 gap-2"
            >
              <Filter className="w-4 h-4" />
              {statusFilter ? statusLabels[statusFilter] : 'All Status'}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="bg-white border-zinc-200">
            <DropdownMenuItem
              data-testid="filter-all"
              onClick={() => setStatusFilter('')}
              className="text-zinc-600 focus:text-zinc-900 focus:bg-zinc-100"
            >
              All Status
            </DropdownMenuItem>
            <DropdownMenuItem
              data-testid="filter-draft"
              onClick={() => setStatusFilter('draft')}
              className="text-zinc-600 focus:text-zinc-900 focus:bg-zinc-100"
            >
              Draft
            </DropdownMenuItem>
            <DropdownMenuItem
              data-testid="filter-scheduled"
              onClick={() => setStatusFilter('scheduled')}
              className="text-zinc-600 focus:text-zinc-900 focus:bg-zinc-100"
            >
              Scheduled
            </DropdownMenuItem>
            <DropdownMenuItem
              data-testid="filter-completed"
              onClick={() => setStatusFilter('completed')}
              className="text-zinc-600 focus:text-zinc-900 focus:bg-zinc-100"
            >
              Completed
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {statusFilter && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setStatusFilter('')}
            className="text-zinc-400 hover:text-zinc-700"
          >
            Clear filter
          </Button>
        )}
      </div>

      {/* Shows Content */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-white border border-zinc-200 rounded-xl p-6 animate-pulse"
            >
              <div className="h-6 bg-zinc-100 rounded w-3/4 mb-4" />
              <div className="h-4 bg-zinc-100 rounded w-1/2 mb-2" />
              <div className="h-4 bg-zinc-100 rounded w-1/3" />
            </div>
          ))}
        </div>
      ) : shows.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Calendar className="w-8 h-8 text-zinc-500" />
          </div>
          <h3 className="text-lg font-semibold text-zinc-900 mb-2">No shows yet</h3>
          <p className="text-zinc-400 mb-6">Get started by creating your first show</p>
          <Button
            onClick={() => setIsCreateOpen(true)}
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Show
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Recurring Series Section */}
          {series.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Layers className="w-5 h-5 text-orange-500" />
                <h2 className="text-lg font-semibold text-zinc-900">Recurring Shows</h2>
                <span className="text-sm text-zinc-500">({series.length} series)</span>
              </div>
              <div className="space-y-3">
                {series.map((s, idx) => (
                  <RecurringSeriesBundle
                    key={idx}
                    seriesName={s.name}
                    shows={s.shows}
                    onShowClick={(id) => navTo(`/shows/${id}`)}
                    onDeleteSeries={handleDeleteSeries}
                    isEditor={isEditor}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Standalone Shows Section */}
          {standalone.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Calendar className="w-5 h-5 text-violet-500" />
                <h2 className="text-lg font-semibold text-zinc-900">One-time Shows</h2>
                <span className="text-sm text-zinc-500">({standalone.length} shows)</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {standalone.map((show, index) => (
                  <ShowCard
                    key={show.id}
                    show={show}
                    index={index}
                    onClick={() => navTo(`/shows/${show.id}`)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <CreateShowDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onShowCreated={handleShowCreated}
      />
    </div>
  );
};

export default ShowsPage;
