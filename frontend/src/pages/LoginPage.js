import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { Shield, ArrowLeft, KeyRound } from 'lucide-react';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [backupCode, setBackupCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [requires2FA, setRequires2FA] = useState(false);
  const [useBackupCode, setUseBackupCode] = useState(false);
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
        toast.info('Voer je 2FA code in');
      } else {
        toast.success('Welkom terug!');
      }
    } catch (error) {
      const message = error.response?.data?.detail || 'Er is iets misgegaan';
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
            {!requires2FA ? (
              // Step 1: Email & Password
              <>
                <h2 className="text-2xl font-bold text-white mb-2">
                  Welkom terug
                </h2>
                <p className="text-zinc-400 mb-8">
                  Log in om toegang te krijgen tot je dashboard
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
                      placeholder="jij@voorbeeld.nl"
                      required
                      className="bg-[#27272a] border-zinc-700 text-white placeholder:text-zinc-500 h-12"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-zinc-300">Wachtwoord</Label>
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
                    {isLoading ? 'Even geduld...' : 'Inloggen'}
                  </Button>
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
                  Terug
                </button>

                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-orange-500/10 rounded-lg">
                    <Shield className="w-6 h-6 text-orange-500" />
                  </div>
                  <h2 className="text-2xl font-bold text-white">
                    Twee-factor authenticatie
                  </h2>
                </div>
                <p className="text-zinc-400 mb-8">
                  {useBackupCode 
                    ? 'Voer een van je backup codes in'
                    : 'Voer de 6-cijferige code in van je authenticator app'
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
                    {isLoading ? 'Verifiëren...' : 'Verifiëren'}
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
                    {useBackupCode ? 'Authenticator code gebruiken' : 'Backup code gebruiken'}
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
