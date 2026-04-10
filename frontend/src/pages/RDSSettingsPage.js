import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { formatInTimeZone } from 'date-fns-tz';
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
  const { mainSiteSlug } = useParams();
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
  
  // Dynamic stations
  const [stations, setStations] = useState([]);

  // Shoutcast filters state - dynamic per station
  const [stationFilters, setStationFilters] = useState({});
  const [editingFilters, setEditingFilters] = useState(null);
  const [savingFilters, setSavingFilters] = useState(false);
  
  // Stale config state
  const [staleConfig, setStaleConfig] = useState(null);
  const [savingStale, setSavingStale] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const authHeaders = { Authorization: `Bearer ${token}` };

      // First get main site ID and stations
      let fetchedStations = [];
      try {
        const siteRes = await fetch(`${API}/main-sites/by-slug/${mainSiteSlug}`, { headers: authHeaders });
        if (siteRes.ok) {
          const siteData = await siteRes.json();
          const stRes = await fetch(`${API}/rds-stations/${siteData.id}`, { headers: authHeaders });
          if (stRes.ok) {
            const stData = await stRes.json();
            fetchedStations = stData.stations || [];
          }
        }
      } catch (e) { console.error('Station fetch error:', e); }
      setStations(fetchedStations);

      // Fetch filter data for each station
      const filterPromises = fetchedStations.map(st =>
        axios.get(`${API}/rds/shoutcast/filters/${st.code}`).catch(() => ({ data: { filters: [] } }))
      );

      const [settingsRes, endpointsRes, logsRes, shoutcastLogsRes, staleRes, ...filterResults] = await Promise.all([
        axios.get(`${API}/rds/settings`),
        axios.get(`${API}/rds/endpoints`),
        axios.get(`${API}/rds/logs?limit=20`),
        axios.get(`${API}/rds/shoutcast/logs?limit=50`),
        axios.get(`${API}/rds-builder/stale-config`).catch(() => ({ data: null })),
        ...filterPromises,
      ]);

      setSettings(settingsRes.data);
      setEndpoints(endpointsRes.data);
      setLogs(logsRes.data);
      setShoutcastLogs(shoutcastLogsRes.data);
      if (staleRes.data) setStaleConfig(staleRes.data);
      setEditData({
        production_base_url: settingsRes.data.production_base_url,
        cache_refresh_interval: settingsRes.data.cache_refresh_interval,
      });

      // Build filter state map
      const filtersMap = {};
      fetchedStations.forEach((st, i) => {
        filtersMap[st.code] = filterResults[i]?.data?.filters || [];
      });
      setStationFilters(filtersMap);
    } catch (error) {
      toast.error('Could not load RDS settings');
    } finally {
      setLoading(false);
    }
  }, [mainSiteSlug]);

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

  const handleSaveStaleConfig = async () => {
    setSavingStale(true);
    try {
      const res = await axios.put(`${API}/rds-builder/stale-config`, staleConfig);
      setStaleConfig(res.data);
      toast.success('Stale timeout settings saved');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Could not save stale config');
    } finally {
      setSavingStale(false);
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
      const filters = stationFilters[station] || [];
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
    setStationFilters(prev => ({
      ...prev,
      [station]: [...(prev[station] || []), newFilter],
    }));
  };

  const removeFilter = (station, index) => {
    setStationFilters(prev => ({
      ...prev,
      [station]: (prev[station] || []).filter((_, i) => i !== index),
    }));
  };

  const updateFilter = (station, index, field, value) => {
    setStationFilters(prev => {
      const updated = [...(prev[station] || [])];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, [station]: updated };
    });
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
    <div data-testid="rds-settings-page">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-orange-500/20 rounded-lg">
            <Radio className="w-6 h-6 text-orange-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">RDS Settings</h1>
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
      <div className="bg-white border border-zinc-200 rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-orange-400" />
            <h2 className="text-lg font-semibold text-zinc-900">Configuration</h2>
          </div>
          {!editMode ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditMode(true)}
              className="gap-2 border-zinc-300 text-zinc-600 hover:bg-zinc-100"
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
                className="border-zinc-300 text-zinc-600 hover:bg-zinc-100"
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
              <Label className="text-zinc-600">Production Base URL</Label>
              <Input
                value={editData.production_base_url}
                onChange={(e) => setEditData({ ...editData, production_base_url: e.target.value })}
                placeholder="https://clara.koodh.com"
                className="bg-zinc-100 border-zinc-300 text-zinc-900 font-mono"
              />
              <p className="text-xs text-zinc-500">
                The base URL of your production environment. This is used for the API endpoints.
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-600">Cache Refresh Interval (minutes)</Label>
              <Input
                type="number"
                min="1"
                max="60"
                value={editData.cache_refresh_interval}
                onChange={(e) => setEditData({ ...editData, cache_refresh_interval: parseInt(e.target.value) || 5 })}
                className="bg-zinc-50 border-zinc-200 text-zinc-900 w-24"
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
              <p className="text-zinc-900 font-mono">{settings?.production_base_url || '-'}</p>
            </div>
            <div>
              <p className="text-zinc-500 text-sm mb-1">Cache Interval</p>
              <p className="text-zinc-700">Every {settings?.cache_refresh_interval || 5} minutes</p>
            </div>
            <div>
              <p className="text-zinc-500 text-sm mb-1">Last Cache Refresh</p>
              <p className="text-zinc-700">
                {settings?.last_cache_refresh
                  ? formatInTimeZone(new Date(settings.last_cache_refresh), 'Europe/Brussels', 'MMM dd yyyy HH:mm:ss')
                  : 'Not yet run'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* API Endpoints Section */}
      <div className="bg-white border border-zinc-200 rounded-xl p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <ExternalLink className="w-5 h-5 text-violet-400" />
          <h2 className="text-lg font-semibold text-zinc-900">API Endpoints</h2>
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
                stationColor === 'orange' ? 'text-orange-600' : 
                stationColor === 'violet' ? 'text-violet-600' : 'text-zinc-600'
              }`}>
                {stationName}
              </h3>
              <div className="space-y-2">
                {stationEndpoints.map((endpoint, index) => (
                  <div
                    key={index}
                    className={`bg-zinc-50 rounded-lg p-3 border ${
                      stationColor === 'orange' ? 'border-orange-500/30' : 
                      stationColor === 'violet' ? 'border-violet-500/30' : 'border-zinc-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="text-zinc-700 text-sm font-medium">{endpoint.name.replace(`${station.toUpperCase()} - `, '').replace('Alle Stations - ', '').replace('All Stations - ', '')}</h4>
                          <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
                            Public
                          </span>
                        </div>
                        <p className="text-zinc-500 text-xs mb-2">{endpoint.description}</p>
                        <code className="text-xs bg-zinc-100 text-zinc-700 px-2 py-1 rounded font-mono break-all">
                          {endpoint.full_url}
                        </code>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyToClipboard(endpoint.full_url, endpoint.name)}
                        className="shrink-0 gap-1 border-zinc-300 text-zinc-600 hover:bg-zinc-100 text-xs px-2 py-1 h-7"
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
      <div className="bg-white border border-zinc-200 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-5 h-5 text-zinc-400" />
          <h2 className="text-lg font-semibold text-zinc-900">Cache Logs</h2>
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
                className="flex items-start gap-3 p-3 bg-zinc-50 rounded-lg"
              >
                {getStatusIcon(log.status)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-zinc-700 text-sm font-medium">
                      {getStatusLabel(log.status)}
                    </span>
                    {log.show_title && (
                      <span className="text-zinc-400 text-sm">• {log.show_title}</span>
                    )}
                  </div>
                  <p className="text-zinc-500 text-sm">{log.message}</p>
                  <p className="text-zinc-600 text-xs mt-1">
                    {formatInTimeZone(new Date(log.timestamp), 'Europe/Brussels', 'MMM dd yyyy HH:mm:ss')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Shoutcast Filters Section */}
      <div className="bg-white border border-zinc-200 rounded-xl p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-5 h-5 text-orange-400" />
          <h2 className="text-lg font-semibold text-zinc-900">Now Playing Filters</h2>
        </div>
        <p className="text-zinc-500 text-sm mb-4">
          Filter certain texts from the now playing info. If the text matches, it will be replaced.
        </p>

        {/* Dynamic Station Filters */}
        {stations.map((st) => {
          const stCode = st.code;
          const stFilters = stationFilters[stCode] || [];
          return (
            <div key={stCode} className="mb-6 last:mb-0">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: st.color }} />
                  <h3 className="text-sm font-semibold text-zinc-700">{st.name}</h3>
                </div>
                <div className="flex gap-2">
                  {editingFilters === stCode ? (
                    <>
                      <Button variant="outline" size="sm" onClick={() => setEditingFilters(null)} className="border-zinc-300 text-zinc-600 hover:bg-zinc-100 text-xs">
                        Cancel
                      </Button>
                      <Button size="sm" onClick={() => handleSaveFilters(stCode)} disabled={savingFilters} className="text-white text-xs" style={{ backgroundColor: st.color }}>
                        <Save className="w-3 h-3 mr-1" />
                        {savingFilters ? 'Saving...' : 'Save'}
                      </Button>
                    </>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => setEditingFilters(stCode)} className="border-zinc-300 text-zinc-600 hover:bg-zinc-100 text-xs">
                      <Settings className="w-3 h-3 mr-1" />
                      Edit
                    </Button>
                  )}
                </div>
              </div>

              {editingFilters === stCode ? (
                <div className="space-y-2">
                  {stFilters.map((filter, idx) => (
                    <div key={idx} className="flex flex-col gap-2 bg-zinc-50 rounded-lg p-2">
                      <div className="flex gap-2 items-center">
                        <Input value={filter.match} onChange={(e) => updateFilter(stCode, idx, 'match', e.target.value)} placeholder="Text to filter" className="bg-zinc-50 border-zinc-200 text-zinc-900 text-xs flex-1" />
                        <span className="text-zinc-500 text-xs">&rarr;</span>
                        <Input value={filter.replace} onChange={(e) => updateFilter(stCode, idx, 'replace', e.target.value)} placeholder="Replace with" className="bg-zinc-50 border-zinc-200 text-zinc-900 text-xs flex-1" />
                        <Button variant="ghost" size="sm" onClick={() => removeFilter(stCode, idx)} className="text-red-400 hover:text-red-300 hover:bg-red-500/10 p-1 h-7 w-7">
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-4 pl-1">
                        <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer">
                          <input type="checkbox" checked={filter.whole_word || false} onChange={(e) => updateFilter(stCode, idx, 'whole_word', e.target.checked)} className="w-3 h-3 rounded border-zinc-300 bg-zinc-100" />
                          <span>Heel woord</span>
                        </label>
                      </div>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={() => addFilter(stCode)} className="border-dashed border-zinc-300 text-zinc-400 hover:bg-zinc-100 text-xs w-full">
                    <Plus className="w-3 h-3 mr-1" /> Add filter
                  </Button>
                </div>
              ) : (
                <div className="text-zinc-400 text-sm">
                  {stFilters.length === 0 ? (
                    <p className="text-zinc-500 italic">No filters set</p>
                  ) : (
                    <div className="space-y-1">
                      {stFilters.map((f, i) => (
                        <div key={i} className="text-xs bg-zinc-100 rounded px-2 py-1 flex items-center gap-1">
                          <span className="text-zinc-400">&ldquo;{f.match}&rdquo;</span>
                          <span className="text-zinc-600 mx-1">&rarr;</span>
                          <span style={{ color: st.color }}>{f.replace || '(remove)'}</span>
                          {f.whole_word && <span className="text-zinc-600 ml-1">(heel woord)</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {stations.length === 0 && (
          <p className="text-zinc-500 text-sm italic">No stations configured. Go to site settings to add RDS stations.</p>
        )}
      </div>

      {/* Stale Now Playing Config */}
      {staleConfig && (
        <div className="bg-white border border-zinc-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-400" />
              <h2 className="text-lg font-semibold text-zinc-900">Stale Now Playing Timeout</h2>
            </div>
            <Button
              onClick={handleSaveStaleConfig}
              disabled={savingStale}
              size="sm"
              className="bg-amber-600 hover:bg-amber-700 text-white"
              data-testid="save-stale-config-btn"
            >
              <Save className={`w-3.5 h-3.5 mr-1 ${savingStale ? 'animate-pulse' : ''}`} />
              {savingStale ? 'Saving...' : 'Save'}
            </Button>
          </div>
          <p className="text-xs text-zinc-500 mb-4">
            When no song change is detected for the timeout period, the now playing text is replaced with a fallback text per station.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <Label className="text-xs text-zinc-400">Timeout (minutes)</Label>
              <Input
                type="number"
                min={1}
                max={120}
                value={staleConfig.timeout_minutes || 15}
                onChange={e => setStaleConfig({...staleConfig, timeout_minutes: parseInt(e.target.value) || 15})}
                className="bg-zinc-50 border-zinc-200 text-zinc-900 mt-1"
                data-testid="stale-timeout-input"
              />
              <p className="text-[10px] text-zinc-600 mt-1">After this many minutes of the same song, show fallback text</p>
            </div>
            <div>
              <Label className="text-xs text-zinc-400">Recovery threshold (seconds)</Label>
              <Input
                type="number"
                min={5}
                max={300}
                value={staleConfig.recovery_seconds || 30}
                onChange={e => setStaleConfig({...staleConfig, recovery_seconds: parseInt(e.target.value) || 30})}
                className="bg-zinc-50 border-zinc-200 text-zinc-900 mt-1"
                data-testid="stale-recovery-input"
              />
              <p className="text-[10px] text-zinc-600 mt-1">New song must persist this long to recover from stale</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {stations.map((st) => (
              <div key={st.code}>
                <Label className="text-xs text-zinc-400">{st.name} Fallback Text</Label>
                <Input
                  value={staleConfig.fallback_text?.[st.code] || ''}
                  onChange={e => setStaleConfig({...staleConfig, fallback_text: {...staleConfig.fallback_text, [st.code]: e.target.value}})}
                  className="bg-zinc-50 border-zinc-200 text-zinc-900 mt-1"
                  placeholder={st.default_text || `e.g. ${st.name}`}
                  data-testid={`stale-fallback-${st.code}`}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Shoutcast Logs Section */}
      <div className="bg-white border border-zinc-200 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Music className="w-5 h-5 text-green-400" />
          <h2 className="text-lg font-semibold text-zinc-900">Shoutcast Logs</h2>
          <span className="text-xs text-zinc-500 ml-2">Last 50 (every 10 sec)</span>
        </div>

        {shoutcastLogs.length === 0 ? (
          <div className="text-center py-8">
            <Music className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
            <p className="text-zinc-500">No shoutcast logs yet</p>
          </div>
        ) : (
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {shoutcastLogs.map((log) => {
              const st = stations.find(s => s.code === log.station);
              return (
                <div
                  key={log.id}
                  className="flex items-center gap-3 p-2 rounded text-xs bg-zinc-50"
                >
                  <span className="font-mono font-bold" style={{ color: st?.color || '#888' }}>
                    {log.station?.toUpperCase()}
                  </span>
                  <span className="text-zinc-400 truncate flex-1">
                    {log.song_title || <span className="italic text-zinc-600">(filtered)</span>}
                  </span>
                  <span className="text-zinc-600">
                    {log.current_listeners} listeners
                  </span>
                  <span className="text-zinc-700 text-[10px]">
                    {formatInTimeZone(new Date(log.timestamp), 'Europe/Brussels', 'HH:mm:ss')}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default RDSSettingsPage;
