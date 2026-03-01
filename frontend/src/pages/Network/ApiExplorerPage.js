import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { toast } from 'sonner';
import {
  Shield, Users, Building, Calendar, FileText, Image, Radio,
  Settings, Globe, Globe2, MessageCircle, Rss, Layers, Folder,
  List, Volume2, ExternalLink, RefreshCw, Database, Code,
  Search, ChevronDown, ChevronRight, Copy, Check, Loader2, ArrowLeft
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Icon mapping
const iconMap = {
  'shield': Shield,
  'users': Users,
  'building': Building,
  'calendar': Calendar,
  'file-text': FileText,
  'image': Image,
  'radio': Radio,
  'settings': Settings,
  'globe': Globe,
  'globe-2': Globe2,
  'message-circle': MessageCircle,
  'rss': Rss,
  'layers': Layers,
  'folder': Folder,
  'list': List,
  'volume-2': Volume2,
  'external-link': ExternalLink,
  'refresh-cw': RefreshCw,
  'database': Database,
  'code': Code,
};

// Method badge colors
const methodColors = {
  'GET': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  'POST': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'PUT': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  'PATCH': 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  'DELETE': 'bg-red-500/20 text-red-400 border-red-500/30',
  'WEBSOCKET': 'bg-violet-500/20 text-violet-400 border-violet-500/30',
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

  useEffect(() => {
    fetchEndpoints();
  }, []);

  const fetchEndpoints = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API}/main-sites/debug/api-endpoints`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to fetch');
      const result = await response.json();
      setData(result);
      
      // Expand all categories by default
      const expanded = {};
      Object.keys(result.categories || {}).forEach(cat => {
        expanded[cat] = true;
      });
      setExpandedCategories(expanded);
    } catch (error) {
      toast.error('Kon API endpoints niet laden');
    } finally {
      setLoading(false);
    }
  };

  const toggleCategory = (category) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  const expandAll = () => {
    const expanded = {};
    Object.keys(data?.categories || {}).forEach(cat => {
      expanded[cat] = true;
    });
    setExpandedCategories(expanded);
  };

  const collapseAll = () => {
    setExpandedCategories({});
  };

  const copyPath = (path) => {
    navigator.clipboard.writeText(path);
    setCopiedPath(path);
    setTimeout(() => setCopiedPath(null), 2000);
  };

  // Filter endpoints based on search and method filter
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
        filtered[catName] = {
          ...catData,
          endpoints: filteredEndpoints
        };
      }
    });
    
    return filtered;
  };

  const filteredCategories = getFilteredCategories();
  const totalFiltered = Object.values(filteredCategories).reduce(
    (sum, cat) => sum + cat.endpoints.length, 0
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <div className="flex items-center gap-3 text-zinc-400">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>API endpoints laden...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090b]">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#09090b]/95 backdrop-blur border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/clara-global')}
                className="gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Terug
              </Button>
              <div>
                <h1 className="text-xl font-bold text-white flex items-center gap-2">
                  <Code className="w-5 h-5 text-orange-500" />
                  API Explorer
                </h1>
                <p className="text-sm text-zinc-400">
                  {data?.total_endpoints || 0} endpoints in {data?.total_categories || 0} categorieën
                </p>
              </div>
            </div>
            <Button variant="outline" onClick={fetchEndpoints} className="gap-2">
              <RefreshCw className="w-4 h-4" />
              Vernieuwen
            </Button>
          </div>
        </div>
      </header>

      {/* Filters */}
      <div className="sticky top-[73px] z-40 bg-[#09090b]/95 backdrop-blur border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-6 py-3">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Zoek endpoints..."
                className="pl-10 bg-zinc-900 border-zinc-800"
              />
            </div>
            
            <div className="flex items-center gap-2">
              <span className="text-sm text-zinc-400">Filter:</span>
              {['all', 'GET', 'POST', 'PUT', 'DELETE'].map(method => (
                <Button
                  key={method}
                  variant={methodFilter === method ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setMethodFilter(method)}
                  className={methodFilter === method ? '' : 'text-zinc-400'}
                >
                  {method === 'all' ? 'Alle' : method}
                </Button>
              ))}
            </div>
            
            <div className="flex items-center gap-2 border-l border-zinc-800 pl-4">
              <Button variant="ghost" size="sm" onClick={expandAll}>
                Alles uitklappen
              </Button>
              <Button variant="ghost" size="sm" onClick={collapseAll}>
                Alles inklappen
              </Button>
            </div>
          </div>
          
          {searchQuery && (
            <p className="text-sm text-zinc-500 mt-2">
              {totalFiltered} resultaten gevonden
            </p>
          )}
        </div>
      </div>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-6 py-6">
        <div className="space-y-4">
          {Object.entries(filteredCategories).map(([categoryName, categoryData]) => {
            const IconComponent = iconMap[categoryData.icon] || Code;
            const isExpanded = expandedCategories[categoryName];
            
            return (
              <div key={categoryName} className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
                {/* Category Header */}
                <button
                  onClick={() => toggleCategory(categoryName)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-zinc-800/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-orange-500/10 rounded-lg">
                      <IconComponent className="w-5 h-5 text-orange-500" />
                    </div>
                    <div className="text-left">
                      <h2 className="font-semibold text-white">{categoryName}</h2>
                      <p className="text-sm text-zinc-400">{categoryData.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded">
                      {categoryData.endpoints.length} endpoints
                    </span>
                    {isExpanded ? (
                      <ChevronDown className="w-5 h-5 text-zinc-400" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-zinc-400" />
                    )}
                  </div>
                </button>
                
                {/* Endpoints List */}
                {isExpanded && (
                  <div className="border-t border-zinc-800">
                    {categoryData.endpoints.map((endpoint, idx) => (
                      <div
                        key={`${endpoint.method}-${endpoint.path}-${idx}`}
                        className="px-4 py-3 flex items-center gap-4 hover:bg-zinc-800/30 transition-colors border-b border-zinc-800/50 last:border-b-0"
                      >
                        {/* Method Badge */}
                        <span className={`px-2 py-1 text-xs font-bold rounded border min-w-[70px] text-center ${methodColors[endpoint.method] || 'bg-zinc-800 text-zinc-400'}`}>
                          {endpoint.method}
                        </span>
                        
                        {/* Path */}
                        <code className="font-mono text-sm text-white flex-1 truncate">
                          {endpoint.path}
                        </code>
                        
                        {/* Description */}
                        <span className="text-sm text-zinc-400 max-w-md truncate hidden lg:block">
                          {endpoint.description || '-'}
                        </span>
                        
                        {/* Copy Button */}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyPath(endpoint.path)}
                          className="shrink-0"
                        >
                          {copiedPath === endpoint.path ? (
                            <Check className="w-4 h-4 text-emerald-500" />
                          ) : (
                            <Copy className="w-4 h-4 text-zinc-500" />
                          )}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        
        {Object.keys(filteredCategories).length === 0 && (
          <div className="text-center py-12 text-zinc-500">
            <Code className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Geen endpoints gevonden</p>
          </div>
        )}
      </main>
    </div>
  );
};

export default ApiExplorerPage;
