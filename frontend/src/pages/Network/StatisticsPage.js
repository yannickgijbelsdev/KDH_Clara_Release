import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell,
} from 'recharts';
import {
  ArrowLeft, Download, FileText, Users, TrendingUp,
  BarChart3, CheckCircle, Clock, AlertTriangle, Loader2,
  Globe, Award, ChevronDown,
} from 'lucide-react';
import { getAvatarUrl } from '../../utils/avatar';

const API = process.env.REACT_APP_BACKEND_URL;

const COLORS = {
  published: '#22c55e',
  scheduled: '#f59e0b',
  failed: '#ef4444',
  created: '#3b82f6',
  approved: '#22c55e',
  pending: '#f59e0b',
  rejected: '#ef4444',
};

const PIE_COLORS = ['#22c55e', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-zinc-900 border border-zinc-300 rounded-lg px-3 py-2 shadow-xl">
      <p className="text-xs text-zinc-400 mb-1">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="text-sm" style={{ color: entry.color }}>
          {entry.name}: <span className="font-semibold">{entry.value}</span>
        </p>
      ))}
    </div>
  );
};

export default function StatisticsPage() {
  const { mainSiteId } = useParams();
  const { user, token } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [overview, setOverview] = useState(null);
  const [monthly, setMonthly] = useState(null);
  const [authors, setAuthors] = useState(null);
  const [perSite, setPerSite] = useState(null);
  const [weeklyActivity, setWeeklyActivity] = useState(null);

  const headers = { Authorization: `Bearer ${token}` };

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const [overviewRes, monthlyRes, authorsRes, perSiteRes, weeklyRes] = await Promise.all([
        fetch(`${API}/api/statistics/${mainSiteId}/overview`, { headers }),
        fetch(`${API}/api/statistics/${mainSiteId}/monthly?months=12`, { headers }),
        fetch(`${API}/api/statistics/${mainSiteId}/top-authors?limit=10`, { headers }),
        fetch(`${API}/api/statistics/${mainSiteId}/per-site-monthly?months=12`, { headers }),
        fetch(`${API}/api/statistics/${mainSiteId}/weekly-activity?weeks=12`, { headers }),
      ]);

      if (overviewRes.ok) setOverview(await overviewRes.json());
      if (monthlyRes.ok) setMonthly(await monthlyRes.json());
      if (authorsRes.ok) setAuthors(await authorsRes.json());
      if (perSiteRes.ok) setPerSite(await perSiteRes.json());
      if (weeklyRes.ok) setWeeklyActivity(await weeklyRes.json());
    } catch (err) {
      toast.error('Could not load statistics');
    } finally {
      setLoading(false);
    }
  }, [mainSiteId, token]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const exportPDF = async () => {
    setExporting(true);
    try {
      const res = await fetch(`${API}/api/statistics/${mainSiteId}/export-pdf`, { headers });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const siteName = overview?.main_site_name || 'statistics';
      const dateStr = new Date().toISOString().split('T')[0];
      a.download = `${siteName}-report-${dateStr}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('PDF exported');
    } catch (err) {
      toast.error('PDF export failed');
    } finally {
      setExporting(false);
    }
  };

  if (!user?.is_network_admin) {
    return (
      <div className="min-h-screen bg-[#F0F0F2] flex items-center justify-center text-zinc-400">
        Network admin access required
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F0F0F2] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
      </div>
    );
  }

  const totalPublished = overview?.publishing?.published || 0;
  const totalScheduled = overview?.publishing?.scheduled || 0;
  const totalFailed = overview?.publishing?.failed || 0;
  const approvalData = overview?.approval
    ? [
        { name: 'Approved', value: overview.approval.approved, fill: COLORS.approved },
        { name: 'Pending', value: overview.approval.pending, fill: COLORS.pending },
        { name: 'Rejected', value: overview.approval.rejected, fill: COLORS.rejected },
      ].filter(d => d.value > 0)
    : [];

  return (
    <div className="min-h-screen bg-[#F0F0F2] text-white">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#F0F0F2]/80 backdrop-blur-xl border-b border-white/5">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/')}
              data-testid="stats-back-btn"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-lg font-bold" data-testid="stats-title">
                {overview?.main_site_name || 'Statistics'}
              </h1>
              <p className="text-xs text-zinc-500">Content Statistics & Analytics</p>
            </div>
          </div>
          <Button
            onClick={exportPDF}
            disabled={exporting}
            className="gap-2 bg-orange-600 hover:bg-orange-700"
            data-testid="export-pdf-btn"
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Export PDF
          </Button>
        </div>
      </header>

      {/* Report Content */}
      <main className="pt-20 pb-12 px-6 max-w-7xl mx-auto">
        {/* Report Title (visible in PDF) */}
        <div className="mb-8" data-testid="report-header">
          <h2 className="text-2xl font-bold">{overview?.main_site_name} — Content Report</h2>
          <p className="text-sm text-zinc-500 mt-1">
            Generated {new Date().toLocaleDateString('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8" data-testid="kpi-cards">
          <KPICard icon={FileText} label="Total Articles" value={overview?.total_content_items || 0} color="text-blue-400" />
          <KPICard icon={CheckCircle} label="Published" value={totalPublished} color="text-green-400" />
          <KPICard icon={Clock} label="Scheduled" value={totalScheduled} color="text-amber-400" />
          <KPICard icon={AlertTriangle} label="Failed" value={totalFailed} color="text-red-400" />
        </div>

        {/* Per WordPress Site */}
        {overview?.wordpress_sites?.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8" data-testid="wp-site-stats">
            {overview.wordpress_sites.map(site => (
              <div key={site.site_id} className="bg-white/80 backdrop-blur rounded-xl border border-zinc-200 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Globe className="w-4 h-4 text-zinc-500" />
                  <span className="text-sm font-medium">{site.site_name}</span>
                </div>
                <div className="flex gap-6">
                  <div>
                    <p className="text-2xl font-bold text-green-400">{site.published}</p>
                    <p className="text-xs text-zinc-500">Published</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-amber-400">{site.scheduled}</p>
                    <p className="text-xs text-zinc-500">Scheduled</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Monthly Trend Chart */}
          <div className="lg:col-span-2 bg-white/80 backdrop-blur rounded-xl border border-zinc-200 p-5" data-testid="monthly-chart">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4 text-zinc-500" />
              <h3 className="text-sm font-semibold">Monthly Trend (12 months)</h3>
            </div>
            {monthly?.months?.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={monthly.months}>
                  <defs>
                    <linearGradient id="gradPublished" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.published} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={COLORS.published} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradScheduled" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.scheduled} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={COLORS.scheduled} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradCreated" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.created} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={COLORS.created} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#71717a' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#71717a' }} allowDecimals={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="created" name="Created" stroke={COLORS.created} fill="url(#gradCreated)" strokeWidth={2} />
                  <Area type="monotone" dataKey="published" name="Published" stroke={COLORS.published} fill="url(#gradPublished)" strokeWidth={2} />
                  <Area type="monotone" dataKey="scheduled" name="Scheduled" stroke={COLORS.scheduled} fill="url(#gradScheduled)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-zinc-500 text-sm text-center py-12">No data available</p>
            )}
          </div>

          {/* Approval Breakdown */}
          <div className="bg-white/80 backdrop-blur rounded-xl border border-zinc-200 p-5" data-testid="approval-chart">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="w-4 h-4 text-zinc-500" />
              <h3 className="text-sm font-semibold">Approval Status</h3>
            </div>
            {approvalData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={approvalData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {approvalData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex justify-center gap-4 mt-2">
                  {approvalData.map((d, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-xs">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: d.fill }} />
                      <span className="text-zinc-400">{d.name}</span>
                      <span className="font-semibold text-white">{d.value}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-zinc-500 text-sm text-center py-12">No data</p>
            )}
          </div>
        </div>

        {/* Per-Site Monthly Stacked Bar */}
        {perSite?.months?.length > 0 && perSite?.site_names?.length > 0 && (
          <div className="bg-white/80 backdrop-blur rounded-xl border border-zinc-200 p-5 mb-8" data-testid="per-site-chart">
            <div className="flex items-center gap-2 mb-4">
              <Globe className="w-4 h-4 text-zinc-500" />
              <h3 className="text-sm font-semibold">Publishing per WordPress Site</h3>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={perSite.months}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#71717a' }} />
                <YAxis tick={{ fontSize: 11, fill: '#71717a' }} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {perSite.site_names.map((name, i) => (
                  <Bar key={name} dataKey={name} stackId="a" fill={PIE_COLORS[i % PIE_COLORS.length]} radius={i === perSite.site_names.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Weekly Activity */}
        {weeklyActivity?.weeks?.length > 0 && (
          <div className="bg-white/80 backdrop-blur rounded-xl border border-zinc-200 p-5 mb-8" data-testid="weekly-chart">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="w-4 h-4 text-zinc-500" />
              <h3 className="text-sm font-semibold">Weekly Content Activity</h3>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={weeklyActivity.weeks}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#71717a' }} />
                <YAxis tick={{ fontSize: 11, fill: '#71717a' }} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="items_created" name="Items Created" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Category Breakdown */}
        {overview?.categories?.length > 0 && (
          <div className="bg-white/80 backdrop-blur rounded-xl border border-zinc-200 p-5 mb-8" data-testid="category-stats">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="w-4 h-4 text-zinc-500" />
              <h3 className="text-sm font-semibold">Content per Category</h3>
            </div>
            <div className="space-y-2">
              {overview.categories.map((cat, i) => {
                const maxCount = overview.categories[0]?.count || 1;
                const pct = Math.round((cat.count / maxCount) * 100);
                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-xs text-zinc-400 w-36 truncate capitalize">{cat.name}</span>
                    <div className="flex-1 h-5 bg-zinc-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, background: PIE_COLORS[i % PIE_COLORS.length] }}
                      />
                    </div>
                    <span className="text-xs font-semibold text-zinc-600 w-8 text-right">{cat.count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Top Authors */}
        {authors?.authors?.length > 0 && (
          <div className="bg-white/80 backdrop-blur rounded-xl border border-zinc-200 p-5 mb-8" data-testid="top-authors">
            <div className="flex items-center gap-2 mb-4">
              <Award className="w-4 h-4 text-zinc-500" />
              <h3 className="text-sm font-semibold">Top Content Creators</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-zinc-500 text-xs border-b border-zinc-200">
                    <th className="text-left py-2 px-2">#</th>
                    <th className="text-left py-2 px-2">Author</th>
                    <th className="text-right py-2 px-2">Total</th>
                    <th className="text-right py-2 px-2">Approved</th>
                    <th className="text-right py-2 px-2">Published (WP)</th>
                    <th className="text-right py-2 px-2">Pending</th>
                  </tr>
                </thead>
                <tbody>
                  {authors.authors.map((author, i) => (
                    <tr key={author.user_id} className="border-b border-zinc-200/50 hover:bg-zinc-100/30">
                      <td className="py-2.5 px-2">
                        {i < 3 ? (
                          <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                            i === 0 ? 'bg-amber-500/20 text-amber-400' :
                            i === 1 ? 'bg-zinc-400/20 text-zinc-600' :
                            'bg-orange-500/20 text-orange-400'
                          }`}>{i + 1}</span>
                        ) : (
                          <span className="text-zinc-600 text-xs pl-1.5">{i + 1}</span>
                        )}
                      </td>
                      <td className="py-2.5 px-2">
                        <div className="flex items-center gap-2">
                          <AuthorAvatar author={author} />
                          <div>
                            <p className="font-medium text-white text-sm">{author.name}</p>
                            <p className="text-xs text-zinc-500">{author.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="text-right py-2.5 px-2 font-semibold">{author.total_items}</td>
                      <td className="text-right py-2.5 px-2 text-green-400">{author.approved}</td>
                      <td className="text-right py-2.5 px-2 text-blue-400">{author.published_to_wp}</td>
                      <td className="text-right py-2.5 px-2 text-amber-400">{author.pending}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function KPICard({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-white/80 backdrop-blur rounded-xl border border-zinc-200 p-4" data-testid={`kpi-${label.toLowerCase().replace(/\s/g,'-')}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-xs text-zinc-500">{label}</span>
      </div>
      <p className="text-3xl font-bold">{value}</p>
    </div>
  );
}

function AuthorAvatar({ author }) {
  const avatarSrc = getAvatarUrl(author);
  if (avatarSrc) {
    return <img src={avatarSrc} alt="" className="w-8 h-8 rounded-full object-cover" />;
  }
  return (
    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-white text-xs font-bold">
      {author.name?.charAt(0)?.toUpperCase() || '?'}
    </div>
  );
}
