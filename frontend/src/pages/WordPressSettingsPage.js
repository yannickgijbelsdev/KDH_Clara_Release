import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  Globe,
  Key,
  User,
  CheckCircle,
  AlertCircle,
  Loader2,
  Trash2,
  Save,
  ExternalLink,
  Info,
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
import { useAuth } from '../context/AuthContext';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const WordPressSettingsPage = () => {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [connection, setConnection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    wp_base_url: '',
    username: '',
    app_password: '',
    default_post_type: 'post',
    default_status: 'draft',
  });

  useEffect(() => {
    if (!isAdmin) {
      navigate('/shows');
      return;
    }
    fetchConnection();
  }, [isAdmin]);

  const fetchConnection = async () => {
    try {
      const response = await axios.get(`${API}/wordpress/connection`);
      if (response.data) {
        setConnection(response.data);
        setFormData({
          wp_base_url: response.data.wp_base_url,
          username: response.data.username,
          app_password: '', // Don't show existing password
          default_post_type: response.data.default_post_type,
          default_status: response.data.default_status,
        });
      }
    } catch (error) {
      // No connection exists
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setTestResult(null);

    try {
      // If editing existing and no new password, we need to handle this
      const data = { ...formData };
      if (connection && !data.app_password) {
        toast.error('Please enter the application password');
        setSaving(false);
        return;
      }

      const response = await axios.post(`${API}/wordpress/connection`, data);
      setConnection(response.data);
      setFormData({
        ...formData,
        app_password: '', // Clear password field after save
      });
      toast.success('WordPress connection saved');
    } catch (error) {
      toast.error('Failed to save connection');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      const response = await axios.post(`${API}/wordpress/test-connection`);
      setTestResult(response.data);
      
      if (response.data.success) {
        toast.success('Connection successful!');
      } else {
        toast.error('Connection failed');
      }
    } catch (error) {
      setTestResult({ success: false, message: 'Failed to test connection' });
      toast.error('Failed to test connection');
    } finally {
      setTesting(false);
    }
  };

  const handleDelete = async () => {
    try {
      await axios.delete(`${API}/wordpress/connection`);
      setConnection(null);
      setFormData({
        wp_base_url: '',
        username: '',
        app_password: '',
        default_post_type: 'post',
        default_status: 'draft',
      });
      setTestResult(null);
      setDeleteDialogOpen(false);
      toast.success('WordPress connection removed');
    } catch (error) {
      toast.error('Failed to remove connection');
    }
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
    <div data-testid="wordpress-settings-page">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-black text-white mb-2">WordPress Settings</h1>
        <p className="text-zinc-400">Connect your WordPress site to publish content</p>
      </div>

      {/* Info Box */}
      <div className="bg-violet-500/10 border border-violet-500/30 rounded-xl p-4 mb-8">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-violet-400 mt-0.5" />
          <div>
            <h3 className="text-white font-medium mb-1">WordPress Application Passwords</h3>
            <p className="text-sm text-zinc-400 mb-2">
              To connect to WordPress, you need to create an Application Password:
            </p>
            <ol className="text-sm text-zinc-400 list-decimal list-inside space-y-1">
              <li>Log in to your WordPress admin dashboard</li>
              <li>Go to Users → Profile</li>
              <li>Scroll down to "Application Passwords"</li>
              <li>Enter a name (e.g., "ShowPrep") and click "Add New"</li>
              <li>Copy the generated password and paste it below</li>
            </ol>
          </div>
        </div>
      </div>

      {/* Connection Form */}
      <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-violet-500/20 rounded-lg">
              <Globe className="w-5 h-5 text-violet-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">WordPress Connection</h2>
              <p className="text-sm text-zinc-500">
                {connection ? 'Connected' : 'Not connected'}
              </p>
            </div>
          </div>
          {connection && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleTest}
              disabled={testing}
              className="gap-2 bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            >
              {testing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Testing...
                </>
              ) : (
                'Test Connection'
              )}
            </Button>
          )}
        </div>

        {/* Test Result */}
        {testResult && (
          <div className={`flex items-center gap-3 p-4 rounded-lg mb-6 ${
            testResult.success 
              ? 'bg-green-500/10 border border-green-500/30' 
              : 'bg-rose-500/10 border border-rose-500/30'
          }`}>
            {testResult.success ? (
              <CheckCircle className="w-5 h-5 text-green-500" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-500" />
            )}
            <div>
              <p className={testResult.success ? 'text-green-400' : 'text-rose-400'}>
                {testResult.message}
              </p>
              {testResult.wp_user && (
                <p className="text-sm text-zinc-400">Connected as: {testResult.wp_user}</p>
              )}
            </div>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-5">
          <div className="space-y-2">
            <Label className="text-zinc-300">WordPress Site URL</Label>
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <Input
                data-testid="wp-url-input"
                type="url"
                value={formData.wp_base_url}
                onChange={(e) => setFormData({ ...formData, wp_base_url: e.target.value })}
                placeholder="https://your-site.com"
                required
                className="pl-10 bg-[#27272a] border-zinc-700 text-white placeholder:text-zinc-500"
              />
            </div>
            <p className="text-xs text-zinc-500">The URL of your WordPress site (without trailing slash)</p>
          </div>

          <div className="space-y-2">
            <Label className="text-zinc-300">Username</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <Input
                data-testid="wp-username-input"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                placeholder="admin"
                required
                className="pl-10 bg-[#27272a] border-zinc-700 text-white placeholder:text-zinc-500"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-zinc-300">Application Password</Label>
            <div className="relative">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <Input
                data-testid="wp-password-input"
                type="password"
                value={formData.app_password}
                onChange={(e) => setFormData({ ...formData, app_password: e.target.value })}
                placeholder={connection ? '••••••••••••••••' : 'xxxx xxxx xxxx xxxx xxxx xxxx'}
                required={!connection}
                className="pl-10 bg-[#27272a] border-zinc-700 text-white placeholder:text-zinc-500"
              />
            </div>
            {connection && (
              <p className="text-xs text-zinc-500">Leave blank to keep existing password, or enter new one to update</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-zinc-300">Default Post Type</Label>
              <Select
                value={formData.default_post_type}
                onValueChange={(value) => setFormData({ ...formData, default_post_type: value })}
              >
                <SelectTrigger className="bg-[#27272a] border-zinc-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#18181b] border-zinc-800">
                  <SelectItem value="post" className="text-zinc-300 focus:text-white focus:bg-zinc-800">Post</SelectItem>
                  <SelectItem value="page" className="text-zinc-300 focus:text-white focus:bg-zinc-800">Page</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-zinc-300">Default Status</Label>
              <Select
                value={formData.default_status}
                onValueChange={(value) => setFormData({ ...formData, default_status: value })}
              >
                <SelectTrigger className="bg-[#27272a] border-zinc-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#18181b] border-zinc-800">
                  <SelectItem value="draft" className="text-zinc-300 focus:text-white focus:bg-zinc-800">Draft</SelectItem>
                  <SelectItem value="publish" className="text-zinc-300 focus:text-white focus:bg-zinc-800">Published</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-zinc-800">
            {connection ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeleteDialogOpen(true)}
                className="gap-2 bg-transparent border-zinc-700 text-rose-500 hover:bg-rose-500/10"
              >
                <Trash2 className="w-4 h-4" />
                Remove Connection
              </Button>
            ) : (
              <div />
            )}
            <Button
              type="submit"
              data-testid="save-wp-btn"
              disabled={saving}
              className="gap-2 bg-violet-500 hover:bg-violet-600 text-white"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  {connection ? 'Update Connection' : 'Save Connection'}
                </>
              )}
            </Button>
          </div>
        </form>
      </div>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-[#18181b] border-zinc-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Remove WordPress Connection</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              Are you sure you want to remove the WordPress connection? You won't be able to publish content until you reconnect.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
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

export default WordPressSettingsPage;
