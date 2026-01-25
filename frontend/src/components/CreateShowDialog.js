import { useState, useEffect } from 'react';
import axios from 'axios';
import { format, addWeeks } from 'date-fns';
import { CalendarIcon, Repeat, Plus, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Calendar } from './ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const recurrenceOptions = [
  { value: 'none', label: 'Does not repeat', interval: 0 },
  { value: 'weekly-1', label: 'Every week', interval: 1 },
  { value: 'weekly-2', label: 'Every 2 weeks', interval: 2 },
  { value: 'weekly-3', label: 'Every 3 weeks', interval: 3 },
  { value: 'weekly-4', label: 'Every 4 weeks', interval: 4 },
];

const CreateShowDialog = ({ open, onOpenChange, onShowCreated, defaultDate }) => {
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(false);
  const [date, setDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [showTitles, setShowTitles] = useState([]);
  const [studios, setStudios] = useState([]);
  const [loadingTitles, setLoadingTitles] = useState(false);
  const [isAddingNewTitle, setIsAddingNewTitle] = useState(false);
  const [newTitleName, setNewTitleName] = useState('');
  const [creatingTitle, setCreatingTitle] = useState(false);
  
  const [formData, setFormData] = useState({
    title: '',
    titleId: '',
    description: '',
    start_time: '09:00',
    end_time: '10:00',
    status: 'draft',
    recurrence: 'none',
    studio_id: '',
  });

  // Fetch show titles and studios when dialog opens
  useEffect(() => {
    if (open) {
      fetchShowTitles();
      fetchStudios();
    }
  }, [open]);

  const fetchShowTitles = async () => {
    setLoadingTitles(true);
    try {
      const response = await axios.get(`${API}/shows/titles`);
      setShowTitles(response.data);
    } catch (error) {
      console.error('Failed to fetch show titles:', error);
    } finally {
      setLoadingTitles(false);
    }
  };

  const fetchStudios = async () => {
    try {
      const response = await axios.get(`${API}/shows/studios`);
      setStudios(response.data);
    } catch (error) {
      console.error('Failed to fetch studios:', error);
    }
  };

  // Set default date when dialog opens
  useEffect(() => {
    if (open && defaultDate) {
      setDate(defaultDate);
    }
  }, [open, defaultDate]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setFormData({
        title: '',
        titleId: '',
        description: '',
        start_time: '09:00',
        end_time: '10:00',
        status: 'draft',
        recurrence: 'none',
      });
      setDate(null);
      setEndDate(null);
      setIsAddingNewTitle(false);
      setNewTitleName('');
    }
  }, [open]);

  const handleTitleSelect = (titleId) => {
    if (titleId === 'add-new') {
      setIsAddingNewTitle(true);
      setFormData({ ...formData, titleId: '', title: '' });
      return;
    }
    
    const selectedTitle = showTitles.find(t => t.id === titleId);
    if (selectedTitle) {
      setFormData({
        ...formData,
        titleId: titleId,
        title: selectedTitle.name,
        description: selectedTitle.description || formData.description,
        start_time: selectedTitle.default_start_time || formData.start_time,
        end_time: selectedTitle.default_end_time || formData.end_time,
      });
      setIsAddingNewTitle(false);
    }
  };

  const handleCreateNewTitle = async () => {
    if (!newTitleName.trim()) {
      toast.error('Please enter a title name');
      return;
    }
    
    setCreatingTitle(true);
    try {
      const response = await axios.post(`${API}/shows/titles`, {
        name: newTitleName.trim(),
        description: formData.description,
        default_start_time: formData.start_time,
        default_end_time: formData.end_time,
      });
      
      // Add to list and select it
      setShowTitles([...showTitles, response.data]);
      setFormData({
        ...formData,
        titleId: response.data.id,
        title: response.data.name,
      });
      setIsAddingNewTitle(false);
      setNewTitleName('');
      toast.success('Show title created');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create show title');
    } finally {
      setCreatingTitle(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.title && !formData.titleId) {
      toast.error('Please select or enter a show title');
      return;
    }
    
    if (!date) {
      toast.error('Please select a date');
      return;
    }

    setLoading(true);
    try {
      const recurrenceOption = recurrenceOptions.find(r => r.value === formData.recurrence);
      const isRecurring = formData.recurrence !== 'none';
      
      const payload = {
        title: formData.title,
        description: formData.description,
        date: format(date, 'yyyy-MM-dd'),
        start_time: formData.start_time,
        end_time: formData.end_time,
        status: formData.status,
        recurrence_type: isRecurring ? 'weekly' : 'none',
        recurrence_interval: recurrenceOption?.interval || 1,
        recurrence_end_date: isRecurring && endDate ? format(endDate, 'yyyy-MM-dd') : null,
      };

      const response = await axios.post(`${API}/shows`, payload);
      
      if (isRecurring) {
        toast.success(`Created recurring show (${recurrenceOption.label})`);
      } else {
        toast.success('Show created');
      }
      
      onShowCreated(response.data);
    } catch (error) {
      toast.error('Failed to create show');
    } finally {
      setLoading(false);
    }
  };

  const isRecurring = formData.recurrence !== 'none';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#18181b] border-zinc-800 text-white sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Create New Show</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 mt-4">
          {/* Show Title Selection */}
          <div className="space-y-2">
            <Label className="text-zinc-300">Show Title</Label>
            
            {loadingTitles ? (
              <div className="flex items-center gap-2 text-zinc-500 py-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading titles...
              </div>
            ) : showTitles.length === 0 && !isAdmin ? (
              <div className="p-3 bg-zinc-800/50 rounded-lg text-zinc-400 text-sm">
                No show titles available. Please ask an admin to create show titles.
              </div>
            ) : isAddingNewTitle && isAdmin ? (
              // Admin adding new title
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    value={newTitleName}
                    onChange={(e) => setNewTitleName(e.target.value)}
                    placeholder="Enter new show title..."
                    className="bg-[#27272a] border-zinc-700 text-white placeholder:text-zinc-500 flex-1"
                    autoFocus
                  />
                  <Button
                    type="button"
                    onClick={handleCreateNewTitle}
                    disabled={creatingTitle}
                    className="bg-rose-500 hover:bg-rose-600 text-white"
                  >
                    {creatingTitle ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add'}
                  </Button>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsAddingNewTitle(false)}
                  className="text-zinc-400 hover:text-white"
                >
                  Cancel
                </Button>
              </div>
            ) : (
              // Dropdown selection
              <Select
                value={formData.titleId}
                onValueChange={handleTitleSelect}
              >
                <SelectTrigger 
                  data-testid="show-title-select"
                  className="bg-[#27272a] border-zinc-700 text-white"
                >
                  <SelectValue placeholder="Select a show title..." />
                </SelectTrigger>
                <SelectContent className="bg-[#18181b] border-zinc-800">
                  {showTitles.map((title) => (
                    <SelectItem 
                      key={title.id} 
                      value={title.id}
                      className="text-zinc-300 focus:text-white focus:bg-zinc-800"
                    >
                      {title.name}
                    </SelectItem>
                  ))}
                  {isAdmin && (
                    <>
                      <div className="border-t border-zinc-800 my-1" />
                      <SelectItem 
                        value="add-new"
                        className="text-rose-400 focus:text-rose-300 focus:bg-rose-500/10"
                      >
                        <span className="flex items-center gap-2">
                          <Plus className="w-4 h-4" />
                          Add new show title...
                        </span>
                      </SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-zinc-300">Description (optional)</Label>
            <Textarea
              data-testid="show-description-input"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Brief description of the show..."
              className="bg-[#27272a] border-zinc-700 text-white placeholder:text-zinc-500 resize-none"
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-zinc-300">Start Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  data-testid="show-date-picker"
                  className={cn(
                    'w-full justify-start text-left font-normal bg-[#27272a] border-zinc-700 hover:bg-zinc-700',
                    !date && 'text-zinc-500'
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, 'PPP') : 'Pick a date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 bg-[#18181b] border-zinc-800" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={setDate}
                  initialFocus
                  className="bg-[#18181b]"
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-zinc-300">Start Time</Label>
              <Input
                type="time"
                data-testid="show-start-time-input"
                value={formData.start_time}
                onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                required
                className="bg-[#27272a] border-zinc-700 text-white font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-300">End Time</Label>
              <Input
                type="time"
                data-testid="show-end-time-input"
                value={formData.end_time}
                onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                required
                className="bg-[#27272a] border-zinc-700 text-white font-mono"
              />
            </div>
          </div>

          {/* Recurrence Section */}
          <div className="space-y-2">
            <Label className="text-zinc-300 flex items-center gap-2">
              <Repeat className="w-4 h-4" />
              Repeat
            </Label>
            <Select
              value={formData.recurrence}
              onValueChange={(value) => setFormData({ ...formData, recurrence: value })}
            >
              <SelectTrigger 
                data-testid="show-recurrence-select"
                className="bg-[#27272a] border-zinc-700 text-white"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#18181b] border-zinc-800">
                {recurrenceOptions.map((option) => (
                  <SelectItem 
                    key={option.value} 
                    value={option.value}
                    className="text-zinc-300 focus:text-white focus:bg-zinc-800"
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* End Date for recurring shows */}
          {isRecurring && (
            <div className="space-y-2 p-3 bg-violet-500/10 rounded-lg border border-violet-500/20">
              <Label className="text-zinc-300">End Date (optional)</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    data-testid="show-end-date-picker"
                    className={cn(
                      'w-full justify-start text-left font-normal bg-[#27272a] border-zinc-700 hover:bg-zinc-700',
                      !endDate && 'text-zinc-500'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, 'PPP') : 'No end date (1 year)'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-[#18181b] border-zinc-800" align="start">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={setEndDate}
                    disabled={(d) => date && d < date}
                    initialFocus
                    className="bg-[#18181b]"
                  />
                </PopoverContent>
              </Popover>
              <p className="text-xs text-zinc-500">
                {endDate 
                  ? `Show will repeat until ${format(endDate, 'PPP')}`
                  : 'Show will repeat for 1 year if no end date is set'
                }
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-zinc-300">Status</Label>
            <Select
              value={formData.status}
              onValueChange={(value) => setFormData({ ...formData, status: value })}
            >
              <SelectTrigger 
                data-testid="show-status-select"
                className="bg-[#27272a] border-zinc-700 text-white"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#18181b] border-zinc-800">
                <SelectItem value="draft" className="text-zinc-300 focus:text-white focus:bg-zinc-800">Draft</SelectItem>
                <SelectItem value="scheduled" className="text-zinc-300 focus:text-white focus:bg-zinc-800">Scheduled</SelectItem>
                <SelectItem value="completed" className="text-zinc-300 focus:text-white focus:bg-zinc-800">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1 bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              data-testid="submit-show-btn"
              disabled={loading || (!formData.title && !formData.titleId)}
              className="flex-1 bg-rose-500 hover:bg-rose-600 text-white btn-primary"
            >
              {loading ? 'Creating...' : isRecurring ? 'Create Recurring Show' : 'Create Show'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CreateShowDialog;
