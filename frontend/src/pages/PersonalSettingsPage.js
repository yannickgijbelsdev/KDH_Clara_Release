/* eslint-disable */
import { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Settings,
  User,
  Loader2,
  Check,
  Shield,
  ScanSearch,
  Pencil,
  X,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { getAvatarUrl } from '../utils/avatar';
import TwoFactorSetup from '../components/TwoFactorSetup';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const PersonalSettingsPage = () => {
  const { user, updateUserPreferences, refreshUser } = useAuth();
  const [saving, setSaving] = useState(false);
  const [preferences, setPreferences] = useState({
    grouped_menu: true,
    show_pwa_prompt: true,
    show_login_scan: true,
  });
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [savingName, setSavingName] = useState(false);
  const canEditName = user?.role === 'admin' || user?.is_network_admin || user?.is_system_admin;

  useEffect(() => {
    // Load preferences from user object
    if (user?.preferences) {
      setPreferences({
        grouped_menu: user.preferences.grouped_menu ?? true,
        show_pwa_prompt: user.preferences.show_pwa_prompt ?? true,
        show_login_scan: user.preferences.show_login_scan ?? true,
      });
    }
  }, [user]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.put(`${API}/users/me/preferences`, preferences);
      if (updateUserPreferences) {
        updateUserPreferences(preferences);
      }
      toast.success('Settings saved');
    } catch (error) {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const toggleGroupedMenu = (checked) => {
    setPreferences(prev => ({ ...prev, grouped_menu: checked }));
  };

  return (
    <div data-testid="personal-settings-page">
      {/* Header */}
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-black text-zinc-900 mb-1 sm:mb-2">
          Personal Settings
        </h1>
        <p className="text-sm sm:text-base text-zinc-400">
          Customize your Clara experience
        </p>
      </div>

      {/* Profile Section */}
      <div className="bg-white border border-zinc-200 rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold text-zinc-900 mb-4 flex items-center gap-2">
          <User className="w-5 h-5 text-[#7380b6]0" />
          Profile
        </h2>

        <div className="flex items-center gap-4">
          <img
            src={getAvatarUrl(user)}
            alt={user?.name || 'avatar'}
            className="w-16 h-16 rounded-full object-cover border border-zinc-200 bg-zinc-100 flex-shrink-0"
            data-testid="profile-avatar"
          />
          <div className="flex-1 min-w-0">
            {editingName ? (
              <div className="flex items-center gap-2 mb-1">
                <Input
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  className="h-9 max-w-xs"
                  autoFocus
                  data-testid="profile-name-input"
                />
                <Button
                  size="sm"
                  disabled={savingName || !nameValue.trim() || nameValue === user?.name}
                  onClick={async () => {
                    if (!user?.id) return;
                    setSavingName(true);
                    try {
                      await axios.put(`${API}/users/${user.id}`, { name: nameValue.trim() });
                      toast.success('Name updated');
                      if (refreshUser) await refreshUser();
                      setEditingName(false);
                    } catch (e) {
                      toast.error(e.response?.data?.detail || 'Could not update name');
                    } finally {
                      setSavingName(false);
                    }
                  }}
                  className="h-9 bg-[#7380b6] hover:bg-[#5f6ca3] !text-white [&_svg]:!text-white gap-1 rounded-full px-3"
                  data-testid="profile-name-save"
                >
                  {savingName ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { setEditingName(false); setNameValue(user?.name || ''); }}
                  className="h-9 gap-1 rounded-full px-3"
                  data-testid="profile-name-cancel"
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <p className="text-lg font-semibold text-zinc-900">{user?.name}</p>
                {canEditName && (
                  <button
                    onClick={() => { setNameValue(user?.name || ''); setEditingName(true); }}
                    className="w-7 h-7 rounded-full hover:bg-zinc-100 flex items-center justify-center text-zinc-400 hover:text-[#7380b6] transition-colors"
                    title="Edit name"
                    data-testid="profile-name-edit"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
            <p className="text-zinc-400">{user?.email}</p>
            <p className="text-sm text-[#7380b6] capitalize">{user?.role}</p>
          </div>
        </div>
      </div>

      {/* Security Section */}
      <div className="bg-white border border-zinc-200 rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold text-zinc-900 mb-4 flex items-center gap-2">
          <Shield className="w-5 h-5 text-[#7380b6]0" />
          Beveiliging
        </h2>
        
        <TwoFactorSetup user={user} onUpdate={refreshUser} />
      </div>

      {/* Clara Login Scan */}
      <div className="bg-white border border-zinc-200 rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold text-zinc-900 mb-4 flex items-center gap-2">
          <ScanSearch className="w-5 h-5 text-[#7380b6]0" />
          Clara System Scan
        </h2>
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <Label className="text-zinc-900 font-medium">Scan at login</Label>
            <p className="text-sm text-zinc-400 mt-1">
              Run an automatic infrastructure and configuration scan every time you log in. Clara will check all sites, firewalls, and integrations for issues.
            </p>
          </div>
          <Switch
            checked={preferences.show_login_scan}
            onCheckedChange={(checked) => setPreferences(prev => ({ ...prev, show_login_scan: checked }))}
            className="data-[state=checked]:bg-[#7380b6]"
            data-testid="login-scan-toggle"
          />
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-[#7380b6] hover:bg-[#5f6ca3] !text-white [&_svg]:!text-white gap-2 px-6"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Check className="w-4 h-4" />
              Save Settings
            </>
          )}
        </Button>
      </div>
    </div>
  );
};

export default PersonalSettingsPage;
