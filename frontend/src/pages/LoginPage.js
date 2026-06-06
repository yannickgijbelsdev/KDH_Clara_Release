/* eslint-disable */
import { useState, useRef, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { Shield, ArrowLeft, KeyRound, Mail, Loader2, Radio, Code2, Newspaper, Cloud, Calendar, Sparkles, Globe, BarChart3, Activity, Mic2, Server, Shield as ShieldIcon, Gauge, Waves, ListChecks, FileCheck2, Lock, Search, Wand2, HeartPulse, FileText } from 'lucide-react';
import { getRedirectParam, createExchangeToken, buildAppRedirectUrl, fetchSubdomainConfig } from '../services/subdomainAuth';

const API = process.env.REACT_APP_BACKEND_URL;

const resolveUrl = (url) => {
  if (!url) return null;
  return url.startsWith('/') ? `${API}${url}` : url;
};

const ROOMS_IMG = '/images/clara_rooms.png'; // legacy hero fallback — kept for reference

import { Layers } from 'lucide-react';

// Static brand background — CLR stripes on white
const BRAND_BG = '/koodh_clr_stripes.png';

// Feature speech bubbles that pop up at fixed positions on the brand background.
// Each bubble has a position (% from left/top) and a short description.
const FEATURE_BUBBLES = [
  { icon: Radio,      title: 'Radio Management',     desc: 'Live shows, RDS builder, stream monitor & scheduling — all in one place.',  top: '10%', left: '6%',  accent: '#dd0c51' },
  { icon: Calendar,   title: 'Smart Scheduling',     desc: 'Clara Tasks with Google Calendar sync, approval flows & a kanban board.', top: '8%',  left: '40%', accent: '#7c1ac8' },
  { icon: Waves,      title: 'RDS Builder',          desc: 'Compose station name, PS, RT+ and traffic flags — pushed live to your encoder.', top: '24%', left: '64%', accent: '#ef4444' },
  { icon: FileText,   title: 'Content Library',      desc: 'Articles, social posts and shows in one editorial workspace with audit trails.', top: '36%', left: '8%', accent: '#0ea5e9' },
  { icon: Sparkles,   title: 'AI-Powered Insights',  desc: 'Clara Scan, auto-fix, health reports and predictive analytics.',          top: '38%', left: '46%', accent: '#10b981' },
  { icon: Cloud,      title: 'Multi-Site Hosting',   desc: 'Custom domains, automatic DNS + SSL and managed deployments.',   top: '54%', left: '70%', accent: '#0284c7' },
  { icon: Globe,      title: 'Clara Custom',         desc: 'Connect external sites and push content from Clara via auto-detected APIs.', top: '62%', left: '12%', accent: '#f59e0b' },
  { icon: ListChecks, title: 'Team Collaboration',   desc: 'Roles, approval workflows and team chat right next to your work.',         top: '70%', left: '42%', accent: '#a855f7' },
  { icon: BarChart3,  title: 'Analytics & KPIs',     desc: 'Audience trends, content reach and listener engagement at a glance.',     top: '78%', left: '68%', accent: '#14b8a6' },
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

  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const rafRef = useRef(null);
  const { login } = useAuth();
  const { branding } = useBranding();

  const platformName = branding.platform_name || 'Koodh Clara';
  const logoUrl = branding.logo_type === 'image' && branding.logo_url ? resolveUrl(branding.logo_url) : '/koodh_clara_logo.png';

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
      {/* Fullscreen brand background — CLR stripes on white */}
      <div className="absolute inset-0 z-0 overflow-hidden bg-white" data-testid="login-hero-rooms">
        <img
          src={BRAND_BG}
          alt=""
          className="w-full h-full select-none"
          draggable={false}
          style={{
            objectFit: 'cover',
            objectPosition: '50% 50%',
            transform: `scale(1.02) translate3d(${mousePos.x * -10}px, ${mousePos.y * -7}px, 0)`,
            transition: 'transform 0.4s cubic-bezier(0.25, 0.1, 0.25, 1)',
          }}
        />
      </div>

      {/* Popping feature bubbles overlaid on the brand background — all shown together with gentle float */}
      <div className="hidden lg:block absolute inset-0 z-10 pointer-events-none">
        {FEATURE_BUBBLES.map((b, idx) => {
          const Icon = b.icon;
          return (
            <motion.div
              key={b.title}
              initial={{ opacity: 0, y: 12, scale: 0.94 }}
              animate={{ opacity: 1, y: [0, -6, 0], scale: 1 }}
              transition={{
                opacity: { duration: 0.6, delay: idx * 0.18, ease: 'easeOut' },
                scale:   { duration: 0.6, delay: idx * 0.18, ease: 'easeOut' },
                y:       { duration: 4 + idx * 0.4, repeat: Infinity, ease: 'easeInOut', delay: idx * 0.3 },
              }}
              className="absolute max-w-[280px] pointer-events-auto"
              style={{ top: b.top, left: b.left, willChange: 'opacity, transform' }}
            >
              <div className="relative bg-white/95 backdrop-blur-md rounded-2xl border border-zinc-200 px-4 py-3 shadow-[0_12px_32px_rgba(0,0,0,0.12)]">
                <div className="flex items-start gap-3">
                  <span
                    className="inline-flex items-center justify-center w-8 h-8 rounded-xl flex-shrink-0"
                    style={{ backgroundColor: `${b.accent}15`, color: b.accent }}
                  >
                    <Icon className="w-4 h-4" strokeWidth={2.4} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold text-zinc-900 leading-tight">{b.title}</p>
                    <p className="text-[11px] text-zinc-600 leading-snug mt-1">{b.desc}</p>
                  </div>
                </div>
                {/* Speech-bubble tail */}
                <div className="absolute -bottom-2 left-6 w-3 h-3 rotate-45 bg-white/95 border-r border-b border-zinc-200" />
              </div>
            </motion.div>
          );
        })}
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
