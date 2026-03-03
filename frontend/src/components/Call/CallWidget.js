import { useCall } from '../../context/CallContext';
import { Phone, PhoneOff, Mic, MicOff, Volume2, Wifi, WifiOff, Signal } from 'lucide-react';
import { useState } from 'react';

const qualityColors = {
  good: 'text-green-400',
  fair: 'text-amber-400',
  poor: 'text-red-400',
};

const qualityLabels = {
  good: 'Good',
  fair: 'Fair',
  poor: 'Poor',
};

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function CallWidget() {
  const { activeCall, callState, isMuted, callerVolume, connectionQuality, callDuration, endCall, toggleMute, setVolume } = useCall();
  const [expanded, setExpanded] = useState(false);

  // Only show when there's an active call
  if (!activeCall || callState === 'idle') return null;

  const callerLabel = activeCall.callerName || activeCall.label || 'Caller';

  return (
    <div
      data-testid="call-widget"
      className="fixed bottom-6 right-6 z-[9999] transition-all duration-300"
    >
      {/* Expanded view */}
      {expanded ? (
        <div className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl w-72 overflow-hidden">
          {/* Header */}
          <div className="bg-zinc-800/80 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full ${callState === 'active' ? 'bg-green-500 animate-pulse' : 'bg-amber-500 animate-pulse'}`} />
              <span className="text-sm font-medium">
                {callState === 'connecting' ? 'Connecting...' : callerLabel}
              </span>
            </div>
            <button onClick={() => setExpanded(false)} className="text-zinc-500 hover:text-zinc-300 text-xs">
              Minimize
            </button>
          </div>

          {/* Timer & Quality */}
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-green-400" />
              <span className="text-lg font-mono font-bold text-zinc-100" data-testid="call-duration">
                {formatDuration(callDuration)}
              </span>
            </div>
            <div className={`flex items-center gap-1.5 ${qualityColors[connectionQuality]}`}>
              <Signal className="w-4 h-4" />
              <span className="text-xs font-medium">{qualityLabels[connectionQuality]}</span>
            </div>
          </div>

          {/* Volume slider */}
          <div className="px-4 pb-3">
            <div className="flex items-center gap-3">
              <Volume2 className="w-4 h-4 text-zinc-400 flex-shrink-0" />
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={callerVolume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="w-full h-2 bg-zinc-700 rounded-full appearance-none cursor-pointer accent-orange-500"
                data-testid="call-volume-slider"
              />
              <span className="text-xs text-zinc-500 w-8 text-right">{Math.round(callerVolume * 100)}%</span>
            </div>
          </div>

          {/* Controls */}
          <div className="px-4 pb-4 flex items-center justify-center gap-4">
            <button
              onClick={toggleMute}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                isMuted ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              }`}
              data-testid="call-mute-btn"
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>
            <button
              onClick={endCall}
              className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center transition-all shadow-lg shadow-red-500/20"
              data-testid="call-hangup-btn"
              title="End Call"
            >
              <PhoneOff className="w-6 h-6" />
            </button>
          </div>
        </div>
      ) : (
        /* Minimized pill */
        <button
          onClick={() => setExpanded(true)}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-full shadow-lg shadow-green-500/20 flex items-center gap-3 transition-all"
          data-testid="call-widget-pill"
        >
          <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
          <Phone className="w-4 h-4" />
          <span className="text-sm font-medium">{callerLabel}</span>
          <span className="text-sm font-mono">{formatDuration(callDuration)}</span>
        </button>
      )}
    </div>
  );
}
