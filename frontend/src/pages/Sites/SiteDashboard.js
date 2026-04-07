import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import { 
  Globe, Settings, Users, MessageSquare, Save, Trash2, 
  Plus, X, Music, Video, Image, Lock, Eye, EyeOff,
  Upload, Link, Play, ExternalLink, ImageIcon, Palette, FileUp,
  FileImage, FileAudio, FileVideo, RefreshCw
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { Slider } from '../../components/ui/slider';
import { toast } from 'sonner';
import axios from 'axios';

const API = process.env.REACT_APP_BACKEND_URL;

export default function SiteDashboard() {
  const { siteId, mainSiteSlug } = useParams();
  const navigate = useNavigate();
  
  // Get siteTab from outlet context (passed by MainSiteDashboardLayout)
  // Fallback to local state for routes without context (e.g. /sites/:siteId without main site)
  const outletContext = useOutletContext();
  const [localActiveTab, setLocalActiveTab] = useState('general');
  
  // Use context tab if available, otherwise use local state
  const activeTab = outletContext?.siteTab ?? localActiveTab;
  const setActiveTab = outletContext?.setSiteTab ?? setLocalActiveTab;
  
  const [site, setSite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submissions, setSubmissions] = useState([]);
  const [siteUsers, setSiteUsers] = useState([]);
  const [teamUsers, setTeamUsers] = useState([]);
  const [showPassword, setShowPassword] = useState(false);
  const submissionsPollingRef = useRef(null);

  // Fallback: Listen for tab changes from sidebar (for DashboardLayout routes)
  useEffect(() => {
    // Only use window events if there's no outlet context
    if (outletContext?.siteTab !== undefined) return;
    
    const handleTabChange = (e) => {
      setLocalActiveTab(e.detail);
    };
    window.addEventListener('siteTabChange', handleTabChange);
    return () => window.removeEventListener('siteTabChange', handleTabChange);
  }, [outletContext?.siteTab]);

  const fetchSite = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API}/api/sites/${siteId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSite(res.data);
    } catch (error) {
      console.error('Error fetching site:', error);
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  const fetchSubmissions = useCallback(async (silent = false) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/api/sites/${siteId}/submissions`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSubmissions(prev => {
          // Check if there are new submissions
          if (!silent && prev.length > 0 && data.length > prev.length) {
            toast.info(`${data.length - prev.length} new submission(s)!`);
          }
          return data;
        });
      }
    } catch (error) {
      console.error('Error fetching submissions:', error);
    }
  }, [siteId]);

  const markSubmissionsViewed = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      await fetch(`${API}/api/sites/${siteId}/submissions/mark-viewed`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      // Dispatch event to update badge in sidebar
      window.dispatchEvent(new CustomEvent('submissionsViewed', { detail: siteId }));
    } catch (error) {
      console.error('Error marking submissions as viewed:', error);
    }
  }, [siteId]);

  const fetchSiteUsers = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/api/sites/${siteId}/users`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSiteUsers(data);
      }
    } catch (error) {
      console.error('Error fetching site users:', error);
    }
  }, [siteId]);

  const fetchTeamUsers = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/api/users`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTeamUsers(data);
      }
    } catch (error) {
      console.error('Error fetching team users:', error);
    }
  }, []);

  useEffect(() => {
    fetchSite();
    fetchSubmissions();
    fetchSiteUsers();
    fetchTeamUsers();
  }, [fetchSite, fetchSubmissions, fetchSiteUsers, fetchTeamUsers]);

  // Auto-refresh submissions when on submissions tab
  useEffect(() => {
    if (activeTab === 'submissions') {
      // Mark as viewed when opening tab
      markSubmissionsViewed();
      
      // Poll for new submissions every 10 seconds
      submissionsPollingRef.current = setInterval(() => {
        fetchSubmissions(true);
      }, 10000);
      
      return () => {
        if (submissionsPollingRef.current) {
          clearInterval(submissionsPollingRef.current);
        }
      };
    }
  }, [activeTab, fetchSubmissions, markSubmissionsViewed]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/api/sites/${siteId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(site)
      });
      if (res.ok) {
        toast.success('Site saved');
        fetchSite();
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Error saving');
      }
    } catch (error) {
      toast.error('Error saving');
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/api/sites/${siteId}/logo`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      if (res.ok) {
        const data = await res.json();
        setSite(prev => ({ ...prev, logo_url: data.logo_url }));
        toast.success('Logo uploaded');
      }
    } catch (error) {
      toast.error('Error uploading logo');
    }
  };

  const handleHeaderImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/api/sites/${siteId}/header`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      if (res.ok) {
        const data = await res.json();
        setSite(prev => ({ ...prev, header_image_url: data.header_image_url }));
        toast.success('Header image uploaded');
      }
    } catch (error) {
      toast.error('Error uploading header image');
    }
  };

  const handleAudioUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/api/sites/${siteId}/audio`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      if (res.ok) {
        const data = await res.json();
        setSite(prev => ({ 
          ...prev, 
          audio_url: data.audio_url,
          audio_type: 'file',
          audio_format: data.audio_format
        }));
        toast.success('Audio uploaded');
      }
    } catch (error) {
      toast.error('Error uploading audio');
    }
  };

  const addFormField = () => {
    const newField = {
      id: `field_${Date.now()}`,
      label: 'New field',
      type: 'text',
      required: false,
      placeholder: '',
      file_accept: 'all',
      options: [],
    };
    setSite(prev => ({
      ...prev,
      form_fields: [...(prev.form_fields || []), newField]
    }));
  };

  const removeFormField = (fieldId) => {
    if (['name', 'phone', 'message'].includes(fieldId)) {
      toast.error('Default fields cannot be removed');
      return;
    }
    setSite(prev => ({
      ...prev,
      form_fields: prev.form_fields.filter(f => f.id !== fieldId)
    }));
  };

  const updateFormField = (fieldId, updates) => {
    setSite(prev => ({
      ...prev,
      form_fields: prev.form_fields.map(f => 
        f.id === fieldId ? { ...f, ...updates } : f
      )
    }));
  };

  const deleteSubmission = async (submissionId) => {
    try {
      const token = localStorage.getItem('token');
      await fetch(`${API}/api/sites/${siteId}/submissions/${submissionId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      setSubmissions(prev => prev.filter(s => s.id !== submissionId));
      toast.success('Submission deleted');
    } catch (error) {
      toast.error('Error deleting');
    }
  };

  const addUserToSite = async (userId, role) => {
    try {
      const token = localStorage.getItem('token');
      await fetch(`${API}/api/sites/${siteId}/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ user_id: userId, role })
      });
      fetchSiteUsers();
      toast.success('User added');
    } catch (error) {
      toast.error('Error adding user');
    }
  };

  const removeUserFromSite = async (userId) => {
    try {
      const token = localStorage.getItem('token');
      await fetch(`${API}/api/sites/${siteId}/users/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchSiteUsers();
      toast.success('User removed');
    } catch (error) {
      toast.error('Error removing user');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  if (!site) {
    return (
      <div className="text-center py-12">
        <p className="text-zinc-400">Site niet gevonden</p>
        <Button onClick={() => navigate(mainSiteSlug ? `/${mainSiteSlug}/sites` : '/sites')} className="mt-4">
          Terug naar overzicht
        </Button>
      </div>
    );
  }

  const publicUrl = mainSiteSlug 
    ? `${window.location.origin}/${mainSiteSlug}/${site.slug}`
    : `${window.location.origin}/${site.slug}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {site.logo_url && (
            <img 
              src={site.logo_url.startsWith('http') ? site.logo_url : `${API}${site.logo_url}`}
              alt={site.name}
              className="h-12 w-12 rounded-lg object-cover"
            />
          )}
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">{site.name}</h1>
            <a 
              href={publicUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-sm text-orange-400 hover:text-orange-300 flex items-center gap-1"
            >
              {publicUrl}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving} className="bg-orange-500 hover:bg-orange-600">
          <Save className="h-4 w-4 mr-2" />
          {saving ? 'Save...' : 'Save'}
        </Button>
      </div>

      {/* General Tab */}
      {activeTab === 'general' && (
        <div className="space-y-6">
          <div className="bg-white/60 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-zinc-900 mb-4">Page settings</h2>
            
            <div className="grid gap-4">
              <div>
                <Label>Name</Label>
                <Input
                  value={site.name || ''}
                  onChange={(e) => setSite(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="My Radio Page"
                  className="bg-zinc-800 border-zinc-300"
                />
              </div>

              <div>
                <Label>URL (slug)</Label>
                <div className="flex items-center gap-2">
                  <span className="text-zinc-400 text-sm">
                    {window.location.origin}/{mainSiteSlug ? `${mainSiteSlug}/` : ''}
                  </span>
                  <Input
                    value={site.slug || ''}
                    onChange={(e) => setSite(prev => ({ ...prev, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
                    placeholder="my-page"
                    className="bg-zinc-800 border-zinc-300"
                  />
                </div>
              </div>

              <div>
                <Label>Logo</Label>
                <div className="flex items-center gap-4 mt-2">
                  {site.logo_url && (
                    <img 
                      src={site.logo_url.startsWith('http') ? site.logo_url : `${API}${site.logo_url}`}
                      alt="Logo"
                      className="h-16 w-16 rounded-lg object-cover"
                    />
                  )}
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      className="hidden"
                    />
                    <div className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-200 rounded-lg transition">
                      <Upload className="h-4 w-4" />
                      <span>Upload logo</span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Logo Scale */}
              {site.logo_url && (
                <div className="space-y-3">
                  <Label>Logo size on public page</Label>
                  <div className="flex items-center gap-4">
                    <Slider
                      value={[site.logo_scale || 100]}
                      onValueChange={(value) => setSite(prev => ({ ...prev, logo_scale: value[0] }))}
                      min={10}
                      max={200}
                      step={5}
                      className="flex-1"
                    />
                    <span className="text-sm text-zinc-400 w-12 text-right">{site.logo_scale || 100}%</span>
                  </div>
                  <div className="p-4 bg-zinc-100/70 rounded-lg">
                    <p className="text-xs text-zinc-500 mb-2">Preview on public page:</p>
                    <div className="flex justify-center py-4">
                      <img 
                        src={site.logo_url.startsWith('http') ? site.logo_url : `${API}${site.logo_url}`}
                        alt="Logo preview"
                        style={{ 
                          height: `${Math.round(128 * (site.logo_scale || 100) / 100)}px`,
                          width: 'auto',
                          maxWidth: '100%'
                        }}
                        className="object-contain"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between p-4 bg-zinc-100/70 rounded-lg">
                <div className="flex items-center gap-3">
                  <Lock className="h-5 w-5 text-zinc-400" />
                  <div>
                    <p className="text-zinc-700 font-medium">Password Protection</p>
                    <p className="text-sm text-zinc-400">Visitors must enter a password</p>
                  </div>
                </div>
                <Switch
                  checked={site.password_protected || false}
                  onCheckedChange={(checked) => setSite(prev => ({ ...prev, password_protected: checked }))}
                />
              </div>

              {site.password_protected && (
                <div>
                  <Label>Password</Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={site.password || ''}
                      onChange={(e) => setSite(prev => ({ ...prev, password: e.target.value }))}
                      placeholder="Set new password"
                      className="bg-zinc-800 border-zinc-300 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Media Tab */}
      {activeTab === 'media' && (
        <div className="space-y-6">
          {/* Header Image Section */}
          <div className="bg-white/60 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <ImageIcon className="h-5 w-5 text-orange-400" />
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">Header Image</h2>
                <p className="text-sm text-zinc-400">Displayed above the audio player (if no video)</p>
              </div>
            </div>
            
            <div className="space-y-4">
              {site.header_image_url && (
                <div className="relative">
                  <img 
                    src={site.header_image_url.startsWith('http') ? site.header_image_url : `${API}${site.header_image_url}`}
                    alt="Header"
                    className="w-full h-48 object-cover rounded-lg"
                  />
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setSite(prev => ({ ...prev, header_image_url: null }))}
                    className="absolute top-2 right-2"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
              <label className="cursor-pointer block">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleHeaderImageUpload}
                  className="hidden"
                />
                <div className="flex items-center gap-2 px-4 py-3 bg-zinc-800 hover:bg-zinc-200 rounded-lg transition border border-dashed border-zinc-600">
                  <Upload className="h-4 w-4" />
                  <span>{site.header_image_url ? 'Upload different image' : 'Upload header image'}</span>
                </div>
              </label>
            </div>
          </div>

          {/* Audio Section */}
          <div className="bg-white/60 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Music className="h-5 w-5 text-orange-400" />
                <h2 className="text-lg font-semibold text-zinc-900">Audio Player</h2>
              </div>
              <Switch
                checked={site.audio_enabled || false}
                onCheckedChange={(checked) => setSite(prev => ({ ...prev, audio_enabled: checked }))}
              />
            </div>

            {site.audio_enabled && (
              <div className="space-y-4">
                <div className="flex gap-4">
                  <label className={`flex-1 p-4 rounded-lg border-2 cursor-pointer transition ${site.audio_type === 'stream' ? 'border-orange-500 bg-orange-500/10' : 'border-zinc-300 hover:border-zinc-600'}`}>
                    <input
                      type="radio"
                      name="audio_type"
                      checked={site.audio_type === 'stream'}
                      onChange={() => setSite(prev => ({ ...prev, audio_type: 'stream' }))}
                      className="hidden"
                    />
                    <div className="flex items-center gap-2">
                      <Link className="h-4 w-4" />
                      <span>Livestream URL</span>
                    </div>
                  </label>
                  <label className={`flex-1 p-4 rounded-lg border-2 cursor-pointer transition ${site.audio_type === 'file' ? 'border-orange-500 bg-orange-500/10' : 'border-zinc-300 hover:border-zinc-600'}`}>
                    <input
                      type="radio"
                      name="audio_type"
                      checked={site.audio_type === 'file'}
                      onChange={() => setSite(prev => ({ ...prev, audio_type: 'file' }))}
                      className="hidden"
                    />
                    <div className="flex items-center gap-2">
                      <Upload className="h-4 w-4" />
                      <span>Upload file</span>
                    </div>
                  </label>
                </div>

                {site.audio_type === 'stream' && (
                  <div className="space-y-2">
                    <Label>Stream URL (MP3/AAC)</Label>
                    <Input
                      value={site.audio_url || ''}
                      onChange={(e) => setSite(prev => ({ ...prev, audio_url: e.target.value }))}
                      placeholder="https://stream.example.com/live.mp3"
                      className="bg-zinc-800 border-zinc-300"
                    />
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="audio_format"
                          checked={site.audio_format === 'mp3'}
                          onChange={() => setSite(prev => ({ ...prev, audio_format: 'mp3' }))}
                        />
                        <span className="text-sm">MP3</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="audio_format"
                          checked={site.audio_format === 'aac'}
                          onChange={() => setSite(prev => ({ ...prev, audio_format: 'aac' }))}
                        />
                        <span className="text-sm">AAC</span>
                      </label>
                    </div>
                  </div>
                )}

                {site.audio_type === 'file' && (
                  <div>
                    <Label>Audio file</Label>
                    <label className="mt-2 cursor-pointer block">
                      <input
                        type="file"
                        accept="audio/mpeg,audio/mp3,audio/aac"
                        onChange={handleAudioUpload}
                        className="hidden"
                      />
                      <div className="flex items-center gap-2 px-4 py-3 bg-zinc-800 hover:bg-zinc-200 rounded-lg transition border border-dashed border-zinc-600">
                        <Upload className="h-4 w-4" />
                        <span>{site.audio_url ? 'Upload different file' : 'Upload MP3 or AAC'}</span>
                      </div>
                    </label>
                    {site.audio_url && (
                      <p className="mt-2 text-sm text-zinc-400">
                        Current file: {site.audio_url.split('/').pop()}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Video Section */}
          <div className="bg-white/60 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Video className="h-5 w-5 text-orange-400" />
                <h2 className="text-lg font-semibold text-zinc-900">Video Player</h2>
              </div>
              <Switch
                checked={site.video_enabled || false}
                onCheckedChange={(checked) => setSite(prev => ({ ...prev, video_enabled: checked }))}
              />
            </div>

            {site.video_enabled && (
              <div className="space-y-4">
                <div>
                  <Label>Video type</Label>
                  <div className="grid grid-cols-4 gap-2 mt-2">
                    {['youtube', 'vimeo', 'twitch', 'hls'].map(type => (
                      <label
                        key={type}
                        className={`p-3 rounded-lg border-2 cursor-pointer transition text-center capitalize ${site.video_type === type ? 'border-orange-500 bg-orange-500/10' : 'border-zinc-300 hover:border-zinc-600'}`}
                      >
                        <input
                          type="radio"
                          name="video_type"
                          checked={site.video_type === type}
                          onChange={() => setSite(prev => ({ ...prev, video_type: type }))}
                          className="hidden"
                        />
                        {type === 'hls' ? 'HLS Stream' : type}
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <Label>
                    {site.video_type === 'youtube' && 'YouTube video URL'}
                    {site.video_type === 'vimeo' && 'Vimeo video URL'}
                    {site.video_type === 'twitch' && 'Twitch kanaal of video URL'}
                    {site.video_type === 'hls' && 'HLS stream URL (.m3u8)'}
                    {!site.video_type && 'Video URL'}
                  </Label>
                  <Input
                    value={site.video_url || ''}
                    onChange={(e) => setSite(prev => ({ ...prev, video_url: e.target.value }))}
                    placeholder={
                      site.video_type === 'youtube' ? 'https://www.youtube.com/watch?v=...' :
                      site.video_type === 'vimeo' ? 'https://vimeo.com/...' :
                      site.video_type === 'twitch' ? 'https://www.twitch.tv/...' :
                      site.video_type === 'hls' ? 'https://stream.example.com/live.m3u8' :
                      'Video URL'
                    }
                    className="bg-zinc-800 border-zinc-300"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Form Tab */}
      {activeTab === 'form' && (
        <div className="space-y-6">
          <div className="bg-white/60 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <MessageSquare className="h-5 w-5 text-orange-400" />
                <h2 className="text-lg font-semibold text-zinc-900">Contact Form</h2>
              </div>
              <Switch
                checked={site.form_enabled || false}
                onCheckedChange={(checked) => setSite(prev => ({ ...prev, form_enabled: checked }))}
              />
            </div>

            {site.form_enabled && (
              <div className="space-y-4">
                <p className="text-sm text-zinc-400">
                  Configure the fields that visitors can fill in.
                </p>

                <div className="space-y-3">
                  {(site.form_fields || []).map((field) => (
                    <div 
                      key={field.id}
                      className="p-3 bg-zinc-100/70 rounded-lg space-y-2"
                    >
                      {/* Row 1: Label, Type, Required, Delete */}
                      <div className="flex items-center gap-3">
                        <Input
                          value={field.label}
                          onChange={(e) => updateFormField(field.id, { label: e.target.value })}
                          className="bg-zinc-800 border-zinc-300 flex-1"
                          placeholder="Field name"
                        />
                        <select
                          value={field.type}
                          onChange={(e) => updateFormField(field.id, { type: e.target.value })}
                          className="bg-zinc-50 border border-zinc-200 rounded-md px-3 py-2 text-sm text-zinc-900"
                        >
                          <option value="text">Text</option>
                          <option value="email">Email</option>
                          <option value="tel">Phone</option>
                          <option value="textarea">Textarea</option>
                          <option value="number">Number</option>
                          <option value="letters">Letters only</option>
                          <option value="date">Date picker</option>
                          <option value="select">Dropdown</option>
                          <option value="file">File upload</option>
                        </select>
                        <label className="flex items-center gap-2 text-sm whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={field.required}
                            onChange={(e) => updateFormField(field.id, { required: e.target.checked })}
                            className="rounded"
                          />
                          Required
                        </label>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeFormField(field.id)}
                          disabled={['name', 'phone', 'message'].includes(field.id)}
                          className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      {/* Row 2: Placeholder */}
                      <Input
                        value={field.placeholder || ''}
                        onChange={(e) => updateFormField(field.id, { placeholder: e.target.value })}
                        className="bg-zinc-50 border-zinc-200 text-sm h-8"
                        placeholder="Placeholder text (optional)"
                      />
                      {/* Row 3: Type-specific options */}
                      {field.type === 'file' && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-zinc-400 whitespace-nowrap">Accepted files:</span>
                          {['all', 'image', 'audio', 'video'].map(opt => (
                            <button
                              key={opt}
                              onClick={() => updateFormField(field.id, { file_accept: opt })}
                              className={`px-2 py-1 rounded text-xs capitalize ${(field.file_accept || 'all') === opt ? 'bg-orange-500 text-white' : 'bg-zinc-200 text-zinc-400 hover:bg-zinc-200'}`}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      )}
                      {field.type === 'number' && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-zinc-400">Min:</span>
                          <Input type="number" value={field.min_value ?? ''} onChange={(e) => updateFormField(field.id, { min_value: e.target.value ? parseFloat(e.target.value) : null })} className="bg-zinc-800 border-zinc-300 h-8 text-xs w-24" />
                          <span className="text-xs text-zinc-400">Max:</span>
                          <Input type="number" value={field.max_value ?? ''} onChange={(e) => updateFormField(field.id, { max_value: e.target.value ? parseFloat(e.target.value) : null })} className="bg-zinc-800 border-zinc-300 h-8 text-xs w-24" />
                        </div>
                      )}
                      {field.type === 'select' && (
                        <div className="space-y-1">
                          <span className="text-xs text-zinc-400">Options (one per line):</span>
                          <textarea
                            value={(field.options || []).join('\n')}
                            onChange={(e) => updateFormField(field.id, { options: e.target.value.split('\n').filter(Boolean) })}
                            rows={3}
                            className="w-full bg-zinc-50 border border-zinc-200 rounded-md px-3 py-2 text-sm text-zinc-900 resize-none"
                            placeholder="Option 1&#10;Option 2&#10;Option 3"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <Button
                  variant="outline"
                  onClick={addFormField}
                  className="w-full border-dashed"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add field
                </Button>

                {/* File Upload Option */}
                <div className="flex items-center justify-between p-4 bg-zinc-100/70 rounded-lg">
                  <div className="flex items-center gap-3">
                    <FileUp className="h-5 w-5 text-zinc-400" />
                    <div>
                      <p className="text-zinc-700 font-medium">Allow file uploads</p>
                      <p className="text-sm text-zinc-400">Visitors can upload images, audio and video</p>
                    </div>
                  </div>
                  <Switch
                    checked={site.form_file_upload_enabled || false}
                    onCheckedChange={(checked) => setSite(prev => ({ ...prev, form_file_upload_enabled: checked }))}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Styling Tab */}
      {activeTab === 'styling' && (
        <div className="space-y-6">
          <div className="bg-white/60 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <Palette className="h-5 w-5 text-orange-400" />
              <h2 className="text-lg font-semibold text-zinc-900">Page Styling</h2>
            </div>

            <div className="space-y-6">
              {/* Button Color */}
              <div className="space-y-2">
                <Label>Button Color</Label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={site.button_color || '#f97316'}
                    onChange={(e) => setSite(prev => ({ ...prev, button_color: e.target.value }))}
                    className="w-12 h-10 rounded cursor-pointer border border-zinc-300 bg-transparent"
                  />
                  <Input
                    value={site.button_color || '#f97316'}
                    onChange={(e) => setSite(prev => ({ ...prev, button_color: e.target.value }))}
                    placeholder="#f97316"
                    className="bg-zinc-800 border-zinc-300 w-32"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSite(prev => ({ ...prev, button_color: null }))}
                    className="text-zinc-400"
                  >
                    Reset
                  </Button>
                </div>
              </div>

              {/* Background Color */}
              <div className="space-y-2">
                <Label>Background Color</Label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={site.background_color || '#09090b'}
                    onChange={(e) => setSite(prev => ({ ...prev, background_color: e.target.value }))}
                    className="w-12 h-10 rounded cursor-pointer border border-zinc-300 bg-transparent"
                  />
                  <Input
                    value={site.background_color || '#09090b'}
                    onChange={(e) => setSite(prev => ({ ...prev, background_color: e.target.value }))}
                    placeholder="#09090b"
                    className="bg-zinc-800 border-zinc-300 w-32"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSite(prev => ({ ...prev, background_color: null }))}
                    className="text-zinc-400"
                  >
                    Reset
                  </Button>
                </div>
              </div>

              {/* Container Color */}
              <div className="space-y-2">
                <Label>Container Color</Label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={site.container_color || '#18181b'}
                    onChange={(e) => setSite(prev => ({ ...prev, container_color: e.target.value }))}
                    className="w-12 h-10 rounded cursor-pointer border border-zinc-300 bg-transparent"
                  />
                  <Input
                    value={site.container_color || '#18181b'}
                    onChange={(e) => setSite(prev => ({ ...prev, container_color: e.target.value }))}
                    placeholder="#18181b"
                    className="bg-zinc-800 border-zinc-300 w-32"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSite(prev => ({ ...prev, container_color: null }))}
                    className="text-zinc-400"
                  >
                    Reset
                  </Button>
                </div>
              </div>

              {/* Color Preview */}
              <div className="mt-4 p-4 rounded-lg border border-zinc-300" style={{ backgroundColor: site.background_color || '#09090b' }}>
                <p className="text-xs text-zinc-500 mb-2">Color preview:</p>
                <div className="p-4 rounded-lg" style={{ backgroundColor: site.container_color || '#18181b' }}>
                  <p className="text-zinc-700 text-sm mb-2">Container preview</p>
                  <button
                    className="px-4 py-2 rounded-lg text-white font-medium transition"
                    style={{ backgroundColor: site.button_color || '#f97316' }}
                  >
                    Submit
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Submissions Tab */}
      {activeTab === 'submissions' && (
        <div className="space-y-4">
          <div className="bg-white/60 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-zinc-900 mb-4">Submissions</h2>
            
            {submissions.length === 0 ? (
              <p className="text-zinc-400 text-center py-8">
                No submissions received yet
              </p>
            ) : (
              <div className="space-y-3">
                {submissions.map(sub => (
                  <div 
                    key={sub.id}
                    className="p-4 bg-zinc-100/70 rounded-lg border border-zinc-300"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium text-zinc-900">{sub.name}</p>
                        {sub.phone && (
                          <p className="text-sm text-zinc-400">{sub.phone}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-zinc-500">
                          {new Date(sub.created_at).toLocaleString('en-US')}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteSubmission(sub.id)}
                          className="text-red-400 hover:text-red-300"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {sub.message && (
                      <p className="mt-2 text-sm text-zinc-600 whitespace-pre-wrap">
                        {sub.message}
                      </p>
                    )}
                    {sub.custom_fields && Object.keys(sub.custom_fields).length > 0 && (
                      <div className="mt-2 pt-2 border-t border-zinc-300">
                        {Object.entries(sub.custom_fields).map(([key, value]) => (
                          <p key={key} className="text-sm text-zinc-400">
                            <span className="text-zinc-500">{key}:</span> {value}
                          </p>
                        ))}
                      </div>
                    )}
                    {/* File attachments */}
                    {sub.file_urls && sub.file_urls.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-zinc-300">
                        <p className="text-xs text-zinc-500 mb-2">Attachments:</p>
                        <div className="flex flex-wrap gap-2">
                          {sub.file_urls.map((url, idx) => {
                            const isImage = url.match(/\.(jpg|jpeg|png|gif|webp)$/i);
                            const isAudio = url.match(/\.(mp3|wav|ogg|aac)$/i);
                            const isVideo = url.match(/\.(mp4|webm|mov|avi)$/i);
                            const filename = url.split('/').pop();
                            
                            if (isImage) {
                              return (
                                <a 
                                  key={idx}
                                  href={url.startsWith('http') ? url : `${API}${url}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="block"
                                >
                                  <img 
                                    src={url.startsWith('http') ? url : `${API}${url}`}
                                    alt={filename}
                                    className="h-16 w-16 rounded object-cover hover:opacity-80 transition"
                                  />
                                </a>
                              );
                            }
                            
                            return (
                              <a
                                key={idx}
                                href={url.startsWith('http') ? url : `${API}${url}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 px-3 py-2 bg-zinc-700/50 rounded-lg hover:bg-zinc-200 transition text-sm"
                              >
                                {isAudio && <FileAudio className="h-4 w-4 text-orange-400" />}
                                {isVideo && <FileVideo className="h-4 w-4 text-blue-400" />}
                                {!isAudio && !isVideo && <FileImage className="h-4 w-4 text-green-400" />}
                                <span className="text-zinc-600 max-w-32 truncate">{filename}</span>
                              </a>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Users Tab */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="bg-white/60 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-zinc-900 mb-4">User Access</h2>
            
            <div className="space-y-4">
              {/* Current users */}
              {siteUsers.length > 0 && (
                <div className="space-y-2">
                  <Label>Current users</Label>
                  {siteUsers.map(user => (
                    <div 
                      key={user.user_id}
                      className="flex items-center justify-between p-3 bg-zinc-100/70 rounded-lg"
                    >
                      <div>
                        <p className="font-medium text-zinc-900">{user.name || user.email}</p>
                        <p className="text-sm text-zinc-400">{user.role === 'editor' ? 'Editor' : 'View only'}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeUserFromSite(user.user_id)}
                        className="text-red-400 hover:text-red-300"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add user */}
              <div>
                <Label>Add user</Label>
                <div className="flex gap-2 mt-2">
                  <select
                    id="add-user-select"
                    className="flex-1 bg-zinc-800 border border-zinc-300 rounded-md px-3 py-2"
                  >
                    <option value="">Select user...</option>
                    {teamUsers
                      .filter(u => !siteUsers.find(su => su.user_id === u.id))
                      .map(user => (
                        <option key={user.id} value={user.id}>
                          {user.name || user.email}
                        </option>
                      ))}
                  </select>
                  <select
                    id="add-user-role"
                    className="bg-zinc-800 border border-zinc-300 rounded-md px-3 py-2"
                    defaultValue="viewer"
                  >
                    <option value="viewer">View only</option>
                    <option value="editor">Editor</option>
                  </select>
                  <Button
                    onClick={() => {
                      const userId = document.getElementById('add-user-select').value;
                      const role = document.getElementById('add-user-role').value;
                      if (userId) {
                        addUserToSite(userId, role);
                        document.getElementById('add-user-select').value = '';
                      }
                    }}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
