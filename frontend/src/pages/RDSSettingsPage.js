import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { format } from 'date-fns';
import { enUS } from 'date-fns/locale';
import {
  Radio,
  RefreshCw,
  Copy,
  Check,
  ExternalLink,
  Clock,
  AlertCircle,
  CheckCircle,
  XCircle,
  Settings,
  Save,
  Loader2,
  Filter,
  Trash2,
  Plus,
  Music,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const RDSSettingsPage = () => {
  const [settings, setSettings] = useState(null);
  const [endpoints, setEndpoints] = useState(null);
  const [logs, setLogs] = useState([]);
  const [shoutcastLogs, setShoutcastLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState({
    production_base_url: '',
    cache_refresh_interval: 5,
  });
  
  // Shoutcast filters state
  const [mfyFilters, setMfyFilters] = useState([]);
  const [grkFilters, setGrkFilters] = useState([]);
  const [editingFilters, setEditingFilters] = useState(null); // 'mfy' or 'grk'
  const [savingFilters, setSavingFilters] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [settingsRes, endpointsRes, logsRes, shoutcastLogsRes, mfyFiltersRes, grkFiltersRes] = await Promise.all([
        axios.get(`${API}/rds/settings`),
        axios.get(`${API}/rds/endpoints`),
        axios.get(`${API}/rds/logs?limit=20`),
        axios.get(`${API}/rds/shoutcast/logs?limit=50`),
        axios.get(`${API}/rds/shoutcast/filters/mfy`),
        axios.get(`${API}/rds/shoutcast/filters/grk`),
      ]);
      setSettings(settingsRes.data);
      setEndpoints(endpointsRes.data);
      setLogs(logsRes.data);
      setShoutcastLogs(shoutcastLogsRes.data);
      setMfyFilters(mfyFiltersRes.data.filters || []);
      setGrkFilters(grkFiltersRes.data.filters || []);
      setEditData({
        production_base_url: settingsRes.data.production_base_url,
        cache_refresh_interval: settingsRes.data.cache_refresh_interval,
      });
    } catch (error) {
      toast.error('Could not load RDS settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const response = await axios.put(`${API}/rds/settings`, editData);
      setSettings(response.data);
      setEditMode(false);
      toast.success('Settings saved');
      // Refresh endpoints to get new URLs
      const endpointsRes = await axios.get(`${API}/rds/endpoints`);
      setEndpoints(endpointsRes.data);
    } catch (error) {
      toast.error('Could not save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleRefreshCache = async () => {
    setRefreshing(true);
    try {
      const response = await axios.post(`${API}/rds/refresh-cache`);
      toast.success(response.data.message || 'Cache refreshed');
      // Refresh logs
      const logsRes = await axios.get(`${API}/rds/logs?limit=20`);
      setLogs(logsRes.data);
      // Update last refresh time
      const settingsRes = await axios.get(`${API}/rds/settings`);
      setSettings(settingsRes.data);
    } catch (error) {
      toast.error('Could not refresh cache');
    } finally {
      setRefreshing(false);
    }
  };

  // Shoutcast filter handlers
  const handleSaveFilters = async (station) => {
    setSavingFilters(true);
    try {
      const filters = station === 'mfy' ? mfyFilters : grkFilters;
      await axios.put(`${API}/rds/shoutcast/filters/${station}`, { filters });
      toast.success(`Filters saved for ${station.toUpperCase()}`);
      setEditingFilters(null);
    } catch (error) {
      toast.error('Could not save filters');
    } finally {
      setSavingFilters(false);
    }
  };

  const addFilter = (station) => {
    const newFilter = { match: '', replace: '', case_insensitive: true, whole_word: false };
    if (station === 'mfy') {
      setMfyFilters([...mfyFilters, newFilter]);
    } else {
      setGrkFilters([...grkFilters, newFilter]);
    }
  };

  const removeFilter = (station, index) => {
    if (station === 'mfy') {
      setMfyFilters(mfyFilters.filter((_, i) => i !== index));
    } else {
      setGrkFilters(grkFilters.filter((_, i) => i !== index));
    }
  };

  const updateFilter = (station, index, field, value) => {
    if (station === 'mfy') {
      const updated = [...mfyFilters];
      updated[index] = { ...updated[index], [field]: value };
      setMfyFilters(updated);
    } else {
      const updated = [...grkFilters];
      updated[index] = { ...updated[index], [field]: value };
      setGrkFilters(updated);
    }
  };

  const copyToClipboard = (url, name) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(name);
    toast.success('URL copied');
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'no_show':
        return <AlertCircle className="w-4 h-4 text-yellow-500" />;
      default:
        return <Clock className="w-4 h-4 text-zinc-500" />;
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'success':
        return 'Success';
      case 'failed':
        return 'Failed';
      case 'no_show':
        return 'No show';
      default:
        return status;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div data-testid="rds-settings-page" className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-orange-500/20 rounded-lg">
            <Radio className="w-6 h-6 text-orange-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">RDS Settings</h1>
            <p className="text-sm text-zinc-500">MagicRDS and external systems integration</p>
          </div>
        </div>
        <Button
          onClick={handleRefreshCache}
          disabled={refreshing}
          className="gap-2 bg-orange-500 hover:bg-orange-600 text-white"
          data-testid="refresh-cache-btn"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Refreshing...' : 'Refresh Cache'}
        </Button>
      </div>

      {/* Settings Section */}
      <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-orange-400" />
            <h2 className="text-lg font-semibold text-white">Configuration</h2>
          </div>
          {!editMode ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditMode(true)}
              className="gap-2 border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            >
              <Settings className="w-4 h-4" />
              Edit
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditMode(false);
                  setEditData({
                    production_base_url: settings.production_base_url,
                    cache_refresh_interval: settings.cache_refresh_interval,
                  });
                }}
                className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSaveSettings}
                disabled={saving}
                className="gap-2 bg-orange-500 hover:bg-orange-600 text-white"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          )}
        </div>

        {editMode ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-zinc-300">Production Base URL</Label>
              <Input
                value={editData.production_base_url}
                onChange={(e) => setEditData({ ...editData, production_base_url: e.target.value })}
                placeholder="https://clara.koodh.com"
                className="bg-[#27272a] border-zinc-700 text-white font-mono"
              />
              <p className="text-xs text-zinc-500">
                The base URL of your production environment. This is used for the API endpoints.
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-300">Cache Refresh Interval (minutes)</Label>
              <Input
                type="number"
                min="1"
                max="60"
                value={editData.cache_refresh_interval}
                onChange={(e) => setEditData({ ...editData, cache_refresh_interval: parseInt(e.target.value) || 5 })}
                className="bg-[#27272a] border-zinc-700 text-white w-24"
              />
              <p className="text-xs text-zinc-500">
                How often the live show cache is automatically refreshed.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-zinc-500 text-sm mb-1">Production URL</p>
              <p className="text-white font-mono">{settings?.production_base_url || '-'}</p>
            </div>
            <div>
              <p className="text-zinc-500 text-sm mb-1">Cache Interval</p>
              <p className="text-white">Every {settings?.cache_refresh_interval || 5} minutes</p>
            </div>
            <div>
              <p className="text-zinc-500 text-sm mb-1">Last Cache Refresh</p>
              <p className="text-white">
                {settings?.last_cache_refresh
                  ? format(new Date(settings.last_cache_refresh), 'MMM dd yyyy HH:mm:ss', { locale: enUS })
                  : 'Not yet run'}
              </p>
            </div>
          </div>
        )}}
      </div>

      {/* API Endpoints Section */}
      <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <ExternalLink className="w-5 h-5 text-violet-400" />
          <h2 className="text-lg font-semibold text-white">API Endpoints</h2>
        </div>
        <p className="text-zinc-500 text-sm mb-4">
          Copy these URLs to use in MagicRDS or other external systems.
        </p>

        {/* Group endpoints by station */}
        {['mfy', 'grk', 'all'].map((station) => {
          const stationEndpoints = endpoints?.endpoints?.filter(e => e.station === station) || [];
          if (stationEndpoints.length === 0) return null;
          
          const stationName = station === 'mfy' ? 'Radio MFY' : station === 'grk' ? 'Radio GRK' : 'All Stations';
          const stationColor = station === 'mfy' ? 'orange' : station === 'grk' ? 'violet' : 'zinc';
          
          return (
            <div key={station} className="mb-6 last:mb-0">
              <h3 className={`text-sm font-semibold mb-3 ${
                stationColor === 'orange' ? 'text-orange-400' : 
                stationColor === 'violet' ? 'text-violet-400' : 'text-zinc-400'
              }`}>
                {stationName}
              </h3>
              <div className="space-y-2">
                {stationEndpoints.map((endpoint, index) => (
                  <div
                    key={index}
                    className={`bg-[#27272a] rounded-lg p-3 border ${
                      stationColor === 'orange' ? 'border-orange-500/30' : 
                      stationColor === 'violet' ? 'border-violet-500/30' : 'border-zinc-800'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="text-white text-sm font-medium">{endpoint.name.replace(`${station.toUpperCase()} - `, '').replace('Alle Stations - ', '').replace('All Stations - ', '')}</h4>
                          <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full">
                            Public
                          </span>
                        </div>
                        <p className="text-zinc-500 text-xs mb-2">{endpoint.description}</p>
                        <code className={`text-xs bg-black/30 px-2 py-1 rounded font-mono break-all ${
                          stationColor === 'orange' ? 'text-orange-400' : 
                          stationColor === 'violet' ? 'text-violet-400' : 'text-zinc-400'
                        }`}>
                          {endpoint.full_url}
                        </code>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyToClipboard(endpoint.full_url, endpoint.name)}
                        className="shrink-0 gap-1 border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-xs px-2 py-1 h-7"
                      >
                        {copiedUrl === endpoint.name ? (
                          <Check className="w-3 h-3 text-green-500" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Cache Logs Section */}
      <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-5 h-5 text-zinc-400" />
          <h2 className="text-lg font-semibold text-white">Cache Logs</h2>
          <span className="text-xs text-zinc-500 ml-2">Laatste 20</span>
        </div>

        {logs.length === 0 ? (
          <div className="text-center py-8">
            <Clock className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
            <p className="text-zinc-500">No cache logs yet</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {logs.map((log) => (
              <div
                key={log.id}
                className="flex items-start gap-3 p-3 bg-[#27272a] rounded-lg"
              >
                {getStatusIcon(log.status)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-white text-sm font-medium">
                      {getStatusLabel(log.status)}
                    </span>
                    {log.show_title && (
                      <span className="text-zinc-400 text-sm">• {log.show_title}</span>
                    )}
                  </div>
                  <p className="text-zinc-500 text-sm">{log.message}</p>
                  <p className="text-zinc-600 text-xs mt-1">
                    {format(new Date(log.timestamp), 'MMM dd yyyy HH:mm:ss', { locale: enUS })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Shoutcast Filters Section */}
      <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-5 h-5 text-orange-400" />
          <h2 className="text-lg font-semibold text-white">Now Playing Filters</h2>
        </div>
        <p className="text-zinc-500 text-sm mb-4">
          Filter certain texts from the now playing info. If the text matches, it will be replaced.
        </p>

        {/* MFY Filters */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-orange-400">Radio MFY</h3>
            <div className="flex gap-2">
              {editingFilters === 'mfy' ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditingFilters(null)}
                    className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleSaveFilters('mfy')}
                    disabled={savingFilters}
                    className="bg-orange-500 hover:bg-orange-600 text-white text-xs"
                  >
                    <Save className="w-3 h-3 mr-1" />
                    {savingFilters ? 'Saving...' : 'Save'}
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingFilters('mfy')}
                  className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-xs"
                >
                  <Settings className="w-3 h-3 mr-1" />
                  Edit
                </Button>
              )}
            </div>
          </div>
          
          {editingFilters === 'mfy' ? (
            <div className="space-y-2">
              {mfyFilters.map((filter, idx) => (
                <div key={idx} className="flex flex-col gap-2 bg-[#27272a] rounded-lg p-2">
                  <div className="flex gap-2 items-center">
                    <Input
                      value={filter.match}
                      onChange={(e) => updateFilter('mfy', idx, 'match', e.target.value)}
                      placeholder="Text to filter (e.g. ft.)"
                      className="bg-zinc-800 border-zinc-700 text-white text-xs flex-1"
                    />
                    <span className="text-zinc-500 text-xs">→</span>
                    <Input
                      value={filter.replace}
                      onChange={(e) => updateFilter('mfy', idx, 'replace', e.target.value)}
                      placeholder="Replace with (e.g. &)"
                      className="bg-zinc-800 border-zinc-700 text-white text-xs flex-1"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFilter('mfy', idx)}
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/10 p-1 h-7 w-7"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-4 pl-1">
                    <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filter.whole_word || false}
                        onChange={(e) => updateFilter('mfy', idx, 'whole_word', e.target.checked)}
                        className="w-3 h-3 rounded border-zinc-600 bg-zinc-800 text-orange-500 focus:ring-orange-500"
                      />
                      <span>Heel woord</span>
                      <span className="text-zinc-600">(voorkomt "Swift" → "Swi&")</span>
                    </label>
                  </div>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => addFilter('mfy')}
                className="border-dashed border-zinc-700 text-zinc-400 hover:bg-zinc-800 text-xs w-full"
              >
                <Plus className="w-3 h-3 mr-1" />
                Add filter
              </Button>
            </div>
          ) : (
            <div className="text-zinc-400 text-sm">
              {mfyFilters.length === 0 ? (
                <p className="text-zinc-500 italic">No filters set</p>
              ) : (
                <div className="space-y-1">
                  {mfyFilters.map((f, i) => (
                    <div key={i} className="text-xs bg-[#27272a] rounded px-2 py-1 flex items-center gap-1">
                      <span className="text-zinc-400">&ldquo;{f.match}&rdquo;</span>
                      <span className="text-zinc-600 mx-1">→</span>
                      <span className="text-orange-400">{f.replace || '(remove)'}</span>
                      {f.whole_word && <span className="text-zinc-600 ml-1">(heel woord)</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* GRK Filters */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-violet-400">Radio GRK</h3>
            <div className="flex gap-2">
              {editingFilters === 'grk' ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditingFilters(null)}
                    className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleSaveFilters('grk')}
                    disabled={savingFilters}
                    className="bg-violet-500 hover:bg-violet-600 text-white text-xs"
                  >
                    <Save className="w-3 h-3 mr-1" />
                    {savingFilters ? 'Saving...' : 'Save'}
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingFilters('grk')}
                  className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-xs"
                >
                  <Settings className="w-3 h-3 mr-1" />
                  Edit
                </Button>
              )}
            </div>
          </div>
          
          {editingFilters === 'grk' ? (
            <div className="space-y-2">
              {grkFilters.map((filter, idx) => (
                <div key={idx} className="flex flex-col gap-2 bg-[#27272a] rounded-lg p-2">
                  <div className="flex gap-2 items-center">
                    <Input
                      value={filter.match}
                      onChange={(e) => updateFilter('grk', idx, 'match', e.target.value)}
                      placeholder="Text to filter (e.g. ft.)"
                      className="bg-zinc-800 border-zinc-700 text-white text-xs flex-1"
                    />
                    <span className="text-zinc-500 text-xs">→</span>
                    <Input
                      value={filter.replace}
                      onChange={(e) => updateFilter('grk', idx, 'replace', e.target.value)}
                      placeholder="Replace with (e.g. &)"
                      className="bg-zinc-800 border-zinc-700 text-white text-xs flex-1"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFilter('grk', idx)}
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/10 p-1 h-7 w-7"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-4 pl-1">
                    <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filter.whole_word || false}
                        onChange={(e) => updateFilter('grk', idx, 'whole_word', e.target.checked)}
                        className="w-3 h-3 rounded border-zinc-600 bg-zinc-800 text-violet-500 focus:ring-violet-500"
                      />
                      <span>Heel woord</span>
                      <span className="text-zinc-600">(voorkomt "Swift" → "Swi&")</span>
                    </label>
                  </div>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => addFilter('grk')}
                className="border-dashed border-zinc-700 text-zinc-400 hover:bg-zinc-800 text-xs w-full"
              >
                <Plus className="w-3 h-3 mr-1" />
                Add filter
              </Button>
            </div>
          ) : (
            <div className="text-zinc-400 text-sm">
              {grkFilters.length === 0 ? (
                <p className="text-zinc-500 italic">No filters set</p>
              ) : (
                <div className="space-y-1">
                  {grkFilters.map((f, i) => (
                    <div key={i} className="text-xs bg-[#27272a] rounded px-2 py-1 flex items-center gap-1">
                      <span className="text-zinc-400">&ldquo;{f.match}&rdquo;</span>
                      <span className="text-zinc-600 mx-1">→</span>
                      <span className="text-violet-400">{f.replace || '(remove)'}</span>
                      {f.whole_word && <span className="text-zinc-600 ml-1">(heel woord)</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Shoutcast Logs Section */}
      <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Music className="w-5 h-5 text-green-400" />
          <h2 className="text-lg font-semibold text-white">Shoutcast Logs</h2>
          <span className="text-xs text-zinc-500 ml-2">Last 50 (every 10 sec)</span>
        </div>

        {shoutcastLogs.length === 0 ? (
          <div className="text-center py-8">
            <Music className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
            <p className="text-zinc-500">No shoutcast logs yet</p>
          </div>
        ) : (
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {shoutcastLogs.map((log) => (
              <div
                key={log.id}
                className={`flex items-center gap-3 p-2 rounded text-xs ${
                  log.station === 'mfy' ? 'bg-orange-500/5' : 'bg-violet-500/5'
                }`}
              >
                <span className={`font-mono font-bold ${
                  log.station === 'mfy' ? 'text-orange-400' : 'text-violet-400'
                }`}>
                  {log.station.toUpperCase()}
                </span>
                <span className="text-zinc-400 truncate flex-1">
                  {log.song_title || <span className="italic text-zinc-600">(filtered)</span>}
                </span>
                <span className="text-zinc-600">
                  {log.current_listeners} listeners
                </span>
                <span className="text-zinc-700 text-[10px]">
                  {format(new Date(log.timestamp), 'HH:mm:ss', { locale: enUS })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default RDSSettingsPage;
