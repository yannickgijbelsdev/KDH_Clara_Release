import { useState, useRef } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { toast } from 'sonner';
import { useBranding } from '../../context/BrandingContext';
import { useAuth } from '../../context/AuthContext';
import {
  Type, Image, Upload, Loader2, Star
} from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

export default function BrandingSettings() {
  const { branding, refreshBranding } = useBranding();
  const { token } = useAuth();
  const [saving, setSaving] = useState(false);
  const [platformName, setPlatformName] = useState(branding.platform_name || 'Clara');
  const [uploading, setUploading] = useState(null);
  const logoInputRef = useRef(null);
  const faviconInputRef = useRef(null);

  const headers = { Authorization: `Bearer ${token}` };

  const saveBranding = async (updates) => {
    setSaving(true);
    try {
      await fetch(`${API}/api/branding`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      await refreshBranding();
      toast.success('Branding updated');
    } catch {
      toast.error('Failed to save');
    }
    setSaving(false);
  };

  const uploadFile = async (endpoint, file) => {
    const formData = new FormData();
    formData.append('file', file);
    setUploading(endpoint);
    try {
      await fetch(`${API}/api/branding/${endpoint}`, {
        method: 'POST',
        headers,
        body: formData,
      });
      await refreshBranding();
      toast.success('Uploaded successfully');
    } catch {
      toast.error('Upload failed');
    }
    setUploading(null);
  };

  const resolveUrl = (url) => {
    if (!url) return null;
    return url.startsWith('/') ? `${API}${url}` : url;
  };

  return (
    <div className="space-y-6" data-testid="branding-settings">
      {/* Platform Name & Logo */}
      <Card className="bg-white border-zinc-200">
        <CardHeader>
          <CardTitle className="text-lg text-white flex items-center gap-2">
            <Star className="w-5 h-5 text-orange-400" />
            Platform Branding
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Platform Name */}
          <div className="space-y-2">
            <Label className="text-zinc-600">Platform Name</Label>
            <div className="flex gap-2">
              <Input
                data-testid="platform-name-input"
                value={platformName}
                onChange={(e) => setPlatformName(e.target.value)}
                placeholder="Clara"
                className="bg-zinc-50 border-zinc-200 text-zinc-900 max-w-xs"
              />
              <Button
                data-testid="save-platform-name-btn"
                onClick={() => saveBranding({ platform_name: platformName })}
                disabled={saving || platformName === branding.platform_name}
                className="bg-orange-500 hover:bg-orange-600 text-white"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
              </Button>
            </div>
            <p className="text-xs text-zinc-500">Shown in sidebar, login page, and emails</p>
          </div>

          {/* Logo Type */}
          <div className="space-y-3">
            <Label className="text-zinc-600">Logo Display</Label>
            <div className="flex gap-3">
              <button
                data-testid="logo-type-text"
                onClick={() => saveBranding({ logo_type: 'text' })}
                className={`flex items-center gap-2 px-4 py-3 rounded-lg border transition-colors ${
                  branding.logo_type === 'text'
                    ? 'bg-orange-500/15 border-orange-500/40 text-orange-400'
                    : 'bg-zinc-800 border-zinc-300 text-zinc-400 hover:border-zinc-600'
                }`}
              >
                <Type className="w-4 h-4" />
                <span className="text-sm font-medium">Text</span>
              </button>
              <button
                data-testid="logo-type-image"
                onClick={() => {
                  if (branding.logo_url) {
                    saveBranding({ logo_type: 'image' });
                  } else {
                    logoInputRef.current?.click();
                  }
                }}
                className={`flex items-center gap-2 px-4 py-3 rounded-lg border transition-colors ${
                  branding.logo_type === 'image'
                    ? 'bg-orange-500/15 border-orange-500/40 text-orange-400'
                    : 'bg-zinc-800 border-zinc-300 text-zinc-400 hover:border-zinc-600'
                }`}
              >
                <Image className="w-4 h-4" />
                <span className="text-sm font-medium">Logo Image</span>
              </button>
            </div>

            {/* Logo Preview / Upload */}
            {branding.logo_type === 'image' && (
              <div className="flex items-center gap-4 p-3 bg-zinc-50 rounded-lg">
                {branding.logo_url ? (
                  <>
                    <img
                      src={resolveUrl(branding.logo_url)}
                      alt="Logo"
                      className="h-10 object-contain"
                      data-testid="logo-preview"
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => logoInputRef.current?.click()}
                      className="text-zinc-400 hover:text-zinc-700"
                    >
                      <Upload className="w-4 h-4 mr-1" /> Replace
                    </Button>
                  </>
                ) : (
                  <p className="text-zinc-500 text-sm">No logo uploaded yet</p>
                )}
              </div>
            )}
            <input
              ref={logoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              className="hidden"
              onChange={(e) => {
                if (e.target.files[0]) uploadFile('upload-logo', e.target.files[0]);
                e.target.value = '';
              }}
            />
          </div>

          {/* Favicon */}
          <div className="space-y-3">
            <Label className="text-zinc-600">Favicon</Label>
            <div className="flex items-center gap-4">
              {branding.favicon_url ? (
                <div className="flex items-center gap-3 p-3 bg-zinc-50 rounded-lg">
                  <img
                    src={resolveUrl(branding.favicon_url)}
                    alt="Favicon"
                    className="w-8 h-8 object-contain"
                    data-testid="favicon-preview"
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => faviconInputRef.current?.click()}
                    className="text-zinc-400 hover:text-zinc-700"
                  >
                    <Upload className="w-4 h-4 mr-1" /> Replace
                  </Button>
                </div>
              ) : (
                <Button
                  data-testid="upload-favicon-btn"
                  onClick={() => faviconInputRef.current?.click()}
                  variant="outline"
                  className="bg-zinc-50 border-zinc-200 text-zinc-600 hover:bg-zinc-100"
                  disabled={uploading === 'upload-favicon'}
                >
                  {uploading === 'upload-favicon' ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
                  Upload Favicon
                </Button>
              )}
            </div>
            <p className="text-xs text-zinc-500">Recommended: .ico, .png or .svg (32x32 or 64x64)</p>
            <input
              ref={faviconInputRef}
              type="file"
              accept=".ico,image/png,image/svg+xml"
              className="hidden"
              onChange={(e) => {
                if (e.target.files[0]) uploadFile('upload-favicon', e.target.files[0]);
                e.target.value = '';
              }}
            />
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
