import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const roleIcons = {
  admin: Crown,
  editor: Pencil,
  presenter: Mic,
  viewer: Eye,
};

const roleColors = {
  admin: 'bg-rose-500/20 text-rose-400',
  editor: 'bg-violet-500/20 text-violet-400',
  presenter: 'bg-amber-500/20 text-amber-400',
  viewer: 'bg-zinc-500/20 text-zinc-400',
};

const roleLabels = {
  admin: 'Admin',
  editor: 'Editor',
  presenter: 'Presenter',
  viewer: 'Viewer',
};

const TeamSettingsPage = () => {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [team, setTeam] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isEditingTeam, setIsEditingTeam] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [inviteData, setInviteData] = useState({ email: '', name: '', role: 'editor' });
  const [inviting, setInviting] = useState(false);
  const [tempPassword, setTempPassword] = useState('');
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isAdmin) {
      navigate('/shows');
      return;
    }
    fetchData();
  }, [isAdmin]);

  const fetchData = async () => {
    try {
      const [teamRes, usersRes] = await Promise.all([
        axios.get(`${API}/teams/current`),
        axios.get(`${API}/users`),
      ]);
      setTeam(teamRes.data);
      setTeamName(teamRes.data.name);
      setUsers(usersRes.data);
    } catch (error) {
      toast.error('Failed to load team data');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateTeamName = async () => {
    try {
      await axios.put(`${API}/teams/current`, { name: teamName });
      setTeam({ ...team, name: teamName });
      setIsEditingTeam(false);
      toast.success('Team name updated');
    } catch (error) {
      toast.error('Failed to update team name');
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

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-8 bg-zinc-800 rounded w-48 mb-8" />
        <div className="h-64 bg-zinc-800 rounded-xl" />
      </div>
    );
  }

  return (
    <div data-testid="team-settings-page">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-black text-white mb-2">Team Settings</h1>
        <p className="text-zinc-400">Manage your team and users</p>
      </div>

      {/* Team Info */}
      <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-rose-500/20 rounded-lg">
              <Building2 className="w-5 h-5 text-rose-500" />
            </div>
            <h2 className="text-lg font-semibold text-white">Team Information</h2>
          </div>
        </div>

        {isEditingTeam ? (
          <div className="flex items-center gap-4">
            <Input
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              className="bg-[#27272a] border-zinc-700 text-white max-w-md"
              placeholder="Team name"
            />
            <Button
              onClick={handleUpdateTeamName}
              className="bg-rose-500 hover:bg-rose-600 text-white"
            >
              Save
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setIsEditingTeam(false);
                setTeamName(team.name);
              }}
              className="bg-transparent border-zinc-700 text-zinc-300"
            >
              Cancel
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold text-white">{team?.name}</p>
              <p className="text-sm text-zinc-500 mt-1">
                Created {new Date(team?.created_at).toLocaleDateString()}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditingTeam(true)}
              className="gap-2 bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white"
            >
              <Edit2 className="w-4 h-4" />
              Edit
            </Button>
          </div>
        )}
      </div>

      {/* Users Section */}
      <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-6">
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
          <Button
            data-testid="invite-user-btn"
            onClick={() => setInviteDialogOpen(true)}
            className="gap-2 bg-violet-500 hover:bg-violet-600 text-white"
          >
            <UserPlus className="w-4 h-4" />
            Invite User
          </Button>
        </div>

        <div className="space-y-3">
          {users.map((member) => {
            const RoleIcon = roleIcons[member.role] || Eye;
            const isCurrentUser = member.id === user?.id;

            return (
              <div
                key={member.id}
                data-testid={`user-row-${member.id}`}
                className="flex items-center justify-between p-4 bg-[#27272a] rounded-lg"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center">
                    <span className="text-white font-medium">
                      {member.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-white font-medium">{member.name}</p>
                      {isCurrentUser && (
                        <span className="text-xs bg-zinc-700 text-zinc-300 px-2 py-0.5 rounded">
                          You
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-zinc-500">{member.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  {isCurrentUser ? (
                    <span className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm ${roleColors[member.role]}`}>
                      <RoleIcon className="w-4 h-4" />
                      {roleLabels[member.role]}
                    </span>
                  ) : (
                    <>
                      <Select
                        value={member.role}
                        onValueChange={(value) => handleUpdateRole(member.id, value)}
                      >
                        <SelectTrigger className="w-32 bg-[#18181b] border-zinc-700 text-zinc-300">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-[#18181b] border-zinc-800">
                          <SelectItem value="admin" className="text-zinc-300 focus:text-white focus:bg-zinc-800">
                            <div className="flex items-center gap-2">
                              <Crown className="w-4 h-4" />
                              Admin
                            </div>
                          </SelectItem>
                          <SelectItem value="editor" className="text-zinc-300 focus:text-white focus:bg-zinc-800">
                            <div className="flex items-center gap-2">
                              <Pencil className="w-4 h-4" />
                              Editor
                            </div>
                          </SelectItem>
                          <SelectItem value="presenter" className="text-zinc-300 focus:text-white focus:bg-zinc-800">
                            <div className="flex items-center gap-2">
                              <Mic className="w-4 h-4" />
                              Presenter
                            </div>
                          </SelectItem>
                          <SelectItem value="viewer" className="text-zinc-300 focus:text-white focus:bg-zinc-800">
                            <div className="flex items-center gap-2">
                              <Eye className="w-4 h-4" />
                              Viewer
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setSelectedUser(member);
                          setDeleteDialogOpen(true);
                        }}
                        className="text-zinc-400 hover:text-rose-500 hover:bg-rose-500/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
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
        <DialogContent className="bg-[#18181b] border-zinc-800 text-white sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Invite User</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Add a new team member. They&apos;ll receive a temporary password.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleInviteUser} className="space-y-5 mt-4">
            <div className="space-y-2">
              <Label className="text-zinc-300">Name</Label>
              <Input
                data-testid="invite-name-input"
                value={inviteData.name}
                onChange={(e) => setInviteData({ ...inviteData, name: e.target.value })}
                placeholder="John Doe"
                required
                className="bg-[#27272a] border-zinc-700 text-white placeholder:text-zinc-500"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-zinc-300">Email</Label>
              <Input
                data-testid="invite-email-input"
                type="email"
                value={inviteData.email}
                onChange={(e) => setInviteData({ ...inviteData, email: e.target.value })}
                placeholder="john@example.com"
                required
                className="bg-[#27272a] border-zinc-700 text-white placeholder:text-zinc-500"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-zinc-300">Role</Label>
              <Select
                value={inviteData.role}
                onValueChange={(value) => setInviteData({ ...inviteData, role: value })}
              >
                <SelectTrigger
                  data-testid="invite-role-select"
                  className="bg-[#27272a] border-zinc-700 text-white"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#18181b] border-zinc-800">
                  <SelectItem value="admin" className="text-zinc-300 focus:text-white focus:bg-zinc-800">
                    <div className="flex items-center gap-2">
                      <Crown className="w-4 h-4" />
                      Admin - Full access
                    </div>
                  </SelectItem>
                  <SelectItem value="editor" className="text-zinc-300 focus:text-white focus:bg-zinc-800">
                    <div className="flex items-center gap-2">
                      <Pencil className="w-4 h-4" />
                      Editor - Create & edit content
                    </div>
                  </SelectItem>
                  <SelectItem value="presenter" className="text-zinc-300 focus:text-white focus:bg-zinc-800">
                    <div className="flex items-center gap-2">
                      <Mic className="w-4 h-4" />
                      Presenter - Edit assigned shows
                    </div>
                  </SelectItem>
                  <SelectItem value="viewer" className="text-zinc-300 focus:text-white focus:bg-zinc-800">
                    <div className="flex items-center gap-2">
                      <Eye className="w-4 h-4" />
                      Viewer - Read-only access
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setInviteDialogOpen(false)}
                className="flex-1 bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white"
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

      {/* Temporary Password Dialog */}
      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent className="bg-[#18181b] border-zinc-800 text-white sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">User Invited!</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Share this temporary password with the new user. They should change it after first login.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4">
            <Label className="text-zinc-300 mb-2 block">Temporary Password</Label>
            <div className="flex items-center gap-2">
              <Input
                value={tempPassword}
                readOnly
                className="bg-[#27272a] border-zinc-700 text-white font-mono"
              />
              <Button
                onClick={() => copyToClipboard(tempPassword)}
                className="bg-zinc-700 hover:bg-zinc-600"
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
        <AlertDialogContent className="bg-[#18181b] border-zinc-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Remove User</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              Are you sure you want to remove {selectedUser?.name} from the team? They will lose access to all team shows.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveUser}
              className="bg-rose-500 hover:bg-rose-600 text-white"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default TeamSettingsPage;
