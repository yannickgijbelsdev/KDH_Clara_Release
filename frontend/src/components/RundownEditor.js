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
import { Plus, Music, Mic, FileText, Radio, ListOrdered, Play, Pause, Users, User, Eye, UserPlus, X } from 'lucide-react';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { toast } from 'sonner';
import SortableRundownItem from './SortableRundownItem';
import RundownItemDialog from './RundownItemDialog';
import useRundownWebSocket from '../hooks/useRundownWebSocket';
import { useMainSite } from '../context/MainSiteContext';
import { getAvatarUrl } from '../utils/avatar';

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

const RundownEditor = ({ showId, canEdit = true, showStartTime = null, presenters = [], occurrenceId = null }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  
  // Live sync mode state
  const [liveMode, setLiveMode] = useState(false);
  const [currentTime, setCurrentTime] = useState(null);
  const [activeItemIndex, setActiveItemIndex] = useState(-1);
  const activeItemRef = useRef(null);

  // Members state
  const [showMemberDialog, setShowMemberDialog] = useState(false);
  const [siteUsers, setSiteUsers] = useState([]);
  const [members, setMembers] = useState([]);
  const [memberSearch, setMemberSearch] = useState('');

  // Get mainSiteId from context
  const { mainSite } = useMainSite();
  const mainSiteId = mainSite?.id || '';

  // WebSocket presence for live viewers + live edits
  const token = localStorage.getItem('token');
  const wsType = occurrenceId ? 'occurrence' : 'show';
  const wsId = occurrenceId || showId;

  const handleWsMessage = useCallback((data) => {
    if (data.type === 'item_created' && data.item) {
      setItems(prev => {
        if (prev.some(i => i.id === data.item.id)) return prev;
        return [...prev, data.item];
      });
    } else if (data.type === 'item_updated' && data.item) {
      setItems(prev => prev.map(i => i.id === data.item.id ? data.item : i));
    } else if (data.type === 'item_deleted' && data.item_id) {
      setItems(prev => prev.filter(i => i.id !== data.item_id));
    } else if (data.type === 'items_reordered' && data.items) {
      setItems(data.items);
    }
  }, []);

  const { isConnected, presence, liveEdits, sendMessage } = useRundownWebSocket(wsId, token, handleWsMessage, wsType);

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
    fetchMembers();
  }, [showId]);

  const fetchMembers = async () => {
    try {
      const res = await axios.get(`${API}/shows/${showId}/members`, {
        headers: { Authorization: `Bearer ${token}`, 'X-Main-Site-ID': mainSiteId },
      });
      setMembers(res.data);
    } catch { /* feature may not exist for older shows */ }
  };

  const fetchSiteUsers = async () => {
    if (!mainSiteId) return;
    try {
      const res = await axios.get(`${API}/main-sites/${mainSiteId}/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSiteUsers(res.data.map(u => ({ id: u.user_id, name: u.user_name, email: u.user_email, avatar_url: u.avatar_url })));
    } catch { /* ignore */ }
  };

  const toggleMember = async (userId) => {
    const current = members.map(m => m.id);
    const updated = current.includes(userId) ? current.filter(id => id !== userId) : [...current, userId];
    try {
      await axios.put(`${API}/shows/${showId}/members`, { member_ids: updated }, {
        headers: { Authorization: `Bearer ${token}`, 'X-Main-Site-ID': mainSiteId, 'Content-Type': 'application/json' },
      });
      await fetchMembers();
    } catch { toast.error('Failed to update members'); }
  };

  // Live mode timer - update current time every second
  useEffect(() => {
    if (!liveMode) {
      setActiveItemIndex(-1);
      return;
    }
    
    const updateCurrentTime = () => {
      const now = new Date();
      const hours = now.getHours();
      const mins = now.getMinutes();
      const secs = now.getSeconds();
      setCurrentTime(hours * 60 + mins + secs / 60);
    };
    
    updateCurrentTime();
    const interval = setInterval(updateCurrentTime, 1000);
    
    return () => clearInterval(interval);
  }, [liveMode]);

  // Calculate active item based on current time and timestamps
  useEffect(() => {
    if (!liveMode || currentTime === null || !showStartTime || items.length === 0) {
      setActiveItemIndex(-1);
      return;
    }

    const timestamps = calculateTimestamps(items, showStartTime);
    let foundIndex = -1;
    
    // Find the item that is currently active based on time
    for (let i = 0; i < timestamps.length; i++) {
      const itemStartTime = parseTimestampToMinutes(timestamps[i]);
      const nextStartTime = i + 1 < timestamps.length 
        ? parseTimestampToMinutes(timestamps[i + 1]) 
        : itemStartTime + 60; // Default 60 min if last item
      
      if (currentTime >= itemStartTime && currentTime < nextStartTime) {
        foundIndex = i;
        break;
      }
    }
    
    setActiveItemIndex(foundIndex);
  }, [liveMode, currentTime, items, showStartTime]);

  // Auto-scroll to active item
  useEffect(() => {
    if (liveMode && activeItemIndex >= 0 && activeItemRef.current) {
      activeItemRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [activeItemIndex, liveMode]);

  // Helper to parse timestamp "HH:MM" to minutes
  const parseTimestampToMinutes = (timestamp) => {
    if (!timestamp) return 0;
    const [hours, mins] = timestamp.split(':').map(Number);
    return hours * 60 + mins;
  };

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
    <div data-testid="rundown-editor" className="bg-white border border-zinc-200 rounded-xl p-6">
      <div className="sticky top-0 z-10 bg-zinc-100 pb-4 -mx-6 px-6 pt-0 border-b border-zinc-200/50 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-white rounded-2xl border border-black/[0.05] shadow-[0_6px_30px_rgba(0,0,0,0.06)] p-4 flex items-center gap-4" data-testid="panel-rundown-count">
              <div className="text-3xl font-bold text-zinc-900">{items.length}</div>
              <div>
                <div className="text-[10px] text-zinc-400 uppercase tracking-wider font-medium">Rundown</div>
                <div className="text-sm font-semibold text-zinc-700">
                  {totalDuration} total{hasEstimated && <span className="text-violet-400 ml-1">(est.)</span>}
                </div>
              </div>
              {canEdit && (
                <Button
                  data-testid="add-rundown-item-btn"
                  onClick={handleAddItem}
                  className="ml-1 bg-orange-500 hover:bg-orange-600 text-white rounded-full px-4 gap-1.5 text-sm shadow-lg shadow-orange-500/20"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Item
                </Button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            {/* Live Mode Toggle */}
            {showStartTime && items.length > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-100 rounded-lg">
                {liveMode ? (
                  <Play className="w-4 h-4 text-green-400" />
                ) : (
                  <Pause className="w-4 h-4 text-zinc-500" />
                )}
                <Label htmlFor="live-mode" className="text-sm text-zinc-600 cursor-pointer">
                  Follow live
                </Label>
                <Switch
                  id="live-mode"
                  checked={liveMode}
                  onCheckedChange={setLiveMode}
                  className="data-[state=checked]:bg-green-500"
                />
              </div>
            )}
          </div>
        </div>

        {/* Live Viewers + Members Row */}
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-zinc-200/30">
          {/* Members avatars */}
          <div className="flex items-center gap-2" data-testid="rundown-members">
            <Users className="w-3.5 h-3.5 text-zinc-500" />
            <div className="flex -space-x-1.5">
              {members.slice(0, 8).map(m => (
                <div key={m.id} title={m.name} className="w-6 h-6 rounded-full border-2 border-[#18181b] bg-zinc-700 flex items-center justify-center text-[9px] font-bold text-zinc-900 overflow-hidden">
                  {getAvatarUrl(m) ? <img src={getAvatarUrl(m)} alt="" className="w-full h-full object-cover" /> : m.name?.charAt(0).toUpperCase()}
                </div>
              ))}
              {members.length > 8 && (
                <div className="w-6 h-6 rounded-full border-2 border-zinc-300 bg-zinc-200 flex items-center justify-center text-[9px] text-zinc-500">+{members.length - 8}</div>
              )}
            </div>
            {canEdit && (
              <button onClick={() => { setShowMemberDialog(true); fetchSiteUsers(); }}
                className="w-6 h-6 rounded-full border border-dashed border-zinc-600 flex items-center justify-center hover:border-violet-500 transition-colors"
                data-testid="add-rundown-member-btn">
                <UserPlus className="w-3 h-3 text-zinc-500" />
              </button>
            )}
          </div>

          {/* Live viewers */}
          {presence && presence.length > 0 && (
            <div className="flex items-center gap-2 ml-auto" data-testid="rundown-live-viewers">
              <div className="flex items-center gap-1">
                <Eye className="w-3.5 h-3.5 text-green-400" />
                <span className="text-[10px] text-green-400 font-medium">LIVE</span>
              </div>
              <div className="flex -space-x-1.5">
                {presence.map((viewer, i) => (
                  <div key={i} title={viewer.name || 'Unknown'} className="w-6 h-6 rounded-full border-2 border-[#18181b] bg-green-900/50 flex items-center justify-center text-[9px] font-bold text-green-300 ring-1 ring-green-500/50 overflow-hidden">
                    {getAvatarUrl(viewer) ? <img src={getAvatarUrl(viewer)} alt="" className="w-full h-full object-cover" /> : (viewer.initials || viewer.name?.charAt(0).toUpperCase() || '?')}
                  </div>
                ))}
              </div>
              <span className="text-[10px] text-zinc-500">{presence.length} viewing</span>
            </div>
          )}
          {isConnected && (!presence || presence.length === 0) && (
            <div className="flex items-center gap-1 ml-auto">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
              <span className="text-[10px] text-zinc-500">Connected</span>
            </div>
          )}
        </div>
      </div>
      {presenters && presenters.length > 0 && (
        <div className="flex items-center gap-2 mb-4 pb-4 border-b border-zinc-200/50">
          <Users className="w-4 h-4 text-violet-400" />
          <span className="text-sm text-zinc-400">Presenters:</span>
          <div className="flex items-center gap-2 flex-wrap">
            {presenters.map((presenter) => (
              <div
                key={presenter.id}
                className="flex items-center gap-1.5 px-2 py-1 bg-violet-500/10 rounded-full"
              >
                <div className="w-5 h-5 rounded-full bg-zinc-700 flex items-center justify-center overflow-hidden">
                  {getAvatarUrl(presenter) ? (
                    <img src={getAvatarUrl(presenter)} alt={presenter.name} className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-3 h-3 text-zinc-400" />
                  )}
                </div>
                <span className="text-xs text-violet-300">{presenter.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-zinc-200/50 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-zinc-200 rounded-xl">
          <div className="w-12 h-12 bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <ListOrdered className="w-6 h-6 text-zinc-500" />
          </div>
          <h3 className="text-white font-medium mb-1">No items yet</h3>
          <p className="text-zinc-500 text-sm mb-4">{canEdit ? 'Start building your rundown' : 'No rundown items'}</p>
          {canEdit && (
            <Button
              onClick={handleAddItem}
              variant="outline"
              className="bg-transparent border-zinc-300 text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900"
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
                <div
                  key={item.id}
                  ref={index === activeItemIndex ? activeItemRef : null}
                >
                  <SortableRundownItem
                    item={item}
                    index={index}
                    timestamp={timestamps[index]}
                    onEdit={canEdit ? () => handleEditItem(item) : undefined}
                    onDelete={canEdit ? () => handleDeleteItem(item.id) : undefined}
                    canEdit={canEdit}
                    isActive={liveMode && index === activeItemIndex}
                    liveEdit={liveEdits[item.id] || null}
                  />
                </div>
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
          sendWsMessage={sendMessage}
        />
      )}

      {/* Member Picker Dialog */}
      <Dialog open={showMemberDialog} onOpenChange={setShowMemberDialog}>
        <DialogContent className="bg-white border-zinc-200 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-zinc-900">Rundown Members</DialogTitle>
            <DialogDescription className="text-zinc-400">Select team members who participate in this rundown</DialogDescription>
          </DialogHeader>
          <Input value={memberSearch} onChange={e => setMemberSearch(e.target.value)} placeholder="Search members..."
            className="bg-zinc-50 border-zinc-200 text-zinc-900 text-sm h-8 mb-2" />
          <div className="max-h-64 overflow-y-auto space-y-1">
            {siteUsers.filter(u => !memberSearch || u.name?.toLowerCase().includes(memberSearch.toLowerCase()) || u.email?.toLowerCase().includes(memberSearch.toLowerCase())).map(u => {
              const isMember = members.some(m => m.id === u.id);
              const isPresenter = presenters.some(p => p.id === u.id);
              return (
                <div key={u.id} onClick={() => toggleMember(u.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${isMember ? 'bg-violet-500/10 border border-violet-500/30' : 'hover:bg-zinc-100 border border-transparent'}`}>
                  <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center text-[10px] font-bold text-zinc-900 overflow-hidden">
                    {getAvatarUrl(u) ? <img src={getAvatarUrl(u)} alt="" className="w-full h-full object-cover" /> : u.name?.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-700 truncate">{u.name}</p>
                    <p className="text-[10px] text-zinc-500 truncate">{u.email}</p>
                  </div>
                  {isPresenter && <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400">Presenter</span>}
                  {isMember && <div className="w-2 h-2 rounded-full bg-violet-500" />}
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RundownEditor;
