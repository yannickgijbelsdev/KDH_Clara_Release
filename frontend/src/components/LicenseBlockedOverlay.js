import { motion } from 'framer-motion';
import { ShieldAlert, FileCheck, Mail, Receipt, Sparkles, LifeBuoy } from 'lucide-react';
import { Button } from './ui/button';
import { useClaraAssistant } from '../context/ClaraAssistantContext';

const CHECKLIST = [
  {
    icon: Receipt,
    title: 'Betaalde facturen',
    desc: 'Controleer of alle facturen voor je licentie correct betaald zijn.',
  },
  {
    icon: FileCheck,
    title: 'Offertes',
    desc: 'Heb je een offerte ontvangen en ondertekend teruggestuurd?',
  },
  {
    icon: Mail,
    title: 'E-mails van Clara Support',
    desc: 'Kijk in je inbox (en spam) of je activeringsinstructies hebt ontvangen.',
  },
];

export default function LicenseBlockedOverlay({ siteName }) {
  const { openClara } = useClaraAssistant();

  const handleAskClara = () => {
    openClara('license', {
      initialMessage: `Site "${siteName || 'Mijn site'}" heeft geen actieve licentie.`,
    });
  };

  return (
    <div className="flex items-center justify-center min-h-[70vh] p-4">
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-lg"
        data-testid="license-blocked-overlay"
      >
        {/* Card */}
        <div className="bg-white rounded-3xl shadow-[0_8px_40px_rgba(0,0,0,0.08)] border border-zinc-200/60 overflow-hidden">
          {/* Header accent */}
          <div className="h-1.5 bg-gradient-to-r from-amber-400 via-orange-500 to-red-400" />

          <div className="p-6 sm:p-8 space-y-6">
            {/* Icon + Title */}
            <div className="flex flex-col items-center text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center">
                <ShieldAlert className="w-7 h-7 text-amber-500" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-zinc-900" data-testid="license-blocked-title">
                  Geen actieve licentie
                </h2>
                <p className="text-sm text-zinc-500 mt-1 max-w-sm">
                  Deze site heeft momenteel geen actieve licentie. De menu-items zijn daarom niet beschikbaar.
                </p>
              </div>
            </div>

            {/* Checklist */}
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Controleer het volgende
              </p>
              {CHECKLIST.map((item, i) => {
                const Icon = item.icon;
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.15 + i * 0.08, duration: 0.35 }}
                    className="flex items-start gap-3 p-3 rounded-xl bg-zinc-50 border border-zinc-100"
                    data-testid={`license-check-item-${i}`}
                  >
                    <div className="w-9 h-9 rounded-lg bg-white border border-zinc-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Icon className="w-4 h-4 text-zinc-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-800">{item.title}</p>
                      <p className="text-xs text-zinc-500 mt-0.5">{item.desc}</p>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Divider */}
            <div className="border-t border-zinc-100" />

            {/* Actions */}
            <div className="space-y-2.5">
              <Button
                onClick={handleAskClara}
                className="w-full bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl gap-2 h-11 text-sm font-medium"
                data-testid="license-ask-clara-btn"
              >
                <Sparkles className="w-4 h-4" />
                Vraag Clara Assistent
              </Button>
              <p className="text-[11px] text-zinc-400 text-center">
                Clara kan je helpen controleren of er openstaande facturen, offertes of berichten zijn.
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
