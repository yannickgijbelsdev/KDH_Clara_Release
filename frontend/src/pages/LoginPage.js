import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      await login(email, password);
      toast.success('Welcome back!');
    } catch (error) {
      const message = error.response?.data?.detail || 'Something went wrong';
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
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
                {isLoading ? 'Please wait...' : 'Sign In'}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
