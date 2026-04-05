import { useState, useEffect } from 'react';
import { Dialog, DialogContent } from './ui/dialog';
import { Shield, Server, Layout, Menu, Coffee, Lock, Check, FileText } from 'lucide-react';

const SITE_TYPE_LABELS = {
  radio: 'main site',
  technical: 'technical site',
  task_scheduler: 'tasks site',
  server: 'server site',
};

const STEPS = (siteType) => [
  { icon: Server, text: `Clara is creating your ${SITE_TYPE_LABELS[siteType] || siteType}.`, duration: 1800 },
  { icon: Layout, text: 'Setting up your workspace.', duration: 2200 },
  { icon: Server, text: 'We are connecting the workspace to our datacenter.', duration: 2400 },
  { icon: Menu, text: 'Creating the menu.', duration: 1600 },
  { icon: Coffee, text: "We are preparing the last things, maybe it's time to sip from your coffee, tea or other drinks.", duration: 3000 },
  { icon: Shield, text: 'Setting up the firewall, to keep everything safe.', duration: 2000 },
  { icon: Lock, text: 'Setting up Clara Global Protect.', duration: 1800 },
  { icon: FileText, text: 'A license request has been sent to your license administrator.', duration: 2000 },
  { icon: Check, text: 'We are done! Enjoy your new workspace.', duration: 0 },
];

export default function SetupWizard({ open, onClose, siteType = 'radio', siteName = '' }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [completed, setCompleted] = useState(false);
  const steps = STEPS(siteType);

  useEffect(() => {
    if (!open) { setCurrentStep(0); setCompleted(false); return; }
    setCurrentStep(0);
    setCompleted(false);
  }, [open]);

  useEffect(() => {
    if (!open || completed) return;
    if (currentStep >= steps.length - 1) {
      setCompleted(true);
      return;
    }
    const timer = setTimeout(() => setCurrentStep(prev => prev + 1), steps[currentStep].duration);
    return () => clearTimeout(timer);
  }, [currentStep, open, completed, steps]);

  if (!open) return null;

  const step = steps[currentStep];
  const Icon = step.icon;
  const progress = ((currentStep + 1) / steps.length) * 100;

  return (
    <Dialog open={open} onOpenChange={() => completed && onClose?.()}>
      <DialogContent className="sm:max-w-lg bg-white border-zinc-200 p-0 overflow-hidden rounded-2xl shadow-2xl" data-testid="setup-wizard">
        {/* Progress bar */}
        <div className="h-1.5 bg-zinc-100">
          <div
            className="h-full bg-gradient-to-r from-orange-500 to-amber-400 transition-all duration-700 ease-out rounded-full"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="p-8 flex flex-col items-center text-center">
          {/* Animated icon */}
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-6 transition-all duration-500 ${
            completed
              ? 'bg-emerald-50 border border-emerald-200'
              : 'bg-orange-50 border border-orange-200'
          }`}>
            <Icon className={`w-8 h-8 transition-all duration-500 ${
              completed ? 'text-emerald-600' : 'text-orange-500'
            } ${!completed ? 'animate-pulse' : ''}`} />
          </div>

          {/* Site name */}
          {siteName && (
            <p className="text-xs text-zinc-500 font-mono mb-2">{siteName}</p>
          )}

          {/* Step text */}
          <p className="text-sm text-zinc-600 leading-relaxed min-h-[48px] flex items-center" data-testid="setup-step-text">
            {step.text}
          </p>

          {/* Step counter */}
          <div className="flex items-center gap-1.5 mt-6">
            {steps.map((_, i) => (
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

          {/* Done button */}
          {completed && (
            <button
              onClick={() => onClose?.()}
              className="mt-6 px-6 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-medium transition-colors"
              data-testid="setup-done-btn"
            >
              Get Started
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
