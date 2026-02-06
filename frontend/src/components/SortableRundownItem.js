import { useMemo } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Music, Mic, FileText, Radio, Edit2, Trash2, Clock, Wand2 } from 'lucide-react';
import { Button } from './ui/button';

const typeIcons = {
  music: Music,
  talk: Mic,
  item: FileText,
  ad: Radio,
};

const typeColors = {
  music: 'type-music',
  talk: 'type-talk',
  item: 'type-item',
  ad: 'type-ad',
};

const typeLabels = {
  music: 'Music',
  talk: 'Talk',
  item: 'Item',
  ad: 'Ad',
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

const SortableRundownItem = ({ item, index, onEdit, onDelete, canEdit = true }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: !canEdit });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const Icon = typeIcons[item.type] || FileText;

  // Calculate estimated duration from notes for non-music items
  const estimatedDuration = useMemo(() => {
    if (item.type === 'music' || item.duration) return null;
    return calculateSpeakingDuration(item.notes);
  }, [item.notes, item.type, item.duration]);

  // Get display duration (actual or estimated)
  const displayDuration = item.duration || estimatedDuration;
  const isEstimated = !item.duration && estimatedDuration;

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid={`rundown-item-${index}`}
      className={`group flex items-start gap-4 bg-[#27272a] rounded-lg p-4 ${typeColors[item.type]} ${
        isDragging ? 'dragging z-50' : ''
      }`}
    >
      {/* Drag Handle */}
      {canEdit ? (
        <button
          {...attributes}
          {...listeners}
          data-testid={`drag-handle-${index}`}
          className="drag-handle p-1 text-zinc-500 hover:text-zinc-300 transition-colors mt-0.5 shrink-0"
        >
          <GripVertical className="w-5 h-5" />
        </button>
      ) : (
        <div className="w-7 shrink-0" />
      )}

      {/* Order Number */}
      <span className="font-mono text-sm text-zinc-500 w-6 text-center mt-1 shrink-0">
        {index + 1}
      </span>

      {/* Type Icon */}
      <div className="p-2 bg-black/30 rounded-lg mt-0.5 shrink-0">
        <Icon className="w-4 h-4 text-zinc-400" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 overflow-hidden">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-zinc-500">
            {typeLabels[item.type]}
          </span>
        </div>
        <h4 className="text-white font-medium break-words">{item.title}</h4>
        {item.notes && (
          <p className="text-zinc-300 text-sm break-words whitespace-pre-wrap mt-1">{item.notes}</p>
        )}
      </div>

      {/* Duration */}
      {displayDuration && (
        <div className={`flex items-center gap-1 mt-1 shrink-0 ${isEstimated ? 'text-violet-400' : 'text-zinc-500'}`}>
          {isEstimated ? (
            <Wand2 className="w-4 h-4" />
          ) : (
            <Clock className="w-4 h-4" />
          )}
          <span className="font-mono text-sm">{displayDuration}</span>
          {isEstimated && (
            <span className="text-xs text-violet-400/70 ml-1">est.</span>
          )}
        </div>
      )}

      {/* Actions */}
      {canEdit && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            data-testid={`edit-item-${index}`}
            onClick={onEdit}
            className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-white/10"
          >
            <Edit2 className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            data-testid={`delete-item-${index}`}
            onClick={onDelete}
            className="h-8 w-8 text-zinc-400 hover:text-rose-500 hover:bg-rose-500/10"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
};

export default SortableRundownItem;
