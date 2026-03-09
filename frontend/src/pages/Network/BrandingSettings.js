import { useState, useRef } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { toast } from 'sonner';
import { useBranding } from '../../context/BrandingContext';
import { useAuth } from '../../context/AuthContext';
import {
  Type, Image, Upload, Trash2, Monitor, PanelLeft, PanelRight, Maximize,
  RotateCcw, Loader2, Star, X
} from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

export default function BrandingSettings() {
  const { branding, refreshBranding } = useBranding();
  const { token } = useAuth();
  const [saving, setSaving] = useState(false);
  const [platformName, setPlatformName] = useState(branding.platform_name || 'Clara');
  const [loginLayout, setLoginLayout] = useState(branding.login_layout || 'left');
  const [loginImageType, setLoginImageType] = useState(branding.login_image_type || 'static');
  const [uploading, setUploading] = useState(null);
  const logoInputRef = useRef(null);
  const faviconInputRef = useRef(null);
  const loginImageInputRef = useRef(null);

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

  const deleteLoginImage = async (imageUrl) => {
    try {
      await fetch(`${API}/api/branding/login-image?image_url=${encodeURIComponent(imageUrl)}`, {
        method: 'DELETE',
        headers,
      });
      await refreshBranding();
      toast.success('Image removed');
    } catch {
      toast.error('Failed to remove');
    }
  };

  const resolveUrl = (url) => {
    if (!url) return null;
    return url.startsWith('/') ? `${API}${url}` : url;
  };

  const layoutOptions = [
    { value: 'left', label: 'Image Left', icon: PanelLeft },
    { value: 'right', label: 'Image Right', icon: PanelRight },
    { value: 'fullscreen', label: 'Fullscreen', icon: Maximize },
  ];

  return (
    <div className="space-y-6" data-testid="branding-settings">
      {/* Platform Name & Logo */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-lg text-white flex items-center gap-2">
            <Star className="w-5 h-5 text-orange-400" />
            Platform Branding
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Platform Name */}
          <div className="space-y-2">
            <Label className="text-zinc-300">Platform Name</Label>
            <div className="flex gap-2">
              <Input
                data-testid="platform-name-input"
                value={platformName}
                onChange={(e) => setPlatformName(e.target.value)}
                placeholder="Clara"
                className="bg-zinc-800 border-zinc-700 text-white max-w-xs"
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
            <Label className="text-zinc-300">Logo Display</Label>
            <div className="flex gap-3">
              <button
                data-testid="logo-type-text"
                onClick={() => saveBranding({ logo_type: 'text' })}
                className={`flex items-center gap-2 px-4 py-3 rounded-lg border transition-colors ${
                  branding.logo_type === 'text'
                    ? 'bg-orange-500/15 border-orange-500/40 text-orange-400'
                    : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'
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
                    : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'
                }`}
              >
                <Image className="w-4 h-4" />
                <span className="text-sm font-medium">Logo Image</span>
              </button>
            </div>

            {/* Logo Preview / Upload */}
            {branding.logo_type === 'image' && (
              <div className="flex items-center gap-4 p-3 bg-zinc-800 rounded-lg">
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
                      className="text-zinc-400 hover:text-white"
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
            <Label className="text-zinc-300">Favicon</Label>
            <div className="flex items-center gap-4">
              {branding.favicon_url ? (
                <div className="flex items-center gap-3 p-3 bg-zinc-800 rounded-lg">
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
                    className="text-zinc-400 hover:text-white"
                  >
                    <Upload className="w-4 h-4 mr-1" /> Replace
                  </Button>
                </div>
              ) : (
                <Button
                  data-testid="upload-favicon-btn"
                  onClick={() => faviconInputRef.current?.click()}
                  variant="outline"
                  className="bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700"
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

      {/* Login Page */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-lg text-white flex items-center gap-2">
            <Monitor className="w-5 h-5 text-violet-400" />
            Login Page
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Layout */}
          <div className="space-y-3">
            <Label className="text-zinc-300">Image Layout</Label>
            <div className="grid grid-cols-3 gap-3">
              {layoutOptions.map(opt => {
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.value}
                    data-testid={`login-layout-${opt.value}`}
                    onClick={() => {
                      setLoginLayout(opt.value);
                      saveBranding({ login_layout: opt.value });
                    }}
                    className={`flex flex-col items-center gap-2 p-4 rounded-lg border transition-colors ${
                      loginLayout === opt.value
                        ? 'bg-violet-500/15 border-violet-500/40 text-violet-400'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'
                    }`}
                  >
                    <Icon className="w-6 h-6" />
                    <span className="text-xs font-medium">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Image Type */}
          <div className="space-y-3">
            <Label className="text-zinc-300">Image Type</Label>
            <div className="flex gap-3">
              {['static', 'carousel'].map(type => (
                <button
                  key={type}
                  data-testid={`login-image-type-${type}`}
                  onClick={() => {
                    setLoginImageType(type);
                    saveBranding({ login_image_type: type });
                  }}
                  className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    loginImageType === type
                      ? 'bg-violet-500/15 border-violet-500/40 text-violet-400'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'
                  }`}
                >
                  {type === 'static' ? 'Static Image' : 'Carousel'}
                </button>
              ))}
            </div>
          </div>

          {/* Login Images */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-zinc-300">Background Images</Label>
              <Button
                data-testid="upload-login-image-btn"
                size="sm"
                onClick={() => loginImageInputRef.current?.click()}
                className="bg-violet-500 hover:bg-violet-600 text-white h-8"
                disabled={uploading === 'upload-login-image'}
              >
                {uploading === 'upload-login-image' ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Upload className="w-3 h-3 mr-1" />}
                Add Image
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {(branding.login_images || []).map((img, i) => (
                <div key={i} className="relative group rounded-lg overflow-hidden border border-zinc-700 aspect-video">
                  <img
                    src={resolveUrl(img)}
                    alt={`Login bg ${i + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <button
                    onClick={() => deleteLoginImage(img)}
                    className="absolute top-1 right-1 p-1 bg-red-500/80 rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
                    data-testid={`delete-login-image-${i}`}
                  >
                    <X className="w-3 h-3 text-white" />
                  </button>
                </div>
              ))}
              {(!branding.login_images || branding.login_images.length === 0) && (
                <p className="text-zinc-500 text-sm col-span-3">No images uploaded. Default will be used.</p>
              )}
            </div>

            <input
              ref={loginImageInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                if (e.target.files[0]) uploadFile('upload-login-image', e.target.files[0]);
                e.target.value = '';
              }}
            />
          </div>

          {/* Preview */}
          <div className="p-3 bg-zinc-800 rounded-lg">
            <p className="text-xs text-zinc-500 mb-2">Preview</p>
            <div className="relative h-32 bg-[#09090b] rounded-lg overflow-hidden flex" data-testid="login-preview">
              {loginLayout === 'fullscreen' ? (
                <>
                  <div className="absolute inset-0">
                    {branding.login_images?.[0] && (
                      <img src={resolveUrl(branding.login_images[0])} alt="" className="w-full h-full object-cover opacity-40" />
                    )}
                  </div>
                  <div className="relative z-10 flex items-center justify-center w-full">
                    <div className="w-16 h-16 bg-zinc-800/80 border border-zinc-700 rounded-lg" />
                  </div>
                </>
              ) : (
                <>
                  <div className={`w-1/2 ${loginLayout === 'right' ? 'order-2' : ''}`}>
                    {branding.login_images?.[0] && (
                      <img src={resolveUrl(branding.login_images[0])} alt="" className="w-full h-full object-cover opacity-60" />
                    )}
                  </div>
                  <div className={`w-1/2 flex items-center justify-center ${loginLayout === 'right' ? 'order-1' : ''}`}>
                    <div className="w-16 h-16 bg-zinc-800 border border-zinc-700 rounded-lg" />
                  </div>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
