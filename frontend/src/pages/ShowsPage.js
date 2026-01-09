import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { format, parseISO } from 'date-fns';
import { Plus, Calendar, Clock, ChevronRight, Filter } from 'lucide-react';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import CreateShowDialog from '../components/CreateShowDialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';

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

const ShowsPage = () => {
  const { isEditor } = useAuth();
  const [shows, setShows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const navigate = useNavigate();

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

  return (
    <div data-testid="shows-page">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-black text-white mb-2">Shows</h1>
          <p className="text-zinc-400">Plan and manage your radio shows</p>
        </div>
        {isEditor && (
          <Button
            data-testid="create-show-btn"
            onClick={() => setIsCreateOpen(true)}
            className="bg-rose-500 hover:bg-rose-600 text-white gap-2 h-11 px-5 btn-primary"
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
              className="bg-[#18181b] border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white gap-2"
            >
              <Filter className="w-4 h-4" />
              {statusFilter ? statusLabels[statusFilter] : 'All Status'}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="bg-[#18181b] border-zinc-800">
            <DropdownMenuItem
              data-testid="filter-all"
              onClick={() => setStatusFilter('')}
              className="text-zinc-300 focus:text-white focus:bg-zinc-800"
            >
              All Status
            </DropdownMenuItem>
            <DropdownMenuItem
              data-testid="filter-draft"
              onClick={() => setStatusFilter('draft')}
              className="text-zinc-300 focus:text-white focus:bg-zinc-800"
            >
              Draft
            </DropdownMenuItem>
            <DropdownMenuItem
              data-testid="filter-scheduled"
              onClick={() => setStatusFilter('scheduled')}
              className="text-zinc-300 focus:text-white focus:bg-zinc-800"
            >
              Scheduled
            </DropdownMenuItem>
            <DropdownMenuItem
              data-testid="filter-completed"
              onClick={() => setStatusFilter('completed')}
              className="text-zinc-300 focus:text-white focus:bg-zinc-800"
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
            className="text-zinc-400 hover:text-white"
          >
            Clear filter
          </Button>
        )}
      </div>

      {/* Shows Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-[#18181b] border border-zinc-800 rounded-xl p-6 animate-pulse"
            >
              <div className="h-6 bg-zinc-800 rounded w-3/4 mb-4" />
              <div className="h-4 bg-zinc-800 rounded w-1/2 mb-2" />
              <div className="h-4 bg-zinc-800 rounded w-1/3" />
            </div>
          ))}
        </div>
      ) : shows.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <Calendar className="w-8 h-8 text-zinc-500" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">No shows yet</h3>
          <p className="text-zinc-400 mb-6">Get started by creating your first show</p>
          <Button
            onClick={() => setIsCreateOpen(true)}
            className="bg-rose-500 hover:bg-rose-600 text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Show
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {shows.map((show, index) => (
            <div
              key={show.id}
              data-testid={`show-card-${index}`}
              onClick={() => navigate(`/shows/${show.id}`)}
              className="show-card bg-[#18181b] rounded-xl p-6 cursor-pointer group"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className="flex items-start justify-between mb-4">
                <h3 className="text-lg font-semibold text-white group-hover:text-rose-500 transition-colors line-clamp-1">
                  {show.title}
                </h3>
                <ChevronRight className="w-5 h-5 text-zinc-600 group-hover:text-rose-500 transition-all group-hover:translate-x-1" />
              </div>

              {show.description && (
                <p className="text-zinc-400 text-sm mb-4 line-clamp-2">
                  {show.description}
                </p>
              )}

              <div className="flex items-center gap-4 text-sm text-zinc-500 mb-4">
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
              </div>

              <span
                className={`inline-block px-3 py-1 rounded-full text-xs font-medium uppercase tracking-wider ${statusColors[show.status]}`}
              >
                {statusLabels[show.status]}
              </span>
            </div>
          ))}
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
