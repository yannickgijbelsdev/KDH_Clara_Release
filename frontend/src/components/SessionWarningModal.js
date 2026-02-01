import { useAuth } from '../context/AuthContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './ui/dialog';
import { Button } from './ui/button';
import { Clock, LogOut } from 'lucide-react';

const SessionWarningModal = () => {
  const { showSessionWarning, sessionTimeLeft, logout, dismissSessionWarning } = useAuth();

  const formatTime = (seconds) => {
    if (!seconds || seconds <= 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Dialog open={showSessionWarning} onOpenChange={dismissSessionWarning}>
      <DialogContent className="bg-[#18181b] border-zinc-800 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Clock className="w-5 h-5 text-orange-500" />
            Session Expiring Soon
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Your session will expire in <span className="text-orange-500 font-bold">{formatTime(sessionTimeLeft)}</span>.
            You will be logged out automatically when the session expires.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4 text-center">
          <div className="w-24 h-24 rounded-full bg-orange-500/10 flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl font-bold text-orange-500">{formatTime(sessionTimeLeft)}</span>
          </div>
          <p className="text-sm text-zinc-400">
            To continue working, please save your work and log in again.
          </p>
        </div>
        
        <DialogFooter className="flex gap-2 sm:gap-0">
          <Button
            variant="ghost"
            onClick={dismissSessionWarning}
            className="text-zinc-400"
          >
            Dismiss
          </Button>
          <Button
            onClick={logout}
            className="bg-orange-500 hover:bg-orange-600"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Log Out Now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SessionWarningModal;
