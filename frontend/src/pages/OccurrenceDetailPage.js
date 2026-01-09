import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { toast } from 'sonner';
import {
  Radio,
  Clock,
  Calendar,
  ArrowLeft,
  Loader2,
  Plus,
  Trash2,
  GripVertical,
  CheckCircle,
  Circle,
  Users,
  Pencil,
  MoreVertical
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '../lib/utils';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const statusConfig = {
  draft: { label: 'Draft', color: 'text-zinc-400 bg-zinc-500/20', icon: Circle },
  scheduled: { label: 'Scheduled', color: 'text-amber-400 bg-amber-500/20', icon: Clock },
  completed: { label: 'Completed', color: 'text-green-400 bg-green-500/20', icon: CheckCircle },
};

const SEGMENT_TYPES = [
  { value: 'intro', label: 'Intro' },
  { value: 'segment', label: 'Segment' },
  { value: 'music', label: 'Music' },
  { value: 'ad', label: 'Ad Break' },
  { value: 'interview', label: 'Interview' },
  { value: 'outro', label: 'Outro' },
];

// Sortable Rundown Item Component
const SortableRundownItem = ({ item, onEdit, onDelete, canEdit }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const calculateDuration = (notes) => {
    if (!notes) return '-';
    const words = notes.trim().split(/\s+/).length;
    const minutes = Math.ceil(words / 150);
    return `~${minutes} min`;
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid={`rundown-item-${item.id}`}
      className="glass-card rounded-lg p-4 hover:border-rose-500/30 transition-all group"
    >
      <div className="flex items-start gap-3">
        {canEdit && (
          <button
            {...attributes}
            {...listeners}
            className="mt-1 cursor-grab active:cursor-grabbing text-zinc-500 hover:text-white"
          >
            <GripVertical className="w-4 h-4" />
          </button>
        )}
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 uppercase font-medium">
              {item.type}
            </span>
            <span className="text-xs text-zinc-500">
              {item.duration || calculateDuration(item.notes)}
            </span>
          </div>
          <h4 className="font-medium text-white">{item.title}</h4>
          {item.notes && (
            <p className="text-sm text-zinc-400 mt-1 line-clamp-2">{item.notes}</p>
          )}
        </div>

        {canEdit && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="opacity-0 group-hover:opacity-100"
              >
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-[#18181b] border-zinc-800">
              <DropdownMenuItem onClick={() => onEdit(item)} className="text-zinc-300">
                <Pencil className="w-4 h-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDelete(item)} className="text-rose-500 focus:text-rose-500">
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
};

const OccurrenceDetailPage = () => {
  const { occurrenceId } = useParams();
  const navigate = useNavigate();
  const { isAdmin, user } = useAuth();
  
  const [occurrence, setOccurrence] = useState(null);
  const [rundownItems, setRundownItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showItemDialog, setShowItemDialog] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [canEdit, setCanEdit] = useState(false);
  const [itemFormData, setItemFormData] = useState({
    type: 'segment',
    title: '',
    notes: '',
    duration: ''
  });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    fetchOccurrence();
    fetchRundown();
  }, [occurrenceId]);

  const fetchOccurrence = async () => {
    try {
      const response = await axios.get(`${API}/occurrences/${occurrenceId}`);
      setOccurrence(response.data);
      // For now, admins can always edit. Will check assignments in a later iteration.
      setCanEdit(isAdmin || user?.role === 'editor' || user?.role === 'presenter');
    } catch (error) {
      toast.error('Failed to load occurrence');
      navigate('/occurrences');
    } finally {
      setLoading(false);
    }
  };

  const fetchRundown = async () => {
    try {
      const response = await axios.get(`${API}/occurrences/${occurrenceId}/rundown`);
      setRundownItems(response.data);
    } catch (error) {
      console.error('Failed to load rundown');
    }
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      const oldIndex = rundownItems.findIndex(item => item.id === active.id);
      const newIndex = rundownItems.findIndex(item => item.id === over.id);
      
      const newItems = arrayMove(rundownItems, oldIndex, newIndex);
      setRundownItems(newItems);

      try {
        await axios.put(
          `${API}/occurrences/${occurrenceId}/rundown/reorder`,
          { item_ids: newItems.map(item => item.id) }
        );
      } catch (error) {
        toast.error('Failed to reorder items');
        fetchRundown();
      }
    }
  };

  const handleSubmitItem = async (e) => {
    e.preventDefault();

    try {
      if (editingItem) {
        const response = await axios.put(
          `${API}/occurrences/${occurrenceId}/rundown/${editingItem.id}`,
          itemFormData
        );
        setRundownItems(rundownItems.map(item =>
          item.id === editingItem.id ? response.data : item
        ));
        toast.success('Item updated');
      } else {
        const response = await axios.post(
          `${API}/occurrences/${occurrenceId}/rundown`,
          itemFormData
        );
        setRundownItems([...rundownItems, response.data]);
        toast.success('Item added');
      }
      closeItemDialog();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Operation failed');
    }
  };

  const handleDeleteItem = async (item) => {
    if (!confirm(`Delete "${item.title}"?`)) return;

    try {
      await axios.delete(`${API}/occurrences/${occurrenceId}/rundown/${item.id}`);
      setRundownItems(rundownItems.filter(i => i.id !== item.id));
      toast.success('Item deleted');
    } catch (error) {
      toast.error('Failed to delete item');
    }
  };

  const openAddDialog = () => {
    setItemFormData({
      type: 'segment',
      title: '',
      notes: '',
      duration: ''
    });
    setEditingItem(null);
    setShowItemDialog(true);
  };

  const openEditDialog = (item) => {
    setItemFormData({
      type: item.type,
      title: item.title,
      notes: item.notes || '',
      duration: item.duration || ''
    });
    setEditingItem(item);
    setShowItemDialog(true);
  };

  const closeItemDialog = () => {
    setShowItemDialog(false);
    setEditingItem(null);
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-rose-500" />
      </div>
    );
  }

  if (!occurrence) return null;

  const StatusIcon = statusConfig[occurrence.status]?.icon || Circle;

  return (
    <div data-testid="occurrence-detail-page">
      {/* Header */}
      <div className="mb-8">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/occurrences')}
          className="text-zinc-400 hover:text-white -ml-2 mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to Occurrences
        </Button>

        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-rose-500/20 rounded-xl">
              <Radio className="w-8 h-8 text-rose-500" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-white">{occurrence.title}</h1>
                <span className={cn(
                  'text-xs px-2 py-1 rounded-full flex items-center gap-1',
                  statusConfig[occurrence.status]?.color
                )}>
                  <StatusIcon className="w-3 h-3" />
                  {statusConfig[occurrence.status]?.label}
                </span>
              </div>
              <div className="flex items-center gap-4 text-sm text-zinc-400 mt-1">
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {formatDate(occurrence.date)}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {occurrence.start_time} - {occurrence.end_time}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Rundown Section */}
      <div className="glass-card rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-white">Rundown</h2>
          {canEdit && (
            <Button
              data-testid="add-rundown-item-btn"
              onClick={openAddDialog}
              size="sm"
              className="bg-rose-500 hover:bg-rose-600"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Item
            </Button>
          )}
        </div>

        {rundownItems.length === 0 ? (
          <div className="text-center py-12">
            <Radio className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">Empty rundown</h3>
            <p className="text-zinc-400 mb-4">
              Add segments, music breaks, and more to plan this show
            </p>
            {canEdit && (
              <Button
                onClick={openAddDialog}
                className="bg-rose-500 hover:bg-rose-600"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add First Item
              </Button>
            )}
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={rundownItems.map(item => item.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {rundownItems.map((item) => (
                  <SortableRundownItem
                    key={item.id}
                    item={item}
                    onEdit={openEditDialog}
                    onDelete={handleDeleteItem}
                    canEdit={canEdit}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Add/Edit Item Dialog */}
      <Dialog open={showItemDialog} onOpenChange={setShowItemDialog}>
        <DialogContent className="bg-[#18181b] border-zinc-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">
              {editingItem ? 'Edit Item' : 'Add Rundown Item'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitItem} className="space-y-4">
            <div>
              <Label className="text-zinc-300">Type</Label>
              <Select
                value={itemFormData.type}
                onValueChange={(value) => setItemFormData({ ...itemFormData, type: value })}
              >
                <SelectTrigger data-testid="item-type-select" className="bg-white/5 border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#18181b] border-zinc-800">
                  {SEGMENT_TYPES.map(type => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-zinc-300">Title</Label>
              <Input
                data-testid="item-title-input"
                value={itemFormData.title}
                onChange={(e) => setItemFormData({ ...itemFormData, title: e.target.value })}
                placeholder="Item title"
                required
                className="bg-white/5 border-white/10 text-white"
              />
            </div>

            <div>
              <Label className="text-zinc-300">Notes</Label>
              <Textarea
                data-testid="item-notes-input"
                value={itemFormData.notes}
                onChange={(e) => setItemFormData({ ...itemFormData, notes: e.target.value })}
                placeholder="Speaking notes, talking points..."
                className="bg-white/5 border-white/10 text-white"
                rows={4}
              />
            </div>

            <div>
              <Label className="text-zinc-300">Duration (optional)</Label>
              <Input
                data-testid="item-duration-input"
                value={itemFormData.duration}
                onChange={(e) => setItemFormData({ ...itemFormData, duration: e.target.value })}
                placeholder="e.g., 5 min"
                className="bg-white/5 border-white/10 text-white"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={closeItemDialog}>
                Cancel
              </Button>
              <Button
                type="submit"
                data-testid="save-item-btn"
                className="bg-rose-500 hover:bg-rose-600"
              >
                {editingItem ? 'Save Changes' : 'Add Item'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OccurrenceDetailPage;
