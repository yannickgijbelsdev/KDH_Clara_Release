import { Check } from 'lucide-react';
import { useRef, useEffect } from 'react';

/**
 * Sliding wizard step indicator.
 * Auto-scrolls to keep the active step centered. Only the active step
 * and its nearest neighbours show their label — the rest collapse to
 * numbered circles so the bar always fits.
 */
export default function WizardStepIndicator({ currentStep, steps }) {
  const scrollRef = useRef(null);
  const activeRef = useRef(null);

  useEffect(() => {
    if (activeRef.current && scrollRef.current) {
      const container = scrollRef.current;
      const el = activeRef.current;
      const offset = el.offsetLeft - container.offsetWidth / 2 + el.offsetWidth / 2;
      container.scrollTo({ left: Math.max(0, offset), behavior: 'smooth' });
    }
  }, [currentStep]);

  return (
    <div
      ref={scrollRef}
      className="flex items-center overflow-x-auto max-w-full"
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
      data-testid="wizard-step-indicator"
    >
      <style>{`[data-testid="wizard-step-indicator"]::-webkit-scrollbar{display:none}`}</style>
      {steps.map((label, i) => {
        const isActive = i === currentStep;
        const isDone = i < currentStep;
        const isLast = i === steps.length - 1;
        const showLabel = isActive || Math.abs(i - currentStep) <= 1;

        return (
          <div
            key={i}
            ref={isActive ? activeRef : null}
            className="flex items-center flex-shrink-0"
          >
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-300 ${
                  isActive
                    ? 'bg-zinc-900 text-white shadow-md scale-110'
                    : isDone
                      ? 'bg-zinc-900 text-white'
                      : 'border-2 border-zinc-300 text-zinc-400'
                }`}
              >
                {isDone ? <Check className="w-3.5 h-3.5" /> : i + 1}
              </div>
              {showLabel && (
                <span
                  className={`text-xs whitespace-nowrap transition-all duration-300 ${
                    isActive ? 'text-zinc-900 font-semibold' : isDone ? 'text-zinc-500' : 'text-zinc-400'
                  }`}
                >
                  {label}
                </span>
              )}
            </div>

            {!isLast && (
              <div className={`w-5 h-px mx-1.5 flex-shrink-0 transition-colors ${isDone ? 'bg-zinc-400' : 'bg-zinc-200'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
