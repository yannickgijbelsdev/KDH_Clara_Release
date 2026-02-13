import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Plus, Music, Mic, FileText, Radio, ListOrdered, Play, Pause } from 'lucide-react';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { toast } from 'sonner';
import SortableRundownItem from './SortableRundownItem';
import RundownItemDialog from './RundownItemDialog';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const typeIcons = {
  music: Music,
  talk: Mic,
  item: FileText,
  ad: Radio,
};

// Average speaking rate: 150 words per minute
const WORDS_PER_MINUTE = 150;

const calculateSpeakingDuration = (text) => {
  if (!text || text.trim() === '') return null;
  const words = text.trim().split(/\s+/).filter(w => w.length > 0).length;
  const totalMinutes = words / WORDS_PER_MINUTE;
  const minutes = Math.floor(totalMinutes);
  const seconds = Math.round((totalMinutes - minutes) * 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

// Default durations for item types (in minutes)
const DEFAULT_DURATIONS = {
  ad: 2,
  music: 3,
};

// Parse duration string "MM:SS" to minutes
const parseDurationToMinutes = (duration) => {
  if (!duration) return 0;
  const [mins, secs] = duration.split(':').map(Number);
  return mins + (secs || 0) / 60;
};

// Calculate timestamps for all items based on show start time
const calculateTimestamps = (items, showStartTime) => {
  if (!showStartTime) return items.map(() => null);
  
  // Parse show start time (format: "HH:MM")
  const [startHours, startMins] = showStartTime.split(':').map(Number);
  let currentMinutes = startHours * 60 + startMins;
  
  return items.map((item) => {
    const timestamp = currentMinutes;
    
    // Calculate this item's duration
    let itemDuration = 0;
    if (item.duration) {
      // Use explicit duration if set
      itemDuration = parseDurationToMinutes(item.duration);
    } else if (DEFAULT_DURATIONS[item.type]) {
      // Use default duration for type (ad=2min, music=3min)
      itemDuration = DEFAULT_DURATIONS[item.type];
    } else if (item.type !== 'music' && item.notes) {
      // Estimate from text for talk/item types
      const estimated = calculateSpeakingDuration(item.notes);
      if (estimated) {
        itemDuration = parseDurationToMinutes(estimated);
      }
    }
    
    // Move to next timestamp
    currentMinutes += itemDuration;
    
    // Format timestamp as HH:MM
    const hours = Math.floor(timestamp / 60) % 24;
    const mins = Math.floor(timestamp % 60);
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  });
};

const RundownEditor = ({ showId, canEdit = true, showStartTime = null }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    fetchRundown();
  }, [showId]);

  const fetchRundown = async () => {
    try {
      const response = await axios.get(`${API}/shows/${showId}/rundown`);
      setItems(response.data);
    } catch (error) {
      toast.error('Failed to load rundown');
    } finally {
      setLoading(false);
    }
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      const oldIndex = items.findIndex((item) => item.id === active.id);
      const newIndex = items.findIndex((item) => item.id === over.id);

      const newItems = arrayMove(items, oldIndex, newIndex);
      setItems(newItems);

      try {
        await axios.put(`${API}/shows/${showId}/rundown/reorder`, {
          item_ids: newItems.map((item) => item.id),
        });
      } catch (error) {
        toast.error('Failed to reorder items');
        fetchRundown();
      }
    }
  };

  const handleAddItem = () => {
    setEditingItem(null);
    setDialogOpen(true);
  };

  const handleEditItem = (item) => {
    setEditingItem(item);
    setDialogOpen(true);
  };

  const handleDeleteItem = async (itemId) => {
    try {
      await axios.delete(`${API}/shows/${showId}/rundown/${itemId}`);
      setItems(items.filter((item) => item.id !== itemId));
      toast.success('Item deleted');
    } catch (error) {
      toast.error('Failed to delete item');
    }
  };

  const handleItemSaved = (savedItem) => {
    if (editingItem) {
      setItems(items.map((item) => (item.id === savedItem.id ? savedItem : item)));
    } else {
      setItems([...items, savedItem]);
    }
    setDialogOpen(false);
    setEditingItem(null);
  };

  const calculateTotalDuration = () => {
    let totalMinutes = 0;
    let hasEstimated = false;
    
    items.forEach((item) => {
      let duration = item.duration;
      
      // If no duration set, calculate estimated for non-music items
      if (!duration && item.type !== 'music' && item.notes) {
        duration = calculateSpeakingDuration(item.notes);
        if (duration) hasEstimated = true;
      }
      
      if (duration) {
        const [mins, secs] = duration.split(':').map(Number);
        totalMinutes += mins + (secs || 0) / 60;
      }
    });
    
    const hours = Math.floor(totalMinutes / 60);
    const mins = Math.round(totalMinutes % 60);
    const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
    return { timeStr, hasEstimated };
  };

  const { timeStr: totalDuration, hasEstimated } = calculateTotalDuration();
  
  // Calculate timestamps for all items
  const timestamps = calculateTimestamps(items, showStartTime);

  return (
    <div data-testid="rundown-editor" className="bg-[#18181b] border border-zinc-800 rounded-xl p-6">
      <div className="sticky top-0 z-10 bg-[#18181b] pb-4 -mx-6 px-6 pt-0 border-b border-zinc-800/50 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-violet-500/20 rounded-lg">
              <ListOrdered className="w-5 h-5 text-violet-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Rundown</h2>
              <p className="text-sm text-zinc-500">
                {items.length} items • {totalDuration} total
                {hasEstimated && <span className="text-violet-400 ml-1">(incl. estimates)</span>}
              </p>
            </div>
          </div>
          {canEdit && (
            <Button
              data-testid="add-rundown-item-btn"
              onClick={handleAddItem}
              className="gap-2 bg-violet-500 hover:bg-violet-600 text-white btn-primary"
            >
              <Plus className="w-4 h-4" />
              Add Item
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-zinc-800/50 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-zinc-800 rounded-xl">
          <div className="w-12 h-12 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-3">
            <ListOrdered className="w-6 h-6 text-zinc-500" />
          </div>
          <h3 className="text-white font-medium mb-1">No items yet</h3>
          <p className="text-zinc-500 text-sm mb-4">{canEdit ? 'Start building your rundown' : 'No rundown items'}</p>
          {canEdit && (
            <Button
              onClick={handleAddItem}
              variant="outline"
              className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add First Item
            </Button>
          )}
        </div>
      ) : (
        <DndContext
          sensors={canEdit ? sensors : []}
          collisionDetection={closestCenter}
          onDragEnd={canEdit ? handleDragEnd : undefined}
        >
          <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {items.map((item, index) => (
                <SortableRundownItem
                  key={item.id}
                  item={item}
                  index={index}
                  timestamp={timestamps[index]}
                  onEdit={canEdit ? () => handleEditItem(item) : undefined}
                  onDelete={canEdit ? () => handleDeleteItem(item.id) : undefined}
                  canEdit={canEdit}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {canEdit && (
        <RundownItemDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          showId={showId}
          editingItem={editingItem}
          onSaved={handleItemSaved}
        />
      )}
    </div>
  );
};

export default RundownEditor;
