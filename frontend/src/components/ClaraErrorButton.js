/* eslint-disable */
import { Sparkles } from 'lucide-react';
import { useClaraAssistant } from '../context/ClaraAssistantContext';

/**
 * Inline Koodh Assistent error help button.
 * Always visible — provides AI-powered troubleshooting for any error state.
 */
export default function ClaraErrorButton({ errorMessage, errorContext = '', className = '' }) {
  const { openClara } = useClaraAssistant();

  return (
    <button
      onClick={() => openClara('error', { errorMessage, errorContext })}
      className={`group relative inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-[#7380b6]/10 border border-[#7380b6]/30 text-[#5f6ca3] hover:bg-[#7380b6]/15 transition-colors ${className}`}
      data-testid="clara-error-btn"
    >
      <Sparkles className="w-3 h-3" />
      Koodh Assistent
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-zinc-900 text-white text-[11px] rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-lg z-50">
        Ask Clara for help with this issue
      </span>
    </button>
  );
}
