import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import {
  Radio,
  RefreshCw,
  Wifi,
  WifiOff,
  Music,
  Mic,
  Clock,
  Users,
  AlertCircle,
  CheckCircle,
  Calendar,
  History,
  Volume2,
} from 'lucide-react';
import { Button } from '../components/ui/button';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const RDSMonitorPage = () => {
  const [monitorData, setMonitorData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const intervalRef = useRef(null);

  const fetchMonitorData = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/rds-builder/monitor`);
      setMonitorData(response.data);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Failed to fetch monitor data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMonitorData();

    if (autoRefresh) {
      intervalRef.current = setInterval(fetchMonitorData, 2000); // Refresh every 2 seconds
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchMonitorData, autoRefresh]);

  const getItemTypeIcon = (type) => {
    switch (type) {
      case 'show_name':
        return <Radio className="w-4 h-4" />;
      case 'now_playing':
        return <Music className="w-4 h-4" />;
      case 'presenter_name':
        return <Mic className="w-4 h-4" />;
      case 'scheduled_text':
        return <Calendar className="w-4 h-4" />;
      case 'audio_trigger':
        return <Volume2 className="w-4 h-4" />;
      default:
        return <Radio className="w-4 h-4" />;
    }
  };

  const getItemTypeLabel = (type) => {
    switch (type) {
      case 'show_name':
        return 'Show';
      case 'now_playing':
        return 'Now Playing';
      case 'presenter_name':
        return 'Presenter';
      case 'scheduled_text':
        return 'Scheduled';
      case 'audio_trigger':
        return 'Audio Trigger';
      case 'custom_text':
        return 'Custom';
      default:
        return type;
    }
  };

  const StationCard = ({ station, data, stationName }) => {
    const isLive = data?.live_show?.title;
    const isOnline = data?.now_playing?.online;
    
    // Skip custom_text - show live show, now_playing, or fallback
    const shouldSkipCustom = data?.current_item_type === 'custom_text';
    const displayType = shouldSkipCustom 
      ? (isLive ? 'show_name' : 'now_playing')
      : data?.current_item_type;
    const displayText = shouldSkipCustom
      ? (isLive ? data.live_show.title : (data?.now_playing?.song || '-'))
      : data?.current_text;

    return (
      <div className="bg-zinc-900 rounded-xl p-6 space-y-4">
        {/* Station Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
              station === 'mfy' ? 'bg-blue-500/20 text-blue-400' : 'bg-green-500/20 text-green-400'
            }`}>
              <Radio className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">{stationName}</h3>
              <p className="text-sm text-zinc-400 uppercase">{station}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isOnline ? (
              <span className="flex items-center gap-1 text-green-400 text-sm">
                <Wifi className="w-4 h-4" />
                Online
              </span>
            ) : (
              <span className="flex items-center gap-1 text-red-400 text-sm">
                <WifiOff className="w-4 h-4" />
                Offline
              </span>
            )}
          </div>
        </div>

        {/* Current Output - Large Display */}
        <div className="bg-zinc-800/50 rounded-lg p-4 border border-zinc-700">
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
          <p className="text-2xl font-bold text-white leading-tight" data-testid={`${station}-current-text`}>
            {displayText || '-'}
          </p>
        </div>

        {/* Status Grid */}
        <div className="grid grid-cols-2 gap-3">
          {/* Live Show */}
          <div className="bg-zinc-800/30 rounded-lg p-3">
            <div className="flex items-center gap-2 text-zinc-400 text-xs mb-1">
              <Mic className="w-3 h-3" />
              Live Show
            </div>
            {isLive ? (
              <div>
                <p className="text-sm font-medium text-white truncate">{data.live_show.title}</p>
                <p className="text-xs text-zinc-500">
                  {data.live_show.start_time} - {data.live_show.end_time}
                </p>
                {data.live_show.presenters?.length > 0 && (
                  <p className="text-xs text-zinc-400 mt-1">
                    <Mic className="w-3 h-3 inline mr-1" />
                    {data.live_show.presenters.join(', ')}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-zinc-500">No live show</p>
            )}
          </div>

          {/* Now Playing */}
          <div className="bg-zinc-800/30 rounded-lg p-3">
            <div className="flex items-center gap-2 text-zinc-400 text-xs mb-1">
              <Music className="w-3 h-3" />
              Now Playing
              {data?.now_playing?.is_stale && (
                <span className="text-amber-400">(stale)</span>
              )}
            </div>
            <p className="text-sm text-white truncate">
              {data?.now_playing?.song || '-'}
            </p>
          </div>

          {/* Listeners */}
          <div className="bg-zinc-800/30 rounded-lg p-3">
            <div className="flex items-center gap-2 text-zinc-400 text-xs mb-1">
              <Users className="w-3 h-3" />
              Listeners
            </div>
            <p className="text-xl font-bold text-white">
              {data?.now_playing?.listeners || 0}
            </p>
          </div>

          {/* Sequence Status */}
          <div className="bg-zinc-800/30 rounded-lg p-3">
            <div className="flex items-center gap-2 text-zinc-400 text-xs mb-1">
              <RefreshCw className="w-3 h-3" />
              Sequence
            </div>
            {data?.sequence_enabled ? (
              <span className="flex items-center gap-1 text-green-400 text-sm">
                <CheckCircle className="w-4 h-4" />
                Enabled
              </span>
            ) : (
              <span className="flex items-center gap-1 text-zinc-500 text-sm">
                <AlertCircle className="w-4 h-4" />
                Disabled
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <RefreshCw className="w-8 h-8 text-zinc-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white" data-testid="rds-monitor-title">
              RDS Monitor
            </h1>
            <p className="text-zinc-400 text-sm">
              Real-time RDS output monitoring
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <Clock className="w-4 h-4" />
              {monitorData?.timestamp_formatted} ({monitorData?.date_formatted})
            </div>
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

        {/* Station Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <StationCard
            station="mfy"
            stationName="Radio MFY"
            data={monitorData?.stations?.mfy}
          />
          <StationCard
            station="grk"
            stationName="Radio GRK"
            data={monitorData?.stations?.grk}
          />
        </div>

        {/* History Section */}
        <div className="bg-zinc-900 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <History className="w-5 h-5 text-zinc-400" />
            <h2 className="text-lg font-semibold text-white">Recent Changes</h2>
            <span className="text-sm text-zinc-500">
              ({monitorData?.history?.filter(h => h.item_type !== 'custom_text')?.length || 0} entries)
            </span>
          </div>

          {monitorData?.history?.filter(h => h.item_type !== 'custom_text')?.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs text-zinc-500 uppercase tracking-wider border-b border-zinc-800">
                    <th className="pb-3 pr-4">Time</th>
                    <th className="pb-3 pr-4">Station</th>
                    <th className="pb-3 pr-4">Type</th>
                    <th className="pb-3 pr-4">Text</th>
                    <th className="pb-3">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {monitorData.history.filter(h => h.item_type !== 'custom_text').slice(0, 20).map((entry, index) => (
                    <tr key={entry.id || index} className="text-sm">
                      <td className="py-3 pr-4 text-zinc-400 whitespace-nowrap">
                        {entry.timestamp_formatted}
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          entry.station === 'mfy'
                            ? 'bg-blue-500/20 text-blue-400'
                            : 'bg-green-500/20 text-green-400'
                        }`}>
                          {entry.station?.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        <span className="flex items-center gap-1 text-zinc-300">
                          {getItemTypeIcon(entry.item_type)}
                          {getItemTypeLabel(entry.item_type)}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-white max-w-xs truncate">
                        {entry.text}
                      </td>
                      <td className="py-3 text-zinc-500">
                        {entry.reason}
                      </td>
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
