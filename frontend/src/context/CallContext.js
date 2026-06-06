/* eslint-disable */
import { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';

const CallContext = createContext(null);

export function CallProvider({ children }) {
  const [activeCall, setActiveCall] = useState(null); // {inviteId, token, role, callerName, status}
  const [callState, setCallState] = useState('idle'); // idle, connecting, active, ended
  const [isMuted, setIsMuted] = useState(false);
  const [callerVolume, setCallerVolume] = useState(1.0);
  const [connectionQuality, setConnectionQuality] = useState('good'); // good, fair, poor
  const [callDuration, setCallDuration] = useState(0);

  const peerConnection = useRef(null);
  const localStream = useRef(null);
  const remoteStream = useRef(null);
  const wsRef = useRef(null);
  const durationInterval = useRef(null);
  const remoteAudioRef = useRef(null);
  const statsInterval = useRef(null);

  const API = process.env.REACT_APP_BACKEND_URL;
  const WS_URL = API.replace('https://', 'wss://').replace('http://', 'ws://');

  // Duration timer
  useEffect(() => {
    if (callState === 'active') {
      setCallDuration(0);
      durationInterval.current = setInterval(() => {
        setCallDuration(d => d + 1);
      }, 1000);
    } else {
      if (durationInterval.current) clearInterval(durationInterval.current);
    }
    return () => { if (durationInterval.current) clearInterval(durationInterval.current); };
  }, [callState]);

  // Monitor connection quality
  const startQualityMonitoring = useCallback(() => {
    if (statsInterval.current) clearInterval(statsInterval.current);
    statsInterval.current = setInterval(async () => {
      if (!peerConnection.current) return;
      try {
        const stats = await peerConnection.current.getStats();
        let rtt = null;
        let packetsLost = 0;
        let packetsReceived = 0;

        stats.forEach(report => {
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            rtt = report.currentRoundTripTime;
          }
          if (report.type === 'inbound-rtp' && report.kind === 'audio') {
            packetsLost = report.packetsLost || 0;
            packetsReceived = report.packetsReceived || 0;
          }
        });

        if (rtt !== null) {
          if (rtt < 0.15) setConnectionQuality('good');
          else if (rtt < 0.3) setConnectionQuality('fair');
          else setConnectionQuality('poor');
        } else if (packetsReceived > 0) {
          const lossRate = packetsLost / (packetsReceived + packetsLost);
          if (lossRate < 0.02) setConnectionQuality('good');
          else if (lossRate < 0.1) setConnectionQuality('fair');
          else setConnectionQuality('poor');
        }
      } catch (e) { /* ignore */ }
    }, 3000);
  }, []);

  const stopQualityMonitoring = useCallback(() => {
    if (statsInterval.current) clearInterval(statsInterval.current);
  }, []);

  // Start a call as host
  const startCall = useCallback(async (inviteId, token, audioProfile) => {
    try {
      setCallState('connecting');

      // Get local audio stream with profile devices
      const constraints = { audio: true, video: false };
      if (audioProfile?.input_device_id) {
        constraints.audio = { deviceId: { exact: audioProfile.input_device_id } };
      }

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (deviceErr) {
        // If exact device fails, try with any audio
        if (audioProfile?.input_device_id) {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        } else {
          throw deviceErr;
        }
      }
      localStream.current = stream;

      // Set output device if supported and specified
      if (audioProfile?.output_device_id && remoteAudioRef.current?.setSinkId) {
        try {
          await remoteAudioRef.current.setSinkId(audioProfile.output_device_id);
        } catch (e) { console.warn('Could not set output device:', e); }
      }

      // Create WebRTC peer connection
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      });
      peerConnection.current = pc;

      // Add local tracks
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      // Handle remote tracks
      pc.ontrack = (event) => {
        remoteStream.current = event.streams[0];
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = event.streams[0];
        }
      };

      // Connect WebSocket for signaling
      const ws = new WebSocket(`${WS_URL}/ws/call/${inviteId}?token=${token}&role=host`);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('Call signaling connected (host)');
      };

      ws.onmessage = async (event) => {
        const msg = JSON.parse(event.data);

        if (msg.type === 'peer_joined') {
          // Caller joined, create offer
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          ws.send(JSON.stringify({ type: 'offer', sdp: offer.sdp }));
        } else if (msg.type === 'answer') {
          await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: msg.sdp }));
          setCallState('active');
          startQualityMonitoring();
        } else if (msg.type === 'ice_candidate') {
          await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
        } else if (msg.type === 'hangup' || msg.type === 'peer_left') {
          endCall();
        } else if (msg.type === 'mute_state') {
          // Caller muted/unmuted - could be used for UI indicator
        }
      };

      // Send ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ice_candidate', candidate: event.candidate.toJSON() }));
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          setCallState('active');
          startQualityMonitoring();
        } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          setConnectionQuality('poor');
        }
      };

      setActiveCall({ inviteId, token, role: 'host', callerName: null, status: 'connecting' });

    } catch (err) {
      console.error('Failed to start call:', err);
      setCallState('idle');
      throw err;
    }
  }, [WS_URL, startQualityMonitoring]);

  // Join a call as caller (external user)
  const joinCall = useCallback(async (roomId, callerName) => {
    try {
      setCallState('connecting');

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStream.current = stream;

      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      });
      peerConnection.current = pc;

      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      pc.ontrack = (event) => {
        remoteStream.current = event.streams[0];
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = event.streams[0];
        }
      };

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
        }
      };

      setActiveCall({ inviteId: roomId, role: 'caller', callerName, status: 'connecting' });

    } catch (err) {
      console.error('Failed to join call:', err);
      setCallState('idle');
      throw err;
    }
  }, [WS_URL, startQualityMonitoring]);

  const endCall = useCallback(() => {
    // Close peer connection
    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }

    // Stop local audio
    if (localStream.current) {
      localStream.current.getTracks().forEach(t => t.stop());
      localStream.current = null;
    }

    // Close WebSocket
    if (wsRef.current) {
      try {
        wsRef.current.send(JSON.stringify({ type: 'hangup' }));
        wsRef.current.close();
      } catch (e) { /* ignore */ }
      wsRef.current = null;
    }

    stopQualityMonitoring();
    setCallState('idle');
    setActiveCall(null);
    setIsMuted(false);
    setCallerVolume(1.0);
    setCallDuration(0);
    setConnectionQuality('good');
  }, [stopQualityMonitoring]);

  const toggleMute = useCallback(() => {
    if (localStream.current) {
      const audioTrack = localStream.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
        // Notify other party
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'mute_state', muted: !audioTrack.enabled }));
        }
      }
    }
  }, []);

  const setVolume = useCallback((vol) => {
    setCallerVolume(vol);
    if (remoteAudioRef.current) {
      remoteAudioRef.current.volume = vol;
    }
  }, []);

  const value = {
    activeCall,
    callState,
    isMuted,
    callerVolume,
    connectionQuality,
    callDuration,
    remoteAudioRef,
    startCall,
    joinCall,
    endCall,
    toggleMute,
    setVolume,
  };

  return (
    <CallContext.Provider value={value}>
      {children}
      {/* Hidden audio element for remote stream */}
      <audio ref={remoteAudioRef} autoPlay style={{ display: 'none' }} />
    </CallContext.Provider>
  );
}

export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall must be used within CallProvider');
  return ctx;
}
