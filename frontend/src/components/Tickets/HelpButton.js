import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useMainSite } from '../../context/MainSiteContext';
import { useJourney } from '../../context/JourneyContext';
import { Button } from '../ui/button';
import { toast } from 'sonner';
import {
  HelpCircle, X, Send, Loader2, AlertCircle, ChevronDown,
} from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;

const PRIORITIES = [
  { value: 'low', label: 'Low', color: 'bg-zinc-600' },
  { value: 'normal', label: 'Normal', color: 'bg-blue-600' },
  { value: 'high', label: 'High', color: 'bg-amber-600' },
  { value: 'urgent', label: 'Urgent', color: 'bg-red-600' },
];

const PAGE_NAMES = {
  shows: 'Shows', calendar: 'Calendar', content: 'Content Library',
  media: 'Media Library', chat: 'Chat', settings: 'Settings',
  wordpress: 'WordPress', team: 'Team', approvals: 'Approvals',
};

function getPageName(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    const name = PAGE_NAMES[parts[i]];
    if (name) return name;
  }
  return parts[parts.length - 1] || 'Dashboard';
}

export default function HelpButton() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('normal');
  const [submitting, setSubmitting] = useState(false);

  const { user, token } = useAuth();
  const { mainSite, mainSiteSlug } = useMainSite();
  const { getJourney } = useJourney();
  const location = useLocation();

  if (!user || !token) return null;

  const pageName = getPageName(location.pathname);
  const browserInfo = `${navigator.userAgent.split('(')[1]?.split(')')[0] || 'Unknown'} | ${window.innerWidth}x${window.innerHeight}`;

  const submit = async () => {
    if (!title.trim() || !description.trim()) {
      toast.error('Vul titel en beschrijving in');
      return;
    }
    setSubmitting(true);
    try {
      const journey = getJourney();
      const res = await fetch(`${API}/api/tickets/`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Main-Site-ID': mainSite?.id || '',
        },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          page_url: window.location.href,
          page_name: pageName,
          browser_info: browserInfo,
          user_journey: journey,
          priority,
        }),
      });

      if (res.ok) {
        toast.success('Ticket aangemaakt!');
        setOpen(false);
        setTitle('');
        setDescription('');
        setPriority('normal');
      } else {
        toast.error('Kon ticket niet aanmaken');
      }
    } catch {
      toast.error('Fout bij aanmaken ticket');
    }
    setSubmitting(false);
  };

  return (
    <>
      {/* Floating Help Button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-4 right-4 z-[9990] group"
          data-testid="help-button"
        >
          <div className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-300 hover:border-zinc-600 rounded-full pl-3 pr-4 py-2 shadow-xl transition-all">
            <HelpCircle className="w-4 h-4 text-orange-400" />
            <span className="text-xs text-zinc-600 font-medium">Help</span>
          </div>
        </button>
      )}

      {/* Ticket Form Dialog */}
      {open && (
        <div className="fixed inset-0 z-[9995] bg-black/60 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div
            className="bg-[#0d0d0f] border border-zinc-200 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl"
            onClick={e => e.stopPropagation()}
            data-testid="help-dialog"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-200">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-orange-400" />
                <span className="text-sm font-semibold">Report an Issue</span>
              </div>
              <button onClick={() => setOpen(false)} className="text-zinc-500 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Pre-filled Info */}
              <div className="grid grid-cols-2 gap-3">
                <InfoField label="Name" value={user.name || user.email} />
                <InfoField label="Page" value={pageName} />
                <InfoField label="Site" value={mainSite?.name || mainSiteSlug || '-'} />
                <InfoField label="Browser" value={browserInfo.split('|')[0]?.trim()} />
              </div>

              {/* Title */}
              <div>
                <label className="block text-xs text-zinc-500 mb-1">What's not working?</label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. Can't save content item"
                  className="w-full bg-zinc-900 border border-zinc-300 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-orange-500"
                  data-testid="ticket-title-input"
                  autoFocus
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Describe the issue</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="What happened? What did you expect?"
                  rows={3}
                  className="w-full bg-zinc-900 border border-zinc-300 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-orange-500 resize-none"
                  data-testid="ticket-description-input"
                />
              </div>

              {/* Priority */}
              <div>
                <label className="block text-xs text-zinc-500 mb-1.5">Priority</label>
                <div className="flex gap-2">
                  {PRIORITIES.map(p => (
                    <button
                      key={p.value}
                      onClick={() => setPriority(p.value)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                        priority === p.value
                          ? `${p.color} border-transparent text-white`
                          : 'bg-zinc-900 border-zinc-300 text-zinc-400 hover:border-zinc-600'
                      }`}
                      data-testid={`priority-${p.value}`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Journey Preview */}
              <div className="bg-zinc-900 border border-zinc-200 rounded-lg p-3">
                <p className="text-[10px] text-zinc-500 mb-1.5">Your path (auto-captured)</p>
                <div className="flex items-center gap-1 overflow-x-auto pb-1">
                  {(getJourney() || []).slice(-6).map((step, i, arr) => (
                    <div key={i} className="flex items-center gap-1 flex-shrink-0">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                        i === arr.length - 1 ? 'bg-orange-500/20 text-orange-400' : 'bg-zinc-800 text-zinc-400'
                      }`}>
                        {step.name}
                      </span>
                      {i < arr.length - 1 && <span className="text-zinc-700 text-[10px]">&rarr;</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Submit */}
            <div className="px-5 py-3 border-t border-zinc-200 flex justify-end">
              <Button
                onClick={submit}
                disabled={submitting || !title.trim() || !description.trim()}
                className="gap-2 bg-orange-600 hover:bg-orange-700"
                data-testid="ticket-submit-btn"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Send Report
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function InfoField({ label, value }) {
  return (
    <div className="bg-white/80 backdrop-blur rounded-lg px-3 py-2">
      <p className="text-[10px] text-zinc-600">{label}</p>
      <p className="text-xs text-zinc-600 truncate">{value}</p>
    </div>
  );
}
