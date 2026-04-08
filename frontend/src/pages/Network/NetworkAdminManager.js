import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Switch } from '../../components/ui/switch';
import { toast } from 'sonner';
import {
  Plus, Crown, Shield, Trash2, Edit, Copy, Eye, Settings, Users, Globe,
  ShieldCheck, Loader2, UserPlus, Lock
} from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

const PERMISSION_CATEGORIES = [
  { id: 'manage_sites', label: 'Manage Main Sites', description: 'Create, edit and delete sites', icon: Globe },
  { id: 'manage_users', label: 'Manage Users', description: 'Invite and assign roles', icon: Users },
  { id: 'manage_roles', label: 'Manage Roles', description: 'Create and edit roles', icon: ShieldCheck },
  { id: 'view_firewall', label: 'View Firewall', description: 'Firewall logs and sessions', icon: Shield },
  { id: 'view_logs', label: 'View Activity Logs', description: 'View audit logs', icon: Eye },
  { id: 'manage_settings', label: 'Manage Settings', description: 'System configuration', icon: Settings },
];

export default function NetworkAdminManager({ open, onClose, inline = false }) {
  const { token, user } = useAuth();
  const [admins, setAdmins] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState(null);
  const [formData, setFormData] = useState({ name: '', email: '' });
  const [permissions, setPermissions] = useState({});
  const [readOnly, setReadOnly] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tempPassword, setTempPassword] = useState(null);

  const isPrimary = user?.is_primary_network_admin;
  const isNetworkAdmin = user?.is_network_admin || user?.role === 'admin';

  useEffect(() => {
    if (open) { fetchAdmins(); fetchAllUsers(); }
  }, [open]);

  const fetchAllUsers = async () => {
    try {
      const res = await fetch(`${API}/api/users`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setAllUsers(await res.json());
    } catch {}
  };

  const fetchAdmins = async () => {
    try {
      const res = await fetch(`${API}/api/users/network-admins`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setAdmins(await res.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!formData.name || !formData.email) {
      toast.error('Naam en e-mail zijn verplicht');
      return;
    }
    setSaving(true);
    try {
      const na_permissions = { ...permissions, read_only: readOnly };
      const res = await fetch(`${API}/api/users/network-admins`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: formData.name, email: formData.email, network_permissions: na_permissions })
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('Network admin aangemaakt');
        if (data.temp_password) setTempPassword(data.temp_password);
        fetchAdmins();
        if (!data.temp_password) {
          setShowAddDialog(false);
          resetForm();
        }
      } else {
        toast.error(data.detail || 'Failed to add admin');
      }
    } catch (err) {
      toast.error('Failed to add admin');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdatePermissions = async () => {
    if (!editingAdmin) return;
    setSaving(true);
    try {
      const na_permissions = { ...permissions, read_only: readOnly };
      const res = await fetch(`${API}/api/users/network-admins/${editingAdmin.id}/permissions`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ network_permissions: na_permissions })
      });
      if (res.ok) {
        toast.success('Permissions updated');
        setEditingAdmin(null);
        resetForm();
        fetchAdmins();
      } else {
        const data = await res.json();
        toast.error(data.detail || 'Failed to update');
      }
    } catch (err) {
      toast.error('Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (adminId) => {
    if (!confirm('Are you sure you want to remove this network admin?')) return;
    try {
      const res = await fetch(`${API}/api/users/network-admins/${adminId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        toast.success('Network admin removed');
        fetchAdmins();
      } else {
        const data = await res.json();
        toast.error(data.detail || 'Failed to remove');
      }
    } catch (err) {
      toast.error('Failed to remove');
    }
  };

  const openEditPermissions = (admin) => {
    setEditingAdmin(admin);
    const np = admin.network_permissions || {};
    setPermissions(np);
    setReadOnly(np.read_only || false);
  };

  const resetForm = () => {
    setFormData({ name: '', email: '' });
    setPermissions({});
    setReadOnly(false);
    setTempPassword(null);
  };

  const PermissionToggles = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-100/70 border border-zinc-300">
        <div className="flex items-center gap-3">
          <Lock className="w-4 h-4 text-amber-400" />
          <div>
            <p className="text-sm font-medium text-zinc-900">Read Only</p>
            <p className="text-xs text-zinc-500">Can view everything but cannot make changes</p>
          </div>
        </div>
        <Switch
          checked={readOnly}
          onCheckedChange={setReadOnly}
          data-testid="read-only-toggle"
        />
      </div>

      <div className="space-y-2">
        {PERMISSION_CATEGORIES.map(cat => {
          const Icon = cat.icon;
          return (
            <div key={cat.id} className="flex items-center justify-between p-3 rounded-lg bg-zinc-100/70 border border-zinc-300">
              <div className="flex items-center gap-3">
                <Icon className="w-4 h-4 text-zinc-400" />
                <div>
                  <p className="text-sm font-medium text-zinc-900">{cat.label}</p>
                  <p className="text-xs text-zinc-500">{cat.description}</p>
                </div>
              </div>
              <Switch
                checked={permissions[cat.id] || false}
                onCheckedChange={(v) => setPermissions(prev => ({ ...prev, [cat.id]: v }))}
                disabled={readOnly}
                data-testid={`perm-toggle-${cat.id}`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );

  if (!open) return null;

  const content = (
    <>
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
        </div>
      ) : (
        <div className="space-y-4">
          {admins.map(admin => (
            <Card key={admin.id} className={`bg-zinc-100/70 border-zinc-300 ${admin.is_primary_network_admin ? 'border-orange-500/30' : ''}`}>
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${admin.is_primary_network_admin ? 'bg-gradient-to-br from-orange-500 to-amber-600 text-white' : 'bg-zinc-200 text-zinc-600'}`}>
                    {admin.name?.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-zinc-900">{admin.name}</span>
                      {admin.is_primary_network_admin && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/20">
                          Primary
                        </span>
                      )}
                      {admin.network_permissions?.read_only && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/20">
                          Read-only
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500">{admin.email}</p>
                  </div>
                </div>
                {(isPrimary || isNetworkAdmin) && !admin.is_primary_network_admin && admin.id !== user?.id && (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEditPermissions(admin)} data-testid={`edit-admin-${admin.id}`}>
                      <Edit className="w-4 h-4 text-zinc-400" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleRemove(admin.id)} data-testid={`remove-admin-${admin.id}`}>
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}

          {(isPrimary || isNetworkAdmin) && (
            <Button
              onClick={() => { resetForm(); setShowAddDialog(true); }}
              className="w-full gap-2 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 border-dashed"
              variant="outline"
              data-testid="add-network-admin-btn"
            >
              <UserPlus className="w-4 h-4" />
              Add Network Admin
            </Button>
          )}
        </div>
      )}

      {/* Add Admin Dialog */}
      <Dialog open={showAddDialog} onOpenChange={(v) => { if (!v) { setShowAddDialog(false); resetForm(); } }}>
        <DialogContent className="bg-white border-zinc-200 max-w-lg max-h-[80vh] overflow-y-auto" data-testid="add-admin-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-emerald-400" />
              {tempPassword ? 'Admin Created' : 'Add Network Admin'}
            </DialogTitle>
          </DialogHeader>

          {tempPassword ? (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <p className="text-sm text-emerald-400 mb-2">Temporary password:</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 p-2 bg-zinc-100 rounded text-zinc-900 font-mono text-sm">{tempPassword}</code>
                  <Button size="icon" variant="ghost" onClick={() => { navigator.clipboard.writeText(tempPassword); toast.success('Copied!'); }}>
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-xs text-zinc-500 mt-2">Share this password securely with the new admin. They must change it on first login.</p>
              </div>
              <Button onClick={() => { setShowAddDialog(false); resetForm(); }} className="w-full">Close</Button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Select existing user */}
              {allUsers.length > 0 && (
                <div>
                  <Label className="text-sm text-zinc-600 mb-2 block">Select existing user</Label>
                  <select
                    className="w-full h-10 px-3 rounded-md bg-zinc-50 border border-zinc-200 text-zinc-900 text-sm"
                    value=""
                    onChange={(e) => {
                      const selected = allUsers.find(u => u.id === e.target.value);
                      if (selected) {
                        setFormData({ name: selected.name, email: selected.email });
                      }
                    }}
                    data-testid="select-existing-user"
                  >
                    <option value="">Select a user...</option>
                    {allUsers
                      .filter(u => !admins.some(a => a.id === u.id))
                      .map(u => (
                        <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                      ))
                    }
                  </select>
                  <div className="flex items-center gap-2 my-3">
                    <div className="h-px flex-1 bg-zinc-700" />
                    <span className="text-xs text-zinc-500">or enter manually</span>
                    <div className="h-px flex-1 bg-zinc-700" />
                  </div>
                </div>
              )}

              <div className="grid gap-3">
                <div>
                  <Label>Name</Label>
                  <Input
                    placeholder="John Doe"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    className="bg-zinc-50 border-zinc-200"
                    data-testid="admin-name-input"
                  />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    placeholder="john@example.com"
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    className="bg-zinc-50 border-zinc-200"
                    data-testid="admin-email-input"
                  />
                </div>
              </div>

              <div>
                <Label className="text-sm text-zinc-600 mb-2 block">Permissions</Label>
                <PermissionToggles />
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => { setShowAddDialog(false); resetForm(); }}>Cancel</Button>
                <Button onClick={handleAdd} disabled={saving} className="gap-2">
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  Add
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Permissions Dialog */}
      <Dialog open={!!editingAdmin} onOpenChange={(v) => { if (!v) { setEditingAdmin(null); resetForm(); } }}>
        <DialogContent className="bg-white border-zinc-200 max-w-lg max-h-[80vh] overflow-y-auto" data-testid="edit-permissions-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-400" />
              Permissions: {editingAdmin?.name}
            </DialogTitle>
          </DialogHeader>

          <PermissionToggles />

          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditingAdmin(null); resetForm(); }}>Cancel</Button>
            <Button onClick={handleUpdatePermissions} disabled={saving} className="gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  // Inline mode: render content directly
  if (inline) {
    return <div data-testid="network-admin-manager">{content}</div>;
  }

  // Dialog mode
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-white border-zinc-200 max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="network-admin-manager">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Crown className="w-5 h-5 text-orange-400" />
            Network Admins
          </DialogTitle>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}
