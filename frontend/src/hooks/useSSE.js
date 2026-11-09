import { useState, useEffect, useRef } from 'react';

/**
 * Connects to /api/alerts/stream when authenticated.
 * Returns the latest alerts array and connection status.
 * Reconnects on disconnect with exponential backoff.
 */
export function useSSE(isAuthenticated = true) {
  const [alerts, setAlerts] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const eventSourceRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const retryCountRef = useRef(0);

  useEffect(() => {
    if (!isAuthenticated) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      setIsConnected(false);
      return;
    }

    let isSubscribed = true;

    function connect() {
      if (!isSubscribed) return;

      try {
        const es = new EventSource('/api/alerts/stream', { withCredentials: true });
        eventSourceRef.current = es;

        es.onopen = () => {
          if (!isSubscribed) return;
          setIsConnected(true);
          retryCountRef.current = 0;
        };

        es.onmessage = (event) => {
          if (!isSubscribed) return;
          try {
            const data = JSON.parse(event.data);
            if (Array.isArray(data)) {
              setAlerts(data);
            } else if (data && typeof data === 'object') {
              // Prepend new alert if not already present
              setAlerts((prev) => {
                const exists = prev.some((a) => a.id === data.id);
                if (exists) {
                  return prev.map((a) => (a.id === data.id ? data : a));
                }
                return [data, ...prev];
              });
            }
          } catch (err) {
            console.error('Failed to parse SSE alert event', err);
          }
        };

        es.addEventListener('alert', (event) => {
          if (!isSubscribed) return;
          try {
            const data = JSON.parse(event.data);
            setAlerts((prev) => {
              const exists = prev.some((a) => a.id === data.id);
              if (exists) {
                return prev.map((a) => (a.id === data.id ? data : a));
              }
              return [data, ...prev];
            });
          } catch (err) {
            console.error('Failed to parse SSE custom alert event', err);
          }
        });

        es.onerror = () => {
          if (!isSubscribed) return;
          setIsConnected(false);
          es.close();
          eventSourceRef.current = null;

          // Reconnect with backoff
          const delay = Math.min(1000 * Math.pow(1.5, retryCountRef.current), 15000);
          retryCountRef.current += 1;
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        };
      } catch (err) {
        console.error('EventSource initialization error', err);
      }
    }

    connect();

    return () => {
      isSubscribed = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [isAuthenticated]);

  return { alerts, setAlerts, isConnected };
}

export default useSSE;
