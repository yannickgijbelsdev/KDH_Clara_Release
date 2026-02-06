import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Radio, 
  Play, 
  Pause, 
  Volume2, 
  VolumeX,
  Wifi,
  WifiOff,
  Users,
  Music
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Slider } from '../components/ui/slider';

// Stream configurations
const STREAMS = [
  {
    id: 'mfy',
    name: 'Radio MFY',
    url: 'https://mfy.level27.be/;',
    color: 'orange',
    statsUrl: 'https://mfy.level27.be/stats?sid=1'
  },
  {
    id: 'grk',
    name: 'Radio GRK',
    url: 'https://grk.level27.be/;',
    color: 'violet',
    statsUrl: 'https://grk.level27.be/stats?sid=1'
  },
  {
    id: 'grk2',
    name: 'Radio GRK 2',
    url: 'https://grk2.level27.be/;',
    color: 'emerald',
    statsUrl: 'https://grk2.level27.be/stats?sid=1'
  }
];

// Audio Meter Component
const AudioMeter = ({ analyser, isActive, color }) => {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const peakLevelRef = useRef(0);
  const displayPeakRef = useRef(0);

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    const colorMap = {
      orange: { primary: '#f97316', secondary: '#ea580c' },
      violet: { primary: '#8b5cf6', secondary: '#7c3aed' },
      emerald: { primary: '#10b981', secondary: '#059669' }
    };
    const colors = colorMap[color] || colorMap.orange;

    const draw = () => {
      // Clear canvas
      ctx.fillStyle = '#18181b';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (!isActive || !analyser) {
        // Draw inactive state
        ctx.fillStyle = '#27272a';
        for (let i = 0; i < 20; i++) {
          const x = i * 15 + 2;
          ctx.fillRect(x, canvas.height - 10, 12, 8);
        }
        displayPeakRef.current = 0;
        animationRef.current = requestAnimationFrame(draw);
        return;
      }

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyser.getByteFrequencyData(dataArray);

      // Calculate average level
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      const average = sum / bufferLength;
      const normalizedLevel = average / 255;
      
      // Update peak with decay
      peakLevelRef.current = Math.max(normalizedLevel, peakLevelRef.current * 0.95);
      displayPeakRef.current = Math.round(peakLevelRef.current * 100);

      // Draw frequency bars
      const barWidth = (canvas.width / bufferLength) * 2.5;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height;
        
        // Gradient based on level
        const gradient = ctx.createLinearGradient(0, canvas.height - barHeight, 0, canvas.height);
        gradient.addColorStop(0, colors.primary);
        gradient.addColorStop(1, colors.secondary);
        
        ctx.fillStyle = gradient;
        ctx.fillRect(x, canvas.height - barHeight, barWidth - 1, barHeight);
        
        x += barWidth;
        if (x > canvas.width) break;
      }

      // Draw peak line
      const peakY = canvas.height - (peakLevelRef.current * canvas.height);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, peakY);
      ctx.lineTo(canvas.width, peakY);
      ctx.stroke();

      // Draw level text directly on canvas
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = '10px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${displayPeakRef.current}%`, canvas.width - 4, 12);

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [analyser, isActive, color]);

  return (
    <canvas
      ref={canvasRef}
      width={300}
      height={100}
      className="w-full h-24 rounded-lg bg-[#18181b]"
    />
  );
};

// VU Meter Component (classic style)
const VUMeter = ({ level, color }) => {
  const colorMap = {
    orange: 'bg-orange-500',
    violet: 'bg-violet-500',
    emerald: 'bg-emerald-500'
  };
  const bgColor = colorMap[color] || colorMap.orange;

  const bars = 20;
  const activeBarCount = Math.round(level * bars);

  return (
    <div className="flex gap-0.5 h-8 items-end">
      {Array.from({ length: bars }).map((_, i) => {
        const isActive = i < activeBarCount;
        const isHigh = i >= bars * 0.8;
        const isMid = i >= bars * 0.6 && i < bars * 0.8;
        
        return (
          <div
            key={i}
            className={`w-3 rounded-sm transition-all duration-75 ${
              isActive
                ? isHigh
                  ? 'bg-red-500'
                  : isMid
                  ? 'bg-yellow-500'
                  : bgColor
                : 'bg-zinc-800'
            }`}
            style={{ height: `${20 + i * 3}%` }}
          />
        );
      })}
    </div>
  );
};

// Stream Player Component
const StreamPlayer = ({ stream }) => {
  const audioRef = useRef(null);
  const audioContextRef = useRef(null);
  const sourceRef = useRef(null);
  const gainNodeRef = useRef(null);
  
  const [analyser, setAnalyser] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(true); // Start muted for meters
  const [volume, setVolume] = useState(0.5);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState(null);

  // Initialize audio context and analyser
  const initAudio = useCallback(async () => {
    if (audioContextRef.current) return;

    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioContextRef.current = new AudioContext();
      
      const newAnalyser = audioContextRef.current.createAnalyser();
      newAnalyser.fftSize = 256;
      newAnalyser.smoothingTimeConstant = 0.8;
      setAnalyser(newAnalyser);

      gainNodeRef.current = audioContextRef.current.createGain();
      gainNodeRef.current.gain.value = isMuted ? 0 : volume;

      // Connect analyser to gain, gain to destination
      newAnalyser.connect(gainNodeRef.current);
      gainNodeRef.current.connect(audioContextRef.current.destination);

    } catch (err) {
      console.error('Failed to initialize audio context:', err);
      setError('Audio niet ondersteund');
    }
  }, [isMuted, volume]);

  // Connect audio element to analyser
  const connectAudio = useCallback(() => {
    if (!audioRef.current || !audioContextRef.current || sourceRef.current || !analyser) return;

    try {
      sourceRef.current = audioContextRef.current.createMediaElementSource(audioRef.current);
      sourceRef.current.connect(analyser);
    } catch (err) {
      console.error('Failed to connect audio:', err);
    }
  }, [analyser]);

  // Start the stream (muted for metering)
  const startStream = useCallback(async () => {
    await initAudio();
    
    if (audioRef.current) {
      audioRef.current.src = stream.url;
      audioRef.current.crossOrigin = 'anonymous';
      
      try {
        await audioRef.current.play();
        connectAudio();
        setIsPlaying(true);
        setIsConnected(true);
        setError(null);
      } catch (err) {
        console.error('Failed to play:', err);
        setError('Kan stream niet starten');
      }
    }
  }, [stream.url, initAudio, connectAudio]);

  // Stop the stream
  const stopStream = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    setIsPlaying(false);
    setIsConnected(false);
  }, []);

  // Toggle play/pause
  const togglePlay = useCallback(async () => {
    if (isPlaying) {
      stopStream();
    } else {
      await startStream();
    }
  }, [isPlaying, startStream, stopStream]);

  // Toggle mute (for listening)
  const toggleMute = useCallback(() => {
    setIsMuted(!isMuted);
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = isMuted ? volume : 0;
    }
  }, [isMuted, volume]);

  // Update volume
  const handleVolumeChange = useCallback((newVolume) => {
    setVolume(newVolume);
    if (gainNodeRef.current && !isMuted) {
      gainNodeRef.current.gain.value = newVolume;
    }
  }, [isMuted]);

  // Update level from analyser - use ref to avoid re-renders
  const levelRef = useRef(0);
  
  useEffect(() => {
    if (!analyser || !isPlaying) {
      levelRef.current = 0;
      setLevel(0);
      return;
    }

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    let lastUpdate = 0;
    
    const updateLevel = () => {
      if (!analyser || !isPlaying) return;
      
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const avg = sum / dataArray.length / 255;
      levelRef.current = avg;
      
      // Only update state every 200ms to reduce re-renders
      const now = Date.now();
      if (now - lastUpdate > 200) {
        setLevel(avg);
        lastUpdate = now;
      }
    };

    const interval = setInterval(updateLevel, 50);
    return () => clearInterval(interval);
  }, [analyser, isPlaying]);

  // Auto-start stream for metering (muted)
  useEffect(() => {
    // Auto-start after a small delay
    const timer = setTimeout(() => {
      startStream();
    }, 1000);
    
    return () => {
      clearTimeout(timer);
      stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const colorMap = {
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
  const colors = colorMap[stream.color] || colorMap.orange;

  return (
    <div className={`bg-[#18181b] border ${colors.border} rounded-xl p-5`}>
      {/* Hidden audio element */}
      <audio ref={audioRef} crossOrigin="anonymous" />
      
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${colors.bg}`}>
            <Radio className={`w-5 h-5 ${colors.text}`} />
          </div>
          <div>
            <h3 className="text-white font-semibold">{stream.name}</h3>
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              {isConnected ? (
                <>
                  <Wifi className="w-3 h-3 text-green-500" />
                  <span className="text-green-400">Verbonden</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3 h-3 text-zinc-500" />
                  <span>Niet verbonden</span>
                </>
              )}
            </div>
          </div>
        </div>
        
        {/* Error indicator */}
        {error && (
          <span className="text-xs text-red-400">{error}</span>
        )}
      </div>

      {/* Audio Meter */}
      <div className="mb-4">
        <AudioMeter 
          analyser={analyser} 
          isActive={isPlaying} 
          color={stream.color}
        />
      </div>

      {/* VU Meter */}
      <div className="mb-4">
        <VUMeter level={level} color={stream.color} />
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        <Button
          onClick={togglePlay}
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
          className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
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
            disabled={isMuted}
          />
        </div>
      </div>
    </div>
  );
};

// Main Page Component
const StreamMonitorPage = () => {
  const [streamStatuses, setStreamStatuses] = useState({});

  const handleStatusChange = useCallback((streamId, status) => {
    setStreamStatuses(prev => ({ ...prev, [streamId]: status }));
  }, []);

  const connectedCount = Object.values(streamStatuses).filter(s => s?.isConnected).length;

  return (
    <div data-testid="stream-monitor-page" className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-green-500/20 rounded-lg">
            <Music className="w-6 h-6 text-green-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Stream Monitor</h1>
            <p className="text-sm text-zinc-500">Live audio meters en stream beluisteren</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2 text-sm">
          <Wifi className="w-4 h-4 text-green-500" />
          <span className="text-zinc-400">
            {connectedCount} / {STREAMS.length} verbonden
          </span>
        </div>
      </div>

      {/* Info banner */}
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 mb-6">
        <p className="text-blue-400 text-sm">
          De audio meters starten automatisch (gedempt). Klik op het speaker icoon om te luisteren.
          De meters werken ook zonder dat je luistert.
        </p>
      </div>

      {/* Stream Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {STREAMS.map((stream) => (
          <StreamPlayer
            key={stream.id}
            stream={stream}
            onStatusChange={(status) => handleStatusChange(stream.id, status)}
          />
        ))}
      </div>
    </div>
  );
};

export default StreamMonitorPage;
