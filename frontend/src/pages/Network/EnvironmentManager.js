import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { motion } from 'framer-motion';
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

      {/* Environment Cards — 260px isometric grid */}
      <div className="flex flex-wrap justify-center gap-4 sm:gap-6">
        {environments.map((env, i) => {
          const siteCount = env.site_count || 0;
          const adminCount = env.admin_count || 0;
          const ENV_IMAGES = ['/images/env_environment.jpg', '/images/env_server.jpg', '/images/env_technical.jpg', '/images/env_radio.jpg', '/images/env_task_scheduler.jpg', '/images/env_external_host.jpg'];
          const envImg = ENV_IMAGES[i % ENV_IMAGES.length];
          return (
            <motion.div
              key={env.id}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 + 0.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="cursor-pointer group relative w-[260px] flex-shrink-0"
              data-testid={`env-card-${env.slug}`}
            >
              <div
                className="relative rounded-2xl overflow-hidden transition-all duration-300 border border-black/[0.06] shadow-[0_4px_24px_rgba(0,0,0,0.06)] group-hover:shadow-[0_8px_32px_rgba(0,0,0,0.10)] group-hover:scale-[1.02]"
                style={{ background: 'linear-gradient(160deg, #ffffff 0%, #f9f8f6 100%)' }}
              >
                {/* Room image */}
                <div className="relative h-[180px] overflow-hidden bg-[#F0F0F2]">
                  <img
                    src={envImg}
                    alt=""
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    style={{
                      WebkitMaskImage: 'radial-gradient(ellipse 60% 65% at center 55%, black 50%, transparent 100%)',
                      maskImage: 'radial-gradient(ellipse 60% 65% at center 55%, black 50%, transparent 100%)',
                    }}
                  />

                  {/* Type badge */}
                  <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-lg rounded-lg px-2.5 py-1 border border-black/[0.06] shadow-sm">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: env.color || '#3b82f6' }} />
                      <span className="text-[10px] font-bold tracking-wider" style={{ color: env.color || '#3b82f6' }}>
                        {env.is_default ? 'DEFAULT' : 'ENV'}
                      </span>
                    </div>
                  </div>

                  {/* Site count badge */}
                  <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-white/90 backdrop-blur-lg rounded-lg px-2 py-1 border border-black/[0.06] shadow-sm">
                    <Globe className="w-3 h-3 text-zinc-500" />
                    <span className="text-[10px] font-semibold text-zinc-600">{siteCount}</span>
                  </div>

                  {/* S3 status */}
                  <div className="absolute bottom-3 right-3">
                    <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-medium ${env.s3_enabled !== false ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-red-50 text-red-500 border border-red-200'}`}>
                      {env.s3_enabled !== false ? <Cloud className="w-2.5 h-2.5" /> : <CloudOff className="w-2.5 h-2.5" />}
                      {env.s3_enabled !== false ? 'Cloud' : 'No Cloud'}
                    </div>
                  </div>
                </div>

                {/* Info */}
                <div className="px-3.5 py-3">
                  <h3 className="text-sm font-bold text-zinc-800 truncate flex items-center gap-2">
                    {env.name}
                  </h3>
                  {env.description && <p className="text-[11px] text-zinc-400 mt-0.5 truncate">{env.description}</p>}
                  <div className="flex items-center gap-3 mt-2">
                    <div className="flex items-center gap-1 text-[10px] text-zinc-400">
                      <Users className="w-3 h-3" />
                      <span>{adminCount} admins</span>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-zinc-400">
                      <Server className="w-3 h-3" />
                      <span>max {env.max_racks || 5} racks</span>
                    </div>
                  </div>
                  {isSystemAdmin && (
                    <div className="flex gap-1.5 mt-2">
                      <Button size="sm" variant="outline" className="flex-1 h-6 text-[10px] rounded-lg" onClick={(e) => { e.stopPropagation(); openEdit(env); }}>
                        <Edit className="w-3 h-3 mr-0.5" /> Edit
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1 h-6 text-[10px] rounded-lg" onClick={(e) => { e.stopPropagation(); openAdminDialog(env.id, env.name); }}>
                        <Shield className="w-3 h-3 mr-0.5" /> Admins
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1 h-6 text-[10px] rounded-lg" onClick={(e) => { e.stopPropagation(); openCopyDialog(env.id, env.name); }}>
                        <Copy className="w-3 h-3 mr-0.5" /> Copy
                      </Button>
                    </div>
                  )}
                </div>

                {/* Bottom accent bar */}
                <div className="h-1" style={{ background: `linear-gradient(90deg, ${env.color || '#3b82f6'}, ${env.color || '#3b82f6'}60)` }} />
              </div>
            </motion.div>
          );
        })}

        {/* New Environment card */}
        {isSystemAdmin && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: environments.length * 0.08 + 0.1, duration: 0.5 }}
            onClick={openCreate}
            className="cursor-pointer group w-[260px] flex-shrink-0"
            data-testid="create-env-btn"
          >
            <div className="rounded-2xl border-2 border-dashed border-zinc-200 hover:border-orange-300 h-full min-h-[220px] flex flex-col items-center justify-center gap-3 transition-all duration-300 group-hover:shadow-[0_8px_32px_rgba(0,0,0,0.06)]">
              <div className="w-12 h-12 rounded-xl bg-zinc-100 group-hover:bg-orange-50 flex items-center justify-center transition-colors">
                <Plus className="w-6 h-6 text-zinc-400 group-hover:text-orange-500 transition-colors" />
              </div>
              <span className="text-sm font-medium text-zinc-400 group-hover:text-zinc-600">New Environment</span>
            </div>
          </motion.div>
        )}
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
