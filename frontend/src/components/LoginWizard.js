import { useState, useEffect } from 'react';
import { Dialog, DialogContent } from './ui/dialog';
import { LogIn, Server, Coffee, Check } from 'lucide-react';

const LOGIN_STEPS = [
  { icon: LogIn, text: 'Logging in to your Clara Workspace.', duration: 2000 },
  { icon: Server, text: 'Greeting the Servers to make a connection to the Clara Datacenter.', duration: 2500 },
  { icon: Coffee, text: 'Take a sip, not a dip. Coffee can help.', duration: 2000 },
  { icon: Check, text: 'Welcome back! Let\'s get started.', duration: 0 },
];

export default function LoginWizard({ open, onClose, siteName }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    if (!open) { setCurrentStep(0); setCompleted(false); return; }
    setCurrentStep(0);
    setCompleted(false);
  }, [open]);

  useEffect(() => {
    if (!open || completed) return;
    if (currentStep >= LOGIN_STEPS.length - 1) {
      setCompleted(true);
      return;
    }
    const timer = setTimeout(() => setCurrentStep(prev => prev + 1), LOGIN_STEPS[currentStep].duration);
    return () => clearTimeout(timer);
  }, [currentStep, open, completed]);

  if (!open) return null;

  const step = LOGIN_STEPS[currentStep];
  const Icon = step.icon;
  const progress = ((currentStep + 1) / LOGIN_STEPS.length) * 100;
  const buttonLabel = siteName ? `Enter ${siteName}` : 'Enter Clara';

  return (
    <Dialog open={open} onOpenChange={() => completed && onClose?.()}>
      <DialogContent className="sm:max-w-lg bg-white border-zinc-200 p-0 overflow-hidden rounded-2xl shadow-2xl" data-testid="login-wizard">
        <div className="h-1.5 bg-zinc-100">
          <div
            className="h-full bg-gradient-to-r from-orange-500 to-amber-400 transition-all duration-700 ease-out rounded-full"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="p-8 flex flex-col items-center text-center">
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-6 transition-all duration-500 ${
            completed
              ? 'bg-emerald-50 border border-emerald-200'
              : 'bg-orange-50 border border-orange-200'
          }`}>
            <Icon className={`w-8 h-8 transition-all duration-500 ${
              completed ? 'text-emerald-600' : 'text-orange-500'
            } ${!completed ? 'animate-pulse' : ''}`} />
          </div>

          <p className="text-sm text-zinc-600 leading-relaxed min-h-[48px] flex items-center" data-testid="login-step-text">
            {step.text}
          </p>

          <div className="flex items-center gap-1.5 mt-6">
            {LOGIN_STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1 rounded-full transition-all duration-300 ${
                  i <= currentStep
                    ? completed ? 'w-4 bg-emerald-500' : 'w-4 bg-orange-500'
                    : 'w-2 bg-zinc-200'
                }`}
              />
            ))}
          </div>

          {completed && (
            <button
              onClick={() => onClose?.()}
              className="mt-6 px-6 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-medium transition-colors"
              data-testid="login-done-btn"
            >
              {buttonLabel}
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
