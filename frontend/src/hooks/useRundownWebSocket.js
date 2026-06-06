/* eslint-disable */
import { useEffect, useRef, useState, useCallback } from 'react';

const WS_BASE_URL = process.env.REACT_APP_BACKEND_URL?.replace('https://', 'wss://').replace('http://', 'ws://');

export const useRundownWebSocket = (resourceId, token, onMessage, wsType = 'show') => {
  const [isConnected, setIsConnected] = useState(false);
  const [presence, setPresence] = useState([]);
  const [liveEdits, setLiveEdits] = useState({});
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const pingIntervalRef = useRef(null);

  const connect = useCallback(() => {
    if (!resourceId || !token || wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const wsPath = wsType === 'occurrence' ? 'rundown' : 'show';
    const wsUrl = `${WS_BASE_URL}/ws/${wsPath}/${resourceId}?token=${token}`;
    
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 30000);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'presence') {
            setPresence(data.users || []);
          } else if (data.type === 'editing_start') {
            setLiveEdits(prev => ({
              ...prev,
              [data.item_id]: { user: data.user, fields: {} }
            }));
          } else if (data.type === 'editing_update') {
            setLiveEdits(prev => ({
              ...prev,
              [data.item_id]: {
                ...prev[data.item_id],
                user: data.user,
                fields: { ...(prev[data.item_id]?.fields || {}), [data.field]: data.value }
              }
            }));
          } else if (data.type === 'editing_end') {
            if (data.item_id) {
              setLiveEdits(prev => {
                const next = { ...prev };
                delete next[data.item_id];
                return next;
              });
            } else if (data.user) {
              // User disconnected - remove all their edits
              setLiveEdits(prev => {
                const next = {};
                for (const [k, v] of Object.entries(prev)) {
                  if (v.user?.id !== data.user.id) next[k] = v;
                }
                return next;
              });
            }
          } else if (data.type !== 'pong') {
            onMessage?.(data);
          }
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e);
        }
      };

      ws.onclose = (event) => {
        setIsConnected(false);
        setPresence([]);
        setLiveEdits({});
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        if (event.code !== 1000) {
          reconnectTimeoutRef.current = setTimeout(() => connect(), 3000);
        }
      };

      ws.onerror = () => {};
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
    }
  }, [resourceId, token, onMessage, wsType]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
    if (wsRef.current) {
      wsRef.current.close(1000, 'User navigated away');
      wsRef.current = null;
    }
    setIsConnected(false);
    setPresence([]);
    setLiveEdits({});
  }, []);

  const sendMessage = useCallback((message) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return { isConnected, presence, liveEdits, sendMessage, disconnect };
};

export default useRundownWebSocket;
