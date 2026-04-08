import { useState, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { Shield, ArrowLeft, KeyRound, Mail, Loader2 } from 'lucide-react';
import { getRedirectParam, createExchangeToken, buildAppRedirectUrl, fetchSubdomainConfig } from '../services/subdomainAuth';

const API = process.env.REACT_APP_BACKEND_URL;

const resolveUrl = (url) => {
  if (!url) return null;
  return url.startsWith('/') ? `${API}${url}` : url;
};

const ROOMS_IMG = '/images/clara_rooms.jpg';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [backupCode, setBackupCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [requires2FA, setRequires2FA] = useState(false);
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
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
  const imgX = mousePos.x * 18;
  const imgY = mousePos.y * 12;
  const imgRotateY = mousePos.x * 3;
  const imgRotateX = -mousePos.y * 2;

  return (
    <div
      className="min-h-screen flex relative overflow-hidden bg-[#f5f2ed]"
      onMouseMove={handleMouseMove}
      data-testid="login-page"
    >
      {/* Subtle radial glow */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 70% 60% at 35% 50%, rgba(245,200,120,0.10) 0%, transparent 70%)'
      }} />

      {/* Left side: floating rooms & tagline */}
      <div className="hidden lg:flex flex-col justify-between relative z-10 flex-1 p-12 xl:p-16">
        <div>
          {logoUrl ? (
            <img src={logoUrl} alt={platformName} className="h-9 object-contain" data-testid="login-logo" />
          ) : (
            <span className="text-2xl font-bold text-zinc-800 tracking-tight" data-testid="login-logo-text">{platformName}</span>
          )}
        </div>

        {/* Floating rooms with parallax */}
        <div className="flex flex-col items-center flex-1 justify-center" style={{ perspective: '1200px' }}>
          <div
            className="w-full flex items-center justify-center"
            style={{
              transform: `translate3d(${imgX}px, ${imgY}px, 0) rotateY(${imgRotateY}deg) rotateX(${imgRotateX}deg)`,
              transition: 'transform 0.15s cubic-bezier(0.25, 0.1, 0.25, 1)',
              willChange: 'transform',
            }}
          >
            <img
              src={ROOMS_IMG}
              alt="Clara Platform — Radio & Data Intelligence"
              className="w-[90%] max-w-[1100px] object-contain select-none"
              draggable={false}
              style={{ mixBlendMode: 'multiply' }}
              data-testid="login-hero-rooms"
            />
          </div>
          <div
            className="text-center mt-4 max-w-lg"
            style={{
              transform: `translate3d(${mousePos.x * 6}px, ${mousePos.y * 4}px, 0)`,
              transition: 'transform 0.2s ease-out',
            }}
          >
            <h1 className="text-2xl xl:text-3xl font-bold text-zinc-800 leading-tight mb-1">
              Data intelligence for media & radio
            </h1>
            <p className="text-sm text-zinc-500 leading-relaxed">
              Collect, manage, and distribute data across your radio stations,
              WordPress sites, and business operations.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-8 text-sm text-zinc-400">
          <span>Radio Management</span>
          <span className="w-1 h-1 rounded-full bg-zinc-300" />
          <span>Content Publishing</span>
          <span className="w-1 h-1 rounded-full bg-zinc-300" />
          <span>Data Analytics</span>
        </div>
      </div>

      {/* Right side: login form */}
      <div className="relative z-10 w-full lg:w-[460px] xl:w-[500px] flex flex-col items-center justify-center p-8 lg:p-12 bg-white/80 backdrop-blur-2xl border-l border-zinc-200/40">
        {/* Mobile logo & rooms */}
        <div className="lg:hidden mb-8 text-center">
          {logoUrl ? (
            <img src={logoUrl} alt={platformName} className="h-8 object-contain mx-auto mb-4" />
          ) : (
            <span className="text-xl font-bold text-zinc-800 tracking-tight">{platformName}</span>
          )}
          <img src={ROOMS_IMG} alt="Clara Platform" className="w-52 mx-auto mt-2 mb-2 object-contain" />
        </div>

        <div className="w-full max-w-[380px]">
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
                    className="w-full h-12 bg-zinc-900 hover:bg-zinc-800 text-white font-semibold rounded-xl shadow-lg"
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
                className="w-full h-12 bg-zinc-900 hover:bg-zinc-800 text-white font-semibold rounded-xl shadow-lg transition-all duration-200"
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
                className="w-full h-12 bg-zinc-900 hover:bg-zinc-800 text-white font-semibold rounded-xl shadow-lg transition-all duration-200"
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
  );
};

export default LoginPage;
