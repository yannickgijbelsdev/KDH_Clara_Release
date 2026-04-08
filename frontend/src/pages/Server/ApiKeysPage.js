import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useMainSite } from '../../context/MainSiteContext';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { toast } from 'sonner';
import { Key, Plus, Trash2, Copy, CheckCircle2, Clock, Shield, Eye, EyeOff } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function ApiKeysPage() {
  const { mainSite } = useMainSite();
  const [keys, setKeys] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState(null);
  const [showKey, setShowKey] = useState(false);

  const fetchKeys = useCallback(async () => {
    if (!mainSite) return;
    try {
      const { data } = await axios.get(`${API}/xml-imports/api-keys?main_site_id=${mainSite.id}`);
      setKeys(data);
    } catch { toast.error('Failed to load API keys'); }
  }, [mainSite]);

  useEffect(() => { fetchKeys(); }, [fetchKeys]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    setCreating(true);
    try {
      const { data } = await axios.post(`${API}/xml-imports/api-keys`, {
        name: newKeyName,
        main_site_id: mainSite.id,
      });
      setNewKey(data.api_key);
      setNewKeyName('');
      setShowCreate(false);
      toast.success('API key created');
      fetchKeys();
    } catch { toast.error('Failed to create key'); }
    setCreating(false);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Deactivate this API key?')) return;
    try {
      await axios.delete(`${API}/xml-imports/api-keys/${id}`);
      toast.success('API key deactivated');
      fetchKeys();
    } catch { toast.error('Failed to delete'); }
  };

  const copyKey = () => {
    if (newKey) {
      navigator.clipboard.writeText(newKey);
      toast.success('API key copied to clipboard');
    }
  };

  return (
    <div className="space-y-6" data-testid="api-keys-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">API Keys</h1>
          <p className="text-sm text-zinc-400 mt-1">Manage API keys for external sync agents</p>
        </div>
        <Button onClick={() => { setShowCreate(true); setNewKey(null); }} className="bg-orange-500 hover:bg-orange-600 text-white" data-testid="create-key-btn">
          <Plus className="w-4 h-4 mr-2" />New API Key
        </Button>
      </div>

      {/* New key reveal */}
      {newKey && (
        <div className="bg-orange-500/5 border border-orange-500/20 rounded-xl p-5" data-testid="new-key-reveal">
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-orange-300">New API Key Created</p>
              <p className="text-xs text-zinc-400 mt-1">Copy this key now. It will not be shown again.</p>
              <div className="mt-3 flex items-center gap-2">
                <div className="flex-1 bg-zinc-900 border border-zinc-300 rounded-lg px-3 py-2 font-mono text-sm text-white flex items-center gap-2">
                  {showKey ? newKey : '•'.repeat(40)}
                  <button onClick={() => setShowKey(!showKey)} className="text-zinc-500 hover:text-zinc-600 ml-auto">
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <Button size="sm" onClick={copyKey} className="bg-zinc-100 hover:bg-zinc-200 text-zinc-700" data-testid="copy-key-btn">
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
              <div className="mt-3 bg-white/60 border border-zinc-200 rounded-lg p-3">
                <p className="text-xs text-zinc-500 mb-1">Usage example:</p>
                <code className="text-xs text-zinc-400 font-mono">
                  curl -X POST {process.env.REACT_APP_BACKEND_URL}/api/xml-imports/agent/upload \<br/>
                  &nbsp;&nbsp;-H "Authorization: Bearer {showKey ? newKey : '<API_KEY>'}" \<br/>
                  &nbsp;&nbsp;-F "file=@yourfile.xml"
                </code>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <form onSubmit={handleCreate} className="bg-white/60 border border-zinc-200 rounded-xl p-4 flex items-end gap-3" data-testid="create-key-form">
          <div className="flex-1">
            <Label className="text-zinc-400 text-xs">Key name</Label>
            <Input
              value={newKeyName}
              onChange={e => setNewKeyName(e.target.value)}
              placeholder="e.g. Production Sync Agent"
              className="bg-zinc-50 border-zinc-200 text-zinc-900 mt-1"
              autoFocus
              data-testid="key-name-input"
            />
          </div>
          <Button type="submit" disabled={creating} className="bg-orange-500 hover:bg-orange-600 text-white" data-testid="save-key-btn">
            {creating ? 'Creating...' : 'Create Key'}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setShowCreate(false)} className="text-zinc-400">Cancel</Button>
        </form>
      )}

      {/* Keys list */}
      <div className="bg-white/60 border border-zinc-200 rounded-xl overflow-hidden">
        {keys.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <Key className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
            <p className="text-zinc-500 text-sm">No API keys yet</p>
            <p className="text-zinc-600 text-xs mt-1">Create a key to allow sync agents to upload XML files</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800">
            {keys.map(k => (
              <div key={k.id} className={`flex items-center px-4 py-3 gap-3 ${!k.active ? 'opacity-40' : ''}`} data-testid={`key-${k.id}`}>
                <Key className={`w-4 h-4 flex-shrink-0 ${k.active ? 'text-orange-400' : 'text-zinc-600'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-zinc-700 font-medium">{k.name}</span>
                    {!k.active && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400">Inactive</span>}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs text-zinc-500 font-mono">{k.key_prefix}</span>
                    <span className="text-[10px] text-zinc-600">Created {new Date(k.created_at).toLocaleDateString()}</span>
                    {k.last_used && (
                      <span className="text-[10px] text-zinc-600 flex items-center gap-1">
                        <Clock className="w-3 h-3" />Last used {new Date(k.last_used).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
                {k.active && (
                  <button onClick={() => handleDelete(k.id)} className="p-1.5 rounded hover:bg-red-500/20 text-zinc-500 hover:text-red-400" title="Deactivate">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
