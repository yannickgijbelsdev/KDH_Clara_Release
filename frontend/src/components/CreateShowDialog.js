/* eslint-disable */
import { useState, useEffect } from 'react';
import axios from 'axios';
import { format } from 'date-fns';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CalendarIcon, Repeat, Plus, Loader2, Users, User, Check,
  ChevronLeft, ChevronRight, X, Zap
} from 'lucide-react';
import { Dialog, DialogContent } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from './ui/select';
import { Calendar } from './ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { getAvatarUrl } from '../utils/avatar';
import WizardStepIndicator from './workspace/WizardStepIndicator';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const recurrenceOptions = [
  { value: 'none', label: 'Does not repeat', interval: 0 },
  { value: 'weekly-1', label: 'Every week', interval: 1 },
  { value: 'weekly-2', label: 'Every 2 weeks', interval: 2 },
  { value: 'weekly-3', label: 'Every 3 weeks', interval: 3 },
  { value: 'weekly-4', label: 'Every 4 weeks', interval: 4 },
];

const SHOW_STEPS = ['Show Info', 'Schedule', 'Team & Status'];

const CreateShowDialog = ({ open, onOpenChange, onShowCreated, defaultDate }) => {
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [date, setDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [showTitles, setShowTitles] = useState([]);
  const [studios, setStudios] = useState([]);
  const [teamUsers, setTeamUsers] = useState([]);
  const [loadingTitles, setLoadingTitles] = useState(false);
  const [isAddingNewTitle, setIsAddingNewTitle] = useState(false);
  const [newTitleName, setNewTitleName] = useState('');
  const [creatingTitle, setCreatingTitle] = useState(false);
  const [presenterPopoverOpen, setPresenterPopoverOpen] = useState(false);

  const [formData, setFormData] = useState({
    title: '',
    titleId: '',
    description: '',
    start_time: '09:00',
    end_time: '10:00',
    status: 'draft',
    recurrence: 'none',
    studio_id: '',
    presenter_ids: [],
  });

  useEffect(() => {
    if (open) {
      fetchShowTitles();
      fetchStudios();
      fetchTeamUsers();
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

  const fetchTeamUsers = async () => {
    try {
      const response = await axios.get(`${API}/users`);
      setTeamUsers(response.data);
    } catch (error) {
      console.error('Failed to fetch team users:', error);
    }
  };

  useEffect(() => {
    if (open && defaultDate) {
      setDate(defaultDate);
    }
    if (open) {
      setWizardStep(0);
    }
  }, [open, defaultDate]);

  useEffect(() => {
    if (!open) {
      setFormData({
        title: '', titleId: '', description: '', start_time: '09:00',
        end_time: '10:00', status: 'draft', recurrence: 'none',
        studio_id: '', presenter_ids: [],
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
      setFormData({ ...formData, titleId: '', title: '', presenter_ids: [] });
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
        presenter_ids: selectedTitle.default_presenter_ids || [],
      });
      setIsAddingNewTitle(false);
    }
  };

  const togglePresenter = (userId) => {
    setFormData(prev => {
      const current = prev.presenter_ids || [];
      if (current.includes(userId)) {
        return { ...prev, presenter_ids: current.filter(id => id !== userId) };
      } else {
        return { ...prev, presenter_ids: [...current, userId] };
      }
    });
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
      setShowTitles([...showTitles, response.data]);
      setFormData({ ...formData, titleId: response.data.id, title: response.data.name });
      setIsAddingNewTitle(false);
      setNewTitleName('');
      toast.success('Show title created');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to create show title');
    } finally {
      setCreatingTitle(false);
    }
  };

  const handleSubmit = async () => {
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
        studio_id: formData.studio_id || null,
        presenter_ids: formData.presenter_ids || [],
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

  const canNext = () => {
    if (wizardStep === 0) return !!(formData.title || formData.titleId);
    if (wizardStep === 1) return !!date;
    return true;
  };

  const handleNext = () => {
    if (wizardStep === 2) {
      handleSubmit();
    } else {
      setWizardStep(s => s + 1);
    }
  };

  const handleClose = () => {
    setWizardStep(0);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent hideClose className="bg-white border-zinc-200 max-w-2xl max-h-[92vh] overflow-hidden p-0 rounded-[24px] flex flex-col shadow-[0_8px_40px_rgba(0,0,0,0.1)]" data-testid="create-show-wizard">
        {/* Header with step indicator */}
        <div className="flex items-center justify-between px-8 pt-6 pb-0 flex-shrink-0">
          <WizardStepIndicator currentStep={wizardStep} steps={SHOW_STEPS} />
          <button onClick={handleClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-zinc-100 transition-colors">
            <X className="w-4 h-4 text-zinc-400" />
          </button>
        </div>

        {/* Content */}
        <div className="px-8 pt-4 pb-2 overflow-y-auto flex-1 min-h-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={wizardStep}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
            >
              {/* Step 0: Show Info */}
              {wizardStep === 0 && (
                <div>
                  <h2 className="text-2xl font-bold text-zinc-900 mb-1">Show information</h2>
                  <p className="text-sm text-zinc-500 mb-6">Select or create a show title and add details.</p>

                  <div className="space-y-5">
                    {/* Show Title Selection */}
                    <div className="space-y-2">
                      <Label className="text-zinc-700 font-medium">Show Title</Label>
                      {loadingTitles ? (
                        <div className="flex items-center gap-2 text-zinc-500 py-2">
                          <Loader2 className="w-4 h-4 animate-spin" /> Loading titles...
                        </div>
                      ) : showTitles.length === 0 && !isAdmin ? (
                        <div className="p-3 bg-zinc-50 rounded-lg text-zinc-500 text-sm">
                          No show titles available. Please ask an admin to create show titles.
                        </div>
                      ) : isAddingNewTitle && isAdmin ? (
                        <div className="space-y-2">
                          <div className="flex gap-2">
                            <Input
                              value={newTitleName}
                              onChange={(e) => setNewTitleName(e.target.value)}
                              placeholder="Enter new show title..."
                              className="bg-zinc-50 border-zinc-200 text-zinc-900 placeholder:text-zinc-400 flex-1 rounded-xl"
                              autoFocus
                            />
                            <Button type="button" onClick={handleCreateNewTitle} disabled={creatingTitle}
                              className="bg-zinc-900 hover:bg-zinc-900 text-white rounded-xl">
                              {creatingTitle ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add'}
                            </Button>
                          </div>
                          <Button type="button" variant="ghost" size="sm" onClick={() => setIsAddingNewTitle(false)}
                            className="text-zinc-400 hover:text-zinc-900">Cancel</Button>
                        </div>
                      ) : (
                        <Select value={formData.titleId} onValueChange={handleTitleSelect}>
                          <SelectTrigger data-testid="show-title-select" className="bg-zinc-50 border-zinc-200 text-zinc-900 h-12 rounded-xl">
                            <SelectValue placeholder="Select a show title..." />
                          </SelectTrigger>
                          <SelectContent className="bg-white border-zinc-200">
                            {showTitles.map((title) => (
                              <SelectItem key={title.id} value={title.id} className="text-zinc-700 focus:text-zinc-900 focus:bg-zinc-50">
                                {title.name}
                              </SelectItem>
                            ))}
                            {isAdmin && (
                              <>
                                <div className="border-t border-zinc-200 my-1" />
                                <SelectItem value="add-new" className="text-orange-500 focus:text-orange-600 focus:bg-orange-50">
                                  <span className="flex items-center gap-2"><Plus className="w-4 h-4" /> Add new show title...</span>
                                </SelectItem>
                              </>
                            )}
                          </SelectContent>
                        </Select>
                      )}
                    </div>

                    {/* Description */}
                    <div className="space-y-2">
                      <Label className="text-zinc-700 font-medium">Description (optional)</Label>
                      <Textarea
                        data-testid="show-description-input"
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        placeholder="Brief description of the show..."
                        className="bg-zinc-50 border-zinc-200 text-zinc-900 placeholder:text-zinc-400 resize-none rounded-xl"
                        rows={2}
                      />
                    </div>

                    {/* Studio */}
                    {studios.length > 0 && (
                      <div className="space-y-2">
                        <Label className="text-zinc-700 font-medium">Studio / Room (optional)</Label>
                        <Select value={formData.studio_id} onValueChange={(v) => setFormData({ ...formData, studio_id: v })}>
                          <SelectTrigger data-testid="show-studio-select" className="bg-zinc-50 border-zinc-200 text-zinc-900 h-12 rounded-xl">
                            <SelectValue placeholder="Select a studio..." />
                          </SelectTrigger>
                          <SelectContent className="bg-white border-zinc-200">
                            {studios.map((studio) => (
                              <SelectItem key={studio.id} value={studio.id} className="text-zinc-700 focus:text-zinc-900 focus:bg-zinc-50">
                                {studio.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Step 1: Schedule */}
              {wizardStep === 1 && (
                <div>
                  <h2 className="text-2xl font-bold text-zinc-900 mb-1">Schedule</h2>
                  <p className="text-sm text-zinc-500 mb-6">Set the date, time, and recurrence for this show.</p>

                  <div className="space-y-5">
                    <div className="space-y-2">
                      <Label className="text-zinc-700 font-medium">Start Date</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" data-testid="show-date-picker"
                            className={cn('w-full justify-start text-left font-normal h-12 bg-zinc-50 border-zinc-200 hover:bg-zinc-100 rounded-xl', !date && 'text-zinc-500')}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {date ? format(date, 'PPP') : 'Pick a date'}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 bg-white border-zinc-200" align="start">
                          <Calendar mode="single" selected={date} onSelect={setDate} initialFocus className="bg-white" />
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-zinc-700 font-medium">Start Time</Label>
                        <Input type="time" data-testid="show-start-time-input" value={formData.start_time}
                          onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                          className="bg-zinc-50 border-zinc-200 text-zinc-900 font-mono h-12 rounded-xl" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-zinc-700 font-medium">End Time</Label>
                        <Input type="time" data-testid="show-end-time-input" value={formData.end_time}
                          onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                          className="bg-zinc-50 border-zinc-200 text-zinc-900 font-mono h-12 rounded-xl" />
                      </div>
                    </div>

                    {/* Recurrence */}
                    <div className="space-y-2">
                      <Label className="text-zinc-700 font-medium flex items-center gap-2">
                        <Repeat className="w-4 h-4" /> Repeat
                      </Label>
                      <Select value={formData.recurrence} onValueChange={(v) => setFormData({ ...formData, recurrence: v })}>
                        <SelectTrigger data-testid="show-recurrence-select" className="bg-zinc-50 border-zinc-200 text-zinc-900 h-12 rounded-xl">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-white border-zinc-200">
                          {recurrenceOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value} className="text-zinc-700 focus:text-zinc-900 focus:bg-zinc-50">
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* End Date for recurring */}
                    {isRecurring && (
                      <div className="space-y-2 p-4 bg-zinc-50 rounded-xl border border-zinc-200">
                        <Label className="text-zinc-700 font-medium">End Date (optional)</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" data-testid="show-end-date-picker"
                              className={cn('w-full justify-start text-left font-normal h-12 bg-white border-zinc-200 hover:bg-zinc-50 rounded-xl', !endDate && 'text-zinc-500')}>
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {endDate ? format(endDate, 'PPP') : 'No end date (1 year)'}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0 bg-white border-zinc-200" align="start">
                            <Calendar mode="single" selected={endDate} onSelect={setEndDate}
                              disabled={(d) => date && d < date} initialFocus className="bg-white" />
                          </PopoverContent>
                        </Popover>
                        <p className="text-xs text-zinc-500">
                          {endDate ? `Show will repeat until ${format(endDate, 'PPP')}` : 'Show will repeat for 1 year if no end date is set'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Step 2: Team & Status */}
              {wizardStep === 2 && (
                <div>
                  <h2 className="text-2xl font-bold text-zinc-900 mb-1">Team & Status</h2>
                  <p className="text-sm text-zinc-500 mb-6">Assign presenters and set the show status.</p>

                  <div className="space-y-5">
                    {/* Presenters */}
                    <div className="space-y-2">
                      <Label className="text-zinc-700 font-medium flex items-center gap-2">
                        <Users className="w-4 h-4" /> Presenters
                      </Label>
                      <Popover open={presenterPopoverOpen} onOpenChange={setPresenterPopoverOpen}>
                        <PopoverTrigger asChild>
                          <Button type="button" variant="outline" data-testid="show-presenters-select"
                            className="w-full justify-start text-left h-12 bg-zinc-50 border-zinc-200 text-zinc-900 hover:bg-zinc-100 rounded-xl">
                            <Users className="w-4 h-4 mr-2 text-zinc-400" />
                            {formData.presenter_ids?.length > 0 ? (
                              <span className="truncate">
                                {formData.presenter_ids.map(id => teamUsers.find(u => u.id === id)?.name || 'Unknown').join(', ')}
                              </span>
                            ) : (
                              <span className="text-zinc-500">Select presenters...</span>
                            )}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-72 p-0 bg-white border-zinc-200" align="start">
                          <div className="p-2 border-b border-zinc-100">
                            <p className="text-sm text-zinc-500 font-medium">Team Members</p>
                          </div>
                          <div className="max-h-60 overflow-y-auto p-2 space-y-1">
                            {teamUsers.map((user) => (
                              <button key={user.id} type="button" onClick={() => togglePresenter(user.id)}
                                className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors ${
                                  formData.presenter_ids?.includes(user.id)
                                    ? 'bg-zinc-100 text-zinc-900'
                                    : 'hover:bg-zinc-50 text-zinc-600'
                                }`}>
                                <div className="w-8 h-8 rounded-full bg-zinc-200 flex items-center justify-center overflow-hidden">
                                  {getAvatarUrl(user) ? (
                                    <img src={getAvatarUrl(user)} alt={user.name} className="w-full h-full object-cover" />
                                  ) : (
                                    <User className="w-4 h-4 text-zinc-400" />
                                  )}
                                </div>
                                <div className="flex-1 text-left">
                                  <p className="text-sm font-medium">{user.name}</p>
                                  <p className="text-xs text-zinc-400">{user.role}</p>
                                </div>
                                {formData.presenter_ids?.includes(user.id) && (
                                  <Check className="w-4 h-4 text-emerald-500" />
                                )}
                              </button>
                            ))}
                            {teamUsers.length === 0 && (
                              <p className="text-sm text-zinc-500 text-center py-4">No team members found</p>
                            )}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>

                    {/* Status */}
                    <div className="space-y-2">
                      <Label className="text-zinc-700 font-medium">Status</Label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { value: 'draft', label: 'Draft', color: 'zinc' },
                          { value: 'scheduled', label: 'Scheduled', color: 'blue' },
                          { value: 'completed', label: 'Completed', color: 'emerald' },
                        ].map(opt => (
                          <button key={opt.value} type="button" onClick={() => setFormData({ ...formData, status: opt.value })}
                            data-testid={`show-status-${opt.value}`}
                            className={`px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all ${
                              formData.status === opt.value
                                ? 'border-zinc-900 bg-zinc-50 text-zinc-900'
                                : 'border-zinc-200 text-zinc-500 hover:border-zinc-300'
                            }`}>
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-8 py-4 border-t border-zinc-100 flex-shrink-0">
          <Button variant="ghost" onClick={() => wizardStep === 0 ? handleClose() : setWizardStep(s => s - 1)}
            className="gap-2 text-zinc-500">
            <ChevronLeft className="w-4 h-4" />
            {wizardStep === 0 ? 'Cancel' : 'Back'}
          </Button>
          <Button onClick={handleNext} disabled={!canNext() || loading}
            data-testid="show-wizard-next-btn"
            className="gap-2 bg-zinc-900 hover:bg-zinc-900 text-white px-6 rounded-full">
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</>
            ) : wizardStep === 2 ? (
              <><Zap className="w-4 h-4" /> {isRecurring ? 'Create Recurring Show' : 'Create Show'}</>
            ) : (
              <>Continue <ChevronRight className="w-4 h-4" /></>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CreateShowDialog;
