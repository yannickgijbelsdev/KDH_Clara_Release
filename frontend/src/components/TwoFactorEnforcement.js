import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './ui/dialog';
import { Button } from './ui/button';
import { Shield, ShieldAlert, ChevronRight } from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';
import TwoFactorSetup from './TwoFactorSetup';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const MAX_SKIPS = 3;

const TwoFactorEnforcement = ({ user, onComplete, onSkipped }) => {
  const [showSetup, setShowSetup] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const skipCount = user?.totp_skip_count || 0;
  const canSkip = skipCount < MAX_SKIPS;
  const skipsRemaining = MAX_SKIPS - skipCount;

  if (!user || user.totp_enabled) return null;

  const handleSkip = async () => {
    setSkipping(true);
    try {
      await axios.post(`${API}/auth/2fa/skip`);
      onSkipped?.();
    } catch (error) {
      toast.error('Could not skip 2FA setup');
    } finally {
      setSkipping(false);
    }
  };

  const handleSetupComplete = () => {
    setShowSetup(false);
    onComplete?.();
  };

  if (showSetup) {
    return (
      <Dialog open={true} onOpenChange={() => {}}>
        <DialogContent
          className="bg-white border-zinc-200 max-w-lg"
          data-testid="2fa-setup-dialog"
          hideClose
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-emerald-500" />
              Set up two-factor authentication
            </DialogTitle>
          </DialogHeader>
          <TwoFactorSetup user={user} onUpdate={handleSetupComplete} />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={true} onOpenChange={() => {}}>
      <DialogContent
        className="bg-white border-zinc-200 max-w-md"
        data-testid="2fa-enforcement-dialog"
        hideClose
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="flex items-center justify-center mb-4">
            <div className="w-16 h-16 rounded-full bg-orange-500/10 flex items-center justify-center">
              <ShieldAlert className="w-8 h-8 text-orange-400" />
            </div>
          </div>
          <DialogTitle className="text-center text-xl">
            {canSkip ? 'Secure your account' : 'Two-factor authentication required'}
          </DialogTitle>
          <DialogDescription className="text-center mt-2">
            {canSkip
              ? 'Enable two-factor authentication to protect your account. You can use an authenticator app like Google Authenticator or Authy.'
              : 'For the security of your account, two-factor authentication is now required. Please set it up to continue.'
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          <Button
            onClick={() => setShowSetup(true)}
            className="w-full h-12 bg-orange-500 hover:bg-orange-600 text-white font-semibold gap-2"
            data-testid="2fa-setup-btn"
          >
            <Shield className="w-4 h-4" />
            Set up 2FA now
            <ChevronRight className="w-4 h-4 ml-auto" />
          </Button>

          {canSkip && (
            <Button
              variant="ghost"
              onClick={handleSkip}
              disabled={skipping}
              className="w-full h-10 text-zinc-400 hover:text-zinc-200"
              data-testid="2fa-skip-btn"
            >
              {skipping ? 'Skipping...' : `Skip for now (${skipsRemaining} ${skipsRemaining === 1 ? 'time' : 'times'} remaining)`}
            </Button>
          )}

          {!canSkip && (
            <p className="text-center text-xs text-red-400/80">
              You have skipped the maximum number of times. 2FA setup is now mandatory.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TwoFactorEnforcement;
