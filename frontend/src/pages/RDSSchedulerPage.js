import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek } from 'date-fns';
import { enUS } from 'date-fns/locale';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  Edit2,
  Trash2,
  Clock,
  Repeat,
  Radio,
  X,
  Save,
  Loader2,
  Type,
  ArrowLeft,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Switch } from '../components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
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
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const RECURRENCE_OPTIONS = [
  { value: 'none', label: 'One-time' },
  { value: 'hourly', label: 'Every hour' },
  { value: 'daily', label: 'Every day' },
  { value: 'weekly', label: 'Every week' },
  { value: 'monthly', label: 'Every month' },
];

const DURATION_OPTIONS = [
  { value: 'fixed', label: 'Fixed duration' },
  { value: 'until_next', label: 'Until next item' },
];

const STATION_OPTIONS = [
  { value: 'mfy', label: 'Radio MFY' },
  { value: 'grk', label: 'Radio GRK' },
  { value: 'both', label: 'Both stations' },
];

// Create/Edit Dialog
const ScheduledTextDialog = ({ isOpen, onClose, onSave, item, currentStation }) => {
  const [text, setText] = useState('');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [targetStation, setTargetStation] = useState('mfy');
  const [durationType, setDurationType] = useState('fixed');
  const [durationMinutes, setDurationMinutes] = useState(5);
  const [recurrenceType, setRecurrenceType] = useState('none');
  const [recurrenceEndDate, setRecurrenceEndDate] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (item) {
      setText(item.text || '');
      const dt = item.start_datetime ? parseISO(item.start_datetime) : new Date();
      setStartDate(format(dt, 'yyyy-MM-dd'));
      setStartTime(format(dt, 'HH:mm'));
      setTargetStation(item.station || currentStation || 'mfy');
      setDurationType(item.duration_type || 'fixed');
      setDurationMinutes(item.duration_minutes || 5);
      setRecurrenceType(item.recurrence_type || 'none');
      setRecurrenceEndDate(item.recurrence_end_date || '');
      setEnabled(item.enabled ?? true);
    } else {
      // Defaults for new item
      setText('');
      setStartDate(format(new Date(), 'yyyy-MM-dd'));
      setStartTime('12:00');
      setTargetStation(currentStation || 'mfy');
      setDurationType('fixed');
      setDurationMinutes(5);
      setRecurrenceType('none');
      setRecurrenceEndDate('');
      setEnabled(true);
    }
  }, [item, isOpen, currentStation]);

  const handleSave = async () => {
    if (!text.trim()) {
      toast.error('Please enter text');
      return;
    }
    if (!startDate || !startTime) {
      toast.error('Please select a date and time');
      return;
    }

    setSaving(true);
    try {
      const startDatetime = `${startDate}T${startTime}:00`;
      await onSave({
        text: text.trim(),
        start_datetime: startDatetime,
        station: targetStation,
        duration_type: durationType,
        duration_minutes: durationType === 'fixed' ? durationMinutes : null,
        recurrence_type: recurrenceType,
        recurrence_end_date: recurrenceEndDate || null,
        enabled,
      });
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Could not save item');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#18181b] border border-zinc-700 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h3 className="text-lg font-semibold text-white">
            {item ? 'Edit scheduled text' : 'New scheduled text'}
          </h3>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Text */}
          <div>
            <Label className="text-zinc-400 text-sm">Custom text</Label>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Enter RDS text..."
              className="bg-zinc-800 border-zinc-700 text-white mt-1 resize-none"
              rows={3}
            />
          </div>

          {/* Station Selection */}
          <div>
            <Label className="text-zinc-400 text-sm">Visible on</Label>
            <Select value={targetStation} onValueChange={setTargetStation}>
              <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-800 border-zinc-700">
                {STATION_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value} className="text-zinc-300">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-zinc-400 text-sm">Date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-zinc-800 border-zinc-700 text-white mt-1"
              />
            </div>
            <div>
              <Label className="text-zinc-400 text-sm">Time</Label>
              <Input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="bg-zinc-800 border-zinc-700 text-white mt-1"
              />
            </div>
          </div>

          {/* Duration */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-zinc-400 text-sm">Duration type</Label>
              <Select value={durationType} onValueChange={setDurationType}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  {DURATION_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value} className="text-zinc-300">
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {durationType === 'fixed' && (
              <div>
                <Label className="text-zinc-400 text-sm">Duration (minutes)</Label>
                <Input
                  type="number"
                  min="1"
                  max="1440"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(parseInt(e.target.value) || 5)}
                  className="bg-zinc-800 border-zinc-700 text-white mt-1"
                />
              </div>
            )}
          </div>

          {/* Recurrence */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-zinc-400 text-sm">Recurrence</Label>
              <Select value={recurrenceType} onValueChange={setRecurrenceType}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  {RECURRENCE_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value} className="text-zinc-300">
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {recurrenceType !== 'none' && (
              <div>
                <Label className="text-zinc-400 text-sm">End date (optional)</Label>
                <Input
                  type="date"
                  value={recurrenceEndDate}
                  onChange={(e) => setRecurrenceEndDate(e.target.value)}
                  className="bg-zinc-800 border-zinc-700 text-white mt-1"
                />
              </div>
            )}
          </div>

          {/* Enabled */}
          <div className="flex items-center gap-3">
            <Switch
              checked={enabled}
              onCheckedChange={setEnabled}
              className="data-[state=checked]:bg-green-500"
            />
            <Label className="text-zinc-400 text-sm">Active</Label>
          </div>

          {/* Info */}
          <div className="bg-zinc-900 rounded-lg p-3 text-xs text-zinc-500">
            <p><strong>Note:</strong> Shows always take priority over scheduled custom texts. Custom text is only shown when there is no active show.</p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t border-zinc-800">
          <Button variant="outline" onClick={onClose} className="border-zinc-700 text-zinc-300">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} className="bg-orange-500 hover:bg-orange-600 text-white">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Save
          </Button>
        </div>
      </div>
    </div>
  );
};

// Calendar Day Cell
const CalendarDay = ({ date, items, isCurrentMonth, onItemClick, onAddClick }) => {
  const isToday = isSameDay(date, new Date());
  const dayItems = items.filter(item => item.occurrence_date === format(date, 'yyyy-MM-dd'));

  return (
    <div
      className={`aspect-square p-1 rounded-lg transition-all duration-200 relative
        ${isCurrentMonth ? 'bg-[#27272a]' : 'bg-[#1a1a1c]'}
        ${isToday ? 'ring-2 ring-violet-500' : ''}
        hover:bg-zinc-700 group
      `}
    >
      <div className="flex items-center justify-between mb-1">
        <span className={`text-sm font-mono
          ${isCurrentMonth ? 'text-zinc-300' : 'text-zinc-600'}
          ${isToday ? 'text-violet-400 font-bold' : ''}
        `}>
          {format(date, 'd')}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onAddClick(date)}
          className="h-5 w-5 p-0 text-zinc-600 hover:text-white opacity-0 group-hover:opacity-100"
        >
          <Plus className="w-3 h-3" />
        </Button>
      </div>
      <div className="space-y-0.5">
        {dayItems.slice(0, 3).map((item, idx) => {
          // Determine color based on station
          let colorClass = 'bg-zinc-800 text-zinc-500'; // disabled
          if (item.enabled) {
            if (item.station === 'both') {
              colorClass = 'bg-green-500/20 text-green-300';
            } else if (item.station === 'mfy') {
              colorClass = 'bg-orange-500/20 text-orange-300';
            } else {
              colorClass = 'bg-violet-500/20 text-violet-300';
            }
          }
          return (
            <button
              key={`${item.id}-${idx}`}
              onClick={() => onItemClick(item)}
              className={`w-full text-left px-1.5 py-0.5 rounded text-xs truncate ${colorClass}`}
            >
              <span className="font-mono mr-1">{item.occurrence_time}</span>
              {item.text.substring(0, 15)}...
            </button>
          );
        })}
        {dayItems.length > 3 && (
          <span className="text-xs text-zinc-500 px-1">+{dayItems.length - 3} more</span>
        )}
      </div>
    </div>
  );
};

const RDSSchedulerPage = () => {
  const navigate = useNavigate();
  const { mainSiteSlug } = useParams();
  const { isAdmin } = useAuth();
  const [station, setStation] = useState('mfy');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [calendarItems, setCalendarItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [preselectedDate, setPreselectedDate] = useState(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  
  // Helper for context-aware navigation
  const navTo = (path) => mainSiteSlug ? `/${mainSiteSlug}${path}` : path;

  // Calculate calendar days - memoized to prevent infinite loops
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  
  // Memoize date strings for API calls
  const startDateStr = format(calendarStart, 'yyyy-MM-dd');
  const endDateStr = format(calendarEnd, 'yyyy-MM-dd');

  const fetchCalendarItems = useCallback(async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API}/rds-builder/scheduled-texts/${station}/calendar`, {
        params: { start_date: startDateStr, end_date: endDateStr }
      });
      setCalendarItems(response.data);
    } catch (error) {
      console.error('Error fetching calendar:', error);
      toast.error('Could not load calendar');
    } finally {
      setLoading(false);
    }
  }, [station, startDateStr, endDateStr]);

  useEffect(() => {
    fetchCalendarItems();
  }, [fetchCalendarItems]);

  const handlePrevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const handleNextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const handleToday = () => setCurrentMonth(new Date());

  const handleAddClick = (date) => {
    setPreselectedDate(date);
    setEditingItem(null);
    setDialogOpen(true);
  };

  const handleItemClick = (item) => {
    setEditingItem(item);
    setPreselectedDate(null);
    setDialogOpen(true);
  };

  const handleSave = async (data) => {
    // Use the station from the data (which includes "both" option)
    const targetStation = data.station || station;
    // API uses the viewing station, but the data contains the actual target station
    if (editingItem) {
      await axios.put(`${API}/rds-builder/scheduled-texts/${station}/${editingItem.id}`, data);
      toast.success('Scheduled text updated');
    } else {
      // For creating, use mfy as the API route but include station in data
      await axios.post(`${API}/rds-builder/scheduled-texts/mfy`, data);
      toast.success('Scheduled text created');
    }
    fetchCalendarItems();
  };

  const handleDeleteClick = () => {
    if (!editingItem) return;
    setShowDeleteDialog(true);
  };

  const handleDeleteConfirm = async () => {
    if (!editingItem) return;
    try {
      // Use the station from the editing item for deletion
      const itemStation = editingItem.station === 'both' ? 'mfy' : editingItem.station;
      await axios.delete(`${API}/rds-builder/scheduled-texts/${itemStation}/${editingItem.id}`);
      toast.success('Scheduled text deleted');
      setShowDeleteDialog(false);
      setDialogOpen(false);
      fetchCalendarItems();
    } catch (error) {
      toast.error('Could not delete item');
    }
  };

  if (!isAdmin) {
    return (
      <div className="text-center py-12 text-zinc-500">
        You do not have access to this page.
      </div>
    );
  }

  return (
    <div data-testid="rds-scheduler-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(navTo('/rds-builder'))}
            className="text-zinc-400 hover:text-white"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-white mb-1">RDS Scheduler</h1>
            <p className="text-sm sm:text-base text-zinc-400">Schedule custom texts for specific times</p>
          </div>
        </div>
        <Button onClick={() => handleAddClick(new Date())} className="bg-orange-500 hover:bg-orange-600 text-white gap-2 h-10 sm:h-11 px-4 sm:px-5 btn-primary w-full sm:w-auto">
          <Plus className="w-5 h-5" />
          New Text
        </Button>
      </div>

      {/* Station Selector & Month Navigation */}
      <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-4 sm:p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 sm:mb-6">
          <div className="flex items-center gap-2 sm:gap-4">
            <h2 className="text-lg sm:text-xl font-bold text-white">
              {format(currentMonth, 'MMMM yyyy', { locale: enUS })}
            </h2>
            <Button
              variant="outline"
              size="sm"
              onClick={handleToday}
              className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white"
            >
              Today
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={handlePrevMonth}
              className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={handleNextMonth}
              className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Station Tabs */}
        <div className="flex items-center gap-2 mb-4">
          <Button
            variant={station === 'mfy' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStation('mfy')}
            className={station === 'mfy' ? 'bg-orange-500 hover:bg-orange-600 text-white' : 'border-zinc-700 text-zinc-400 hover:text-white'}
          >
            <Radio className="w-4 h-4 mr-2" />
            Radio MFY
          </Button>
          <Button
            variant={station === 'grk' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStation('grk')}
            className={station === 'grk' ? 'bg-violet-500 hover:bg-violet-600 text-white' : 'border-zinc-700 text-zinc-400 hover:text-white'}
          >
            <Radio className="w-4 h-4 mr-2" />
            Radio GRK
          </Button>
        </div>

        {/* Weekday Headers */}
        <div className="grid grid-cols-7 mb-2">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
            <div key={day} className="text-center text-xs font-medium text-zinc-500 uppercase tracking-wider py-2">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Grid */}
        {loading ? (
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 35 }).map((_, i) => (
              <div key={i} className="aspect-square bg-zinc-800/50 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day, idx) => (
              <CalendarDay
                key={idx}
                date={day}
                items={calendarItems}
                isCurrentMonth={day >= monthStart && day <= monthEnd}
                onItemClick={handleItemClick}
                onAddClick={handleAddClick}
              />
            ))}
          </div>
        )}

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 sm:gap-6 mt-4 sm:mt-6 pt-4 border-t border-zinc-800">
          <span className="text-xs text-zinc-500">Status:</span>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-orange-500" />
            <span className="text-xs text-zinc-400">Radio MFY</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-violet-500" />
            <span className="text-xs text-zinc-400">Radio GRK</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-xs text-zinc-400">Both</span>
          </div>
        </div>
      </div>

      {/* Dialog */}
      <ScheduledTextDialog
        isOpen={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setEditingItem(null);
          setPreselectedDate(null);
        }}
        onSave={handleSave}
        item={editingItem || (preselectedDate ? { start_datetime: preselectedDate.toISOString() } : null)}
        currentStation={station}
      />

      {/* Delete button in dialog footer when editing */}
      {dialogOpen && editingItem && (
        <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-50">
          <Button
            variant="outline"
            onClick={handleDeleteClick}
            className="border-red-500/50 text-red-400 hover:bg-red-500/10"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete
          </Button>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="bg-zinc-900 border-zinc-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Scheduled Text</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              Are you sure you want to delete this scheduled text? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteConfirm}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default RDSSchedulerPage;
