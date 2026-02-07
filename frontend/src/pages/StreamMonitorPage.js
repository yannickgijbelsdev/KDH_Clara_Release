import { useState, useEffect, useRef } from 'react';
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

// Stream configurations
const STREAMS = [
  {
    id: 'mfy',
    name: 'Radio MFY',
    url: 'http://mfy.level27.be/;',
    color: 'orange',
  },
  {
    id: 'grk',
    name: 'Radio GRK',
    url: 'http://grk.level27.be/;',
    color: 'violet',
  },
  {
    id: 'grk2',
    name: 'Radio GRK 2',
    url: 'http://grk2.level27.be/;',
    color: 'emerald',
  }
];

// Simple VU Meter visualization (animated when playing)
const VUMeter = ({ isPlaying, color }) => {
  const [levels, setLevels] = useState(Array(20).fill(0));

  useEffect(() => {
    if (!isPlaying) {
      setLevels(Array(20).fill(0));
      return;
    }

    // Simulate audio levels when playing
    const interval = setInterval(() => {
      setLevels(prev => prev.map((_, i) => {
        const base = Math.random() * 0.6 + 0.2; // Random between 0.2 and 0.8
        const decay = 1 - (i / 20) * 0.3; // Higher bars decay more
        return Math.min(1, base * decay + Math.random() * 0.2);
      }));
    }, 100);

    return () => clearInterval(interval);
  }, [isPlaying]);

  const colorMap = {
    orange: 'bg-orange-500',
    violet: 'bg-violet-500',
    emerald: 'bg-emerald-500'
  };
  const bgColor = colorMap[color] || colorMap.orange;

  return (
    <div className="flex gap-1 h-24 items-end justify-center bg-[#0a0a0a] rounded-lg p-3">
      {levels.map((level, i) => {
        const height = level * 100;
        const isHigh = height > 80;
        const isMid = height > 60 && height <= 80;
        
        return (
          <div
            key={i}
            className={`w-3 rounded-t transition-all duration-100 ${
              isPlaying
                ? isHigh
                  ? 'bg-red-500'
                  : isMid
                  ? 'bg-yellow-500'
                  : bgColor
                : 'bg-zinc-800'
            }`}
            style={{ height: `${isPlaying ? height : 10}%` }}
          />
        );
      })}
    </div>
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
      audioRef.current.src = stream.url;
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

  // Handle audio events
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

    audio.addEventListener('error', handleError);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('ended', handleEnded);
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
    <div className={`bg-[#18181b] border ${colors.border} rounded-xl p-5`}>
      {/* Hidden audio element */}
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

      {/* VU Meter */}
      <div className="mb-4">
        <VUMeter isPlaying={isPlaying} color={stream.color} />
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        <Button
          onClick={togglePlay}
          disabled={isLoading}
          className={`${colors.button} text-white`}
          size="sm"
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
          />
          <span className="text-xs text-zinc-500 w-8">{Math.round(volume * 100)}%</span>
        </div>
      </div>

      {/* Stream URL info */}
      <div className="mt-4 pt-4 border-t border-zinc-800">
        <p className="text-xs text-zinc-600 font-mono truncate">{stream.url}</p>
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

      {/* Warning banner for mixed content */}
      <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 mb-6">
        <p className="text-yellow-400 text-sm">
          <strong>Let op:</strong> Als de streams niet werken, kan dit komen door browser beveiligingsinstellingen. 
          Probeer de pagina te openen via HTTP in plaats van HTTPS, of gebruik een andere browser.
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
