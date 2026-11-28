/**
 * Gerenciador de Background Sync Nativo (SyncManager & IndexedDB)
 * 
 * Permite que mutações (criação de itens, toggle de compras, atualização de preços e listas)
 * executadas offline (no subsolo) sejam salvas em fila persistente no IndexedDB e
 * sincronizadas automaticamente em segundo plano via SyncManager nativo do navegador.
 */

const DB_NAME = 'feira_sync_db';
const DB_VERSION = 2;
const STORE_NAME = 'pending_mutations';
const CONFLICT_STORE = 'sync_conflicts';
export const SYNC_TAG = 'sync-feira-mutations';

let conflictLogs = [];
const conflictListeners = new Set();

let queueStatus = {
  state: 'idle', // 'idle' | 'syncing' | 'paused_auth_required' | 'error'
  message: null,
  lastAttemptAt: null
};
const queueStatusListeners = new Set();

/**
 * Retorna o estado atual da fila de sincronização
 */
export function getQueueStatus() {
  return { ...queueStatus };
}

/**
 * Escuta atualizações no estado da fila de sincronização
 */
export function subscribeQueueStatus(callback) {
  queueStatusListeners.add(callback);
  callback(getQueueStatus());
  return () => queueStatusListeners.delete(callback);
}

function updateQueueStatus(newState, message = null) {
  queueStatus = {
    state: newState,
    message,
    lastAttemptAt: Date.now()
  };
  queueStatusListeners.forEach((cb) => {
    try { cb(getQueueStatus()); } catch (_) {}
  });
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try {
      window.dispatchEvent(new CustomEvent('cestaon:sync-status-changed', { detail: getQueueStatus() }));
    } catch (_) {}
  }
}

/**
 * Registra um conflito resolvido por descarte de erro 4xx
 */
export function recordConflict(conflict) {
  conflictLogs.unshift(conflict);
  if (conflictLogs.length > 50) conflictLogs.pop(); // buffer circular leve
  persistConflict(conflict).catch(() => {});
  conflictListeners.forEach((cb) => {
    try { cb(conflict); } catch (_) {}
  });
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try {
      window.dispatchEvent(new CustomEvent('sync-conflict-resolved', { detail: conflict }));
    } catch (_) {}
  }
}

/**
 * Persiste um registro de conflito no IndexedDB para sobreviver ao fechamento da aplicação
 * @param {object} conflict
 * @returns {Promise<number>}
 */
export async function persistConflict(conflict) {
  const db = await openSyncDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CONFLICT_STORE, 'readwrite');
    const store = tx.objectStore(CONFLICT_STORE);
    const req = store.add({
      ...conflict,
      timestamp: conflict.timestamp || Date.now(),
      acknowledged: false
    });
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error || req.error);
    tx.onabort = () => reject(tx.error || new Error('Transação abortada'));
  });
}

/**
 * Carrega todos os conflitos não reconhecidos do IndexedDB
 * @returns {Promise<Array<object>>}
 */
export async function loadUnacknowledgedConflicts() {
  try {
    const db = await openSyncDB();
    return new Promise((resolve) => {
      const tx = db.transaction(CONFLICT_STORE, 'readonly');
      const store = tx.objectStore(CONFLICT_STORE);
      const req = store.getAll();
      req.onsuccess = () => {
        const list = req.result || [];
        const unacked = list.filter((c) => !c.acknowledged);
        resolve(unacked);
      };
      req.onerror = () => resolve([]);
    });
  } catch (_) {
    return [];
  }
}

/**
 * Remove ou marca como reconhecido um conflito persistido no IndexedDB
 * @param {number} [conflictId]
 * @returns {Promise<void>}
 */
export async function acknowledgeConflict(conflictId = null) {
  try {
    const db = await openSyncDB();
    return new Promise((resolve) => {
      const tx = db.transaction(CONFLICT_STORE, 'readwrite');
      const store = tx.objectStore(CONFLICT_STORE);
      const req = conflictId ? store.delete(conflictId) : store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  } catch (_) {}
}

/**
 * Retorna os conflitos registrados na sessão atual
 */
export function getConflictLogs() {
  return [...conflictLogs];
}

/**
 * Limpa o histórico em memória de conflitos
 */
export function clearConflictLogs() {
  conflictLogs = [];
}

/**
 * Remove qualquer conflito 401 (sessão expirada) do IndexedDB e da memória,
 * restaurando o estado da fila para 'idle' se estava pausada por autenticação.
 */
export async function purgeAuthConflicts() {
  conflictLogs = conflictLogs.filter((c) => c.status !== 401);
  conflictListeners.forEach((cb) => {
    try { cb(null); } catch (_) {}
  });
  if (queueStatus.state === 'paused_auth_required') {
    updateQueueStatus('idle', 'Fila reativada');
  }
  try {
    const conflicts = await loadUnacknowledgedConflicts();
    const authConflicts = conflicts.filter((c) => c.status === 401);
    for (const ac of authConflicts) {
      await acknowledgeConflict(ac.id || ac.mutationId);
    }
  } catch (_) {}
}

/**
 * Atualiza atômica e permanentemente as credenciais de autenticação (token e userId)
 * em todas as mutações pendentes armazenadas no IndexedDB.
 * Remove duplicatas de headers (maiúsculas/minúsculas) e assegura que qualquer
 * envio subsequente utilize o token fresco do usuário conectado.
 * 
 * @param {string} token
 * @param {string} userId
 */
export async function updatePendingMutationsCredentials(token, userId) {
  if (!token && !userId) return;
  try {
    const db = await openSyncDB();
    await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const list = req.result || [];
        for (const item of list) {
          const headers = { ...(item.headers || {}) };
          for (const key of Object.keys(headers)) {
            if (key.toLowerCase() === 'authorization' || key.toLowerCase() === 'x-user-id') {
              delete headers[key];
            }
          }
          if (token) {
            headers['Authorization'] = `Bearer ${token}`;
          }
          if (userId) {
            headers['X-User-Id'] = userId;
          }
          item.headers = headers;
          store.put(item);
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });

    if (typeof navigator !== 'undefined' && navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'UPDATE_CREDENTIALS',
        token,
        userId
      });
    }
  } catch (_) {}
}

/**
 * Escuta notificações de conflitos resolvidos
 */
export function subscribeConflictNotifications(callback) {
  conflictListeners.add(callback);
  return () => conflictListeners.delete(callback);
}

/**
 * Abre ou inicializa o banco IndexedDB de sincronização
 * @returns {Promise<IDBDatabase>}
 */
export function openSyncDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB não suportado neste ambiente'));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: 'id',
          autoIncrement: true
        });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
      if (!db.objectStoreNames.contains(CONFLICT_STORE)) {
        const conflictStore = db.createObjectStore(CONFLICT_STORE, {
          keyPath: 'id',
          autoIncrement: true
        });
        conflictStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Enfileira uma mutação pendente no IndexedDB
 * @param {{ url: string, method: string, headers?: Record<string, string>, body?: any, operationId?: string }} mutation
 * @returns {Promise<number>} ID do registro gerado
 */
export async function enqueuePendingMutation({ url, method, headers = {}, body = null, operationId = null, listId = null }) {
  const db = await openSyncDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    // [AUDIT-FIX #1]: Gera operationId criptográfico único para garantir idempotência contra reenvios acidentais no 3G
    const effectiveOpId = operationId || (typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `op_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`);

    const stringBody = typeof body === 'string' ? body : (body ? JSON.stringify(body) : null);
    let resolvedListId = listId;
    if (!resolvedListId && typeof body === 'object' && body !== null) {
      resolvedListId = body.list_id || body.listId || null;
    } else if (!resolvedListId && stringBody) {
      try {
        const parsed = JSON.parse(stringBody);
        resolvedListId = parsed?.list_id || parsed?.listId || null;
      } catch (_) {}
    }

    const record = {
      url,
      method: method.toUpperCase(),
      headers: {
        ...(headers || { 'Content-Type': 'application/json' }),
        'X-Operation-Id': effectiveOpId
      },
      body: stringBody,
      listId: resolvedListId,
      operationId: effectiveOpId,
      timestamp: Date.now(),
      attempts: 0
    };

    const req = store.add(record);
    req.onsuccess = () => {
      resolve(req.result);
      // Agenda a sincronização nativa em segundo plano
      requestBackgroundSync().catch(() => {});
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Recupera todas as mutações pendentes ordenadas por timestamp (FIFO)
 * @returns {Promise<Array<{ id: number, url: string, method: string, headers: Record<string, string>, body: string, timestamp: number, attempts: number }>>}
 */
export async function getPendingMutations() {
  const db = await openSyncDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();

    req.onsuccess = () => {
      const list = req.result || [];
      list.sort((a, b) => a.timestamp - b.timestamp);
      resolve(list);
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Remove uma mutação sincronizada com sucesso da fila
 * @param {number} id
 * @returns {Promise<void>}
 */
export async function removePendingMutation(id) {
  const db = await openSyncDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Incrementa o número de tentativas em caso de erro transitório de rede
 * @param {number} id
 */
export async function incrementMutationAttempts(id) {
  const db = await openSyncDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(id);

    getReq.onsuccess = () => {
      const item = getReq.result;
      if (!item) return resolve();
      item.attempts = (item.attempts || 0) + 1;
      const putReq = store.put(item);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

/**
 * Solicita o registro de sincronização em segundo plano no Service Worker (SyncManager Nativo)
 */
export async function requestBackgroundSync() {
  if (typeof window === 'undefined') return false;

  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.sync.register(SYNC_TAG);
      return true;
    } catch (_) {
      // Falha permissiva: fallback automático será acionado
    }
  }
  return false;
}

/**
 * Drena e executa sequencialmente as mutações pendentes (Usado pelo SW e como Fallback no Window)
 * @param {typeof fetch} [fetchFn]
 * @returns {Promise<{ processed: number, remaining: number }>}
 */
export async function flushPendingMutations(fetchFn = fetch) {
  let mutations = [];
  try {
    mutations = await getPendingMutations();
  } catch (_) {
    return { processed: 0, remaining: 0 };
  }

  if (mutations.length === 0) {
    // Fila vazia: se houver qualquer conflito 401 antigo pendente de reconhecimento, limpa automaticamente
    await purgeAuthConflicts();
    updateQueueStatus('idle', 'Sincronização concluída com sucesso');
    return { processed: 0, remaining: 0 };
  }

  let processed = 0;

  for (const item of mutations) {
    try {
      // [AUDIT-FIX #1]: Inclui o header X-Operation-Id na requisição para reenvios idempotentes
      const headers = { ...(item.headers || { 'Content-Type': 'application/json' }) };
      if (item.operationId) {
        headers['X-Operation-Id'] = item.operationId;
      }

      // Atualiza credenciais caso o usuário tenha reautenticado após pausa por 401
      if (typeof localStorage !== 'undefined') {
        const freshToken = localStorage.getItem('feira_auth_token');
        const freshUserId = localStorage.getItem('feira_user_id');

        if (freshToken) {
          for (const key of Object.keys(headers)) {
            if (key.toLowerCase() === 'authorization') delete headers[key];
          }
          headers['Authorization'] = `Bearer ${freshToken}`;
        }
        if (freshUserId) {
          for (const key of Object.keys(headers)) {
            if (key.toLowerCase() === 'x-user-id') delete headers[key];
          }
          headers['X-User-Id'] = freshUserId;
        }
      }

      const options = {
        method: item.method,
        headers
      };

      if (item.body && item.method !== 'GET' && item.method !== 'HEAD') {
        options.body = item.body;
      }

      const res = await fetchFn(item.url, options);

      // 2xx = Sucesso | 401 = Pausa e retenção | 403 = Conflito com alerta explícito | Outros 4xx = Descarte anti-deadlock
      if (res.ok) {
        await removePendingMutation(item.id);
        processed++;
        updateQueueStatus('syncing', 'Sincronizando operações pendentes');
      } else if (res.status === 401) {
        // [AUDIT-FIX #3]: HTTP 401 (Token expirado/ausente): retém a fila e pausa até reautenticação
        const reason = 'Sessão expirada: faça login novamente para reenviar as operações pendentes';
        updateQueueStatus('paused_auth_required', reason);
        recordConflict({
          id: item.id,
          url: item.url,
          method: item.method,
          status: 401,
          timestamp: Date.now(),
          reason
        });
        if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
          try {
            window.dispatchEvent(new CustomEvent('cestaon:sync-auth-required', { detail: { mutationId: item.id, reason } }));
          } catch (_) {}
        }
        break; // Preserva ordenação FIFO e mantém na fila
      } else if (res.status === 403) {
        // [AUDIT-FIX #3]: HTTP 403 (Permissão negada): NÃO descarta silenciosamente
        const reason = 'Acesso negado (HTTP 403): permissão insuficiente para executar esta alteração nesta feira ou conta';
        const conflictRecord = {
          id: item.id,
          url: item.url,
          method: item.method,
          status: 403,
          timestamp: Date.now(),
          reason
        };

        // Aguarda a persistência estrita no IndexedDB antes de remover a mutação
        let persistOk = false;
        try {
          await persistConflict(conflictRecord);
          persistOk = true;
        } catch (_) {
          persistOk = false;
        }

        if (!persistOk) {
          // Trata falha de escrita como não confirmada: mantém a mutação na fila e interrompe
          break;
        }

        recordConflict(conflictRecord);
        if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
          try {
            window.dispatchEvent(new CustomEvent('cestaon:sync-permission-denied', {
              detail: { id: item.id, url: item.url, reason }
            }));
          } catch (_) {}
        }
        await removePendingMutation(item.id);
        processed++;
      } else if (res.status === 429 || res.status === 408) {
        // [AUDIT-FIX LOG-06]: Rate limit (429) ou timeout transitório (408) — NÃO descarta a mutação do usuário!
        break;
      } else if (res.status >= 400 && res.status < 500) {
        const reason = res.status === 404
          ? 'Item ou feira não encontrada no servidor'
          : 'Operação descartada: feira já finalizada ou dados inconsistentes';
        recordConflict({
          id: item.id,
          url: item.url,
          method: item.method,
          status: res.status,
          timestamp: Date.now(),
          reason
        });
        await removePendingMutation(item.id);
        processed++;
      } else {
        // Erro de servidor transitório (5xx)
        if ((item.attempts || 0) >= 4) {
          // Dead Letter Queue (DLQ): após 5 tentativas consecutivas de erro 5xx,
          // descarta a mutação com registro de conflito para evitar deadlock perpétuo da fila FIFO
          recordConflict({
            id: item.id,
            url: item.url,
            method: item.method,
            status: res.status,
            timestamp: Date.now(),
            reason: 'Excedido o limite de 5 tentativas de sincronização (Erro 5xx). Operação movida para Dead Letter Queue.'
          });
          await removePendingMutation(item.id);
          processed++;
          continue;
        }
        await incrementMutationAttempts(item.id);
        break; // Interrompe para preservar ordenação causal FIFO
      }
    } catch (_) {
      // Erro de rede (ainda offline): incrementa e interrompe
      await incrementMutationAttempts(item.id);
      break;
    }
  }

  const remaining = (await getPendingMutations().catch(() => [])).length;
  if (remaining === 0) {
    await purgeAuthConflicts();
    updateQueueStatus('idle', 'Sincronização concluída com sucesso');
  }
  return { processed, remaining };
}

/**
 * Hook utilitário para escutar alterações no tamanho da fila pendente
 */
export function subscribePendingMutationsCount(callback) {
  if (typeof window === 'undefined') return () => {};

  let active = true;
  const check = async () => {
    if (!active) return;
    try {
      const list = await getPendingMutations();
      callback(list.length);
    } catch (_) {
      callback(0);
    }
  };

  // Verifica imediatamente
  check();

  // Escuta retornos de rede online
  const onOnline = () => {
    flushPendingMutations().then(() => check());
  };

  window.addEventListener('online', onOnline);

  // Escuta mensagens emitidas pelo Service Worker pós-sincronização
  const onMessage = (event) => {
    if (event.data?.type === 'SYNC_COMPLETED') {
      check();
    } else if (event.data?.type === 'SYNC_AUTH_REQUIRED') {
      const freshToken = typeof localStorage !== 'undefined' ? localStorage.getItem('feira_auth_token') : null;
      const freshUserId = typeof localStorage !== 'undefined' ? localStorage.getItem('feira_user_id') : null;
      if (freshToken) {
        // Se já temos token ativo no aparelho, atualiza credenciais e drena a fila sem exibir falso erro 401
        updatePendingMutationsCredentials(freshToken, freshUserId).then(() => {
          purgeAuthConflicts().then(() => {
            flushPendingMutations().then(() => check());
          });
        });
        return;
      }
      updateQueueStatus('paused_auth_required', 'Fila pausada: autenticação necessária. Faça login novamente para sincronizar.');
      recordConflict({
        id: event.data.mutationId,
        status: 401,
        timestamp: Date.now(),
        reason: 'Sessão expirada: faça login novamente para sincronizar suas operações'
      });
      check();
    } else if (event.data?.type === 'SYNC_PERMISSION_DENIED') {
      recordConflict({
        id: event.data.mutationId,
        url: event.data.url,
        status: 403,
        timestamp: Date.now(),
        reason: event.data.reason || 'Acesso negado (HTTP 403): permissão insuficiente para executar esta alteração'
      });
      check();
    }
  };

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', onMessage);
  }

  // Intervalo leve de polling local para manter contadores em sincronia entre abas
  const timer = setInterval(check, 3000);

  return () => {
    active = false;
    clearInterval(timer);
    window.removeEventListener('online', onOnline);
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.removeEventListener('message', onMessage);
    }
  };
}

/**
 * [AUDIT-FIX #8]: Limpa ativamente do IndexedDB mutações pendentes de uma feira cujo acesso foi revogado
 * @param {string} listId
 * @returns {Promise<number>} Quantidade de mutações descartadas
 */
export async function purgeListOfflineData(listId) {
  if (!listId) return 0;
  try {
    const db = await openSyncDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => {
        const all = req.result || [];
        let deleted = 0;
        for (const item of all) {
          const matchesList = (item.listId && item.listId === listId) ||
                              (item.url && item.url.includes(listId)) ||
                              (typeof item.body === 'string' && item.body.includes(`"${listId}"`));
          if (matchesList) {
            store.delete(item.id);
            deleted++;
          }
        }
        resolve(deleted);
      };
      req.onerror = () => resolve(0);
    });
  } catch (_) {
    return 0;
  }
}

