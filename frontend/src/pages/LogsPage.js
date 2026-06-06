/* eslint-disable */
import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../context/PermissionsContext';
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, isToday } from 'date-fns';
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
  Calendar as CalendarIcon,
  Clock,
  Globe,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Activity,
  Archive,
  MessageSquare,
  Radio,
  Image,
  FileCheck,
  Send,
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
  'Sent Chat Message': MessageSquare,
  'Created Content': FileText,
  'Updated Content': Pencil,
  'Deleted Content': Trash2,
  'Created Show': Radio,
  'Updated Show': Pencil,
  'Deleted Show': Trash2,
  'Uploaded Media': Image,
  'Approved Content': FileCheck,
  'Published to WordPress': Send,
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
  settings: 'bg-indigo-500/20 text-indigo-400',
  chat: 'bg-emerald-500/20 text-emerald-400',
  wordpress: 'bg-sky-500/20 text-sky-400'
};

const LogsPage = () => {
  const { isAdmin } = useAuth();
  const { canView, loading: permissionsLoading } = usePermissions();
  const navigate = useNavigate();
  const { mainSiteSlug } = useParams();
  
  // Helper for context-aware navigation
  const navTo = (path) => mainSiteSlug ? `/${mainSiteSlug}${path}` : path;
  
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
  
  // Archive mode
  const [showArchive, setShowArchive] = useState(false);
  const [archiveDates, setArchiveDates] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [archiveLogs, setArchiveLogs] = useState([]);
  const [archiveLoading, setArchiveLoading] = useState(false);

  useEffect(() => {
    if (permissionsLoading) return;
    if (!isAdmin && !canView('activity_logs')) {
      navigate(navTo('/shows'));
      return;
    }
    fetchCategories();
    fetchUsers();
    fetchStats();
  }, [isAdmin, permissionsLoading]);

  useEffect(() => {
    if (!showArchive) {
      fetchLogs();
    }
  }, [page, categoryFilter, userFilter, search, showArchive]);

  useEffect(() => {
    if (showArchive) {
      fetchArchiveDates();
    }
  }, [showArchive]);

  useEffect(() => {
    if (selectedDate) {
      fetchArchiveLogs(selectedDate);
    }
  }, [selectedDate, categoryFilter]);

  const fetchCategories = async () => {
    try {
      const response = await axios.get(`${API}/logs/categories`);
      // Add new categories
      const extendedCategories = [
        ...response.data.categories,
        { value: 'chat', label: 'Chat', description: 'Chat messages and threads' },
        { value: 'wordpress', label: 'WordPress', description: 'WordPress publishing' }
      ];
      setCategories(extendedCategories);
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

  const fetchArchiveDates = async () => {
    try {
      const response = await axios.get(`${API}/logs/archive/dates`);
      setArchiveDates(response.data.dates);
    } catch (error) {
      console.error('Failed to fetch archive dates', error);
    }
  };

  const fetchArchiveLogs = async (date) => {
    setArchiveLoading(true);
    try {
      const params = new URLSearchParams();
      if (categoryFilter !== 'all') {
        params.append('category', categoryFilter);
      }
      const response = await axios.get(`${API}/logs/archive/${date}?${params.toString()}`);
      setArchiveLogs(response.data.logs);
    } catch (error) {
      console.error('Failed to fetch archive logs', error);
    } finally {
      setArchiveLoading(false);
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

  const formatTime = (timestamp) => {
    try {
      return format(parseISO(timestamp), 'HH:mm:ss');
    } catch {
      return timestamp;
    }
  };

  const totalPages = Math.ceil(total / limit);

  // Calendar helpers
  const getDaysInMonth = () => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    return eachDayOfInterval({ start, end });
  };

  const getDateCount = (date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const found = archiveDates.find(d => d.date === dateStr);
    return found ? found.count : 0;
  };

  const previousMonth = () => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const renderLogRow = (log) => {
    const ActionIcon = getActionIcon(log.action);
    return (
      <tr key={log.id} className="border-b border-zinc-200 hover:bg-zinc-100/70">
        <td className="px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-zinc-50 rounded-lg">
              <ActionIcon className="w-4 h-4 text-orange-400" />
            </div>
            <div>
              <p className="text-zinc-700 font-medium">{log.action}</p>
              {log.target_name && (
                <p className="text-zinc-500 text-sm truncate max-w-[200px]">{log.target_name}</p>
              )}
            </div>
          </div>
        </td>
        <td className="px-4 py-3">
          <span className={`px-2 py-1 rounded text-xs font-medium ${categoryColors[log.category] || 'bg-zinc-200 text-zinc-600'}`}>
            {log.category}
          </span>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-zinc-500" />
            <div>
              <p className="text-zinc-600 text-sm">{log.user_name || 'System'}</p>
              <p className="text-zinc-500 text-xs">{log.user_email}</p>
            </div>
          </div>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2 text-zinc-400 text-sm">
            <Clock className="w-4 h-4" />
            {showArchive ? formatTime(log.timestamp) : formatTimestamp(log.timestamp)}
          </div>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2 text-zinc-500 text-sm">
            <Globe className="w-3 h-3" />
            {log.ip_address || '-'}
          </div>
        </td>
      </tr>
    );
  };

  // Check if we should show archive mode option (more than 500 logs)
  const shouldShowArchiveOption = stats && stats.total > 500;

  return (
    <div data-testid="logs-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-zinc-900 mb-1 sm:mb-2">Activity Logs</h1>
          <p className="text-sm text-zinc-400">Track all user actions and system events</p>
        </div>
        <div className="flex gap-2">
          {shouldShowArchiveOption && (
            <Button
              onClick={() => {
                setShowArchive(!showArchive);
                setSelectedDate(null);
              }}
              variant={showArchive ? "default" : "outline"}
              className={showArchive 
                ? "gap-2 bg-orange-500 hover:bg-orange-600 text-white" 
                : "gap-2 border-zinc-300 text-zinc-600 hover:bg-zinc-100"
              }
            >
              <Archive className="w-4 h-4" />
              {showArchive ? 'Exit Archive' : 'View Archive'}
            </Button>
          )}
          <Button
            onClick={() => { fetchLogs(); fetchStats(); }}
            variant="outline"
            className="gap-2 border-zinc-300 text-zinc-600 hover:bg-zinc-100"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white border border-zinc-200 rounded-xl p-4">
            <p className="text-zinc-500 text-sm">Total Events</p>
            <p className="text-2xl font-bold text-zinc-900">{stats.total.toLocaleString()}</p>
          </div>
          <div className="bg-white border border-zinc-200 rounded-xl p-4">
            <p className="text-zinc-500 text-sm">Last 24 Hours</p>
            <p className="text-2xl font-bold text-orange-500">{stats.recent_24h.toLocaleString()}</p>
          </div>
          <div className="bg-white border border-zinc-200 rounded-xl p-4">
            <p className="text-zinc-500 text-sm">Chat Events</p>
            <p className="text-2xl font-bold text-emerald-400">{stats.by_category?.chat || 0}</p>
          </div>
          <div className="bg-white border border-zinc-200 rounded-xl p-4">
            <p className="text-zinc-500 text-sm">Content Events</p>
            <p className="text-2xl font-bold text-green-400">{stats.by_category?.content || 0}</p>
          </div>
        </div>
      )}

      {/* Archive Mode - Calendar */}
      {showArchive && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Calendar */}
          <div className="bg-white border border-zinc-200 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <Button variant="ghost" size="icon" onClick={previousMonth} className="text-zinc-400 hover:text-zinc-700">
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <h3 className="text-lg font-semibold text-zinc-900">
                {format(currentMonth, 'MMMM yyyy')}
              </h3>
              <Button variant="ghost" size="icon" onClick={nextMonth} className="text-zinc-400 hover:text-zinc-700">
                <ChevronRight className="w-5 h-5" />
              </Button>
            </div>
            
            {/* Weekday headers */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
                <div key={day} className="text-center text-xs text-zinc-500 font-medium py-2">
                  {day}
                </div>
              ))}
            </div>
            
            {/* Calendar days */}
            <div className="grid grid-cols-7 gap-1">
              {/* Empty cells for days before the first of the month */}
              {Array.from({ length: startOfMonth(currentMonth).getDay() }).map((_, i) => (
                <div key={`empty-${i}`} className="aspect-square" />
              ))}
              
              {getDaysInMonth().map(day => {
                const dateStr = format(day, 'yyyy-MM-dd');
                const count = getDateCount(day);
                const isSelected = selectedDate === dateStr;
                const hasLogs = count > 0;
                
                return (
                  <button
                    key={dateStr}
                    onClick={() => hasLogs && setSelectedDate(dateStr)}
                    disabled={!hasLogs}
                    className={`
                      aspect-square rounded-lg text-sm relative transition-colors
                      ${isSelected 
                        ? 'bg-orange-500 text-white' 
                        : hasLogs 
                          ? 'bg-zinc-200 text-zinc-900 hover:bg-zinc-300' 
                          : 'text-zinc-600 cursor-not-allowed'
                      }
                      ${isToday(day) && !isSelected ? 'ring-2 ring-orange-500/50' : ''}
                    `}
                  >
                    {format(day, 'd')}
                    {hasLogs && (
                      <span className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] text-[10px] font-bold rounded-full flex items-center justify-center ${isSelected ? 'bg-white text-orange-500' : 'bg-orange-500 text-white'}`}>
                        {count > 99 ? '99+' : count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Archive Logs for Selected Date */}
          <div className="lg:col-span-2">
            {selectedDate ? (
              <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-zinc-200 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-zinc-900">
                      {format(parseISO(selectedDate), 'EEEE, MMMM d, yyyy')}
                    </h3>
                    <p className="text-sm text-zinc-400">{archiveLogs.length} events</p>
                  </div>
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="w-40 bg-zinc-50 border-zinc-200 text-zinc-900">
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-zinc-200">
                      <SelectItem value="all">All Categories</SelectItem>
                      {categories.map((cat) => (
                        <SelectItem key={cat.value} value={cat.value}>
                          {cat.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                {archiveLoading ? (
                  <div className="p-8 text-center">
                    <RefreshCw className="w-8 h-8 text-zinc-500 animate-spin mx-auto mb-2" />
                    <p className="text-zinc-400">Loading logs...</p>
                  </div>
                ) : archiveLogs.length === 0 ? (
                  <div className="p-8 text-center">
                    <Activity className="w-8 h-8 text-zinc-500 mx-auto mb-2" />
                    <p className="text-zinc-400">No logs for this date</p>
                  </div>
                ) : (
                  <div className="max-h-[500px] overflow-y-auto">
                    <table className="w-full">
                      <tbody>
                        {archiveLogs.map(renderLogRow)}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white border border-zinc-200 rounded-xl p-8 text-center h-full flex flex-col items-center justify-center">
                <CalendarIcon className="w-12 h-12 text-zinc-600 mb-4" />
                <h3 className="text-lg font-semibold text-zinc-900 mb-2">Select a Date</h3>
                <p className="text-zinc-400">Click on a date in the calendar to view logs from that day</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Regular Mode - Filters & Table */}
      {!showArchive && (
        <>
          {/* Filters */}
          <div className="bg-white border border-zinc-200 rounded-xl p-4 mb-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <Input
                  data-testid="logs-search"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                  placeholder="Search by action, user, email, or IP..."
                  className="pl-10 bg-zinc-50 border-zinc-200 text-zinc-900 placeholder:text-zinc-400"
                />
              </div>
              
              <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setPage(0); }}>
                <SelectTrigger data-testid="category-filter" className="w-full md:w-48 bg-zinc-50 border-zinc-200 text-zinc-900">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent className="bg-white border-zinc-200">
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Select value={userFilter} onValueChange={(v) => { setUserFilter(v); setPage(0); }}>
                <SelectTrigger data-testid="user-filter" className="w-full md:w-48 bg-zinc-50 border-zinc-200 text-zinc-900">
                  <User className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="All Users" />
                </SelectTrigger>
                <SelectContent className="bg-white border-zinc-200">
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
          <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
            {loading ? (
              <div className="p-8 text-center">
                <RefreshCw className="w-8 h-8 text-zinc-500 animate-spin mx-auto mb-2" />
                <p className="text-zinc-400">Loading activity logs...</p>
              </div>
            ) : logs.length === 0 ? (
              <div className="p-8 text-center">
                <Activity className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-zinc-900 mb-2">No Activity Logs</h3>
                <p className="text-zinc-400">No logs match your current filters</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-zinc-200 bg-white/60">
                        <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Action</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Category</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">User</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Time</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">IP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map(renderLogRow)}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-200">
                    <p className="text-sm text-zinc-400">
                      Showing {page * limit + 1} to {Math.min((page + 1) * limit, total)} of {total} logs
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => Math.max(0, p - 1))}
                        disabled={page === 0}
                        className="bg-transparent border-zinc-300 text-zinc-600 hover:bg-zinc-100 disabled:opacity-50"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <span className="flex items-center px-3 text-sm text-zinc-400">
                        Page {page + 1} of {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                        disabled={page >= totalPages - 1}
                        className="bg-transparent border-zinc-300 text-zinc-600 hover:bg-zinc-100 disabled:opacity-50"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default LogsPage;
