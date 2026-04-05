import { useState, useEffect } from 'react';
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
  const { login } = useAuth();
  const { branding } = useBranding();

  const platformName = branding.platform_name || 'Clara';
  const logoUrl = branding.logo_type === 'image' && branding.logo_url ? resolveUrl(branding.logo_url) : null;

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

  const STUDIO_IMG = 'https://static.prod-images.emergentagent.com/jobs/701f0662-a1b9-4b1a-b3cd-31d39c15bdb0/images/9c133714c33f42124837a555a90289699f0f5190e464c69e21122133740a9121.png';

  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden bg-[#F0F0F2] px-5 py-10" data-testid="login-page">
      {/* Subtle dot pattern */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle, #999 0.5px, transparent 0.5px)',
          backgroundSize: '24px 24px',
        }}
      />

      {/* Central studio image */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div
          className="w-[70%] max-w-[900px] h-[80%] bg-contain bg-center bg-no-repeat opacity-[0.18]"
          style={{ backgroundImage: `url(${STUDIO_IMG})` }}
        />
      </div>

      {/* Soft radial fade */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at center, transparent 20%, #F0F0F2 70%)' }}
      />

      {/* Logo */}
      <div className="relative z-10 mb-8 text-center">
        {logoUrl ? (
          <img src={logoUrl} alt={platformName} className="h-10 object-contain mx-auto" data-testid="login-logo" />
        ) : (
          <div className="flex items-center justify-center gap-3" data-testid="login-logo-text">
            <span className="text-2xl font-bold text-zinc-800 tracking-tight">{platformName}</span>
          </div>
        )}
      </div>

      {/* Login Card */}
      <div
        className="relative z-10 w-full max-w-[420px] bg-white/80 backdrop-blur-2xl border border-black/[0.06] rounded-[20px] shadow-[0_8px_40px_rgba(0,0,0,0.08)] p-8"
        data-testid="login-card"
      >
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
                    className="w-full h-12 bg-zinc-900 hover:bg-zinc-100 text-white font-semibold rounded-xl shadow-lg"
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
                className="w-full h-12 bg-zinc-900 hover:bg-zinc-100 text-white font-semibold rounded-xl shadow-lg transition-all duration-200"
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
                className="w-full h-12 bg-zinc-900 hover:bg-zinc-100 text-white font-semibold rounded-xl shadow-lg transition-all duration-200"
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
  );
};

export default LoginPage;
