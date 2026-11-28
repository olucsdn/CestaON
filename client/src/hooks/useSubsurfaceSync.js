import { useState, useEffect } from 'react';
import {
  isSubsurface,
  subscribeSubsurfaceStatus,
  triggerPredictivePreload
} from '../utils/subsurfaceCache.js';
import {
  subscribePendingMutationsCount,
  flushPendingMutations,
  subscribeConflictNotifications,
  loadUnacknowledgedConflicts,
  acknowledgeConflict,
  purgeAuthConflicts,
  subscribeQueueStatus
} from '../utils/syncManager.js';

/**
 * Custom Hook para orquestração isolada de conectividade,
 * sincronização em segundo plano (Background Sync) e cache preditivo no subsolo.
 */
export function useSubsurfaceSync({ activeListId, activeListItemsCount, onSyncCompleted } = {}) {
  const [isSubsurfaceMode, setIsSubsurfaceMode] = useState(() => isSubsurface());
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [conflictNotification, setConflictNotification] = useState(null);

  // Monitoramento de conectividade (online / offline no subsolo)
  useEffect(() => {
    const unsubscribe = subscribeSubsurfaceStatus((offline) => {
      setIsSubsurfaceMode(offline);
      if (!offline) {
        flushPendingMutations().then(() => {
          if (typeof onSyncCompleted === 'function') {
            onSyncCompleted();
          }
        });
      }
    });
    return unsubscribe;
  }, [onSyncCompleted]);

  // Drenagem automática da fila do IndexedDB quando o WebSocket reconecta pós-hibernação (Cold Start)
  useEffect(() => {
    const handleWsReconnected = () => {
      flushPendingMutations().then(() => {
        if (typeof onSyncCompleted === 'function') {
          onSyncCompleted();
        }
      });
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('cestaon:ws-reconnected', handleWsReconnected);
      return () => {
        window.removeEventListener('cestaon:ws-reconnected', handleWsReconnected);
      };
    }
  }, [onSyncCompleted]);

  // Monitoramento reativo da fila de mutações pendentes
  useEffect(() => {
    const unsubSync = subscribePendingMutationsCount((count) => {
      setPendingSyncCount(count);
    });
    return unsubSync;
  }, []);

  // Notificações de conflitos resolvidos / descartes 4xx
  useEffect(() => {
    // 1. Carrega conflitos persistidos pelo Service Worker enquanto o app esteve fechado
    loadUnacknowledgedConflicts().then(async (persisted) => {
      if (persisted && persisted.length > 0) {
        // Se houver conflito de sessão (401) e o usuário possui token ativo, expurga imediatamente
        const hasAuthToken = typeof localStorage !== 'undefined' && !!localStorage.getItem('feira_auth_token');
        if (hasAuthToken) {
          await purgeAuthConflicts().catch(() => {});
          const remainingConflicts = await loadUnacknowledgedConflicts().catch(() => []);
          if (remainingConflicts.length > 0) {
            setConflictNotification(remainingConflicts[remainingConflicts.length - 1]);
          } else {
            setConflictNotification(null);
          }
          flushPendingMutations().then(() => {
            if (typeof onSyncCompleted === 'function') {
              onSyncCompleted();
            }
          }).catch(() => {});
          return;
        }
        setConflictNotification(persisted[persisted.length - 1]);
      }
    }).catch(() => {});

    // 2. Escuta notificações em tempo real emitidas durante a sessão atual
    const unsubConflict = subscribeConflictNotifications((conflict) => {
      if (conflict === null) {
        setConflictNotification(null);
        return;
      }
      if (conflict && conflict.status === 401) {
        const hasAuthToken = typeof localStorage !== 'undefined' && !!localStorage.getItem('feira_auth_token');
        if (hasAuthToken) {
          purgeAuthConflicts().catch(() => {});
          setConflictNotification(null);
          return;
        }
      }
      setConflictNotification(conflict);
    });

    // 3. Escuta status da fila para auto-limpar conflitos 401 quando o status retornar a idle
    const unsubStatus = subscribeQueueStatus((status) => {
      if (status.state === 'idle') {
        setConflictNotification((prev) => (prev?.status === 401 ? null : prev));
      }
    });

    return () => {
      unsubConflict();
      unsubStatus();
    };
  }, [onSyncCompleted]);

  // Acionamento de pré-carregamento preditivo em segundo plano
  useEffect(() => {
    if (activeListId) {
      triggerPredictivePreload(activeListId);
    }
  }, [activeListId, activeListItemsCount]);

  const clearConflictNotification = () => {
    if (conflictNotification?.id) {
      acknowledgeConflict(conflictNotification.id).catch(() => {});
    } else {
      acknowledgeConflict().catch(() => {});
    }
    setConflictNotification(null);
    // Aciona envio imediato das mutações locais para o servidor/DB ao dispensar o aviso
    flushPendingMutations().then(() => {
      if (typeof onSyncCompleted === 'function') {
        onSyncCompleted();
      }
    }).catch(() => {});
  };

  return {
    isSubsurfaceMode,
    pendingSyncCount,
    conflictNotification,
    clearConflictNotification
  };
}
