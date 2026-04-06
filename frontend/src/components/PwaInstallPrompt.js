import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Download, Smartphone, Share, MoreVertical } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

function getBrowserInfo() {
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
  const isChrome = /chrome/i.test(ua) && !/edge|edg/i.test(ua);
  const isEdge = /edg/i.test(ua);
  const isAndroid = /android/i.test(ua);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  return { isIOS, isSafari, isChrome, isEdge, isAndroid, isStandalone };
}

const PwaInstallPrompt = () => {
  const { user, updateUserPreferences } = useAuth();
  const [show, setShow] = useState(false);
  const deferredPrompt = useRef(null);
  const browser = useRef(getBrowserInfo());

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      deferredPrompt.current = e;
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  useEffect(() => {
    if (!user) return;
    if (browser.current.isStandalone) return;
    if (user.preferences?.show_pwa_prompt === false) return;
    const timer = setTimeout(() => setShow(true), 3000);
    return () => clearTimeout(timer);
  }, [user]);

  const handleInstall = useCallback(async () => {
    if (deferredPrompt.current) {
      deferredPrompt.current.prompt();
      const { outcome } = await deferredPrompt.current.userChoice;
      deferredPrompt.current = null;
      if (outcome === 'accepted') saveDismiss();
      else setShow(false);
    }
  }, []);

  const saveDismiss = useCallback(() => {
    setShow(false);
    if (updateUserPreferences) updateUserPreferences({ show_pwa_prompt: false });
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
    <div data-testid="pwa-install-prompt" className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md mx-4 bg-white border border-zinc-200 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header accent */}
        <div className="h-1 bg-gradient-to-r from-orange-500 via-amber-500 to-orange-500" />

        <div className="p-6">
          {/* Close */}
          <button data-testid="pwa-install-dismiss" onClick={() => setShow(false)} className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-600 transition-colors">
            <X className="w-5 h-5" />
          </button>

          {/* Icon + Title */}
          <div className="flex flex-col items-center text-center mb-5">
            <div className="w-16 h-16 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mb-4">
              <Smartphone className="w-8 h-8 text-orange-400" />
            </div>
            <h2 className="text-lg font-bold text-zinc-900">Install Clara as an App</h2>
            <p className="text-sm text-zinc-400 mt-1.5 max-w-xs leading-relaxed">
              Get quick access from your home screen with a native app experience.
            </p>
          </div>

          {/* Install button (always visible) */}
          <button
            data-testid="pwa-install-btn"
            onClick={hasNativePrompt ? handleInstall : undefined}
            disabled={!hasNativePrompt}
            className={`w-full flex items-center justify-center gap-2.5 text-sm font-semibold rounded-xl px-5 py-3 transition-colors mb-4 ${
              hasNativePrompt
                ? 'bg-orange-500 hover:bg-orange-400 text-white cursor-pointer'
                : 'bg-zinc-100 text-zinc-400 cursor-not-allowed'
            }`}
          >
            <Download className="w-5 h-5" />
            {hasNativePrompt ? 'Install Now' : 'Use the browser menu to install'}
          </button>

          {/* Browser-specific instructions */}
          {!hasNativePrompt && (
            <div className="space-y-2 mb-4">
              {(isIOS || isSafari) && (
                <div className="flex items-start gap-3 bg-zinc-50 rounded-xl p-3.5">
                  <Share className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-zinc-600">
                    <span className="font-semibold text-zinc-900">Safari: </span>
                    Tap the <span className="text-orange-400 font-medium">Share</span> button in the toolbar, then select <span className="text-orange-400 font-medium">"Add to Home Screen"</span>
                  </div>
                </div>
              )}
              {(isChrome || isEdge) && !isIOS && (
                <div className="flex items-start gap-3 bg-zinc-50 rounded-xl p-3.5">
                  <MoreVertical className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-zinc-600">
                    <span className="font-semibold text-zinc-900">{isEdge ? 'Edge' : 'Chrome'}: </span>
                    Tap <span className="text-orange-400 font-medium">{isAndroid ? 'the menu (three dots)' : 'the install icon in the address bar'}</span>, then select <span className="text-orange-400 font-medium">"Install app"</span>
                  </div>
                </div>
              )}
              {!isIOS && !isSafari && !isChrome && !isEdge && (
                <div className="flex items-start gap-3 bg-zinc-50 rounded-xl p-3.5">
                  <Download className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-zinc-600">
                    Open Clara in <span className="text-orange-400 font-medium">Chrome</span> or <span className="text-orange-400 font-medium">Edge</span> for the best install experience.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Footer actions */}
          <div className="flex items-center justify-between pt-3 border-t border-zinc-200">
            <button data-testid="pwa-install-dont-show" onClick={saveDismiss} className="text-xs text-zinc-500 hover:text-zinc-600 transition-colors">
              Don't show again
            </button>
            <span className="text-[10px] text-zinc-600">Settings &gt; Personal Settings</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PwaInstallPrompt;
