import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { Shield, ArrowLeft, KeyRound, Mail, Loader2 } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

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
        toast.success('Welcome back!');
      }
    } catch (error) {
      const message = error.response?.data?.detail || 'Something went wrong';
      toast.error(message);
      
      // If 2FA code was wrong, don't reset the form
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
    <div className="min-h-screen bg-[#09090b] flex">
      {/* Left side - Hero */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        <div 
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: 'url(https://images.unsplash.com/photo-1654198340681-a2e0fc449f1b?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2OTV8MHwxfHNlYXJjaHwxfHxkYXJrJTIwcHVycGxlJTIwZ3JhZGllbnQlMjBhYnN0cmFjdCUyMHdhdmVzfGVufDB8fHx8MTc3MTExNTk5Mnww&ixlib=rb-4.1.0&q=85)',
            filter: 'brightness(0.6)'
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#09090b] via-transparent to-transparent" />
        <div className="relative z-10 flex flex-col justify-center px-12">
          <div className="mb-6">
            <span className="text-2xl font-bold text-white">Clara</span>
          </div>
          <h1 className="text-5xl font-black text-white leading-tight mb-4">
            Manage Your<br />
            <span className="text-orange-500">Network</span><br />
            With Ease
          </h1>
          <p className="text-zinc-400 text-lg max-w-md">
            The all-in-one dashboard for managing your sites, content, and broadcasts from a single place.
          </p>
        </div>
      </div>

      {/* Right side - Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
            <span className="text-xl font-bold text-white">Clara</span>
          </div>

          <div className="bg-[#18181b] border border-zinc-800 rounded-2xl p-8">
            {showForgotPassword ? (
              // Forgot Password View
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
                  <h2 className="text-2xl font-bold text-white">
                    Forgot password
                  </h2>
                </div>

                {!forgotSent ? (
                  <>
                    <p className="text-zinc-400 mb-8">
                      Enter your email address and we will send you a temporary password.
                    </p>
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
                          className="bg-[#27272a] border-zinc-700 text-white placeholder:text-zinc-500 h-12"
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
                        If an account exists for <strong className="text-zinc-300">{forgotEmail}</strong>, a temporary password has been sent. Check your inbox and use it to log in.
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
              // Step 1: Email & Password
              <>
                <h2 className="text-2xl font-bold text-white mb-2">
                  Welcome back
                </h2>
                <p className="text-zinc-400 mb-8">
                  Sign in to access your dashboard
                </p>

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
                      className="bg-[#27272a] border-zinc-700 text-white placeholder:text-zinc-500 h-12"
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
                      className="bg-[#27272a] border-zinc-700 text-white placeholder:text-zinc-500 h-12"
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
              // Step 2: 2FA Code
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
                  <h2 className="text-2xl font-bold text-white">
                    Two-factor authentication
                  </h2>
                </div>
                <p className="text-zinc-400 mb-8">
                  {useBackupCode 
                    ? 'Enter one of your backup codes'
                    : 'Enter the 6-digit code from your authenticator app'
                  }
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
                        className="bg-[#27272a] border-zinc-700 text-white placeholder:text-zinc-500 h-12 text-center text-2xl tracking-[0.5em] font-mono"
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
                        className="bg-[#27272a] border-zinc-700 text-white placeholder:text-zinc-500 h-12 text-center text-lg tracking-wider font-mono"
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
                    onClick={() => {
                      setUseBackupCode(!useBackupCode);
                      setTotpCode('');
                      setBackupCode('');
                    }}
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
      </div>
    </div>
  );
};

export default LoginPage;
