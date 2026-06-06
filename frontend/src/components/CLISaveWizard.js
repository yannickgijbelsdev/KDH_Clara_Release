/* eslint-disable */
import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent } from './ui/dialog';
import { Save, Upload, Check } from 'lucide-react';

const CLI_SAVE_STEPS = [
  { icon: Save, text: 'CLI is saving the changes.', duration: 1800 },
  { icon: Upload, text: 'Uploading to the Clara Datacenter.', duration: 2000 },
  { icon: Check, text: 'Changes saved successfully.', duration: 0 },
];

export default function CLISaveWizard({ open, onClose }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [completed, setCompleted] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) {
      setCurrentStep(0);
      setCompleted(false);
      return;
    }
    setCurrentStep(0);
    setCompleted(false);

    // Step timers
    const t1 = setTimeout(() => setCurrentStep(1), CLI_SAVE_STEPS[0].duration);
    const t2 = setTimeout(() => {
      setCurrentStep(2);
      setCompleted(true);
    }, CLI_SAVE_STEPS[0].duration + CLI_SAVE_STEPS[1].duration);
    const t3 = setTimeout(() => {
      onCloseRef.current?.();
    }, CLI_SAVE_STEPS[0].duration + CLI_SAVE_STEPS[1].duration + 1200);

    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [open]);

  if (!open) return null;

  const step = CLI_SAVE_STEPS[currentStep];
  const Icon = step.icon;
  const progress = ((currentStep + 1) / CLI_SAVE_STEPS.length) * 100;

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md bg-white border-zinc-200 p-0 overflow-hidden [&>button]:hidden" data-testid="cli-save-wizard">
        <div className="h-1 bg-zinc-200">
          <div
            className="h-full bg-orange-500 transition-all duration-700 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="p-8 flex flex-col items-center text-center">
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-6 transition-all duration-500 ${
            completed
              ? 'bg-emerald-500/15 border border-emerald-500/30'
              : 'bg-orange-500/15 border border-orange-500/30'
          }`}>
            <Icon className={`w-8 h-8 transition-all duration-500 ${
              completed ? 'text-emerald-400' : 'text-orange-400'
            } ${!completed ? 'animate-pulse' : ''}`} />
          </div>

          <p className="text-sm text-zinc-600 leading-relaxed min-h-[48px] flex items-center" data-testid="cli-save-step-text">
            {step.text}
          </p>

          <div className="flex items-center gap-1.5 mt-6">
            {CLI_SAVE_STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1 rounded-full transition-all duration-300 ${
                  i <= currentStep
                    ? completed ? 'w-4 bg-emerald-500' : 'w-4 bg-orange-500'
                    : 'w-2 bg-zinc-300'
                }`}
              />
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
