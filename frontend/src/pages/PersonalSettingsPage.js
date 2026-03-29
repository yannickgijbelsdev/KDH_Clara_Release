import { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Settings,
  LayoutGrid,
  List,
  User,
  Loader2,
  Check,
  Shield,
  Smartphone,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import TwoFactorSetup from '../components/TwoFactorSetup';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const PersonalSettingsPage = () => {
  const { user, updateUserPreferences, refreshUser } = useAuth();
  const [saving, setSaving] = useState(false);
  const [preferences, setPreferences] = useState({
    grouped_menu: true,
    show_pwa_prompt: true,
  });

  useEffect(() => {
    // Load preferences from user object
    if (user?.preferences) {
      setPreferences({
        grouped_menu: user.preferences.grouped_menu ?? true,
        show_pwa_prompt: user.preferences.show_pwa_prompt ?? true,
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
        <h1 className="text-2xl sm:text-3xl font-black text-white mb-1 sm:mb-2 flex items-center gap-3">
          <Settings className="w-8 h-8 text-orange-400" />
          Personal Settings
        </h1>
        <p className="text-sm sm:text-base text-zinc-400">
          Customize your Clara experience
        </p>
      </div>

      {/* Profile Section */}
      <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <User className="w-5 h-5 text-orange-400" />
          Profile
        </h2>
        
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-white font-bold text-2xl">
            {user?.name?.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-lg font-semibold text-white">{user?.name}</p>
            <p className="text-zinc-400">{user?.email}</p>
            <p className="text-sm text-orange-400 capitalize">{user?.role}</p>
          </div>
        </div>
      </div>

      {/* Security Section */}
      <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Shield className="w-5 h-5 text-orange-400" />
          Beveiliging
        </h2>
        
        <TwoFactorSetup user={user} onUpdate={refreshUser} />
      </div>

      {/* Menu Display Section */}
      <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <LayoutGrid className="w-5 h-5 text-orange-400" />
          Navigation Display
        </h2>
        
        <div className="space-y-6">
          {/* Grouped Menu Toggle */}
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <Label className="text-white font-medium">Group Menu Items</Label>
              <p className="text-sm text-zinc-400 mt-1">
                Organize navigation into logical groups (Shows, Content, Admin)
              </p>
            </div>
            <Switch
              checked={preferences.grouped_menu}
              onCheckedChange={toggleGroupedMenu}
              className="data-[state=checked]:bg-orange-500"
            />
          </div>

          {/* Preview */}
          <div className="border border-zinc-700 rounded-lg p-4 bg-zinc-900/50">
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Preview</p>
            <div className="flex gap-8">
              {/* Grouped Preview */}
              <div className={`flex-1 ${preferences.grouped_menu ? 'opacity-100' : 'opacity-40'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <LayoutGrid className="w-4 h-4 text-orange-400" />
                  <span className="text-sm text-white font-medium">Grouped</span>
                  {preferences.grouped_menu && <Check className="w-4 h-4 text-green-500" />}
                </div>
                <div className="space-y-2 text-xs">
                  <div className="text-zinc-500 uppercase tracking-wider">Shows</div>
                  <div className="pl-2 text-zinc-400">• Shows List</div>
                  <div className="pl-2 text-zinc-400">• Calendar</div>
                  <div className="text-zinc-500 uppercase tracking-wider mt-2">Content</div>
                  <div className="pl-2 text-zinc-400">• Content Library</div>
                  <div className="pl-2 text-zinc-400">• Media</div>
                </div>
              </div>

              {/* Flat Preview */}
              <div className={`flex-1 ${!preferences.grouped_menu ? 'opacity-100' : 'opacity-40'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <List className="w-4 h-4 text-orange-400" />
                  <span className="text-sm text-white font-medium">Flat List</span>
                  {!preferences.grouped_menu && <Check className="w-4 h-4 text-green-500" />}
                </div>
                <div className="space-y-1 text-xs">
                  <div className="text-zinc-400">• Shows</div>
                  <div className="text-zinc-400">• Calendar</div>
                  <div className="text-zinc-400">• Content Library</div>
                  <div className="text-zinc-400">• Media Library</div>
                  <div className="text-zinc-400">• Team Chat</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* App Install Prompt */}
      <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Smartphone className="w-5 h-5 text-orange-400" />
          Install App Prompt
        </h2>
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <Label className="text-white font-medium">Show install notification</Label>
            <p className="text-sm text-zinc-400 mt-1">
              Show a popup after login suggesting to install Clara as a Web App on your device
            </p>
          </div>
          <Switch
            checked={preferences.show_pwa_prompt}
            onCheckedChange={(checked) => setPreferences(prev => ({ ...prev, show_pwa_prompt: checked }))}
            className="data-[state=checked]:bg-orange-500"
            data-testid="pwa-prompt-toggle"
          />
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-orange-500 hover:bg-orange-600 text-white gap-2 px-6"
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
