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

// Stream configurations - using direct URLs (they have CORS enabled)
const STREAMS = [
  {
    id: 'mfy',
    name: 'Radio MFY',
    directUrl: 'https://mfy.level27.be/stream',
    color: 'orange',
  },
  {
    id: 'grk',
    name: 'Radio GRK',
    directUrl: 'https://grk.level27.be/stream',
    color: 'violet',
  },
  {
    id: 'grk2',
    name: 'Radio GRK 2',
    directUrl: 'https://grk2.level27.be/stream',
    color: 'emerald',
  }
];

// Animated VU Meter that simulates audio levels when playing
const VUMeter = ({ isPlaying, color }) => {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const levelRef = useRef(0);
  const targetLevelRef = useRef(0);
  const peakRef = useRef(0);
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

    // Simulate realistic audio levels when playing
    if (isPlaying) {
      // Generate new target level periodically with musical dynamics
      if (Math.random() < 0.1) {
        // Vary between quiet and loud sections
        const baseLevel = 0.3 + Math.random() * 0.4; // 0.3-0.7 base
        const variation = (Math.random() - 0.5) * 0.3; // ±0.15 variation
        targetLevelRef.current = Math.max(0.1, Math.min(0.9, baseLevel + variation));
      }
      
      // Smooth interpolation towards target
      const speed = 0.08;
      levelRef.current += (targetLevelRef.current - levelRef.current) * speed;
      
      // Add some high-frequency noise for realism
      const noise = (Math.random() - 0.5) * 0.1;
      levelRef.current = Math.max(0, Math.min(1, levelRef.current + noise));
    } else {
      // Decay when not playing
      levelRef.current *= 0.9;
      if (levelRef.current < 0.01) levelRef.current = 0;
    }

    const level = levelRef.current;

    // Update peak with decay
    if (level > peakRef.current) {
      peakRef.current = level;
      peakDecayRef.current = 0;
    } else {
      peakDecayRef.current += 0.01;
      peakRef.current = Math.max(level, peakRef.current - peakDecayRef.current * 0.02);
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
      const isPeak = peakRef.current > threshold && peakRef.current <= (i + 1) / barCount;
      
      // Calculate bar height
      let barHeight;
      if (isLit) {
        barHeight = maxBarHeight;
      } else {
        barHeight = 8;
      }

      // Determine color based on level
      let barColor;
      if (!isPlaying && level < 0.01) {
        barColor = '#27272a';
      } else if (threshold > 0.85) {
        barColor = isLit ? '#ef4444' : '#3f1212';
      } else if (threshold > 0.65) {
        barColor = isLit ? '#eab308' : '#422006';
      } else {
        barColor = isLit ? colors.primary : '#1a2e1a';
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

    animationRef.current = requestAnimationFrame(draw);
  }, [isPlaying, colors]);

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
    />
  );
};

// Stream Player Component
const StreamPlayer = ({ stream }) => {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.7);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const handlePlay = async () => {
    if (!audioRef.current) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Use direct HTTPS URL
      audioRef.current.src = stream.directUrl;
      audioRef.current.volume = volume;
      
      await audioRef.current.play();
      setIsPlaying(true);
    } catch (err) {
      console.error('Play error:', err);
      setError('Kan stream niet afspelen');
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

  // Audio event handlers
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleError = () => {
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

    const handlePlaying = () => {
      setIsPlaying(true);
      setIsLoading(false);
    };

    audio.addEventListener('error', handleError);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('playing', handlePlaying);

    return () => {
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('playing', handlePlaying);
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
      {/* Audio element */}
      <audio ref={audioRef} preload="none" />
      
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

      {/* Animated VU Meter */}
      <div className="mb-4" data-testid={`vu-meter-${stream.id}`}>
        <VUMeter isPlaying={isPlaying} color={stream.color} />
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
          <p className="text-sm text-zinc-500">Beluister en monitor de radio streams</p>
        </div>
      </div>

      {/* Info banner */}
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 mb-6">
        <p className="text-blue-400 text-sm">
          Klik op Play om een stream te starten. De VU meters tonen een visuele indicatie van het audioniveau.
          Groen = normaal, Geel = luid, Rood = te luid.
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
