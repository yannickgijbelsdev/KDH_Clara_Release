import { useState, useRef, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { Shield, ArrowLeft, KeyRound, Mail, Loader2, Radio, Code2, Newspaper, Cloud, Calendar, Sparkles, Globe, BarChart3, Activity, Mic2, Server, Shield as ShieldIcon, Gauge, Waves, ListChecks, FileCheck2, Lock, Search, Wand2, HeartPulse } from 'lucide-react';
import { getRedirectParam, createExchangeToken, buildAppRedirectUrl, fetchSubdomainConfig } from '../services/subdomainAuth';

const API = process.env.REACT_APP_BACKEND_URL;

const resolveUrl = (url) => {
  if (!url) return null;
  return url.startsWith('/') ? `${API}${url}` : url;
};

const ROOMS_IMG = '/images/clara_rooms.png'; // legacy hero fallback — kept for reference

import { Layers } from 'lucide-react';

// Fullscreen rotating scenes with features per room.
const SCENES = [
  {
    src: '/koodh_clr_stripes.png',
    title: 'Koodh Clara — One platform, every site',
    titleIcon: Layers,
    objectPosition: '50% 50%',
    accent: '#dd0c51',
    isBrand: true,
    features: [
      { icon: Radio,     label: 'Radio' },
      { icon: Cloud,     label: 'Hosting' },
      { icon: Sparkles,  label: 'AI Insights' },
      { icon: Globe,     label: 'Clara Custom' },
    ],
  },
  {
    src: '/images/env_radio_v2.jpg',
    title: 'Radio Management',
    titleIcon: Radio,
    objectPosition: '50% 50%',
    accent: '#dd0c51',
    features: [
      { icon: Mic2,      label: 'Live Shows' },
      { icon: Waves,     label: 'RDS Builder' },
      { icon: Activity,  label: 'Stream Monitor' },
      { icon: Calendar,  label: 'Show Scheduler' },
    ],
  },
  {
    src: '/images/env_task_scheduler_v2.jpg',
    title: 'Smart Scheduling',
    titleIcon: Calendar,
    objectPosition: '50% 50%',
    accent: '#7c1ac8',
    features: [
      { icon: ListChecks, label: 'Clara Tasks' },
      { icon: Calendar,   label: 'Google Calendar' },
      { icon: FileCheck2, label: 'Approval Flow' },
      { icon: Gauge,      label: 'Kanban Board' },
    ],
  },
  {
    src: '/images/env_external_host_v2.jpg',
    title: 'Multi-Site Hosting',
    titleIcon: Cloud,
    objectPosition: '50% 50%',
    accent: '#0ea5e9',
    features: [
      { icon: Globe,     label: 'Custom Domains' },
      { icon: Lock,      label: 'DNS + SSL' },
      { icon: Code2,     label: 'Code Studio' },
      { icon: Server,    label: 'Managed Hosting' },
    ],
  },
  {
    src: '/images/env_technical_v2.jpg',
    title: 'AI-Powered Intelligence',
    titleIcon: Sparkles,
    objectPosition: '50% 50%',
    accent: '#10b981',
    features: [
      { icon: Search,     label: 'Clara Scan' },
      { icon: Wand2,      label: 'Auto-Fix' },
      { icon: HeartPulse, label: 'Health Reports' },
      { icon: BarChart3,  label: 'Data Analytics' },
    ],
  },
];

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [backupCode, setBackupCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [requires2FA, setRequires2FA] = useState(false);
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  useEffect(() => { document.title = 'Clara | Login'; }, []);

  // Auto-rotate scenes
  useEffect(() => {
    const id = setInterval(() => {
      setSceneIndex((prev) => (prev + 1) % SCENES.length);
    }, 6500);
    return () => clearInterval(id);
  }, []);

  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [sceneIndex, setSceneIndex] = useState(0);
  const rafRef = useRef(null);
  const { login } = useAuth();
  const { branding } = useBranding();

  const platformName = branding.platform_name || 'Clara';
  const logoUrl = branding.logo_type === 'image' && branding.logo_url ? resolveUrl(branding.logo_url) : null;

  const handleMouseMove = useCallback((e) => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      const x = (e.clientX / window.innerWidth - 0.5) * 2;
      const y = (e.clientY / window.innerHeight - 0.5) * 2;
      setMousePos({ x, y });
      rafRef.current = null;
    });
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const code = useBackupCode ? null : (totpCode || null);
      const backup = useBackupCode ? backupCode : null;
      const result = await login(email, password, code, backup);
      if (result?.requires_2fa) {
        setRequires2FA(true);
        toast.info('Enter your 2FA code');
      } else {
        const redirectUrl = getRedirectParam();
        if (redirectUrl) {
          const token = localStorage.getItem('token');
          const subConfig = await fetchSubdomainConfig();
          const exchangeResult = await createExchangeToken(token, redirectUrl);
          if (exchangeResult?.exchange_token) {
            window.location.href = buildAppRedirectUrl(subConfig, exchangeResult.exchange_token, redirectUrl);
            return;
          }
        }
        sessionStorage.setItem('show_login_wizard', 'true');
        window.dispatchEvent(new Event('show-login-wizard'));
      }
    } catch (error) {
      let message = 'Connection error. Please try again.';
      const detail = error.response?.data?.detail;
      if (typeof detail === 'string') {
        message = detail;
      } else if (Array.isArray(detail)) {
        message = detail.map(d => d.msg || d).join(', ');
      } else if (error.response?.status) {
        message = `Login failed (${error.response.status}). Please try again.`;
      }
      toast.error(message);
      if (typeof detail !== 'string' || !detail.includes('2FA')) {
        setRequires2FA(false);
        setTotpCode('');
        setBackupCode('');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    setRequires2FA(false);
    setTotpCode('');
    setBackupCode('');
    setUseBackupCode(false);
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    if (!forgotEmail) return;
    setForgotLoading(true);
    try {
      const res = await fetch(`${API}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail }),
      });
      if (res.ok) {
        setForgotSent(true);
        toast.success('If the email exists, a temporary password has been sent.');
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.detail || 'Something went wrong');
      }
    } catch {
      toast.error('Connection error');
    }
    setForgotLoading(false);
  };

  /* Parallax values */
  const imgRotateY = mousePos.x * 6;
  const imgRotateX = -mousePos.y * 4;

  return (
    <div
      className="min-h-screen flex relative overflow-hidden bg-zinc-300"
      onMouseMove={handleMouseMove}
      data-testid="login-page"
    >
      {/* Fullscreen rotating scene background */}
      <div className="absolute inset-0 z-0 overflow-hidden" data-testid="login-hero-rooms">
        {SCENES.map((scene, idx) => {
          const active = idx === sceneIndex;
          return (
            <motion.div
              key={scene.title}
              initial={false}
              animate={{
                opacity: active ? 1 : 0,
                scale: active ? 1 : 1.06,
              }}
              transition={{ duration: 1.2, ease: [0.25, 0.1, 0.25, 1] }}
              className="absolute inset-0"
              style={{ willChange: 'opacity, transform' }}
            >
              <img
                src={scene.src}
                alt={scene.title}
                className="w-full h-full select-none"
                draggable={false}
                style={{
                  objectFit: 'cover',
                  objectPosition: scene.objectPosition,
                  transform: `scale(1.02) translate3d(${mousePos.x * -14}px, ${mousePos.y * -10}px, 0)`,
                  transition: 'transform 0.4s cubic-bezier(0.25, 0.1, 0.25, 1)',
                  imageRendering: 'auto',
                  filter: scene.isBrand ? 'none' : 'saturate(1.04) brightness(0.98) contrast(1.04)',
                }}
              />
              {/* Gradient vignette for text legibility — kept subtle, no hard black bars */}
              <div className="absolute inset-0 pointer-events-none" style={{
                background: scene.isBrand
                  ? 'linear-gradient(90deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.25) 35%, rgba(0,0,0,0.05) 60%, transparent 80%)'
                  : 'linear-gradient(90deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.08) 30%, transparent 55%)',
              }} />
            </motion.div>
          );
        })}
      </div>

      {/* Left side: scene info + pills */}
      <div className="hidden lg:flex flex-col justify-between relative z-10 flex-1 p-12 xl:p-16">
        <div />

        {/* Scene title + feature pills */}
        <div className="max-w-xl">
          <motion.div
            key={`title-${sceneIndex}`}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="mb-6"
          >
            <div className="flex items-center gap-2 mb-3">
              <span
                className="inline-flex items-center justify-center w-9 h-9 rounded-full"
                style={{ backgroundColor: SCENES[sceneIndex].accent }}
              >
                {(() => {
                  const T = SCENES[sceneIndex].titleIcon;
                  return <T className="w-4 h-4 text-white" strokeWidth={2.4} />;
                })()}
              </span>
              <span className="text-[11px] font-bold tracking-[0.2em] uppercase text-white/70">
                Clara Platform
              </span>
            </div>
            <h1 className="text-4xl xl:text-5xl font-black text-white leading-[1.05] drop-shadow-[0_4px_24px_rgba(0,0,0,0.4)]">
              {SCENES[sceneIndex].title}
            </h1>
          </motion.div>

          {/* Feature pills for the active scene */}
          <div className="flex flex-wrap gap-2">
            {SCENES[sceneIndex].features.map((f, i) => {
              const Icon = f.icon;
              return (
                <motion.span
                  key={`${SCENES[sceneIndex].title}-${f.label}`}
                  initial={{ opacity: 0, y: 10, scale: 0.92 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: 0.15 + i * 0.08, duration: 0.5 }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/12 border border-white/25 backdrop-blur-md text-[13px] font-semibold text-white whitespace-nowrap"
                  style={{ boxShadow: '0 6px 16px rgba(0,0,0,0.18)' }}
                >
                  <Icon className="w-3.5 h-3.5" style={{ color: SCENES[sceneIndex].accent }} strokeWidth={2.4} />
                  {f.label}
                </motion.span>
              );
            })}
          </div>
        </div>

        {/* Scene progress dots */}
        <div className="flex items-center gap-2">
          {SCENES.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setSceneIndex(idx)}
              aria-label={`Go to ${SCENES[idx].title}`}
              data-testid={`scene-dot-${idx}`}
              className="group relative h-1.5 rounded-full overflow-hidden transition-all duration-500"
              style={{
                width: idx === sceneIndex ? 56 : 24,
                backgroundColor: idx === sceneIndex ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.25)',
              }}
            />
          ))}
        </div>
      </div>

      {/* Legacy fallback reference (not rendered) */}
      {false && <img src={ROOMS_IMG} alt="" style={{ display: 'none' }} />}

      {/* Right side: login form */}
      <div className="relative z-10 w-full lg:w-[460px] xl:w-[500px] flex flex-col items-center justify-center p-8 lg:p-12 bg-white border-l border-zinc-200/60">

        <div className="w-full max-w-[380px] flex flex-col items-center">
          {/* Logo — horizontally & vertically centered above the form */}
          <div className="mb-10 flex justify-center" data-testid="login-logo-wrapper">
            {logoUrl ? (
              <img src={logoUrl} alt={platformName} className="h-10 object-contain" data-testid="login-logo" />
            ) : (
              <span className="text-2xl font-bold text-zinc-900 tracking-tight" data-testid="login-logo-text">{platformName}</span>
            )}
          </div>

          <div className="w-full">
        {showForgotPassword ? (
          <>
            <button
              onClick={() => { setShowForgotPassword(false); setForgotSent(false); setForgotEmail(''); }}
              className="flex items-center gap-2 text-zinc-400 hover:text-zinc-800 mb-6 transition-colors"
              data-testid="forgot-back-btn"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to login
            </button>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-orange-500/10 rounded-xl">
                <Mail className="w-6 h-6 text-orange-500" />
              </div>
              <h2 className="text-2xl font-bold text-zinc-900">Forgot password</h2>
            </div>
            {!forgotSent ? (
              <>
                <p className="text-zinc-500 mb-8 text-sm">Enter your email address and we will send you a temporary password.</p>
                <form onSubmit={handleForgotPassword} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="forgot-email" className="text-zinc-700 text-sm font-medium">Email</Label>
                    <Input
                      id="forgot-email"
                      data-testid="forgot-email-input"
                      type="email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                      autoFocus
                      className="bg-black/[0.03] border-black/[0.08] text-zinc-900 placeholder:text-zinc-400 h-12 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500/30"
                    />
                  </div>
                  <Button
                    type="submit"
                    data-testid="forgot-submit-btn"
                    disabled={forgotLoading}
                className="w-full h-12 bg-[#dd0c51] hover:bg-[#c40a47] text-white font-semibold rounded-xl shadow-lg"
                  >
                    {forgotLoading ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Sending...</> : 'Send temporary password'}
                  </Button>
                </form>
              </>
            ) : (
              <div className="mt-6" data-testid="forgot-success-message">
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 text-center">
                  <Mail className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
                  <p className="text-emerald-700 font-medium mb-2">Email sent!</p>
                  <p className="text-zinc-500 text-sm">
                    If an account exists for <strong className="text-zinc-700">{forgotEmail}</strong>, a temporary password has been sent.
                  </p>
                </div>
                <Button
                  onClick={() => { setShowForgotPassword(false); setForgotSent(false); setForgotEmail(''); }}
                  className="w-full h-12 mt-4 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-xl"
                  data-testid="forgot-back-to-login-btn"
                >
                  Back to login
                </Button>
              </div>
            )}
          </>
        ) : !requires2FA ? (
          <>
            <h2 className="text-2xl font-bold text-zinc-900 mb-1">Welcome back</h2>
            <p className="text-zinc-500 mb-8 text-sm">Sign in to access your dashboard</p>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-zinc-700 text-sm font-medium">Email</Label>
                <Input
                  id="email"
                  data-testid="login-email-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="bg-black/[0.03] border-black/[0.08] text-zinc-900 placeholder:text-zinc-400 h-12 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500/30"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-zinc-700 text-sm font-medium">Password</Label>
                <Input
                  id="password"
                  data-testid="login-password-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="bg-black/[0.03] border-black/[0.08] text-zinc-900 placeholder:text-zinc-400 h-12 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500/30"
                />
              </div>
              <Button
                type="submit"
                data-testid="login-submit-btn"
                disabled={isLoading}
                className="w-full h-12 bg-[#dd0c51] hover:bg-[#c40a47] text-white font-semibold rounded-xl shadow-lg transition-all duration-200"
              >
                {isLoading ? 'Signing in...' : 'Sign in'}
              </Button>
              <button
                type="button"
                onClick={() => { setShowForgotPassword(true); setForgotEmail(email); }}
                className="w-full text-center text-sm text-zinc-400 hover:text-orange-500 transition-colors mt-1"
                data-testid="forgot-password-link"
              >
                Forgot password?
              </button>
            </form>
          </>
        ) : (
          <>
            <button
              onClick={handleBack}
              className="flex items-center gap-2 text-zinc-400 hover:text-zinc-800 mb-6 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-orange-500/10 rounded-xl">
                <Shield className="w-6 h-6 text-orange-500" />
              </div>
              <h2 className="text-2xl font-bold text-zinc-900">Two-factor authentication</h2>
            </div>
            <p className="text-zinc-500 mb-8 text-sm">
              {useBackupCode ? 'Enter one of your backup codes' : 'Enter the 6-digit code from your authenticator app'}
            </p>
            <form onSubmit={handleSubmit} className="space-y-5">
              {!useBackupCode ? (
                <div className="space-y-2">
                  <Label htmlFor="totp" className="text-zinc-700 text-sm font-medium">Authenticator code</Label>
                  <Input
                    id="totp"
                    data-testid="login-totp-input"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    required
                    autoFocus
                    className="bg-black/[0.03] border-black/[0.08] text-zinc-900 placeholder:text-zinc-400 h-12 text-center text-2xl tracking-[0.5em] font-mono rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500/30"
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="backup" className="text-zinc-700 text-sm font-medium">Backup code</Label>
                  <Input
                    id="backup"
                    data-testid="login-backup-input"
                    type="text"
                    value={backupCode}
                    onChange={(e) => setBackupCode(e.target.value.toUpperCase())}
                    placeholder="XXXX-XXXX"
                    required
                    autoFocus
                    className="bg-black/[0.03] border-black/[0.08] text-zinc-900 placeholder:text-zinc-400 h-12 text-center text-lg tracking-wider font-mono rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500/30"
                  />
                </div>
              )}
              <Button
                type="submit"
                data-testid="login-2fa-submit-btn"
                disabled={isLoading || (!useBackupCode && totpCode.length !== 6)}
                className="w-full h-12 bg-[#dd0c51] hover:bg-[#c40a47] text-white font-semibold rounded-xl shadow-lg transition-all duration-200"
              >
                {isLoading ? 'Verifying...' : 'Verify'}
              </Button>
              <button
                type="button"
                onClick={() => { setUseBackupCode(!useBackupCode); setTotpCode(''); setBackupCode(''); }}
                className="w-full text-center text-sm text-zinc-400 hover:text-zinc-800 transition-colors flex items-center justify-center gap-2"
              >
                <KeyRound className="w-4 h-4" />
                {useBackupCode ? 'Use authenticator code' : 'Use backup code'}
              </button>
            </form>
          </>
        )}
        </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
