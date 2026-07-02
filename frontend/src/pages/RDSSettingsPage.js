/* eslint-disable */
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
  Calendar,
  PlayCircle,
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
  const [mainSiteId, setMainSiteId] = useState(null);

  // Custom stream schedule editor state per station id
  // shape: { [stationId]: CustomStream[] }
  const [customStreams, setCustomStreams] = useState({});
  const [editingStreamsFor, setEditingStreamsFor] = useState(null);
  const [savingStreams, setSavingStreams] = useState(false);
  // Per-row test result: { [stationId]: { [index]: { status, song_title, message, stream_online, current_listeners } } }
  const [streamTestResults, setStreamTestResults] = useState({});
  const [testingStream, setTestingStream] = useState(null); // `${stationId}-${index}` while in-flight
  const [savingDefaultText, setSavingDefaultText] = useState(null); // station.id while save is in-flight
  // Live "what's active right now" per station code
  const [liveStatus, setLiveStatus] = useState({});

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
          setMainSiteId(siteData.id);
          const stRes = await fetch(`${API}/rds-stations/${siteData.id}`, { headers: authHeaders });
          if (stRes.ok) {
            const stData = await stRes.json();
            fetchedStations = stData.stations || [];
          }
        }
      } catch (e) { console.error('Station fetch error:', e); }
      setStations(fetchedStations);

      // Hydrate custom stream schedules from the station docs
      const streamsMap = {};
      fetchedStations.forEach(st => {
        streamsMap[st.id] = (st.custom_streams || []).map(s => ({ ...s }));
      });
      setCustomStreams(streamsMap);

      // Fetch filter data for each station
      const filterPromises = fetchedStations.map(st =>
        axios.get(`${API}/rds/shoutcast/filters/${st.code}`).catch(() => ({ data: { filters: [] } }))
      );

      // Build station codes for log filtering
      const stationCodes = fetchedStations.map(st => st.code).join(',');
      const stationsParam = stationCodes ? `&stations=${stationCodes}` : '';

      const [settingsRes, endpointsRes, logsRes, shoutcastLogsRes, staleRes, ...filterResults] = await Promise.all([
        axios.get(`${API}/rds/settings`),
        axios.get(`${API}/rds/endpoints`),
        axios.get(`${API}/rds/logs?limit=20`),
        axios.get(`${API}/rds/shoutcast/logs?limit=50${stationsParam}`),
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

  // Poll live now-playing status every 10s so admins see WHICH source is
  // currently feeding each station's RDS data.
  const fetchLiveStatus = useCallback(async (sts) => {
    const target = (sts && sts.length ? sts : stations) || [];
    if (!target.length) return;
    const results = {};
    await Promise.all(
      target.map(async (st) => {
        try {
          const res = await axios.get(`${API}/rds/${st.code}/now-playing`);
          results[st.code] = res.data || {};
        } catch (e) {
          results[st.code] = { status: 'error' };
        }
      })
    );
    setLiveStatus(results);
  }, [stations]);

  useEffect(() => {
    if (!stations.length) return;
    fetchLiveStatus(stations);
    const t = setInterval(() => fetchLiveStatus(stations), 10000);
    return () => clearInterval(t);
  }, [stations, fetchLiveStatus]);

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

  // ─── Custom Stream Scheduler handlers ───
  const addCustomStream = (stationId) => {
    setCustomStreams(prev => ({
      ...prev,
      [stationId]: [
        ...(prev[stationId] || []),
        {
          id: `tmp-${Date.now()}`,
          enabled: true,
          label: '',
          url: '',
          stream_type: 'shoutcast_v1',
          days: [0, 1, 2, 3, 4, 5, 6],
          start_time: '22:00',
          end_time: '06:00',
        },
      ],
    }));
  };

  const removeCustomStream = (stationId, index) => {
    setCustomStreams(prev => ({
      ...prev,
      [stationId]: (prev[stationId] || []).filter((_, i) => i !== index),
    }));
  };

  const updateCustomStream = (stationId, index, field, value) => {
    setCustomStreams(prev => {
      const updated = [...(prev[stationId] || [])];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, [stationId]: updated };
    });
  };

  const toggleCustomStreamDay = (stationId, index, day) => {
    setCustomStreams(prev => {
      const updated = [...(prev[stationId] || [])];
      const current = updated[index]?.days || [];
      const next = current.includes(day)
        ? current.filter(d => d !== day)
        : [...current, day].sort((a, b) => a - b);
      updated[index] = { ...updated[index], days: next };
      return { ...prev, [stationId]: updated };
    });
  };

  const saveCustomStreams = async (station) => {
    if (!mainSiteId) {
      toast.error('Main site not loaded yet');
      return;
    }
    setSavingStreams(true);
    try {
      const payload = { custom_streams: customStreams[station.id] || [] };
      await axios.put(`${API}/rds-stations/${mainSiteId}/${station.id}`, payload);
      toast.success(`Stream schedule saved for ${station.name}`);
      setEditingStreamsFor(null);
      // Backend already refreshed the cache on save — re-poll status so the
      // "Currently active" pill updates instantly.
      fetchLiveStatus(stations);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Could not save stream schedule');
    } finally {
      setSavingStreams(false);
    }
  };

  const saveDefaultShowText = async (station) => {
    if (!mainSiteId) {
      toast.error('Main site not loaded yet');
      return;
    }
    setSavingDefaultText(station.id);
    try {
      await axios.put(`${API}/rds-stations/${mainSiteId}/${station.id}`, {
        default_text: (station.default_text || '').trim(),
        now_playing_case: station.now_playing_case || 'mixed',
      });
      toast.success(`Instellingen opgeslagen voor ${station.name}`);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Kon instellingen niet opslaan');
    } finally {
      setSavingDefaultText(null);
    }
  };

  const testCustomStream = async (stationId, index, url) => {
    if (!url || !url.trim()) {
      toast.error('Enter a stream URL first');
      return;
    }
    const key = `${stationId}-${index}`;
    setTestingStream(key);
    setStreamTestResults(prev => ({
      ...prev,
      [stationId]: { ...(prev[stationId] || {}), [index]: { status: 'loading' } },
    }));
    try {
      const res = await axios.post(`${API}/rds-stations/test-stream`, {
        url: url.trim(),
        stream_type: 'shoutcast_v1',
      });
      const data = res.data || {};
      setStreamTestResults(prev => ({
        ...prev,
        [stationId]: { ...(prev[stationId] || {}), [index]: data },
      }));
      if (data.status === 'success') {
        toast.success(data.song_title ? `Now playing: ${data.song_title}` : 'Stream reached, but no song title');
      } else {
        toast.error(data.message || 'Stream unreachable');
      }
    } catch (error) {
      const msg = error.response?.data?.detail || 'Test failed';
      setStreamTestResults(prev => ({
        ...prev,
        [stationId]: { ...(prev[stationId] || {}), [index]: { status: 'error', message: msg } },
      }));
      toast.error(msg);
    } finally {
      setTestingStream(null);
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
    <div data-testid="rds-settings-page">
      {/* Toolbar */}
      <div className="flex items-center justify-end mb-6">
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

        {/* Group endpoints by station — dynamically */}
        {(() => {
          const allEndpoints = endpoints?.endpoints || [];
          // Get unique station codes from the endpoint data
          const stationCodes = [...new Set(allEndpoints.map(e => e.station))];
          return stationCodes.map((stCode) => {
            const stationEndpoints = allEndpoints.filter(e => e.station === stCode);
            if (stationEndpoints.length === 0) return null;
            
            // Use station_name from the endpoint data, or fallback to dynamic stations list
            const stationName = stationEndpoints[0]?.station_name
              || stations.find(s => s.code === stCode)?.name
              || (stCode === 'all' ? 'All Stations' : stCode.toUpperCase());
            const stationColor = stationEndpoints[0]?.station_color
              || stations.find(s => s.code === stCode)?.color
              || '#71717a';
          
            return (
              <div key={stCode} className="mb-6 last:mb-0">
                <h3 className="text-sm font-semibold mb-3" style={{ color: stationColor }}>
                  {stationName}
                </h3>
                <div className="space-y-2">
                  {stationEndpoints.map((endpoint, index) => (
                    <div
                      key={index}
                      className="bg-zinc-50 rounded-lg p-3 border"
                      style={{ borderColor: `${stationColor}30` }}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="text-zinc-700 text-sm font-medium">{endpoint.name.replace(`${stationName} - `, '')}</h4>
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
          });
        })()}
      </div>

      {/* Cache Logs Section */}
      <div className="bg-white border border-zinc-200 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-5 h-5 text-zinc-400" />
          <h2 className="text-lg font-semibold text-zinc-900">Cache Logs</h2>
          <span className="text-xs text-zinc-500 ml-2">Last 20</span>
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

      {/* Default show text (no live show) */}
      <div className="bg-white border border-zinc-200 rounded-xl p-6 mb-6" data-testid="default-show-text-section">
        <div className="flex items-center gap-2 mb-2">
          <Radio className="w-5 h-5 text-emerald-500" />
          <h2 className="text-lg font-semibold text-zinc-900">Default show text & Now playing formatting</h2>
        </div>
        <p className="text-zinc-500 text-sm mb-4">
          Zet de <span className="font-medium text-zinc-700">show-naam</span> die verschijnt wanneer er geen live show loopt, en kies de
          <span className="font-medium text-zinc-700"> hoofdlettergebruik</span> voor <em>Now playing</em>. De formatting geldt overal — RDS Monitor, DAB, MagicRDS, en de public /live endpoints.
        </p>

        {stations.length === 0 && (
          <p className="text-zinc-500 text-sm italic">Geen stations geconfigureerd. Voeg RDS-stations toe via de site-instellingen.</p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {stations.map((st, idx) => {
            const npCase = st.now_playing_case || 'mixed';
            const NP_OPTIONS = [
              { key: 'mixed', label: 'ARTIST - Title', hint: 'Artiest UPPER, titel Title Case (huidige default)' },
              { key: 'upper', label: 'ARTIST - TITLE', hint: 'Alles HOOFDLETTERS' },
              { key: 'lower', label: 'artist - title', hint: 'Alles kleine letters' },
              { key: 'sentence', label: 'Artist - Title', hint: 'Beide delen in Title Case' },
            ];
            return (
              <div key={st.id || st.code} className="border border-zinc-200 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: st.color }} />
                  <span className="text-sm font-semibold text-zinc-900">{st.name}</span>
                </div>

                <div>
                  <Label className="text-xs text-zinc-500">Default show text</Label>
                  <Input
                    value={st.default_text || ''}
                    onChange={(e) => {
                      const next = [...stations];
                      next[idx] = { ...next[idx], default_text: e.target.value };
                      setStations(next);
                    }}
                    placeholder={`e.g. ${st.name === 'GRK' ? 'the feelgood station' : 'jouw favoriete hits'}`}
                    className="bg-zinc-50 border-zinc-200 text-zinc-900 mt-1"
                    data-testid={`default-show-text-${st.code}`}
                  />
                </div>

                <div>
                  <Label className="text-xs text-zinc-500 block mb-1">Now playing formatting</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {NP_OPTIONS.map(opt => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => {
                          const next = [...stations];
                          next[idx] = { ...next[idx], now_playing_case: opt.key };
                          setStations(next);
                        }}
                        title={opt.hint}
                        className={`text-left border rounded-md px-3 py-2 transition-colors ${
                          npCase === opt.key
                            ? 'border-transparent text-white shadow-sm'
                            : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                        }`}
                        style={npCase === opt.key ? { backgroundColor: st.color } : {}}
                        data-testid={`np-case-${st.code}-${opt.key}`}
                      >
                        <div className="text-xs font-mono leading-tight">{opt.label}</div>
                        <div className={`text-[10px] ${npCase === opt.key ? 'text-white/80' : 'text-zinc-500'}`}>{opt.hint}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <Button
                  size="sm"
                  onClick={() => saveDefaultShowText(st)}
                  disabled={savingDefaultText === st.id}
                  className="text-white w-full"
                  style={{ backgroundColor: st.color }}
                  data-testid={`save-default-show-text-${st.code}`}
                >
                  <Save className="w-3 h-3 mr-1" />
                  {savingDefaultText === st.id ? 'Saving…' : 'Save'}
                </Button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Custom Stream Scheduler Section */}
      <div className="bg-white border border-zinc-200 rounded-xl p-6 mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Calendar className="w-5 h-5 text-violet-500" />
          <h2 className="text-lg font-semibold text-zinc-900">Now Playing Stream Schedule</h2>
        </div>
        <p className="text-zinc-500 text-sm mb-4">
          Pull <span className="font-medium text-zinc-700">Now Playing</span> from an alternative stream URL during specific weekdays and hours.
          Outside the window the station's default stream is used. If the alternative stream is unreachable, the system falls back to the default automatically.
          All times are in <span className="font-medium text-zinc-700">Europe/Brussels</span>.
        </p>

        {stations.length === 0 && (
          <p className="text-zinc-500 text-sm italic">No stations configured. Go to site settings to add RDS stations.</p>
        )}

        {stations.map((st) => {
          const streams = customStreams[st.id] || [];
          const isEditing = editingStreamsFor === st.id;
          const DAY_LABELS = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];

          return (
            <div key={st.id} className="mb-6 last:mb-0" data-testid={`custom-streams-station-${st.code}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: st.color }} />
                  <h3 className="text-sm font-semibold text-zinc-700">{st.name}</h3>
                  <span className="text-xs text-zinc-500">
                    {streams.length === 0 ? 'No schedule' : `${streams.length} window${streams.length === 1 ? '' : 's'}`}
                  </span>
                  {(() => {
                    const ls = liveStatus[st.code];
                    if (!ls) return null;
                    const isCustom = ls.active_stream === 'custom';
                    const isFallback = ls.fallback_used;
                    return (
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                          isCustom
                            ? 'bg-violet-50 border-violet-200 text-violet-700'
                            : 'bg-zinc-50 border-zinc-200 text-zinc-600'
                        }`}
                        data-testid={`live-source-${st.code}`}
                        title={ls.song_title || ''}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${isCustom ? 'bg-violet-500' : 'bg-emerald-500'} animate-pulse`} />
                        {isCustom
                          ? `Live: ${ls.custom_stream_label || 'custom stream'}`
                          : 'Live: default stream'}
                        {isFallback && <span className="text-amber-600">· fallback</span>}
                        {ls.song_title && (
                          <span className="opacity-70 truncate max-w-[180px]">· {ls.song_title}</span>
                        )}
                      </span>
                    );
                  })()}
                </div>
                <div className="flex gap-2">
                  {isEditing ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingStreamsFor(null)}
                        className="border-zinc-300 text-zinc-600 hover:bg-zinc-100 text-xs"
                        data-testid={`cancel-streams-${st.code}`}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => saveCustomStreams(st)}
                        disabled={savingStreams}
                        className="text-white text-xs"
                        style={{ backgroundColor: st.color }}
                        data-testid={`save-streams-${st.code}`}
                      >
                        <Save className="w-3 h-3 mr-1" />
                        {savingStreams ? 'Saving...' : 'Save'}
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingStreamsFor(st.id)}
                      className="border-zinc-300 text-zinc-600 hover:bg-zinc-100 text-xs"
                      data-testid={`edit-streams-${st.code}`}
                    >
                      <Settings className="w-3 h-3 mr-1" />
                      Edit
                    </Button>
                  )}
                </div>
              </div>

              {isEditing ? (
                <div className="space-y-3">
                  {streams.map((cs, idx) => {
                    const testKey = `${st.id}-${idx}`;
                    const testRes = (streamTestResults[st.id] || {})[idx];
                    const isTesting = testingStream === testKey;
                    return (
                    <div key={cs.id || idx} className="bg-zinc-50 border border-zinc-200 rounded-lg p-3 space-y-3">
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 text-xs text-zinc-600">
                          <input
                            type="checkbox"
                            checked={!!cs.enabled}
                            onChange={(e) => updateCustomStream(st.id, idx, 'enabled', e.target.checked)}
                            className="w-3.5 h-3.5"
                            data-testid={`stream-enabled-${st.code}-${idx}`}
                          />
                          <span>Active</span>
                        </label>
                        <Input
                          value={cs.label || ''}
                          onChange={(e) => updateCustomStream(st.id, idx, 'label', e.target.value)}
                          placeholder="Label (e.g. Nachtprogramma)"
                          className="bg-white border-zinc-300 text-zinc-900 text-xs flex-1"
                          data-testid={`stream-label-${st.code}-${idx}`}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeCustomStream(st.id, idx)}
                          className="text-red-500 hover:text-red-600 hover:bg-red-50 p-1 h-7 w-7"
                          data-testid={`remove-stream-${st.code}-${idx}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>

                      <div>
                        <Label className="text-[11px] text-zinc-500">Stream URL (Shoutcast v1 stats endpoint)</Label>
                        <div className="flex gap-2 mt-1">
                          <Input
                            value={cs.url || ''}
                            onChange={(e) => updateCustomStream(st.id, idx, 'url', e.target.value)}
                            placeholder="http://example.com:8000/stats?sid=1"
                            className="bg-white border-zinc-300 text-zinc-900 text-xs font-mono flex-1"
                            data-testid={`stream-url-${st.code}-${idx}`}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => testCustomStream(st.id, idx, cs.url)}
                            disabled={isTesting || !cs.url}
                            className="border-zinc-300 text-zinc-600 hover:bg-zinc-100 text-xs whitespace-nowrap"
                            data-testid={`test-stream-${st.code}-${idx}`}
                          >
                            {isTesting ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <PlayCircle className="w-3 h-3 mr-1" />
                            )}
                            {isTesting ? '' : 'Test'}
                          </Button>
                        </div>
                        {testRes && testRes.status !== 'loading' && (
                          <div
                            className={`mt-2 text-[11px] rounded border px-2 py-1.5 ${
                              testRes.status === 'success'
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                : 'bg-red-50 border-red-200 text-red-700'
                            }`}
                            data-testid={`test-result-${st.code}-${idx}`}
                          >
                            {testRes.status === 'success' ? (
                              <div className="flex items-center gap-2 flex-wrap">
                                <CheckCircle className="w-3 h-3" />
                                <span className="font-medium">{testRes.song_title || '(no song title)'}</span>
                                {testRes.server_title && <span className="opacity-70">· {testRes.server_title}</span>}
                                <span className="opacity-70">· {testRes.current_listeners} listener{testRes.current_listeners === 1 ? '' : 's'}</span>
                                {!testRes.stream_online && <span className="text-amber-600">· offline</span>}
                                {testRes.resolved_url && testRes.resolved_url !== testRes.url && (
                                  <span className="opacity-70 text-[10px] font-mono break-all">→ {testRes.resolved_url}</span>
                                )}
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <XCircle className="w-3 h-3" />
                                <span>{testRes.message || 'Stream unreachable'}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div>
                        <Label className="text-[11px] text-zinc-500 mb-1 block">Active on days</Label>
                        <div className="flex gap-1">
                          {DAY_LABELS.map((lbl, dayIdx) => {
                            const active = (cs.days || []).includes(dayIdx);
                            return (
                              <button
                                key={dayIdx}
                                type="button"
                                onClick={() => toggleCustomStreamDay(st.id, idx, dayIdx)}
                                className={`w-9 h-8 text-xs rounded border transition-colors ${
                                  active
                                    ? 'text-white border-transparent'
                                    : 'bg-white border-zinc-300 text-zinc-500 hover:bg-zinc-100'
                                }`}
                                style={active ? { backgroundColor: st.color } : undefined}
                                data-testid={`stream-day-${st.code}-${idx}-${dayIdx}`}
                              >
                                {lbl}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-[11px] text-zinc-500">Start time</Label>
                          <Input
                            type="time"
                            value={cs.start_time || '00:00'}
                            onChange={(e) => updateCustomStream(st.id, idx, 'start_time', e.target.value)}
                            className="bg-white border-zinc-300 text-zinc-900 text-xs mt-1"
                            data-testid={`stream-start-${st.code}-${idx}`}
                          />
                        </div>
                        <div>
                          <Label className="text-[11px] text-zinc-500">End time</Label>
                          <Input
                            type="time"
                            value={cs.end_time || '00:00'}
                            onChange={(e) => updateCustomStream(st.id, idx, 'end_time', e.target.value)}
                            className="bg-white border-zinc-300 text-zinc-900 text-xs mt-1"
                            data-testid={`stream-end-${st.code}-${idx}`}
                          />
                        </div>
                      </div>
                      <p className="text-[10px] text-zinc-500">
                        Tip: set end time before start time to cross midnight (e.g. 22:00 → 06:00).
                      </p>
                    </div>
                  );})}

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => addCustomStream(st.id)}
                    className="border-dashed border-zinc-300 text-zinc-500 hover:bg-zinc-100 text-xs w-full"
                    data-testid={`add-stream-${st.code}`}
                  >
                    <Plus className="w-3 h-3 mr-1" /> Add stream window
                  </Button>
                </div>
              ) : (
                <div className="text-sm">
                  {streams.length === 0 ? (
                    <p className="text-zinc-500 italic">No custom stream windows — default stream is always used.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {streams.map((cs, i) => {
                        const testRes = (streamTestResults[st.id] || {})[i];
                        const isTesting = testingStream === `${st.id}-${i}`;
                        return (
                        <div key={cs.id || i}>
                          <div className="text-xs bg-zinc-50 border border-zinc-200 rounded px-3 py-2 flex items-center gap-3 flex-wrap">
                            <span className={`w-2 h-2 rounded-full ${cs.enabled ? '' : 'opacity-30'}`} style={{ backgroundColor: st.color }} />
                            <span className="font-medium text-zinc-700">{cs.label || 'Untitled'}</span>
                            <span className="text-zinc-500 font-mono truncate max-w-[260px]">{cs.url || '—'}</span>
                            <span className="text-zinc-600">
                              {(cs.days || []).length === 7 ? 'Every day' : (cs.days || []).map(d => DAY_LABELS[d]).join(', ') || 'Never'}
                            </span>
                            <span className="text-zinc-600">{cs.start_time} → {cs.end_time}</span>
                            {!cs.enabled && <span className="text-amber-600">(disabled)</span>}
                            <button
                              type="button"
                              onClick={() => testCustomStream(st.id, i, cs.url)}
                              disabled={isTesting || !cs.url}
                              className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded border border-zinc-300 text-zinc-600 hover:bg-zinc-100 disabled:opacity-50"
                              data-testid={`test-stream-view-${st.code}-${i}`}
                            >
                              {isTesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <PlayCircle className="w-3 h-3" />}
                              Test
                            </button>
                          </div>
                          {testRes && testRes.status !== 'loading' && (
                            <div
                              className={`mt-1 text-[11px] rounded border px-2 py-1.5 ${
                                testRes.status === 'success'
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                  : 'bg-red-50 border-red-200 text-red-700'
                              }`}
                              data-testid={`test-result-view-${st.code}-${i}`}
                            >
                              {testRes.status === 'success' ? (
                                <div className="flex items-center gap-2 flex-wrap">
                                  <CheckCircle className="w-3 h-3" />
                                  <span className="font-medium">{testRes.song_title || '(no song title)'}</span>
                                  {testRes.server_title && <span className="opacity-70">· {testRes.server_title}</span>}
                                  <span className="opacity-70">· {testRes.current_listeners} listener{testRes.current_listeners === 1 ? '' : 's'}</span>
                                  {!testRes.stream_online && <span className="text-amber-600">· offline</span>}
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <XCircle className="w-3 h-3" />
                                  <span>{testRes.message || 'Stream unreachable'}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );})}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
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
                          <span>Whole word</span>
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
                          {f.whole_word && <span className="text-zinc-600 ml-1">(whole word)</span>}
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
