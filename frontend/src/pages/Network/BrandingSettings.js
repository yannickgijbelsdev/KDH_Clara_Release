import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { toast } from 'sonner';
import { useBranding } from '../../context/BrandingContext';
import { useAuth } from '../../context/AuthContext';
import {
  Type, Image, Upload, Loader2, Star, Check, Paintbrush
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

  const CARDS = [
    {
      id: 'name',
      label: 'PLATFORM NAME',
      icon: Type,
      color: '#f97316',
      description: 'Shown in sidebar, login page, and emails',
    },
    {
      id: 'logo',
      label: 'LOGO',
      icon: Image,
      color: '#3b82f6',
      description: 'Platform logo for sidebar and headers',
    },
    {
      id: 'favicon',
      label: 'FAVICON',
      icon: Star,
      color: '#8b5cf6',
      description: 'Browser tab icon (.ico, .png, .svg)',
    },
  ];

  return (
    <div className="space-y-6" data-testid="branding-settings">
      {/* 260px Card Grid */}
      <div className="flex flex-wrap justify-center gap-4 sm:gap-6">
        {CARDS.map((card, i) => (
          <motion.div
            key={card.id}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 + 0.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="w-[260px] flex-shrink-0"
            data-testid={`branding-card-${card.id}`}
          >
            <div
              className="relative rounded-2xl overflow-hidden transition-all duration-300 border border-black/[0.06] shadow-[0_4px_24px_rgba(0,0,0,0.06)] hover:shadow-[0_8px_32px_rgba(0,0,0,0.10)]"
              style={{ background: 'linear-gradient(160deg, #ffffff 0%, #f9f8f6 100%)' }}
            >
              {/* Gradient header */}
              <div
                className="relative h-[140px] overflow-hidden flex items-center justify-center"
                style={{ background: `linear-gradient(135deg, ${card.color}15, ${card.color}08)` }}
              >
                <card.icon className="w-16 h-16 transition-transform duration-500" style={{ color: `${card.color}40` }} />
                <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-lg rounded-lg px-2.5 py-1 border border-black/[0.06] shadow-sm">
                  <div className="flex items-center gap-1.5">
                    <Paintbrush className="w-3 h-3" style={{ color: card.color }} />
                    <span className="text-[10px] font-bold tracking-wider" style={{ color: card.color }}>{card.label}</span>
                  </div>
                </div>

                {/* Preview in header area */}
                {card.id === 'name' && (
                  <div className="absolute bottom-3 right-3 bg-white/90 backdrop-blur-lg rounded-lg px-3 py-1.5 border border-black/[0.06] shadow-sm">
                    <span className="text-sm font-bold text-zinc-800">{branding.platform_name || 'Clara'}</span>
                  </div>
                )}
                {card.id === 'logo' && branding.logo_url && (
                  <div className="absolute bottom-3 right-3 bg-white/90 backdrop-blur-lg rounded-lg p-2 border border-black/[0.06] shadow-sm">
                    <img src={resolveUrl(branding.logo_url)} alt="Logo" className="h-6 object-contain" data-testid="logo-preview" />
                  </div>
                )}
                {card.id === 'favicon' && branding.favicon_url && (
                  <div className="absolute bottom-3 right-3 bg-white/90 backdrop-blur-lg rounded-lg p-2 border border-black/[0.06] shadow-sm">
                    <img src={resolveUrl(branding.favicon_url)} alt="Favicon" className="w-6 h-6 object-contain" data-testid="favicon-preview" />
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="px-3.5 py-3">
                <p className="text-[11px] text-zinc-400 mb-2">{card.description}</p>

                {/* Platform Name */}
                {card.id === 'name' && (
                  <div className="space-y-2">
                    <Input
                      data-testid="platform-name-input"
                      value={platformName}
                      onChange={(e) => setPlatformName(e.target.value)}
                      placeholder="Clara"
                      className="bg-zinc-50 border-zinc-200 text-zinc-900 text-xs h-8"
                    />
                    <Button
                      data-testid="save-platform-name-btn"
                      onClick={() => saveBranding({ platform_name: platformName })}
                      disabled={saving || platformName === branding.platform_name}
                      size="sm"
                      className="w-full h-7 text-[10px] rounded-lg"
                    >
                      {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Check className="w-3 h-3 mr-1" /> Save Name</>}
                    </Button>
                    <div className="flex gap-1.5 mt-1">
                      <button
                        data-testid="logo-type-text"
                        onClick={() => saveBranding({ logo_type: 'text' })}
                        className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg border text-[10px] font-medium transition-colors ${
                          branding.logo_type === 'text'
                            ? 'bg-orange-500/15 border-orange-500/40 text-orange-500'
                            : 'bg-zinc-50 border-zinc-200 text-zinc-500 hover:border-zinc-300'
                        }`}
                      >
                        <Type className="w-3 h-3" /> Text
                      </button>
                      <button
                        data-testid="logo-type-image"
                        onClick={() => branding.logo_url ? saveBranding({ logo_type: 'image' }) : logoInputRef.current?.click()}
                        className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg border text-[10px] font-medium transition-colors ${
                          branding.logo_type === 'image'
                            ? 'bg-orange-500/15 border-orange-500/40 text-orange-500'
                            : 'bg-zinc-50 border-zinc-200 text-zinc-500 hover:border-zinc-300'
                        }`}
                      >
                        <Image className="w-3 h-3" /> Logo
                      </button>
                    </div>
                  </div>
                )}

                {/* Logo Upload */}
                {card.id === 'logo' && (
                  <div className="space-y-2">
                    {branding.logo_url ? (
                      <div className="flex items-center gap-2 p-2 bg-zinc-50 rounded-lg">
                        <img src={resolveUrl(branding.logo_url)} alt="Logo" className="h-8 object-contain flex-1" />
                      </div>
                    ) : (
                      <div className="flex items-center justify-center p-4 bg-zinc-50 rounded-lg border-2 border-dashed border-zinc-200">
                        <span className="text-[10px] text-zinc-400">No logo uploaded</span>
                      </div>
                    )}
                    <Button
                      onClick={() => logoInputRef.current?.click()}
                      size="sm"
                      variant="outline"
                      className="w-full h-7 text-[10px] rounded-lg"
                      disabled={uploading === 'upload-logo'}
                    >
                      {uploading === 'upload-logo' ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Upload className="w-3 h-3 mr-1" />}
                      {branding.logo_url ? 'Replace Logo' : 'Upload Logo'}
                    </Button>
                  </div>
                )}

                {/* Favicon Upload */}
                {card.id === 'favicon' && (
                  <div className="space-y-2">
                    {branding.favicon_url ? (
                      <div className="flex items-center gap-2 p-2 bg-zinc-50 rounded-lg">
                        <img src={resolveUrl(branding.favicon_url)} alt="Favicon" className="w-8 h-8 object-contain" />
                        <span className="text-[10px] text-zinc-500">Current favicon</span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center p-4 bg-zinc-50 rounded-lg border-2 border-dashed border-zinc-200">
                        <span className="text-[10px] text-zinc-400">No favicon uploaded</span>
                      </div>
                    )}
                    <Button
                      data-testid="upload-favicon-btn"
                      onClick={() => faviconInputRef.current?.click()}
                      size="sm"
                      variant="outline"
                      className="w-full h-7 text-[10px] rounded-lg"
                      disabled={uploading === 'upload-favicon'}
                    >
                      {uploading === 'upload-favicon' ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Upload className="w-3 h-3 mr-1" />}
                      {branding.favicon_url ? 'Replace Favicon' : 'Upload Favicon'}
                    </Button>
                  </div>
                )}
              </div>

              {/* Bottom accent bar */}
              <div className="h-1" style={{ background: `linear-gradient(90deg, ${card.color}, ${card.color}60)` }} />
            </div>
          </motion.div>
        ))}
      </div>

      {/* Hidden file inputs */}
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
  );
}
