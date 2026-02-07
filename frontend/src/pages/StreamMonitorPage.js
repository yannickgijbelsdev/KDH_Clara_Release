import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Radio, 
  Play, 
  Pause, 
  Volume2, 
  VolumeX,
  Wifi,
  WifiOff,
  Music,
  AlertCircle,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Slider } from '../components/ui/slider';

const API = process.env.REACT_APP_BACKEND_URL;

// Stream configurations - using our backend proxy to bypass CORS
const STREAMS = [
  {
    id: 'mfy',
    name: 'Radio MFY',
    proxyUrl: `${API}/api/streams/mfy`,
    color: 'orange',
  },
  {
    id: 'grk',
    name: 'Radio GRK',
    proxyUrl: `${API}/api/streams/grk`,
    color: 'violet',
  },
  {
    id: 'grk2',
    name: 'Radio GRK 2',
    proxyUrl: `${API}/api/streams/grk2`,
    color: 'emerald',
  }
];

// Real VU Meter component using Web Audio API
const VUMeter = ({ analyser, isPlaying, color }) => {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const dataArrayRef = useRef(null);
  const peakLevelRef = useRef(0);
  const peakDecayRef = useRef(0);

  const colorMap = {
    orange: { primary: '#f97316', secondary: '#fb923c' },
    violet: { primary: '#8b5cf6', secondary: '#a78bfa' },
    emerald: { primary: '#10b981', secondary: '#34d399' }
  };
  const colors = colorMap[color] || colorMap.orange;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    // Clear canvas
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, width, height);

    let level = 0;
    
    if (analyser && isPlaying && dataArrayRef.current) {
      // Get frequency data
      analyser.getByteFrequencyData(dataArrayRef.current);
      
      // Calculate RMS level (more accurate than average)
      let sum = 0;
      for (let i = 0; i < dataArrayRef.current.length; i++) {
        const normalized = dataArrayRef.current[i] / 255;
        sum += normalized * normalized;
      }
      level = Math.sqrt(sum / dataArrayRef.current.length);
      
      // Apply some smoothing
      level = Math.min(1, level * 1.5); // Boost the level a bit
    }

    // Update peak level with decay
    if (level > peakLevelRef.current) {
      peakLevelRef.current = level;
      peakDecayRef.current = 0;
    } else {
      peakDecayRef.current += 0.02;
      peakLevelRef.current = Math.max(level, peakLevelRef.current - peakDecayRef.current * 0.05);
    }

    const barCount = 20;
    const barWidth = (width - (barCount + 1) * 4) / barCount;
    const maxBarHeight = height - 20;

    // Draw bars
    for (let i = 0; i < barCount; i++) {
      const threshold = i / barCount;
      const x = 4 + i * (barWidth + 4);
      
      // Determine if this bar should be lit
      const isLit = level > threshold;
      const isPeak = peakLevelRef.current > threshold && peakLevelRef.current <= (i + 1) / barCount;
      
      // Calculate bar height based on level
      let barHeight;
      if (isLit) {
        barHeight = maxBarHeight;
      } else {
        barHeight = 8; // Minimum height for unlit bars
      }

      // Determine color based on level (green -> yellow -> red)
      let barColor;
      if (!isPlaying) {
        barColor = '#27272a'; // Dark gray when not playing
      } else if (threshold > 0.85) {
        barColor = isLit ? '#ef4444' : '#3f1212'; // Red zone
      } else if (threshold > 0.65) {
        barColor = isLit ? '#eab308' : '#422006'; // Yellow zone
      } else {
        barColor = isLit ? colors.primary : '#1a2e1a'; // Green/primary zone
      }

      // Draw bar
      ctx.fillStyle = barColor;
      ctx.fillRect(x, height - 10 - barHeight, barWidth, barHeight);

      // Draw peak indicator
      if (isPeak && isPlaying) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x, height - 10 - maxBarHeight - 4, barWidth, 3);
      }
    }

    // Draw level line indicator
    if (isPlaying) {
      const levelX = 4 + level * (width - 8);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(levelX, 5);
      ctx.lineTo(levelX, height - 5);
      ctx.stroke();
    }

    // Continue animation
    animationRef.current = requestAnimationFrame(draw);
  }, [analyser, isPlaying, colors]);

  useEffect(() => {
    if (analyser) {
      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
    }
  }, [analyser]);

  useEffect(() => {
    animationRef.current = requestAnimationFrame(draw);
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [draw]);

  return (
    <canvas 
      ref={canvasRef} 
      width={320} 
      height={100}
      className="w-full rounded-lg"
      style={{ imageRendering: 'pixelated' }}
    />
  );
};

// Stream Player Component with real audio analysis
const StreamPlayer = ({ stream }) => {
  const audioRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.7);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [analyser, setAnalyser] = useState(null);

  // Initialize audio context and analyser
  const initAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    if (!analyserRef.current) {
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      analyserRef.current.smoothingTimeConstant = 0.7;
    }
    
    return { audioContext: audioContextRef.current, analyser: analyserRef.current };
  }, []);

  const handlePlay = async () => {
    if (!audioRef.current) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Initialize audio context on user interaction
      const { audioContext, analyser: audioAnalyser } = initAudioContext();
      
      // Resume audio context if suspended
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }
      
      // Set up the audio element - crossOrigin must be set BEFORE src
      audioRef.current.crossOrigin = 'anonymous';
      
      // Add timestamp to prevent caching issues
      const streamUrl = `${stream.proxyUrl}?t=${Date.now()}`;
      audioRef.current.src = streamUrl;
      audioRef.current.volume = volume;
      
      // Connect audio element to analyser if not already connected
      if (!sourceRef.current) {
        try {
          sourceRef.current = audioContext.createMediaElementSource(audioRef.current);
          sourceRef.current.connect(audioAnalyser);
          audioAnalyser.connect(audioContext.destination);
        } catch (connectError) {
          // Source might already be connected from a previous attempt
          console.warn('Audio source connection warning:', connectError);
        }
      }
      
      // Play the audio with a promise
      const playPromise = audioRef.current.play();
      
      if (playPromise !== undefined) {
        await playPromise;
      }
      
      setAnalyser(audioAnalyser);
      setIsPlaying(true);
    } catch (err) {
      console.error('Play error:', err);
      setError(`Fout: ${err.message || 'Kan stream niet afspelen'}`);
      setIsPlaying(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePause = () => {
    if (!audioRef.current) return;
    audioRef.current.pause();
    audioRef.current.src = '';
    setIsPlaying(false);
  };

  const togglePlay = () => {
    if (isPlaying) {
      handlePause();
    } else {
      handlePlay();
    }
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    const newMuted = !isMuted;
    audioRef.current.muted = newMuted;
    setIsMuted(newMuted);
  };

  const handleVolumeChange = (newVolume) => {
    setVolume(newVolume);
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
    }
  };

  // Handle audio events
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleError = (e) => {
      console.error('Audio error:', e);
      setError('Stream niet beschikbaar');
      setIsPlaying(false);
      setIsLoading(false);
    };

    const handleEnded = () => {
      setIsPlaying(false);
    };

    const handleCanPlay = () => {
      setIsLoading(false);
    };

    audio.addEventListener('error', handleError);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('canplay', handleCanPlay);

    return () => {
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('canplay', handleCanPlay);
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
    };
  }, []);

  const colorClasses = {
    orange: {
      border: 'border-orange-500/30',
      bg: 'bg-orange-500/10',
      text: 'text-orange-400',
      button: 'bg-orange-500 hover:bg-orange-600'
    },
    violet: {
      border: 'border-violet-500/30',
      bg: 'bg-violet-500/10',
      text: 'text-violet-400',
      button: 'bg-violet-500 hover:bg-violet-600'
    },
    emerald: {
      border: 'border-emerald-500/30',
      bg: 'bg-emerald-500/10',
      text: 'text-emerald-400',
      button: 'bg-emerald-500 hover:bg-emerald-600'
    }
  };
  const colors = colorClasses[stream.color] || colorClasses.orange;

  return (
    <div className={`bg-[#18181b] border ${colors.border} rounded-xl p-5`} data-testid={`stream-player-${stream.id}`}>
      {/* Hidden audio element */}
      <audio ref={audioRef} preload="none" crossOrigin="anonymous" />
      
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${colors.bg}`}>
            <Radio className={`w-5 h-5 ${colors.text}`} />
          </div>
          <div>
            <h3 className="text-white font-semibold">{stream.name}</h3>
            <div className="flex items-center gap-2 text-xs">
              {isPlaying ? (
                <>
                  <Wifi className="w-3 h-3 text-green-500" />
                  <span className="text-green-400">Speelt af</span>
                </>
              ) : isLoading ? (
                <>
                  <div className="w-3 h-3 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-zinc-400">Verbinden...</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3 h-3 text-zinc-500" />
                  <span className="text-zinc-500">Gestopt</span>
                </>
              )}
            </div>
          </div>
        </div>
        
        {error && (
          <div className="flex items-center gap-1 text-xs text-red-400">
            <AlertCircle className="w-3 h-3" />
            {error}
          </div>
        )}
      </div>

      {/* Real VU Meter */}
      <div className="mb-4" data-testid={`vu-meter-${stream.id}`}>
        <VUMeter analyser={analyser} isPlaying={isPlaying} color={stream.color} />
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        <Button
          onClick={togglePlay}
          disabled={isLoading}
          className={`${colors.button} text-white`}
          size="sm"
          data-testid={`play-btn-${stream.id}`}
        >
          {isPlaying ? (
            <Pause className="w-4 h-4" />
          ) : (
            <Play className="w-4 h-4" />
          )}
        </Button>

        <Button
          onClick={toggleMute}
          variant="outline"
          size="sm"
          disabled={!isPlaying}
          className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
          data-testid={`mute-btn-${stream.id}`}
        >
          {isMuted ? (
            <VolumeX className="w-4 h-4" />
          ) : (
            <Volume2 className="w-4 h-4" />
          )}
        </Button>

        <div className="flex-1 flex items-center gap-2">
          <Volume2 className="w-4 h-4 text-zinc-500" />
          <Slider
            value={[volume * 100]}
            onValueChange={([v]) => handleVolumeChange(v / 100)}
            max={100}
            step={1}
            className="flex-1"
            data-testid={`volume-slider-${stream.id}`}
          />
          <span className="text-xs text-zinc-500 w-8">{Math.round(volume * 100)}%</span>
        </div>
      </div>
    </div>
  );
};

// Main Page Component
const StreamMonitorPage = () => {
  return (
    <div data-testid="stream-monitor-page" className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="p-2 bg-green-500/20 rounded-lg">
          <Music className="w-6 h-6 text-green-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Stream Monitor</h1>
          <p className="text-sm text-zinc-500">Beluister en monitor de radio streams met echte audio meters</p>
        </div>
      </div>

      {/* Info banner */}
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 mb-6">
        <p className="text-blue-400 text-sm">
          De audio meters tonen het echte audioniveau van elke stream. Klik op Play om de stream te starten en de VU meter te activeren.
          Groen = normaal, Geel = luid, Rood = te luid (clipping).
        </p>
      </div>

      {/* Stream Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {STREAMS.map((stream) => (
          <StreamPlayer key={stream.id} stream={stream} />
        ))}
      </div>
    </div>
  );
};

export default StreamMonitorPage;
