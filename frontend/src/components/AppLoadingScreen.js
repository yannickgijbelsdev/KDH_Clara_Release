import { useEffect, useState } from 'react';
import { Loader2, WifiOff } from 'lucide-react';

// Shown while Clara boots. Never stays silently blank: after a while it offers a retry.
export const AppLoadingScreen = ({ unreachable = false, onRetry }) => {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 10000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!unreachable || !onRetry) return undefined;
    const t = setInterval(onRetry, 15000);
    return () => clearInterval(t);
  }, [unreachable, onRetry]);

  const showHelp = unreachable || slow;
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F0F0F2] px-6" data-testid="app-loading-screen">
      <div className="flex flex-col items-center text-center">
        {unreachable ? <WifiOff className="h-8 w-8 text-zinc-400" /> : <Loader2 className="h-7 w-7 animate-spin text-[#7380b6]" />}
        {showHelp && (
          <div className="mt-4 max-w-sm" data-testid="app-loading-help">
            <p className="text-sm font-medium text-zinc-800">
              {unreachable ? 'Clara is temporarily unreachable' : 'Clara is taking longer than usual'}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              {unreachable ? 'We keep retrying automatically. You stay logged in.' : 'Hang on, or try again.'}
            </p>
            <button
              onClick={() => (onRetry ? onRetry() : window.location.reload())}
              className="mt-4 rounded-full bg-[#7380b6] px-5 py-2 text-sm font-medium text-white hover:bg-[#5f6ba3]"
              data-testid="app-loading-retry-btn"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
