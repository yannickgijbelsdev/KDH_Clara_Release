import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import {
  Monitor, Wifi, WifiOff, Shield, ShieldOff, Settings, RefreshCw,
  Globe, Server, Clock, ChevronRight, AlertCircle, Save, Eye, EyeOff,
  Pencil, Check, X, Bell, BellOff, UserPlus, Users, Trash2, Mail,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../components/ui/alert-dialog';
import ZeroTierAlertHistory from './ZeroTierAlertHistory';

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
  const [editingName, setEditingName] = useState(null);
  const [editNameValue, setEditNameValue] = useState('');
  const [alertSettings, setAlertSettings] = useState({});
  const [alertDialogMember, setAlertDialogMember] = useState(null);
  const [alertRecipients, setAlertRecipients] = useState([]);
  const [siteUsers, setSiteUsers] = useState([]);
  const [activeTab, setActiveTab] = useState('members'); // 'members' or 'history'
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [sendingSummary, setSendingSummary] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('all'); // 'all', 'client', 'server'
  const [ipEditMember, setIpEditMember] = useState(null);
  const [ipEditValue, setIpEditValue] = useState('');

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

  const handleRenameMember = async (memberId) => {
    if (!mainSite || !editNameValue.trim()) return;
    try {
      await axios.put(`${API}/zerotier/${mainSite.id}/member/${memberId}/name`, { name: editNameValue.trim() });
      toast.success('Name updated');
      setEditingName(null);
      setEditNameValue('');
      await fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to rename');
    }
  };

  // ── Alert Functions ──
  const fetchAlertSettings = useCallback(async () => {
    if (!mainSite) return;
    try {
      const res = await axios.get(`${API}/zerotier/${mainSite.id}/alert-settings`);
      const map = {};
      for (const s of res.data.settings || []) {
        map[s.member_id] = s;
      }
      setAlertSettings(map);
    } catch {}
  }, [mainSite]);

  const fetchSiteUsers = useCallback(async () => {
    if (!mainSite) return;
    try {
      const res = await axios.get(`${API}/main-sites/${mainSite.id}/users`);
      const users = res.data || [];
      // Normalize field names (API returns user_name/user_email, we need name/email)
      const normalized = users.map(u => ({
        user_id: u.user_id || u.id,
        name: u.user_name || u.name || '',
        email: u.user_email || u.email || '',
        avatar_url: u.avatar_url,
        role: u.role,
      }));
      setSiteUsers(normalized);
    } catch {}
  }, [mainSite]);

  useEffect(() => {
    if (mainSite) {
      fetchAlertSettings();
      fetchSiteUsers();
    }
  }, [mainSite, fetchAlertSettings, fetchSiteUsers]);

  const openAlertDialog = (member) => {
    const existing = alertSettings[member.id];
    setAlertRecipients(existing?.recipients || []);
    setAlertDialogMember(member);
  };

  const toggleRecipient = (u) => {
    setAlertRecipients(prev => {
      const uid = u.user_id;
      const exists = prev.find(r => r.user_id === uid);
      if (exists) return prev.filter(r => r.user_id !== uid);
      return [...prev, { user_id: uid, email: u.email, name: u.name }];
    });
  };

  const saveAlertSettings = async () => {
    if (!mainSite || !alertDialogMember) return;
    try {
      await axios.put(`${API}/zerotier/${mainSite.id}/member/${alertDialogMember.id}/alert`, {
        enabled: alertRecipients.length > 0,
        recipients: alertRecipients,
      });
      toast.success(alertRecipients.length > 0 ? 'Alert enabled' : 'Alert disabled');
      setAlertDialogMember(null);
      await fetchAlertSettings();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Save failed');
    }
  };

  const quickToggleAlert = async (member) => {
    if (!mainSite) return;
    const existing = alertSettings[member.id];
    if (existing?.enabled) {
      // Disable alert
      await axios.put(`${API}/zerotier/${mainSite.id}/member/${member.id}/alert`, { enabled: false, recipients: [] });
      toast.success('Alert disabled');
      await fetchAlertSettings();
    } else {
      // Open dialog to configure recipients
      openAlertDialog(member);
    }
  };

  const handleDeleteMember = async (member) => {
    if (!mainSite) return;
    try {
      await axios.delete(`${API}/zerotier/${mainSite.id}/member/${member.id}`);
      toast.success(`${member.name || member.id} deleted from network`);
      setDeleteConfirm(null);
      setSelectedMember(null);
      await fetchData();
      await fetchAlertSettings();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete member');
    }
  };

  const handleSendDailySummary = async () => {
    if (!mainSite) return;
    setSendingSummary(true);
    try {
      await axios.post(`${API}/zerotier/${mainSite.id}/send-daily-summary`);
      toast.success('Daily summary is being sent');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to send summary');
    } finally {
      setSendingSummary(false);
    }
  };

  const handleSetCategory = async (memberId, category) => {
    if (!mainSite) return;
    try {
      await axios.put(`${API}/zerotier/${mainSite.id}/member/${memberId}/category`, { category });
      toast.success(`Category set to ${category}`);
      await fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update category');
    }
  };

  const handleUpdateIp = async () => {
    if (!mainSite || !ipEditMember) return;
    const ips = ipEditValue.split(',').map(ip => ip.trim()).filter(Boolean);
    if (ips.length === 0) {
      toast.error('Enter at least one IP address');
      return;
    }
    try {
      await axios.put(`${API}/zerotier/${mainSite.id}/member/${ipEditMember.id}/ip`, { ip_assignments: ips });
      toast.success('IP assignments updated');
      setIpEditMember(null);
      setIpEditValue('');
      await fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update IP');
    }
  };

  const filteredMembers = members?.members?.filter(m => {
    if (categoryFilter === 'all') return true;
    return m.category === categoryFilter;
  }) || [];

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
            className="border-zinc-300 text-zinc-600"
            data-testid="zt-config-btn"
          >
            <Settings className="w-4 h-4 mr-1" /> Config
          </Button>
          {isConfigured && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSendDailySummary}
                disabled={sendingSummary}
                className="border-zinc-300 text-zinc-600"
                data-testid="zt-send-summary-btn"
              >
                <Mail className={`w-4 h-4 mr-1 ${sendingSummary ? 'animate-pulse' : ''}`} /> {sendingSummary ? 'Sending...' : 'Send Summary'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={refreshing}
                className="border-zinc-300 text-zinc-600"
                data-testid="zt-refresh-btn"
              >
                <RefreshCw className={`w-4 h-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      {isConfigured && (
        <div className="flex gap-1 bg-white/80 backdrop-blur rounded-lg p-1 mb-6 w-fit" data-testid="zt-tabs">
          <button
            onClick={() => setActiveTab('members')}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'members' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-600'
            }`}
            data-testid="zt-tab-members"
          >
            <Monitor className="w-3.5 h-3.5" /> Members
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'history' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-600'
            }`}
            data-testid="zt-tab-history"
          >
            <Clock className="w-3.5 h-3.5" /> Alert History
          </button>
        </div>
      )}

      {/* Config Panel */}
      {configOpen && (
        <div className="bg-white/70 border border-zinc-200 rounded-xl p-5 mb-6" data-testid="zt-config-panel">
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
                  className="bg-zinc-800 border-zinc-300 text-white"
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
                className="bg-zinc-800 border-zinc-300 text-white"
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
        <div className="bg-white/60 border border-zinc-200 rounded-xl p-12 text-center">
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
              <div className="bg-white/70 border border-zinc-200 rounded-xl p-4">
                <div className="flex items-center gap-2 text-zinc-500 text-xs mb-2">
                  <Globe className="w-3.5 h-3.5" /> Network
                </div>
                <p className="text-white font-semibold truncate">{network.name || network.id}</p>
              </div>
              <div className="bg-white/70 border border-zinc-200 rounded-xl p-4">
                <div className="flex items-center gap-2 text-zinc-500 text-xs mb-2">
                  <Server className="w-3.5 h-3.5" /> Total Members
                </div>
                <p className="text-white font-semibold text-2xl">{members?.total || 0}</p>
              </div>
              <div className="bg-white/70 border border-zinc-200 rounded-xl p-4">
                <div className="flex items-center gap-2 text-emerald-500 text-xs mb-2">
                  <Wifi className="w-3.5 h-3.5" /> Online
                </div>
                <p className="text-emerald-400 font-semibold text-2xl">{members?.online || 0}</p>
              </div>
              <div className="bg-white/70 border border-zinc-200 rounded-xl p-4">
                <div className="flex items-center gap-2 text-red-500 text-xs mb-2">
                  <WifiOff className="w-3.5 h-3.5" /> Offline
                </div>
                <p className="text-red-400 font-semibold text-2xl">{members?.offline || 0}</p>
              </div>
            </div>
          )}

          {/* Members List */}
          <div className="bg-white/70 border border-zinc-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-200 flex items-center justify-between">
              <div>
                <h3 className="text-white font-medium">Network Members</h3>
                <p className="text-xs text-zinc-600 mt-0.5">Clients offline for 30+ days are automatically deauthorized</p>
              </div>
              <div className="flex items-center gap-3">
                {/* Category filter */}
                <div className="flex bg-white/40 backdrop-blur-sm rounded-lg p-0.5" data-testid="zt-category-filter">
                  {[
                    { key: 'all', label: 'All' },
                    { key: 'client', label: 'Clients', icon: Monitor },
                    { key: 'server', label: 'Servers', icon: Server },
                  ].map(f => (
                    <button
                      key={f.key}
                      onClick={() => setCategoryFilter(f.key)}
                      className={`flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                        categoryFilter === f.key
                          ? 'bg-zinc-200 text-white'
                          : 'text-zinc-500 hover:text-zinc-600'
                      }`}
                      data-testid={`zt-filter-${f.key}`}
                    >
                      {f.icon && <f.icon className="w-3 h-3" />}
                      {f.label}
                    </button>
                  ))}
                </div>
                <span className="text-xs text-zinc-500">Auto-refresh: 30s</span>
              </div>
            </div>
            {!filteredMembers.length ? (
              <div className="p-8 text-center text-zinc-500">
                {members === null ? 'Loading members...' : categoryFilter !== 'all' ? `No ${categoryFilter}s found` : 'No members found'}
              </div>
            ) : (
              <div className="divide-y divide-zinc-800/50">
                {filteredMembers.map(member => (
                  <div key={member.id}>
                    <div
                      className="px-5 py-3 flex items-center gap-4 hover:bg-zinc-100/30 transition-colors cursor-pointer group"
                      onClick={() => setSelectedMember(selectedMember?.id === member.id ? null : member)}
                      data-testid={`zt-member-${member.id}`}
                    >
                      {/* Status indicator */}
                      <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${member.online ? 'bg-emerald-400 shadow-lg shadow-emerald-400/30' : 'bg-zinc-600'}`} />

                      {/* Name & ID */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {editingName === member.id ? (
                            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                              <Input
                                value={editNameValue}
                                onChange={e => setEditNameValue(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handleRenameMember(member.id); if (e.key === 'Escape') setEditingName(null); }}
                                className="h-7 text-sm bg-zinc-800 border-zinc-600 w-48"
                                autoFocus
                                data-testid={`zt-rename-input-${member.id}`}
                              />
                              <Button size="icon" variant="ghost" className="w-7 h-7" onClick={() => handleRenameMember(member.id)} data-testid={`zt-rename-save-${member.id}`}>
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                              </Button>
                              <Button size="icon" variant="ghost" className="w-7 h-7" onClick={() => setEditingName(null)}>
                                <X className="w-3.5 h-3.5 text-zinc-400" />
                              </Button>
                            </div>
                          ) : (
                            <>
                              <span className="text-white font-medium truncate">
                                {member.name || member.id}
                              </span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                member.category === 'server'
                                  ? 'bg-blue-500/15 text-blue-400 border border-blue-500/25'
                                  : 'bg-zinc-700/50 text-zinc-500 border border-zinc-600/25'
                              }`} data-testid={`zt-category-badge-${member.id}`}>
                                {member.category === 'server' ? 'Server' : 'Client'}
                              </span>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="w-6 h-6 opacity-0 group-hover:opacity-100 hover:!opacity-100"
                                onClick={e => { e.stopPropagation(); setEditingName(member.id); setEditNameValue(member.name || ''); }}
                                data-testid={`zt-rename-btn-${member.id}`}
                              >
                                <Pencil className="w-3 h-3 text-zinc-500" />
                              </Button>
                              {member.name && (
                                <span className="text-xs text-zinc-600 font-mono">{member.id}</span>
                              )}
                            </>
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

                      {/* Alert toggle */}
                      <div className="flex-shrink-0" onClick={e => e.stopPropagation()}>
                        {alertSettings[member.id]?.enabled ? (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="w-8 h-8 text-amber-400 hover:text-amber-300 relative"
                            onClick={() => openAlertDialog(member)}
                            title={`Alert active (${alertSettings[member.id]?.recipients?.length || 0} recipients)`}
                            data-testid={`zt-alert-on-${member.id}`}
                          >
                            <Bell className="w-4 h-4" />
                            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-amber-400 rounded-full border border-zinc-900" />
                          </Button>
                        ) : (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="w-8 h-8 text-zinc-600 hover:text-amber-400 opacity-0 group-hover:opacity-100"
                            onClick={() => openAlertDialog(member)}
                            title="Enable alert"
                            data-testid={`zt-alert-off-${member.id}`}
                          >
                            <BellOff className="w-4 h-4" />
                          </Button>
                        )}
                      </div>

                      {/* Auth toggle */}
                      <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                        {member.authorized ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs text-emerald-400 hover:text-red-400 hover:bg-red-500/10 border border-emerald-500/20 hover:border-red-500/20"
                            onClick={() => handleAuthorize(member.id, false)}
                            data-testid={`zt-deauth-inline-${member.id}`}
                          >
                            <Shield className="w-3 h-3 mr-1" /> Authorized
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            className="h-7 px-2 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                            onClick={() => handleAuthorize(member.id, true)}
                            data-testid={`zt-auth-inline-${member.id}`}
                          >
                            <ShieldOff className="w-3 h-3 mr-1" /> Authorize
                          </Button>
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

                    {/* Expanded member detail */}
                    {selectedMember?.id === member.id && (
                      <div className="px-5 py-4 bg-zinc-800/30 border-t border-zinc-300/50">
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
                          <div>
                            <span className="text-xs text-zinc-500 block">Node ID</span>
                            <span className="text-sm text-white font-mono">{selectedMember.id}</span>
                          </div>
                          <div>
                            <span className="text-xs text-zinc-500 block">IP Assignments</span>
                            <button
                              className="text-sm text-white font-mono hover:text-blue-400 transition-colors flex items-center gap-1"
                              onClick={(e) => {
                                e.stopPropagation();
                                setIpEditMember(member);
                                setIpEditValue(member.ip_assignments?.join(', ') || '');
                              }}
                              data-testid={`zt-ip-edit-btn-${member.id}`}
                            >
                              {selectedMember.ip_assignments?.join(', ') || 'None'}
                              <Pencil className="w-3 h-3 text-zinc-600" />
                            </button>
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
                          <div>
                            <span className="text-xs text-zinc-500 block mb-1">Category</span>
                            <div className="flex gap-1" onClick={e => e.stopPropagation()} data-testid={`zt-category-toggle-${member.id}`}>
                              <button
                                onClick={() => handleSetCategory(member.id, 'client')}
                                className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                                  member.category !== 'server'
                                    ? 'bg-zinc-600 text-white'
                                    : 'bg-zinc-800 text-zinc-500 hover:text-zinc-600'
                                }`}
                              >
                                <Monitor className="w-3 h-3" /> Client
                              </button>
                              <button
                                onClick={() => handleSetCategory(member.id, 'server')}
                                className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                                  member.category === 'server'
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-zinc-800 text-zinc-500 hover:text-zinc-600'
                                }`}
                              >
                                <Server className="w-3 h-3" /> Server
                              </button>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          <Button
                            size="sm"
                            variant="outline"
                            className={`border-zinc-300 ${alertSettings[member.id]?.enabled ? 'text-amber-400 border-amber-500/30' : ''}`}
                            onClick={(e) => { e.stopPropagation(); openAlertDialog(member); }}
                            data-testid="zt-alert-expanded-btn"
                          >
                            <Bell className="w-3.5 h-3.5 mr-1" />
                            {alertSettings[member.id]?.enabled
                              ? `Alert (${alertSettings[member.id]?.recipients?.length || 0} recipients)`
                              : 'Configure Alert'}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-zinc-300"
                            onClick={(e) => { e.stopPropagation(); setEditingName(member.id); setEditNameValue(member.name || ''); }}
                            data-testid="zt-rename-expanded-btn"
                          >
                            <Pencil className="w-3.5 h-3.5 mr-1" /> Rename
                          </Button>
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
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
                            onClick={(e) => { e.stopPropagation(); setDeleteConfirm(member); }}
                            data-testid={`zt-delete-btn-${member.id}`}
                          >
                            <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Alert Configuration Dialog */}
      <Dialog open={!!alertDialogMember} onOpenChange={() => setAlertDialogMember(null)}>
        <DialogContent className="bg-white/50 backdrop-blur-lg border-white/60 text-zinc-900 max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-amber-400" />
              Alert for {alertDialogMember?.name || alertDialogMember?.id}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-zinc-400 -mt-2">
            Select which team members receive an email when this client goes offline or comes back online.
          </p>
          <div className="space-y-1 max-h-64 overflow-y-auto mt-2">
            {siteUsers.length === 0 ? (
              <p className="text-zinc-500 text-sm text-center py-4">No team members found</p>
            ) : (
              siteUsers.map(u => {
                const uid = u.user_id || u.id;
                const selected = alertRecipients.some(r => r.user_id === uid);
                return (
                  <button
                    key={uid}
                    onClick={() => toggleRecipient(u)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                      selected ? 'bg-amber-500/15 border border-amber-500/30' : 'border border-transparent hover:bg-zinc-100'
                    }`}
                    data-testid={`alert-recipient-${uid}`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                      selected ? 'bg-amber-500 text-white' : 'bg-zinc-200 text-zinc-400'
                    }`}>
                      {(u.name || u.email || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white truncate">{u.name || u.email}</div>
                      <div className="text-xs text-zinc-500 truncate">{u.email}</div>
                    </div>
                    {selected && <Check className="w-4 h-4 text-amber-400 flex-shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
          <div className="flex justify-between items-center mt-4 pt-3 border-t border-zinc-200">
            <span className="text-xs text-zinc-500">
              {alertRecipients.length} recipient{alertRecipients.length !== 1 ? 's' : ''} selected
            </span>
            <div className="flex gap-2">
              {alertSettings[alertDialogMember?.id]?.enabled && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-400 hover:bg-red-500/10"
                  onClick={async () => {
                    setAlertRecipients([]);
                    await axios.put(`${API}/zerotier/${mainSite.id}/member/${alertDialogMember.id}/alert`, { enabled: false, recipients: [] });
                    toast.success('Alert disabled');
                    setAlertDialogMember(null);
                    fetchAlertSettings();
                  }}
                  data-testid="zt-alert-disable-btn"
                >
                  Disable Alert
                </Button>
              )}
              <Button
                size="sm"
                className="bg-amber-600 hover:bg-amber-700 text-white"
                onClick={saveAlertSettings}
                disabled={alertRecipients.length === 0}
                data-testid="zt-alert-save-btn"
              >
                <Bell className="w-3.5 h-3.5 mr-1" /> Save Alert
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent className="bg-white/50 backdrop-blur-lg border-white/60 text-zinc-900">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-red-400" />
              Delete Member
            </AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              Are you sure you want to delete <strong className="text-white">{deleteConfirm?.name || deleteConfirm?.id}</strong> from the ZeroTier network? This action cannot be undone. The client will need to be re-authorized if it reconnects.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-zinc-800 border-zinc-300 text-zinc-600 hover:bg-zinc-200">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => handleDeleteMember(deleteConfirm)}
              data-testid="zt-delete-confirm-btn"
            >
              <Trash2 className="w-4 h-4 mr-1" /> Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* IP Edit Dialog */}
      <AlertDialog open={!!ipEditMember} onOpenChange={() => setIpEditMember(null)}>
        <AlertDialogContent className="bg-white/50 backdrop-blur-lg border-white/60 text-zinc-900">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-400" />
              Change IP Assignment
            </AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              <span className="block mb-3">
                You are about to change the IP assignment for <strong className="text-white">{ipEditMember?.name || ipEditMember?.id}</strong>.
              </span>
              <span className="block p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm">
                <strong>Warning:</strong> Changing the IP address may cause the device to become unreachable on the network. Make sure you have alternative access to the device before proceeding.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="mt-2">
            <label className="text-xs text-zinc-500 block mb-1">IP Address(es)</label>
            <Input
              value={ipEditValue}
              onChange={e => setIpEditValue(e.target.value)}
              placeholder="e.g. 10.147.17.50"
              className="bg-zinc-800 border-zinc-300 text-white font-mono"
              onKeyDown={e => { if (e.key === 'Enter') handleUpdateIp(); }}
              data-testid="zt-ip-edit-input"
            />
            <p className="text-xs text-zinc-600 mt-1">Separate multiple IPs with commas</p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-zinc-800 border-zinc-300 text-zinc-600 hover:bg-zinc-200">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={handleUpdateIp}
              data-testid="zt-ip-edit-confirm-btn"
            >
              Update IP
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ZeroTierPage;
