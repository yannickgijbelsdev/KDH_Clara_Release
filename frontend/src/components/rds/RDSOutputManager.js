import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Radio,
  Plus,
  Trash2,
  Save,
  Copy,
  Check,
  Clock,
  Music,
  Mic,
  Type,
  Loader2,
  Settings,
  Link,
  ToggleLeft,
  ToggleRight,
  Pencil,
  X,
  Users,
  Volume2,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ITEM_TYPES = [
  { value: 'show_name', label: 'Show Name', icon: Mic, description: 'Name of the current live show (or default)' },
  { value: 'presenter_name', label: 'Presenter', icon: Users, description: 'Presenter(s) of the current live show' },
  { value: 'now_playing', label: 'Now Playing', icon: Music, description: 'Current track from the stream' },
  { value: 'custom_text', label: 'Custom Text', icon: Type, description: 'Custom text of your choice' },
];

// Output Item Row Component
const OutputItemRow = ({ item, index, onUpdate }) => {
  const [localContent, setLocalContent] = useState(item.content || '');
  const typeConfig = ITEM_TYPES.find(t => t.value === item.type) || ITEM_TYPES[0];
  const TypeIcon = typeConfig.icon;

  useEffect(() => {
    setLocalContent(item.content || '');
  }, [item.content]);

  const handleContentBlur = () => {
    if (localContent !== (item.content || '')) {
      onUpdate({ ...item, content: localContent });
    }
  };

  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg border ${item.enabled ? 'bg-zinc-800/50 border-zinc-700' : 'bg-zinc-900/50 border-zinc-800 opacity-60'}`}>
      {/* Enable/Disable checkbox */}
      <Switch
        checked={item.enabled}
        onCheckedChange={(checked) => onUpdate({ ...item, enabled: checked })}
        className="data-[state=checked]:bg-orange-500"
      />

      {/* Type icon */}
      <div className={`p-2 rounded-lg ${item.enabled ? 'bg-zinc-700' : 'bg-zinc-800'}`}>
        <TypeIcon className="w-4 h-4 text-zinc-400" />
      </div>

      {/* Type label */}
      <span className="text-sm font-medium text-white w-28">{typeConfig.label}</span>

      {/* Content input for custom_text */}
      {item.type === 'custom_text' ? (
        <input
          type="text"
          value={localContent}
          onChange={(e) => setLocalContent(e.target.value)}
          onBlur={handleContentBlur}
          onKeyDown={(e) => e.key === 'Enter' && handleContentBlur()}
          placeholder="Enter text..."
          disabled={!item.enabled}
          className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-white text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50"
        />
      ) : (
        <span className="text-zinc-500 text-sm flex-1">{typeConfig.description}</span>
      )}

      {/* Duration */}
      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4 text-zinc-500" />
        <Input
          type="number"
          min="1"
          max="60"
          value={item.duration}
          onChange={(e) => onUpdate({ ...item, duration: parseInt(e.target.value) || 5 })}
          disabled={!item.enabled}
          className="bg-zinc-800 border-zinc-700 text-white w-16 text-center h-8 text-sm"
        />
        <span className="text-zinc-500 text-xs">sec</span>
      </div>
    </div>
  );
};

// Create/Edit Output Dialog
const OutputDialog = ({ isOpen, onClose, onSave, output, station }) => {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [loop, setLoop] = useState(true);
  const [items, setItems] = useState([
    { type: 'show_name', enabled: true, content: null, duration: 10 },
    { type: 'presenter_name', enabled: false, content: null, duration: 10 },
    { type: 'now_playing', enabled: true, content: null, duration: 5 },
    { type: 'custom_text', enabled: false, content: '', duration: 5 },
  ]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (output) {
      setName(output.name || '');
      setSlug(output.slug || '');
      setEnabled(output.enabled ?? true);
      setLoop(output.loop ?? true);
      // Ensure all item types exist
      const existingItems = output.items || [];
      const allItems = ITEM_TYPES.map(type => {
        const existing = existingItems.find(i => i.type === type.value);
        return existing || { type: type.value, enabled: false, content: null, duration: 5 };
      });
      setItems(allItems);
    } else {
      setName('');
      setSlug('');
      setEnabled(true);
      setLoop(true);
      setItems([
        { type: 'show_name', enabled: true, content: null, duration: 10 },
        { type: 'presenter_name', enabled: false, content: null, duration: 10 },
        { type: 'now_playing', enabled: true, content: null, duration: 5 },
        { type: 'custom_text', enabled: false, content: '', duration: 5 },
      ]);
    }
  }, [output, isOpen]);

  const handleNameChange = (e) => {
    const newName = e.target.value;
    setName(newName);
    // Auto-generate slug from name if creating new
    if (!output) {
      const newSlug = newName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      setSlug(newSlug);
    }
  };

  const updateItem = (index, updatedItem) => {
    const newItems = [...items];
    newItems[index] = updatedItem;
    setItems(newItems);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Please enter a name');
      return;
    }
    if (!slug.trim()) {
      toast.error('Please enter a slug');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        slug: slug.trim(),
        station,
        items,
        enabled,
        loop,
      });
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Could not save output');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#18181b] border border-zinc-700 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h3 className="text-lg font-semibold text-white">
            {output ? 'Edit Output' : 'New Output'}
          </h3>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Name & Slug */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-zinc-400 text-sm">Name</Label>
              <Input
                value={name}
                onChange={handleNameChange}
                placeholder="e.g. Streaming, DAB+, FM"
                className="bg-zinc-800 border-zinc-700 text-white mt-1"
              />
            </div>
            <div>
              <Label className="text-zinc-400 text-sm">Slug (URL)</Label>
              <Input
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="e.g. streaming, dab, fm"
                disabled={!!output}
                className="bg-zinc-800 border-zinc-700 text-white mt-1 font-mono"
              />
            </div>
          </div>

          {/* Preview URL */}
          <div className="bg-zinc-900 rounded-lg p-3">
            <Label className="text-zinc-500 text-xs">API URL for MagicRDS:</Label>
            <code className="text-orange-400 text-sm block mt-1">
              https://clara.koodh.com/api/rds-builder/output/{station}/{slug || 'slug'}.txt
            </code>
          </div>

          {/* Items Configuration */}
          <div>
            <Label className="text-zinc-400 text-sm mb-2 block">Items (check what you want to show)</Label>
            <div className="space-y-2">
              {items.map((item, index) => (
                <OutputItemRow
                  key={item.type}
                  item={item}
                  index={index}
                  onUpdate={(updated) => updateItem(index, updated)}
                />
              ))}
            </div>
          </div>

          {/* Options */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Switch
                checked={enabled}
                onCheckedChange={setEnabled}
                className="data-[state=checked]:bg-green-500"
              />
              <Label className="text-zinc-400 text-sm">Output active</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={loop}
                onCheckedChange={setLoop}
                className="data-[state=checked]:bg-blue-500"
              />
              <Label className="text-zinc-400 text-sm">Repeat (loop)</Label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t border-zinc-800">
          <Button variant="outline" onClick={onClose} className="border-zinc-700 text-zinc-300">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} className="bg-orange-500 hover:bg-orange-600 text-white">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Save
          </Button>
        </div>
      </div>
    </div>
  );
};

// Output Card Component
const OutputCard = ({ output, station, onEdit, onDelete, onRefresh }) => {
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const copyUrl = () => {
    const url = `https://clara.koodh.com/api/rds-builder/output/${station}/${output.slug}.txt`;
    navigator.clipboard.writeText(url);
    setCopiedUrl(true);
    toast.success('URL copied');
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const handleDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete '${output.name}'?`)) return;
    
    setDeleting(true);
    try {
      await axios.delete(`${API}/rds-builder/outputs/${station}/${output.slug}`);
      toast.success('Output deleted');
      onRefresh();
    } catch (error) {
      toast.error('Could not delete output');
    } finally {
      setDeleting(false);
    }
  };

  const enabledItemCount = output.items?.filter(i => i.enabled).length || 0;

  return (
    <div className={`bg-zinc-800/50 border rounded-lg p-4 ${output.enabled ? 'border-zinc-700' : 'border-zinc-800 opacity-60'}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${output.enabled ? 'bg-green-500' : 'bg-zinc-600'}`} />
          <h4 className="font-semibold text-white">{output.name}</h4>
          <span className="text-xs text-zinc-500 font-mono">/{output.slug}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => onEdit(output)} className="text-zinc-400 hover:text-white h-8 w-8 p-0">
            <Pencil className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={handleDelete} disabled={deleting} className="text-red-400 hover:text-red-300 h-8 w-8 p-0">
            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* Current output preview */}
      <div className="bg-zinc-900 rounded-lg p-3 mb-3">
        <span className="text-zinc-500 text-xs block mb-1">Current output:</span>
        <span className="text-orange-400 font-medium">
          {output.current_text || <span className="text-zinc-600 italic">No output</span>}
        </span>
      </div>

      {/* Enabled items summary */}
      <div className="flex items-center gap-2 mb-3 text-xs text-zinc-500">
        <span>{enabledItemCount} item{enabledItemCount !== 1 ? 's' : ''} active:</span>
        <div className="flex gap-1">
          {output.items?.filter(i => i.enabled).map(item => {
            const Icon = ITEM_TYPES.find(t => t.value === item.type)?.icon || Type;
            return <Icon key={item.type} className="w-3.5 h-3.5" />;
          })}
        </div>
      </div>

      {/* URL */}
      <div className="flex items-center justify-between bg-zinc-900 rounded px-2 py-1.5">
        <code className="text-xs text-zinc-400 truncate flex-1">
          /output/{station}/{output.slug}.txt
        </code>
        <Button variant="ghost" size="sm" onClick={copyUrl} className="h-6 px-2 text-zinc-400 hover:text-white">
          {copiedUrl ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
        </Button>
      </div>
    </div>
  );
};

// Main RDS Output Manager Component
const RDSOutputManager = ({ station, stationName, color }) => {
  const [outputs, setOutputs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingOutput, setEditingOutput] = useState(null);

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

  const fetchOutputs = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/rds-builder/outputs/${station}`);
      setOutputs(response.data);
    } catch (error) {
      console.error('Error fetching outputs:', error);
    } finally {
      setLoading(false);
    }
  }, [station]);

  useEffect(() => {
    fetchOutputs();
    // Refresh every 5 seconds
    const interval = setInterval(fetchOutputs, 5000);
    return () => clearInterval(interval);
  }, [fetchOutputs]);

  const handleCreate = () => {
    setEditingOutput(null);
    setDialogOpen(true);
  };

  const handleEdit = (output) => {
    setEditingOutput(output);
    setDialogOpen(true);
  };

  const handleSave = async (data) => {
    if (editingOutput) {
      await axios.put(`${API}/rds-builder/outputs/${station}/${editingOutput.slug}`, data);
      toast.success('Output updated');
    } else {
      await axios.post(`${API}/rds-builder/outputs/${station}`, data);
      toast.success('Output created');
    }
    fetchOutputs();
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
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${colors.bg}`}>
            <Settings className={`w-5 h-5 ${colors.text}`} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">{stationName} Outputs</h3>
            <p className="text-xs text-zinc-500">Configure multiple outputs for Streaming, DAB, FM, etc.</p>
          </div>
        </div>
        <Button onClick={handleCreate} className={`${colors.button} text-white`}>
          <Plus className="w-4 h-4 mr-2" />
          New Output
        </Button>
      </div>

      {/* Outputs Grid */}
      {outputs.length === 0 ? (
        <div className="text-center py-8 text-zinc-500">
          <Link className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p>No outputs configured yet</p>
          <p className="text-sm">Create an output for Streaming, DAB, FM, etc.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {outputs.map(output => (
            <OutputCard
              key={output.id}
              output={output}
              station={station}
              onEdit={handleEdit}
              onDelete={() => {}}
              onRefresh={fetchOutputs}
            />
          ))}
        </div>
      )}

      {/* Dialog */}
      <OutputDialog
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
        output={editingOutput}
        station={station}
      />
    </div>
  );
};

export default RDSOutputManager;
