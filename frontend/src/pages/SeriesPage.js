import { useState, useEffect, useMemo } from 'react';
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
  Loader2,
  Clock,
  ChevronRight,
  RefreshCw,
  Calendar,
  Info
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Checkbox } from '../components/ui/checkbox';
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

// Day mapping: 0=Mon, 1=Tue, ..., 6=Sun
const DAYS_OF_WEEK = [
  { value: 0, label: 'Mon', full: 'Monday' },
  { value: 1, label: 'Tue', full: 'Tuesday' },
  { value: 2, label: 'Wed', full: 'Wednesday' },
  { value: 3, label: 'Thu', full: 'Thursday' },
  { value: 4, label: 'Fri', full: 'Friday' },
  { value: 5, label: 'Sat', full: 'Saturday' },
  { value: 6, label: 'Sun', full: 'Sunday' },
];

const INTERVAL_OPTIONS = [
  { value: 1, label: 'Every week' },
  { value: 2, label: 'Every 2 weeks' },
  { value: 3, label: 'Every 3 weeks' },
  { value: 4, label: 'Every 4 weeks' },
];

const SeriesPage = () => {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [series, setSeries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingSeries, setEditingSeries] = useState(null);
  const [generatingSeries, setGeneratingSeries] = useState(null);
  const [weeksAhead, setWeeksAhead] = useState(12);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    default_start_time: '09:00',
    default_end_time: '10:00',
    is_active: true,
    // New recurrence fields
    recurrence_type: 'weekly',
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    interval_weeks: 1,
    days_of_week: [],
    end_type: 'no_end' // 'no_end' or 'until_date'
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

  // Generate recurrence preview text
  const recurrencePreview = useMemo(() => {
    const { recurrence_type, days_of_week, interval_weeks, start_date, end_date, end_type, default_start_time, default_end_time } = formData;
    
    if (recurrence_type === 'none' || !days_of_week || days_of_week.length === 0) {
      if (start_date) {
        return `One-off show on ${start_date}, ${default_start_time}–${default_end_time}`;
      }
      return 'Select days to see preview';
    }

    const selectedDays = days_of_week
      .sort((a, b) => a - b)
      .map(d => DAYS_OF_WEEK.find(day => day.value === d)?.label)
      .filter(Boolean)
      .join(', ');

    const intervalText = interval_weeks === 1 ? 'Every week' : `Every ${interval_weeks} weeks`;
    const timeText = `${default_start_time}–${default_end_time}`;
    const startText = start_date ? `, starting ${start_date}` : '';
    const endText = end_type === 'until_date' && end_date ? ` until ${end_date}` : '';

    return `${intervalText} on ${selectedDays}, ${timeText}${startText}${endText}`;
  }, [formData]);

  const handleDayToggle = (dayValue) => {
    setFormData(prev => {
      const currentDays = prev.days_of_week || [];
      const newDays = currentDays.includes(dayValue)
        ? currentDays.filter(d => d !== dayValue)
        : [...currentDays, dayValue];
      return { ...prev, days_of_week: newDays };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate days selection for weekly recurrence
    if (formData.recurrence_type === 'weekly' && (!formData.days_of_week || formData.days_of_week.length === 0)) {
      toast.error('Please select at least one day of the week');
      return;
    }

    try {
      const payload = {
        title: formData.title,
        description: formData.description,
        default_start_time: formData.default_start_time,
        default_end_time: formData.default_end_time,
        is_active: formData.is_active,
        recurrence_type: formData.recurrence_type,
        start_date: formData.start_date,
        end_date: formData.end_type === 'until_date' ? formData.end_date : null,
        interval_weeks: formData.interval_weeks,
        days_of_week: formData.days_of_week.length > 0 ? formData.days_of_week : null
      };

      if (editingSeries) {
        const response = await axios.put(`${API}/series/${editingSeries.id}`, payload);
        setSeries(series.map(s => s.id === editingSeries.id ? response.data : s));
        toast.success('Series updated');
      } else {
        const response = await axios.post(`${API}/series`, payload);
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
      is_active: true,
      recurrence_type: 'weekly',
      start_date: new Date().toISOString().split('T')[0],
      end_date: '',
      interval_weeks: 1,
      days_of_week: [],
      end_type: 'no_end'
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
      is_active: seriesItem.is_active,
      recurrence_type: seriesItem.recurrence_type || 'weekly',
      start_date: seriesItem.start_date || new Date().toISOString().split('T')[0],
      end_date: seriesItem.end_date || '',
      interval_weeks: seriesItem.interval_weeks || 1,
      days_of_week: seriesItem.days_of_week || [],
      end_type: seriesItem.end_date ? 'until_date' : 'no_end'
    });
    setEditingSeries(seriesItem);
    setShowCreateDialog(true);
  };

  const closeDialog = () => {
    setShowCreateDialog(false);
    setEditingSeries(null);
  };

  const getRecurrenceLabel = (seriesItem) => {
    const days = seriesItem.days_of_week;
    if (!days || days.length === 0) {
      // Legacy: check recurrence_rule
      if (seriesItem.recurrence_rule) {
        return seriesItem.recurrence_rule.includes('DAILY') ? 'Daily' : 'Weekly';
      }
      return 'One-off';
    }

    const dayLabels = days
      .sort((a, b) => a - b)
      .map(d => DAYS_OF_WEEK.find(day => day.value === d)?.label)
      .filter(Boolean)
      .join(', ');

    const interval = seriesItem.interval_weeks || 1;
    const intervalText = interval === 1 ? 'Weekly' : `Every ${interval} weeks`;
    
    return `${intervalText}: ${dayLabels}`;
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
                      {getRecurrenceLabel(seriesItem)}
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
                {seriesItem.start_date && (
                  <div className="flex items-center gap-2 text-sm text-zinc-500">
                    <Calendar className="w-4 h-4" />
                    <span>from {seriesItem.start_date}</span>
                  </div>
                )}
                <ChevronRight className="w-4 h-4 text-zinc-500 ml-auto" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="bg-[#18181b] border-zinc-800 max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white">
              {editingSeries ? 'Edit Series' : 'Create Show Series'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Basic Info */}
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

            {/* Recurrence Section */}
            <div className="border-t border-white/10 pt-5">
              <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-rose-500" />
                Recurrence
              </h3>

              {/* Recurrence Type */}
              <div className="mb-4">
                <Label className="text-zinc-300">Frequency</Label>
                <Select
                  value={formData.recurrence_type}
                  onValueChange={(value) => setFormData({ ...formData, recurrence_type: value })}
                >
                  <SelectTrigger data-testid="recurrence-type-select" className="bg-white/5 border-white/10 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#18181b] border-zinc-800">
                    <SelectItem value="none">One-off (No recurrence)</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Start Date */}
              <div className="mb-4">
                <Label className="text-zinc-300">Start Date</Label>
                <Input
                  data-testid="series-start-date-input"
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  required
                  className="bg-white/5 border-white/10 text-white"
                />
              </div>

              {/* Days of Week - only show for weekly */}
              {formData.recurrence_type === 'weekly' && (
                <>
                  <div className="mb-4">
                    <Label className="text-zinc-300 mb-2 block">Days of Week</Label>
                    <div className="flex flex-wrap gap-2">
                      {DAYS_OF_WEEK.map((day) => (
                        <button
                          key={day.value}
                          type="button"
                          data-testid={`day-checkbox-${day.value}`}
                          onClick={() => handleDayToggle(day.value)}
                          className={cn(
                            'px-3 py-2 rounded-lg text-sm font-medium transition-all',
                            formData.days_of_week?.includes(day.value)
                              ? 'bg-rose-500 text-white'
                              : 'bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white'
                          )}
                        >
                          {day.label}
                        </button>
                      ))}
                    </div>
                    {formData.days_of_week?.length === 0 && (
                      <p className="text-xs text-amber-500 mt-2">Select at least one day</p>
                    )}
                  </div>

                  {/* Interval */}
                  <div className="mb-4">
                    <Label className="text-zinc-300">Repeat Every</Label>
                    <Select
                      value={String(formData.interval_weeks)}
                      onValueChange={(value) => setFormData({ ...formData, interval_weeks: parseInt(value) })}
                    >
                      <SelectTrigger data-testid="interval-select" className="bg-white/5 border-white/10 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[#18181b] border-zinc-800">
                        {INTERVAL_OPTIONS.map(opt => (
                          <SelectItem key={opt.value} value={String(opt.value)}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* End Condition */}
                  <div className="mb-4">
                    <Label className="text-zinc-300">End</Label>
                    <div className="space-y-3 mt-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="end_type"
                          checked={formData.end_type === 'no_end'}
                          onChange={() => setFormData({ ...formData, end_type: 'no_end', end_date: '' })}
                          className="text-rose-500"
                        />
                        <span className="text-zinc-300 text-sm">No end date</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="end_type"
                          checked={formData.end_type === 'until_date'}
                          onChange={() => setFormData({ ...formData, end_type: 'until_date' })}
                          className="text-rose-500"
                        />
                        <span className="text-zinc-300 text-sm">Until date</span>
                      </label>
                      {formData.end_type === 'until_date' && (
                        <Input
                          data-testid="series-end-date-input"
                          type="date"
                          value={formData.end_date}
                          onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                          min={formData.start_date}
                          className="bg-white/5 border-white/10 text-white ml-6"
                        />
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* Preview */}
              <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                <div className="flex items-start gap-2">
                  <Info className="w-4 h-4 text-rose-500 mt-0.5" />
                  <div>
                    <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">Preview</p>
                    <p className="text-sm text-white" data-testid="recurrence-preview">
                      {recurrencePreview}
                    </p>
                  </div>
                </div>
              </div>
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
            
            {generatingSeries?.days_of_week?.length > 0 && (
              <div className="bg-white/5 rounded-lg p-3 text-sm">
                <p className="text-zinc-400">
                  Days: <span className="text-white">
                    {generatingSeries.days_of_week
                      .sort((a, b) => a - b)
                      .map(d => DAYS_OF_WEEK.find(day => day.value === d)?.full)
                      .join(', ')}
                  </span>
                </p>
                {generatingSeries.interval_weeks > 1 && (
                  <p className="text-zinc-400">
                    Interval: <span className="text-white">Every {generatingSeries.interval_weeks} weeks</span>
                  </p>
                )}
              </div>
            )}
            
            <div>
              <Label className="text-zinc-300">Weeks Ahead</Label>
              <Input
                data-testid="weeks-ahead-input"
                type="number"
                value={weeksAhead}
                onChange={(e) => setWeeksAhead(parseInt(e.target.value) || 12)}
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
