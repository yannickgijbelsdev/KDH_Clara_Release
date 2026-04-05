import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Radio, Users, FileText, Calendar, ArrowRight, Search, ChevronLeft, ChevronRight, Mic, Clock } from 'lucide-react';
import { motion } from 'framer-motion';
import { useMainSite } from '../context/MainSiteContext';
import { useAuth } from '../context/AuthContext';
import { getAvatarUrl } from '../utils/avatar';

const API = process.env.REACT_APP_BACKEND_URL;

const STUDIO_IMG = 'https://static.prod-images.emergentagent.com/jobs/701f0662-a1b9-4b1a-b3cd-31d39c15bdb0/images/9c133714c33f42124837a555a90289699f0f5190e464c69e21122133740a9121.png';

const Panel = ({ children, className = '', delay = 0, testId }) => (
  <motion.div
    data-testid={testId}
    initial={{ opacity: 0, y: 12, scale: 0.97 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
    className={`bg-white/80 backdrop-blur-2xl rounded-[20px] border border-black/[0.05] shadow-[0_8px_40px_rgba(0,0,0,0.08)] ${className}`}
  >
    {children}
  </motion.div>
);

export default function DashboardHome() {
  const { mainSite, mainSiteSlug } = useMainSite();
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [shows, setShows] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [contentCount, setContentCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!mainSite?.id || !token) return;
    setLoading(true);
    const headers = { Authorization: `Bearer ${token}`, 'X-Main-Site-Id': mainSite.id };
    try {
      const [showsRes, usersRes, contentRes] = await Promise.allSettled([
        fetch(`${API}/api/shows?main_site_id=${mainSite.id}`, { headers }),
        fetch(`${API}/api/main-sites/${mainSite.id}/users`, { headers }),
        fetch(`${API}/api/content?main_site_id=${mainSite.id}&limit=1`, { headers }),
      ]);
      if (showsRes.status === 'fulfilled' && showsRes.value.ok) {
        const d = await showsRes.value.json();
        setShows(Array.isArray(d) ? d : d.shows || []);
      }
      if (usersRes.status === 'fulfilled' && usersRes.value.ok) {
        const d = await usersRes.value.json();
        setTeamMembers(Array.isArray(d) ? d : []);
      }
      if (contentRes.status === 'fulfilled' && contentRes.value.ok) {
        const d = await contentRes.value.json();
        setContentCount(d.total || (Array.isArray(d) ? d.length : 0));
      }
    } catch (e) {
      console.error('Dashboard fetch error:', e);
    }
    setLoading(false);
  }, [mainSite?.id, token]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const firstName = user?.name?.split(' ')[0] || 'User';
  const activeShows = shows.filter(s => s.status === 'active' || !s.status);
  const now = new Date();
  const hours = now.getHours();
  const greeting = hours < 12 ? 'Good morning' : hours < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <>
      {/* Central Studio Image */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
        <motion.img
          src={STUDIO_IMG}
          alt="Radio Studio"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 0.45, scale: 1 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="w-[55%] max-w-[780px] object-contain select-none"
          draggable={false}
        />
      </div>

      {/* Fade edges */}
      <div className="absolute inset-0 pointer-events-none z-[1]" style={{
        background: 'radial-gradient(ellipse at center, transparent 25%, #F0F0F2 68%)',
      }} />

      {/* ── Panels ── */}
      <div className="absolute inset-0 z-10 p-5 pointer-events-none">
        <div className="relative w-full h-full">

          {/* TOP-LEFT: Shows counter */}
          <Panel
            testId="panel-shows-counter"
            className="absolute top-0 left-0 px-6 py-5 pointer-events-auto"
            delay={0}
          >
            <div className="flex items-center gap-5">
              <div>
                <span className="text-4xl font-bold text-zinc-900 tabular-nums">{loading ? '—' : activeShows.length}</span>
                <p className="text-xs text-zinc-400 mt-0.5 font-medium">Active Shows</p>
              </div>
              <div className="w-px h-10 bg-zinc-200" />
              <div>
                <span className="text-4xl font-bold text-zinc-900 tabular-nums">{loading ? '—' : teamMembers.length}</span>
                <p className="text-xs text-zinc-400 mt-0.5 font-medium">Team Members</p>
              </div>
              <button
                onClick={() => navigate(`/${mainSiteSlug}/shows`)}
                className="ml-3 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-5 py-2.5 rounded-full transition-colors flex items-center gap-2 shadow-lg shadow-orange-500/25"
              >
                Open Shows
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </Panel>

          {/* TOP-RIGHT: Welcome */}
          <Panel
            testId="panel-welcome"
            className="absolute top-0 right-0 px-6 py-5 max-w-[380px] pointer-events-auto"
            delay={0.06}
          >
            <h2 className="text-xl font-bold text-zinc-900">
              {greeting}, {firstName}!
            </h2>
            <p className="text-sm text-zinc-400 mt-1 leading-relaxed">
              Let's manage <strong className="text-zinc-600">{mainSite?.name || 'your station'}</strong> today.
            </p>
          </Panel>

          {/* LEFT FLOATING: On-Air / Live card */}
          <Panel
            testId="panel-live-show"
            className="absolute top-[38%] left-0 -translate-y-1/2 w-[260px] overflow-hidden pointer-events-auto"
            delay={0.12}
          >
            <div className="bg-gradient-to-br from-orange-500 to-amber-500 px-5 py-4 text-white">
              <div className="flex items-center gap-2 mb-2">
                <Mic className="w-4 h-4" />
                <span className="text-xs font-semibold uppercase tracking-wide">On Air</span>
              </div>
              <p className="text-lg font-bold leading-tight">
                {activeShows.length > 0 ? activeShows[0].name : 'No live show'}
              </p>
            </div>
            <div className="px-5 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-2xl font-bold text-zinc-900">{shows.length}</span>
                  <p className="text-xs text-zinc-400">Total shows</p>
                </div>
                <button
                  onClick={() => navigate(`/${mainSiteSlug}/calendar`)}
                  className="bg-zinc-900 text-white text-xs font-semibold px-4 py-2 rounded-full hover:bg-zinc-800 transition-colors flex items-center gap-1.5"
                >
                  <Calendar className="w-3.5 h-3.5" />
                  Schedule
                </button>
              </div>
            </div>
          </Panel>

          {/* RIGHT: Quick Nav / Schedule */}
          <Panel
            testId="panel-schedule"
            className="absolute top-[10%] right-0 w-[240px] pointer-events-auto"
            delay={0.18}
          >
            <div className="px-5 pt-4 pb-3">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Navigation</span>
                <div className="flex gap-1">
                  <button className="w-6 h-6 rounded-full bg-zinc-100 flex items-center justify-center hover:bg-zinc-200 transition-colors">
                    <ChevronLeft className="w-3.5 h-3.5 text-zinc-500" />
                  </button>
                  <button className="w-6 h-6 rounded-full bg-zinc-100 flex items-center justify-center hover:bg-zinc-200 transition-colors">
                    <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                {[
                  { label: 'Shows', icon: Radio, to: 'shows', color: 'text-orange-500 bg-orange-50' },
                  { label: 'Calendar', icon: Calendar, to: 'calendar', color: 'text-blue-500 bg-blue-50' },
                  { label: 'Content', icon: FileText, to: 'content', color: 'text-violet-500 bg-violet-50' },
                  { label: 'Team', icon: Users, to: 'team', color: 'text-emerald-500 bg-emerald-50' },
                ].map(item => (
                  <button
                    key={item.to}
                    onClick={() => navigate(`/${mainSiteSlug}/${item.to}`)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-zinc-50 transition-colors group"
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${item.color}`}>
                      <item.icon className="w-4 h-4" />
                    </div>
                    <span className="text-sm font-medium text-zinc-700 group-hover:text-zinc-900">{item.label}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-zinc-300 ml-auto group-hover:text-zinc-500 transition-colors" />
                  </button>
                ))}
              </div>
            </div>

            {/* Stats section */}
            <div className="border-t border-zinc-100 px-5 py-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-xs text-zinc-500">Content Items</span>
                </div>
                <span className="text-sm font-bold text-zinc-800">{contentCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-orange-500" />
                  <span className="text-xs text-zinc-500">Active Shows</span>
                </div>
                <span className="text-sm font-bold text-zinc-800">{activeShows.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  <span className="text-xs text-zinc-500">Team Size</span>
                </div>
                <span className="text-sm font-bold text-zinc-800">{teamMembers.length}</span>
              </div>
            </div>
          </Panel>

          {/* BOTTOM-LEFT: Team members */}
          <Panel
            testId="panel-team"
            className="absolute bottom-0 left-0 w-[280px] pointer-events-auto"
            delay={0.24}
          >
            <div className="px-5 py-4">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-semibold text-zinc-800">Team Members</span>
                <button
                  onClick={() => navigate(`/${mainSiteSlug}/team`)}
                  className="w-7 h-7 rounded-full bg-zinc-100 flex items-center justify-center hover:bg-zinc-200 transition-colors"
                >
                  <Search className="w-3.5 h-3.5 text-zinc-500" />
                </button>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {teamMembers.slice(0, 6).map((member, i) => (
                  <div key={member.id || i} className="relative group">
                    {getAvatarUrl(member) ? (
                      <img
                        src={getAvatarUrl(member)}
                        alt={member.name}
                        className="w-10 h-10 rounded-full object-cover border-2 border-white shadow-sm"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center text-white font-semibold text-xs border-2 border-white shadow-sm">
                        {member.name?.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-zinc-400 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                      {member.name?.split(' ')[0]}
                    </span>
                  </div>
                ))}
                {teamMembers.length > 6 && (
                  <div className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500 text-xs font-bold border-2 border-white">
                    +{teamMembers.length - 6}
                  </div>
                )}
                {teamMembers.length === 0 && !loading && (
                  <p className="text-xs text-zinc-400">No team members yet</p>
                )}
              </div>
            </div>
          </Panel>

          {/* BOTTOM-RIGHT: Station Metrics */}
          <Panel
            testId="panel-metrics"
            className="absolute bottom-0 right-0 w-[260px] pointer-events-auto"
            delay={0.3}
          >
            <div className="px-5 py-4">
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Station Metrics</span>
              <div className="mt-3 space-y-3">
                {[
                  { label: 'Shows', value: shows.length, unit: 'total', color: 'bg-orange-500', pct: Math.min(shows.length * 10, 100) },
                  { label: 'Content', value: contentCount, unit: 'items', color: 'bg-violet-500', pct: Math.min(contentCount * 5, 100) },
                  { label: 'Team', value: teamMembers.length, unit: 'members', color: 'bg-emerald-500', pct: Math.min(teamMembers.length * 15, 100) },
                ].map(stat => (
                  <div key={stat.label}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-zinc-500">{stat.label}</span>
                      <span className="text-sm font-bold text-zinc-800">
                        {stat.value} <span className="text-xs font-normal text-zinc-400">{stat.unit}</span>
                      </span>
                    </div>
                    <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${stat.pct}%` }}
                        transition={{ duration: 0.8, delay: 0.4 }}
                        className={`h-full rounded-full ${stat.color}`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Panel>

          {/* BOTTOM-CENTER: Quick time info */}
          <Panel
            testId="panel-time"
            className="absolute bottom-0 left-1/2 -translate-x-1/2 pointer-events-auto"
            delay={0.2}
          >
            <div className="px-6 py-3 flex items-center gap-4">
              <Clock className="w-4 h-4 text-zinc-400" />
              <span className="text-sm font-medium text-zinc-600">
                {now.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </span>
              <span className="text-sm font-bold text-zinc-900 tabular-nums">
                {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </Panel>

        </div>
      </div>
    </>
  );
}
