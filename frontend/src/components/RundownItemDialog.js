import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import axios from 'axios';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Music, Mic, FileText, Radio, Clock, Wand2,
  ChevronLeft, ChevronRight, X, Zap, Loader2
} from 'lucide-react';
import { Dialog, DialogContent } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { toast } from 'sonner';
import WizardStepIndicator from './workspace/WizardStepIndicator';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const itemTypes = [
  { value: 'music', label: 'Music', icon: Music, desc: 'Song or jingle' },
  { value: 'talk', label: 'Talk', icon: Mic, desc: 'Spoken segment' },
  { value: 'item', label: 'Item', icon: FileText, desc: 'Generic rundown item' },
  { value: 'ad', label: 'Ad', icon: Radio, desc: 'Advertisement break' },
];

const WORDS_PER_MINUTE = 150;

const calculateSpeakingDuration = (text) => {
  if (!text || text.trim() === '') return null;
  const words = text.trim().split(/\s+/).filter(w => w.length > 0).length;
  const totalMinutes = words / WORDS_PER_MINUTE;
  const minutes = Math.floor(totalMinutes);
  const seconds = Math.round((totalMinutes - minutes) * 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const ITEM_STEPS = ['Item Info', 'Details'];

const RundownItemDialog = ({ open, onOpenChange, showId, editingItem, onSaved, sendWsMessage }) => {
  const [loading, setLoading] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [formData, setFormData] = useState({
    type: 'music',
    title: '',
    notes: '',
    duration: '',
  });
  const throttleRef = useRef(null);
  const editingStartedRef = useRef(false);

  useEffect(() => {
    if (editingItem) {
      setFormData({
        type: editingItem.type,
        title: editingItem.title,
        notes: editingItem.notes || '',
        duration: editingItem.duration || '',
      });
    } else {
      setFormData({ type: 'music', title: '', notes: '', duration: '' });
    }
    if (open) setWizardStep(0);
  }, [editingItem, open]);

  useEffect(() => {
    if (open && editingItem && sendWsMessage && !editingStartedRef.current) {
      editingStartedRef.current = true;
      sendWsMessage({ type: 'editing_start', item_id: editingItem.id });
    }
    if (!open && editingStartedRef.current) {
      if (editingItem && sendWsMessage) {
        sendWsMessage({ type: 'editing_end', item_id: editingItem.id });
      }
      editingStartedRef.current = false;
    }
  }, [open, editingItem, sendWsMessage]);

  const broadcastChange = useCallback((field, value) => {
    if (!editingItem || !sendWsMessage) return;
    if (throttleRef.current) clearTimeout(throttleRef.current);
    throttleRef.current = setTimeout(() => {
      sendWsMessage({ type: 'editing_update', item_id: editingItem.id, field, value });
    }, 150);
  }, [editingItem, sendWsMessage]);

  const handleFieldChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    broadcastChange(field, value);
  };

  const estimatedDuration = useMemo(() => {
    if (formData.type === 'music') return null;
    return calculateSpeakingDuration(formData.notes);
  }, [formData.notes, formData.type]);

  const wordCount = useMemo(() => {
    if (!formData.notes || formData.notes.trim() === '') return 0;
    return formData.notes.trim().split(/\s+/).filter(w => w.length > 0).length;
  }, [formData.notes]);

  const applyEstimatedDuration = () => {
    if (estimatedDuration) {
      handleFieldChange('duration', estimatedDuration);
      toast.success('Duration estimated from text');
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      let response;
      if (editingItem) {
        response = await axios.put(`${API}/shows/${showId}/rundown/${editingItem.id}`, formData);
      } else {
        response = await axios.post(`${API}/shows/${showId}/rundown`, formData);
      }
      if (editingItem && sendWsMessage) {
        sendWsMessage({ type: 'editing_end', item_id: editingItem.id });
        editingStartedRef.current = false;
      }
      onSaved(response.data);
      toast.success(editingItem ? 'Item updated' : 'Item added');
    } catch (error) {
      toast.error(editingItem ? 'Failed to update item' : 'Failed to add item');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = (isOpen) => {
    if (!isOpen && editingItem && sendWsMessage && editingStartedRef.current) {
      sendWsMessage({ type: 'editing_end', item_id: editingItem.id });
      editingStartedRef.current = false;
    }
    setWizardStep(0);
    onOpenChange(isOpen);
  };

  const canNext = () => {
    if (wizardStep === 0) return formData.title.trim().length > 0;
    return true;
  };

  const handleNext = () => {
    if (wizardStep === 1) {
      handleSubmit();
    } else {
      setWizardStep(s => s + 1);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent hideClose className="bg-white border-zinc-200 max-w-xl max-h-[92vh] overflow-hidden p-0 rounded-[24px] flex flex-col shadow-[0_8px_40px_rgba(0,0,0,0.1)]" data-testid="rundown-item-wizard">
        {/* Header */}
        <div className="flex items-center justify-between px-8 pt-6 pb-0 flex-shrink-0">
          <WizardStepIndicator currentStep={wizardStep} steps={ITEM_STEPS} />
          <button onClick={() => handleClose(false)} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-zinc-100 transition-colors">
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
              {/* Step 0: Item Info */}
              {wizardStep === 0 && (
                <div>
                  <h2 className="text-2xl font-bold text-zinc-900 mb-1">
                    {editingItem ? 'Edit item' : 'New rundown item'}
                  </h2>
                  <p className="text-sm text-zinc-500 mb-6">Choose the type and give it a name.</p>

                  <div className="space-y-5">
                    {/* Type cards */}
                    <div className="space-y-2">
                      <Label className="text-zinc-700 font-medium">Type</Label>
                      <div className="grid grid-cols-2 gap-3">
                        {itemTypes.map(type => {
                          const Icon = type.icon;
                          const isActive = formData.type === type.value;
                          return (
                            <button key={type.value} type="button"
                              onClick={() => handleFieldChange('type', type.value)}
                              data-testid={`item-type-${type.value}`}
                              className={`p-4 rounded-2xl border-2 text-left transition-all ${
                                isActive ? 'border-zinc-900 bg-zinc-50' : 'border-zinc-200 hover:border-zinc-300'
                              }`}>
                              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-2 ${isActive ? 'bg-zinc-900' : 'bg-zinc-100'}`}>
                                <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-zinc-400'}`} />
                              </div>
                              <span className={`text-sm font-semibold ${isActive ? 'text-zinc-900' : 'text-zinc-600'}`}>{type.label}</span>
                              <p className="text-xs text-zinc-400 mt-0.5">{type.desc}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Title */}
                    <div className="space-y-2">
                      <Label className="text-zinc-700 font-medium">Title</Label>
                      <Input
                        data-testid="item-title-input"
                        value={formData.title}
                        onChange={(e) => handleFieldChange('title', e.target.value)}
                        placeholder="Enter title..."
                        className="h-12 bg-zinc-50 border-zinc-200 text-zinc-900 placeholder:text-zinc-400 rounded-xl"
                        autoFocus
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Step 1: Details */}
              {wizardStep === 1 && (
                <div>
                  <h2 className="text-2xl font-bold text-zinc-900 mb-1">Details</h2>
                  <p className="text-sm text-zinc-500 mb-6">Add notes and duration for this item.</p>

                  <div className="space-y-5">
                    {/* Notes */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-zinc-700 font-medium">Notes (optional)</Label>
                        {wordCount > 0 && (
                          <span className="text-xs text-zinc-500">{wordCount} words</span>
                        )}
                      </div>
                      <Textarea
                        data-testid="item-notes-input"
                        value={formData.notes}
                        onChange={(e) => handleFieldChange('notes', e.target.value)}
                        placeholder="Additional notes or script text..."
                        className="bg-zinc-50 border-zinc-200 text-zinc-900 placeholder:text-zinc-400 resize-none rounded-xl"
                        rows={5}
                      />
                      {estimatedDuration && (
                        <div className="flex items-center justify-between p-3 bg-zinc-50 border border-zinc-200 rounded-xl">
                          <div className="flex items-center gap-2 text-sm">
                            <Clock className="w-4 h-4 text-zinc-400" />
                            <span className="text-zinc-600">
                              Estimated: <span className="font-mono font-semibold text-zinc-900">{estimatedDuration}</span>
                            </span>
                            <span className="text-zinc-400 text-xs">({WORDS_PER_MINUTE} wpm)</span>
                          </div>
                          <Button type="button" size="sm" data-testid="apply-duration-btn"
                            onClick={applyEstimatedDuration}
                            className="h-7 px-3 bg-zinc-900 hover:bg-zinc-900 text-white text-xs gap-1 rounded-full">
                            <Wand2 className="w-3 h-3" /> Apply
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Duration */}
                    <div className="space-y-2">
                      <Label className="text-zinc-700 font-medium">Duration (optional)</Label>
                      <Input
                        data-testid="item-duration-input"
                        value={formData.duration}
                        onChange={(e) => handleFieldChange('duration', e.target.value)}
                        placeholder="MM:SS"
                        className="h-12 bg-zinc-50 border-zinc-200 text-zinc-900 placeholder:text-zinc-400 font-mono rounded-xl"
                      />
                      <p className="text-xs text-zinc-400">Format: MM:SS (e.g., 03:30)</p>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-8 py-4 border-t border-zinc-100 flex-shrink-0">
          <Button variant="ghost" onClick={() => wizardStep === 0 ? handleClose(false) : setWizardStep(s => s - 1)}
            className="gap-2 text-zinc-500">
            <ChevronLeft className="w-4 h-4" />
            {wizardStep === 0 ? 'Cancel' : 'Back'}
          </Button>
          <Button onClick={handleNext} disabled={!canNext() || loading}
            data-testid="item-wizard-next-btn"
            className="gap-2 bg-zinc-900 hover:bg-zinc-900 text-white px-6 rounded-full">
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
            ) : wizardStep === 1 ? (
              <><Zap className="w-4 h-4" /> {editingItem ? 'Update Item' : 'Add Item'}</>
            ) : (
              <>Continue <ChevronRight className="w-4 h-4" /></>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default RundownItemDialog;
