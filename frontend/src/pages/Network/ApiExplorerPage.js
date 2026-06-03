import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import NetworkHeader from '../../components/NetworkHeader';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';
import {
  Shield, Users, Building, Calendar, FileText, Image, Radio,
  Settings, Globe, Globe2, MessageCircle, Rss, Layers, Folder,
  List, Volume2, ExternalLink, RefreshCw, Database, Code,
  Search, ChevronDown, ChevronRight, Copy, Check, Loader2, ArrowLeft,
  HardDrive, Network, LayoutGrid, X,
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const iconMap = {
  'shield': Shield, 'users': Users, 'building': Building, 'calendar': Calendar,
  'file-text': FileText, 'image': Image, 'radio': Radio, 'settings': Settings,
  'globe': Globe, 'globe-2': Globe2, 'message-circle': MessageCircle, 'rss': Rss,
  'layers': Layers, 'folder': Folder, 'list': List, 'volume-2': Volume2,
  'external-link': ExternalLink, 'refresh-cw': RefreshCw, 'database': Database, 'code': Code,
  'hard-drive': HardDrive, 'network': Network, 'layout-grid': LayoutGrid,
};

const methodColors = {
  'GET': 'bg-emerald-50 text-emerald-600 border-emerald-200',
  'POST': 'bg-blue-50 text-blue-600 border-blue-200',
  'PUT': 'bg-amber-50 text-amber-600 border-amber-200',
  'PATCH': 'bg-orange-50 text-orange-600 border-orange-200',
  'DELETE': 'bg-red-50 text-red-600 border-red-200',
  'WEBSOCKET': 'bg-violet-50 text-violet-600 border-violet-200',
};

const CATEGORY_COLORS = [
  '#dd0c51', '#3b82f6', '#10b981', '#8b5cf6', '#06b6d4', '#ef4444',
  '#d946ef', '#7c1ac8', '#14b8a6', '#6366f1', '#ec4899', '#84cc16',
];

const CATEGORY_BACKGROUNDS = {
  'Audio Triggers': 'https://static.prod-images.emergentagent.com/jobs/701f0662-a1b9-4b1a-b3cd-31d39c15bdb0/images/cdbc0ec77c67d4102d8e55d4313aa73cb0210199936caa8734bc9d3fff940929.png',
  'Authentication': 'https://static.prod-images.emergentagent.com/jobs/701f0662-a1b9-4b1a-b3cd-31d39c15bdb0/images/ddcc112f784aa15ab27d1f355287d1c35d7040288b22271a30d666cfc155ab28.png',
  'Chat': 'https://static.prod-images.emergentagent.com/jobs/701f0662-a1b9-4b1a-b3cd-31d39c15bdb0/images/1623884d783dc77fb620b7141b19cab668065447d0b4af7bf48658dfaeb34786.png',
  'Content': 'https://static.prod-images.emergentagent.com/jobs/701f0662-a1b9-4b1a-b3cd-31d39c15bdb0/images/2e57c3783c9eb5d8f9f552a215e0fefc2c94ca5962508ed3ad906efb84554e27.png',
  'Logs': 'https://static.prod-images.emergentagent.com/jobs/701f0662-a1b9-4b1a-b3cd-31d39c15bdb0/images/4f16739c844e5dd3896fdf9d635ea53249628b77a538fee5ed6153257303a17d.png',
  'Main Sites': 'https://static.prod-images.emergentagent.com/jobs/701f0662-a1b9-4b1a-b3cd-31d39c15bdb0/images/22f2f45a0fc5b946a4fce7f42e72cdb6a1cee099c233bdf9ae31b1c5411a5148.png',
  'Media': 'https://static.prod-images.emergentagent.com/jobs/701f0662-a1b9-4b1a-b3cd-31d39c15bdb0/images/8db81cf457a5dc2a0479af6355d9137dda931ef1fae1e1eac5875a04dfe41e98.png',
  'Other': 'https://static.prod-images.emergentagent.com/jobs/701f0662-a1b9-4b1a-b3cd-31d39c15bdb0/images/5f02546a9528327087ac36c645eefb895b5a121776c7216b1e7895840de18f80.png',
  'Public': 'https://static.prod-images.emergentagent.com/jobs/701f0662-a1b9-4b1a-b3cd-31d39c15bdb0/images/b298f8d0606e3d28910cb9767ff851b9549c708afe2f5b4ad63c81f08a5bccf8.png',
  'RDS': 'https://static.prod-images.emergentagent.com/jobs/701f0662-a1b9-4b1a-b3cd-31d39c15bdb0/images/51eb36617c111a9a618e323da5489f43bcaaf0e139c26ec379ea0410e524a79f.png',
  'Series': 'https://static.prod-images.emergentagent.com/jobs/701f0662-a1b9-4b1a-b3cd-31d39c15bdb0/images/6980b52fd9ba9df33dfd25a2a992310f115d506bd87a6662aef5ac709f41f901.png',
  'Shows': '/images/api_shows.jpg',
  'Sites': 'https://static.prod-images.emergentagent.com/jobs/701f0662-a1b9-4b1a-b3cd-31d39c15bdb0/images/6dd071033ba8c741f7f70709538bd21f0d6726c1c25ce2071c04c88aa300e46b.png',
  'Stream': 'https://static.prod-images.emergentagent.com/jobs/701f0662-a1b9-4b1a-b3cd-31d39c15bdb0/images/3afc3db3770de3c7909a5f709397c2e01b3b59e8a011476466bfa22e8ecaee4a.png',
  'Teams': 'https://static.prod-images.emergentagent.com/jobs/701f0662-a1b9-4b1a-b3cd-31d39c15bdb0/images/dc0b1b5472311e46eb11b640d3b70db069606fbf6864a24d0cf67cb84d959f37.png',
  'Users': '/images/api_users.jpg',
  'WordPress': 'https://static.prod-images.emergentagent.com/jobs/701f0662-a1b9-4b1a-b3cd-31d39c15bdb0/images/4428e8135ecbf9042058f2dedc916a01ec3434bc0394eb662afcfbb922dddb45.png',
};


/* ═══════════════════════════════════════════════════
   Category Card (isometric style)
   ═══════════════════════════════════════════════════ */
const CategoryCard = ({ category, data, index, isSelected, onClick, color }) => {
  const IconComponent = iconMap[data.icon] || Code;
  const bgImage = CATEGORY_BACKGROUNDS[category] || CATEGORY_BACKGROUNDS['Other'];

  return (
    <motion.div
      data-testid={`endpoint-card-${category}`}
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 + 0.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      onClick={onClick}
      className="cursor-pointer group relative w-[260px] flex-shrink-0"
    >
      <div
        className={`relative rounded-2xl overflow-hidden transition-all duration-300 border ${
          isSelected
            ? 'border-orange-300 shadow-[0_8px_40px_rgba(221,12,81,0.15)] scale-[1.03]'
            : 'border-black/[0.06] shadow-[0_4px_24px_rgba(0,0,0,0.06)] group-hover:shadow-[0_8px_32px_rgba(0,0,0,0.10)] group-hover:scale-[1.02]'
        }`}
        style={{ background: 'linear-gradient(160deg, #ffffff 0%, #f9f8f6 100%)' }}
      >
        {/* Room image */}
        <div className="relative h-[180px] overflow-hidden bg-[#F0F0F2]">
          <img
            src={bgImage}
            alt=""
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            style={{
              WebkitMaskImage: 'radial-gradient(ellipse 60% 65% at center 55%, black 50%, transparent 100%)',
              maskImage: 'radial-gradient(ellipse 60% 65% at center 55%, black 50%, transparent 100%)',
            }}
          />
          <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-lg rounded-lg px-2.5 py-1 border border-black/[0.06] shadow-sm">
            <div className="flex items-center gap-1.5">
              <IconComponent className="w-3 h-3" style={{ color }} />
              <span className="text-[10px] font-bold tracking-wider" style={{ color }}>{category.toUpperCase()}</span>
            </div>
          </div>
          <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-white/90 backdrop-blur-lg rounded-lg px-2 py-1 border border-black/[0.06] shadow-sm">
            <Code className="w-3 h-3 text-zinc-500" />
            <span className="text-[10px] font-semibold text-zinc-600">{data.endpoints.length}</span>
          </div>
        </div>

        <div className="px-3.5 py-3">
          <h3 className="text-sm font-bold text-zinc-800 truncate">{category}</h3>
          <p className="text-[11px] text-zinc-400 mt-0.5 line-clamp-2">{data.description}</p>
          <div className="flex flex-wrap gap-1 mt-2">
            {['GET', 'POST', 'PUT', 'DELETE'].map(m => {
              const count = data.endpoints.filter(e => e.method === m).length;
              if (!count) return null;
              return (
                <span key={m} className={`text-[9px] px-1.5 py-0.5 rounded-md border font-medium ${methodColors[m]}`}>
                  {m} ({count})
                </span>
              );
            })}
          </div>
        </div>

        <div className="h-1" style={{ background: `linear-gradient(90deg, ${color}, ${color}60)` }} />
      </div>

      {isSelected && (
        <motion.div
          layoutId="endpoint-select-bar"
          className="absolute -bottom-2 left-1/2 -translate-x-1/2 h-1 w-12 rounded-full bg-orange-500"
          style={{ boxShadow: '0 0 12px rgba(221,12,81,0.5)' }}
        />
      )}
    </motion.div>
  );
};


/* ═══════════════════════════════════════════════════
   Endpoint Detail Panel (right side)
   ═══════════════════════════════════════════════════ */
const EndpointDetailPanel = ({ category, data, onClose, color }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [methodFilter, setMethodFilter] = useState('all');
  const [copiedPath, setCopiedPath] = useState(null);

  const IconComponent = iconMap[data?.icon] || Code;

  const filtered = (data?.endpoints || []).filter(endpoint => {
    const matchesSearch = !searchQuery ||
      endpoint.path.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (endpoint.description || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesMethod = methodFilter === 'all' || endpoint.method === methodFilter;
    return matchesSearch && matchesMethod;
  });

  const copyPath = (path) => {
    navigator.clipboard.writeText(path);
    setCopiedPath(path);
    setTimeout(() => setCopiedPath(null), 2000);
  };

  return (
    <motion.div
      key="endpoint-detail"
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="absolute right-0 top-0 bottom-0 w-[480px] flex items-start pt-2 z-30"
      data-testid="endpoint-detail-panel"
    >
      <div className="bg-white/95 backdrop-blur-2xl rounded-[20px] border border-black/[0.06] shadow-[0_12px_48px_rgba(0,0,0,0.12)] w-full max-h-[96%] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-black/[0.05] flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${color}12` }}>
              <IconComponent className="w-4.5 h-4.5" style={{ color }} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-zinc-900 truncate">{category}</h3>
              <span className="text-[11px] text-zinc-400">{data.endpoints.length} endpoints &middot; {data.description}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-black/[0.05] transition-colors flex-shrink-0"
            data-testid="endpoint-panel-close"
          >
            <X className="w-4 h-4 text-zinc-400" />
          </button>
        </div>

        {/* Filters */}
        <div className="px-4 py-3 flex items-center gap-2 border-b border-black/[0.05] flex-shrink-0 flex-wrap">
          <div className="relative flex-1 min-w-[140px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-300" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search endpoints..."
              className="w-full pl-7 pr-2 py-1.5 text-xs bg-zinc-50 border border-black/[0.06] rounded-lg text-zinc-700 placeholder:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-900/10"
              data-testid="endpoint-panel-search"
            />
          </div>
          <div className="flex gap-1">
            {['all', 'GET', 'POST', 'PUT', 'DELETE'].map(m => (
              <button
                key={m}
                onClick={() => setMethodFilter(m)}
                className={`px-2 py-1 rounded-md text-[10px] font-medium transition-all ${
                  methodFilter === m
                    ? 'bg-zinc-900 text-white'
                    : 'bg-zinc-50 text-zinc-400 hover:text-zinc-600 border border-black/[0.04]'
                }`}
                data-testid={`panel-filter-${m.toLowerCase()}`}
              >
                {m === 'all' ? 'All' : m}
              </button>
            ))}
          </div>
        </div>

        {/* Endpoint list */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="text-center py-10">
              <Code className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
              <p className="text-xs text-zinc-400">No endpoints found</p>
            </div>
          ) : (
            filtered.map((endpoint, idx) => (
              <div
                key={`${endpoint.method}-${endpoint.path}-${idx}`}
                className="px-4 py-2.5 flex items-center gap-3 hover:bg-zinc-50/50 transition-colors border-b border-black/[0.03] last:border-b-0"
                data-testid={`endpoint-row-${endpoint.method}-${idx}`}
              >
                <span className={`px-2 py-0.5 text-[9px] font-bold rounded-md border min-w-[52px] text-center ${methodColors[endpoint.method] || 'bg-zinc-50 text-zinc-500 border-zinc-200'}`}>
                  {endpoint.method}
                </span>
                <div className="flex-1 min-w-0">
                  <code className="font-mono text-xs text-zinc-700 block truncate">{endpoint.path}</code>
                  {endpoint.description && (
                    <span className="text-[10px] text-zinc-400 block truncate">{endpoint.description}</span>
                  )}
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); copyPath(endpoint.path); }}
                  className="p-1.5 rounded-lg hover:bg-zinc-100 transition-colors shrink-0"
                  data-testid={`copy-endpoint-${idx}`}
                >
                  {copiedPath === endpoint.path ? (
                    <Check className="w-3 h-3 text-emerald-500" />
                  ) : (
                    <Copy className="w-3 h-3 text-zinc-300" />
                  )}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </motion.div>
  );
};


/* ═══════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════ */
const ApiExplorerPage = () => {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);

  useEffect(() => { fetchEndpoints(); }, []);

  const fetchEndpoints = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API}/main-sites/debug/api-endpoints`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to fetch');
      setData(await response.json());
    } catch { toast.error('Failed to load API endpoints'); }
    finally { setLoading(false); }
  };

  const categories = data?.categories || {};
  const categoryEntries = Object.entries(categories);
  const totalEndpoints = Object.values(categories).reduce((sum, cat) => sum + cat.endpoints.length, 0);
  const selectedData = selectedCategory ? categories[selectedCategory] : null;

  if (loading) {
    return (
      <div className="h-screen bg-[#F0F0F2] flex items-center justify-center">
        <div className="flex items-center gap-3 text-zinc-400">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>Loading API endpoints...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#F0F0F2]" style={{ height: '100dvh' }} data-testid="api-explorer-page">
      <NetworkHeader activePage="explorer" />

      {/* Canvas area */}
      <div className="relative flex-1 overflow-hidden">
        {/* Dot pattern */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{
          backgroundImage: 'radial-gradient(circle, #999 0.5px, transparent 0.5px)',
          backgroundSize: '24px 24px',
        }} />

        <div className="absolute inset-0 z-10 flex flex-col p-4 sm:p-5">

        {/* ── Top bar ── */}
        <div className="flex items-start justify-between flex-shrink-0 mb-4">
          <motion.div
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
            className="bg-white/80 backdrop-blur-2xl rounded-2xl border border-black/[0.05] shadow-[0_6px_30px_rgba(0,0,0,0.06)] p-4 flex items-center gap-4"
            data-testid="panel-endpoint-header"
          >
            <button onClick={() => navigate('/network')} className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-black/[0.05] transition-colors" data-testid="endpoint-back-btn">
              <ArrowLeft className="w-4 h-4 text-zinc-400" />
            </button>
            <div>
              <div className="text-[10px] text-zinc-400 uppercase tracking-wider font-medium">API Explorer</div>
              <div className="text-sm font-semibold text-zinc-700">Browse API endpoints</div>
            </div>
            <div className="w-px h-8 bg-black/[0.06] mx-1" />
            <div className="text-3xl font-bold text-zinc-900">{categoryEntries.length}</div>
            <div className="text-sm text-zinc-500">Categories</div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.05 }}
            className="bg-white/80 backdrop-blur-2xl rounded-2xl border border-black/[0.05] shadow-[0_6px_30px_rgba(0,0,0,0.06)] p-4 flex items-center gap-3"
            data-testid="panel-endpoint-stats"
          >
            <div className="flex items-center gap-2">
              <Code className="w-4 h-4 text-orange-500" />
              <span className="text-sm text-zinc-600">Endpoints</span>
              <span className="text-lg font-bold text-zinc-900">{totalEndpoints}</span>
            </div>
            <div className="w-px h-6 bg-black/[0.06]" />
            <Button variant="outline" onClick={fetchEndpoints} size="sm" className="gap-1.5 rounded-xl border-black/10 text-zinc-600 text-xs" data-testid="refresh-endpoints-btn">
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </Button>
          </motion.div>
        </div>

        {/* ── Center: Card area ── */}
        <div className="flex-1 flex justify-center relative overflow-y-auto overflow-x-hidden">
          <div className={`flex flex-wrap justify-center gap-4 sm:gap-6 py-4 content-start transition-all duration-300 ${selectedCategory ? 'mr-[500px]' : ''}`}>
              {categoryEntries.map(([catName, catData], i) => (
                <CategoryCard
                  key={catName}
                  category={catName}
                  data={catData}
                  index={i}
                  color={CATEGORY_COLORS[i % CATEGORY_COLORS.length]}
                  isSelected={selectedCategory === catName}
                  onClick={() => setSelectedCategory(selectedCategory === catName ? null : catName)}
                />
              ))}
          </div>

          {/* Detail panel */}
          <AnimatePresence>
            {selectedCategory && selectedData && (
              <EndpointDetailPanel
                category={selectedCategory}
                data={selectedData}
                color={CATEGORY_COLORS[categoryEntries.findIndex(([k]) => k === selectedCategory) % CATEGORY_COLORS.length]}
                onClose={() => setSelectedCategory(null)}
              />
            )}
          </AnimatePresence>
        </div>

        {/* ── Bottom bar ── */}
        <div className="flex items-end justify-between flex-shrink-0 mt-2">
          {!selectedCategory && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1, duration: 0.5 }}
              className="text-xs text-zinc-400 bg-white/60 backdrop-blur-xl rounded-full px-4 py-2 border border-black/[0.05]"
            >
              Click a category to browse its endpoints
            </motion.div>
          )}
          <div className="flex-1" />
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.4 }}
            className="bg-white/80 backdrop-blur-2xl rounded-2xl border border-black/[0.05] shadow-[0_6px_30px_rgba(0,0,0,0.06)] p-3.5 flex items-center gap-3"
            data-testid="panel-endpoint-status"
          >
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" style={{ boxShadow: '0 0 8px rgba(34,197,94,0.5)' }} />
            <span className="text-sm font-medium text-zinc-700">API Explorer active</span>
            <div className="w-px h-5 bg-black/[0.06]" />
            <Code className="w-4 h-4 text-orange-500" />
            <span className="text-sm font-bold text-zinc-900">{totalEndpoints} endpoints</span>
          </motion.div>
        </div>
        </div>
      </div>
    </div>
  );
};

export default ApiExplorerPage;
