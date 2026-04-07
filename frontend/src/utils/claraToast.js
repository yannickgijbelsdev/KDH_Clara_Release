import { toast } from 'sonner';
import { Sparkles } from 'lucide-react';

/**
 * Shows an error toast with a Clara Assistent help button.
 * When clicked, opens the Clara panel in error mode with the error pre-filled.
 * 
 * Usage: claraToast.error('Failed to publish', openClara, 'WordPress publishing')
 */
export const claraToast = {
  error: (message, openClara, errorContext = '') => {
    toast.error(message, {
      duration: 8000,
      action: openClara ? {
        label: 'Clara Assistent',
        onClick: () => openClara('error', { errorMessage: message, errorContext }),
      } : undefined,
    });
  },
};
