import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { format, parseISO } from 'date-fns';
import { nl } from 'date-fns/locale';
import {
  Radio,
  Plus,
  Trash2,
  GripVertical,
  Play,
  Pause,
  Save,
  Copy,
  Check,
  Clock,
  Music,
  Mic,
  Type,
  RefreshCw,
  Loader2,
  ArrowUp,
  ArrowDown,
  Calendar,
  ToggleLeft,
  ToggleRight,
  CalendarClock,
  Repeat,
  Volume2,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { toast } from 'sonner';
import RDSOutputManager from '../components/rds/RDSOutputManager';
import { Users } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Scheduled Texts Manager Component - Shows scheduled texts with toggle functionality
const ScheduledTextsManager = ({ station, stationName, color }) => {
  const navigate = useNavigate();
  const [scheduledTexts, setScheduledTexts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(null);

  const colorClasses = {
    orange: {
      border: 'border-orange-500/30',
      bg: 'bg-orange-500/10',
      text: 'text-orange-400',
    },
    violet: {
      border: 'border-violet-500/30',
      bg: 'bg-violet-500/10',
      text: 'text-violet-400',
    }
  };
  const colors = colorClasses[color] || colorClasses.orange;

  const fetchScheduledTexts = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/rds-builder/scheduled-texts/${station}`);
      setScheduledTexts(response.data);
    } catch (error) {
      console.error('Error fetching scheduled texts:', error);
    } finally {
      setLoading(false);
    }
  }, [station]);

  useEffect(() => {
    fetchScheduledTexts();
    // Refresh every 10 seconds
    const interval = setInterval(fetchScheduledTexts, 10000);
    return () => clearInterval(interval);
  }, [fetchScheduledTexts]);

  const handleToggle = async (text, newEnabled) => {
    setToggling(text.id);
    try {
      const targetStation = text.station === 'both' ? 'mfy' : text.station;
      await axios.put(`${API}/rds-builder/scheduled-texts/${targetStation}/${text.id}`, {
        enabled: newEnabled
      });
      toast.success(newEnabled ? 'Scheduled text enabled' : 'Scheduled text disabled');
      fetchScheduledTexts();
    } catch (error) {
      toast.error('Could not update scheduled text');
    } finally {
      setToggling(null);
    }
  };

  const getRecurrenceLabel = (type) => {
    switch (type) {
      case 'hourly': return 'Hourly';
      case 'daily': return 'Daily';
      case 'weekly': return 'Weekly';
      case 'monthly': return 'Monthly';
      default: return 'One-time';
    }
  };

  const formatDateTime = (dt) => {
    try {
      const date = parseISO(dt);
      return format(date, 'dd/MM/yyyy HH:mm');
    } catch {
      return dt;
    }
  };

  if (loading) {
    return (
      <div className={`bg-[#18181b] border ${colors.border} rounded-xl p-6`}>
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-[#18181b] border ${colors.border} rounded-xl p-6`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${colors.bg}`}>
            <CalendarClock className={`w-5 h-5 ${colors.text}`} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">{stationName} Scheduled Texts</h3>
            <p className="text-xs text-zinc-500">Scheduled custom texts (priority over sequence items)</p>
          </div>
        </div>
        <Button
          onClick={() => navigate('/rds-scheduler')}
          variant="outline"
          size="sm"
          className="border-zinc-700 text-zinc-300 hover:text-white"
        >
          <Calendar className="w-4 h-4 mr-2" />
          Scheduler
        </Button>
      </div>

      {/* Scheduled Texts List */}
      {scheduledTexts.length === 0 ? (
        <div className="text-center py-6 text-zinc-500">
          <CalendarClock className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No scheduled texts</p>
          <p className="text-xs">Use the Scheduler to create timed custom texts</p>
        </div>
      ) : (
        <div className="space-y-2">
          {scheduledTexts.map((text) => (
            <div
              key={text.id}
              className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                text.enabled 
                  ? 'bg-zinc-800/50 border-zinc-700' 
                  : 'bg-zinc-900/50 border-zinc-800 opacity-60'
              }`}
            >
              {/* Toggle Switch */}
              <Switch
                checked={text.enabled}
                onCheckedChange={(checked) => handleToggle(text, checked)}
                disabled={toggling === text.id}
                className="data-[state=checked]:bg-green-500"
              />

              {/* Recurrence indicator */}
              <div className={`p-1.5 rounded ${text.recurrence_type !== 'none' ? 'bg-violet-500/20' : 'bg-zinc-700'}`}>
                {text.recurrence_type !== 'none' ? (
                  <Repeat className="w-3.5 h-3.5 text-violet-400" />
                ) : (
                  <Clock className="w-3.5 h-3.5 text-zinc-400" />
                )}
              </div>

              {/* Text content */}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate font-medium">{text.text}</p>
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <span>{formatDateTime(text.start_datetime)}</span>
                  <span>•</span>
                  <span>{getRecurrenceLabel(text.recurrence_type)}</span>
                  {!text.recurrence_end_date && text.recurrence_type !== 'none' && (
                    <>
                      <span>•</span>
                      <span className="text-green-400">∞ Infinite</span>
                    </>
                  )}
                  {text.station === 'both' && (
                    <>
                      <span>•</span>
                      <span className="text-blue-400">Both stations</span>
                    </>
                  )}
                </div>
              </div>

              {/* Duration badge */}
              <div className="text-xs text-zinc-500 bg-zinc-800 px-2 py-1 rounded">
                {text.duration_type === 'fixed' 
                  ? `${text.duration_minutes || 5} min` 
                  : 'Until next'
                }
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info note */}
      <div className="mt-4 pt-4 border-t border-zinc-800">
        <p className="text-xs text-zinc-500">
          <strong className="text-zinc-400">Priority:</strong> Shows &gt; Scheduled texts &gt; Sequence items
        </p>
      </div>
    </div>
  );
};

const ITEM_TYPES = [
  { value: 'show_name', label: 'Show Name', icon: Mic, description: 'Shows the name of the current live show' },
  { value: 'presenter_name', label: 'Presenter', icon: Users, description: 'Shows the presenter(s) of the current live show' },
  { value: 'now_playing', label: 'Now Playing', icon: Music, description: 'Shows the current track from the stream' },
  { value: 'custom_text', label: 'Custom Text', icon: Type, description: 'Shows a custom text of your choice' },
];

// Sequence Item Component
const SequenceItem = ({ item, index, onUpdate, onDelete, onMoveUp, onMoveDown, isFirst, isLast }) => {
  const [localContent, setLocalContent] = useState(item.content || '');
  const typeConfig = ITEM_TYPES.find(t => t.value === item.type) || ITEM_TYPES[0];
  const TypeIcon = typeConfig.icon;

  // Sync local state when item changes from parent
  useEffect(() => {
    setLocalContent(item.content || '');
  }, [item.id]); // Only reset when item ID changes, not content

  const handleContentChange = (e) => {
    const newContent = e.target.value;
    setLocalContent(newContent);
  };

  const handleContentBlur = () => {
    // Only update parent when user finishes typing (on blur)
    if (localContent !== (item.content || '')) {
      onUpdate({ ...item, content: localContent });
    }
  };

  return (
    <div className="bg-[#27272a] rounded-lg p-4 border border-zinc-700">
      <div className="flex items-center gap-3">
        {/* Drag handle / Move buttons */}
        <div className="flex flex-col gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onMoveUp}
            disabled={isFirst}
            className="h-6 w-6 p-0 text-zinc-500 hover:text-white disabled:opacity-30"
          >
            <ArrowUp className="w-3 h-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onMoveDown}
            disabled={isLast}
            className="h-6 w-6 p-0 text-zinc-500 hover:text-white disabled:opacity-30"
          >
            <ArrowDown className="w-3 h-3" />
          </Button>
        </div>

        {/* Item number */}
        <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 text-sm font-mono">
          {index + 1}
        </div>

        {/* Type icon */}
        <div className="p-2 bg-zinc-800 rounded-lg">
          <TypeIcon className="w-4 h-4 text-zinc-400" />
        </div>

        {/* Type selector */}
        <select
          value={item.type}
          onChange={(e) => onUpdate({ ...item, type: e.target.value })}
          className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm flex-shrink-0"
        >
          {ITEM_TYPES.map(type => (
            <option key={type.value} value={type.value}>{type.label}</option>
          ))}
        </select>

        {/* Custom text input (only for custom_text type) */}
        {item.type === 'custom_text' && (
          <input
            type="text"
            value={localContent}
            onChange={handleContentChange}
            onBlur={handleContentBlur}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleContentBlur();
              }
            }}
            placeholder="Enter text..."
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white flex-1 focus:outline-none focus:ring-2 focus:ring-orange-500"
            data-testid={`custom-text-input-${index}`}
          />
        )}

        {/* Description for non-custom types */}
        {item.type !== 'custom_text' && (
          <span className="text-zinc-500 text-sm flex-1">{typeConfig.description}</span>
        )}

        {/* Duration */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <Clock className="w-4 h-4 text-zinc-500" />
          <Input
            type="number"
            min="1"
            max="60"
            value={item.duration}
            onChange={(e) => onUpdate({ ...item, duration: parseInt(e.target.value) || 5 })}
            className="bg-zinc-800 border-zinc-700 text-white w-16 text-center"
          />
          <span className="text-zinc-500 text-sm">sec</span>
        </div>

        {/* Delete button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};

// Station Builder Component
const StationBuilder = ({ station, stationName, color }) => {
  const [sequence, setSequence] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const colorClasses = {
    orange: {
      border: 'border-orange-500/30',
      bg: 'bg-orange-500/10',
      text: 'text-orange-400',
      button: 'bg-orange-500 hover:bg-orange-600'
    },
    violet: {
      border: 'border-violet-500/30',
      bg: 'bg-violet-500/10',
      text: 'text-violet-400',
      button: 'bg-violet-500 hover:bg-violet-600'
    }
  };
  const colors = colorClasses[color] || colorClasses.orange;

  const fetchData = useCallback(async () => {
    try {
      const [seqRes, statusRes] = await Promise.all([
        axios.get(`${API}/rds-builder/sequence/${station}`),
        axios.get(`${API}/rds-builder/status/${station}`)
      ]);
      setSequence(seqRes.data);
      setStatus(statusRes.data);
    } catch (error) {
      toast.error(`Could not load data for ${stationName}`);
    } finally {
      setLoading(false);
    }
  }, [station, stationName]);

  useEffect(() => {
    fetchData();
    // Refresh status every 2 seconds
    const interval = setInterval(async () => {
      try {
        const statusRes = await axios.get(`${API}/rds-builder/status/${station}`);
        setStatus(statusRes.data);
      } catch (e) {
        // Ignore errors during polling
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [fetchData, station]);

  const handleSave = async () => {
    if (!sequence) return;
    setSaving(true);
    try {
      await axios.put(`${API}/rds-builder/sequence/${station}`, {
        station,
        items: sequence.items,
        enabled: sequence.enabled,
        loop: sequence.loop
      });
      toast.success(`Sequence saved for ${stationName}`);
    } catch (error) {
      toast.error('Could not save sequence');
    } finally {
      setSaving(false);
    }
  };

  const addItem = () => {
    if (!sequence) return;
    const newItem = {
      id: `item-${Date.now()}`,
      type: 'custom_text',
      content: '',
      duration: 5
    };
    setSequence({
      ...sequence,
      items: [...sequence.items, newItem]
    });
  };

  const updateItem = (index, updatedItem) => {
    if (!sequence) return;
    const newItems = [...sequence.items];
    newItems[index] = updatedItem;
    setSequence({ ...sequence, items: newItems });
  };

  const deleteItem = (index) => {
    if (!sequence) return;
    setSequence({
      ...sequence,
      items: sequence.items.filter((_, i) => i !== index)
    });
  };

  const moveItem = (index, direction) => {
    if (!sequence) return;
    const newItems = [...sequence.items];
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= newItems.length) return;
    [newItems[index], newItems[newIndex]] = [newItems[newIndex], newItems[index]];
    setSequence({ ...sequence, items: newItems });
  };

  const copyOutputUrl = () => {
    const url = `https://clara.koodh.com/api/rds-builder/output/${station}.txt`;
    navigator.clipboard.writeText(url);
    setCopiedUrl(true);
    toast.success('URL copied');
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  if (loading) {
    return (
      <div className={`bg-[#18181b] border ${colors.border} rounded-xl p-6`}>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-[#18181b] border ${colors.border} rounded-xl p-6`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${colors.bg}`}>
            <Radio className={`w-5 h-5 ${colors.text}`} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">{stationName}</h3>
            <p className="text-xs text-zinc-500">RDS Text Sequence</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Enable/Disable toggle */}
          <div className="flex items-center gap-2">
            <Label className="text-zinc-400 text-sm">Active</Label>
            <Switch
              checked={sequence?.enabled || false}
              onCheckedChange={(checked) => setSequence({ ...sequence, enabled: checked })}
            />
          </div>

          {/* Save button */}
          <Button
            onClick={handleSave}
            disabled={saving}
            className={`${colors.button} text-white`}
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            <span className="ml-2">{saving ? 'Saving...' : 'Save'}</span>
          </Button>
        </div>
      </div>

      {/* Current output preview */}
      <div className={`${colors.bg} rounded-lg p-4 mb-6`}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-zinc-400 text-sm">Current Output:</span>
          <Button
            variant="outline"
            size="sm"
            onClick={copyOutputUrl}
            className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-xs"
          >
            {copiedUrl ? (
              <Check className="w-3 h-3 mr-1 text-green-500" />
            ) : (
              <Copy className="w-3 h-3 mr-1" />
            )}
            Copy URL
          </Button>
        </div>
        <div className={`text-xl font-semibold ${colors.text} min-h-[1.75rem]`}>
          {status?.current_text || <span className="text-zinc-600 italic">No output</span>}
        </div>
        {status?.enabled && (
          <div className="flex items-center gap-4 mt-2 text-xs text-zinc-500">
            <span>Type: {status?.current_item_type || '-'}</span>
            <span>Index: {(status?.current_index || 0) + 1} / {sequence?.items?.length || 0}</span>
          </div>
        )}
      </div>

      {/* Output URL */}
      <div className="bg-[#27272a] rounded-lg p-3 mb-6">
        <Label className="text-zinc-400 text-xs mb-1 block">MagicRDS URL:</Label>
        <code className={`text-sm ${colors.text} break-all`}>
          https://clara.koodh.com/api/rds-builder/output/{station}.txt
        </code>
      </div>

      {/* Sequence items */}
      <div className="space-y-3 mb-4">
        {sequence?.items?.map((item, index) => (
          <SequenceItem
            key={item.id}
            item={item}
            index={index}
            onUpdate={(updated) => updateItem(index, updated)}
            onDelete={() => deleteItem(index)}
            onMoveUp={() => moveItem(index, -1)}
            onMoveDown={() => moveItem(index, 1)}
            isFirst={index === 0}
            isLast={index === sequence.items.length - 1}
          />
        ))}
      </div>

      {/* Add item button */}
      <Button
        variant="outline"
        onClick={addItem}
        className="w-full border-dashed border-zinc-700 text-zinc-400 hover:bg-zinc-800"
      >
        <Plus className="w-4 h-4 mr-2" />
        Add Item
      </Button>

      {/* Loop toggle */}
      <div className="flex items-center gap-2 mt-4 pt-4 border-t border-zinc-800">
        <Switch
          checked={sequence?.loop || false}
          onCheckedChange={(checked) => setSequence({ ...sequence, loop: checked })}
        />
        <Label className="text-zinc-400 text-sm">Repeat (loop)</Label>
      </div>
    </div>
  );
};

// Main Page Component
const RDSBuilderPage = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('outputs');

  return (
    <div data-testid="rds-builder-page" className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-orange-500/20 to-violet-500/20 rounded-lg">
            <Radio className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">RDS Builder</h1>
            <p className="text-sm text-zinc-500">Configure RDS text outputs for MagicRDS</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => navigate('/audio-triggers')}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            <Volume2 className="w-4 h-4 mr-2" />
            Audio Triggers
          </Button>
          <Button
            onClick={() => navigate('/rds-scheduler')}
            className="bg-violet-500 hover:bg-violet-600 text-white"
          >
            <Calendar className="w-4 h-4 mr-2" />
            Custom Text Scheduler
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('outputs')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'outputs'
              ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
              : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:text-white'
          }`}
        >
          📡 Multi-Output (Streaming, DAB, FM)
        </button>
        <button
          onClick={() => setActiveTab('legacy')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'legacy'
              ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
              : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:text-white'
          }`}
        >
          🔄 Sequence Builder (Legacy)
        </button>
      </div>

      {activeTab === 'outputs' ? (
        <>
          {/* Info banner */}
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 mb-6">
            <p className="text-blue-400 text-sm">
              <strong>Multi-Output Mode:</strong> Create different outputs for Streaming, DAB+, FM, etc. 
              For each output, you can select which items to show (Show Name, Now Playing, Custom Text) with custom durations.
            </p>
          </div>

          {/* Scheduled Texts Section */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
            <ScheduledTextsManager station="mfy" stationName="Radio MFY" color="orange" />
            <ScheduledTextsManager station="grk" stationName="Radio GRK" color="violet" />
          </div>

          {/* Output Managers */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <RDSOutputManager station="mfy" stationName="Radio MFY" color="orange" />
            <RDSOutputManager station="grk" stationName="Radio GRK" color="violet" />
          </div>
        </>
      ) : (
        <>
          {/* Info banner */}
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 mb-6">
            <p className="text-yellow-400 text-sm">
              <strong>Legacy Sequence Builder:</strong> The old way to create RDS sequences. 
              Use Multi-Output for more flexibility with different outputs.
            </p>
          </div>

          {/* Station Builders */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <StationBuilder station="mfy" stationName="Radio MFY" color="orange" />
            <StationBuilder station="grk" stationName="Radio GRK" color="violet" />
          </div>
        </>
      )}
    </div>
  );
};

export default RDSBuilderPage;
