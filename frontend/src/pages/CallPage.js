/* eslint-disable */
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCall } from '../context/CallContext';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import {
  Phone, PhoneCall, PhoneOff, Plus, Trash2, Copy, ExternalLink,
  Mic, Volume2, Settings, Clock, Loader2, CheckCircle, XCircle,
  AlertTriangle, Signal, Link2, Users, Edit, Save, X
} from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

export default function CallPage() {
  const { token } = useAuth();
  const [tab, setTab] = useState('calls');

  const tabs = [
    { id: 'calls', label: 'Call', icon: Phone },
    { id: 'profiles', label: 'Audio Profiles', icon: Settings },
    { id: 'history', label: 'Call History', icon: Clock },
  ];

  return (
    <div className="p-6" data-testid="call-page">
      <div className="flex items-center gap-3 mb-8">
        <Phone className="w-7 h-7 text-green-500" />
        <div>
          <h1 className="text-2xl font-bold">Call Studio</h1>
          <p className="text-sm text-zinc-500">Invite callers to your broadcast</p>
        </div>
      </div>

      <div className="flex gap-2 mb-8" data-testid="call-tabs">
        {tabs.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                tab === t.id ? 'bg-green-600 text-white' : 'bg-zinc-100 text-zinc-600 border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-200'
              }`}
              data-testid={`tab-${t.id}`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'calls' && <CallsTab token={token} />}
      {tab === 'profiles' && <ProfilesTab token={token} />}
      {tab === 'history' && <HistoryTab token={token} />}
    </div>
  );
}


// ============== CALLS TAB ==============
function CallsTab({ token }) {
  const { activeCall, callState, startCall, endCall } = useCall();
  const [invites, setInvites] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [label, setLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const fetchData = useCallback(async () => {
    try {
      const [invRes, profRes] = await Promise.all([
        fetch(`${API}/api/calls/invites`, { headers }),
        fetch(`${API}/api/calls/profiles`, { headers }),
      ]);
      if (invRes.ok) {
        const data = await invRes.json();
        setInvites(data.invites || []);
      }
      if (profRes.ok) {
        const data = await profRes.json();
        setProfiles(data.profiles || []);
        if (data.profiles?.length > 0 && !selectedProfile) {
          setSelectedProfile(data.profiles[0]);
        }
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [token]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Poll for invite status updates
  useEffect(() => {
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const createInvite = async () => {
    setCreating(true);
    try {
      const res = await fetch(`${API}/api/calls/invites`, {
        method: 'POST', headers, body: JSON.stringify({ label }),
      });
      if (res.ok) {
        toast.success('Invite link created');
        setLabel('');
        fetchData();
      }
    } catch (e) { toast.error('Failed to create invite'); }
    setCreating(false);
  };

  const deleteInvite = async (id) => {
    await fetch(`${API}/api/calls/invites/${id}`, { method: 'DELETE', headers });
    toast.success('Invite deleted');
    fetchData();
  };

  const copyLink = (url) => {
    navigator.clipboard.writeText(url);
    toast.success('Link copied!');
  };

  const handleStartCall = async (invite) => {
    try {
      await startCall(invite.id, token, selectedProfile);
      toast.success('Call started, waiting for caller...');
    } catch (e) {
      toast.error('Could not start call. Check microphone permissions.');
    }
  };

  const handleEndCall = async (invite) => {
    try {
      endCall();
      await fetch(`${API}/api/calls/invites/${invite.id}/end`, { method: 'POST', headers });
      toast.success('Call ended');
      fetchData();
    } catch (e) { /* ignore */ }
  };

  if (loading) return <Spinner />;

  const activeInvites = invites.filter(i => i.status !== 'ended');
  const statusColor = { pending: 'bg-amber-500/10 text-amber-400', active: 'bg-green-500/10 text-green-400', ended: 'bg-zinc-100 text-zinc-500' };

  return (
    <div className="space-y-6" data-testid="calls-tab">
      {/* Audio Profile Selector */}
      <div className="bg-white/80 backdrop-blur rounded-xl border border-zinc-200 p-5">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Settings className="w-4 h-4 text-zinc-400" /> Active Audio Profile
        </h3>
        {profiles.length === 0 ? (
          <p className="text-xs text-zinc-500">No audio profiles yet. Create one in the "Audio Profiles" tab first.</p>
        ) : (
          <div className="flex gap-2 flex-wrap">
            {profiles.map(p => (
              <button
                key={p.id}
                onClick={() => setSelectedProfile(p)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  selectedProfile?.id === p.id
                    ? 'bg-green-600 text-white'
                    : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'
                }`}
                data-testid={`profile-select-${p.id}`}
              >
                <Mic className="w-3 h-3 inline mr-1.5" />
                {p.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Create Invite */}
      <div className="bg-white/80 backdrop-blur rounded-xl border border-zinc-200 p-5">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Link2 className="w-4 h-4 text-green-400" /> Create Invite Link
        </h3>
        <div className="flex gap-3">
          <input
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="Caller name or description (optional)"
            className="flex-1 bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2.5 text-sm"
            data-testid="invite-label-input"
          />
          <Button
            onClick={createInvite}
            disabled={creating}
            className="bg-green-600 hover:bg-green-700"
            data-testid="create-invite-btn"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 mr-2" /> Create Link</>}
          </Button>
        </div>
      </div>

      {/* Active Invites */}
      {activeInvites.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Users className="w-4 h-4 text-zinc-400" /> Active Links ({activeInvites.length})
          </h3>
          {activeInvites.map(invite => {
            const isThisCallActive = activeCall?.inviteId === invite.id && callState !== 'idle';

            return (
              <div key={invite.id} className="bg-white/80 backdrop-blur rounded-xl border border-zinc-200 p-5" data-testid={`invite-${invite.id}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      invite.status === 'active' ? 'bg-green-500/10' : 'bg-zinc-100'
                    }`}>
                      {invite.status === 'active' ? (
                        <PhoneCall className="w-5 h-5 text-green-400" />
                      ) : (
                        <Phone className="w-5 h-5 text-zinc-500" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {invite.caller_name || invite.label || 'Unnamed'}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor[invite.status]}`}>
                          {invite.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-zinc-500 font-mono truncate max-w-[300px]">{invite.url}</span>
                        <button onClick={() => copyLink(invite.url)} className="text-zinc-500 hover:text-zinc-600" title="Copy link">
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <a href={invite.url} target="_blank" rel="noopener noreferrer" className="text-zinc-500 hover:text-zinc-600" title="Open link">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                      <span className="text-xs text-zinc-600 mt-1 block">
                        {new Date(invite.created_at).toLocaleString('en-GB')}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {invite.status === 'active' && !isThisCallActive && (
                      <Button
                        onClick={() => handleStartCall(invite)}
                        className="bg-green-600 hover:bg-green-700"
                        size="sm"
                        data-testid={`start-call-${invite.id}`}
                      >
                        <Phone className="w-4 h-4 mr-1" /> Connect
                      </Button>
                    )}
                    {invite.status === 'pending' && !isThisCallActive && (
                      <Button
                        onClick={() => handleStartCall(invite)}
                        variant="outline"
                        size="sm"
                        data-testid={`wait-call-${invite.id}`}
                      >
                        <Phone className="w-4 h-4 mr-1" /> Wait for caller
                      </Button>
                    )}
                    {isThisCallActive && (
                      <Button
                        onClick={() => handleEndCall(invite)}
                        className="bg-red-600 hover:bg-red-700"
                        size="sm"
                        data-testid={`end-call-${invite.id}`}
                      >
                        <PhoneOff className="w-4 h-4 mr-1" /> End Call
                      </Button>
                    )}
                    <button
                      onClick={() => deleteInvite(invite.id)}
                      className="p-2 rounded-lg hover:bg-zinc-100 text-zinc-500 hover:text-red-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {activeInvites.length === 0 && (
        <div className="bg-white/80 backdrop-blur rounded-xl border border-zinc-200 p-12 text-center">
          <Phone className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
          <p className="text-sm text-zinc-500">No active invite links. Create one to start calling.</p>
        </div>
      )}
    </div>
  );
}


// ============== PROFILES TAB ==============
function ProfilesTab({ token }) {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [devices, setDevices] = useState({ inputs: [], outputs: [] });
  const [form, setForm] = useState({ name: '', input_device_id: '', output_device_id: '' });
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [deviceWarnings, setDeviceWarnings] = useState({});
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const fetchProfiles = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/calls/profiles`, { headers });
      if (res.ok) setProfiles((await res.json()).profiles || []);
    } catch (_e) { /* noop */ }
    setLoading(false);
  }, [token]);

  const enumerateDevices = useCallback(async () => {
    try {
      // Need to request permission first to get device labels
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const inputs = allDevices.filter(d => d.kind === 'audioinput');
      const outputs = allDevices.filter(d => d.kind === 'audiooutput');
      setDevices({ inputs, outputs });

      // Check saved profiles against available devices
      const inputIds = new Set(inputs.map(d => d.deviceId));
      const outputIds = new Set(outputs.map(d => d.deviceId));
      const warnings = {};
      for (const p of profiles) {
        const issues = [];
        if (p.input_device_id && !inputIds.has(p.input_device_id)) {
          issues.push(`Input "${p.input_device_label}" not available`);
        }
        if (p.output_device_id && !outputIds.has(p.output_device_id)) {
          issues.push(`Output "${p.output_device_label}" not available`);
        }
        if (issues.length) warnings[p.id] = issues;
      }
      setDeviceWarnings(warnings);
    } catch (e) {
      console.warn('Could not enumerate devices:', e);
    }
  }, [profiles]);

  useEffect(() => { fetchProfiles(); }, [fetchProfiles]);
  useEffect(() => { if (profiles.length > 0) enumerateDevices(); }, [profiles, enumerateDevices]);

  const saveProfile = async () => {
    if (!form.name.trim()) return;
    setSaving(true);

    const inputDevice = devices.inputs.find(d => d.deviceId === form.input_device_id);
    const outputDevice = devices.outputs.find(d => d.deviceId === form.output_device_id);

    const body = {
      name: form.name,
      input_device_id: form.input_device_id || null,
      input_device_label: inputDevice?.label || null,
      output_device_id: form.output_device_id || null,
      output_device_label: outputDevice?.label || null,
    };

    try {
      const url = editingId ? `${API}/api/calls/profiles/${editingId}` : `${API}/api/calls/profiles`;
      const method = editingId ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers, body: JSON.stringify(body) });
      if (res.ok) {
        toast.success(editingId ? 'Profile updated' : 'Profile created');
        setShowForm(false);
        setEditingId(null);
        setForm({ name: '', input_device_id: '', output_device_id: '' });
        fetchProfiles();
      }
    } catch (e) { toast.error('Failed to save profile'); }
    setSaving(false);
  };

  const editProfile = (p) => {
    setForm({
      name: p.name,
      input_device_id: p.input_device_id || '',
      output_device_id: p.output_device_id || '',
    });
    setEditingId(p.id);
    setShowForm(true);
  };

  const deleteProfile = async (id) => {
    await fetch(`${API}/api/calls/profiles/${id}`, { method: 'DELETE', headers });
    toast.success('Profile deleted');
    fetchProfiles();
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6" data-testid="profiles-tab">
      <div className="flex items-center justify-between">
        <p className="text-sm text-zinc-500">{profiles.length} audio profile(s)</p>
        <Button
          onClick={() => { setShowForm(!showForm); setEditingId(null); setForm({ name: '', input_device_id: '', output_device_id: '' }); enumerateDevices(); }}
          className="bg-green-600 hover:bg-green-700"
          data-testid="add-profile-btn"
        >
          <Plus className="w-4 h-4 mr-2" /> New Profile
        </Button>
      </div>

      {showForm && (
        <div className="bg-white/80 backdrop-blur rounded-xl border border-zinc-200 p-5 space-y-4" data-testid="profile-form">
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Profile Name</label>
            <input
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2.5 text-sm"
              placeholder="e.g. Studio A, Home Setup"
              data-testid="profile-name-input"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-zinc-500 mb-1 block flex items-center gap-1">
                <Mic className="w-3 h-3" /> Input (Microphone)
              </label>
              <select
                value={form.input_device_id}
                onChange={e => setForm({ ...form, input_device_id: e.target.value })}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2.5 text-sm"
                data-testid="profile-input-select"
              >
                <option value="">System default</option>
                {devices.inputs.map(d => (
                  <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${d.deviceId.slice(0, 8)}`}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-zinc-500 mb-1 block flex items-center gap-1">
                <Volume2 className="w-3 h-3" /> Output (Speaker/Headphone)
              </label>
              <select
                value={form.output_device_id}
                onChange={e => setForm({ ...form, output_device_id: e.target.value })}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2.5 text-sm"
                data-testid="profile-output-select"
              >
                <option value="">System default</option>
                {devices.outputs.map(d => (
                  <option key={d.deviceId} value={d.deviceId}>{d.label || `Speaker ${d.deviceId.slice(0, 8)}`}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => { setShowForm(false); setEditingId(null); }}>Cancel</Button>
            <Button onClick={saveProfile} disabled={saving} className="bg-green-600 hover:bg-green-700" data-testid="save-profile-btn">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : editingId ? 'Update Profile' : 'Create Profile'}
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {profiles.length === 0 ? (
          <div className="bg-white/80 backdrop-blur rounded-xl border border-zinc-200 p-12 text-center">
            <Settings className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
            <p className="text-sm text-zinc-500">No audio profiles yet. Create one to get started.</p>
          </div>
        ) : profiles.map(p => {
          const warnings = deviceWarnings[p.id];
          return (
            <div key={p.id} className={`bg-white/80 backdrop-blur rounded-xl border p-5 ${warnings ? 'border-amber-500/30' : 'border-zinc-200'}`} data-testid={`profile-${p.id}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{p.name}</span>
                    {warnings && (
                      <span className="text-xs bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Device issue
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-xs text-zinc-500">
                    <span className="flex items-center gap-1">
                      <Mic className="w-3 h-3" /> {p.input_device_label || 'System default'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Volume2 className="w-3 h-3" /> {p.output_device_label || 'System default'}
                    </span>
                  </div>
                  {warnings && (
                    <div className="mt-2">
                      {warnings.map((w, i) => (
                        <p key={i} className="text-xs text-amber-400/70">{w}</p>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => editProfile(p)} className="p-2 rounded-lg hover:bg-zinc-100 text-zinc-500 hover:text-zinc-600">
                    <Edit className="w-4 h-4" />
                  </button>
                  <button onClick={() => deleteProfile(p.id)} className="p-2 rounded-lg hover:bg-zinc-100 text-zinc-500 hover:text-red-400">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


// ============== HISTORY TAB ==============
function HistoryTab({ token }) {
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API}/api/calls/invites?status=ended`, { headers });
        if (res.ok) setInvites((await res.json()).invites || []);
      } catch (_e) { /* noop */ }
      setLoading(false);
    })();
  }, [token]);

  const formatDuration = (seconds) => {
    if (!seconds) return '-';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6" data-testid="history-tab">
      <p className="text-sm text-zinc-500">{invites.length} completed call(s)</p>

      {invites.length === 0 ? (
        <div className="bg-white/80 backdrop-blur rounded-xl border border-zinc-200 p-12 text-center">
          <Clock className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
          <p className="text-sm text-zinc-500">No call history yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {invites.map(invite => (
            <div key={invite.id} className="bg-white/80 backdrop-blur rounded-xl border border-zinc-200 px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-9 h-9 rounded-lg bg-zinc-200 flex items-center justify-center">
                  <PhoneOff className="w-4 h-4 text-zinc-500" />
                </div>
                <div>
                  <span className="text-sm font-medium">{invite.caller_name || invite.label || 'Unknown'}</span>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-zinc-500">
                    <span>{new Date(invite.created_at).toLocaleString('en-GB')}</span>
                    {invite.duration_seconds !== null && (
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatDuration(invite.duration_seconds)}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


function Spinner() {
  return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-green-500" /></div>;
}
