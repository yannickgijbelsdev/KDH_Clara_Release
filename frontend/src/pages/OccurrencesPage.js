import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { toast } from 'sonner';
import {
  Calendar,
  Plus,
  MoreVertical,
  Trash2,
  Pencil,
  Loader2,
  Clock,
  Radio,
  CheckCircle,
  Circle,
  ChevronRight,
  Filter,
  ArrowLeft
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
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

const statusConfig = {
  draft: { label: 'Draft', color: 'text-zinc-400 bg-zinc-500/20', icon: Circle },
  scheduled: { label: 'Scheduled', color: 'text-amber-400 bg-amber-500/20', icon: Clock },
  completed: { label: 'Completed', color: 'text-green-400 bg-green-500/20', icon: CheckCircle },
};

const OccurrencesPage = () => {
  const { isAdmin, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const seriesId = searchParams.get('series');
  
  const [occurrences, setOccurrences] = useState([]);
  const [series, setSeries] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingOccurrence, setEditingOccurrence] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [formData, setFormData] = useState({
    title: '',
    date: new Date().toISOString().split('T')[0],
    start_time: '09:00',
    end_time: '10:00',
    status: 'draft'
  });

  useEffect(() => {
    fetchOccurrences();
    if (seriesId) {
      fetchSeries();
    }
  }, [seriesId, statusFilter]);

  const fetchSeries = async () => {
    try {
      const response = await axios.get(`${API}/series/${seriesId}`);
      setSeries(response.data);
    } catch (error) {
      console.error('Failed to load series');
    }
  };

  const fetchOccurrences = async () => {
    try {
      const params = new URLSearchParams();
      if (seriesId) {
        params.append('series_id', seriesId);
      }
      if (statusFilter && statusFilter !== 'all') {
        params.append('status', statusFilter);
      }
      const response = await axios.get(`${API}/occurrences?${params}`);
      setOccurrences(response.data);
    } catch (error) {
      toast.error('Failed to load occurrences');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      const payload = {
        ...formData,
        show_series_id: seriesId || null
      };

      if (editingOccurrence) {
        const response = await axios.put(`${API}/occurrences/${editingOccurrence.id}`, formData);
        setOccurrences(occurrences.map(o => o.id === editingOccurrence.id ? response.data : o));
        toast.success('Occurrence updated');
      } else {
        const response = await axios.post(`${API}/occurrences`, payload);
        setOccurrences([response.data, ...occurrences]);
        toast.success('Occurrence created');
      }
      closeDialog();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Operation failed');
    }
  };

  const handleDelete = async (occurrence) => {
    if (!confirm(`Delete "${occurrence.title}" on ${occurrence.date}?`)) {
      return;
    }

    try {
      await axios.delete(`${API}/occurrences/${occurrence.id}`);
      setOccurrences(occurrences.filter(o => o.id !== occurrence.id));
      toast.success('Occurrence deleted');
    } catch (error) {
      toast.error('Failed to delete occurrence');
    }
  };

  const openCreateDialog = () => {
    setFormData({
      title: series?.title || '',
      date: new Date().toISOString().split('T')[0],
      start_time: series?.default_start_time || '09:00',
      end_time: series?.default_end_time || '10:00',
      status: 'draft'
    });
    setEditingOccurrence(null);
    setShowCreateDialog(true);
  };

  const openEditDialog = (occurrence) => {
    setFormData({
      title: occurrence.title,
      date: occurrence.date,
      start_time: occurrence.start_time,
      end_time: occurrence.end_time,
      status: occurrence.status
    });
    setEditingOccurrence(occurrence);
    setShowCreateDialog(true);
  };

  const closeDialog = () => {
    setShowCreateDialog(false);
    setEditingOccurrence(null);
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
  };

  // Group occurrences by date
  const groupedOccurrences = occurrences.reduce((groups, occ) => {
    const date = occ.date;
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(occ);
    return groups;
  }, {});

  const sortedDates = Object.keys(groupedOccurrences).sort();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-rose-500" />
      </div>
    );
  }

  return (
    <div data-testid="occurrences-page">
      {/* Header */}
      <div className="flex flex-col gap-4 mb-6 sm:mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          {seriesId && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/series')}
              className="text-zinc-400 hover:text-white -ml-2 w-fit"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
          )}
          <div className="flex items-center gap-3">
            <div className="p-2 bg-rose-500/20 rounded-lg flex-shrink-0">
              <Calendar className="w-5 h-5 sm:w-6 sm:h-6 text-rose-500" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white">
                {series ? series.title : 'Show Occurrences'}
              </h1>
              <p className="text-xs sm:text-sm text-zinc-400">
                {series ? 'Scheduled instances' : 'All upcoming shows'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger data-testid="status-filter" className="w-full sm:w-36 bg-white/5 border-white/10 text-white">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent className="bg-[#18181b] border-zinc-800">
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>

          {isAdmin && (
            <Button
              data-testid="create-occurrence-btn"
              onClick={openCreateDialog}
              className="bg-rose-500 hover:bg-rose-600 w-full sm:w-auto"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Occurrence
            </Button>
          )}
        </div>
      </div>

      {/* Occurrences List */}
      {occurrences.length === 0 ? (
        <div className="glass-card rounded-xl p-12 text-center">
          <Calendar className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">No occurrences</h3>
          <p className="text-zinc-400 mb-4">
            {statusFilter !== 'all'
              ? 'No occurrences match this filter'
              : series
                ? 'Generate occurrences from the series page'
                : 'Create one-off shows or generate from a series'}
          </p>
          {isAdmin && (
            <Button
              onClick={openCreateDialog}
              className="bg-rose-500 hover:bg-rose-600"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Occurrence
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {sortedDates.map((date) => (
            <div key={date}>
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                {formatDate(date)}
              </h2>
              <div className="space-y-2">
                {groupedOccurrences[date].map((occurrence) => {
                  const StatusIcon = statusConfig[occurrence.status]?.icon || Circle;
                  return (
                    <div
                      key={occurrence.id}
                      data-testid={`occurrence-${occurrence.id}`}
                      className="glass-card rounded-xl p-4 hover:border-rose-500/30 transition-all group cursor-pointer"
                      onClick={() => navigate(`/occurrences/${occurrence.id}`)}
                    >
                      <div className="flex items-center gap-4">
                        <div className="p-2 bg-rose-500/20 rounded-lg">
                          <Radio className="w-5 h-5 text-rose-500" />
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-white">{occurrence.title}</h3>
                            <span className={cn(
                              'text-xs px-2 py-0.5 rounded-full flex items-center gap-1',
                              statusConfig[occurrence.status]?.color
                            )}>
                              <StatusIcon className="w-3 h-3" />
                              {statusConfig[occurrence.status]?.label}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-zinc-400 mt-1">
                            <Clock className="w-4 h-4" />
                            <span>{occurrence.start_time} - {occurrence.end_time}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {isAdmin && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="opacity-0 group-hover:opacity-100"
                                >
                                  <MoreVertical className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="bg-[#18181b] border-zinc-800">
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openEditDialog(occurrence);
                                  }}
                                  className="text-zinc-300"
                                >
                                  <Pencil className="w-4 h-4 mr-2" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDelete(occurrence);
                                  }}
                                  className="text-rose-500 focus:text-rose-500"
                                >
                                  <Trash2 className="w-4 h-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                          <ChevronRight className="w-5 h-5 text-zinc-500" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="bg-[#18181b] border-zinc-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">
              {editingOccurrence ? 'Edit Occurrence' : 'Add Occurrence'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label className="text-zinc-300">Title</Label>
              <Input
                data-testid="occurrence-title-input"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Show title"
                required
                className="bg-white/5 border-white/10 text-white"
              />
            </div>

            <div>
              <Label className="text-zinc-300">Date</Label>
              <Input
                data-testid="occurrence-date-input"
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                required
                className="bg-white/5 border-white/10 text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-zinc-300">Start Time</Label>
                <Input
                  data-testid="occurrence-start-time-input"
                  type="time"
                  value={formData.start_time}
                  onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                  required
                  className="bg-white/5 border-white/10 text-white"
                />
              </div>
              <div>
                <Label className="text-zinc-300">End Time</Label>
                <Input
                  data-testid="occurrence-end-time-input"
                  type="time"
                  value={formData.end_time}
                  onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                  required
                  className="bg-white/5 border-white/10 text-white"
                />
              </div>
            </div>

            <div>
              <Label className="text-zinc-300">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value) => setFormData({ ...formData, status: value })}
              >
                <SelectTrigger data-testid="occurrence-status-select" className="bg-white/5 border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#18181b] border-zinc-800">
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={closeDialog}>
                Cancel
              </Button>
              <Button
                type="submit"
                data-testid="save-occurrence-btn"
                className="bg-rose-500 hover:bg-rose-600"
              >
                {editingOccurrence ? 'Save Changes' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OccurrencesPage;
