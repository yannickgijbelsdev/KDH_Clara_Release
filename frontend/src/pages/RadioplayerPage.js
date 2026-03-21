import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import {
  Radio, Settings, RefreshCw, CheckCircle, XCircle, Send,
  Calendar, Music, Clock, AlertCircle, Save, Eye, EyeOff, Activity,
} from 'lucide-react';
import RadioplayerIcon from '../components/icons/RadioplayerIcon';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const RadioplayerPage = () => {
  const [config, setConfig] = useState(null);
  const [pushLog, setPushLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [pushingNP, setPushingNP] = useState(false);
  const [pushingSchedule, setPushingSchedule] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const [configRes, logRes] = await Promise.all([
        axios.get(`${API}/radioplayer/config`),
        axios.get(`${API}/radioplayer/push-log?limit=50`),
      ]);
      setConfig(configRes.data);
      setPushLog(logRes.data.logs || []);
      setLastRefresh(new Date());
    } catch (err) {
      console.error('Failed to fetch Radioplayer data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-refresh every 30 seconds (like RDS monitor)
  useEffect(() => {
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.put(`${API}/radioplayer/config`, config);
      toast.success('Configuration saved');
      await fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handlePushNP = async () => {
    setPushingNP(true);
    try {
      const res = await axios.post(`${API}/radioplayer/push-now-playing`);
      toast.success(res.data.message || 'Now playing pushed');
      setTimeout(fetchData, 1000);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Push failed');
    } finally {
      setPushingNP(false);
    }
  };

  const handlePushSchedule = async () => {
    setPushingSchedule(true);
    try {
      const res = await axios.post(`${API}/radioplayer/push-schedule`);
      toast.success(res.data.message || 'Schedule pushed');
      setTimeout(fetchData, 1000);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Push failed');
    } finally {
      setPushingSchedule(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <RefreshCw className="w-8 h-8 text-zinc-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-orange-500/20 flex items-center justify-center">
              <RadioplayerIcon size={24} className="text-orange-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white" data-testid="radioplayer-title">Radioplayer Integration</h1>
              <div className="flex items-center gap-3">
                <p className="text-sm text-zinc-400">Push now playing and schedule data to radioplayer.org</p>
                {config?.enabled && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <Activity className="w-3 h-3 text-emerald-400 animate-pulse" />
                    <span className="text-emerald-400">Auto-sync actief</span>
                    {lastRefresh && (
                      <span className="text-zinc-600">
                        — bijgewerkt {lastRefresh.toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="text-zinc-400"
              onClick={fetchData}
              data-testid="rp-refresh-btn"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-zinc-700 text-zinc-300"
              onClick={handlePushNP}
              disabled={pushingNP || !config?.enabled}
              data-testid="rp-push-np-btn"
            >
              <Music className={`w-4 h-4 mr-1 ${pushingNP ? 'animate-pulse' : ''}`} />
              Push Now Playing
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-zinc-700 text-zinc-300"
              onClick={handlePushSchedule}
              disabled={pushingSchedule || !config?.enabled}
              data-testid="rp-push-schedule-btn"
            >
              <Calendar className={`w-4 h-4 mr-1 ${pushingSchedule ? 'animate-pulse' : ''}`} />
              Push Schedule
            </Button>
          </div>
        </div>

        {/* Configuration */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Settings className="w-5 h-5 text-zinc-400" />
            <h2 className="text-lg font-semibold text-white">Configuration</h2>
          </div>

          <div className="space-y-4">
            {/* Enable toggle */}
            <div className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg">
              <div>
                <p className="text-white text-sm font-medium">Enable Radioplayer Integration</p>
                <p className="text-xs text-zinc-500">Push data automatically to Radioplayer</p>
              </div>
              <button
                onClick={() => setConfig({...config, enabled: !config.enabled})}
                className={`w-12 h-6 rounded-full transition-colors relative ${config?.enabled ? 'bg-green-600' : 'bg-zinc-700'}`}
                data-testid="rp-enabled-toggle"
              >
                <div className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${config?.enabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="text-xs text-zinc-500 block mb-1">API Key (Bearer Token)</label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={config?.api_key || ''}
                    onChange={e => setConfig({...config, api_key: e.target.value})}
                    className="bg-zinc-800 border-zinc-700 text-white font-mono pr-10"
                    placeholder="515907f3-a3a9-4500-bbde-..."
                    data-testid="rp-api-key-input"
                  />
                  <button
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-zinc-600 mt-1">Als ingesteld, wordt API Key gebruikt in plaats van username/password</p>
              </div>
              <div>
                <label className="text-xs text-zinc-500 block mb-1">RPUID (Station ID)</label>
                <Input
                  value={config?.rpid || ''}
                  onChange={e => setConfig({...config, rpid: e.target.value})}
                  className="bg-zinc-800 border-zinc-700 text-white font-mono"
                  placeholder="0566028"
                  data-testid="rp-rpid-input"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Station Naam</label>
                <Input
                  value={config?.station_name || ''}
                  onChange={e => setConfig({...config, station_name: e.target.value})}
                  className="bg-zinc-800 border-zinc-700 text-white"
                  placeholder="Radio GRK"
                  data-testid="rp-station-name-input"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Username (Basic Auth)</label>
                <Input
                  value={config?.username || ''}
                  onChange={e => setConfig({...config, username: e.target.value})}
                  className="bg-zinc-800 border-zinc-700 text-white"
                  placeholder="email@station.fm"
                  data-testid="rp-username-input"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Password (Basic Auth)</label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={config?.password || ''}
                    onChange={e => setConfig({...config, password: e.target.value})}
                    className="bg-zinc-800 border-zinc-700 text-white pr-10"
                    placeholder="••••••••"
                    data-testid="rp-password-input"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Country Code</label>
                <Input
                  value={config?.country_code || '056'}
                  onChange={e => setConfig({...config, country_code: e.target.value})}
                  className="bg-zinc-800 border-zinc-700 text-white font-mono"
                  placeholder="056"
                  data-testid="rp-country-input"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-zinc-500 block mb-1">Ingest Base URL</label>
              <Input
                value={config?.ingest_base_url || 'https://core-ingest.radioplayer.cloud'}
                onChange={e => setConfig({...config, ingest_base_url: e.target.value})}
                className="bg-zinc-800 border-zinc-700 text-white font-mono text-sm"
                data-testid="rp-url-input"
              />
            </div>

            {/* Auto-push toggles */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg">
                <div>
                  <p className="text-white text-sm">Auto Now Playing</p>
                  <p className="text-xs text-zinc-500">Push on song change (GRK)</p>
                </div>
                <button
                  onClick={() => setConfig({...config, auto_np: !config.auto_np})}
                  className={`w-10 h-5 rounded-full transition-colors relative ${config?.auto_np ? 'bg-green-600' : 'bg-zinc-700'}`}
                  data-testid="rp-auto-np-toggle"
                >
                  <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${config?.auto_np ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>
              <div className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg">
                <div>
                  <p className="text-white text-sm">Auto Schedule</p>
                  <p className="text-xs text-zinc-500">Push on show create/update</p>
                </div>
                <button
                  onClick={() => setConfig({...config, auto_schedule: !config.auto_schedule})}
                  className={`w-10 h-5 rounded-full transition-colors relative ${config?.auto_schedule ? 'bg-green-600' : 'bg-zinc-700'}`}
                  data-testid="rp-auto-schedule-toggle"
                >
                  <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${config?.auto_schedule ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                onClick={handleSave}
                disabled={saving}
                className="bg-orange-600 hover:bg-orange-700 text-white"
                data-testid="rp-save-btn"
              >
                <Save className={`w-4 h-4 mr-1 ${saving ? 'animate-pulse' : ''}`} />
                {saving ? 'Saving...' : 'Save Configuration'}
              </Button>
            </div>
          </div>
        </div>

        {/* Push Log */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-zinc-400" />
              <h2 className="text-lg font-semibold text-white">Push Log</h2>
              <span className="text-xs text-zinc-500">({pushLog.length} entries)</span>
            </div>
            <Button variant="ghost" size="sm" onClick={fetchData} className="text-zinc-400">
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>

          {pushLog.length === 0 ? (
            <div className="p-8 text-center text-zinc-500">
              <Send className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No push events yet</p>
              <p className="text-xs mt-1">Data will appear here when songs change or schedule is pushed</p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/50">
              {pushLog.map((entry, i) => (
                <div key={i} className="px-6 py-3 flex items-center gap-4 hover:bg-zinc-800/30">
                  <div className="flex-shrink-0">
                    {entry.status === 'success' ? (
                      <CheckCircle className="w-5 h-5 text-green-400" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-400" />
                    )}
                  </div>
                  <div className="flex-shrink-0">
                    {entry.type === 'now_playing' ? (
                      <Music className="w-4 h-4 text-blue-400" />
                    ) : (
                      <Calendar className="w-4 h-4 text-purple-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{entry.detail}</p>
                    <p className="text-xs text-zinc-500">
                      {entry.type === 'now_playing' ? 'Now Playing' : 'Schedule'}
                      {entry.response_code ? ` · HTTP ${entry.response_code}` : ''}
                    </p>
                  </div>
                  <div className="text-xs text-zinc-600 flex-shrink-0 whitespace-nowrap">
                    {entry.timestamp ? new Date(entry.timestamp).toLocaleString() : ''}
                  </div>
                  {entry.status === 'error' && entry.response_body && (
                    <div className="flex-shrink-0">
                      <AlertCircle className="w-4 h-4 text-amber-400" title={entry.response_body} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RadioplayerPage;
