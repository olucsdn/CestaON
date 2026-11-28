/* Service Worker — CestaON PWA 100% Offline-First (Modo Subsolo & Background Sync) */

const CACHE_NAME = 'cestaon-pwa-v11-prod';
const DB_NAME = 'feira_sync_db';
const DB_VERSION = 2;
const STORE_NAME = 'pending_mutations';
const CONFLICT_STORE = 'sync_conflicts';
const SYNC_TAG = 'sync-feira-mutations';

let cachedAuthToken = null;
let cachedUserId = null;

self.addEventListener('message', (event) => {
  if (event.data?.type === 'UPDATE_CREDENTIALS') {
    cachedAuthToken = event.data.token || null;
    cachedUserId = event.data.userId || null;
  }
});

const CORE_STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg'
];

/**
 * Utilitários do IndexedDB no Service Worker para Background Sync
 */
function openSyncDBSW() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB indisponível'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
      if (!db.objectStoreNames.contains(CONFLICT_STORE)) {
        const conflictStore = db.createObjectStore(CONFLICT_STORE, { keyPath: 'id', autoIncrement: true });
        conflictStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function enqueuePendingMutationSW(record) {
  const db = await openSyncDBSW();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.add({
      ...record,
      timestamp: Date.now(),
      attempts: 0
    });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function flushPendingMutationsSW() {
  let db;
  try {
    db = await openSyncDBSW();
  } catch (_) {
    return { processed: 0, remaining: 0 };
  }

  const mutations = await new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => {
      const list = req.result || [];
      list.sort((a, b) => a.timestamp - b.timestamp);
      resolve(list);
    };
    req.onerror = () => resolve([]);
  });

  if (mutations.length === 0) return { processed: 0, remaining: 0 };

  let processed = 0;
  for (const item of mutations) {
    try {
      const headers = { ...(item.headers || { 'Content-Type': 'application/json' }) };
      for (const key of Object.keys(headers)) {
        if (key.toLowerCase() === 'authorization' || key.toLowerCase() === 'x-user-id') {
          delete headers[key];
        }
      }
      if (cachedAuthToken) {
        headers['Authorization'] = `Bearer ${cachedAuthToken}`;
      } else if (item.headers?.Authorization || item.headers?.authorization) {
        headers['Authorization'] = item.headers.Authorization || item.headers.authorization;
      }
      if (cachedUserId) {
        headers['X-User-Id'] = cachedUserId;
      } else if (item.headers?.['X-User-Id'] || item.headers?.['x-user-id']) {
        headers['X-User-Id'] = item.headers['X-User-Id'] || item.headers['x-user-id'];
      }

      const options = {
        method: item.method,
        headers
      };
      if (item.body && item.method !== 'GET' && item.method !== 'HEAD') {
        options.body = item.body;
      }
      const res = await fetch(item.url, options);
      if (res.ok) {
        await new Promise((resDel) => {
          const delTx = db.transaction(STORE_NAME, 'readwrite');
          delTx.objectStore(STORE_NAME).delete(item.id);
          delTx.oncomplete = () => resDel();
          delTx.onerror = () => resDel();
        });
        processed++;
      } else if (res.status === 401) {
        // [AUDIT-FIX #3]: 401 (Token expirado/ausente): PAUSA a fila e retém mutações até login
        try {
          const clientsList = await self.clients.matchAll();
          for (const client of clientsList) {
            client.postMessage({ type: 'SYNC_AUTH_REQUIRED', mutationId: item.id });
          }
        } catch (_) {}
        break; // Mantém a fila pausada no IndexedDB sem deletar!
      } else if (res.status === 403) {
        // [AUDIT-FIX #2]: 403 (Permissão negada): Persiste o conflito no IndexedDB antes de remover a operação
        // Isso garante que se o app estiver fechado no momento do sync, a notificação não é perdida
        const conflictRecord = {
          mutationId: item.id,
          url: item.url,
          method: item.method,
          status: 403,
          timestamp: Date.now(),
          reason: 'Acesso negado (HTTP 403): permissão insuficiente para executar esta alteração',
          acknowledged: false
        };

        let persistSuccess = false;
        try {
          if (db.objectStoreNames.contains(CONFLICT_STORE)) {
            await new Promise((resolve, reject) => {
              const confTx = db.transaction(CONFLICT_STORE, 'readwrite');
              const req = confTx.objectStore(CONFLICT_STORE).add(conflictRecord);
              confTx.oncomplete = () => {
                persistSuccess = true;
                resolve();
              };
              confTx.onerror = () => reject(confTx.error || req.error);
              confTx.onabort = () => reject(confTx.error || new Error('Transação abortada'));
            });
          }
        } catch (_) {
          persistSuccess = false;
        }

        // Se falhou ao persistir o conflito no IndexedDB, trata como não confirmada:
        // NÃO remove a mutação de pending_mutations e interrompe o flush para manter o estado até nova tentativa
        if (!persistSuccess) {
          break;
        }

        // Envia mensagem em tempo real para janelas abertas (se houver alguma no momento)
        try {
          const clientsList = await self.clients.matchAll();
          for (const client of clientsList) {
            client.postMessage({
              type: 'SYNC_PERMISSION_DENIED',
              ...conflictRecord
            });
          }
        } catch (_) {}

        // Remove a mutação da fila apenas após confirmação estrita de persistência do conflito
        await new Promise((resDel) => {
          const delTx = db.transaction(STORE_NAME, 'readwrite');
          delTx.objectStore(STORE_NAME).delete(item.id);
          delTx.oncomplete = () => resDel();
          delTx.onerror = () => resDel();
        });
        processed++;
      } else if (res.status === 429 || res.status === 408) {
        // [AUDIT-FIX LOG-06]: Rate limit (429) ou timeout transitório (408) — NÃO descarta a mutação do usuário!
        break;
      } else if (res.status >= 400 && res.status < 500) {
        await new Promise((resDel) => {
          const delTx = db.transaction(STORE_NAME, 'readwrite');
          delTx.objectStore(STORE_NAME).delete(item.id);
          delTx.oncomplete = () => resDel();
          delTx.onerror = () => resDel();
        });
        processed++;
      } else {
        break; // Interrompe para manter a integridade da sequência FIFO
      }
    } catch (_) {
      break; // Rede ainda sem conexão
    }
  }

  const remaining = mutations.length - processed;
  if (remaining === 0) {
    try {
      if (db.objectStoreNames.contains(CONFLICT_STORE)) {
        const confTx = db.transaction(CONFLICT_STORE, 'readwrite');
        const confStore = confTx.objectStore(CONFLICT_STORE);
        const req = confStore.getAll();
        req.onsuccess = () => {
          const list = req.result || [];
          for (const c of list) {
            if (c.status === 401) {
              confStore.delete(c.id || c.mutationId);
            }
          }
        };
      }
    } catch (_) {}
  }

  return { processed, remaining };
}

function normalizeUnitSW(quantity, unit) {
  const u = (unit || '').toLowerCase().trim();
  if (u === 'g' || u === 'gramas') return { baseQuantity: quantity / 1000, baseUnit: 'kg' };
  if (u === 'kg' || u === 'quilos') return { baseQuantity: quantity, baseUnit: 'kg' };
  if (u === 'ml' || u === 'mililitros') return { baseQuantity: quantity / 1000, baseUnit: 'L' };
  if (u === 'l' || u === 'litro' || u === 'litros') return { baseQuantity: quantity, baseUnit: 'L' };
  if (u === 'dz' || u === 'duzia' || u === 'dúzia') return { baseQuantity: quantity * 12, baseUnit: 'un' };
  return { baseQuantity: quantity, baseUnit: u || 'un' };
}

function calculateNormalizedPriceSW(priceCents, quantity, unit) {
  const safePrice = Number.isFinite(priceCents) && priceCents > 0 ? Math.round(priceCents) : 0;
  const safeQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
  const { baseQuantity, baseUnit } = normalizeUnitSW(safeQuantity, unit);
  if (baseQuantity <= 0 || safePrice <= 0) return { normalizedPriceCents: safePrice, baseUnit };
  const normalizedPriceCents = Math.round(safePrice / baseQuantity);
  return { normalizedPriceCents, baseUnit };
}

function computePackageComparisonSW(optionA, optionB) {
  const normA = calculateNormalizedPriceSW(Number(optionA.priceCents), Number(optionA.quantity), optionA.unit);
  const normB = calculateNormalizedPriceSW(Number(optionB.priceCents), Number(optionB.quantity), optionB.unit);

  if (normA.baseUnit !== normB.baseUnit) {
    return {
      canCompare: false,
      message: `Unidades incompatíveis para comparação direta (${normA.baseUnit} vs ${normB.baseUnit}).`,
      isSubsurfaceSW: true
    };
  }

  const diffCents = normA.normalizedPriceCents - normB.normalizedPriceCents;
  const bestOption = diffCents > 0 ? 'B' : diffCents < 0 ? 'A' : 'EQUAL';
  let percentSavings = 0;
  if (bestOption === 'B' && normA.normalizedPriceCents > 0) {
    percentSavings = Math.round(((diffCents / normA.normalizedPriceCents) * 100) * 10) / 10;
  } else if (bestOption === 'A' && normB.normalizedPriceCents > 0) {
    percentSavings = Math.round(((Math.abs(diffCents) / normB.normalizedPriceCents) * 100) * 10) / 10;
  }

  return {
    canCompare: true,
    baseUnit: normA.baseUnit,
    optionA: {
      ...optionA,
      pricePerBaseUnitCents: normA.normalizedPriceCents
    },
    optionB: {
      ...optionB,
      pricePerBaseUnitCents: normB.normalizedPriceCents
    },
    bestOption,
    percentSavings,
    summary: bestOption === 'EQUAL'
      ? 'Ambas as opções possuem exatamente o mesmo preço por unidade base.'
      : `A opção ${bestOption} é ${percentSavings.toFixed(1).replace('.', ',')}% mais econômica por ${normA.baseUnit}.`,
    isSubsurfaceSW: true
  };
}

// Instalação do Service Worker: Pre-cache dos recursos vitais
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(CORE_STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Ativação do Service Worker: Limpeza de caches obsoletos e controle imediato
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Interceptação de Requisições de Rede
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. Ignora conexões WebSocket e esquemas não HTTP/HTTPS
  if (url.protocol === 'ws:' || url.protocol === 'wss:' || !url.protocol.startsWith('http')) {
    return;
  }

  // 2. Navegação de Páginas (SPA) — Estratégia Network-First com Fallback Instantâneo para Cache
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match('/index.html').then((cached) => cached || caches.match(request));
        })
    );
    return;
  }

  // 3. Chamadas de API REST (/api/...)
  if (url.pathname.startsWith('/api/')) {
    // 3.1 Interceptação offline especial para a Calculadora Inteligente de Embalagens
    if (url.pathname === '/api/tools/compare-packages' && request.method === 'POST') {
      event.respondWith(
        fetch(request.clone()).catch(async () => {
          try {
            const body = await request.json();
            const { optionA, optionB } = body || {};
            if (optionA && optionB) {
              const resData = computePackageComparisonSW(optionA, optionB);
              return new Response(JSON.stringify(resData), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
              });
            }
          } catch (_) {}
          return new Response(JSON.stringify({ offline: true, error: 'Falha no cálculo offline' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          });
        })
      );
      return;
    }

    // 3.2 Bloqueio de interceptação de operações de autenticação sensíveis
    const isSensitiveAuth = url.pathname.startsWith('/api/users/login') ||
                           url.pathname.startsWith('/api/users/recover') ||
                           url.pathname.startsWith('/api/users/send-verification-code') ||
                           url.pathname.startsWith('/api/users/security-question') ||
                           (url.pathname === '/api/users' && request.method === 'POST') ||
                           url.pathname.includes('/verify-pin');

    if (isSensitiveAuth) {
      // [AUDIT-FIX SEC-08]: Credenciais, senhas e operações de autenticação NUNCA são
      // enfileiradas em texto plano no IndexedDB nem retidas no cache local.
      event.respondWith(
        fetch(request).catch(() => {
          return new Response(JSON.stringify({
            error: 'Você está offline. É necessária uma conexão ativa com a internet para realizar operações de autenticação e segurança.'
          }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          });
        })
      );
      return;
    }

    if (request.method === 'GET') {
      // Para GET na API: Tenta rede primeiro para dados frescos; se sem sinal, devolve cache local
      event.respondWith(
        fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.ok) {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
            }
            return networkResponse;
          })
          .catch(() => {
            return caches.match(request).then((cached) => {
              if (cached) return cached;
              return new Response(JSON.stringify({ offline: true, error: 'Offline - sem conexão' }), {
                status: 503,
                headers: { 'Content-Type': 'application/json' }
              });
            });
          })
      );
    } else {
      // Para POST, PUT, DELETE: Tenta rede direta; se falhar (offline), enfileira no IndexedDB para Background Sync (SyncManager)
      event.respondWith(
        fetch(request.clone()).catch(async () => {
          try {
            const cloned = request.clone();
            const bodyText = await cloned.text();
            const headersObj = {};
            for (const [k, v] of request.headers.entries()) {
              headersObj[k] = v;
            }

            let listIdFromPayload = null;
            try {
              const parsed = JSON.parse(bodyText);
              listIdFromPayload = parsed?.list_id || parsed?.listId || null;
            } catch (_) {}

            await enqueuePendingMutationSW({
              url: request.url,
              method: request.method,
              headers: headersObj,
              body: bodyText,
              listId: listIdFromPayload
            });

            if ('sync' in self.registration) {
              await self.registration.sync.register(SYNC_TAG);
            }

            return new Response(JSON.stringify({
              offline: true,
              enqueued: true,
              message: 'Operação salva no dispositivo e agendada para sincronização em segundo plano via SyncManager'
            }), {
              status: 202,
              headers: { 'Content-Type': 'application/json' }
            });
          } catch (err) {
            return new Response(JSON.stringify({ offline: true, error: err.message }), {
              status: 503,
              headers: { 'Content-Type': 'application/json' }
            });
          }
        })
      );
    }
    return;
  }

  // 4. Recursos Estáticos (JS, CSS, Imagens, Fontes Google, etc.) — Stale-While-Revalidate
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
        }
        return networkResponse;
      });

      if (cachedResponse) {
        // Se já está no cache, devolve imediatamente e atualiza em background
        fetchPromise.catch(() => {});
        return cachedResponse;
      }

      // Se não há cache, aguarda a resposta direta da rede
      return fetchPromise;
    })
  );
});

// 5. Background Sync Nativo (SyncManager)
self.addEventListener('sync', (event) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(
      flushPendingMutationsSW().then(async ({ processed, remaining }) => {
        const clients = await self.clients.matchAll({ type: 'window' });
        for (const client of clients) {
          client.postMessage({
            type: 'SYNC_COMPLETED',
            processed,
            remaining
          });
        }
      })
    );
  }
});

// Exposição no escopo do Service Worker (self) para compatibilidade e testes de integração
if (typeof self !== 'undefined') {
  self.flushPendingMutationsSW = flushPendingMutationsSW;
  self.enqueuePendingMutationSW = enqueuePendingMutationSW;
  self.openSyncDBSW = openSyncDBSW;
  self.computePackageComparisonSW = computePackageComparisonSW;
  self.normalizeUnitSW = normalizeUnitSW;
  self.calculateNormalizedPriceSW = calculateNormalizedPriceSW;
}
