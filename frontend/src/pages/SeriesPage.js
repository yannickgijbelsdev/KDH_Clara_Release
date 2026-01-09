import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { toast } from 'sonner';
import {
  CalendarClock,
  Plus,
  MoreVertical,
  Trash2,
  Pencil,
  Play,
  Users,
  Loader2,
  Clock,
  ChevronRight,
  RefreshCw
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
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

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const RECURRENCE_OPTIONS = [
  { value: '', label: 'One-off (No recurrence)' },
  { value: 'FREQ=DAILY', label: 'Daily' },
  { value: 'FREQ=WEEKLY;BYDAY=MO', label: 'Weekly on Monday' },
  { value: 'FREQ=WEEKLY;BYDAY=TU', label: 'Weekly on Tuesday' },
  { value: 'FREQ=WEEKLY;BYDAY=WE', label: 'Weekly on Wednesday' },
  { value: 'FREQ=WEEKLY;BYDAY=TH', label: 'Weekly on Thursday' },
  { value: 'FREQ=WEEKLY;BYDAY=FR', label: 'Weekly on Friday' },
  { value: 'FREQ=WEEKLY;BYDAY=SA', label: 'Weekly on Saturday' },
  { value: 'FREQ=WEEKLY;BYDAY=SU', label: 'Weekly on Sunday' },
  { value: 'FREQ=WEEKLY;BYDAY=MO,WE,FR', label: 'Mon, Wed, Fri' },
  { value: 'FREQ=WEEKLY;BYDAY=TU,TH', label: 'Tue, Thu' },
  { value: 'FREQ=WEEKLY;BYDAY=SA,SU', label: 'Weekends' },
  { value: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', label: 'Weekdays' },
];

const SeriesPage = () => {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [series, setSeries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingSeries, setEditingSeries] = useState(null);
  const [generatingSeries, setGeneratingSeries] = useState(null);
  const [weeksAhead, setWeeksAhead] = useState(8);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    default_start_time: '09:00',
    default_end_time: '10:00',
    recurrence_rule: '',
    is_active: true
  });

  useEffect(() => {
    fetchSeries();
  }, []);

  const fetchSeries = async () => {
    try {
      const response = await axios.get(`${API}/series`);
      setSeries(response.data);
    } catch (error) {
      toast.error('Failed to load show series');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      if (editingSeries) {
        const response = await axios.put(`${API}/series/${editingSeries.id}`, formData);
        setSeries(series.map(s => s.id === editingSeries.id ? response.data : s));
        toast.success('Series updated');
      } else {
        const response = await axios.post(`${API}/series`, formData);
        setSeries([response.data, ...series]);
        toast.success('Series created');
      }
      closeDialog();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Operation failed');
    }
  };

  const handleDelete = async (seriesItem) => {
    if (!confirm(`Delete "${seriesItem.title}"? This will also delete all occurrences.`)) {
      return;
    }

    try {
      await axios.delete(`${API}/series/${seriesItem.id}`);
      setSeries(series.filter(s => s.id !== seriesItem.id));
      toast.success('Series deleted');
    } catch (error) {
      toast.error('Failed to delete series');
    }
  };

  const handleGenerateOccurrences = async () => {
    if (!generatingSeries) return;

    try {
      const response = await axios.post(
        `${API}/series/${generatingSeries.id}/generate`,
        { weeks_ahead: weeksAhead }
      );
      toast.success(`Generated ${response.data.length} occurrences`);
      setGeneratingSeries(null);
    } catch (error) {
      toast.error('Failed to generate occurrences');
    }
  };

  const openCreateDialog = () => {
    setFormData({
      title: '',
      description: '',
      default_start_time: '09:00',
      default_end_time: '10:00',
      recurrence_rule: '',
      is_active: true
    });
    setEditingSeries(null);
    setShowCreateDialog(true);
  };

  const openEditDialog = (seriesItem) => {
    setFormData({
      title: seriesItem.title,
      description: seriesItem.description || '',
      default_start_time: seriesItem.default_start_time,
      default_end_time: seriesItem.default_end_time,
      recurrence_rule: seriesItem.recurrence_rule || '',
      is_active: seriesItem.is_active
    });
    setEditingSeries(seriesItem);
    setShowCreateDialog(true);
  };

  const closeDialog = () => {
    setShowCreateDialog(false);
    setEditingSeries(null);
  };

  const getRecurrenceLabel = (rule) => {
    const option = RECURRENCE_OPTIONS.find(o => o.value === rule);
    return option?.label || rule || 'One-off';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-rose-500" />
      </div>
    );
  }

  return (
    <div data-testid="series-page">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-rose-500/20 rounded-lg">
            <CalendarClock className="w-6 h-6 text-rose-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Show Series</h1>
            <p className="text-sm text-zinc-400">Manage recurring shows</p>
          </div>
        </div>

        {isAdmin && (
          <Button
            data-testid="create-series-btn"
            onClick={openCreateDialog}
            className="bg-rose-500 hover:bg-rose-600"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Series
          </Button>
        )}
      </div>

      {/* Series Grid */}
      {series.length === 0 ? (
        <div className="glass-card rounded-xl p-12 text-center">
          <CalendarClock className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">No show series</h3>
          <p className="text-zinc-400 mb-4">
            Create a series to schedule recurring shows
          </p>
          {isAdmin && (
            <Button
              onClick={openCreateDialog}
              className="bg-rose-500 hover:bg-rose-600"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Series
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {series.map((seriesItem) => (
            <div
              key={seriesItem.id}
              data-testid={`series-card-${seriesItem.id}`}
              className="glass-card rounded-xl p-5 hover:border-rose-500/30 transition-all group cursor-pointer"
              onClick={() => navigate(`/occurrences?series=${seriesItem.id}`)}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${seriesItem.is_active ? 'bg-green-500/20' : 'bg-zinc-500/20'}`}>
                    <CalendarClock className={`w-5 h-5 ${seriesItem.is_active ? 'text-green-500' : 'text-zinc-500'}`} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">{seriesItem.title}</h3>
                    <p className="text-xs text-zinc-500">
                      {getRecurrenceLabel(seriesItem.recurrence_rule)}
                    </p>
                  </div>
                </div>

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
                          setGeneratingSeries(seriesItem);
                        }}
                        className="text-zinc-300"
                      >
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Generate Occurrences
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditDialog(seriesItem);
                        }}
                        className="text-zinc-300"
                      >
                        <Pencil className="w-4 h-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(seriesItem);
                        }}
                        className="text-rose-500 focus:text-rose-500"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>

              {seriesItem.description && (
                <p className="text-sm text-zinc-400 mt-3 line-clamp-2">
                  {seriesItem.description}
                </p>
              )}

              <div className="flex items-center gap-4 mt-4 pt-4 border-t border-white/5">
                <div className="flex items-center gap-2 text-sm text-zinc-400">
                  <Clock className="w-4 h-4" />
                  <span>{seriesItem.default_start_time} - {seriesItem.default_end_time}</span>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-500 ml-auto" />
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
              {editingSeries ? 'Edit Series' : 'Create Show Series'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label className="text-zinc-300">Title</Label>
              <Input
                data-testid="series-title-input"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Morning Show"
                required
                className="bg-white/5 border-white/10 text-white"
              />
            </div>

            <div>
              <Label className="text-zinc-300">Description (optional)</Label>
              <Textarea
                data-testid="series-description-input"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Show description..."
                className="bg-white/5 border-white/10 text-white"
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-zinc-300">Start Time</Label>
                <Input
                  data-testid="series-start-time-input"
                  type="time"
                  value={formData.default_start_time}
                  onChange={(e) => setFormData({ ...formData, default_start_time: e.target.value })}
                  required
                  className="bg-white/5 border-white/10 text-white"
                />
              </div>
              <div>
                <Label className="text-zinc-300">End Time</Label>
                <Input
                  data-testid="series-end-time-input"
                  type="time"
                  value={formData.default_end_time}
                  onChange={(e) => setFormData({ ...formData, default_end_time: e.target.value })}
                  required
                  className="bg-white/5 border-white/10 text-white"
                />
              </div>
            </div>

            <div>
              <Label className="text-zinc-300">Recurrence</Label>
              <Select
                value={formData.recurrence_rule}
                onValueChange={(value) => setFormData({ ...formData, recurrence_rule: value })}
              >
                <SelectTrigger data-testid="series-recurrence-select" className="bg-white/5 border-white/10 text-white">
                  <SelectValue placeholder="Select recurrence" />
                </SelectTrigger>
                <SelectContent className="bg-[#18181b] border-zinc-800">
                  {RECURRENCE_OPTIONS.map(option => (
                    <SelectItem key={option.value} value={option.value || 'none'}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={closeDialog}>
                Cancel
              </Button>
              <Button
                type="submit"
                data-testid="save-series-btn"
                className="bg-rose-500 hover:bg-rose-600"
              >
                {editingSeries ? 'Save Changes' : 'Create Series'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Generate Occurrences Dialog */}
      <Dialog open={!!generatingSeries} onOpenChange={() => setGeneratingSeries(null)}>
        <DialogContent className="bg-[#18181b] border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-white">Generate Occurrences</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-zinc-400">
              Generate show occurrences for <strong className="text-white">{generatingSeries?.title}</strong>
            </p>
            <div>
              <Label className="text-zinc-300">Weeks Ahead</Label>
              <Input
                data-testid="weeks-ahead-input"
                type="number"
                value={weeksAhead}
                onChange={(e) => setWeeksAhead(parseInt(e.target.value) || 8)}
                min={1}
                max={52}
                className="bg-white/5 border-white/10 text-white"
              />
              <p className="text-xs text-zinc-500 mt-1">
                Generate occurrences for the next {weeksAhead} weeks
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setGeneratingSeries(null)}>
              Cancel
            </Button>
            <Button
              data-testid="confirm-generate-btn"
              onClick={handleGenerateOccurrences}
              className="bg-rose-500 hover:bg-rose-600"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Generate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SeriesPage;
