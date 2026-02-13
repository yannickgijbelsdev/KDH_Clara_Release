import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek } from 'date-fns';
import { nl } from 'date-fns/locale';
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
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const RECURRENCE_OPTIONS = [
  { value: 'none', label: 'Eenmalig' },
  { value: 'hourly', label: 'Elk uur' },
  { value: 'daily', label: 'Elke dag' },
  { value: 'weekly', label: 'Elke week' },
  { value: 'monthly', label: 'Elke maand' },
];

const DURATION_OPTIONS = [
  { value: 'fixed', label: 'Vaste duur' },
  { value: 'until_next', label: 'Tot volgende item' },
];

const STATION_OPTIONS = [
  { value: 'mfy', label: 'Radio MFY' },
  { value: 'grk', label: 'Radio GRK' },
  { value: 'both', label: 'Beide stations' },
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
      toast.error('Voer een tekst in');
      return;
    }
    if (!startDate || !startTime) {
      toast.error('Selecteer een datum en tijd');
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
      toast.error(error.response?.data?.detail || 'Kon item niet opslaan');
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
            {item ? 'Geplande tekst bewerken' : 'Nieuwe geplande tekst'}
          </h3>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Text */}
          <div>
            <Label className="text-zinc-400 text-sm">Custom tekst</Label>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Voer de RDS tekst in..."
              className="bg-zinc-800 border-zinc-700 text-white mt-1 resize-none"
              rows={3}
            />
          </div>

          {/* Station Selection */}
          <div>
            <Label className="text-zinc-400 text-sm">Zichtbaar op</Label>
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
              <Label className="text-zinc-400 text-sm">Datum</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-zinc-800 border-zinc-700 text-white mt-1"
              />
            </div>
            <div>
              <Label className="text-zinc-400 text-sm">Tijd</Label>
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
              <Label className="text-zinc-400 text-sm">Duur type</Label>
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
                <Label className="text-zinc-400 text-sm">Duur (minuten)</Label>
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
              <Label className="text-zinc-400 text-sm">Herhaling</Label>
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
                <Label className="text-zinc-400 text-sm">Einddatum (optioneel)</Label>
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
            <Label className="text-zinc-400 text-sm">Actief</Label>
          </div>

          {/* Info */}
          <div className="bg-zinc-900 rounded-lg p-3 text-xs text-zinc-500">
            <p><strong>Let op:</strong> Shows hebben altijd voorrang boven geplande custom teksten. De custom tekst wordt alleen getoond als er geen actieve show is.</p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t border-zinc-800">
          <Button variant="outline" onClick={onClose} className="border-zinc-700 text-zinc-300">
            Annuleren
          </Button>
          <Button onClick={handleSave} disabled={saving} className="bg-orange-500 hover:bg-orange-600 text-white">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Opslaan
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
      className={`min-h-[100px] border-r border-b border-zinc-800 p-1 ${
        isCurrentMonth ? 'bg-zinc-900/50' : 'bg-zinc-900/20'
      } ${isToday ? 'ring-2 ring-orange-500/50 ring-inset' : ''}`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className={`text-xs font-medium ${isToday ? 'text-orange-400' : isCurrentMonth ? 'text-zinc-400' : 'text-zinc-600'}`}>
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
        {dayItems.slice(0, 3).map((item, idx) => (
          <button
            key={`${item.id}-${idx}`}
            onClick={() => onItemClick(item)}
            className={`w-full text-left px-1.5 py-0.5 rounded text-xs truncate ${
              item.enabled
                ? item.station === 'mfy' ? 'bg-orange-500/20 text-orange-300' : 'bg-violet-500/20 text-violet-300'
                : 'bg-zinc-800 text-zinc-500'
            }`}
          >
            <span className="font-mono mr-1">{item.occurrence_time}</span>
            {item.text.substring(0, 15)}...
          </button>
        ))}
        {dayItems.length > 3 && (
          <span className="text-xs text-zinc-500 px-1">+{dayItems.length - 3} meer</span>
        )}
      </div>
    </div>
  );
};

const RDSSchedulerPage = () => {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [station, setStation] = useState('mfy');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [calendarItems, setCalendarItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [preselectedDate, setPreselectedDate] = useState(null);

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
      toast.error('Kon agenda niet laden');
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
      toast.success('Geplande tekst bijgewerkt');
    } else {
      // For creating, use mfy as the API route but include station in data
      await axios.post(`${API}/rds-builder/scheduled-texts/mfy`, data);
      toast.success('Geplande tekst aangemaakt');
    }
    fetchCalendarItems();
  };

  const handleDelete = async () => {
    if (!editingItem) return;
    if (!window.confirm('Weet je zeker dat je deze geplande tekst wilt verwijderen?')) return;

    try {
      // Use the station from the editing item for deletion
      const itemStation = editingItem.station === 'both' ? 'mfy' : editingItem.station;
      await axios.delete(`${API}/rds-builder/scheduled-texts/${itemStation}/${editingItem.id}`);
      toast.success('Geplande tekst verwijderd');
      setDialogOpen(false);
      fetchCalendarItems();
    } catch (error) {
      toast.error('Kon item niet verwijderen');
    }
  };

  if (!isAdmin) {
    return (
      <div className="text-center py-12 text-zinc-500">
        Je hebt geen toegang tot deze pagina.
      </div>
    );
  }

  return (
    <div data-testid="rds-scheduler-page">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/rds-builder')}
          className="text-zinc-400 hover:text-white"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">RDS Custom Text Scheduler</h1>
          <p className="text-sm text-zinc-500">Plan custom teksten voor specifieke tijdstippen</p>
        </div>
        <Button onClick={() => handleAddClick(new Date())} className="bg-orange-500 hover:bg-orange-600 text-white">
          <Plus className="w-4 h-4 mr-2" />
          Nieuwe tekst
        </Button>
      </div>

      {/* Station Selector & Month Navigation */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Button
            variant={station === 'mfy' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStation('mfy')}
            className={station === 'mfy' ? 'bg-orange-500 hover:bg-orange-600 text-white' : 'border-zinc-700 text-zinc-400'}
          >
            <Radio className="w-4 h-4 mr-2" />
            Radio MFY
          </Button>
          <Button
            variant={station === 'grk' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStation('grk')}
            className={station === 'grk' ? 'bg-violet-500 hover:bg-violet-600 text-white' : 'border-zinc-700 text-zinc-400'}
          >
            <Radio className="w-4 h-4 mr-2" />
            Radio GRK
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handlePrevMonth} className="border-zinc-700 text-zinc-400">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={handleToday} className="border-zinc-700 text-zinc-400">
            Vandaag
          </Button>
          <span className="text-white font-semibold w-40 text-center">
            {format(currentMonth, 'MMMM yyyy', { locale: nl })}
          </span>
          <Button variant="outline" size="sm" onClick={handleNextMonth} className="border-zinc-700 text-zinc-400">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Calendar */}
      <div className="bg-[#18181b] border border-zinc-800 rounded-xl overflow-hidden">
        {/* Weekday Headers */}
        <div className="grid grid-cols-7 border-b border-zinc-800">
          {['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'].map(day => (
            <div key={day} className="py-2 text-center text-xs font-medium text-zinc-500 border-r border-zinc-800 last:border-r-0">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
          </div>
        ) : (
          <div className="grid grid-cols-7">
            {calendarDays.map((day, idx) => (
              <div key={idx} className="group">
                <CalendarDay
                  date={day}
                  items={calendarItems}
                  isCurrentMonth={day >= monthStart && day <= monthEnd}
                  onItemClick={handleItemClick}
                  onAddClick={handleAddClick}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6 mt-4 text-xs text-zinc-500">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-orange-500/20" />
          <span>Radio MFY</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-violet-500/20" />
          <span>Radio GRK</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-green-500/20" />
          <span>Beide stations</span>
        </div>
        <div className="flex items-center gap-2">
          <Repeat className="w-3 h-3" />
          <span>Herhalend</span>
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
            onClick={handleDelete}
            className="border-red-500/50 text-red-400 hover:bg-red-500/10"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Verwijderen
          </Button>
        </div>
      )}
    </div>
  );
};

export default RDSSchedulerPage;
