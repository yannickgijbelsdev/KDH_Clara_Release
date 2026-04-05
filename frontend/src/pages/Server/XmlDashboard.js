import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useMainSite } from '../../context/MainSiteContext';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { toast } from 'sonner';
import {
  FileText, Download, Trash2, Eye, ChevronLeft, ChevronRight,
  Upload, Search, Filter, ArrowUpDown, Loader2, CheckCircle2, XCircle, Clock
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const STATUS_CONFIG = {
  processing: { icon: Clock, label: 'Processing', cls: 'text-yellow-400 bg-yellow-400/10 border-yellow-500/20' },
  success: { icon: CheckCircle2, label: 'Success', cls: 'text-emerald-400 bg-emerald-400/10 border-emerald-500/20' },
  failed: { icon: XCircle, label: 'Failed', cls: 'text-red-400 bg-red-400/10 border-red-500/20' },
};

export default function XmlDashboard() {
  const { mainSite } = useMainSite();
  const navigate = useNavigate();
  const [imports, setImports] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [sortOrder, setSortOrder] = useState('desc');
  const [loading, setLoading] = useState(true);

  const fetchImports = useCallback(async () => {
    if (!mainSite) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        main_site_id: mainSite.id,
        page: page.toString(),
        page_size: '15',
        sort_by: 'upload_date',
        sort_order: sortOrder,
      });
      if (statusFilter) params.set('status', statusFilter);
      const { data } = await axios.get(`${API}/xml-imports?${params}`);
      setImports(data.imports || []);
      setTotal(data.total || 0);
      setTotalPages(data.total_pages || 1);
    } catch (err) {
      toast.error('Failed to load imports');
    }
    setLoading(false);
  }, [mainSite, page, statusFilter, sortOrder]);

  useEffect(() => { fetchImports(); }, [fetchImports]);

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this import?')) return;
    try {
      await axios.delete(`${API}/xml-imports/${id}`);
      toast.success('Import deleted');
      fetchImports();
    } catch { toast.error('Failed to delete'); }
  };

  const handleDownload = (id, fileName) => {
    window.open(`${API}/xml-imports/${id}/download`, '_blank');
  };

  const filtered = search
    ? imports.filter(i => i.file_name?.toLowerCase().includes(search.toLowerCase()) || i.project_name?.toLowerCase().includes(search.toLowerCase()))
    : imports;

  return (
    <div className="space-y-6" data-testid="xml-dashboard">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">XML Imports</h1>
          <p className="text-sm text-zinc-400 mt-1">{total} imports total</p>
        </div>
        <Button
          onClick={() => navigate('xml-upload')}
          className="bg-orange-500 hover:bg-orange-600 text-white"
          data-testid="upload-xml-btn"
        >
          <Upload className="w-4 h-4 mr-2" />
          Upload XML
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <Input
            placeholder="Search files..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 bg-zinc-100/70 border-zinc-300 text-white h-9"
            data-testid="xml-search-input"
          />
        </div>
        <div className="flex gap-1">
          {['', 'processing', 'success', 'failed'].map(s => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setPage(1); }}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                statusFilter === s ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-200 border border-zinc-300'
              }`}
              data-testid={`filter-${s || 'all'}`}
            >
              {s ? STATUS_CONFIG[s]?.label : 'All'}
            </button>
          ))}
        </div>
        <button
          onClick={() => setSortOrder(o => o === 'desc' ? 'asc' : 'desc')}
          className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium bg-zinc-800 text-zinc-400 hover:bg-zinc-200 border border-zinc-300"
          data-testid="sort-toggle"
        >
          <ArrowUpDown className="w-3 h-3" />
          {sortOrder === 'desc' ? 'Newest first' : 'Oldest first'}
        </button>
      </div>

      {/* Table */}
      <div className="bg-white/60 border border-zinc-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="xml-table">
            <thead>
              <tr className="border-b border-zinc-200">
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase">File name</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase hidden md:table-cell">Project</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase hidden lg:table-cell">Upload date</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase">Source</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 uppercase">Status</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-zinc-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-zinc-500"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-zinc-500">No imports found</td></tr>
              ) : filtered.map(imp => {
                const st = STATUS_CONFIG[imp.status] || STATUS_CONFIG.processing;
                const StIcon = st.icon;
                return (
                  <tr key={imp.id} className="border-b border-zinc-200/50 hover:bg-zinc-100/30 transition-colors" data-testid={`import-row-${imp.id}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                        <span className="text-white truncate max-w-[200px]">{imp.file_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-zinc-400 hidden md:table-cell truncate max-w-[150px]">{imp.project_name || '-'}</td>
                    <td className="px-4 py-3 text-zinc-500 hidden lg:table-cell text-xs">
                      {new Date(imp.upload_date).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded ${imp.source === 'agent' ? 'bg-blue-500/10 text-blue-400' : 'bg-zinc-200 text-zinc-600'}`}>
                        {imp.source === 'agent' ? 'Agent' : 'Manual'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border ${st.cls}`}>
                        <StIcon className="w-3 h-3" />{st.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => navigate(`xml-imports/${imp.id}`)} className="p-1.5 rounded hover:bg-zinc-200 text-zinc-400 hover:text-white" title="View" data-testid={`view-${imp.id}`}>
                          <Eye className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDownload(imp.id, imp.file_name)} className="p-1.5 rounded hover:bg-zinc-200 text-zinc-400 hover:text-white" title="Download">
                          <Download className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(imp.id)} className="p-1.5 rounded hover:bg-red-500/20 text-zinc-400 hover:text-red-400" title="Delete" data-testid={`delete-${imp.id}`}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-200">
            <span className="text-xs text-zinc-500">Page {page} of {totalPages}</span>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="h-7 text-zinc-400">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="h-7 text-zinc-400">
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
