import { useState, useEffect, useCallback, useRef, memo } from 'react';
import axios from 'axios';
import {
  Radio,
  RefreshCw,
  Wifi,
  WifiOff,
  Music,
  Mic,
  Clock,
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Calendar,
  History,
  Volume2,
  Timer,
} from 'lucide-react';
import { Button } from '../components/ui/button';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Helper to format countdown
const formatCountdown = (seconds) => {
  if (seconds <= 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const getItemTypeIcon = (type) => {
  switch (type) {
    case 'show_name': return <Radio className="w-4 h-4" />;
    case 'now_playing': return <Music className="w-4 h-4" />;
    case 'presenter_name': return <Mic className="w-4 h-4" />;
    case 'scheduled_text': return <Calendar className="w-4 h-4" />;
    case 'audio_trigger': return <Volume2 className="w-4 h-4" />;
    default: return <Radio className="w-4 h-4" />;
  }
};

const getItemTypeLabel = (type) => {
  switch (type) {
    case 'show_name': return 'Show';
    case 'now_playing': return 'Now Playing';
    case 'presenter_name': return 'Presenter';
    case 'scheduled_text': return 'Scheduled';
    case 'audio_trigger': return 'Audio Trigger';
    case 'custom_text': return 'Custom';
    default: return type;
  }
};

// Moved outside parent — React can now properly memo & diff
const StationCard = memo(({ station, data, stationName, staleCountdown, showEndCountdown, scheduledTextCountdown }) => {
  const isLive = data?.live_show?.title;
  const calendarLive = data?.calendar_live_show;
  const isOnline = data?.now_playing?.online;
  const isStale = data?.now_playing?.is_stale;
  const cacheStale = data?.cache_stale;

  const shouldSkipCustom = data?.current_item_type === 'custom_text';
  const displayType = shouldSkipCustom
    ? (isLive ? 'show_name' : 'now_playing')
    : data?.current_item_type;
  const displayText = shouldSkipCustom
    ? (isLive ? data.live_show.title : (data?.now_playing?.song || '-'))
    : data?.current_text;

  return (
    <div className="bg-white rounded-xl p-6 space-y-4">
      {cacheStale && (
        <div className="bg-amber-500/20 border border-amber-500/50 rounded-lg p-3 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-amber-400" />
          <div className="flex-1">
            <p className="text-amber-400 text-sm font-medium">Cache out of sync!</p>
            <p className="text-amber-400/70 text-xs">{data?.cache_stale_reason}</p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="border-amber-500/50 text-amber-400 hover:bg-amber-500/20"
            onClick={() => window.dispatchEvent(new CustomEvent('force-refresh'))}
          >
            Fix
          </Button>
        </div>
      )}

      {/* Station Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
            station === 'mfy' ? 'bg-blue-500/20 text-blue-400' : 'bg-green-500/20 text-green-400'
          }`}>
            <Radio className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-zinc-900">{stationName}</h3>
            <p className="text-sm text-zinc-400 uppercase">{station}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isOnline ? (
            <span className="flex items-center gap-1 text-green-400 text-sm">
              <Wifi className="w-4 h-4" /> Online
            </span>
          ) : (
            <span className="flex items-center gap-1 text-red-400 text-sm">
              <WifiOff className="w-4 h-4" /> Offline
            </span>
          )}
        </div>
      </div>

      {/* Current Output */}
      <div className="bg-white rounded-lg p-4 border border-zinc-200">
        <div className="flex items-center gap-2 mb-2">
          {getItemTypeIcon(displayType)}
          <span className="text-xs text-zinc-400 uppercase tracking-wider">
            {getItemTypeLabel(displayType)}
          </span>
          {data?.scheduled_text_active && (
            <span className="ml-auto px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs rounded">
              Scheduled Active
            </span>
          )}
          {data?.audio_trigger_active && (
            <span className="ml-auto px-2 py-0.5 bg-purple-500/20 text-purple-400 text-xs rounded">
              Audio Trigger
            </span>
          )}
        </div>
        <p className="text-2xl font-bold text-zinc-900 leading-tight" data-testid={`${station}-current-text`}>
          {displayText || '-'}
        </p>
        {isLive && data.live_show.presenters?.length > 0 && (
          <p className="text-sm text-zinc-400 mt-2">
            <Mic className="w-4 h-4 inline mr-1" />
            {data.live_show.presenters.join(', ')}
          </p>
        )}
      </div>

      {/* Status Grid */}
      <div className="grid grid-cols-2 gap-3">
        {/* Live Show */}
        <div className="bg-white rounded-lg p-3 border border-zinc-200">
          <div className="flex items-center justify-between text-zinc-400 text-xs mb-1">
            <div className="flex items-center gap-2">
              <Mic className="w-3 h-3" /> Live Show
            </div>
            {showEndCountdown !== null && showEndCountdown > 0 && (
              <div className={`flex items-center gap-1 ${showEndCountdown < 300 ? 'text-amber-400' : 'text-zinc-500'}`}>
                <Timer className="w-3 h-3" />
                <span>ends in {formatCountdown(showEndCountdown)}</span>
              </div>
            )}
          </div>
          {calendarLive ? (
            <div>
              <p className="text-sm font-medium text-zinc-900 truncate">{calendarLive.title}</p>
              <p className="text-xs text-zinc-500">{calendarLive.start_time} - {calendarLive.end_time}</p>
              {!isLive && (
                <p className="text-xs text-amber-400 mt-1">
                  <AlertCircle className="w-3 h-3 inline mr-1" />Cache not updated
                </p>
              )}
            </div>
          ) : isLive ? (
            <div>
              <p className="text-sm font-medium text-zinc-900 truncate">{data.live_show.title}</p>
              <p className="text-xs text-zinc-500">{data.live_show.start_time} - {data.live_show.end_time}</p>
              <p className="text-xs text-amber-400 mt-1">
                <AlertCircle className="w-3 h-3 inline mr-1" />Show ended (cache stale)
              </p>
            </div>
          ) : (
            <p className="text-sm text-zinc-500">No live show</p>
          )}
        </div>

        {/* Now Playing */}
        <div className="bg-white rounded-lg p-3 border border-zinc-200">
          <div className="flex items-center justify-between text-zinc-400 text-xs mb-1">
            <div className="flex items-center gap-2">
              <Music className="w-3 h-3" /> Now Playing
              {isStale && <span className="text-amber-400">(stale)</span>}
            </div>
            {!isStale && staleCountdown !== null && staleCountdown > 0 && (
              <div className={`flex items-center gap-1 ${staleCountdown < 120 ? 'text-amber-400' : 'text-zinc-500'}`}>
                <Timer className="w-3 h-3" />
                <span>{formatCountdown(staleCountdown)}</span>
              </div>
            )}
          </div>
          <p className="text-sm text-zinc-700 truncate">{data?.now_playing?.song || '-'}</p>
        </div>

        {/* Scheduled Text */}
        <div className="bg-white rounded-lg p-3 border border-zinc-200">
          <div className="flex items-center justify-between text-zinc-400 text-xs mb-1">
            <div className="flex items-center gap-2">
              <Calendar className="w-3 h-3" /> Scheduled Text
            </div>
            {scheduledTextCountdown !== null && scheduledTextCountdown > 0 && !data?.active_scheduled_text && (
              <div className={`flex items-center gap-1 ${scheduledTextCountdown < 60 ? 'text-purple-400 animate-pulse' : 'text-zinc-500'}`}>
                <Timer className="w-3 h-3" />
                <span>{formatCountdown(scheduledTextCountdown)}</span>
              </div>
            )}
          </div>
          {data?.active_scheduled_text ? (
            <div>
              <p className="text-sm font-medium text-purple-400 truncate animate-pulse">{data.active_scheduled_text.text}</p>
              <p className="text-xs text-green-400">LIVE NOW</p>
            </div>
          ) : data?.next_scheduled_text ? (
            <div>
              <p className="text-sm text-zinc-400 truncate">{data.next_scheduled_text.text}</p>
              <p className="text-xs text-zinc-500">{data.next_scheduled_text.recurrence}</p>
            </div>
          ) : (
            <p className="text-sm text-zinc-500">None scheduled</p>
          )}
        </div>

        {/* Sequence Status */}
        <div className="bg-white rounded-lg p-3 border border-zinc-200">
          <div className="flex items-center gap-2 text-zinc-400 text-xs mb-1">
            <RefreshCw className="w-3 h-3" /> Sequence
          </div>
          {data?.sequence_enabled ? (
            <span className="flex items-center gap-1 text-green-400 text-sm">
              <CheckCircle className="w-4 h-4" /> Enabled
            </span>
          ) : (
            <span className="flex items-center gap-1 text-zinc-500 text-sm">
              <AlertCircle className="w-4 h-4" /> Disabled
            </span>
          )}
        </div>
      </div>
    </div>
  );
});

StationCard.displayName = 'StationCard';

const RDSMonitorPage = () => {
  const [monitorData, setMonitorData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [autoSync, setAutoSync] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [forceRefreshing, setForceRefreshing] = useState(false);
  const [lastAutoSync, setLastAutoSync] = useState(null);
  const intervalRef = useRef(null);
  const countdownRef = useRef(null);
  const fetchingRef = useRef(false); // Prevent overlapping fetches
  const abortRef = useRef(null); // AbortController for cancellation
  const lastFetchStartRef = useRef(null); // Track when fetch started (for stuck detection)
  const [fetchErrors, setFetchErrors] = useState(0); // Track consecutive fetch errors

  // Store countdown target timestamps (not relative seconds) to survive tab throttling
  const countdownTargetsRef = useRef({ mfy: null, grk: null });
  const showEndTargetsRef = useRef({ mfy: null, grk: null });
  const scheduledTextTargetsRef = useRef({ mfy: null, grk: null });
  const [tick, setTick] = useState(0);

  // ... (fetchMonitorData defined above)

  // Initialize countdown TARGET TIMESTAMPS when monitorData changes
  useEffect(() => {
    if (!monitorData?.stations) return;

    const now = Date.now();

    // stale_at is an absolute timestamp from the server
    for (const s of ['mfy', 'grk']) {
      const staleAt = monitorData.stations[s]?.now_playing?.stale_at;
      countdownTargetsRef.current[s] = staleAt ? new Date(staleAt).getTime() : null;

      const secEnd = monitorData.stations[s]?.calendar_live_show?.seconds_until_end;
      showEndTargetsRef.current[s] = secEnd != null ? now + secEnd * 1000 : null;

      const secSched = monitorData.stations[s]?.next_scheduled_text?.seconds_until;
      scheduledTextTargetsRef.current[s] = secSched != null ? now + secSched * 1000 : null;
    }
    setTick(t => t + 1);
  }, [monitorData]);

  // Single countdown interval — compute remaining from absolute targets (tab-throttling safe)
  useEffect(() => {
    countdownRef.current = setInterval(() => {
      setTick(t => t + 1); // one re-render per second
    }, 1000);
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, []);

  // Derive countdown SECONDS from target timestamps (computed on every tick)
  const now = Date.now();
  const countdowns = {
    mfy: countdownTargetsRef.current.mfy ? Math.max(0, Math.floor((countdownTargetsRef.current.mfy - now) / 1000)) : null,
    grk: countdownTargetsRef.current.grk ? Math.max(0, Math.floor((countdownTargetsRef.current.grk - now) / 1000)) : null,
  };
  const showEndCountdowns = {
    mfy: showEndTargetsRef.current.mfy ? Math.max(0, Math.floor((showEndTargetsRef.current.mfy - now) / 1000)) : null,
    grk: showEndTargetsRef.current.grk ? Math.max(0, Math.floor((showEndTargetsRef.current.grk - now) / 1000)) : null,
  };
  const scheduledTextCountdowns = {
    mfy: scheduledTextTargetsRef.current.mfy ? Math.max(0, Math.floor((scheduledTextTargetsRef.current.mfy - now) / 1000)) : null,
    grk: scheduledTextTargetsRef.current.grk ? Math.max(0, Math.floor((scheduledTextTargetsRef.current.grk - now) / 1000)) : null,
  };

  const fetchMonitorData = useCallback(async () => {
    // Safety: force-reset the lock if it's been stuck for more than 15 seconds
    if (fetchingRef.current && lastFetchStartRef.current && Date.now() - lastFetchStartRef.current > 15000) {
      console.warn('RDS Monitor: fetch lock stuck, force-resetting');
      fetchingRef.current = false;
    }
    // Prevent overlapping fetches
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    lastFetchStartRef.current = Date.now();

    // Cancel any previous in-flight request
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await axios.get(`${API}/rds-builder/monitor`, {
        signal: controller.signal,
        timeout: 8000, // 8s timeout to prevent hanging requests
      });
      setMonitorData(response.data);
      setLastUpdate(new Date());
      setFetchErrors(0);
    } catch (error) {
      if (!axios.isCancel(error) && error.code !== 'ERR_CANCELED') {
        console.error('Failed to fetch monitor data:', error);
        setFetchErrors(prev => prev + 1);
      }
    } finally {
      setLoading(false);
      fetchingRef.current = false;
      lastFetchStartRef.current = null;
    }
  }, []);

  const forceRefresh = useCallback(async (isAutomatic = false) => {
    if (forceRefreshing) return; // Already refreshing
    setForceRefreshing(true);
    if (isAutomatic) {
      setLastAutoSync(new Date());
    }
    try {
      await axios.post(`${API}/rds-builder/monitor/force-refresh`);
      await new Promise(resolve => setTimeout(resolve, 500));
      // Reset fetching lock so the fetch can proceed
      fetchingRef.current = false;
      await fetchMonitorData();
    } catch (error) {
      console.error('Force refresh failed:', error);
    } finally {
      setForceRefreshing(false);
    }
  }, [fetchMonitorData, forceRefreshing]);

  // Auto-sync: force refresh when cache is stale (throttled to 60s)
  const lastAutoSyncRef = useRef(0);
  useEffect(() => {
    if (!autoSync || !monitorData?.stations) return;

    const mfyStale = monitorData.stations.mfy?.cache_stale;
    const grkStale = monitorData.stations.grk?.cache_stale;

    if ((mfyStale || grkStale) && !forceRefreshing) {
      const ts = Date.now();
      if (ts - lastAutoSyncRef.current > 60000) { // 60s throttle
        lastAutoSyncRef.current = ts;
        forceRefresh(true);
      }
    }
  }, [monitorData, forceRefreshing, forceRefresh, autoSync]);

  // Data refresh every 5 seconds (was 10s)
  useEffect(() => {
    fetchMonitorData();
    if (autoRefresh) {
      intervalRef.current = setInterval(fetchMonitorData, 5000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      // Cancel any pending request on unmount
      if (abortRef.current) abortRef.current.abort();
    };
  }, [fetchMonitorData, autoRefresh]);

  // Restart polling when tab becomes visible again (browsers throttle background tabs)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && autoRefresh) {
        fetchingRef.current = false; // Reset lock
        fetchMonitorData();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [fetchMonitorData, autoRefresh]);

  // Listen for force refresh events from StationCard
  useEffect(() => {
    const handleForceRefresh = () => forceRefresh(false);
    window.addEventListener('force-refresh', handleForceRefresh);
    return () => window.removeEventListener('force-refresh', handleForceRefresh);
  }, [forceRefresh]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F0F0F2] flex items-center justify-center">
        <RefreshCw className="w-8 h-8 text-zinc-400 animate-spin" />
      </div>
    );
  }

  const hasStaleCache = monitorData?.stations?.mfy?.cache_stale || monitorData?.stations?.grk?.cache_stale;

  return (
    <div className="min-h-screen bg-[#F0F0F2] p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900" data-testid="rds-monitor-title">
              RDS Monitor
            </h1>
            <p className="text-zinc-400 text-sm">
              Real-time RDS output monitoring
              {lastAutoSync && (
                <span className="ml-2 text-green-400">
                  &bull; Last auto-sync: {lastAutoSync.toLocaleTimeString()}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <Clock className="w-4 h-4" />
              {monitorData?.timestamp_formatted} ({monitorData?.date_formatted})
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => forceRefresh(false)}
              disabled={forceRefreshing}
              className="gap-2 bg-amber-600 hover:bg-amber-700"
              data-testid="force-refresh-btn"
            >
              <RefreshCw className={`w-4 h-4 ${forceRefreshing ? 'animate-spin' : ''}`} />
              Force Refresh
            </Button>
            <Button
              variant={autoSync ? "default" : "outline"}
              size="sm"
              onClick={() => setAutoSync(!autoSync)}
              className={`gap-2 ${autoSync ? 'bg-green-600 hover:bg-green-700' : ''}`}
              data-testid="auto-sync-toggle"
            >
              <CheckCircle className={`w-4 h-4 ${hasStaleCache && autoSync ? 'animate-pulse' : ''}`} />
              Auto-Sync {autoSync ? 'ON' : 'OFF'}
            </Button>
            <Button
              variant={autoRefresh ? "default" : "outline"}
              size="sm"
              onClick={() => setAutoRefresh(!autoRefresh)}
              className="gap-2"
              data-testid="auto-refresh-toggle"
            >
              <RefreshCw className={`w-4 h-4 ${autoRefresh ? 'animate-spin' : ''}`} />
              {autoRefresh ? 'Auto' : 'Paused'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchMonitorData}
              data-testid="manual-refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Stale data warning */}
        {lastUpdate && ((Date.now() - lastUpdate.getTime()) > 30000) && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm" data-testid="stale-warning">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>Data is niet recent vernieuwd ({Math.round((Date.now() - lastUpdate.getTime()) / 1000)}s geleden). Polling wordt herstart...</span>
            <Button variant="outline" size="sm" onClick={() => { fetchingRef.current = false; fetchMonitorData(); }} className="ml-auto border-amber-500/30 text-amber-400 hover:text-amber-300 text-xs h-6 px-2">
              <RefreshCw className="w-3 h-3 mr-1" /> Refresh Now
            </Button>
          </div>
        )}
        {fetchErrors > 3 && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>Verbindingsproblemen — {fetchErrors} mislukte pogingen</span>
          </div>
        )}

        {/* Station Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <StationCard
            station="mfy"
            stationName="Radio MFY"
            data={monitorData?.stations?.mfy}
            staleCountdown={countdowns.mfy}
            showEndCountdown={showEndCountdowns.mfy}
            scheduledTextCountdown={scheduledTextCountdowns.mfy}
          />
          <StationCard
            station="grk"
            stationName="Radio GRK"
            data={monitorData?.stations?.grk}
            staleCountdown={countdowns.grk}
            showEndCountdown={showEndCountdowns.grk}
            scheduledTextCountdown={scheduledTextCountdowns.grk}
          />
        </div>

        {/* History Section */}
        <div className="bg-white/80 backdrop-blur rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <History className="w-5 h-5 text-zinc-400" />
            <h2 className="text-lg font-semibold text-zinc-900">Recent Changes</h2>
            <span className="text-sm text-zinc-500">
              ({monitorData?.history?.filter(h => h.item_type !== 'custom_text')?.length || 0} entries)
            </span>
          </div>

          {monitorData?.history?.filter(h => h.item_type !== 'custom_text')?.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs text-zinc-500 uppercase tracking-wider border-b border-zinc-200">
                    <th className="pb-3 pr-4">Time</th>
                    <th className="pb-3 pr-4">Station</th>
                    <th className="pb-3 pr-4">Type</th>
                    <th className="pb-3 pr-4">Text</th>
                    <th className="pb-3 pr-4">Presenters</th>
                    <th className="pb-3">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {monitorData.history.filter(h => h.item_type !== 'custom_text').slice(0, 20).map((entry, index) => (
                    <tr key={entry.id || index} className="text-sm">
                      <td className="py-3 pr-4 text-zinc-400 whitespace-nowrap">{entry.timestamp_formatted}</td>
                      <td className="py-3 pr-4">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          entry.station === 'mfy' ? 'bg-blue-500/20 text-blue-400' : 'bg-green-500/20 text-green-400'
                        }`}>
                          {entry.station?.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        <span className="flex items-center gap-1 text-zinc-600">
                          {getItemTypeIcon(entry.item_type)}
                          {getItemTypeLabel(entry.item_type)}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-zinc-900 max-w-xs truncate">{entry.text}</td>
                      <td className="py-3 pr-4 text-zinc-400 max-w-xs truncate">
                        {entry.presenters?.length > 0 ? entry.presenters.join(', ') : '-'}
                      </td>
                      <td className="py-3 text-zinc-500">{entry.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-zinc-500 text-center py-8">
              No history yet. Changes will appear here as the RDS rotates.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default RDSMonitorPage;
