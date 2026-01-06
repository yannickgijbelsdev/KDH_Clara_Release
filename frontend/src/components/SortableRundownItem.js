import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Music, Mic, FileText, Radio, Edit2, Trash2, Clock } from 'lucide-react';
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

const SortableRundownItem = ({ item, index, onEdit, onDelete }) => {
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
  };

  const Icon = typeIcons[item.type] || FileText;

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid={`rundown-item-${index}`}
      className={`group flex items-center gap-4 bg-[#27272a] rounded-lg p-4 ${typeColors[item.type]} ${
        isDragging ? 'dragging z-50' : ''
      }`}
    >
      {/* Drag Handle */}
      <button
        {...attributes}
        {...listeners}
        data-testid={`drag-handle-${index}`}
        className="drag-handle p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        <GripVertical className="w-5 h-5" />
      </button>

      {/* Order Number */}
      <span className="font-mono text-sm text-zinc-500 w-6 text-center">
        {index + 1}
      </span>

      {/* Type Icon */}
      <div className="p-2 bg-black/30 rounded-lg">
        <Icon className="w-4 h-4 text-zinc-400" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-zinc-500">
            {typeLabels[item.type]}
          </span>
        </div>
        <h4 className="text-white font-medium truncate">{item.title}</h4>
        {item.notes && (
          <p className="text-zinc-500 text-sm truncate">{item.notes}</p>
        )}
      </div>

      {/* Duration */}
      {item.duration && (
        <div className="flex items-center gap-1 text-zinc-500">
          <Clock className="w-4 h-4" />
          <span className="font-mono text-sm">{item.duration}</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
    </div>
  );
};

export default SortableRundownItem;
