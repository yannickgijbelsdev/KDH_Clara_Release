import { motion, AnimatePresence } from 'framer-motion';
import { Bell, X, ChevronRight } from 'lucide-react';

const STATUS_LABELS = {
  open: 'Open',
  searching: 'Searching for a solution',
  solved: 'Solution found',
  closed: 'Closed',
};

export default function TicketUpdatePopup({ tickets, onClose, onOpenTicket }) {
  if (!tickets || tickets.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -20, scale: 0.95 }}
        transition={{ duration: 0.3 }}
        className="fixed top-20 right-5 z-[250] w-80"
        data-testid="ticket-update-popup"
      >
        <div className="bg-white rounded-2xl shadow-[0_15px_60px_rgba(0,0,0,0.12)] border border-zinc-200/60 overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-orange-400 to-amber-400" />
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-orange-500" />
                <span className="text-sm font-bold text-zinc-900">Ticket Updates</span>
              </div>
              <button onClick={onClose} className="p-1 rounded-lg hover:bg-zinc-100" data-testid="close-ticket-popup">
                <X className="w-4 h-4 text-zinc-400" />
              </button>
            </div>
            <div className="space-y-2">
              {tickets.map(t => (
                <button
                  key={t.id}
                  onClick={() => { onOpenTicket(t.id); onClose(); }}
                  className="w-full text-left p-3 rounded-xl bg-zinc-50 hover:bg-zinc-100 transition-colors flex items-center gap-3"
                  data-testid={`popup-ticket-${t.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-800 truncate">{t.subject}</p>
                    <p className="text-[11px] text-zinc-400">{STATUS_LABELS[t.status] || t.status}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-zinc-300 flex-shrink-0" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
