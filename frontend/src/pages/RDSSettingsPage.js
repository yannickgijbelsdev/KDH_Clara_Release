import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState({
    production_base_url: '',
    cache_refresh_interval: 5,
  });

  const fetchData = useCallback(async () => {
    try {
      const [settingsRes, endpointsRes, logsRes] = await Promise.all([
        axios.get(`${API}/rds/settings`),
        axios.get(`${API}/rds/endpoints`),
        axios.get(`${API}/rds/logs?limit=20`),
      ]);
      setSettings(settingsRes.data);
      setEndpoints(endpointsRes.data);
      setLogs(logsRes.data);
      setEditData({
        production_base_url: settingsRes.data.production_base_url,
        cache_refresh_interval: settingsRes.data.cache_refresh_interval,
      });
    } catch (error) {
      toast.error('Kon RDS instellingen niet laden');
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
      toast.success('Instellingen opgeslagen');
      // Refresh endpoints to get new URLs
      const endpointsRes = await axios.get(`${API}/rds/endpoints`);
      setEndpoints(endpointsRes.data);
    } catch (error) {
      toast.error('Kon instellingen niet opslaan');
    } finally {
      setSaving(false);
    }
  };

  const handleRefreshCache = async () => {
    setRefreshing(true);
    try {
      const response = await axios.post(`${API}/rds/refresh-cache`);
      toast.success(response.data.message || 'Cache vernieuwd');
      // Refresh logs
      const logsRes = await axios.get(`${API}/rds/logs?limit=20`);
      setLogs(logsRes.data);
      // Update last refresh time
      const settingsRes = await axios.get(`${API}/rds/settings`);
      setSettings(settingsRes.data);
    } catch (error) {
      toast.error('Kon cache niet vernieuwen');
    } finally {
      setRefreshing(false);
    }
  };

  const copyToClipboard = (url, name) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(name);
    toast.success('URL gekopieerd');
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
        return 'Succes';
      case 'failed':
        return 'Mislukt';
      case 'no_show':
        return 'Geen show';
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
            <h1 className="text-2xl font-bold text-white">RDS Instellingen</h1>
            <p className="text-sm text-zinc-500">MagicRDS en externe systemen integratie</p>
          </div>
        </div>
        <Button
          onClick={handleRefreshCache}
          disabled={refreshing}
          className="gap-2 bg-orange-500 hover:bg-orange-600 text-white"
          data-testid="refresh-cache-btn"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Vernieuwen...' : 'Cache Vernieuwen'}
        </Button>
      </div>

      {/* Settings Section */}
      <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-orange-400" />
            <h2 className="text-lg font-semibold text-white">Configuratie</h2>
          </div>
          {!editMode ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditMode(true)}
              className="gap-2 border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            >
              <Settings className="w-4 h-4" />
              Bewerken
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
                Annuleren
              </Button>
              <Button
                size="sm"
                onClick={handleSaveSettings}
                disabled={saving}
                className="gap-2 bg-orange-500 hover:bg-orange-600 text-white"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Opslaan...' : 'Opslaan'}
              </Button>
            </div>
          )}
        </div>

        {editMode ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-zinc-300">Productie Base URL</Label>
              <Input
                value={editData.production_base_url}
                onChange={(e) => setEditData({ ...editData, production_base_url: e.target.value })}
                placeholder="https://clara.koodh.com"
                className="bg-[#27272a] border-zinc-700 text-white font-mono"
              />
              <p className="text-xs text-zinc-500">
                De basis URL van je productie omgeving. Dit wordt gebruikt voor de API endpoints.
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-300">Cache Vernieuwingsinterval (minuten)</Label>
              <Input
                type="number"
                min="1"
                max="60"
                value={editData.cache_refresh_interval}
                onChange={(e) => setEditData({ ...editData, cache_refresh_interval: parseInt(e.target.value) || 5 })}
                className="bg-[#27272a] border-zinc-700 text-white w-24"
              />
              <p className="text-xs text-zinc-500">
                Hoe vaak de live show cache automatisch wordt vernieuwd.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-zinc-500 text-sm mb-1">Productie URL</p>
              <p className="text-white font-mono">{settings?.production_base_url || '-'}</p>
            </div>
            <div>
              <p className="text-zinc-500 text-sm mb-1">Cache Interval</p>
              <p className="text-white">Elke {settings?.cache_refresh_interval || 5} minuten</p>
            </div>
            <div>
              <p className="text-zinc-500 text-sm mb-1">Laatste Cache Vernieuwing</p>
              <p className="text-white">
                {settings?.last_cache_refresh
                  ? format(new Date(settings.last_cache_refresh), 'dd MMM yyyy HH:mm:ss', { locale: nl })
                  : 'Nog niet uitgevoerd'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* API Endpoints Section */}
      <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <ExternalLink className="w-5 h-5 text-violet-400" />
          <h2 className="text-lg font-semibold text-white">API Endpoints</h2>
        </div>
        <p className="text-zinc-500 text-sm mb-4">
          Kopieer deze URLs om te gebruiken in MagicRDS of andere externe systemen.
        </p>

        {/* Group endpoints by station */}
        {['mfy', 'grk', 'all'].map((station) => {
          const stationEndpoints = endpoints?.endpoints?.filter(e => e.station === station) || [];
          if (stationEndpoints.length === 0) return null;
          
          const stationName = station === 'mfy' ? 'Radio MFY' : station === 'grk' ? 'Radio GRK' : 'Alle Stations';
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
                          <h4 className="text-white text-sm font-medium">{endpoint.name.replace(`${station.toUpperCase()} - `, '').replace('Alle Stations - ', '')}</h4>
                          <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full">
                            Publiek
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
            <p className="text-zinc-500">Nog geen cache logs</p>
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
                    {format(new Date(log.timestamp), 'dd MMM yyyy HH:mm:ss', { locale: nl })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default RDSSettingsPage;
