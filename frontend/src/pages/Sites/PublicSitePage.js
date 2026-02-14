import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Play, Pause, Volume2, VolumeX, Send, Lock, Loader2, Upload, X, FileImage, FileAudio, FileVideo } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { toast } from 'sonner';
import Hls from 'hls.js';

const API = process.env.REACT_APP_BACKEND_URL;

export default function PublicSitePage() {
  const { slug, mainSiteSlug, siteSlug } = useParams();
  const [site, setSite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordVerified, setPasswordVerified] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [formData, setFormData] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  
  const audioRef = useRef(null);
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const fileInputRef = useRef(null);
  
  // Determine if this is a multisite URL or legacy URL
  const isMultisite = !!mainSiteSlug && !!siteSlug;
  const effectiveSlug = isMultisite ? siteSlug : slug;
  const apiPath = isMultisite 
    ? `/api/sites/public/${mainSiteSlug}/${siteSlug}`
    : `/api/sites/public/${slug}`;

  useEffect(() => {
    fetchSite();
  }, [slug, mainSiteSlug, siteSlug]);

  const fetchSite = async () => {
    try {
      const res = await fetch(`${API}${apiPath}`);
      if (res.ok) {
        const data = await res.json();
        setSite(data);
        // Set dynamic page title
        document.title = data.name || 'Site';
        if (data.password_protected && !passwordVerified) {
          setPasswordRequired(true);
        }
        // Initialize form data
        const initialFormData = {};
        (data.form_fields || []).forEach(field => {
          initialFormData[field.id] = '';
        });
        setFormData(initialFormData);
      } else if (res.status === 404) {
        setError('Page not found');
        document.title = 'Page not found';
      } else {
        setError('An error occurred');
      }
    } catch (err) {
      setError('An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const verifyPassword = async () => {
    try {
      const res = await fetch(`${API}${apiPath}/verify-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordInput })
      });
      if (res.ok) {
        setPasswordVerified(true);
        setPasswordRequired(false);
      } else {
        toast.error('Invalid password');
      }
    } catch (err) {
      toast.error('An error occurred');
    }
  };

  const togglePlay = () => {
    if (site?.audio_enabled && audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
    if (site?.video_enabled && videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const toggleMute = () => {
    if (audioRef.current) {
      audioRef.current.muted = !isMuted;
    }
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
    }
    setIsMuted(!isMuted);
  };

  // Setup HLS video
  useEffect(() => {
    if (site?.video_enabled && site?.video_type === 'hls' && site?.video_url && videoRef.current) {
      if (Hls.isSupported()) {
        const hls = new Hls();
        hls.loadSource(site.video_url);
        hls.attachMedia(videoRef.current);
        hlsRef.current = hls;
        
        return () => {
          hls.destroy();
        };
      } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
        videoRef.current.src = site.video_url;
      }
    }
  }, [site?.video_enabled, site?.video_type, site?.video_url]);

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    
    setUploading(true);
    const newFiles = [];
    
    for (const file of files) {
      const formData = new FormData();
      formData.append('file', file);
      
      try {
        const res = await fetch(`${API}/api/sites/public/${slug}/upload-file`, {
          method: 'POST',
          body: formData
        });
        
        if (res.ok) {
          const data = await res.json();
          newFiles.push({
            url: data.file_url,
            name: data.filename,
            type: data.content_type
          });
        } else {
          const err = await res.json();
          toast.error(err.detail || `Fout bij uploaden: ${file.name}`);
        }
      } catch (err) {
        toast.error(`Fout bij uploaden: ${file.name}`);
      }
    }
    
    setUploadedFiles(prev => [...prev, ...newFiles]);
    setUploading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeFile = (index) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const getFileIcon = (type) => {
    if (type?.startsWith('image/')) return FileImage;
    if (type?.startsWith('audio/')) return FileAudio;
    if (type?.startsWith('video/')) return FileVideo;
    return Upload;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    
    try {
      const res = await fetch(`${API}/api/sites/public/${slug}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name || '',
          phone: formData.phone || '',
          message: formData.message || '',
          custom_fields: Object.fromEntries(
            Object.entries(formData).filter(([key]) => !['name', 'phone', 'message'].includes(key))
          ),
          file_urls: uploadedFiles.map(f => f.url)
        })
      });
      
      if (res.ok) {
        setSubmitted(true);
        toast.success('Bericht verzonden!');
      } else {
        toast.error('Er is een fout opgetreden');
      }
    } catch (err) {
      toast.error('Er is een fout opgetreden');
    } finally {
      setSubmitting(false);
    }
  };

  const getEmbedUrl = () => {
    if (!site?.video_url) return null;
    
    if (site.video_type === 'youtube') {
      // Extract video ID
      const match = site.video_url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&]+)/);
      if (match) {
        return `https://www.youtube.com/embed/${match[1]}`;
      }
    } else if (site.video_type === 'vimeo') {
      const match = site.video_url.match(/vimeo\.com\/(\d+)/);
      if (match) {
        return `https://player.vimeo.com/video/${match[1]}`;
      }
    } else if (site.video_type === 'twitch') {
      // Could be channel or video
      const channelMatch = site.video_url.match(/twitch\.tv\/([^/]+)$/);
      const videoMatch = site.video_url.match(/twitch\.tv\/videos\/(\d+)/);
      if (videoMatch) {
        return `https://player.twitch.tv/?video=${videoMatch[1]}&parent=${window.location.hostname}`;
      } else if (channelMatch) {
        return `https://player.twitch.tv/?channel=${channelMatch[1]}&parent=${window.location.hostname}`;
      }
    }
    return null;
  };

  // Get button styles
  const buttonColor = site?.button_color || '#f97316';
  const backgroundColor = site?.background_color || '#09090b';
  const containerColor = site?.container_color || '#18181b';

  const buttonStyle = {
    backgroundColor: buttonColor
  };

  const buttonClassName = 'w-full text-white hover:opacity-90';

  // Calculate logo height based on scale
  const getLogoStyle = () => {
    const baseHeight = 128; // 32 = h-32 in tailwind (8rem = 128px)
    const scale = site?.logo_scale || 100;
    const height = Math.round(baseHeight * scale / 100);
    return {
      height: `${height}px`,
      width: 'auto'
    };
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor }}>
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: buttonColor }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor }}>
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-2">Oeps!</h1>
          <p className="text-zinc-400">{error}</p>
        </div>
      </div>
    );
  }

  if (passwordRequired && !passwordVerified) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor }}>
        <div className="rounded-2xl p-8 max-w-md w-full border border-zinc-800" style={{ backgroundColor: containerColor }}>
          {site?.logo_url && (
            <img 
              src={site.logo_url.startsWith('http') ? site.logo_url : `${API}${site.logo_url}`}
              alt={site?.name}
              className="h-20 w-auto mx-auto mb-6"
            />
          )}
          <div className="text-center mb-6">
            <Lock className="h-12 w-12 mx-auto mb-4" style={{ color: buttonColor }} />
            <h1 className="text-xl font-bold text-white">
              Deze pagina is beveiligd
            </h1>
            <p className="text-zinc-400 mt-2">
              Voer het wachtwoord in om toegang te krijgen
            </p>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); verifyPassword(); }}>
            <Input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="Wachtwoord"
              className="bg-zinc-800 border-zinc-700 mb-4"
            />
            <Button type="submit" className="w-full text-white hover:opacity-90" style={{ backgroundColor: buttonColor }}>
              Toegang krijgen
            </Button>
          </form>
        </div>
      </div>
    );
  }

  const embedUrl = getEmbedUrl();

  return (
    <div className="min-h-screen" style={{ backgroundColor }}>
      <div className="max-w-4xl mx-auto px-4 sm:px-8 pt-4 sm:pt-6">
        {/* Compact Header with Logo */}
        <div className="text-center mb-2">
          {site?.logo_url && (
            <img 
              src={site.logo_url.startsWith('http') ? site.logo_url : `${API}${site.logo_url}`}
              alt={site?.name}
              style={getLogoStyle()}
              className="mx-auto"
            />
          )}
          {!site?.logo_url && (
            <h1 className="text-xl sm:text-2xl font-bold text-white py-2">
              {site?.name}
            </h1>
          )}
        </div>

        {/* Video Player - shown first if enabled, directly under header */}
        {site?.video_enabled && site?.video_url && (
          <div className="rounded-xl overflow-hidden border border-zinc-800" style={{ backgroundColor: containerColor }}>
            {site.video_type === 'hls' ? (
              <video
                ref={videoRef}
                className="w-full aspect-video"
                controls
                playsInline
              />
            ) : embedUrl ? (
              <iframe
                src={embedUrl}
                className="w-full aspect-video"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <div className="aspect-video flex items-center justify-center text-zinc-400">
                Video URL kon niet worden geladen
              </div>
            )}
          </div>
        )}

        {/* Header Image - shown only if video is not enabled, compact spacing */}
        {!site?.video_enabled && site?.header_image_url && (
          <div className="rounded-xl overflow-hidden">
            <img 
              src={site.header_image_url.startsWith('http') ? site.header_image_url : `${API}${site.header_image_url}`}
              alt=""
              className="w-full h-auto object-cover"
            />
          </div>
        )}

        {/* Audio Player - directly against header/video */}
        {site?.audio_enabled && site?.audio_url && (
          <div className="rounded-xl p-4 border border-zinc-800 mt-0" style={{ backgroundColor: containerColor }}>
            <audio
              ref={audioRef}
              src={site.audio_type === 'file' 
                ? (site.audio_url.startsWith('http') ? site.audio_url : `${API}${site.audio_url}`)
                : site.audio_url
              }
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
            />
            <div className="flex items-center justify-center gap-4">
              <Button
                onClick={togglePlay}
                size="lg"
                className="h-14 w-14 rounded-full text-white hover:opacity-90"
                style={{ backgroundColor: buttonColor }}
              >
                {isPlaying ? (
                  <Pause className="h-7 w-7" />
                ) : (
                  <Play className="h-7 w-7 ml-1" />
                )}
              </Button>
              <button
                onClick={toggleMute}
                className="p-2 rounded-lg transition-colors"
                style={{ 
                  color: isMuted ? buttonColor : '#a1a1aa',
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = buttonColor}
                onMouseLeave={(e) => e.currentTarget.style.color = isMuted ? buttonColor : '#a1a1aa'}
              >
                {isMuted ? (
                  <VolumeX className="h-5 w-5" />
                ) : (
                  <Volume2 className="h-5 w-5" />
                )}
              </button>
            </div>
            {isPlaying && (
              <div className="mt-3 flex justify-center">
                <div className="flex gap-1">
                  {[...Array(5)].map((_, i) => (
                    <div
                      key={i}
                      className="w-1 rounded-full animate-pulse"
                      style={{
                        height: `${16 + Math.random() * 16}px`,
                        animationDelay: `${i * 0.1}s`,
                        backgroundColor: buttonColor
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Contact Form */}
        {site?.form_enabled && (
          <div className="rounded-xl p-5 border border-zinc-800 mt-4 mb-6" style={{ backgroundColor: containerColor }}>
            <h2 className="text-lg font-bold text-white mb-3">Neem contact op</h2>
            
            {submitted ? (
              <div className="text-center py-6">
                <div className="h-14 w-14 rounded-full flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: `${buttonColor}33` }}>
                  <Send className="h-7 w-7" style={{ color: buttonColor }} />
                </div>
                <p className="text-white font-medium">Bedankt voor je bericht!</p>
                <p className="text-zinc-400 mt-1 text-sm">We nemen zo snel mogelijk contact op.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3">
                {(site.form_fields || []).map(field => (
                  <div key={field.id}>
                    <label className="block text-sm font-medium text-zinc-300 mb-1">
                      {field.label}
                      {field.required && <span className="text-red-400 ml-1">*</span>}
                    </label>
                    {field.type === 'textarea' ? (
                      <textarea
                        value={formData[field.id] || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, [field.id]: e.target.value }))}
                        required={field.required}
                        rows={3}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm resize-none focus:outline-none"
                        style={{ '--tw-ring-color': buttonColor }}
                      />
                    ) : (
                      <Input
                        type={field.type}
                        value={formData[field.id] || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, [field.id]: e.target.value }))}
                        required={field.required}
                        className="bg-zinc-800 border-zinc-700 text-sm"
                      />
                    )}
                  </div>
                ))}
                
                {/* File Upload Section */}
                {site.form_file_upload_enabled && (
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1">
                      Bestanden toevoegen
                    </label>
                    <div className="space-y-2">
                      {/* Uploaded files list */}
                      {uploadedFiles.length > 0 && (
                        <div className="space-y-1">
                          {uploadedFiles.map((file, index) => {
                            const FileIcon = getFileIcon(file.type);
                            return (
                              <div 
                                key={index}
                                className="flex items-center gap-2 p-2 bg-zinc-800 rounded-lg text-sm"
                              >
                                <FileIcon className="h-4 w-4 text-zinc-400" />
                                <span className="flex-1 truncate text-zinc-300">{file.name}</span>
                                <button
                                  type="button"
                                  onClick={() => removeFile(index)}
                                  className="text-zinc-500 hover:text-red-400"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      
                      {/* Upload button */}
                      <label className="cursor-pointer block">
                        <input
                          ref={fileInputRef}
                          type="file"
                          multiple
                          accept="image/*,audio/*,video/*"
                          onChange={handleFileUpload}
                          className="hidden"
                          disabled={uploading}
                        />
                        <div className="flex items-center justify-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition border border-dashed border-zinc-600 text-sm text-zinc-400">
                          {uploading ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span>Uploaden...</span>
                            </>
                          ) : (
                            <>
                              <Upload className="h-4 w-4" />
                              <span>Afbeelding, audio of video uploaden</span>
                            </>
                          )}
                        </div>
                      </label>
                      <p className="text-xs text-zinc-500">Max 50MB per bestand</p>
                    </div>
                  </div>
                )}
                
                <Button 
                  type="submit" 
                  disabled={submitting || uploading}
                  className={buttonClassName}
                  style={buttonStyle}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Verzenden...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Verstuur
                    </>
                  )}
                </Button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
