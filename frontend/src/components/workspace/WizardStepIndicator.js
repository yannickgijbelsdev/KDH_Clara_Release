import { Check } from 'lucide-react';

/**
 * Shared wizard step indicator with numbered circles connected by lines.
 *
 * @param {Object} props
 * @param {number} props.currentStep - Zero-based index of the active step
 * @param {string[]} props.steps - Array of step labels
 */
export default function WizardStepIndicator({ currentStep, steps }) {
  return (
    <div className="flex items-center gap-0 w-full" data-testid="wizard-step-indicator">
      {steps.map((label, i) => {
        const isActive = i === currentStep;
        const isDone = i < currentStep;
        const isLast = i === steps.length - 1;

        return (
          <div key={i} className="flex items-center" style={isLast ? {} : { flex: 1 }}>
            {/* Circle + label */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${
                  isActive
                    ? 'bg-zinc-900 text-white shadow-md'
                    : isDone
                      ? 'bg-zinc-900 text-white'
                      : 'border-2 border-zinc-300 text-zinc-400'
                }`}
              >
                {isDone ? <Check className="w-4 h-4" /> : i + 1}
              </div>
              <span className={`text-sm whitespace-nowrap ${
                isActive ? 'text-zinc-900 font-semibold' : isDone ? 'text-zinc-600' : 'text-zinc-400'
              }`}>
                {label}
              </span>
            </div>

            {/* Connector line */}
            {!isLast && (
              <div className={`flex-1 h-px mx-3 ${isDone ? 'bg-zinc-400' : 'bg-zinc-200'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
