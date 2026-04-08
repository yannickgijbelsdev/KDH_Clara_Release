import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../ui/button';
import { toast } from 'sonner';
import { KeyRound, Loader2, ShieldAlert } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

export default function ForcePasswordChangeModal() {
  const { user, token, logout } = useAuth();
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!user?.force_password_change) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (newPw.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (newPw !== confirmPw) { setError('Passwords do not match'); return; }

    setSaving(true);
    try {
      const res = await fetch(`${API}/api/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ current_password: currentPw, new_password: newPw }),
      });
      if (res.ok) {
        toast.success('Password changed! Please log in again.');
        logout();
      } else {
        const d = await res.json().catch(() => ({}));
        setError(d.detail || 'Failed to change password');
      }
    } catch {
      setError('Connection error');
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center" data-testid="force-password-modal">
      <div className="bg-white/80 backdrop-blur rounded-2xl border border-zinc-200 p-8 w-full max-w-md shadow-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center">
            <ShieldAlert className="w-6 h-6 text-red-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Password Change Required</h2>
            <p className="text-sm text-zinc-500">An administrator has required you to change your password.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Current Password</label>
            <input
              type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)}
              className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-4 py-3 text-sm text-zinc-900 focus:outline-none focus:border-orange-500"
              required autoFocus data-testid="current-password-input"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">New Password</label>
            <input
              type="password" value={newPw} onChange={e => setNewPw(e.target.value)}
              className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-4 py-3 text-sm text-zinc-900 focus:outline-none focus:border-orange-500"
              required minLength={8} data-testid="new-password-input"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Confirm New Password</label>
            <input
              type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
              className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-4 py-3 text-sm text-zinc-900 focus:outline-none focus:border-orange-500"
              required data-testid="confirm-password-input"
            />
          </div>

          {error && <p className="text-sm text-red-400" data-testid="password-error">{error}</p>}

          <Button type="submit" disabled={saving} className="w-full bg-red-600 hover:bg-red-700 h-12" data-testid="change-password-btn">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <KeyRound className="w-4 h-4 mr-2" />}
            Change Password
          </Button>
        </form>
      </div>
    </div>
  );
}
