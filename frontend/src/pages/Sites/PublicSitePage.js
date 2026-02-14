import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Play, Pause, Volume2, VolumeX, Send, Lock, Loader2 } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { toast } from 'sonner';
import Hls from 'hls.js';

const API = process.env.REACT_APP_BACKEND_URL;

export default function PublicSitePage() {
  const { slug } = useParams();
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
  
  const audioRef = useRef(null);
  const videoRef = useRef(null);
  const hlsRef = useRef(null);

  useEffect(() => {
    fetchSite();
  }, [slug]);

  const fetchSite = async () => {
    try {
      const res = await fetch(`${API}/api/sites/public/${slug}`);
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
        setError('Pagina niet gevonden');
        document.title = 'Pagina niet gevonden';
      } else {
        setError('Er is een fout opgetreden');
      }
    } catch (err) {
      setError('Er is een fout opgetreden');
    } finally {
      setLoading(false);
    }
  };

  const verifyPassword = async () => {
    try {
      const res = await fetch(`${API}/api/sites/public/${slug}/verify-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordInput })
      });
      if (res.ok) {
        setPasswordVerified(true);
        setPasswordRequired(false);
      } else {
        toast.error('Ongeldig wachtwoord');
      }
    } catch (err) {
      toast.error('Er is een fout opgetreden');
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
          )
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

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-2">Oeps!</h1>
          <p className="text-zinc-400">{error}</p>
        </div>
      </div>
    );
  }

  if (passwordRequired && !passwordVerified) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="bg-zinc-900 rounded-2xl p-8 max-w-md w-full border border-zinc-800">
          {site?.logo_url && (
            <img 
              src={`${API}${site.logo_url}`}
              alt={site?.name}
              className="h-20 w-auto mx-auto mb-6"
            />
          )}
          <div className="text-center mb-6">
            <Lock className="h-12 w-12 text-orange-500 mx-auto mb-4" />
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
            <Button type="submit" className="w-full bg-orange-500 hover:bg-orange-600">
              Toegang krijgen
            </Button>
          </form>
        </div>
      </div>
    );
  }

  const embedUrl = getEmbedUrl();

  return (
    <div className="min-h-screen bg-zinc-950">
      <div className="max-w-4xl mx-auto p-4 sm:p-8">
        {/* Header with Logo */}
        <div className="text-center mb-8">
          {site?.logo_url && (
            <img 
              src={site.logo_url.startsWith('http') ? site.logo_url : `${API}${site.logo_url}`}
              alt={site?.name}
              className="h-24 sm:h-32 w-auto mx-auto mb-4"
            />
          )}
          <h1 className="text-2xl sm:text-3xl font-bold text-white">
            {site?.name}
          </h1>
        </div>

        {/* Video Player - shown first if enabled */}
        {site?.video_enabled && site?.video_url && (
          <div className="bg-zinc-900 rounded-2xl overflow-hidden mb-6 border border-zinc-800">
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

        {/* Header Image - shown only if video is not enabled */}
        {!site?.video_enabled && site?.header_image_url && (
          <div className="rounded-2xl overflow-hidden mb-6">
            <img 
              src={site.header_image_url.startsWith('http') ? site.header_image_url : `${API}${site.header_image_url}`}
              alt=""
              className="w-full h-auto object-cover"
            />
          </div>
        )}

        {/* Audio Player */}
        {site?.audio_enabled && site?.audio_url && (
          <div className="bg-zinc-900 rounded-2xl p-6 mb-6 border border-zinc-800">
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
                className="h-16 w-16 rounded-full bg-orange-500 hover:bg-orange-600"
              >
                {isPlaying ? (
                  <Pause className="h-8 w-8" />
                ) : (
                  <Play className="h-8 w-8 ml-1" />
                )}
              </Button>
              <Button
                onClick={toggleMute}
                variant="ghost"
                size="sm"
                className="text-zinc-400 hover:text-white"
              >
                {isMuted ? (
                  <VolumeX className="h-6 w-6" />
                ) : (
                  <Volume2 className="h-6 w-6" />
                )}
              </Button>
            </div>
            {isPlaying && (
              <div className="mt-4 flex justify-center">
                <div className="flex gap-1">
                  {[...Array(5)].map((_, i) => (
                    <div
                      key={i}
                      className="w-1 bg-orange-500 rounded-full animate-pulse"
                      style={{
                        height: `${20 + Math.random() * 20}px`,
                        animationDelay: `${i * 0.1}s`
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
          <div className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800">
            <h2 className="text-xl font-bold text-white mb-4">Neem contact op</h2>
            
            {submitted ? (
              <div className="text-center py-8">
                <div className="h-16 w-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Send className="h-8 w-8 text-green-500" />
                </div>
                <p className="text-white font-medium">Bedankt voor je bericht!</p>
                <p className="text-zinc-400 mt-1">We nemen zo snel mogelijk contact op.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
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
                        rows={4}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-white resize-none focus:outline-none focus:border-orange-500"
                      />
                    ) : (
                      <Input
                        type={field.type}
                        value={formData[field.id] || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, [field.id]: e.target.value }))}
                        required={field.required}
                        className="bg-zinc-800 border-zinc-700"
                      />
                    )}
                  </div>
                ))}
                
                <Button 
                  type="submit" 
                  disabled={submitting}
                  className="w-full bg-orange-500 hover:bg-orange-600"
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
