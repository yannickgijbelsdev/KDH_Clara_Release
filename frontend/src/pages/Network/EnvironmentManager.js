import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../../components/ui/alert-dialog';
import { toast } from 'sonner';
import {
  Server, Plus, Edit, Trash2, Users, Globe, Shield, Crown,
  Copy, Loader2, ChevronRight, Cloud, CloudOff
} from 'lucide-react';
import CreateEnvironmentWizard from '../../components/workspace/CreateEnvironmentWizard';

const API = process.env.REACT_APP_BACKEND_URL;

const DEFAULT_COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4'];

export default function EnvironmentManager() {
  const { token, user } = useAuth();
  const [environments, setEnvironments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [envDialog, setEnvDialog] = useState(false);
  const [createWizardOpen, setCreateWizardOpen] = useState(false);
  const [editingEnv, setEditingEnv] = useState(null);
  const [envForm, setEnvForm] = useState({ name: '', slug: '', description: '', color: '#3b82f6', max_racks: 5 });
  const [deleteDialog, setDeleteDialog] = useState({ open: false, id: '', name: '' });

  // Admin management
  const [adminDialog, setAdminDialog] = useState({ open: false, envId: '', envName: '' });
  const [envAdmins, setEnvAdmins] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');

  // Copy site
  const [copyDialog, setCopyDialog] = useState({ open: false, envId: '', envName: '' });
  const [availableSites, setAvailableSites] = useState([]);
  const [selectedSiteId, setSelectedSiteId] = useState('');

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const isSystemAdmin = user?.is_system_admin;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/environments`, { headers });
      setEnvironments(await res.json());
    } catch { toast.error('Failed to load environments'); }
    setLoading(false);
  }, [token]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ---- Environment CRUD ----
  const openCreate = () => {
    setCreateWizardOpen(true);
  };

  const openEdit = (env) => {
    setEditingEnv(env);
    setEnvForm({ name: env.name, slug: env.slug, description: env.description || '', color: env.color || '#3b82f6', max_racks: env.max_racks || 5 });
    setEnvDialog(true);
  };

  const saveEnv = async () => {
    try {
      const url = editingEnv ? `${API}/api/environments/${editingEnv.id}` : `${API}/api/environments`;
      const method = editingEnv ? 'PUT' : 'POST';
      const body = editingEnv
        ? { name: envForm.name, description: envForm.description, color: envForm.color, max_racks: envForm.max_racks }
        : envForm;
      const res = await fetch(url, { method, headers, body: JSON.stringify(body) });
      if (!res.ok) { const err = await res.json(); toast.error(err.detail); return; }
      toast.success(editingEnv ? 'Environment updated' : 'Environment created');
      setEnvDialog(false);
      fetchData();
    } catch { toast.error('Failed to save environment'); }
  };

  const confirmDelete = async () => {
    try {
      const res = await fetch(`${API}/api/environments/${deleteDialog.id}`, { method: 'DELETE', headers });
      if (!res.ok) { const err = await res.json(); toast.error(err.detail); }
      else { toast.success('Environment deleted'); fetchData(); }
    } catch { toast.error('Delete failed'); }
    setDeleteDialog({ open: false, id: '', name: '' });
  };

  // ---- Admin management ----
  const openAdminDialog = async (envId, envName) => {
    setAdminDialog({ open: true, envId, envName });
    try {
      const [adminsRes, usersRes] = await Promise.all([
        fetch(`${API}/api/environments/${envId}/admins`, { headers }),
        fetch(`${API}/api/users`, { headers }),
      ]);
      setEnvAdmins(await adminsRes.json());
      const usersData = await usersRes.json();
      setAllUsers(Array.isArray(usersData) ? usersData : []);
    } catch { toast.error('Failed to load admins'); }
  };

  const addAdmin = async () => {
    if (!selectedUserId) return;
    try {
      const res = await fetch(`${API}/api/environments/${adminDialog.envId}/admins`, {
        method: 'POST', headers, body: JSON.stringify({ user_id: selectedUserId }),
      });
      if (!res.ok) { const err = await res.json(); toast.error(err.detail); return; }
      toast.success('Admin added');
      setSelectedUserId('');
      openAdminDialog(adminDialog.envId, adminDialog.envName);
      fetchData();
    } catch { toast.error('Failed to add admin'); }
  };

  const removeAdmin = async (adminId) => {
    try {
      const res = await fetch(`${API}/api/environments/${adminDialog.envId}/admins/${adminId}`, { method: 'DELETE', headers });
      if (!res.ok) { const err = await res.json(); toast.error(err.detail); return; }
      toast.success('Admin removed');
      openAdminDialog(adminDialog.envId, adminDialog.envName);
      fetchData();
    } catch { toast.error('Failed to remove admin'); }
  };

  // ---- Toggle S3 ----
  const toggleS3 = async (envId, currentValue) => {
    try {
      const res = await fetch(`${API}/api/environments/${envId}`, {
        method: 'PUT', headers, body: JSON.stringify({ s3_enabled: !currentValue }),
      });
      if (!res.ok) { const err = await res.json(); toast.error(err.detail); return; }
      toast.success(`Cloud Resources ${!currentValue ? 'enabled' : 'disabled'}`);
      fetchData();
    } catch { toast.error('Failed to update environment'); }
  };

  // ---- Copy site ----
  const openCopyDialog = async (envId, envName) => {
    setCopyDialog({ open: true, envId, envName });
    try {
      const res = await fetch(`${API}/api/main-sites/my/access`, { headers });
      const data = await res.json();
      setAvailableSites(data.main_sites || []);
    } catch { toast.error('Failed to load sites'); }
  };

  const copySite = async () => {
    if (!selectedSiteId) return;
    try {
      const res = await fetch(`${API}/api/environments/${copyDialog.envId}/copy-site/${selectedSiteId}`, {
        method: 'POST', headers,
      });
      if (!res.ok) { const err = await res.json(); toast.error(err.detail); return; }
      toast.success('Site copied to environment');
      setCopyDialog({ open: false, envId: '', envName: '' });
      fetchData();
    } catch { toast.error('Failed to copy site'); }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-zinc-400" /></div>;
  }

  return (
    <div className="space-y-6" data-testid="environment-manager">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          {isSystemAdmin && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs bg-red-500/15 text-red-400 border border-red-500/25 mb-2">
              <Crown className="w-3 h-3" /> System Administrator
            </span>
          )}
        </div>
        {isSystemAdmin && (
          <Button onClick={openCreate} size="sm" data-testid="create-env-btn">
            <Plus className="w-4 h-4 mr-1" /> New Environment
          </Button>
        )}
      </div>

      {/* Environment Cards */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {environments.map(env => (
          <Card key={env.id} className="bg-white border-zinc-200 overflow-hidden" data-testid={`env-card-${env.slug}`}>
            <div className="h-1" style={{ backgroundColor: env.color || '#3b82f6' }} />
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base text-zinc-900 flex items-center gap-2">
                  <Server className="w-4 h-4" style={{ color: env.color }} />
                  {env.name}
                  {env.is_default && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-zinc-100 text-zinc-500">Default</span>
                  )}
                </CardTitle>
                {isSystemAdmin && (
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(env)} className="h-7 w-7 p-0">
                      <Edit className="w-3.5 h-3.5" />
                    </Button>
                    {!env.is_default && (
                      <Button size="sm" variant="ghost" onClick={() => setDeleteDialog({ open: true, id: env.id, name: env.name })} className="h-7 w-7 p-0 text-red-400">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                )}
              </div>
              {env.description && <p className="text-xs text-zinc-500 mt-1">{env.description}</p>}
            </CardHeader>
            <CardContent>
              <div className="flex gap-4 mb-3">
                <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                  <Globe className="w-3.5 h-3.5" /> {env.site_count || 0} sites
                </div>
                <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                  <Users className="w-3.5 h-3.5" /> {env.admin_count || 0} admins
                </div>
                <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                  <Server className="w-3.5 h-3.5" /> max {env.max_racks || 5} racks
                </div>
                <div className={`flex items-center gap-1.5 text-xs ${env.s3_enabled !== false ? 'text-emerald-500' : 'text-red-400'}`}>
                  {env.s3_enabled !== false ? <Cloud className="w-3.5 h-3.5" /> : <CloudOff className="w-3.5 h-3.5" />}
                  {env.s3_enabled !== false ? 'Cloud on' : 'Cloud off'}
                </div>
              </div>
              {isSystemAdmin && (
                <div className="flex items-center justify-between mb-3 px-2 py-1.5 rounded-lg bg-zinc-100/70">
                  <div className="flex items-center gap-2">
                    {env.s3_enabled !== false
                      ? <Cloud className="w-4 h-4 text-emerald-400" />
                      : <CloudOff className="w-4 h-4 text-red-400" />
                    }
                    <span className="text-xs text-zinc-600">Cloud Resources</span>
                  </div>
                  <button
                    onClick={() => toggleS3(env.id, env.s3_enabled !== false)}
                    data-testid={`env-s3-toggle-${env.slug}`}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${env.s3_enabled !== false ? 'bg-emerald-500' : 'bg-zinc-600'}`}
                  >
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${env.s3_enabled !== false ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              )}
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={() => openAdminDialog(env.id, env.name)} data-testid={`env-admins-${env.slug}`}>
                  <Shield className="w-3 h-3 mr-1" /> Admins
                </Button>
                {isSystemAdmin && (
                  <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={() => openCopyDialog(env.id, env.name)} data-testid={`env-copy-site-${env.slug}`}>
                    <Copy className="w-3 h-3 mr-1" /> Copy Site
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Create Wizard */}
      <CreateEnvironmentWizard
        open={createWizardOpen}
        onClose={() => setCreateWizardOpen(false)}
        onCreated={fetchData}
        token={token}
      />

      {/* Edit Dialog (simpler - no deploy animation needed) */}
      <Dialog open={envDialog} onOpenChange={setEnvDialog}>
        <DialogContent className="bg-white border-zinc-200 max-w-md">
          <DialogHeader><DialogTitle className="text-zinc-900">Edit Environment</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-zinc-700">Name</Label><Input value={envForm.name} onChange={e => setEnvForm(p => ({ ...p, name: e.target.value }))} placeholder="Staging" className="bg-white border-zinc-300 text-zinc-900" data-testid="env-name-input" /></div>
              <div><Label className="text-zinc-700">Slug</Label><Input value={envForm.slug} onChange={e => setEnvForm(p => ({ ...p, slug: e.target.value }))} placeholder="staging" disabled={!!editingEnv} className="bg-white border-zinc-300 text-zinc-900 font-mono" data-testid="env-slug-input" /></div>
            </div>
            <div><Label className="text-zinc-700">Description</Label><Input value={envForm.description} onChange={e => setEnvForm(p => ({ ...p, description: e.target.value }))} placeholder="Test environment" className="bg-white border-zinc-300 text-zinc-900" /></div>
            <div>
              <Label className="text-zinc-700">Color</Label>
              <div className="flex gap-2 mt-1">
                {DEFAULT_COLORS.map(c => (
                  <button key={c} onClick={() => setEnvForm(p => ({ ...p, color: c }))}
                    className={`w-7 h-7 rounded-full border-2 transition-all ${envForm.color === c ? 'border-zinc-900 scale-110' : 'border-transparent opacity-60 hover:opacity-100'}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
            <div>
              <Label className="text-zinc-700">Maximum Racks</Label>
              <div className="flex items-center gap-3 mt-1">
                <div className="flex items-center bg-white border border-zinc-200 rounded-xl overflow-hidden">
                  <button onClick={() => setEnvForm(p => ({ ...p, max_racks: Math.max(1, (p.max_racks || 5) - 1) }))} className="px-3 py-1.5 text-zinc-500 hover:bg-zinc-50 font-bold">-</button>
                  <span className="px-4 py-1.5 font-bold text-zinc-900 tabular-nums">{envForm.max_racks || 5}</span>
                  <button onClick={() => setEnvForm(p => ({ ...p, max_racks: Math.min(50, (p.max_racks || 5) + 1) }))} className="px-3 py-1.5 text-zinc-500 hover:bg-zinc-50 font-bold">+</button>
                </div>
                <span className="text-sm text-zinc-500">racks</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEnvDialog(false)}>Cancel</Button>
            <Button onClick={saveEnv} disabled={!envForm.name || !envForm.slug} data-testid="save-env-btn">Update</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Admin Dialog */}
      <Dialog open={adminDialog.open} onOpenChange={open => !open && setAdminDialog(prev => ({ ...prev, open: false }))}>
        <DialogContent className="bg-white border-zinc-200 max-w-md">
          <DialogHeader><DialogTitle className="text-zinc-900">Admins - {adminDialog.envName}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {envAdmins.map(a => (
              <div key={a.id} className="flex items-center justify-between bg-zinc-50 rounded-lg px-3 py-2">
                <div>
                  <p className="text-sm text-zinc-800 flex items-center gap-1.5">
                    {a.user_name}
                    {a.is_system_admin && <Crown className="w-3 h-3 text-red-400" />}
                  </p>
                  <p className="text-xs text-zinc-500">{a.user_email}</p>
                </div>
                {isSystemAdmin && !a.is_system_admin && (
                  <Button size="sm" variant="ghost" onClick={() => removeAdmin(a.id)} className="h-7 text-xs text-red-400">Remove</Button>
                )}
              </div>
            ))}
            {isSystemAdmin && (
              <div className="flex gap-2 pt-2 border-t border-zinc-100">
                <select className="flex-1 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800"
                  value={selectedUserId} onChange={e => setSelectedUserId(e.target.value)}>
                  <option value="">Select user...</option>
                  {allUsers.filter(u => !envAdmins.some(a => a.user_id === u.id)).map(u => (
                    <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                  ))}
                </select>
                <Button size="sm" onClick={addAdmin} disabled={!selectedUserId}>Add</Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Copy Site Dialog */}
      <Dialog open={copyDialog.open} onOpenChange={open => !open && setCopyDialog(prev => ({ ...prev, open: false }))}>
        <DialogContent className="bg-white border-zinc-200 max-w-md">
          <DialogHeader><DialogTitle className="text-zinc-900">Copy Site to {copyDialog.envName}</DialogTitle></DialogHeader>
          <p className="text-sm text-zinc-500">Select a site to copy its structure (features, roles). Data will not be copied.</p>
          <select className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800"
            value={selectedSiteId} onChange={e => setSelectedSiteId(e.target.value)} data-testid="copy-site-select">
            <option value="">Select a site...</option>
            {availableSites.map(s => (
              <option key={s.id} value={s.id}>{s.name} {s.environment_name ? `(${s.environment_name})` : ''}</option>
            ))}
          </select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCopyDialog(prev => ({ ...prev, open: false }))}>Cancel</Button>
            <Button onClick={copySite} disabled={!selectedSiteId} data-testid="copy-site-btn">Copy Site</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialog.open} onOpenChange={open => !open && setDeleteDialog(prev => ({ ...prev, open: false }))}>
        <AlertDialogContent className="bg-white border-zinc-200">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-zinc-900">Delete Environment?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deleteDialog.name}". All sites must be removed first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
