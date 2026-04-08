import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Phone, PhoneOff, Mic, MicOff, Minimize2, Maximize2,
  Loader2, Volume2, X
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useMainSite } from '../context/MainSiteContext';
import axios from 'axios';

const API = process.env.REACT_APP_BACKEND_URL;

const SYSTEM_INSTRUCTIONS = `You are Clara Support, a friendly and professional AI phone support assistant for the Clara radio station management platform.

RULES:
1. When the call starts, FIRST greet the user warmly and ask: "In which language would you like to continue? / In welke taal wil je verder?"
2. After they respond, continue ONLY in that language for the rest of the call.
3. You help users with: technical issues, platform navigation, error troubleshooting, WordPress publishing, RDS settings, stream monitoring, team management, content library, and all Clara features.
4. Be concise and conversational — this is a phone call, not a chat. Keep responses short (2-3 sentences max).
5. If you don't know the answer, suggest creating a support ticket for the team.
6. Never reveal internal backend details like file paths, database schemas, or API keys.
7. You can help guide users by describing where to click and what to look for on screen.
8. End the call politely when the user's issue is resolved.`;

export default function VoiceCallWidget({ open, onClose, triggerSource }) {
  const { token } = useAuth();
  const { mainSite } = useMainSite();
  const headers = { Authorization: `Bearer ${token}` };

  const [phase, setPhase] = useState('ringing'); // ringing | connecting | active | ended
  const [isMuted, setIsMuted] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [duration, setDuration] = useState(0);
  const [transcript, setTranscript] = useState([]);
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [detectedLanguage, setDetectedLanguage] = useState('');

  const pcRef = useRef(null);
  const dcRef = useRef(null);
  const audioRef = useRef(null);
  const localStreamRef = useRef(null);
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);

  // Duration timer
  useEffect(() => {
    if (phase === 'active') {
      startTimeRef.current = Date.now();
      timerRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase]);

  const formatDuration = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  // Accept the call — establish WebRTC
  const acceptCall = useCallback(async () => {
    setPhase('connecting');
    try {
      // 1. Create backend session for transcript storage
      const { data: sessionData } = await axios.post(
        `${API}/api/voice-support/start-session?main_site_id=${mainSite?.id}`,
        {}, { headers }
      );
      setSessionId(sessionData.session_id);

      // 2. Create WebRTC peer connection
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // 3. Set up audio output
      const audioEl = document.createElement('audio');
      audioEl.autoplay = true;
      document.body.appendChild(audioEl);
      audioRef.current = audioEl;

      pc.ontrack = (event) => {
        audioEl.srcObject = event.streams[0];
      };

      // 4. Set up local microphone
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      // 5. Set up data channel for events
      const dc = pc.createDataChannel('oai-events');
      dcRef.current = dc;

      dc.onopen = () => {
        // Configure session with instructions, voice, and transcription
        const sessionUpdate = {
          type: 'session.update',
          session: {
            instructions: SYSTEM_INSTRUCTIONS,
            voice: 'verse',
            input_audio_transcription: { model: 'whisper-1' },
            turn_detection: { type: 'server_vad', threshold: 0.5, silence_duration_ms: 800 },
          },
        };
        dc.send(JSON.stringify(sessionUpdate));
      };

      dc.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          handleRealtimeEvent(msg);
        } catch {}
      };

      // 6. Create offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // 7. Negotiate via backend (backend authenticates with OpenAI)
      const negotiateRes = await fetch(`${API}/api/voice-support/realtime/negotiate`, {
        method: 'POST',
        body: offer.sdp,
        headers: { 'Content-Type': 'application/sdp' },
      });
      const { sdp: answerSdp } = await negotiateRes.json();
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

      setPhase('active');
    } catch (err) {
      console.error('Voice call setup failed:', err);
      setPhase('ended');
    }
  }, [mainSite?.id, token]);

  // Handle realtime events from OpenAI
  const handleRealtimeEvent = useCallback((msg) => {
    switch (msg.type) {
      case 'response.audio_transcript.delta':
        setAiSpeaking(true);
        break;
      case 'response.audio_transcript.done':
        setAiSpeaking(false);
        if (msg.transcript) {
          setTranscript(prev => [...prev, { role: 'assistant', text: msg.transcript, time: new Date().toISOString() }]);
        }
        break;
      case 'conversation.item.input_audio_transcription.completed':
        if (msg.transcript) {
          setTranscript(prev => [...prev, { role: 'user', text: msg.transcript, time: new Date().toISOString() }]);
          // Detect language from first user message
          if (!detectedLanguage && msg.transcript.length > 3) {
            setDetectedLanguage(msg.transcript);
          }
        }
        break;
      case 'response.done':
        setAiSpeaking(false);
        break;
      default:
        break;
    }
  }, [detectedLanguage]);

  // Mute/unmute
  const toggleMute = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
      setIsMuted(prev => !prev);
    }
  };

  // Hang up
  const hangUp = useCallback(async () => {
    setPhase('ended');
    if (timerRef.current) clearInterval(timerRef.current);

    // Close WebRTC
    if (dcRef.current) { try { dcRef.current.close(); } catch {} }
    if (pcRef.current) { try { pcRef.current.close(); } catch {} }
    if (localStreamRef.current) { localStreamRef.current.getTracks().forEach(t => t.stop()); }
    if (audioRef.current) { try { audioRef.current.remove(); } catch {} }

    // Save transcript
    if (sessionId && transcript.length > 0) {
      try {
        await axios.post(`${API}/api/voice-support/save-transcript`, {
          session_id: sessionId,
          main_site_id: mainSite?.id,
          language: detectedLanguage,
          messages: transcript,
          duration_seconds: duration,
        }, { headers });
      } catch {}
    }

    setTimeout(() => onClose(), 2000);
  }, [sessionId, transcript, duration, detectedLanguage, mainSite?.id, token, onClose]);

  // Decline call
  const declineCall = () => {
    onClose();
  };

  if (!open) return null;

  // --- Minimized view ---
  if (isMinimized && phase === 'active') {
    return (
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="fixed bottom-6 right-6 z-[400] flex items-center gap-3 bg-zinc-900 text-white pl-4 pr-2 py-2 rounded-full shadow-2xl cursor-pointer"
        onClick={() => setIsMinimized(false)}
        data-testid="voice-call-minimized"
      >
        {aiSpeaking && (
          <div className="flex items-center gap-0.5">
            {[1,2,3].map(i => (
              <div key={i} className="w-0.5 bg-green-400 rounded-full animate-pulse" style={{ height: `${8 + i * 4}px`, animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
        )}
        <Phone className="w-3.5 h-3.5 text-green-400" />
        <span className="text-xs font-medium">{formatDuration(duration)}</span>
        <button
          onClick={(e) => { e.stopPropagation(); hangUp(); }}
          className="w-7 h-7 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center ml-1"
          data-testid="voice-hangup-mini"
        >
          <PhoneOff className="w-3 h-3" />
        </button>
      </motion.div>
    );
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          {phase === 'ringing' && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[399] bg-black/40 backdrop-blur-sm"
            />
          )}

          {/* Call Widget */}
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.9 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={`fixed z-[400] ${
              phase === 'ringing'
                ? 'inset-0 flex items-center justify-center'
                : 'bottom-6 right-6 w-[360px]'
            }`}
            data-testid="voice-call-widget"
          >
            {/* --- RINGING PHASE --- */}
            {phase === 'ringing' && (
              <div className="w-[320px] bg-zinc-900 rounded-3xl p-8 text-center shadow-2xl">
                {/* Pulsing call ring */}
                <div className="relative w-24 h-24 mx-auto mb-6">
                  <div className="absolute inset-0 rounded-full bg-green-500/20 animate-ping" />
                  <div className="absolute inset-2 rounded-full bg-green-500/30 animate-pulse" />
                  <div className="absolute inset-4 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center">
                    <Phone className="w-8 h-8 text-white" />
                  </div>
                </div>
                <h3 className="text-white text-lg font-semibold mb-1">Clara Support</h3>
                <p className="text-zinc-400 text-sm mb-8">Incoming call...</p>

                <div className="flex items-center justify-center gap-6">
                  <button
                    onClick={declineCall}
                    className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors shadow-lg shadow-red-500/30"
                    data-testid="voice-decline-btn"
                  >
                    <PhoneOff className="w-6 h-6 text-white" />
                  </button>
                  <button
                    onClick={acceptCall}
                    className="w-14 h-14 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center transition-colors shadow-lg shadow-green-500/30"
                    data-testid="voice-accept-btn"
                  >
                    <Phone className="w-6 h-6 text-white" />
                  </button>
                </div>
              </div>
            )}

            {/* --- CONNECTING PHASE --- */}
            {phase === 'connecting' && (
              <div className="bg-zinc-900 rounded-2xl p-6 text-center shadow-2xl">
                <Loader2 className="w-8 h-8 text-green-400 animate-spin mx-auto mb-3" />
                <p className="text-white text-sm font-medium">Connecting...</p>
                <p className="text-zinc-500 text-xs mt-1">Setting up secure voice channel</p>
              </div>
            )}

            {/* --- ACTIVE CALL --- */}
            {phase === 'active' && (
              <div className="bg-zinc-900 rounded-2xl shadow-2xl overflow-hidden" data-testid="voice-call-active">
                {/* Call Header */}
                <div className="px-5 py-4 flex items-center gap-3">
                  <div className="relative">
                    <div className={`w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center ${aiSpeaking ? 'ring-2 ring-green-400 ring-offset-2 ring-offset-zinc-900' : ''}`}>
                      <Volume2 className={`w-5 h-5 text-white ${aiSpeaking ? 'animate-pulse' : ''}`} />
                    </div>
                    {aiSpeaking && <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 rounded-full border-2 border-zinc-900" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-white text-sm font-semibold">Clara Support</h4>
                    <p className="text-green-400 text-xs">{aiSpeaking ? 'Speaking...' : 'Listening...'}</p>
                  </div>
                  <span className="text-zinc-400 text-xs font-mono tabular-nums">{formatDuration(duration)}</span>
                  <button
                    onClick={() => setIsMinimized(true)}
                    className="w-7 h-7 rounded-lg hover:bg-zinc-800 flex items-center justify-center text-zinc-500 hover:text-zinc-300 transition-colors"
                    data-testid="voice-minimize-btn"
                  >
                    <Minimize2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Audio Visualizer */}
                <div className="px-5 py-3 flex items-center justify-center gap-1">
                  {Array.from({ length: 20 }).map((_, i) => (
                    <motion.div
                      key={i}
                      className={`w-1 rounded-full ${aiSpeaking ? 'bg-green-400' : isMuted ? 'bg-zinc-700' : 'bg-zinc-600'}`}
                      animate={{
                        height: aiSpeaking
                          ? [4, Math.random() * 24 + 8, 4]
                          : isMuted ? 4 : [4, Math.random() * 8 + 4, 4],
                      }}
                      transition={{
                        duration: aiSpeaking ? 0.4 : 1.2,
                        repeat: Infinity,
                        delay: i * 0.05,
                        ease: 'easeInOut',
                      }}
                    />
                  ))}
                </div>

                {/* Live Transcript (last 3 messages) */}
                {transcript.length > 0 && (
                  <div className="px-5 pb-3 max-h-[120px] overflow-y-auto space-y-1.5">
                    {transcript.slice(-3).map((msg, i) => (
                      <div key={i} className={`text-xs leading-relaxed ${msg.role === 'assistant' ? 'text-zinc-400' : 'text-zinc-500'}`}>
                        <span className={`font-medium ${msg.role === 'assistant' ? 'text-green-400' : 'text-blue-400'}`}>
                          {msg.role === 'assistant' ? 'Clara' : 'You'}:
                        </span>{' '}
                        {msg.text}
                      </div>
                    ))}
                  </div>
                )}

                {/* Call Controls */}
                <div className="px-5 py-4 flex items-center justify-center gap-4 border-t border-zinc-800">
                  <button
                    onClick={toggleMute}
                    className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${isMuted ? 'bg-red-500/20 text-red-400' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}
                    data-testid="voice-mute-btn"
                  >
                    {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  </button>
                  <button
                    onClick={hangUp}
                    className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors shadow-lg shadow-red-500/30"
                    data-testid="voice-hangup-btn"
                  >
                    <PhoneOff className="w-6 h-6 text-white" />
                  </button>
                </div>
              </div>
            )}

            {/* --- ENDED PHASE --- */}
            {phase === 'ended' && (
              <div className="bg-zinc-900 rounded-2xl p-6 text-center shadow-2xl">
                <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-3">
                  <PhoneOff className="w-5 h-5 text-zinc-500" />
                </div>
                <p className="text-white text-sm font-medium">Call ended</p>
                <p className="text-zinc-500 text-xs mt-1">{formatDuration(duration)} — Transcript saved</p>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
