import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import axios from 'axios';
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
import { toast } from 'sonner';
import { Music, Mic, FileText, Radio, Clock, Wand2 } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const itemTypes = [
  { value: 'music', label: 'Music', icon: Music },
  { value: 'talk', label: 'Talk', icon: Mic },
  { value: 'item', label: 'Item', icon: FileText },
  { value: 'ad', label: 'Ad', icon: Radio },
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

const RundownItemDialog = ({ open, onOpenChange, showId, editingItem, onSaved, sendWsMessage }) => {
  const [loading, setLoading] = useState(false);
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
      setFormData({
        type: 'music',
        title: '',
        notes: '',
        duration: '',
      });
    }
  }, [editingItem, open]);

  // Send editing_start when dialog opens for an existing item
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

  // Throttled broadcast of field changes
  const broadcastChange = useCallback((field, value) => {
    if (!editingItem || !sendWsMessage) return;
    if (throttleRef.current) clearTimeout(throttleRef.current);
    throttleRef.current = setTimeout(() => {
      sendWsMessage({
        type: 'editing_update',
        item_id: editingItem.id,
        field,
        value
      });
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      let response;
      if (editingItem) {
        response = await axios.put(
          `${API}/shows/${showId}/rundown/${editingItem.id}`,
          formData
        );
      } else {
        response = await axios.post(`${API}/shows/${showId}/rundown`, formData);
      }
      // Send editing_end before closing
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
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-white border-zinc-200 text-zinc-900 sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">
            {editingItem ? 'Edit Item' : 'Add Rundown Item'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 mt-4">
          <div className="space-y-2">
            <Label className="text-zinc-600">Type</Label>
            <Select
              value={formData.type}
              onValueChange={(value) => handleFieldChange('type', value)}
            >
              <SelectTrigger
                data-testid="item-type-select"
                className="bg-white border-zinc-300 text-zinc-900"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-100 border-zinc-200">
                {itemTypes.map((type) => {
                  const Icon = type.icon;
                  return (
                    <SelectItem
                      key={type.value}
                      value={type.value}
                      className="text-zinc-600 focus:text-zinc-900 focus:bg-zinc-100"
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4" />
                        {type.label}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-zinc-600">Title</Label>
            <Input
              data-testid="item-title-input"
              value={formData.title}
              onChange={(e) => handleFieldChange('title', e.target.value)}
              placeholder="Enter title..."
              required
              className="bg-white border-zinc-300 text-zinc-900 placeholder:text-zinc-400"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-zinc-600">Notes (optional)</Label>
              {wordCount > 0 && (
                <span className="text-xs text-zinc-500">
                  {wordCount} words
                </span>
              )}
            </div>
            <Textarea
              data-testid="item-notes-input"
              value={formData.notes}
              onChange={(e) => handleFieldChange('notes', e.target.value)}
              placeholder="Additional notes or script text..."
              className="bg-white border-zinc-300 text-zinc-900 placeholder:text-zinc-400 resize-none"
              rows={4}
            />
            {estimatedDuration && (
              <div className="flex items-center justify-between p-2 bg-violet-500/10 border border-violet-500/30 rounded-lg">
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="w-4 h-4 text-violet-400" />
                  <span className="text-zinc-600">
                    Estimated speaking time: <span className="font-mono text-violet-400">{estimatedDuration}</span>
                  </span>
                  <span className="text-zinc-500 text-xs">({WORDS_PER_MINUTE} wpm)</span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  data-testid="apply-duration-btn"
                  onClick={applyEstimatedDuration}
                  className="h-7 px-2 bg-violet-500 hover:bg-violet-600 text-white text-xs gap-1"
                >
                  <Wand2 className="w-3 h-3" />
                  Apply
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-zinc-600">Duration (optional)</Label>
            <Input
              data-testid="item-duration-input"
              value={formData.duration}
              onChange={(e) => handleFieldChange('duration', e.target.value)}
              placeholder="MM:SS"
              className="bg-white border-zinc-300 text-zinc-900 placeholder:text-zinc-400 font-mono"
            />
            <p className="text-xs text-zinc-500">Format: MM:SS (e.g., 03:30)</p>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleClose(false)}
              className="flex-1 bg-transparent border-zinc-300 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              data-testid="submit-item-btn"
              disabled={loading}
              className="flex-1 bg-violet-500 hover:bg-violet-600 text-white btn-primary"
            >
              {loading ? 'Saving...' : editingItem ? 'Update' : 'Add Item'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default RundownItemDialog;
