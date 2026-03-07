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
  { id: 'manage_sites', label: 'Main Sites beheren', description: 'Aanmaken, bewerken en verwijderen', icon: Globe },
  { id: 'manage_users', label: 'Gebruikers beheren', description: 'Uitnodigen, rollen toewijzen', icon: Users },
  { id: 'manage_roles', label: 'Rollen beheren', description: 'Rollen aanmaken en bewerken', icon: ShieldCheck },
  { id: 'view_firewall', label: 'Firewall bekijken', description: 'Firewall logs en sessies', icon: Shield },
  { id: 'view_logs', label: 'Activity Logs bekijken', description: 'Audit logs inzien', icon: Eye },
  { id: 'manage_settings', label: 'Instellingen beheren', description: 'Systeem configuratie', icon: Settings },
];

export default function NetworkAdminManager({ open, onClose }) {
  const { token, user } = useAuth();
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState(null);
  const [formData, setFormData] = useState({ name: '', email: '' });
  const [permissions, setPermissions] = useState({});
  const [readOnly, setReadOnly] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tempPassword, setTempPassword] = useState(null);

  const isPrimary = user?.is_primary_network_admin;

  useEffect(() => {
    if (open) fetchAdmins();
  }, [open]);

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
        toast.error(data.detail || 'Fout bij aanmaken');
      }
    } catch (err) {
      toast.error('Fout bij aanmaken');
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
        toast.success('Permissies bijgewerkt');
        setEditingAdmin(null);
        resetForm();
        fetchAdmins();
      } else {
        const data = await res.json();
        toast.error(data.detail || 'Fout bij bijwerken');
      }
    } catch (err) {
      toast.error('Fout bij bijwerken');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (adminId) => {
    if (!confirm('Weet je zeker dat je deze network admin wilt verwijderen?')) return;
    try {
      const res = await fetch(`${API}/api/users/network-admins/${adminId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        toast.success('Network admin verwijderd');
        fetchAdmins();
      } else {
        const data = await res.json();
        toast.error(data.detail || 'Fout bij verwijderen');
      }
    } catch (err) {
      toast.error('Fout bij verwijderen');
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
      <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/50 border border-zinc-700">
        <div className="flex items-center gap-3">
          <Lock className="w-4 h-4 text-amber-400" />
          <div>
            <p className="text-sm font-medium text-white">Alleen lezen</p>
            <p className="text-xs text-zinc-500">Kan alles zien maar niets wijzigen</p>
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
            <div key={cat.id} className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/50 border border-zinc-700">
              <div className="flex items-center gap-3">
                <Icon className="w-4 h-4 text-zinc-400" />
                <div>
                  <p className="text-sm font-medium text-white">{cat.label}</p>
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

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-zinc-900 border-zinc-800 max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="network-admin-manager">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Crown className="w-5 h-5 text-orange-400" />
            Network Admins
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
          </div>
        ) : (
          <div className="space-y-4">
            {admins.map(admin => (
              <Card key={admin.id} className={`bg-zinc-800/50 border-zinc-700 ${admin.is_primary_network_admin ? 'border-orange-500/30' : ''}`}>
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${admin.is_primary_network_admin ? 'bg-gradient-to-br from-orange-500 to-amber-600 text-white' : 'bg-zinc-700 text-zinc-300'}`}>
                      {admin.name?.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white">{admin.name}</span>
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
                  {isPrimary && !admin.is_primary_network_admin && (
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

            {isPrimary && (
              <Button
                onClick={() => { resetForm(); setShowAddDialog(true); }}
                className="w-full gap-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 border-dashed"
                variant="outline"
                data-testid="add-network-admin-btn"
              >
                <UserPlus className="w-4 h-4" />
                Network Admin toevoegen
              </Button>
            )}
          </div>
        )}

        {/* Add Admin Dialog */}
        <Dialog open={showAddDialog} onOpenChange={(v) => { if (!v) { setShowAddDialog(false); resetForm(); } }}>
          <DialogContent className="bg-zinc-900 border-zinc-800 max-w-lg max-h-[80vh] overflow-y-auto" data-testid="add-admin-dialog">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-emerald-400" />
                {tempPassword ? 'Admin aangemaakt' : 'Network Admin toevoegen'}
              </DialogTitle>
            </DialogHeader>

            {tempPassword ? (
              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <p className="text-sm text-emerald-400 mb-2">Tijdelijk wachtwoord:</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 p-2 bg-zinc-800 rounded text-white font-mono text-sm">{tempPassword}</code>
                    <Button size="icon" variant="ghost" onClick={() => { navigator.clipboard.writeText(tempPassword); toast.success('Gekopieerd!'); }}>
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-zinc-500 mt-2">Deel dit wachtwoord veilig met de nieuwe admin. Ze moeten het bij eerste login wijzigen.</p>
                </div>
                <Button onClick={() => { setShowAddDialog(false); resetForm(); }} className="w-full">Sluiten</Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-3">
                  <div>
                    <Label>Naam</Label>
                    <Input
                      placeholder="Jan Jansen"
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      className="bg-zinc-800 border-zinc-700"
                      data-testid="admin-name-input"
                    />
                  </div>
                  <div>
                    <Label>E-mail</Label>
                    <Input
                      type="email"
                      placeholder="jan@example.com"
                      value={formData.email}
                      onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                      className="bg-zinc-800 border-zinc-700"
                      data-testid="admin-email-input"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-sm text-zinc-300 mb-2 block">Permissies</Label>
                  <PermissionToggles />
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => { setShowAddDialog(false); resetForm(); }}>Annuleren</Button>
                  <Button onClick={handleAdd} disabled={saving} className="gap-2">
                    {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                    Toevoegen
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Edit Permissions Dialog */}
        <Dialog open={!!editingAdmin} onOpenChange={(v) => { if (!v) { setEditingAdmin(null); resetForm(); } }}>
          <DialogContent className="bg-zinc-900 border-zinc-800 max-w-lg max-h-[80vh] overflow-y-auto" data-testid="edit-permissions-dialog">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-blue-400" />
                Permissies: {editingAdmin?.name}
              </DialogTitle>
            </DialogHeader>

            <PermissionToggles />

            <DialogFooter>
              <Button variant="outline" onClick={() => { setEditingAdmin(null); resetForm(); }}>Annuleren</Button>
              <Button onClick={handleUpdatePermissions} disabled={saving} className="gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Opslaan
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
