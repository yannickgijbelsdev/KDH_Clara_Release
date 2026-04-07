import { Sparkles } from 'lucide-react';
import { useClaraAssistant } from '../context/ClaraAssistantContext';

/**
 * Inline Clara Assistent error help button.
 * Place next to any error message to offer AI-powered troubleshooting.
 */
export default function ClaraErrorButton({ errorMessage, errorContext = '', className = '' }) {
  const { openClara } = useClaraAssistant();

  return (
    <button
      onClick={() => openClara('error', { errorMessage, errorContext })}
      className={`group relative inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-orange-50 border border-orange-200 text-orange-600 hover:bg-orange-100 transition-colors ${className}`}
      data-testid="clara-error-btn"
    >
      <Sparkles className="w-3 h-3" />
      Clara Assistent
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-zinc-900 text-white text-[11px] rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-lg z-50">
        The Clara Assistent is there to help you with this fault in Clara
      </span>
    </button>
  );
}
