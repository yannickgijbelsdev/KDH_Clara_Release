import { useMemo } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Music, Mic, FileText, Radio, Edit2, Trash2, Clock, Wand2, Pencil } from 'lucide-react';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from './ui/tooltip';
import { getAvatarUrl } from '../utils/avatar';

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

const WORDS_PER_MINUTE = 150;

const calculateSpeakingDuration = (text) => {
  if (!text || text.trim() === '') return null;
  const words = text.trim().split(/\s+/).filter(w => w.length > 0).length;
  const totalMinutes = words / WORDS_PER_MINUTE;
  const minutes = Math.floor(totalMinutes);
  const seconds = Math.round((totalMinutes - minutes) * 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const UserAvatar = ({ user, size = 'sm', ring = false, ringColor = 'violet' }) => {
  if (!user) return null;
  const sizeClass = size === 'sm' ? 'w-5 h-5 text-[8px]' : 'w-6 h-6 text-[9px]';
  const ringClass = ring ? `ring-2 ring-${ringColor}-500/60` : '';
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            data-testid={`item-avatar-${user.id}`}
            className={`${sizeClass} ${ringClass} rounded-full bg-zinc-700 flex items-center justify-center font-bold text-white overflow-hidden shrink-0 cursor-default`}
          >
            {getAvatarUrl(user) ? (
              <img src={getAvatarUrl(user)} alt="" className="w-full h-full object-cover" />
            ) : (
              user.name?.charAt(0).toUpperCase() || '?'
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="bg-zinc-800 border-zinc-700 text-white text-xs px-2 py-1">
          {user.name}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

const SortableRundownItem = ({ item, index, timestamp, onEdit, onDelete, canEdit = true, isActive = false, liveEdit = null }) => {
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
  const isBeingEdited = !!liveEdit;

  const estimatedDuration = useMemo(() => {
    if (item.type === 'music' || item.duration) return null;
    return calculateSpeakingDuration(item.notes);
  }, [item.notes, item.type, item.duration]);

  const displayDuration = item.duration || estimatedDuration;
  const isEstimated = !item.duration && estimatedDuration;

  // Show live values if someone else is editing
  const displayTitle = liveEdit?.fields?.title ?? item.title;
  const displayNotes = liveEdit?.fields?.notes ?? item.notes;

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid={`rundown-item-${index}`}
      className={`group relative flex items-start gap-4 bg-[#27272a] rounded-lg p-4 ${typeColors[item.type]} ${
        isDragging ? 'dragging z-50' : ''
      } ${isActive ? 'ring-2 ring-green-500 bg-green-500/10' : ''} ${
        isBeingEdited ? 'ring-2 ring-amber-500/60 bg-amber-500/5' : ''
      }`}
    >
      {/* Live indicator */}
      {isActive && (
        <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-8 bg-green-500 rounded-r-full animate-pulse" />
      )}

      {/* Live editing indicator */}
      {isBeingEdited && (
        <div className="absolute -top-2.5 right-3 flex items-center gap-1.5 px-2 py-0.5 bg-amber-500/20 border border-amber-500/40 rounded-full" data-testid={`live-edit-indicator-${index}`}>
          <UserAvatar user={liveEdit.user} size="sm" />
          <Pencil className="w-3 h-3 text-amber-400 animate-pulse" />
          <span className="text-[10px] text-amber-300 font-medium">{liveEdit.user?.name?.split(' ')[0]} is editing</span>
        </div>
      )}
      
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

      {/* Timestamp */}
      {timestamp && (
        <span 
          className="font-mono text-sm text-orange-400 w-14 text-center mt-1 shrink-0"
          data-testid={`timestamp-${index}`}
          title="Scheduled start time"
        >
          {timestamp}
        </span>
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
        <h4 className={`text-white font-medium break-words ${isBeingEdited ? 'text-amber-100' : ''}`}>{displayTitle}</h4>
        {displayNotes && (
          <p className={`text-sm break-words whitespace-pre-wrap mt-1 ${isBeingEdited ? 'text-amber-200/70' : 'text-zinc-300'}`}>{displayNotes}</p>
        )}
      </div>

      {/* Attribution Avatar */}
      <div className="flex items-center gap-1 mt-1 shrink-0">
        {item.last_edited_by && item.last_edited_by.id !== item.created_by?.id && (
          <UserAvatar user={item.last_edited_by} size="sm" ring ringColor="blue" />
        )}
        {item.created_by && (
          <UserAvatar user={item.created_by} size="sm" />
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
