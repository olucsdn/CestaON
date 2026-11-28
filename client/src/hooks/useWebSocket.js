import { useEffect, useRef, useState } from 'react';

export function useWebSocket(listId, onEvent, userId = null) {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const isRevokedRef = useRef(false);
  const reconnectAttemptRef = useRef(0);

  useEffect(() => {
    if (!listId) return;
    isRevokedRef.current = false;

    function connect() {
      if (isRevokedRef.current) return;
      // Determina endereço do WebSocket: porta 3000 em dev Vite (5173) ou host da aplicação em produção
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.port === '5173' ? `${window.location.hostname}:3000` : window.location.host;
      const wsUrl = `${protocol}//${host}`;

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setIsConnected(true);
          const wasReconnected = reconnectAttemptRef.current > 0;
          reconnectAttemptRef.current = 0;

          // Entra na sala da lista com identificação de permissão e token de sessão criptográfico
          const token = typeof localStorage !== 'undefined' ? localStorage.getItem('feira_auth_token') : null;
          ws.send(JSON.stringify({ type: 'JOIN_LIST', listId, userId, token }));

          // Dispara evento global de reconexão para descarregar mutações offline acumuladas
          if (wasReconnected && typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('cestaon:ws-reconnected', { detail: { listId } }));
          }
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'ACCESS_REVOKED') {
              isRevokedRef.current = true;
            }
            if (onEvent) {
              onEvent(data);
            }
          } catch (err) {
            console.error('[WS Client Parse Error]', err);
          }
        };

        ws.onclose = (event) => {
          setIsConnected(false);
          // [AUDIT-FIX LOG-02]: Se a conexão foi terminada por evicção de sessão (outro dispositivo conectou),
          // revogação de acesso ou violação de política, NÃO tenta reconectar em loop infinito de conflito.
          if (event && (event.code === 4001 || event.code === 4003 || event.code === 1008)) {
            isRevokedRef.current = true;
            return;
          }
          // Reconexão resiliente com Exponential Backoff e Jitter (suporte a cold start da hospedagem gratuita)
          if (!isRevokedRef.current) {
            const attempt = reconnectAttemptRef.current;
            reconnectAttemptRef.current += 1;
            const baseDelay = Math.min(15000, 1000 * Math.pow(1.5, Math.min(attempt, 8)));
            const jitter = Math.floor(Math.random() * 500);
            reconnectTimeoutRef.current = setTimeout(connect, baseDelay + jitter);
          }
        };

        ws.onerror = (err) => {
          console.warn('[WS Connection Error]', err);
          ws.close();
        };
      } catch (err) {
        console.warn('[WS Init Failed]', err);
        const attempt = reconnectAttemptRef.current;
        reconnectAttemptRef.current += 1;
        const baseDelay = Math.min(15000, 1000 * Math.pow(1.5, Math.min(attempt, 8)));
        const jitter = Math.floor(Math.random() * 500);
        reconnectTimeoutRef.current = setTimeout(connect, baseDelay + jitter);
      }
    }

    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'LEAVE_LIST', listId }));
        }
        wsRef.current.close();
      }
    };
  }, [listId, userId]);

  return { isConnected };
}
