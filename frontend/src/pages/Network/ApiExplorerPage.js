import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';
import {
  Shield, Users, Building, Calendar, FileText, Image, Radio,
  Settings, Globe, Globe2, MessageCircle, Rss, Layers, Folder,
  List, Volume2, ExternalLink, RefreshCw, Database, Code,
  Search, ChevronDown, ChevronRight, Copy, Check, Loader2, ArrowLeft
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const iconMap = {
  'shield': Shield, 'users': Users, 'building': Building, 'calendar': Calendar,
  'file-text': FileText, 'image': Image, 'radio': Radio, 'settings': Settings,
  'globe': Globe, 'globe-2': Globe2, 'message-circle': MessageCircle, 'rss': Rss,
  'layers': Layers, 'folder': Folder, 'list': List, 'volume-2': Volume2,
  'external-link': ExternalLink, 'refresh-cw': RefreshCw, 'database': Database, 'code': Code,
};

const methodColors = {
  'GET': 'bg-emerald-50 text-emerald-600 border-emerald-200',
  'POST': 'bg-blue-50 text-blue-600 border-blue-200',
  'PUT': 'bg-amber-50 text-amber-600 border-amber-200',
  'PATCH': 'bg-orange-50 text-orange-600 border-orange-200',
  'DELETE': 'bg-red-50 text-red-600 border-red-200',
  'WEBSOCKET': 'bg-violet-50 text-violet-600 border-violet-200',
};

const ApiExplorerPage = () => {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState({});
  const [copiedPath, setCopiedPath] = useState(null);
  const [methodFilter, setMethodFilter] = useState('all');

  useEffect(() => { fetchEndpoints(); }, []);

  const fetchEndpoints = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API}/main-sites/debug/api-endpoints`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to fetch');
      const result = await response.json();
      setData(result);
      const expanded = {};
      Object.keys(result.categories || {}).forEach(cat => { expanded[cat] = true; });
      setExpandedCategories(expanded);
    } catch { toast.error('Kon API endpoints niet laden'); }
    finally { setLoading(false); }
  };

  const toggleCategory = (category) => {
    setExpandedCategories(prev => ({ ...prev, [category]: !prev[category] }));
  };

  const expandAll = () => {
    const expanded = {};
    Object.keys(data?.categories || {}).forEach(cat => { expanded[cat] = true; });
    setExpandedCategories(expanded);
  };

  const collapseAll = () => setExpandedCategories({});

  const copyPath = (path) => {
    navigator.clipboard.writeText(path);
    setCopiedPath(path);
    setTimeout(() => setCopiedPath(null), 2000);
  };

  const getFilteredCategories = () => {
    if (!data?.categories) return {};
    const filtered = {};
    const query = searchQuery.toLowerCase();
    Object.entries(data.categories).forEach(([catName, catData]) => {
      const filteredEndpoints = catData.endpoints.filter(endpoint => {
        const matchesSearch = !query ||
          endpoint.path.toLowerCase().includes(query) ||
          endpoint.description.toLowerCase().includes(query) ||
          endpoint.method.toLowerCase().includes(query);
        const matchesMethod = methodFilter === 'all' || endpoint.method === methodFilter;
        return matchesSearch && matchesMethod;
      });
      if (filteredEndpoints.length > 0) {
        filtered[catName] = { ...catData, endpoints: filteredEndpoints };
      }
    });
    return filtered;
  };

  const filteredCategories = getFilteredCategories();
  const totalFiltered = Object.values(filteredCategories).reduce((sum, cat) => sum + cat.endpoints.length, 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center">
        <div className="flex items-center gap-3 text-zinc-400">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>API endpoints laden...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/60 backdrop-blur-2xl border-b border-black/[0.06] shadow-[0_1px_12px_rgba(0,0,0,0.04)]">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/network')} className="rounded-xl text-zinc-400 hover:text-zinc-900">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
                <Code className="w-5 h-5 text-orange-500" />
                API Explorer
              </h1>
              <p className="text-xs text-zinc-400">
                {data?.total_endpoints || 0} endpoints in {data?.total_categories || 0} categorieën
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={fetchEndpoints} className="gap-2 rounded-xl border-black/10 text-zinc-600">
            <RefreshCw className="w-4 h-4" />
            <span className="hidden sm:inline">Vernieuwen</span>
          </Button>
        </div>
      </header>

      {/* Filters */}
      <div className="sticky top-16 z-40 bg-white/50 backdrop-blur-xl border-b border-black/[0.04]">
        <div className="max-w-7xl mx-auto px-6 py-3">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-300" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Zoek endpoints..."
                className="w-full pl-10 pr-3 py-2 text-sm bg-white border border-black/[0.06] rounded-xl text-zinc-700 placeholder:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                data-testid="endpoint-search"
              />
            </div>
            <div className="flex items-center gap-1.5">
              {['all', 'GET', 'POST', 'PUT', 'DELETE'].map(method => (
                <button
                  key={method}
                  onClick={() => setMethodFilter(method)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
                    methodFilter === method
                      ? 'bg-zinc-900 text-white shadow-sm'
                      : 'bg-white text-zinc-400 hover:text-zinc-600 border border-black/[0.06]'
                  }`}
                  data-testid={`filter-${method.toLowerCase()}`}
                >
                  {method === 'all' ? 'Alle' : method}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 border-l border-black/[0.06] pl-3">
              <Button variant="ghost" size="sm" onClick={expandAll} className="text-xs text-zinc-400 hover:text-zinc-700 rounded-lg">
                Uitklappen
              </Button>
              <Button variant="ghost" size="sm" onClick={collapseAll} className="text-xs text-zinc-400 hover:text-zinc-700 rounded-lg">
                Inklappen
              </Button>
            </div>
          </div>
          {searchQuery && (
            <p className="text-xs text-zinc-400 mt-2">{totalFiltered} resultaten gevonden</p>
          )}
        </div>
      </div>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-6 py-6">
        <div className="space-y-3">
          {Object.entries(filteredCategories).map(([categoryName, categoryData]) => {
            const IconComponent = iconMap[categoryData.icon] || Code;
            const isExpanded = expandedCategories[categoryName];
            return (
              <div key={categoryName} className="bg-white rounded-2xl border border-black/[0.06] overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]" data-testid={`category-${categoryName}`}>
                <button
                  onClick={() => toggleCategory(categoryName)}
                  className="w-full px-5 py-3.5 flex items-center justify-between hover:bg-zinc-50/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-orange-50 rounded-xl flex items-center justify-center">
                      <IconComponent className="w-4.5 h-4.5 text-orange-500" />
                    </div>
                    <div className="text-left">
                      <h2 className="font-semibold text-zinc-900 text-sm">{categoryName}</h2>
                      <p className="text-xs text-zinc-400">{categoryData.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] bg-zinc-100 text-zinc-500 px-2 py-0.5 rounded-full font-medium">
                      {categoryData.endpoints.length}
                    </span>
                    {isExpanded ? <ChevronDown className="w-4 h-4 text-zinc-300" /> : <ChevronRight className="w-4 h-4 text-zinc-300" />}
                  </div>
                </button>
                {isExpanded && (
                  <div className="border-t border-black/[0.04]">
                    {categoryData.endpoints.map((endpoint, idx) => (
                      <div
                        key={`${endpoint.method}-${endpoint.path}-${idx}`}
                        className="px-5 py-3 flex items-center gap-4 hover:bg-zinc-50/50 transition-colors border-b border-black/[0.03] last:border-b-0"
                      >
                        <span className={`px-2.5 py-1 text-[10px] font-bold rounded-lg border min-w-[62px] text-center ${methodColors[endpoint.method] || 'bg-zinc-50 text-zinc-500 border-zinc-200'}`}>
                          {endpoint.method}
                        </span>
                        <code className="font-mono text-sm text-zinc-700 flex-1 truncate">
                          {endpoint.path}
                        </code>
                        <span className="text-xs text-zinc-400 max-w-md truncate hidden lg:block">
                          {endpoint.description || '-'}
                        </span>
                        <button
                          onClick={() => copyPath(endpoint.path)}
                          className="p-1.5 rounded-lg hover:bg-zinc-100 transition-colors shrink-0"
                          data-testid={`copy-${endpoint.path}`}
                        >
                          {copiedPath === endpoint.path ? (
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 text-zinc-300" />
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {Object.keys(filteredCategories).length === 0 && (
          <div className="text-center py-16">
            <div className="w-14 h-14 rounded-2xl bg-zinc-100 flex items-center justify-center mx-auto mb-4">
              <Code className="w-7 h-7 text-zinc-300" />
            </div>
            <p className="text-zinc-400 font-medium">Geen endpoints gevonden</p>
            <p className="text-zinc-300 text-sm mt-1">Pas je zoekopdracht of filter aan</p>
          </div>
        )}
      </main>
    </div>
  );
};

export default ApiExplorerPage;
