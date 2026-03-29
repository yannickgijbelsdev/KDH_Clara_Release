import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Download, Smartphone, Share, MoreVertical } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

function getBrowserInfo() {
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
  const isChrome = /chrome/i.test(ua) && !/edge|edg/i.test(ua);
  const isEdge = /edg/i.test(ua);
  const isFirefox = /firefox/i.test(ua);
  const isAndroid = /android/i.test(ua);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  return { isIOS, isSafari, isChrome, isEdge, isFirefox, isAndroid, isStandalone };
}

const PwaInstallPrompt = () => {
  const { user, updateUserPreferences } = useAuth();
  const [show, setShow] = useState(false);
  const deferredPrompt = useRef(null);
  const browser = useRef(getBrowserInfo());

  // Capture native install prompt when available
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      deferredPrompt.current = e;
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // Show prompt after login if user hasn't disabled it
  useEffect(() => {
    if (!user) return;
    if (browser.current.isStandalone) return; // Already installed
    // Check user preference (default: show)
    const prefDisabled = user.preferences?.show_pwa_prompt === false;
    if (prefDisabled) return;

    const timer = setTimeout(() => setShow(true), 3000);
    return () => clearTimeout(timer);
  }, [user]);

  const handleInstall = useCallback(async () => {
    if (deferredPrompt.current) {
      deferredPrompt.current.prompt();
      const { outcome } = await deferredPrompt.current.userChoice;
      deferredPrompt.current = null;
      if (outcome === 'accepted') handleDismiss();
      else setShow(false);
    }
  }, []);

  const handleDismiss = useCallback(() => {
    setShow(false);
    // Save preference so it doesn't show again
    if (updateUserPreferences) {
      updateUserPreferences({ show_pwa_prompt: false });
    }
    // Also save via API
    try {
      const API = process.env.REACT_APP_BACKEND_URL;
      fetch(`${API}/api/users/me/preferences`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ show_pwa_prompt: false }),
      });
    } catch { /* ignore */ }
  }, [updateUserPreferences]);

  if (!show) return null;

  const { isIOS, isSafari, isChrome, isEdge, isAndroid } = browser.current;
  const hasNativePrompt = !!deferredPrompt.current;

  return (
    <div data-testid="pwa-install-prompt" className="fixed bottom-6 right-6 z-[9999] w-[360px] animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="relative bg-zinc-900 border border-zinc-700/60 rounded-xl shadow-2xl shadow-black/40 p-5">
        <button data-testid="pwa-install-dismiss" onClick={handleDismiss} className="absolute top-3 right-3 text-zinc-500 hover:text-zinc-300 transition-colors">
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-start gap-3 mb-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
            <Smartphone className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">Install Clara as an App</h3>
            <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
              Quick access from your home screen with a native app experience.
            </p>
          </div>
        </div>

        {/* Browser-specific instructions */}
        {hasNativePrompt ? (
          <div className="flex items-center gap-2 mt-4">
            <button data-testid="pwa-install-btn" onClick={handleInstall} className="flex-1 flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-400 text-white text-sm font-medium rounded-lg px-4 py-2.5 transition-colors">
              <Download className="w-4 h-4" />
              Install Now
            </button>
            <button data-testid="pwa-install-later" onClick={() => setShow(false)} className="px-3 py-2.5 text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
              Later
            </button>
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {(isIOS || isSafari) && (
              <div className="flex items-start gap-2 bg-zinc-800/50 rounded-lg p-3 text-xs text-zinc-300">
                <Share className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-medium text-zinc-100">Safari:</span> Tap the <span className="font-medium text-orange-400">Share</span> button, then <span className="font-medium text-orange-400">"Add to Home Screen"</span>
                </div>
              </div>
            )}
            {(isChrome || isEdge) && !isIOS && (
              <div className="flex items-start gap-2 bg-zinc-800/50 rounded-lg p-3 text-xs text-zinc-300">
                <MoreVertical className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-medium text-zinc-100">{isEdge ? 'Edge' : 'Chrome'}:</span> Tap <span className="font-medium text-orange-400">{isAndroid ? 'menu (three dots)' : 'the install icon in the address bar'}</span>, then <span className="font-medium text-orange-400">"Install app"</span>
                </div>
              </div>
            )}
            {!isIOS && !isSafari && !isChrome && !isEdge && (
              <div className="flex items-start gap-2 bg-zinc-800/50 rounded-lg p-3 text-xs text-zinc-300">
                <Download className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5" />
                <div>Open Clara in <span className="font-medium text-orange-400">Chrome</span> or <span className="font-medium text-orange-400">Edge</span> for the best install experience.</div>
              </div>
            )}
          </div>
        )}

        <div className="mt-3 flex items-center justify-between">
          <button data-testid="pwa-install-dont-show" onClick={handleDismiss} className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors">
            Don't show again
          </button>
          <span className="text-[10px] text-zinc-600">Settings &gt; Personal Settings</span>
        </div>
      </div>
    </div>
  );
};

export default PwaInstallPrompt;
