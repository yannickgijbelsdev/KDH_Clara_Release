import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import {
  Monitor, Wifi, WifiOff, Shield, ShieldOff, Settings, RefreshCw,
  Globe, Server, Clock, ChevronRight, AlertCircle, Save, Eye, EyeOff,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ZeroTierPage = () => {
  const { user } = useAuth();
  const { mainSiteSlug } = useParams();
  const [mainSite, setMainSite] = useState(null);
  const [config, setConfig] = useState(null);
  const [network, setNetwork] = useState(null);
  const [members, setMembers] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [configForm, setConfigForm] = useState({ api_token: '', network_id: '' });
  const [savingConfig, setSavingConfig] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);

  const fetchMainSite = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/main-sites`);
      const site = res.data.find(s => s.slug === mainSiteSlug);
      if (site) setMainSite(site);
    } catch {}
  }, [mainSiteSlug]);

  const fetchConfig = useCallback(async () => {
    if (!mainSite) return;
    try {
      const res = await axios.get(`${API}/zerotier/${mainSite.id}/config`);
      setConfig(res.data);
      setConfigForm(prev => ({ ...prev, network_id: res.data.network_id || '' }));
    } catch {}
  }, [mainSite]);

  const fetchData = useCallback(async () => {
    if (!mainSite) return;
    try {
      const [netRes, memRes] = await Promise.all([
        axios.get(`${API}/zerotier/${mainSite.id}/network`).catch(() => null),
        axios.get(`${API}/zerotier/${mainSite.id}/members`).catch(() => null),
      ]);
      if (netRes) setNetwork(netRes.data);
      if (memRes) setMembers(memRes.data);
    } catch {}
  }, [mainSite]);

  useEffect(() => { fetchMainSite(); }, [fetchMainSite]);
  useEffect(() => { if (mainSite) { fetchConfig().then(() => setLoading(false)); } }, [mainSite, fetchConfig]);
  useEffect(() => { if (config?.network_id) fetchData(); }, [config, fetchData]);

  // Auto refresh every 30s
  useEffect(() => {
    if (!config?.network_id) return;
    const interval = setInterval(() => fetchData(), 30000);
    return () => clearInterval(interval);
  }, [config, fetchData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
    toast.success('Data refreshed');
  };

  const handleSaveConfig = async () => {
    if (!mainSite) return;
    setSavingConfig(true);
    try {
      const payload = {};
      if (configForm.api_token) payload.api_token = configForm.api_token;
      if (configForm.network_id) payload.network_id = configForm.network_id;
      await axios.put(`${API}/zerotier/${mainSite.id}/config`, payload);
      toast.success('Configuration saved');
      setConfigForm(prev => ({ ...prev, api_token: '' }));
      setConfigOpen(false);
      await fetchConfig();
      await fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleAuthorize = async (memberId, authorize) => {
    if (!mainSite) return;
    try {
      const action = authorize ? 'authorize' : 'deauthorize';
      await axios.post(`${API}/zerotier/${mainSite.id}/member/${memberId}/${action}`);
      toast.success(`Member ${authorize ? 'authorized' : 'deauthorized'}`);
      await fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Action failed');
    }
  };

  const formatLastSeen = (ts) => {
    if (!ts) return 'Never';
    const date = new Date(ts);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 text-zinc-500 animate-spin" />
      </div>
    );
  }

  const isConfigured = config?.network_id && config?.api_token_masked;

  return (
    <div className="p-6 max-w-7xl mx-auto" data-testid="zerotier-page">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
            <Monitor className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">ZeroTier Network Monitor</h1>
            <p className="text-sm text-zinc-500">Real-time network member monitoring</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfigOpen(!configOpen)}
            className="border-zinc-700 text-zinc-300"
            data-testid="zt-config-btn"
          >
            <Settings className="w-4 h-4 mr-1" /> Config
          </Button>
          {isConfigured && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
              className="border-zinc-700 text-zinc-300"
              data-testid="zt-refresh-btn"
            >
              <RefreshCw className={`w-4 h-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
            </Button>
          )}
        </div>
      </div>

      {/* Config Panel */}
      {configOpen && (
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-5 mb-6" data-testid="zt-config-panel">
          <h3 className="text-white font-medium mb-4">ZeroTier Configuration</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">API Token</label>
              <div className="flex gap-2">
                <Input
                  type={showToken ? 'text' : 'password'}
                  value={configForm.api_token}
                  onChange={e => setConfigForm(prev => ({ ...prev, api_token: e.target.value }))}
                  placeholder={config?.api_token_masked || 'Enter ZeroTier API token'}
                  className="bg-zinc-800 border-zinc-700 text-white"
                  data-testid="zt-token-input"
                />
                <Button variant="ghost" size="icon" onClick={() => setShowToken(!showToken)} className="text-zinc-400">
                  {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
              <p className="text-xs text-zinc-600 mt-1">Get from my.zerotier.com/account</p>
            </div>
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Network ID</label>
              <Input
                value={configForm.network_id}
                onChange={e => setConfigForm(prev => ({ ...prev, network_id: e.target.value }))}
                placeholder="e.g. 8056c2e21c000001"
                className="bg-zinc-800 border-zinc-700 text-white"
                data-testid="zt-network-input"
              />
            </div>
          </div>
          <Button
            onClick={handleSaveConfig}
            disabled={savingConfig}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
            data-testid="zt-save-config"
          >
            <Save className="w-4 h-4 mr-1" /> {savingConfig ? 'Saving...' : 'Save Configuration'}
          </Button>
        </div>
      )}

      {/* Not Configured State */}
      {!isConfigured && (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-12 text-center">
          <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h2 className="text-white text-lg font-semibold mb-2">ZeroTier Not Configured</h2>
          <p className="text-zinc-400 mb-4">Enter your API token and Network ID to start monitoring.</p>
          <Button onClick={() => setConfigOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            <Settings className="w-4 h-4 mr-1" /> Configure Now
          </Button>
        </div>
      )}

      {/* Configured Dashboard */}
      {isConfigured && (
        <>
          {/* Network Overview */}
          {network && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4">
                <div className="flex items-center gap-2 text-zinc-500 text-xs mb-2">
                  <Globe className="w-3.5 h-3.5" /> Network
                </div>
                <p className="text-white font-semibold truncate">{network.name || network.id}</p>
              </div>
              <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4">
                <div className="flex items-center gap-2 text-zinc-500 text-xs mb-2">
                  <Server className="w-3.5 h-3.5" /> Total Members
                </div>
                <p className="text-white font-semibold text-2xl">{members?.total || 0}</p>
              </div>
              <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4">
                <div className="flex items-center gap-2 text-emerald-500 text-xs mb-2">
                  <Wifi className="w-3.5 h-3.5" /> Online
                </div>
                <p className="text-emerald-400 font-semibold text-2xl">{members?.online || 0}</p>
              </div>
              <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4">
                <div className="flex items-center gap-2 text-red-500 text-xs mb-2">
                  <WifiOff className="w-3.5 h-3.5" /> Offline
                </div>
                <p className="text-red-400 font-semibold text-2xl">{members?.offline || 0}</p>
              </div>
            </div>
          )}

          {/* Members List */}
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
              <h3 className="text-white font-medium">Network Members</h3>
              <span className="text-xs text-zinc-500">Auto-refresh: 30s</span>
            </div>
            {!members?.members?.length ? (
              <div className="p-8 text-center text-zinc-500">
                {members === null ? 'Loading members...' : 'No members found'}
              </div>
            ) : (
              <div className="divide-y divide-zinc-800/50">
                {members.members.map(member => (
                  <div
                    key={member.id}
                    className="px-5 py-3 flex items-center gap-4 hover:bg-zinc-800/30 transition-colors cursor-pointer"
                    onClick={() => setSelectedMember(selectedMember?.id === member.id ? null : member)}
                    data-testid={`zt-member-${member.id}`}
                  >
                    {/* Status indicator */}
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${member.online ? 'bg-emerald-400 shadow-lg shadow-emerald-400/30' : 'bg-zinc-600'}`} />

                    {/* Name & ID */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-medium truncate">
                          {member.name || member.id}
                        </span>
                        {member.name && (
                          <span className="text-xs text-zinc-600 font-mono">{member.id}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        {member.ip_assignments?.length > 0 && (
                          <span className="text-xs text-zinc-500 font-mono">{member.ip_assignments[0]}</span>
                        )}
                        {member.physical_address && (
                          <span className="text-xs text-zinc-600">{member.physical_address}</span>
                        )}
                      </div>
                    </div>

                    {/* Auth badge */}
                    <div className="flex items-center gap-2">
                      {member.authorized ? (
                        <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <Shield className="w-3 h-3" /> Auth
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
                          <ShieldOff className="w-3 h-3" /> Unauth
                        </span>
                      )}
                    </div>

                    {/* Last seen */}
                    <div className="text-right flex-shrink-0 w-20">
                      <span className={`text-xs ${member.online ? 'text-emerald-400' : 'text-zinc-500'}`}>
                        {member.online ? 'Online' : formatLastSeen(member.last_seen)}
                      </span>
                    </div>

                    <ChevronRight className={`w-4 h-4 text-zinc-600 transition-transform ${selectedMember?.id === member.id ? 'rotate-90' : ''}`} />
                  </div>
                ))}

                {/* Expanded member detail */}
                {selectedMember && (
                  <div className="px-5 py-4 bg-zinc-800/30 border-t border-zinc-700/50">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                      <div>
                        <span className="text-xs text-zinc-500 block">Node ID</span>
                        <span className="text-sm text-white font-mono">{selectedMember.id}</span>
                      </div>
                      <div>
                        <span className="text-xs text-zinc-500 block">IP Assignments</span>
                        <span className="text-sm text-white font-mono">
                          {selectedMember.ip_assignments?.join(', ') || 'None'}
                        </span>
                      </div>
                      <div>
                        <span className="text-xs text-zinc-500 block">Physical Address</span>
                        <span className="text-sm text-white font-mono">
                          {selectedMember.physical_address || 'Unknown'}
                        </span>
                      </div>
                      <div>
                        <span className="text-xs text-zinc-500 block">Client Version</span>
                        <span className="text-sm text-white">{selectedMember.client_version || 'Unknown'}</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {selectedMember.authorized ? (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={(e) => { e.stopPropagation(); handleAuthorize(selectedMember.id, false); }}
                          data-testid="zt-deauth-btn"
                        >
                          <ShieldOff className="w-3.5 h-3.5 mr-1" /> Deauthorize
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700 text-white"
                          onClick={(e) => { e.stopPropagation(); handleAuthorize(selectedMember.id, true); }}
                          data-testid="zt-auth-btn"
                        >
                          <Shield className="w-3.5 h-3.5 mr-1" /> Authorize
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default ZeroTierPage;
