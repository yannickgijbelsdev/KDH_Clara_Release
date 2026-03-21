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
      const message = error.response?.data?.detail || 'Something went wrong';
      toast.error(message);
      if (!error.response?.data?.detail?.includes('2FA')) {
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

  return (
    <div className="login-page">
      <style>{`
        .login-page {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          position: relative;
          overflow: hidden;
          padding: 2rem;
        }
        .login-page::before {
          content: '';
          position: absolute;
          inset: -50%;
          width: 200%;
          height: 200%;
          background: linear-gradient(
            135deg,
            #1a0800 0%,
            #4a1d00 15%,
            #7a3000 25%,
            #a54200 35%,
            #c75200 45%,
            #a54200 55%,
            #7a3000 65%,
            #4a1d00 75%,
            #7a3000 85%,
            #a54200 100%
          );
          animation: gradientDrift 20s ease-in-out infinite alternate;
          z-index: 0;
        }
        .login-page::after {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(
            ellipse at 30% 50%,
            rgba(249, 115, 22, 0.12) 0%,
            transparent 60%
          );
          animation: glowPulse 8s ease-in-out infinite alternate;
          z-index: 1;
        }
        @keyframes gradientDrift {
          0% { transform: translate(0%, 0%) rotate(0deg); }
          25% { transform: translate(-3%, 2%) rotate(0.5deg); }
          50% { transform: translate(2%, -2%) rotate(-0.3deg); }
          75% { transform: translate(-1%, 3%) rotate(0.2deg); }
          100% { transform: translate(3%, -1%) rotate(-0.5deg); }
        }
        @keyframes glowPulse {
          0% { opacity: 0.6; }
          100% { opacity: 1; }
        }
        .login-card {
          position: relative;
          z-index: 10;
          width: 100%;
          max-width: 420px;
          background: rgba(10, 10, 12, 0.75);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border: 1px solid rgba(255, 160, 60, 0.1);
          border-radius: 1rem;
          padding: 2.5rem;
          box-shadow: 0 0 80px rgba(0,0,0,0.5);
        }
        .login-logo-wrap {
          position: relative;
          z-index: 10;
          text-align: center;
          margin-bottom: 1.5rem;
        }
      `}</style>

      <div className="login-logo-wrap">
        {logoUrl ? (
          <img src={logoUrl} alt={platformName} className="h-10 object-contain mx-auto mb-4" data-testid="login-logo" />
        ) : (
          <span className="text-3xl font-bold text-white block mb-4" data-testid="login-logo-text">{platformName}</span>
        )}
      </div>

      <div className="login-card" data-testid="login-card">
        {showForgotPassword ? (
          <>
            <button
              onClick={() => { setShowForgotPassword(false); setForgotSent(false); setForgotEmail(''); }}
              className="flex items-center gap-2 text-zinc-400 hover:text-white mb-6 transition-colors"
              data-testid="forgot-back-btn"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to login
            </button>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-orange-500/10 rounded-lg">
                <Mail className="w-6 h-6 text-orange-500" />
              </div>
              <h2 className="text-2xl font-bold text-white">Forgot password</h2>
            </div>
            {!forgotSent ? (
              <>
                <p className="text-zinc-400 mb-8">Enter your email address and we will send you a temporary password.</p>
                <form onSubmit={handleForgotPassword} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="forgot-email" className="text-zinc-300">Email</Label>
                    <Input
                      id="forgot-email"
                      data-testid="forgot-email-input"
                      type="email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                      autoFocus
                      className="bg-white/5 border-white/10 text-white placeholder:text-zinc-500 h-12"
                    />
                  </div>
                  <Button
                    type="submit"
                    data-testid="forgot-submit-btn"
                    disabled={forgotLoading}
                    className="w-full h-12 bg-orange-500 hover:bg-orange-600 text-white font-semibold shadow-lg shadow-orange-500/20"
                  >
                    {forgotLoading ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Sending...</> : 'Send temporary password'}
                  </Button>
                </form>
              </>
            ) : (
              <div className="mt-6" data-testid="forgot-success-message">
                <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-6 text-center">
                  <Mail className="w-10 h-10 text-green-400 mx-auto mb-3" />
                  <p className="text-green-300 font-medium mb-2">Email sent!</p>
                  <p className="text-zinc-400 text-sm">
                    If an account exists for <strong className="text-zinc-300">{forgotEmail}</strong>, a temporary password has been sent.
                  </p>
                </div>
                <Button
                  onClick={() => { setShowForgotPassword(false); setForgotSent(false); setForgotEmail(''); }}
                  className="w-full h-12 mt-4 bg-zinc-800 hover:bg-zinc-700 text-white"
                  data-testid="forgot-back-to-login-btn"
                >
                  Back to login
                </Button>
              </div>
            )}
          </>
        ) : !requires2FA ? (
          <>
            <h2 className="text-2xl font-bold text-white mb-2">Welcome back</h2>
            <p className="text-zinc-400 mb-8">Sign in to access your dashboard</p>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-zinc-300">Email</Label>
                <Input
                  id="email"
                  data-testid="login-email-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="bg-white/5 border-white/10 text-white placeholder:text-zinc-500 h-12"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-zinc-300">Password</Label>
                <Input
                  id="password"
                  data-testid="login-password-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="bg-white/5 border-white/10 text-white placeholder:text-zinc-500 h-12"
                />
              </div>
              <Button
                type="submit"
                data-testid="login-submit-btn"
                disabled={isLoading}
                className="w-full h-12 bg-orange-500 hover:bg-orange-600 text-white font-semibold shadow-lg shadow-orange-500/20"
              >
                {isLoading ? 'Signing in...' : 'Sign in'}
              </Button>
              <button
                type="button"
                onClick={() => { setShowForgotPassword(true); setForgotEmail(email); }}
                className="w-full text-center text-sm text-zinc-400 hover:text-orange-400 transition-colors mt-1"
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
              className="flex items-center gap-2 text-zinc-400 hover:text-white mb-6 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-orange-500/10 rounded-lg">
                <Shield className="w-6 h-6 text-orange-500" />
              </div>
              <h2 className="text-2xl font-bold text-white">Two-factor authentication</h2>
            </div>
            <p className="text-zinc-400 mb-8">
              {useBackupCode ? 'Enter one of your backup codes' : 'Enter the 6-digit code from your authenticator app'}
            </p>
            <form onSubmit={handleSubmit} className="space-y-5">
              {!useBackupCode ? (
                <div className="space-y-2">
                  <Label htmlFor="totp" className="text-zinc-300">Authenticator code</Label>
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
                    className="bg-white/5 border-white/10 text-white placeholder:text-zinc-500 h-12 text-center text-2xl tracking-[0.5em] font-mono"
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="backup" className="text-zinc-300">Backup code</Label>
                  <Input
                    id="backup"
                    data-testid="login-backup-input"
                    type="text"
                    value={backupCode}
                    onChange={(e) => setBackupCode(e.target.value.toUpperCase())}
                    placeholder="XXXX-XXXX"
                    required
                    autoFocus
                    className="bg-white/5 border-white/10 text-white placeholder:text-zinc-500 h-12 text-center text-lg tracking-wider font-mono"
                  />
                </div>
              )}
              <Button
                type="submit"
                data-testid="login-2fa-submit-btn"
                disabled={isLoading || (!useBackupCode && totpCode.length !== 6)}
                className="w-full h-12 bg-orange-500 hover:bg-orange-600 text-white font-semibold shadow-lg shadow-orange-500/20"
              >
                {isLoading ? 'Verifying...' : 'Verify'}
              </Button>
              <button
                type="button"
                onClick={() => { setUseBackupCode(!useBackupCode); setTotpCode(''); setBackupCode(''); }}
                className="w-full text-center text-sm text-zinc-400 hover:text-white transition-colors flex items-center justify-center gap-2"
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
