import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Globe, Settings, Users, MessageSquare, Save, Trash2, 
  Plus, X, Music, Video, Image, Lock, Eye, EyeOff,
  Upload, Link, Play, ExternalLink
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

export default function SiteDashboard() {
  const { siteId } = useParams();
  const navigate = useNavigate();
  const [site, setSite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submissions, setSubmissions] = useState([]);
  const [siteUsers, setSiteUsers] = useState([]);
  const [teamUsers, setTeamUsers] = useState([]);
  const [showPassword, setShowPassword] = useState(false);
  const [activeTab, setActiveTab] = useState('general');

  // Listen for tab changes from sidebar
  useEffect(() => {
    const handleTabChange = (e) => {
      setActiveTab(e.detail);
    };
    window.addEventListener('siteTabChange', handleTabChange);
    return () => window.removeEventListener('siteTabChange', handleTabChange);
  }, []);

  const fetchSite = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/api/sites/${siteId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSite(data);
      }
    } catch (error) {
      console.error('Error fetching site:', error);
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  const fetchSubmissions = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/api/sites/${siteId}/submissions`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSubmissions(data);
      }
    } catch (error) {
      console.error('Error fetching submissions:', error);
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
        toast.success('Site opgeslagen');
        fetchSite();
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Fout bij opslaan');
      }
    } catch (error) {
      toast.error('Fout bij opslaan');
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
        toast.success('Logo geüpload');
      }
    } catch (error) {
      toast.error('Fout bij uploaden logo');
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
        toast.success('Audio geüpload');
      }
    } catch (error) {
      toast.error('Fout bij uploaden audio');
    }
  };

  const addFormField = () => {
    const newField = {
      id: `field_${Date.now()}`,
      label: 'Nieuw veld',
      type: 'text',
      required: false
    };
    setSite(prev => ({
      ...prev,
      form_fields: [...(prev.form_fields || []), newField]
    }));
  };

  const removeFormField = (fieldId) => {
    // Don't allow removing default fields
    if (['name', 'phone', 'message'].includes(fieldId)) {
      toast.error('Standaard velden kunnen niet verwijderd worden');
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
      toast.success('Inzending verwijderd');
    } catch (error) {
      toast.error('Fout bij verwijderen');
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
      toast.success('Gebruiker toegevoegd');
    } catch (error) {
      toast.error('Fout bij toevoegen gebruiker');
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
      toast.success('Gebruiker verwijderd');
    } catch (error) {
      toast.error('Fout bij verwijderen gebruiker');
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
        <Button onClick={() => navigate('/sites')} className="mt-4">
          Terug naar overzicht
        </Button>
      </div>
    );
  }

  const publicUrl = `${window.location.origin}/${site.slug}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {site.logo_url && (
            <img 
              src={`${API}${site.logo_url}`} 
              alt={site.name}
              className="h-12 w-12 rounded-lg object-cover"
            />
          )}
          <div>
            <h1 className="text-2xl font-bold text-white">{site.name}</h1>
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
          {saving ? 'Opslaan...' : 'Opslaan'}
        </Button>
      </div>

      {/* Content based on activeTab */}
      {activeTab === 'general' && (
          <div className="bg-zinc-900/50 rounded-xl p-6 border border-zinc-800">
            <h2 className="text-lg font-semibold text-white mb-4">Pagina instellingen</h2>
            
            <div className="grid gap-4">
              <div>
                <Label>Naam</Label>
                <Input
                  value={site.name || ''}
                  onChange={(e) => setSite(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Mijn Radio Pagina"
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>

              <div>
                <Label>URL (slug)</Label>
                <div className="flex items-center gap-2">
                  <span className="text-zinc-400 text-sm">{window.location.origin}/</span>
                  <Input
                    value={site.slug || ''}
                    onChange={(e) => setSite(prev => ({ ...prev, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
                    placeholder="mijn-pagina"
                    className="bg-zinc-800 border-zinc-700"
                  />
                </div>
              </div>

              <div>
                <Label>Logo</Label>
                <div className="flex items-center gap-4 mt-2">
                  {site.logo_url && (
                    <img 
                      src={`${API}${site.logo_url}`} 
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
                    <div className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition">
                      <Upload className="h-4 w-4" />
                      <span>Upload logo</span>
                    </div>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-zinc-800/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Lock className="h-5 w-5 text-zinc-400" />
                  <div>
                    <p className="text-white font-medium">Wachtwoordbeveiliging</p>
                    <p className="text-sm text-zinc-400">Bezoekers moeten een wachtwoord invoeren</p>
                  </div>
                </div>
                <Switch
                  checked={site.password_protected || false}
                  onCheckedChange={(checked) => setSite(prev => ({ ...prev, password_protected: checked }))}
                />
              </div>

              {site.password_protected && (
                <div>
                  <Label>Wachtwoord</Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={site.password || ''}
                      onChange={(e) => setSite(prev => ({ ...prev, password: e.target.value }))}
                      placeholder="Nieuw wachtwoord instellen"
                      className="bg-zinc-800 border-zinc-700 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* Media Tab */}
        <TabsContent value="media" className="space-y-6">
          {/* Audio Section */}
          <div className="bg-zinc-900/50 rounded-xl p-6 border border-zinc-800">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Music className="h-5 w-5 text-orange-400" />
                <h2 className="text-lg font-semibold text-white">Audio Player</h2>
              </div>
              <Switch
                checked={site.audio_enabled || false}
                onCheckedChange={(checked) => setSite(prev => ({ ...prev, audio_enabled: checked }))}
              />
            </div>

            {site.audio_enabled && (
              <div className="space-y-4">
                <div className="flex gap-4">
                  <label className={`flex-1 p-4 rounded-lg border-2 cursor-pointer transition ${site.audio_type === 'stream' ? 'border-orange-500 bg-orange-500/10' : 'border-zinc-700 hover:border-zinc-600'}`}>
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
                  <label className={`flex-1 p-4 rounded-lg border-2 cursor-pointer transition ${site.audio_type === 'file' ? 'border-orange-500 bg-orange-500/10' : 'border-zinc-700 hover:border-zinc-600'}`}>
                    <input
                      type="radio"
                      name="audio_type"
                      checked={site.audio_type === 'file'}
                      onChange={() => setSite(prev => ({ ...prev, audio_type: 'file' }))}
                      className="hidden"
                    />
                    <div className="flex items-center gap-2">
                      <Upload className="h-4 w-4" />
                      <span>Bestand uploaden</span>
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
                      className="bg-zinc-800 border-zinc-700"
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
                    <Label>Audio bestand</Label>
                    <label className="mt-2 cursor-pointer block">
                      <input
                        type="file"
                        accept="audio/mpeg,audio/mp3,audio/aac"
                        onChange={handleAudioUpload}
                        className="hidden"
                      />
                      <div className="flex items-center gap-2 px-4 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition border border-dashed border-zinc-600">
                        <Upload className="h-4 w-4" />
                        <span>{site.audio_url ? 'Ander bestand uploaden' : 'MP3 of AAC uploaden'}</span>
                      </div>
                    </label>
                    {site.audio_url && (
                      <p className="mt-2 text-sm text-zinc-400">
                        Huidig bestand: {site.audio_url.split('/').pop()}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Video Section */}
          <div className="bg-zinc-900/50 rounded-xl p-6 border border-zinc-800">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Video className="h-5 w-5 text-orange-400" />
                <h2 className="text-lg font-semibold text-white">Video Player</h2>
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
                        className={`p-3 rounded-lg border-2 cursor-pointer transition text-center capitalize ${site.video_type === type ? 'border-orange-500 bg-orange-500/10' : 'border-zinc-700 hover:border-zinc-600'}`}
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
                    className="bg-zinc-800 border-zinc-700"
                  />
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Form Tab */}
        <TabsContent value="form" className="space-y-6">
          <div className="bg-zinc-900/50 rounded-xl p-6 border border-zinc-800">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <MessageSquare className="h-5 w-5 text-orange-400" />
                <h2 className="text-lg font-semibold text-white">Contactformulier</h2>
              </div>
              <Switch
                checked={site.form_enabled || false}
                onCheckedChange={(checked) => setSite(prev => ({ ...prev, form_enabled: checked }))}
              />
            </div>

            {site.form_enabled && (
              <div className="space-y-4">
                <p className="text-sm text-zinc-400">
                  Configureer de velden die bezoekers kunnen invullen.
                </p>

                <div className="space-y-3">
                  {(site.form_fields || []).map((field, index) => (
                    <div 
                      key={field.id}
                      className="flex items-center gap-3 p-3 bg-zinc-800/50 rounded-lg"
                    >
                      <Input
                        value={field.label}
                        onChange={(e) => updateFormField(field.id, { label: e.target.value })}
                        className="bg-zinc-800 border-zinc-700 flex-1"
                        placeholder="Veldnaam"
                      />
                      <select
                        value={field.type}
                        onChange={(e) => updateFormField(field.id, { type: e.target.value })}
                        className="bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm"
                      >
                        <option value="text">Tekst</option>
                        <option value="email">E-mail</option>
                        <option value="tel">Telefoon</option>
                        <option value="textarea">Tekstvak</option>
                      </select>
                      <label className="flex items-center gap-2 text-sm whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={field.required}
                          onChange={(e) => updateFormField(field.id, { required: e.target.checked })}
                          className="rounded"
                        />
                        Verplicht
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
                  ))}
                </div>

                <Button
                  variant="outline"
                  onClick={addFormField}
                  className="w-full border-dashed"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Veld toevoegen
                </Button>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Submissions Tab */}
        <TabsContent value="submissions" className="space-y-4">
          <div className="bg-zinc-900/50 rounded-xl p-6 border border-zinc-800">
            <h2 className="text-lg font-semibold text-white mb-4">Inzendingen</h2>
            
            {submissions.length === 0 ? (
              <p className="text-zinc-400 text-center py-8">
                Nog geen inzendingen ontvangen
              </p>
            ) : (
              <div className="space-y-3">
                {submissions.map(sub => (
                  <div 
                    key={sub.id}
                    className="p-4 bg-zinc-800/50 rounded-lg border border-zinc-700"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium text-white">{sub.name}</p>
                        {sub.phone && (
                          <p className="text-sm text-zinc-400">{sub.phone}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-zinc-500">
                          {new Date(sub.created_at).toLocaleString('nl-NL')}
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
                      <p className="mt-2 text-sm text-zinc-300 whitespace-pre-wrap">
                        {sub.message}
                      </p>
                    )}
                    {sub.custom_fields && Object.keys(sub.custom_fields).length > 0 && (
                      <div className="mt-2 pt-2 border-t border-zinc-700">
                        {Object.entries(sub.custom_fields).map(([key, value]) => (
                          <p key={key} className="text-sm text-zinc-400">
                            <span className="text-zinc-500">{key}:</span> {value}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Users Tab */}
        <TabsContent value="users" className="space-y-4">
          <div className="bg-zinc-900/50 rounded-xl p-6 border border-zinc-800">
            <h2 className="text-lg font-semibold text-white mb-4">Gebruikerstoegang</h2>
            
            <div className="space-y-4">
              {/* Current users */}
              {siteUsers.length > 0 && (
                <div className="space-y-2">
                  <Label>Huidige gebruikers</Label>
                  {siteUsers.map(user => (
                    <div 
                      key={user.user_id}
                      className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg"
                    >
                      <div>
                        <p className="font-medium text-white">{user.name || user.email}</p>
                        <p className="text-sm text-zinc-400">{user.role === 'editor' ? 'Bewerker' : 'Alleen bekijken'}</p>
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
                <Label>Gebruiker toevoegen</Label>
                <div className="flex gap-2 mt-2">
                  <select
                    id="add-user-select"
                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2"
                  >
                    <option value="">Selecteer gebruiker...</option>
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
                    className="bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2"
                    defaultValue="viewer"
                  >
                    <option value="viewer">Alleen bekijken</option>
                    <option value="editor">Bewerker</option>
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
