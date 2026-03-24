import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import {
  Radio, Settings, RefreshCw, CheckCircle, XCircle, Send,
  Calendar, Music, Clock, AlertCircle, Save, Eye, EyeOff, Activity,
  ChevronRight, Check, Loader2
} from 'lucide-react';
import RadioplayerIcon from '../components/icons/RadioplayerIcon';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function StepIndicator({ steps, current }) {
  return (
    <div className="flex items-center gap-1 mb-6">
      {steps.map((s, i) => (
        <div key={i} className="flex items-center gap-1">
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
            i < current ? 'bg-emerald-500/20 text-emerald-400' :
            i === current ? 'bg-orange-500/20 text-orange-400 ring-1 ring-orange-500/40' :
            'bg-zinc-800 text-zinc-500'
          }`}>
            {i < current ? <Check className="w-3 h-3" /> : <span className="w-3 text-center">{i + 1}</span>}
            <span className="hidden sm:inline">{s}</span>
          </div>
          {i < steps.length - 1 && <ChevronRight className="w-3 h-3 text-zinc-700" />}
        </div>
      ))}
    </div>
  );
}

const RadioplayerPage = () => {
  const [config, setConfig] = useState(null);
  const [pushLog, setPushLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [pushingNP, setPushingNP] = useState(false);
  const [pushingSchedule, setPushingSchedule] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [setupStep, setSetupStep] = useState(0);

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

  useEffect(() => {
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Determine setup step based on config state
  useEffect(() => {
    if (!config) return;
    const hasCredentials = config.api_key || (config.username && config.password);
    const hasStation = config.rpid && config.station_name;
    const isEnabled = config.enabled;
    const hasPushes = pushLog.length > 0;

    if (!hasCredentials) setSetupStep(0);
    else if (!hasStation) setSetupStep(1);
    else if (!isEnabled) setSetupStep(2);
    else if (hasPushes) setSetupStep(3);
    else setSetupStep(3);
  }, [config, pushLog]);

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
        <Loader2 className="w-8 h-8 text-zinc-400 animate-spin" />
      </div>
    );
  }

  const hasCredentials = config?.api_key || (config?.username && config?.password);
  const hasStation = config?.rpid && config?.station_name;

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
                    <span className="text-emerald-400">Auto-sync active</span>
                    {lastRefresh && (
                      <span className="text-zinc-600">
                        — updated {lastRefresh.toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" className="text-zinc-400" onClick={fetchData} data-testid="rp-refresh-btn">
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Step Indicator */}
        <StepIndicator steps={['API Credentials', 'Station Info', 'Enable & Configure', 'Verify & Push']} current={setupStep} />

        {/* Step 1: API Credentials */}
        <div className={`bg-zinc-900 border rounded-xl transition-all ${setupStep === 0 ? 'border-orange-500/30 ring-1 ring-orange-500/20' : hasCredentials ? 'border-emerald-500/20' : 'border-zinc-800'}`}>
          <div className="flex items-center justify-between p-5">
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${hasCredentials ? 'bg-emerald-500/20' : setupStep === 0 ? 'bg-orange-500/20' : 'bg-zinc-800'}`}>
                {hasCredentials ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <Settings className="w-4 h-4 text-orange-400" />}
              </div>
              <div>
                <h3 className="text-white font-medium text-sm">API Credentials</h3>
                <p className="text-xs text-zinc-500">{hasCredentials ? 'Credentials configured' : 'Enter your Radioplayer API key or username/password'}</p>
              </div>
            </div>
          </div>
          {setupStep === 0 && (
            <div className="px-5 pb-5 space-y-4 border-t border-zinc-800 pt-4">
              <div>
                <label className="text-xs text-zinc-400 block mb-1">API Key (Bearer Token)</label>
                <p className="text-[10px] text-zinc-600 mb-2">If set, the API Key will be used instead of username/password</p>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={config?.api_key || ''}
                    onChange={e => setConfig({...config, api_key: e.target.value})}
                    className="bg-zinc-800 border-zinc-700 text-white font-mono pr-10"
                    placeholder="515907f3-a3a9-4500-bbde-..."
                    data-testid="rp-api-key-input"
                  />
                  <button onClick={() => setShowPassword(!showPassword)} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs text-zinc-500">
                <div className="h-px bg-zinc-800 flex-1" />
                <span>or use Basic Auth</span>
                <div className="h-px bg-zinc-800 flex-1" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Username</label>
                  <Input value={config?.username || ''} onChange={e => setConfig({...config, username: e.target.value})} className="bg-zinc-800 border-zinc-700 text-white" placeholder="email@station.fm" data-testid="rp-username-input" />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Password</label>
                  <Input type="password" value={config?.password || ''} onChange={e => setConfig({...config, password: e.target.value})} className="bg-zinc-800 border-zinc-700 text-white" placeholder="••••••••" data-testid="rp-password-input" />
                </div>
              </div>
              <Button onClick={handleSave} disabled={saving} className="bg-orange-600 hover:bg-orange-700 text-white" data-testid="rp-save-creds-btn">
                <Save className="w-4 h-4 mr-1" /> {saving ? 'Saving...' : 'Save Credentials'}
              </Button>
            </div>
          )}
        </div>

        {/* Step 2: Station Info */}
        <div className={`bg-zinc-900 border rounded-xl transition-all ${setupStep === 1 ? 'border-orange-500/30 ring-1 ring-orange-500/20' : hasStation ? 'border-emerald-500/20' : 'border-zinc-800'}`}>
          <div className="flex items-center justify-between p-5">
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${hasStation ? 'bg-emerald-500/20' : setupStep === 1 ? 'bg-orange-500/20' : 'bg-zinc-800'}`}>
                {hasStation ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <Radio className="w-4 h-4 text-orange-400" />}
              </div>
              <div>
                <h3 className="text-white font-medium text-sm">Station Information</h3>
                <p className="text-xs text-zinc-500">{hasStation ? `${config?.station_name} (RPUID: ${config?.rpid})` : 'Enter your station details from radioplayer.org'}</p>
              </div>
            </div>
          </div>
          {setupStep === 1 && (
            <div className="px-5 pb-5 space-y-4 border-t border-zinc-800 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">RPUID (Station ID)</label>
                  <Input value={config?.rpid || ''} onChange={e => setConfig({...config, rpid: e.target.value})} className="bg-zinc-800 border-zinc-700 text-white font-mono" placeholder="0566028" data-testid="rp-rpid-input" />
                  <p className="text-[10px] text-zinc-600 mt-1">Your unique Radioplayer station identifier</p>
                </div>
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Station Name</label>
                  <Input value={config?.station_name || ''} onChange={e => setConfig({...config, station_name: e.target.value})} className="bg-zinc-800 border-zinc-700 text-white" placeholder="Radio GRK" data-testid="rp-station-name-input" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Country Code</label>
                  <Input value={config?.country_code || '056'} onChange={e => setConfig({...config, country_code: e.target.value})} className="bg-zinc-800 border-zinc-700 text-white font-mono" placeholder="056" data-testid="rp-country-input" />
                  <p className="text-[10px] text-zinc-600 mt-1">ISO 3166-1 numeric (e.g. 056 = Belgium)</p>
                </div>
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Ingest Base URL</label>
                  <Input value={config?.ingest_base_url || 'https://core-ingest.radioplayer.cloud'} onChange={e => setConfig({...config, ingest_base_url: e.target.value})} className="bg-zinc-800 border-zinc-700 text-white font-mono text-sm" data-testid="rp-url-input" />
                </div>
              </div>
              <Button onClick={handleSave} disabled={saving} className="bg-orange-600 hover:bg-orange-700 text-white" data-testid="rp-save-station-btn">
                <Save className="w-4 h-4 mr-1" /> {saving ? 'Saving...' : 'Save Station Info'}
              </Button>
            </div>
          )}
        </div>

        {/* Step 3: Enable & Configure */}
        <div className={`bg-zinc-900 border rounded-xl transition-all ${setupStep === 2 ? 'border-orange-500/30 ring-1 ring-orange-500/20' : config?.enabled ? 'border-emerald-500/20' : 'border-zinc-800'}`}>
          <div className="flex items-center justify-between p-5">
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${config?.enabled ? 'bg-emerald-500/20' : setupStep === 2 ? 'bg-orange-500/20' : 'bg-zinc-800'}`}>
                {config?.enabled ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <Settings className="w-4 h-4 text-orange-400" />}
              </div>
              <div>
                <h3 className="text-white font-medium text-sm">Enable & Configure</h3>
                <p className="text-xs text-zinc-500">{config?.enabled ? 'Integration active — auto-push enabled' : 'Enable the integration and configure auto-push settings'}</p>
              </div>
            </div>
          </div>
          {setupStep === 2 && (
            <div className="px-5 pb-5 space-y-4 border-t border-zinc-800 pt-4">
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
                <div className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg">
                  <div>
                    <p className="text-white text-sm">Auto Now Playing</p>
                    <p className="text-xs text-zinc-500">Push on song change</p>
                  </div>
                  <button onClick={() => setConfig({...config, auto_np: !config.auto_np})} className={`w-10 h-5 rounded-full transition-colors relative ${config?.auto_np ? 'bg-green-600' : 'bg-zinc-700'}`} data-testid="rp-auto-np-toggle">
                    <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${config?.auto_np ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
                <div className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg">
                  <div>
                    <p className="text-white text-sm">Auto Schedule</p>
                    <p className="text-xs text-zinc-500">Push on show create/update</p>
                  </div>
                  <button onClick={() => setConfig({...config, auto_schedule: !config.auto_schedule})} className={`w-10 h-5 rounded-full transition-colors relative ${config?.auto_schedule ? 'bg-green-600' : 'bg-zinc-700'}`} data-testid="rp-auto-schedule-toggle">
                    <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${config?.auto_schedule ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              </div>
              <Button onClick={handleSave} disabled={saving} className="bg-orange-600 hover:bg-orange-700 text-white" data-testid="rp-save-btn">
                <Save className="w-4 h-4 mr-1" /> {saving ? 'Saving...' : 'Save & Enable'}
              </Button>
            </div>
          )}
          {setupStep > 2 && config?.enabled && (
            <div className="px-5 pb-4 flex items-center gap-6">
              <div className="flex items-center gap-2 text-xs">
                <span className={`w-2 h-2 rounded-full ${config?.auto_np ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                <span className="text-zinc-400">Auto NP: {config?.auto_np ? 'On' : 'Off'}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className={`w-2 h-2 rounded-full ${config?.auto_schedule ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                <span className="text-zinc-400">Auto Schedule: {config?.auto_schedule ? 'On' : 'Off'}</span>
              </div>
            </div>
          )}
        </div>

        {/* Step 4: Verify & Push */}
        <div className={`bg-zinc-900 border rounded-xl transition-all ${setupStep === 3 ? 'border-orange-500/30 ring-1 ring-orange-500/20' : 'border-zinc-800'}`}>
          <div className="flex items-center justify-between p-5">
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${pushLog.length > 0 ? 'bg-emerald-500/20' : setupStep === 3 ? 'bg-orange-500/20' : 'bg-zinc-800'}`}>
                {pushLog.length > 0 ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <Send className="w-4 h-4 text-orange-400" />}
              </div>
              <div>
                <h3 className="text-white font-medium text-sm">Verify & Push</h3>
                <p className="text-xs text-zinc-500">{pushLog.length > 0 ? `${pushLog.length} push events logged` : 'Test your connection by pushing data manually'}</p>
              </div>
            </div>
            {setupStep >= 3 && config?.enabled && (
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="border-zinc-700 text-zinc-300" onClick={handlePushNP} disabled={pushingNP} data-testid="rp-push-np-btn">
                  <Music className={`w-4 h-4 mr-1 ${pushingNP ? 'animate-pulse' : ''}`} /> Push Now Playing
                </Button>
                <Button size="sm" variant="outline" className="border-zinc-700 text-zinc-300" onClick={handlePushSchedule} disabled={pushingSchedule} data-testid="rp-push-schedule-btn">
                  <Calendar className={`w-4 h-4 mr-1 ${pushingSchedule ? 'animate-pulse' : ''}`} /> Push Schedule
                </Button>
              </div>
            )}
          </div>
          {setupStep >= 3 && (
            <div className="border-t border-zinc-800">
              {pushLog.length === 0 ? (
                <div className="p-8 text-center text-zinc-500">
                  <Send className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No push events yet</p>
                  <p className="text-xs mt-1">Use the buttons above to test your connection</p>
                </div>
              ) : (
                <div className="divide-y divide-zinc-800/50 max-h-96 overflow-y-auto">
                  {pushLog.map((entry, i) => (
                    <div key={i} className="px-6 py-3 flex items-center gap-4 hover:bg-zinc-800/30">
                      <div className="flex-shrink-0">
                        {entry.status === 'success' ? <CheckCircle className="w-5 h-5 text-green-400" /> : <XCircle className="w-5 h-5 text-red-400" />}
                      </div>
                      <div className="flex-shrink-0">
                        {entry.type === 'now_playing' ? <Music className="w-4 h-4 text-blue-400" /> : <Calendar className="w-4 h-4 text-purple-400" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">{entry.detail}</p>
                        <p className="text-xs text-zinc-500">{entry.type === 'now_playing' ? 'Now Playing' : 'Schedule'}{entry.response_code ? ` · HTTP ${entry.response_code}` : ''}</p>
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
          )}
        </div>
      </div>
    </div>
  );
};

export default RadioplayerPage;
