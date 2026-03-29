import { useState, useEffect, useRef } from 'react';
import { X, Download, Smartphone } from 'lucide-react';

const PwaInstallPrompt = () => {
  const [show, setShow] = useState(false);
  const deferredPrompt = useRef(null);

  useEffect(() => {
    // Don't show if already dismissed or already installed
    if (localStorage.getItem('pwa-install-dismissed')) return;
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    const handler = (e) => {
      e.preventDefault();
      deferredPrompt.current = e;
      // Small delay so the page settles first
      setTimeout(() => setShow(true), 2500);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt.current) return;
    deferredPrompt.current.prompt();
    const { outcome } = await deferredPrompt.current.userChoice;
    if (outcome === 'accepted') {
      localStorage.setItem('pwa-install-dismissed', '1');
    }
    deferredPrompt.current = null;
    setShow(false);
  };

  const handleDismiss = () => {
    localStorage.setItem('pwa-install-dismissed', '1');
    setShow(false);
  };

  if (!show) return null;

  return (
    <div
      data-testid="pwa-install-prompt"
      className="fixed bottom-6 right-6 z-[9999] w-[340px] animate-in slide-in-from-bottom-4 fade-in duration-300"
    >
      <div className="bg-zinc-900 border border-zinc-700/60 rounded-xl shadow-2xl shadow-black/40 p-5">
        {/* Close button */}
        <button
          data-testid="pwa-install-dismiss"
          onClick={handleDismiss}
          className="absolute top-3 right-3 text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Icon + heading */}
        <div className="flex items-start gap-3 mb-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <Smartphone className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-100 leading-tight">
              Install Clara as an App
            </h3>
            <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
              Get quick access from your home screen. Works offline and feels like a native app.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 mt-4">
          <button
            data-testid="pwa-install-btn"
            onClick={handleInstall}
            className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors"
          >
            <Download className="w-4 h-4" />
            Install
          </button>
          <button
            data-testid="pwa-install-later"
            onClick={handleDismiss}
            className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
};

export default PwaInstallPrompt;
