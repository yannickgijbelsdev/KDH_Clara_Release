import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { format, parseISO } from 'date-fns';
import {
  FileText,
  Search,
  Filter,
  User,
  LogIn,
  LogOut,
  Key,
  UserPlus,
  Pencil,
  Trash2,
  Calendar,
  Clock,
  Globe,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Activity,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const actionIcons = {
  'Login': LogIn,
  'Logout': LogOut,
  'Login Failed': LogIn,
  'Password Reset': Key,
  'Password Changed': Key,
  'User Registered': UserPlus,
  'User Invited': UserPlus,
  'Avatar Uploaded': User,
  'Avatar Removed': User,
  'default': Activity
};

const categoryColors = {
  auth: 'bg-blue-500/20 text-blue-400',
  user: 'bg-violet-500/20 text-violet-400',
  show: 'bg-orange-500/20 text-orange-400',
  rundown: 'bg-amber-500/20 text-amber-400',
  content: 'bg-green-500/20 text-green-400',
  media: 'bg-cyan-500/20 text-cyan-400',
  team: 'bg-pink-500/20 text-pink-400',
  settings: 'bg-indigo-500/20 text-indigo-400'
};

const LogsPage = () => {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [limit] = useState(50);
  
  // Filters
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [userFilter, setUserFilter] = useState('all');
  const [categories, setCategories] = useState([]);
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (!isAdmin) {
      navigate('/shows');
      return;
    }
    fetchCategories();
    fetchUsers();
    fetchStats();
  }, [isAdmin]);

  useEffect(() => {
    fetchLogs();
  }, [page, categoryFilter, userFilter, search]);

  const fetchCategories = async () => {
    try {
      const response = await axios.get(`${API}/logs/categories`);
      setCategories(response.data.categories);
    } catch (error) {
      console.error('Failed to fetch categories', error);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await axios.get(`${API}/logs/users`);
      setUsers(response.data);
    } catch (error) {
      console.error('Failed to fetch users', error);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await axios.get(`${API}/logs/stats`);
      setStats(response.data);
    } catch (error) {
      console.error('Failed to fetch stats', error);
    }
  };

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('limit', limit);
      params.append('skip', page * limit);
      
      if (categoryFilter !== 'all') {
        params.append('category', categoryFilter);
      }
      if (userFilter !== 'all') {
        params.append('user_id', userFilter);
      }
      if (search) {
        params.append('search', search);
      }
      
      const response = await axios.get(`${API}/logs?${params.toString()}`);
      setLogs(response.data.logs);
      setTotal(response.data.total);
    } catch (error) {
      console.error('Failed to fetch logs', error);
    } finally {
      setLoading(false);
    }
  };

  const getActionIcon = (action) => {
    return actionIcons[action] || actionIcons.default;
  };

  const formatTimestamp = (timestamp) => {
    try {
      return format(parseISO(timestamp), 'MMM d, yyyy HH:mm:ss');
    } catch {
      return timestamp;
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div data-testid="logs-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-white mb-1 sm:mb-2">Activity Logs</h1>
          <p className="text-sm text-zinc-400">Track all user actions and system events</p>
        </div>
        <Button
          onClick={() => { fetchLogs(); fetchStats(); }}
          variant="outline"
          className="gap-2 border-zinc-700 text-zinc-300 hover:bg-zinc-800"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-4">
            <p className="text-zinc-500 text-sm">Total Events</p>
            <p className="text-2xl font-bold text-white">{stats.total.toLocaleString()}</p>
          </div>
          <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-4">
            <p className="text-zinc-500 text-sm">Last 24 Hours</p>
            <p className="text-2xl font-bold text-orange-500">{stats.recent_24h.toLocaleString()}</p>
          </div>
          <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-4">
            <p className="text-zinc-500 text-sm">Auth Events</p>
            <p className="text-2xl font-bold text-blue-400">{stats.by_category?.auth || 0}</p>
          </div>
          <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-4">
            <p className="text-zinc-500 text-sm">User Events</p>
            <p className="text-2xl font-bold text-violet-400">{stats.by_category?.user || 0}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-[#18181b] border border-zinc-800 rounded-xl p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <Input
              data-testid="logs-search"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              placeholder="Search by action, user, email, or IP..."
              className="pl-10 bg-[#27272a] border-zinc-700 text-white placeholder:text-zinc-500"
            />
          </div>
          
          <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setPage(0); }}>
            <SelectTrigger data-testid="category-filter" className="w-full md:w-48 bg-[#27272a] border-zinc-700 text-white">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent className="bg-[#18181b] border-zinc-800">
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat.value} value={cat.value}>
                  {cat.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Select value={userFilter} onValueChange={(v) => { setUserFilter(v); setPage(0); }}>
            <SelectTrigger data-testid="user-filter" className="w-full md:w-48 bg-[#27272a] border-zinc-700 text-white">
              <User className="w-4 h-4 mr-2" />
              <SelectValue placeholder="All Users" />
            </SelectTrigger>
            <SelectContent className="bg-[#18181b] border-zinc-800">
              <SelectItem value="all">All Users</SelectItem>
              {users.map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  {user.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-[#18181b] border border-zinc-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <RefreshCw className="w-8 h-8 animate-spin text-orange-500 mx-auto mb-2" />
            <p className="text-zinc-400">Loading logs...</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center">
            <FileText className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
            <p className="text-zinc-400">No logs found</p>
          </div>
        ) : (
          <>
            {/* Table Header */}
            <div className="hidden md:grid grid-cols-12 gap-4 p-4 bg-[#27272a] text-sm font-medium text-zinc-400 border-b border-zinc-800">
              <div className="col-span-2">Timestamp</div>
              <div className="col-span-2">User</div>
              <div className="col-span-3">Action</div>
              <div className="col-span-2">Category</div>
              <div className="col-span-2">IP Address</div>
              <div className="col-span-1">Details</div>
            </div>
            
            {/* Table Body */}
            <div className="divide-y divide-zinc-800">
              {logs.map((log) => {
                const ActionIcon = getActionIcon(log.action);
                return (
                  <div
                    key={log.id}
                    data-testid={`log-row-${log.id}`}
                    className="p-4 hover:bg-[#27272a]/50 transition-colors"
                  >
                    {/* Desktop View */}
                    <div className="hidden md:grid grid-cols-12 gap-4 items-center">
                      <div className="col-span-2 text-sm text-zinc-400 font-mono">
                        {formatTimestamp(log.timestamp)}
                      </div>
                      <div className="col-span-2">
                        <p className="text-white text-sm font-medium truncate">{log.user_name || 'System'}</p>
                        <p className="text-xs text-zinc-500 truncate">{log.user_email || '-'}</p>
                      </div>
                      <div className="col-span-3 flex items-center gap-2">
                        <ActionIcon className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                        <div>
                          <p className="text-white text-sm">{log.action}</p>
                          {log.target_name && (
                            <p className="text-xs text-zinc-500 truncate">{log.target_name}</p>
                          )}
                        </div>
                      </div>
                      <div className="col-span-2">
                        <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${categoryColors[log.category] || 'bg-zinc-500/20 text-zinc-400'}`}>
                          {log.category}
                        </span>
                      </div>
                      <div className="col-span-2 text-sm text-zinc-400 font-mono">
                        {log.ip_address || '-'}
                      </div>
                      <div className="col-span-1">
                        {log.details && Object.keys(log.details).length > 0 && (
                          <span className="text-xs text-zinc-500" title={JSON.stringify(log.details)}>
                            {Object.keys(log.details).length} fields
                          </span>
                        )}
                      </div>
                    </div>
                    
                    {/* Mobile View */}
                    <div className="md:hidden space-y-2">
                      <div className="flex items-center justify-between">
                        <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${categoryColors[log.category] || 'bg-zinc-500/20 text-zinc-400'}`}>
                          {log.category}
                        </span>
                        <span className="text-xs text-zinc-500 font-mono">
                          {formatTimestamp(log.timestamp)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <ActionIcon className="w-4 h-4 text-zinc-400" />
                        <span className="text-white font-medium">{log.action}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-zinc-400">{log.user_name || 'System'}</span>
                        <span className="text-zinc-500 font-mono text-xs">{log.ip_address}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
        
        {/* Pagination */}
        {total > limit && (
          <div className="flex items-center justify-between p-4 border-t border-zinc-800">
            <p className="text-sm text-zinc-400">
              Showing {page * limit + 1} - {Math.min((page + 1) * limit, total)} of {total}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="border-zinc-700 text-zinc-300"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm text-zinc-400">
                Page {page + 1} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="border-zinc-700 text-zinc-300"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LogsPage;
