/* eslint-disable */
/**
 * API Endpoints page — per main site.
 *
 * Renders the feature-aware list of public endpoints for the current site.
 * Backend: GET /api/main-sites/:id/api-endpoints
 *
 * Available only when the site has rds, content_library or clara_custom enabled.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Radio, Newspaper, Plug, Shield, Search, Copy, Check, ExternalLink,
  ChevronDown, ChevronUp, Loader2,
  Globe, Image as ImageIcon, Settings as SettingsIcon, FileText as FileIcon,
  Bell, Calendar, Mic, Headphones, LifeBuoy, Kanban, Upload, Video, MessageSquare,
} from 'lucide-react';
import { useMainSite } from '../context/MainSiteContext';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';

const API = process.env.REACT_APP_BACKEND_URL;

const GROUP_ICON = {
  radio_rds: Radio,
  news_content: Newspaper,
  clara_custom: Plug,
  auth_public: Shield,
};

// Icon for auto-discovered extras groups, keyed by backend-supplied `icon` string
const EXTRA_ICON = {
  globe: Globe, image: ImageIcon, settings: SettingsIcon, file: FileIcon,
  bell: Bell, calendar: Calendar, radio: Radio, mic: Mic,
  headphones: Headphones, 'life-buoy': LifeBuoy, kanban: Kanban,
  upload: Upload, video: Video, 'message-square': MessageSquare,
  newspaper: Newspaper, shield: Shield, plug: Plug,
};

const METHOD_COLOR = {
  GET:    'bg-emerald-100 text-emerald-800 border-emerald-200',
  POST:   'bg-sky-100 text-sky-800 border-sky-200',
  PUT:    'bg-amber-100 text-amber-800 border-amber-200',
  PATCH:  'bg-amber-100 text-amber-800 border-amber-200',
  DELETE: 'bg-rose-100 text-rose-800 border-rose-200',
};


function EndpointRow({ ep }) {
  const [copied, setCopied] = useState(false);
  const onCopy = () => {
    navigator.clipboard.writeText(ep.full_url).then(() => {
      setCopied(true);
      toast.success(`Copied ${ep.name}`);
      setTimeout(() => setCopied(false), 1400);
    });
  };
  return (
    <div className="group rounded-lg border border-zinc-200 bg-white px-4 py-3 hover:border-violet-300 transition-colors" data-testid={`endpoint-row-${ep.path}`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${METHOD_COLOR[ep.method] || 'bg-zinc-100 text-zinc-700 border-zinc-200'}`}>
              {ep.method}
            </span>
            {ep.tag && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `${ep.tag_color || '#71717a'}1f`, color: ep.tag_color || '#71717a' }}>
                {ep.tag}
              </span>
            )}
            <p className="text-sm font-semibold text-zinc-900 truncate">{ep.name}</p>
            {typeof ep.item_count === 'number' && (
              <span className="text-[10px] text-zinc-500">· {ep.item_count} items</span>
            )}
          </div>
          {ep.description && <p className="text-[11.5px] text-zinc-500 mb-2 leading-relaxed">{ep.description}</p>}
          <code className="text-[11px] bg-zinc-50 text-zinc-700 px-2 py-1 rounded font-mono break-all border border-zinc-100">{ep.full_url}</code>
        </div>
        <div className="flex-shrink-0 flex gap-1">
          <Button size="sm" variant="outline" onClick={onCopy} className="h-8 w-8 p-0" title="Copy URL" data-testid={`copy-${ep.path}`}>
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
          </Button>
          {ep.method === 'GET' && (
            <a href={ep.full_url} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="outline" className="h-8 w-8 p-0" title="Open in new tab">
                <ExternalLink className="w-3.5 h-3.5" />
              </Button>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}


function GroupCard({ group, query, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  const Icon = GROUP_ICON[group.id] || EXTRA_ICON[group.icon] || Plug;
  const filtered = useMemo(() => {
    if (!query) return group.endpoints;
    const q = query.toLowerCase();
    return group.endpoints.filter((e) =>
      [e.name, e.path, e.description, e.tag].some((s) => (s || '').toLowerCase().includes(q))
    );
  }, [group.endpoints, query]);
  if (query && filtered.length === 0) return null;
  return (
    <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden" data-testid={`endpoint-group-${group.id}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-5 py-4 flex items-center gap-3 hover:bg-zinc-50 transition-colors text-left"
      >
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center flex-shrink-0">
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-zinc-900">{group.name}</h3>
            <span className="text-xs text-zinc-500">{filtered.length} endpoint{filtered.length !== 1 ? 's' : ''}</span>
          </div>
          {group.description && <p className="text-xs text-zinc-500 mt-0.5 leading-snug">{group.description}</p>}
        </div>
        {open ? <ChevronUp className="w-5 h-5 text-zinc-400" /> : <ChevronDown className="w-5 h-5 text-zinc-400" />}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 pt-1 space-y-2 border-t border-zinc-100 bg-zinc-50/40">
              {filtered.map((ep, i) => <EndpointRow key={`${ep.path}-${i}`} ep={ep} />)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}


export default function ApiEndpointsPage() {
  const { mainSite } = useMainSite();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const token = localStorage.getItem('token');

  const load = useCallback(async () => {
    if (!mainSite?.id) return;
    setLoading(true);
    try {
      const r = await axios.get(`${API}/api/main-sites/${mainSite.id}/api-endpoints`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setData(r.data);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Could not load API endpoints');
    } finally {
      setLoading(false);
    }
  }, [mainSite?.id, token]);

  useEffect(() => { load(); }, [load]);

  if (loading || !data) {
    return (
      <div className="p-8 flex items-center justify-center" data-testid="api-endpoints-loading">
        <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
      </div>
    );
  }

  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto" data-testid="api-endpoints-page">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900">API Endpoints</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Public API endpoints available for <strong>{data.site?.name}</strong>. Copy any URL to use in external systems (RDS, mobile apps, embedded websites, MagicRDS).
        </p>
      </div>

      <div className="mb-5 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, path, tag…"
            className="pl-9"
            data-testid="endpoints-search"
          />
        </div>
        <p className="text-xs text-zinc-500">
          <strong>{data.total_endpoints}</strong> endpoint{data.total_endpoints !== 1 ? 's' : ''} across <strong>{data.groups?.length || 0}</strong> group{(data.groups?.length || 0) !== 1 ? 's' : ''}
        </p>
      </div>

      <div className="space-y-4">
        {data.groups?.map((g) => (
          <GroupCard key={g.id} group={g} query={query} defaultOpen={!g.id.startsWith('extras_')} />
        ))}
      </div>
    </div>
  );
}
