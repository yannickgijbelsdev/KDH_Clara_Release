import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import {
  Users,
  Shield,
  Edit2,
  Trash2,
  UserPlus,
  Eye,
  Pencil,
  Crown,
  Copy,
  Check,
  Building2,
  Mic,
  KeyRound,
  Mail,
  User,
  Camera,
  Loader2,
  ArrowLeftRight,
  FileCheck,
  ShieldAlert,
  CircleDot,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { toast } from 'sonner';
import { getAvatarUrl } from '../utils/avatar';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Fallback icons for known system roles
const SYSTEM_ROLE_ICONS = {
  admin: Crown,
  news_admin: FileCheck,
  editor: Pencil,
  presenter: Mic,
  viewer: Eye,
};

const TeamSettingsPage = () => {
  const { user, isAdmin: isGlobalAdmin, switchToUser } = useAuth();
  const { mainSiteSlug } = useParams();
  const navigate = useNavigate();
  const [team, setTeam] = useState(null);
  const [mainSite, setMainSite] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [inviteData, setInviteData] = useState({ email: '', name: '', role: 'editor' });
  const [inviting, setInviting] = useState(false);
  const [tempPassword, setTempPassword] = useState('');
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  
  // Dynamic roles from RBAC system
  const [availableRoles, setAvailableRoles] = useState([
    // Fallback defaults until dynamic roles are loaded
    { slug: 'admin', name: 'Admin', color: '#ef4444', description: 'Full access to everything' },
    { slug: 'editor', name: 'Editor', color: '#f59e0b', description: 'Can manage content and shows' },
    { slug: 'presenter', name: 'Presenter', color: '#3b82f6', description: 'Can view and manage assigned shows' },
    { slug: 'viewer', name: 'Viewer', color: '#6b7280', description: 'Read-only access' },
  ]);
  
  // Add existing user state
  const [addExistingUserDialogOpen, setAddExistingUserDialogOpen] = useState(false);
  const [availableUsers, setAvailableUsers] = useState([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [selectedExistingUser, setSelectedExistingUser] = useState(null);
  const [addingExistingUser, setAddingExistingUser] = useState(false);
  const [existingUserRole, setExistingUserRole] = useState('editor');

  // Helper: get icon for a role slug
  const getRoleIcon = useCallback((slug) => {
    return SYSTEM_ROLE_ICONS[slug] || CircleDot;
  }, []);

  // Helper: get display label for a role slug
  const getRoleLabel = useCallback((slug) => {
    const role = availableRoles.find(r => r.slug === slug);
    if (role) return role.name;
    // Fallback for unrecognized slugs
    return slug?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Unknown';
  }, [availableRoles]);

  // Helper: get color classes for a role
  const getRoleColor = useCallback((slug) => {
    const role = availableRoles.find(r => r.slug === slug);
    if (role?.color) {
      return { style: { backgroundColor: `${role.color}20`, color: role.color } };
    }
    // Fallback
    return { className: 'bg-zinc-500/20 text-zinc-400' };
  }, [availableRoles]);
  
  // Helper for context-aware navigation - uses URL param directly
  const navTo = (path) => mainSiteSlug ? `/${mainSiteSlug}${path}` : path;
  
  // Edit user state
  const [editUserDialogOpen, setEditUserDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [editUserData, setEditUserData] = useState({ name: '', email: '' });
  const [savingUser, setSavingUser] = useState(false);
  
  // Reset password state
  const [resetPasswordDialogOpen, setResetPasswordDialogOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);
  
  // Avatar upload state
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarTargetUserId, setAvatarTargetUserId] = useState(null);
  const avatarInputRef = useRef(null);
  
  // State for main site admin check
  const [isMainSiteAdmin, setIsMainSiteAdmin] = useState(false);
  const [adminCheckDone, setAdminCheckDone] = useState(false);

  // Check if user is admin for this main site
  useEffect(() => {
    const checkMainSiteAdmin = async () => {
      if (!mainSiteSlug) {
        // Not in main site context, use global admin
        setIsMainSiteAdmin(isGlobalAdmin);
        setAdminCheckDone(true);
        return;
      }
      
      try {
        const response = await axios.get(`${API}/main-sites/my/access`);
        const siteAccess = response.data.main_sites?.find(s => s.slug === mainSiteSlug);
        const hasAdminAccess = response.data.is_network_admin || siteAccess?.role === 'admin';
        setIsMainSiteAdmin(hasAdminAccess);
      } catch (error) {
        console.error('Failed to check admin access:', error);
        setIsMainSiteAdmin(false);
      } finally {
        setAdminCheckDone(true);
      }
    };
    
    checkMainSiteAdmin();
  }, [mainSiteSlug, isGlobalAdmin]);

  useEffect(() => {
    if (!adminCheckDone) return;
    
    if (!isMainSiteAdmin) {
      setLoading(false); // Stop loading to show access denied message
      return;
    }
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMainSiteAdmin, adminCheckDone, mainSiteSlug]);

  const fetchData = async () => {
    try {
      // Fetch users and team data
      const usersRes = await axios.get(`${API}/users`);
      const teamRes = await axios.get(`${API}/teams/current`);
      setTeam(teamRes.data);
      setUsers(usersRes.data);
      
      // In multisite context, fetch main site info and available roles
      if (mainSiteSlug) {
        try {
          const mainSitesRes = await axios.get(`${API}/main-sites`);
          const currentMainSite = mainSitesRes.data.find(s => s.slug === mainSiteSlug);
          if (currentMainSite) {
            setMainSite(currentMainSite);
            // Fetch available roles for this main site
            try {
              const rolesRes = await axios.get(`${API}/roles/${currentMainSite.id}/available`);
              if (rolesRes.data.roles?.length > 0) {
                setAvailableRoles(rolesRes.data.roles);
              }
            } catch (rolesErr) {
              console.error('Failed to load roles:', rolesErr);
            }
          }
        } catch (msErr) {
          console.error('Failed to load main site info:', msErr);
        }
      }
    } catch (error) {
      console.error('Failed to load data:', error);
      toast.error('Failed to load team data');
    } finally {
      setLoading(false);
    }
  };

  const handleInviteUser = async (e) => {
    e.preventDefault();
    setInviting(true);
    try {
      const response = await axios.post(`${API}/users/invite`, inviteData);
      const newUser = response.data;
      setUsers([...users, newUser]);
      
      // Get temporary password
      const pwResponse = await axios.get(`${API}/users/invite/${newUser.id}/password`);
      setTempPassword(pwResponse.data.temp_password);
      
      setInviteDialogOpen(false);
      setPasswordDialogOpen(true);
      setInviteData({ email: '', name: '', role: 'editor' });
      toast.success('User invited successfully');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to invite user');
    } finally {
      setInviting(false);
    }
  };

  // Search for available users (from other main sites)
  const searchAvailableUsers = async (query = '') => {
    if (!mainSite) return;
    setSearchingUsers(true);
    try {
      const response = await axios.get(
        `${API}/main-sites/${mainSite.id}/users/available${query ? `?search=${encodeURIComponent(query)}` : ''}`
      );
      setAvailableUsers(response.data);
    } catch (error) {
      console.error('Failed to search available users:', error);
      toast.error('Failed to search users');
    } finally {
      setSearchingUsers(false);
    }
  };

  // Add existing user to this main site
  const handleAddExistingUser = async () => {
    if (!selectedExistingUser || !mainSite) return;
    setAddingExistingUser(true);
    try {
      await axios.post(`${API}/main-sites/${mainSite.id}/users`, {
        user_id: selectedExistingUser.id,
        role: existingUserRole
      });
      
      // Refresh users list
      await fetchData();
      
      setAddExistingUserDialogOpen(false);
      setSelectedExistingUser(null);
      setExistingUserRole('editor');
      setUserSearchQuery('');
      setAvailableUsers([]);
      toast.success(`${selectedExistingUser.name} added to ${mainSite.name}`);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to add user');
    } finally {
      setAddingExistingUser(false);
    }
  };

  const handleUpdateRole = async (userId, newRole) => {
    try {
      await axios.put(`${API}/users/${userId}/role`, { role: newRole });
      setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u));
      toast.success('Role updated');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update role');
    }
  };

  const handleRemoveUser = async () => {
    if (!selectedUser) return;
    try {
      await axios.delete(`${API}/users/${selectedUser.id}`);
      setUsers(users.filter(u => u.id !== selectedUser.id));
      setDeleteDialogOpen(false);
      setSelectedUser(null);
      toast.success('User removed');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to remove user');
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const openEditUser = (member) => {
    setEditingUser(member);
    setEditUserData({ name: member.name, email: member.email });
    setEditUserDialogOpen(true);
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    if (!editingUser) return;
    setSavingUser(true);
    
    try {
      await axios.put(`${API}/users/${editingUser.id}`, editUserData);
      setUsers(users.map(u => u.id === editingUser.id ? { ...u, ...editUserData } : u));
      setEditUserDialogOpen(false);
      setEditingUser(null);
      toast.success('User updated successfully');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update user');
    } finally {
      setSavingUser(false);
    }
  };

  const openResetPassword = (member) => {
    setEditingUser(member);
    setNewPassword('');
    setResetPasswordDialogOpen(true);
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!editingUser) return;
    setResettingPassword(true);
    
    try {
      await axios.put(`${API}/users/${editingUser.id}/password`, { password: newPassword });
      setResetPasswordDialogOpen(false);
      setEditingUser(null);
      setNewPassword('');
      toast.success('Password reset successfully');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to reset password');
    } finally {
      setResettingPassword(false);
    }
  };

  const handleAvatarUpload = async (file, userId) => {
    if (!file) return;
    setUploadingAvatar(true);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await axios.post(`${API}/users/${userId}/avatar`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      setUsers(users.map(u => u.id === userId ? { ...u, avatar: response.data.avatar } : u));
      toast.success('Avatar uploaded successfully');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to upload avatar');
    } finally {
      setUploadingAvatar(false);
      if (avatarInputRef.current) {
        avatarInputRef.current.value = '';
      }
    }
  };

  const handleRemoveAvatar = async (userId) => {
    try {
      await axios.delete(`${API}/users/${userId}/avatar`);
      setUsers(users.map(u => u.id === userId ? { ...u, avatar: null } : u));
      toast.success('Avatar removed');
    } catch (error) {
      toast.error('Failed to remove avatar');
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-8 bg-zinc-100 rounded w-48 mb-8" />
        <div className="h-64 bg-zinc-100 rounded-xl" />
      </div>
    );
  }

  if (adminCheckDone && !isMainSiteAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center" data-testid="no-access-message">
        <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-6">
          <ShieldAlert className="w-8 h-8 text-red-400" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Geen toegang</h2>
        <p className="text-zinc-400 max-w-md">
          Je hebt geen beheerdersrechten om de teaminstellingen te bekijken of aan te passen.
          Neem contact op met een beheerder als je denkt dat dit een fout is.
        </p>
      </div>
    );
  }

  return (
    <div data-testid="team-settings-page">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-black text-white mb-1 sm:mb-2">Site Settings</h1>
        <p className="text-zinc-400">Manage users for {mainSite?.name || 'this site'}</p>
      </div>

      {/* Team Info */}
      <div className="bg-zinc-100 border border-zinc-200 rounded-xl p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-500/20 rounded-lg">
              <Building2 className="w-5 h-5 text-orange-500" />
            </div>
            <h2 className="text-lg font-semibold text-white">Site Information</h2>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-2xl font-bold text-white">{team?.name}</p>
            <p className="text-sm text-zinc-500 mt-1">
              {mainSiteSlug ? `/${mainSiteSlug}` : `Created ${new Date(team?.created_at).toLocaleDateString()}`}
            </p>
          </div>
        </div>
      </div>

      {/* Users Section */}
      <div className="bg-zinc-100 border border-zinc-200 rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-violet-500/20 rounded-lg">
              <Users className="w-5 h-5 text-violet-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Team Members</h2>
              <p className="text-sm text-zinc-500">{users.length} members</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {mainSite && user?.is_network_admin && (
              <Button
                data-testid="add-existing-user-btn"
                onClick={() => {
                  setAddExistingUserDialogOpen(true);
                  searchAvailableUsers();
                }}
                variant="outline"
                className="gap-2 border-zinc-300 text-zinc-600 hover:bg-zinc-100"
              >
                <ArrowLeftRight className="w-4 h-4" />
                Add Existing User
              </Button>
            )}
            <Button
              data-testid="invite-user-btn"
              onClick={() => setInviteDialogOpen(true)}
              className="gap-2 bg-violet-500 hover:bg-violet-600 text-white"
            >
              <UserPlus className="w-4 h-4" />
              Invite User
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          {users.map((member) => {
            const RoleIcon = getRoleIcon(member.role);
            const isCurrentUser = member.id === user?.id;
            const roleColorInfo = getRoleColor(member.role);

            return (
              <div
                key={member.id}
                data-testid={`user-row-${member.id}`}
                className="flex items-center justify-between p-4 bg-zinc-100 rounded-lg"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-zinc-200 flex items-center justify-center overflow-hidden">
                    {getAvatarUrl(member) ? (
                      <img
                        src={getAvatarUrl(member)}
                        alt={member.name}
                        className="w-full h-full object-cover"
                        key={getAvatarUrl(member)}
                      />
                    ) : (
                      <span className="text-white font-medium">
                        {member.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-white font-medium">{member.name}</p>
                      {isCurrentUser && (
                        <span className="text-xs bg-zinc-200 text-zinc-600 px-2 py-0.5 rounded">
                          You
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-zinc-500">{member.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  {isCurrentUser ? (
                    <>
                      <span
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm ${roleColorInfo.className || ''}`}
                        style={roleColorInfo.style || {}}
                      >
                        <RoleIcon className="w-4 h-4" />
                        {getRoleLabel(member.role)}
                      </span>
                      
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-zinc-400 hover:text-zinc-900 hover:bg-zinc-200"
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-zinc-100 border-zinc-200">
                          <DropdownMenuItem
                            onClick={() => openEditUser(member)}
                            className="text-zinc-600"
                          >
                            <User className="w-4 h-4 mr-2" />
                            Edit Profile
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setAvatarTargetUserId(member.id);
                              setTimeout(() => avatarInputRef.current?.click(), 100);
                            }}
                            className="text-zinc-600"
                          >
                            <Camera className="w-4 h-4 mr-2" />
                            {member.avatar ? 'Change Avatar' : 'Upload Avatar'}
                          </DropdownMenuItem>
                          {member.avatar && (
                            <DropdownMenuItem
                              onClick={() => handleRemoveAvatar(member.id)}
                              className="text-zinc-600"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Remove Avatar
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={() => openResetPassword(member)}
                            className="text-zinc-600"
                          >
                            <KeyRound className="w-4 h-4 mr-2" />
                            Change Password
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </>
                  ) : (
                    <>
                      <Select
                        value={member.role}
                        onValueChange={(value) => handleUpdateRole(member.id, value)}
                      >
                        <SelectTrigger className="w-40 bg-zinc-100 border-zinc-300 text-zinc-600">
                          <div className="flex items-center gap-2">
                            <RoleIcon className="w-4 h-4" />
                            <span>{getRoleLabel(member.role)}</span>
                          </div>
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-100 border-zinc-200">
                          {/* Show current role if not in available roles (legacy) */}
                          {!availableRoles.find(r => r.slug === member.role) && (
                            <SelectItem value={member.role} className="text-zinc-500 focus:text-white focus:bg-zinc-800">
                              <div className="flex items-center gap-2">
                                <RoleIcon className="w-4 h-4" />
                                {getRoleLabel(member.role)} (legacy)
                              </div>
                            </SelectItem>
                          )}
                          {availableRoles.map((role) => {
                            const Icon = getRoleIcon(role.slug);
                            return (
                              <SelectItem key={role.slug} value={role.slug} className="text-zinc-600 focus:text-white focus:bg-zinc-800">
                                <div className="flex items-center gap-2">
                                  <Icon className="w-4 h-4" style={{ color: role.color }} />
                                  {role.name}
                                </div>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-zinc-400 hover:text-zinc-900 hover:bg-zinc-200"
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-zinc-100 border-zinc-200">
                          <DropdownMenuItem
                            onClick={() => openEditUser(member)}
                            className="text-zinc-600"
                          >
                            <User className="w-4 h-4 mr-2" />
                            Edit Profile
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setAvatarTargetUserId(member.id);
                              setTimeout(() => avatarInputRef.current?.click(), 100);
                            }}
                            className="text-zinc-600"
                          >
                            <Camera className="w-4 h-4 mr-2" />
                            {member.avatar ? 'Change Avatar' : 'Upload Avatar'}
                          </DropdownMenuItem>
                          {member.avatar && (
                            <DropdownMenuItem
                              onClick={() => handleRemoveAvatar(member.id)}
                              className="text-zinc-600"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Remove Avatar
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={() => openResetPassword(member)}
                            className="text-zinc-600"
                          >
                            <KeyRound className="w-4 h-4 mr-2" />
                            Reset Password
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={async () => {
                              try {
                                await switchToUser(member.id);
                                toast.success(`Switched to ${member.name}'s account`);
                                // Navigate to shows page within current main site context
                                navigate(navTo('/shows'));
                              } catch (error) {
                                toast.error('Failed to switch user');
                              }
                            }}
                            className="text-blue-400"
                          >
                            <ArrowLeftRight className="w-4 h-4 mr-2" />
                            Login as User
                          </DropdownMenuItem>
                          <DropdownMenuSeparator className="bg-zinc-800" />
                          <DropdownMenuItem
                            onClick={() => {
                              setSelectedUser(member);
                              setDeleteDialogOpen(true);
                            }}
                            className="text-orange-500 focus:text-orange-500"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Remove User
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Invite User Dialog */}
      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent className="bg-zinc-100 border-zinc-200 text-white sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Invite User</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Add a new team member. They&apos;ll receive a temporary password.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleInviteUser} className="space-y-5 mt-4">
            <div className="space-y-2">
              <Label className="text-zinc-600">Name</Label>
              <Input
                data-testid="invite-name-input"
                value={inviteData.name}
                onChange={(e) => setInviteData({ ...inviteData, name: e.target.value })}
                placeholder="John Doe"
                required
                className="bg-zinc-100 border-zinc-300 text-white placeholder:text-zinc-500"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-zinc-600">Email</Label>
              <Input
                data-testid="invite-email-input"
                type="email"
                value={inviteData.email}
                onChange={(e) => setInviteData({ ...inviteData, email: e.target.value })}
                placeholder="john@example.com"
                required
                className="bg-zinc-100 border-zinc-300 text-white placeholder:text-zinc-500"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-zinc-600">Role</Label>
              <Select
                value={inviteData.role}
                onValueChange={(value) => setInviteData({ ...inviteData, role: value })}
              >
                <SelectTrigger
                  data-testid="invite-role-select"
                  className="bg-zinc-100 border-zinc-300 text-white"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-100 border-zinc-200">
                  {availableRoles.map((role) => {
                    const Icon = getRoleIcon(role.slug);
                    return (
                      <SelectItem key={role.slug} value={role.slug} className="text-zinc-600 focus:text-white focus:bg-zinc-800">
                        <div className="flex items-center gap-2">
                          <Icon className="w-4 h-4" style={{ color: role.color }} />
                          {role.name}{role.description ? ` - ${role.description}` : ''}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setInviteDialogOpen(false)}
                className="flex-1 bg-transparent border-zinc-300 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                data-testid="submit-invite-btn"
                disabled={inviting}
                className="flex-1 bg-violet-500 hover:bg-violet-600 text-white"
              >
                {inviting ? 'Inviting...' : 'Send Invite'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Existing User Dialog */}
      <Dialog open={addExistingUserDialogOpen} onOpenChange={setAddExistingUserDialogOpen}>
        <DialogContent className="bg-zinc-100 border-zinc-200 text-white sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <ArrowLeftRight className="w-5 h-5 text-violet-400" />
              Add Existing User
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              Add a user from another main site to {mainSite?.name}.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            {/* Search */}
            <div>
              <Label className="text-zinc-600 mb-2 block">Search Users</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Search by name or email..."
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && searchAvailableUsers(userSearchQuery)}
                  className="bg-zinc-100 border-zinc-300 text-white"
                />
                <Button
                  onClick={() => searchAvailableUsers(userSearchQuery)}
                  disabled={searchingUsers}
                  className="bg-zinc-200 hover:bg-zinc-200"
                >
                  {searchingUsers ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
                </Button>
              </div>
            </div>

            {/* Available Users List */}
            <div className="max-h-64 overflow-y-auto space-y-2">
              {availableUsers.length === 0 && !searchingUsers && (
                <p className="text-zinc-500 text-sm text-center py-4">
                  {userSearchQuery ? 'No users found' : 'Search for users to add'}
                </p>
              )}
              {availableUsers.map((availableUser) => (
                <div
                  key={availableUser.id}
                  onClick={() => setSelectedExistingUser(availableUser)}
                  className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                    selectedExistingUser?.id === availableUser.id
                      ? 'bg-violet-500/20 border border-violet-500/50'
                      : 'bg-zinc-100 hover:bg-zinc-200'
                  }`}
                >
                  <div>
                    <p className="text-white font-medium">{availableUser.name}</p>
                    <p className="text-sm text-zinc-500">{availableUser.email}</p>
                    {availableUser.other_main_sites?.length > 0 && (
                      <p className="text-xs text-zinc-600 mt-1">
                        Also in: {availableUser.other_main_sites.join(', ')}
                      </p>
                    )}
                  </div>
                  {selectedExistingUser?.id === availableUser.id && (
                    <Check className="w-5 h-5 text-violet-400" />
                  )}
                </div>
              ))}
            </div>

            {/* Role Selection */}
            {selectedExistingUser && (
              <div>
                <Label className="text-zinc-600 mb-2 block">
                  Role for {selectedExistingUser.name}
                </Label>
                <Select value={existingUserRole} onValueChange={setExistingUserRole}>
                  <SelectTrigger className="bg-zinc-100 border-zinc-300 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-100 border-zinc-200">
                    {availableRoles.map((role) => {
                      const Icon = getRoleIcon(role.slug);
                      return (
                        <SelectItem key={role.slug} value={role.slug} className="text-zinc-600">
                          <div className="flex items-center gap-2">
                            <Icon className="w-4 h-4" style={{ color: role.color }} />
                            {role.name}
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setAddExistingUserDialogOpen(false);
                  setSelectedExistingUser(null);
                  setUserSearchQuery('');
                  setAvailableUsers([]);
                }}
                className="flex-1 bg-transparent border-zinc-300 text-zinc-600 hover:bg-zinc-100"
              >
                Cancel
              </Button>
              <Button
                onClick={handleAddExistingUser}
                disabled={!selectedExistingUser || addingExistingUser}
                className="flex-1 bg-violet-500 hover:bg-violet-600 text-white"
              >
                {addingExistingUser ? 'Adding...' : 'Add User'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Temporary Password Dialog */}
      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent className="bg-zinc-100 border-zinc-200 text-white sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">User Invited!</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Share this temporary password with the new user. They should change it after first login.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4">
            <Label className="text-zinc-600 mb-2 block">Temporary Password</Label>
            <div className="flex items-center gap-2">
              <Input
                value={tempPassword}
                readOnly
                className="bg-zinc-100 border-zinc-300 text-white font-mono"
              />
              <Button
                onClick={() => copyToClipboard(tempPassword)}
                className="bg-zinc-200 hover:bg-zinc-200"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
            <p className="text-xs text-zinc-500 mt-2">
              The user can log in with their email and this password.
            </p>
          </div>

          <Button
            onClick={() => {
              setPasswordDialogOpen(false);
              setTempPassword('');
            }}
            className="w-full mt-4 bg-violet-500 hover:bg-violet-600 text-white"
          >
            Done
          </Button>
        </DialogContent>
      </Dialog>

      {/* Delete User Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-zinc-100 border-zinc-200">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Remove User</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              Are you sure you want to remove {selectedUser?.name} from the team? They will lose access to all team shows.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-zinc-300 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveUser}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit User Dialog */}
      <Dialog open={editUserDialogOpen} onOpenChange={setEditUserDialogOpen}>
        <DialogContent className="bg-zinc-100 border-zinc-200 text-white sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Edit User</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Update user profile information.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleUpdateUser} className="space-y-5 mt-4">
            <div className="space-y-2">
              <Label className="text-zinc-600">Display Name</Label>
              <Input
                data-testid="edit-user-name-input"
                value={editUserData.name}
                onChange={(e) => setEditUserData({ ...editUserData, name: e.target.value })}
                placeholder="John Doe"
                required
                className="bg-zinc-100 border-zinc-300 text-white placeholder:text-zinc-500"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-zinc-600">Email Address</Label>
              <Input
                data-testid="edit-user-email-input"
                type="email"
                value={editUserData.email}
                onChange={(e) => setEditUserData({ ...editUserData, email: e.target.value })}
                placeholder="john@example.com"
                required
                className="bg-zinc-100 border-zinc-300 text-white placeholder:text-zinc-500"
              />
            </div>

            <DialogFooter className="gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditUserDialogOpen(false)}
                className="flex-1 bg-transparent border-zinc-300 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                data-testid="save-user-btn"
                disabled={savingUser}
                className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
              >
                {savingUser ? 'Saving...' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={resetPasswordDialogOpen} onOpenChange={setResetPasswordDialogOpen}>
        <DialogContent className="bg-zinc-100 border-zinc-200 text-white sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Reset Password</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Set a new password for {editingUser?.name}.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleResetPassword} className="space-y-5 mt-4">
            <div className="space-y-2">
              <Label className="text-zinc-600">New Password</Label>
              <Input
                data-testid="reset-password-input"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                required
                minLength={6}
                className="bg-zinc-100 border-zinc-300 text-white placeholder:text-zinc-500"
              />
              <p className="text-xs text-zinc-500">Minimum 6 characters</p>
            </div>

            <DialogFooter className="gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setResetPasswordDialogOpen(false)}
                className="flex-1 bg-transparent border-zinc-300 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                data-testid="confirm-reset-password-btn"
                disabled={resettingPassword}
                className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
              >
                {resettingPassword ? 'Resetting...' : 'Reset Password'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Hidden Avatar File Input */}
      <input
        ref={avatarInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.[0] && avatarTargetUserId) {
            handleAvatarUpload(e.target.files[0], avatarTargetUserId);
          }
        }}
      />
    </div>
  );
};

export default TeamSettingsPage;
