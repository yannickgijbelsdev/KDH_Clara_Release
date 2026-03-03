import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Phone, PhoneOff, Mic, MicOff, Volume2, Signal, Loader2, CheckCircle, XCircle } from 'lucide-react';

const API = process.env.REACT_APP_BACKEND_URL;
const WS_URL = API.replace('https://', 'wss://').replace('http://', 'ws://');

const qualityColors = { good: 'text-green-400', fair: 'text-amber-400', poor: 'text-red-400' };
const qualityLabels = { good: 'Good connection', fair: 'Fair connection', poor: 'Poor connection' };

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function PublicCallPage() {
  const { callToken } = useParams();
  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [name, setName] = useState('');
  const [callState, setCallState] = useState('preview'); // preview, connecting, active, ended
  const [isMuted, setIsMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [connectionQuality, setConnectionQuality] = useState('good');

  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const wsRef = useRef(null);
  const durationRef = useRef(null);
  const statsRef = useRef(null);

  // Fetch invite info
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API}/api/calls/join/${callToken}`);
        if (res.ok) {
          setInvite(await res.json());
        } else {
          setError('This invite link is invalid or has expired.');
        }
      } catch (e) {
        setError('Could not connect to the server.');
      }
      setLoading(false);
    })();
  }, [callToken]);

  // Duration timer
  useEffect(() => {
    if (callState === 'active') {
      setDuration(0);
      durationRef.current = setInterval(() => setDuration(d => d + 1), 1000);
    } else {
      if (durationRef.current) clearInterval(durationRef.current);
    }
    return () => { if (durationRef.current) clearInterval(durationRef.current); };
  }, [callState]);

  // Quality monitoring
  const startQualityMonitoring = useCallback(() => {
    statsRef.current = setInterval(async () => {
      if (!pcRef.current) return;
      try {
        const stats = await pcRef.current.getStats();
        stats.forEach(report => {
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            const rtt = report.currentRoundTripTime;
            if (rtt < 0.15) setConnectionQuality('good');
            else if (rtt < 0.3) setConnectionQuality('fair');
            else setConnectionQuality('poor');
          }
        });
      } catch (e) { /* ignore */ }
    }, 3000);
  }, []);

  const acceptCall = async () => {
    try {
      setCallState('connecting');

      // Accept the invite via REST
      const res = await fetch(`${API}/api/calls/join/${callToken}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name || 'Guest' }),
      });
      if (!res.ok) {
        setError('Could not accept the invite.');
        setCallState('preview');
        return;
      }
      const data = await res.json();
      const roomId = data.room_id;

      // Get microphone
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;

      // Create peer connection
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      });
      pcRef.current = pc;

      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      pc.ontrack = (event) => {
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = event.streams[0];
        }
      };

      // Connect WebSocket
      const ws = new WebSocket(`${WS_URL}/ws/call/${roomId}?role=caller`);
      wsRef.current = ws;

      ws.onmessage = async (event) => {
        const msg = JSON.parse(event.data);

        if (msg.type === 'offer') {
          await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: msg.sdp }));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          ws.send(JSON.stringify({ type: 'answer', sdp: answer.sdp }));
        } else if (msg.type === 'ice_candidate') {
          await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
        } else if (msg.type === 'hangup' || msg.type === 'peer_left') {
          endCall();
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ice_candidate', candidate: event.candidate.toJSON() }));
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          setCallState('active');
          startQualityMonitoring();
        } else if (pc.connectionState === 'failed') {
          setConnectionQuality('poor');
        }
      };

    } catch (err) {
      console.error('Failed to join call:', err);
      setError('Could not access microphone. Please allow microphone permissions and try again.');
      setCallState('preview');
    }
  };

  const endCall = async () => {
    if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
    if (localStreamRef.current) { localStreamRef.current.getTracks().forEach(t => t.stop()); localStreamRef.current = null; }
    if (wsRef.current) {
      try { wsRef.current.send(JSON.stringify({ type: 'hangup' })); wsRef.current.close(); } catch (e) {}
      wsRef.current = null;
    }
    if (statsRef.current) clearInterval(statsRef.current);

    try {
      await fetch(`${API}/api/calls/join/${callToken}/end`, { method: 'POST' });
    } catch (e) {}

    setCallState('ended');
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const track = localStreamRef.current.getAudioTracks()[0];
      if (track) {
        track.enabled = !track.enabled;
        setIsMuted(!track.enabled);
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'mute_state', muted: !track.enabled }));
        }
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-green-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-8 max-w-md text-center">
          <XCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold mb-2">Cannot Join Call</h1>
          <p className="text-sm text-zinc-400">{error}</p>
        </div>
      </div>
    );
  }

  if (callState === 'ended') {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-8 max-w-md text-center">
          <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold mb-2">Call Ended</h1>
          <p className="text-sm text-zinc-400">Duration: {formatDuration(duration)}</p>
          <p className="text-xs text-zinc-600 mt-4">You can close this window.</p>
        </div>
      </div>
    );
  }

  // Preview / Accept screen
  if (callState === 'preview') {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center" data-testid="public-call-page">
        <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-8 max-w-md w-full mx-4">
          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
              <Phone className="w-8 h-8 text-green-400" />
            </div>
            <h1 className="text-xl font-bold">You're invited to a call</h1>
            <p className="text-sm text-zinc-400 mt-1">
              {invite?.host_name ? `${invite.host_name} wants to talk to you` : 'You have been invited to join a call'}
            </p>
            {invite?.label && (
              <p className="text-xs text-zinc-500 mt-2 bg-zinc-800 rounded-lg px-3 py-1.5 inline-block">{invite.label}</p>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Your Name</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Enter your name"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-sm"
                data-testid="caller-name-input"
              />
            </div>

            <button
              onClick={acceptCall}
              className="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-all"
              data-testid="accept-call-btn"
            >
              <Phone className="w-5 h-5" />
              Accept & Join Call
            </button>

            <p className="text-xs text-zinc-600 text-center">
              Your microphone will be used for this call.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Active call / Connecting
  return (
    <div className="min-h-screen bg-[#09090b] flex items-center justify-center" data-testid="public-call-active">
      <audio ref={remoteAudioRef} autoPlay style={{ display: 'none' }} />
      <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-8 max-w-md w-full mx-4 text-center">
        <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 ${
          callState === 'active' ? 'bg-green-500/10' : 'bg-amber-500/10'
        }`}>
          {callState === 'connecting' ? (
            <Loader2 className="w-10 h-10 text-amber-400 animate-spin" />
          ) : (
            <Phone className="w-10 h-10 text-green-400" />
          )}
        </div>

        <h1 className="text-xl font-bold mb-1">
          {callState === 'connecting' ? 'Connecting...' : 'In Call'}
        </h1>

        {callState === 'active' && (
          <>
            <p className="text-2xl font-mono font-bold text-green-400 mb-1" data-testid="caller-duration">
              {formatDuration(duration)}
            </p>
            <div className={`flex items-center justify-center gap-1.5 mb-6 ${qualityColors[connectionQuality]}`}>
              <Signal className="w-4 h-4" />
              <span className="text-xs">{qualityLabels[connectionQuality]}</span>
            </div>
          </>
        )}

        {callState === 'connecting' && (
          <p className="text-sm text-zinc-400 mb-6">Waiting for host to connect...</p>
        )}

        <div className="flex items-center justify-center gap-6">
          <button
            onClick={toggleMute}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
              isMuted ? 'bg-red-500/20 text-red-400' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            }`}
            data-testid="caller-mute-btn"
          >
            {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
          </button>
          <button
            onClick={endCall}
            className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center transition-all shadow-lg shadow-red-500/20"
            data-testid="caller-hangup-btn"
          >
            <PhoneOff className="w-7 h-7" />
          </button>
        </div>
      </div>
    </div>
  );
}
