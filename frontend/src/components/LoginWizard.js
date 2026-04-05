import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Dialog, DialogContent } from './ui/dialog';
import { Check, Zap } from 'lucide-react';

const LoginStep = ({ label, status, delay }) => (
  <motion.div
    initial={{ opacity: 0, x: -20 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ delay, duration: 0.4 }}
    className="flex items-center gap-4 py-3"
  >
    <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0">
      {status === 'done' ? (
        <motion.div
          initial={{ scale: 0 }} animate={{ scale: 1 }}
          className="w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center"
        >
          <Check className="w-5 h-5 text-white" />
        </motion.div>
      ) : status === 'loading' ? (
        <div className="w-10 h-10 rounded-full border-[3px] border-zinc-200 border-t-zinc-900 animate-spin" />
      ) : (
        <div className="w-10 h-10 rounded-full border-2 border-zinc-200" />
      )}
    </div>
    <span className={`text-sm font-medium transition-colors ${
      status === 'done' ? 'text-emerald-700' : status === 'loading' ? 'text-zinc-900' : 'text-zinc-400'
    }`}>{label}</span>
  </motion.div>
);

export default function LoginWizard({ open, onClose, siteName }) {
  const [currentStep, setCurrentStep] = useState(-1);
  const [completed, setCompleted] = useState(false);

  const displayName = siteName || 'your workspace';

  const steps = [
    { id: 'login', label: 'Logging in to Clara...' },
    { id: 'datacenter', label: 'Making a secure connection to the Clara Datacenter...' },
    { id: 'globalprotect', label: 'Connecting to the Clara Global Protect services...' },
    { id: 'prepare', label: `Preparing ${displayName} to show all the data...` },
  ];

  useEffect(() => {
    if (!open) {
      setCurrentStep(-1);
      setCompleted(false);
      return;
    }
    setCurrentStep(0);
    setCompleted(false);
  }, [open]);

  useEffect(() => {
    if (!open || completed || currentStep < 0) return;

    if (currentStep >= steps.length) {
      setCompleted(true);
      return;
    }

    const duration = 1800 + Math.random() * 600;
    const timer = setTimeout(() => setCurrentStep(prev => prev + 1), duration);
    return () => clearTimeout(timer);
  }, [currentStep, open, completed, steps.length]);

  if (!open) return null;

  const getStatus = (i) => {
    if (completed) return 'done';
    if (i < currentStep) return 'done';
    if (i === currentStep) return 'loading';
    return 'pending';
  };

  return (
    <Dialog open={open} onOpenChange={() => completed && onClose?.()}>
      <DialogContent className="sm:max-w-lg bg-white border-zinc-200 p-0 overflow-hidden rounded-2xl shadow-2xl [&>button]:hidden" data-testid="login-wizard">
        <div className="p-8 flex flex-col items-center text-center">
          <h2 className="text-xl font-bold text-zinc-900 mb-1">Welcome to Clara</h2>
          <p className="text-sm text-zinc-500 mb-6">Setting things up for you...</p>

          <div className="text-left w-full px-2">
            {steps.map((step, i) => (
              <LoginStep
                key={step.id}
                label={step.label}
                status={getStatus(i)}
                delay={i * 0.15}
              />
            ))}
          </div>

          {completed && (
            <motion.div
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="mt-6 w-full"
            >
              <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 mb-4">
                <div className="flex items-center justify-center gap-2 text-emerald-700 font-semibold">
                  <Zap className="w-5 h-5" />
                  Ready to go!
                </div>
              </div>
              <button
                onClick={() => onClose?.()}
                className="w-full px-6 py-2.5 rounded-full bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-medium transition-colors"
                data-testid="login-done-btn"
              >
                {siteName ? `Enter ${siteName}` : 'Enter Clara'}
              </button>
            </motion.div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
