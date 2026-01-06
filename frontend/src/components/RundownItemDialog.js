import { useState, useEffect, useMemo } from 'react';
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

// Average speaking rate: 150 words per minute
const WORDS_PER_MINUTE = 150;

const calculateSpeakingDuration = (text) => {
  if (!text || text.trim() === '') return null;
  
  // Count words (split by whitespace)
  const words = text.trim().split(/\s+/).filter(w => w.length > 0).length;
  
  // Calculate minutes
  const totalMinutes = words / WORDS_PER_MINUTE;
  const minutes = Math.floor(totalMinutes);
  const seconds = Math.round((totalMinutes - minutes) * 60);
  
  // Format as MM:SS
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const RundownItemDialog = ({ open, onOpenChange, showId, editingItem, onSaved }) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    type: 'music',
    title: '',
    notes: '',
    duration: '',
  });

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
      onSaved(response.data);
      toast.success(editingItem ? 'Item updated' : 'Item added');
    } catch (error) {
      toast.error(editingItem ? 'Failed to update item' : 'Failed to add item');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#18181b] border-zinc-800 text-white sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">
            {editingItem ? 'Edit Item' : 'Add Rundown Item'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 mt-4">
          <div className="space-y-2">
            <Label className="text-zinc-300">Type</Label>
            <Select
              value={formData.type}
              onValueChange={(value) => setFormData({ ...formData, type: value })}
            >
              <SelectTrigger
                data-testid="item-type-select"
                className="bg-[#27272a] border-zinc-700 text-white"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#18181b] border-zinc-800">
                {itemTypes.map((type) => {
                  const Icon = type.icon;
                  return (
                    <SelectItem
                      key={type.value}
                      value={type.value}
                      className="text-zinc-300 focus:text-white focus:bg-zinc-800"
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
            <Label className="text-zinc-300">Title</Label>
            <Input
              data-testid="item-title-input"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Enter title..."
              required
              className="bg-[#27272a] border-zinc-700 text-white placeholder:text-zinc-500"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-zinc-300">Notes (optional)</Label>
            <Textarea
              data-testid="item-notes-input"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Additional notes..."
              className="bg-[#27272a] border-zinc-700 text-white placeholder:text-zinc-500 resize-none"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-zinc-300">Duration (optional)</Label>
            <Input
              data-testid="item-duration-input"
              value={formData.duration}
              onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
              placeholder="MM:SS"
              className="bg-[#27272a] border-zinc-700 text-white placeholder:text-zinc-500 font-mono"
            />
            <p className="text-xs text-zinc-500">Format: MM:SS (e.g., 03:30)</p>
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
