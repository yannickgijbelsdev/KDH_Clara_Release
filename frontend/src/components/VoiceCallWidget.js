/* eslint-disable */
import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Conversation } from '@11labs/client';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Phone, PhoneOff, Mic, MicOff, Minimize2,
  Loader2, Volume2
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useMainSite } from '../context/MainSiteContext';
import { PAGE_MAP } from './ClaraGuideOverlay';
import axios from 'axios';

const API = process.env.REACT_APP_BACKEND_URL;

export default function VoiceCallWidget({ open, onClose }) {
  const { token } = useAuth();
  const { mainSite } = useMainSite();

  const [phase, setPhase] = useState('ringing');
  const [localMuted, setLocalMuted] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [duration, setDuration] = useState(0);
  const [transcript, setTranscript] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [aiSpeaking, setAiSpeaking] = useState(false);

  const conversationRef = useRef(null);
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

  // Reset on open
  useEffect(() => {
    if (open) {
      setPhase('ringing');
      setDuration(0);
      setTranscript([]);
      setSessionId(null);
      setLocalMuted(false);
      setIsMinimized(false);
      setAiSpeaking(false);
    }
  }, [open]);

  const formatDuration = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  // Accept call
  const acceptCall = useCallback(async () => {
    setPhase('connecting');
    try {
      // Request mic permission
      await navigator.mediaDevices.getUserMedia({ audio: true });

      // Get signed URL from backend
      const { data } = await axios.get(
        `${API}/api/voice-support/signed-url?main_site_id=${mainSite?.id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSessionId(data.session_id);

      // Resolve the current site slug for navigation
      const siteSlug = window.location.pathname.split('/')[1] || '';

      // Start ElevenLabs conversation via @11labs/client with client tools
      const conversation = await Conversation.startSession({
        signedUrl: data.signed_url,
        clientTools: {
          hang_up: async () => {
            // Clara ends the call via voice command
            setTimeout(() => {
              if (conversationRef.current) {
                try { conversationRef.current.endSession(); } catch { /* noop */ }
                conversationRef.current = null;
              }
              setPhase('ended');
              if (timerRef.current) clearInterval(timerRef.current);
              setTimeout(() => onClose(), 2000);
            }, 1500); // Short delay for Clara to say goodbye
            return 'Call is being ended. Goodbye!';
          },
          highlight_element: async ({ element_name, description }) => {
            window.dispatchEvent(new CustomEvent('clara-highlight', {
              detail: { element: element_name, description: description || element_name }
            }));
            return 'Element highlighted on screen for the user.';
          },
          navigate_to_page: async ({ page_name, description }) => {
            const key = (page_name || '').toLowerCase().trim();
            const route = PAGE_MAP[key];
            if (route !== undefined && siteSlug) {
              const targetPath = route ? `/${siteSlug}/${route}` : `/${siteSlug}`;
              window.dispatchEvent(new CustomEvent('clara-navigate', {
                detail: { path: targetPath, highlightAfter: page_name, description }
              }));
              return `Navigated to ${page_name}. The page is now visible.`;
            }
            return `Page "${page_name}" not found. Available pages: ${Object.keys(PAGE_MAP).join(', ')}`;
          },
        },
        onConnect: () => {
          console.log('[VoiceCall] Connected to ElevenLabs');
          setPhase('active');
        },
        onDisconnect: (details) => {
          console.log('[VoiceCall] Disconnected:', details?.reason || 'unknown');
          setPhase('ended');
        },
        onMessage: (message) => {
          console.log('[VoiceCall] Message:', message);
          if (message.message) {
            setTranscript(prev => [...prev, {
              role: message.source === 'ai' ? 'assistant' : 'user',
              text: message.message,
              time: new Date().toISOString(),
            }]);
          }
        },
        onModeChange: (mode) => {
          setAiSpeaking(mode.mode === 'speaking');
        },
        onError: (error) => {
          console.error('[VoiceCall] Error:', error);
          setPhase('ended');
        },
      });

      conversationRef.current = conversation;
    } catch (err) {
      console.error('[VoiceCall] Setup failed:', err);
      setPhase('ended');
    }
  }, [mainSite?.id, token, onClose]);

  // Mute/unmute
  const toggleMute = useCallback(async () => {
    if (conversationRef.current) {
      const newMuted = !localMuted;
      setLocalMuted(newMuted);
      if (newMuted) {
        await conversationRef.current.setVolume({ volume: 0 });
      } else {
        await conversationRef.current.setVolume({ volume: 1 });
      }
    }
  }, [localMuted]);

  // Hang up
  const hangUp = useCallback(async () => {
    setPhase('ended');
    if (timerRef.current) clearInterval(timerRef.current);

    if (conversationRef.current) {
      try { await conversationRef.current.endSession(); } catch { /* noop */ }
      conversationRef.current = null;
    }

    // Save transcript
    if (sessionId && transcript.length > 0) {
      try {
        await axios.post(`${API}/api/voice-support/save-transcript`, {
          session_id: sessionId,
          main_site_id: mainSite?.id,
          language: '',
          messages: transcript,
          duration_seconds: duration,
        }, { headers: { Authorization: `Bearer ${token}` } });
      } catch { /* noop */ }
    }

    setTimeout(() => onClose(), 2000);
  }, [sessionId, transcript, duration, mainSite?.id, token, onClose]);

  const declineCall = () => { onClose(); };

  if (!open) return null;

  // --- Minimized ---
  if (isMinimized && phase === 'active') {
    return createPortal(
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="fixed bottom-6 right-6 z-[10000] flex items-center gap-3 bg-zinc-900 text-white pl-4 pr-2 py-2 rounded-full shadow-2xl cursor-pointer"
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
      </motion.div>,
      document.body
    );
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {phase === 'ringing' && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[9999] bg-black/40 backdrop-blur-sm"
            />
          )}

          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.9 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={`fixed z-[10000] ${
              phase === 'ringing' ? 'inset-0 flex items-center justify-center' : 'bottom-6 right-6 w-[360px]'
            }`}
            data-testid="voice-call-widget"
          >
            {/* RINGING */}
            {phase === 'ringing' && (
              <div className="w-[320px] bg-zinc-900 rounded-3xl p-8 text-center shadow-2xl">
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
                  <button onClick={declineCall} className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors shadow-lg shadow-red-500/30" data-testid="voice-decline-btn">
                    <PhoneOff className="w-6 h-6 text-white" />
                  </button>
                  <button onClick={acceptCall} className="w-14 h-14 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center transition-colors shadow-lg shadow-green-500/30" data-testid="voice-accept-btn">
                    <Phone className="w-6 h-6 text-white" />
                  </button>
                </div>
              </div>
            )}

            {/* CONNECTING */}
            {phase === 'connecting' && (
              <div className="bg-zinc-900 rounded-2xl p-6 text-center shadow-2xl">
                <Loader2 className="w-8 h-8 text-green-400 animate-spin mx-auto mb-3" />
                <p className="text-white text-sm font-medium">Connecting...</p>
                <p className="text-zinc-500 text-xs mt-1">Setting up secure voice channel</p>
              </div>
            )}

            {/* ACTIVE */}
            {phase === 'active' && (
              <div className="bg-zinc-900 rounded-2xl shadow-2xl overflow-hidden" data-testid="voice-call-active">
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
                  <button onClick={() => setIsMinimized(true)} className="w-7 h-7 rounded-lg hover:bg-zinc-800 flex items-center justify-center text-zinc-500 hover:text-zinc-300 transition-colors" data-testid="voice-minimize-btn">
                    <Minimize2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Audio Visualizer */}
                <div className="px-5 py-3 flex items-end justify-center gap-1 h-[40px]">
                  {Array.from({ length: 20 }).map((_, i) => (
                    <motion.div
                      key={i}
                      className={`w-1 rounded-full ${aiSpeaking ? 'bg-green-400' : localMuted ? 'bg-zinc-700' : 'bg-zinc-600'}`}
                      animate={{
                        height: aiSpeaking ? [4, Math.random() * 24 + 8, 4] : localMuted ? 4 : [4, Math.random() * 8 + 4, 4],
                      }}
                      transition={{ duration: aiSpeaking ? 0.4 : 1.2, repeat: Infinity, delay: i * 0.05, ease: 'easeInOut' }}
                    />
                  ))}
                </div>

                {/* Live Transcript */}
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

                {/* Controls */}
                <div className="px-5 py-4 flex items-center justify-center gap-4 border-t border-zinc-800">
                  <button
                    onClick={toggleMute}
                    className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${localMuted ? 'bg-red-500/20 text-red-400' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}
                    data-testid="voice-mute-btn"
                  >
                    {localMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
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

            {/* ENDED */}
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
    </AnimatePresence>,
    document.body
  );
}
