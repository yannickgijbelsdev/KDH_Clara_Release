import { useState, useEffect, useCallback } from 'react';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';
import {
  X, Plus, Trash2, Save, Loader2, Shield, CheckSquare, Square,
  ChevronDown, ChevronRight, Edit, UserCog, Minus, Check, AlertTriangle
} from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;
const ACTIONS = ['view', 'create', 'edit', 'delete'];
const ACTION_LABELS = { view: 'View', create: 'Create', edit: 'Edit', delete: 'Delete' };

export default function RolesManager({ mainSiteId, mainSiteName, token, onClose }) {
  const [roles, setRoles] = useState([]);
  const [schema, setSchema] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeRoleId, setActiveRoleId] = useState(null);
  const [editedPermissions, setEditedPermissions] = useState(null);
  const [editedMeta, setEditedMeta] = useState(null);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [showNewRole, setShowNewRole] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleColor, setNewRoleColor] = useState('#6b7280');
  const [expandedGroups, setExpandedGroups] = useState({});
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const fetchData = useCallback(async () => {
    try {
      const [rolesRes, schemaRes] = await Promise.all([
        fetch(`${API}/api/roles/${mainSiteId}`, { headers }),
        fetch(`${API}/api/roles/schema`, { headers }),
      ]);
      if (rolesRes.ok) {
        const data = await rolesRes.json();
        setRoles(data.roles || []);
        if (!activeRoleId && data.roles?.length > 0) {
          selectRole(data.roles[0]);
        }
      }
      if (schemaRes.ok) {
        const data = await schemaRes.json();
        setSchema(data);
        // Expand all groups by default
        const expanded = {};
        data.categories?.forEach(cat => { expanded[cat.group] = true; });
        setExpandedGroups(expanded);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [mainSiteId, token]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const selectRole = (role) => {
    if (hasChanges) {
      if (!confirm('You have unsaved changes. Discard them?')) return;
    }
    setActiveRoleId(role.id);
    setEditedPermissions(JSON.parse(JSON.stringify(role.permissions || {})));
    setEditedMeta({ name: role.name, description: role.description || '', color: role.color || '#6b7280' });
    setHasChanges(false);
  };

  const togglePermission = (featureId, action) => {
    setEditedPermissions(prev => {
      const updated = { ...prev };
      if (!updated[featureId]) {
        updated[featureId] = { view: false, create: false, edit: false, delete: false };
      }
      updated[featureId] = { ...updated[featureId], [action]: !updated[featureId][action] };
      return updated;
    });
    setHasChanges(true);
  };

  const toggleAllForFeature = (featureId) => {
    setEditedPermissions(prev => {
      const current = prev[featureId] || {};
      const allEnabled = ACTIONS.every(a => current[a]);
      const updated = { ...prev };
      updated[featureId] = {};
      ACTIONS.forEach(a => { updated[featureId][a] = !allEnabled; });
      return updated;
    });
    setHasChanges(true);
  };

  const toggleAllForAction = (action) => {
    if (!schema) return;
    setEditedPermissions(prev => {
      const allIds = schema.categories.flatMap(c => c.permissions.map(p => p.id));
      const allEnabled = allIds.every(id => prev[id]?.[action]);
      const updated = { ...prev };
      allIds.forEach(id => {
        if (!updated[id]) updated[id] = { view: false, create: false, edit: false, delete: false };
        updated[id] = { ...updated[id], [action]: !allEnabled };
      });
      return updated;
    });
    setHasChanges(true);
  };

  const toggleGroup = (group) => {
    if (!schema) return;
    const cat = schema.categories.find(c => c.group === group);
    if (!cat) return;
    setEditedPermissions(prev => {
      const ids = cat.permissions.map(p => p.id);
      const allEnabled = ids.every(id => ACTIONS.every(a => prev[id]?.[a]));
      const updated = { ...prev };
      ids.forEach(id => {
        updated[id] = {};
        ACTIONS.forEach(a => { updated[id][a] = !allEnabled; });
      });
      return updated;
    });
    setHasChanges(true);
  };

  const saveRole = async () => {
    setSaving(true);
    try {
      const activeRole = roles.find(r => r.id === activeRoleId);
      const body = { permissions: editedPermissions };
      if (!activeRole?.is_system) {
        body.name = editedMeta.name;
        body.description = editedMeta.description;
        body.color = editedMeta.color;
      }
      const res = await fetch(`${API}/api/roles/${mainSiteId}/${activeRoleId}`, {
        method: 'PUT', headers, body: JSON.stringify(body),
      });
      if (res.ok) {
        toast.success('Role saved');
        setHasChanges(false);
        fetchData();
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Failed to save');
      }
    } catch (e) { toast.error('Failed to save role'); }
    setSaving(false);
  };

  const createRole = async () => {
    if (!newRoleName.trim()) return;
    try {
      const res = await fetch(`${API}/api/roles/${mainSiteId}`, {
        method: 'POST', headers,
        body: JSON.stringify({ name: newRoleName, color: newRoleColor }),
      });
      if (res.ok) {
        toast.success('Role created');
        setShowNewRole(false);
        setNewRoleName('');
        setNewRoleColor('#6b7280');
        const data = await res.json();
        await fetchData();
        setActiveRoleId(data.id);
        setEditedPermissions(JSON.parse(JSON.stringify(data.permissions || {})));
        setEditedMeta({ name: data.name, description: data.description || '', color: data.color });
        setHasChanges(false);
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Failed to create role');
      }
    } catch (e) { toast.error('Failed to create role'); }
  };

  const deleteRole = async (roleId) => {
    const role = roles.find(r => r.id === roleId);
    if (role?.is_system) return;
    if (!confirm(`Delete role "${role?.name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`${API}/api/roles/${mainSiteId}/${roleId}`, {
        method: 'DELETE', headers,
      });
      if (res.ok) {
        toast.success('Role deleted');
        if (activeRoleId === roleId) {
          setActiveRoleId(null);
          setEditedPermissions(null);
        }
        fetchData();
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Failed to delete role');
      }
    } catch (e) { toast.error('Failed to delete role'); }
  };

  const activeRole = roles.find(r => r.id === activeRoleId);

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-green-500" />
      </div>
    );
  }

  const COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280', '#14b8a6'];

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" data-testid="roles-manager">
      <div className="bg-[#0a0a0b] border border-zinc-200 rounded-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200">
          <div className="flex items-center gap-3">
            <UserCog className="w-5 h-5 text-green-500" />
            <div>
              <h2 className="text-lg font-bold">Roles & Permissions</h2>
              <p className="text-xs text-zinc-500">{mainSiteName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-zinc-100 text-zinc-500 hover:text-zinc-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left: Role List */}
          <div className="w-56 border-r border-zinc-200 flex flex-col">
            <div className="p-3 border-b border-zinc-200">
              <Button
                onClick={() => setShowNewRole(true)}
                size="sm"
                className="w-full bg-green-600 hover:bg-green-700 gap-1.5"
                data-testid="add-role-btn"
              >
                <Plus className="w-3.5 h-3.5" /> New Role
              </Button>
            </div>

            {/* New role form */}
            {showNewRole && (
              <div className="p-3 border-b border-zinc-200 space-y-2 bg-white/60">
                <input
                  value={newRoleName}
                  onChange={e => setNewRoleName(e.target.value)}
                  placeholder="Role name"
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-sm"
                  data-testid="new-role-name"
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && createRole()}
                />
                <div className="flex gap-1">
                  {COLORS.map(c => (
                    <button key={c} onClick={() => setNewRoleColor(c)}
                      className={`w-5 h-5 rounded-full border-2 ${newRoleColor === c ? 'border-white' : 'border-transparent'}`}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={createRole} className="flex-1 bg-green-600 hover:bg-green-700">Create</Button>
                  <Button size="sm" variant="outline" onClick={() => setShowNewRole(false)}>Cancel</Button>
                </div>
              </div>
            )}

            {/* Role list */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {roles.map(role => (
                <div
                  key={role.id}
                  onClick={() => selectRole(role)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center justify-between group transition-all cursor-pointer ${
                    activeRoleId === role.id ? 'bg-orange-500 text-white' : 'text-zinc-600 hover:bg-zinc-100'
                  }`}
                  data-testid={`role-${role.slug}`}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: role.color }} />
                    <span className="truncate">{role.name}</span>
                    {role.is_system && <Shield className="w-3 h-3 text-zinc-600 flex-shrink-0" />}
                  </div>
                  {!role.is_system && (
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteRole(role.id); }}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-zinc-200 rounded text-zinc-500 hover:text-red-400"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Right: Permissions Grid */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {activeRole ? (
              <>
                {/* Role Meta */}
                <div className="px-6 py-4 border-b border-zinc-200 flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1">
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: editedMeta?.color }} />
                    {activeRole.is_system ? (
                      <div>
                        <h3 className="text-base font-semibold">{activeRole.name}</h3>
                        <p className="text-xs text-zinc-500">{activeRole.description}</p>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 flex-1">
                        <input
                          value={editedMeta?.name || ''}
                          onChange={e => { setEditedMeta(m => ({ ...m, name: e.target.value })); setHasChanges(true); }}
                          className="bg-transparent border-b border-zinc-300 focus:border-zinc-500 text-base font-semibold px-1 py-0.5 outline-none"
                          data-testid="role-name-input"
                        />
                        <input
                          value={editedMeta?.description || ''}
                          onChange={e => { setEditedMeta(m => ({ ...m, description: e.target.value })); setHasChanges(true); }}
                          placeholder="Description..."
                          className="bg-transparent border-b border-zinc-200 focus:border-zinc-600 text-xs text-zinc-500 px-1 py-0.5 outline-none flex-1"
                        />
                        <div className="flex gap-1">
                          {COLORS.map(c => (
                            <button key={c} onClick={() => { setEditedMeta(m => ({ ...m, color: c })); setHasChanges(true); }}
                              className={`w-4 h-4 rounded-full border ${editedMeta?.color === c ? 'border-white' : 'border-transparent'}`}
                              style={{ backgroundColor: c }} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <Button
                    onClick={saveRole}
                    disabled={saving || !hasChanges}
                    className="bg-green-600 hover:bg-green-700 gap-1.5"
                    data-testid="save-role-btn"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save
                  </Button>
                </div>

                {/* Column headers */}
                <div className="px-6 py-2 border-b border-zinc-200 flex items-center bg-zinc-100">
                  <div className="flex-1 text-xs text-zinc-600 font-medium">FEATURE / PERMISSION</div>
                  <div className="flex" style={{ width: '280px' }}>
                    {ACTIONS.map(action => (
                      <button
                        key={action}
                        onClick={() => toggleAllForAction(action)}
                        className="w-[70px] text-center text-xs text-zinc-500 hover:text-zinc-600 font-medium py-1 cursor-pointer"
                        title={`Toggle all ${ACTION_LABELS[action]}`}
                      >
                        {ACTION_LABELS[action]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Permissions rows */}
                <div className="flex-1 overflow-y-auto" data-testid="permissions-grid">
                  {schema?.categories.map(category => {
                    const isExpanded = expandedGroups[category.group] !== false;
                    const groupIds = category.permissions.map(p => p.id);
                    const allGroupEnabled = groupIds.every(id =>
                      ACTIONS.every(a => editedPermissions?.[id]?.[a])
                    );
                    const someGroupEnabled = groupIds.some(id =>
                      ACTIONS.some(a => editedPermissions?.[id]?.[a])
                    );

                    return (
                      <div key={category.group}>
                        {/* Group header */}
                        <div
                          className="flex items-center px-6 py-2.5 bg-white/60 border-b border-zinc-200/30 cursor-pointer hover:bg-white/70"
                          onClick={() => setExpandedGroups(g => ({ ...g, [category.group]: !isExpanded }))}
                        >
                          <div className="flex items-center gap-2 flex-1">
                            {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-zinc-500" /> : <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />}
                            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">{category.group}</span>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleGroup(category.group); }}
                            className="text-xs text-zinc-600 hover:text-zinc-400 px-2 py-0.5 rounded"
                            title={allGroupEnabled ? 'Deselect all in group' : 'Select all in group'}
                          >
                            {allGroupEnabled ? (
                              <span className="flex items-center gap-1"><Minus className="w-3 h-3" /> Deselect all</span>
                            ) : (
                              <span className="flex items-center gap-1"><Check className="w-3 h-3" /> Select all</span>
                            )}
                          </button>
                        </div>

                        {/* Permission rows */}
                        {isExpanded && category.permissions.map(perm => {
                          const perms = editedPermissions?.[perm.id] || {};
                          const allEnabled = ACTIONS.every(a => perms[a]);
                          return (
                            <div
                              key={perm.id}
                              className="flex items-center px-6 py-2 border-b border-zinc-200 hover:bg-zinc-50"
                              data-testid={`perm-row-${perm.id}`}
                            >
                              <div className="flex items-center gap-2 flex-1 pl-6">
                                <button
                                  onClick={() => toggleAllForFeature(perm.id)}
                                  className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                                    allEnabled
                                      ? 'bg-green-600 border-green-600 text-white'
                                      : ACTIONS.some(a => perms[a])
                                        ? 'bg-green-600/30 border-green-600/50 text-green-400'
                                        : 'border-zinc-300 text-transparent'
                                  }`}
                                  title="Toggle all actions"
                                >
                                  {allEnabled ? <Check className="w-3 h-3" /> : ACTIONS.some(a => perms[a]) ? <Minus className="w-2.5 h-2.5" /> : null}
                                </button>
                                <span className="text-sm text-zinc-600">{perm.label}</span>
                              </div>
                              <div className="flex" style={{ width: '280px' }}>
                                {ACTIONS.map(action => (
                                  <div key={action} className="w-[70px] flex justify-center">
                                    <button
                                      onClick={() => togglePermission(perm.id, action)}
                                      className={`w-6 h-6 rounded border flex items-center justify-center transition-all ${
                                        perms[action]
                                          ? 'bg-green-600 border-green-600 text-white'
                                          : 'border-zinc-300 hover:border-zinc-600'
                                      }`}
                                      data-testid={`perm-${perm.id}-${action}`}
                                    >
                                      {perms[action] && <Check className="w-3.5 h-3.5" />}
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-zinc-500">
                <p className="text-sm">Select a role to edit permissions</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
