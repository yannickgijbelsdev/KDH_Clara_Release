import { toast } from 'sonner';

/**
 * Global Clara-enhanced toast utility.
 * 
 * Call `claraToast.init(openClara)` once at app root to enable
 * the Clara Assistent button on ALL error toasts automatically.
 */

let _openClara = null;
let _patched = false;

export const claraToast = {
  /**
   * Initialize the global Clara reference.
   * Call once from a component inside ClaraAssistantProvider.
   */
  init(openClara) {
    _openClara = openClara;
    if (!_patched) {
      _patchSonnerToast();
      _patched = true;
    }
  },

  /**
   * Show an error toast with Clara Assistent help button.
   * If openClara was passed explicitly, uses that; otherwise uses the global ref.
   */
  error(message, openClaraOverride, errorContext = '') {
    const opener = typeof openClaraOverride === 'function' ? openClaraOverride : _openClara;
    toast.error(message, {
      duration: 8000,
      _skipPatch: true,
      action: opener ? {
        label: 'Clara Assistent',
        onClick: () => opener('error', {
          errorMessage: typeof message === 'string' ? message : String(message),
          errorContext,
        }),
      } : undefined,
    });
  },
};

/**
 * Monkey-patch sonner's toast.error so that ALL existing calls
 * automatically include the Clara Assistent button.
 */
function _patchSonnerToast() {
  const originalError = toast.error.bind(toast);

  toast.error = (message, opts = {}) => {
    // Skip if already enhanced by claraToast.error()
    if (opts?._skipPatch) {
      const { _skipPatch, ...rest } = opts;
      return originalError(message, rest);
    }

    // Only add Clara action if there isn't already a custom action
    const claraAction = (!opts?.action && _openClara) ? {
      label: 'Clara Assistent',
      onClick: () => _openClara('error', {
        errorMessage: typeof message === 'string' ? message : String(message),
        errorContext: '',
      }),
    } : opts?.action;

    return originalError(message, {
      duration: 8000,
      ...opts,
      action: claraAction,
    });
  };
}
