import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, DialogContent } from './ui/dialog';
import { Check } from 'lucide-react';
import { getAvatarUrl } from '../utils/avatar';

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

export default function LoginWizard({ open, onClose, siteName, userName, user }) {
  const [currentStep, setCurrentStep] = useState(-1);
  const [completed, setCompleted] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);

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
      setShowWelcome(false);
      return;
    }
    setCurrentStep(0);
    setCompleted(false);
    setShowWelcome(false);
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

  // Separate effect for the welcome transition after completion
  useEffect(() => {
    if (!completed || showWelcome) return;
    const timer = setTimeout(() => setShowWelcome(true), 600);
    return () => clearTimeout(timer);
  }, [completed, showWelcome]);

  if (!open) return null;

  const getStatus = (i) => {
    if (completed) return 'done';
    if (i < currentStep) return 'done';
    if (i === currentStep) return 'loading';
    return 'pending';
  };

  const welcomeTitle = userName && siteName
    ? `Welcome, ${userName} to ${siteName}!`
    : userName
    ? `Welcome, ${userName}!`
    : 'Welcome to Clara!';

  return (
    <Dialog open={open} onOpenChange={() => showWelcome && onClose?.()}>
      <DialogContent className="sm:max-w-lg bg-white border-zinc-200 p-0 overflow-hidden rounded-2xl shadow-2xl [&>button]:hidden" data-testid="login-wizard">
        <AnimatePresence mode="wait">
          {!showWelcome ? (
            <motion.div
              key="loading"
              initial={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
              className="p-8 flex flex-col items-center text-center"
            >
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
            </motion.div>
          ) : (
            <motion.div
              key="welcome"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4 }}
              className="p-10 flex flex-col items-center text-center"
            >
              <div className="relative mb-6">
                {/* Animated orange glow pulse */}
                <motion.div
                  className="absolute inset-0 rounded-full bg-orange-400"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{
                    scale: [0, 1.6, 1.25],
                    opacity: [0, 0.4, 0],
                  }}
                  transition={{ delay: 0.3, duration: 1.4, ease: 'easeOut' }}
                  style={{ width: 80, height: 80, filter: 'blur(12px)' }}
                />
                <motion.div
                  className="absolute inset-0 rounded-full bg-orange-300"
                  initial={{ scale: 1, opacity: 0 }}
                  animate={{
                    scale: [1, 1.35, 1.1],
                    opacity: [0, 0.3, 0],
                  }}
                  transition={{ delay: 0.8, duration: 1.2, ease: 'easeOut' }}
                  style={{ width: 80, height: 80, filter: 'blur(8px)' }}
                />
                {/* Avatar */}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                  className="relative w-20 h-20 rounded-full overflow-hidden ring-2 ring-orange-200"
                >
                  {getAvatarUrl(user) ? (
                    <img src={getAvatarUrl(user)} alt={userName} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-white font-bold text-2xl">
                      {userName?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                  )}
                </motion.div>
              </div>

              <h2 className="text-2xl font-bold text-zinc-900 mb-2" data-testid="welcome-title">
                {welcomeTitle}
              </h2>
              <p className="text-sm text-zinc-500 mb-8">Everything is ready for you.</p>

              <button
                onClick={() => onClose?.()}
                className="w-full px-6 py-3 rounded-full bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-semibold transition-colors"
                data-testid="login-done-btn"
              >
                {siteName ? `Enter ${siteName}` : 'Enter Clara'}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
