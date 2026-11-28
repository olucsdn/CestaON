/**
 * Memory-safe Rate Limiter Middleware
 * 
 * Previne ataques de força bruta com controle de janela deslizante (TTL),
 * expurgo automático periódico e teto máximo de chaves em memória (anti-memory leak / DoS).
 */

export function createRateLimiter({ windowMs = 60000, max = 5, maxEntries = 1000 } = {}) {
  const store = new Map();

  function cleanup() {
    const now = Date.now();
    for (const [key, record] of store.entries()) {
      if (now > record.resetAt) {
        store.delete(key);
      }
    }
  }

  // Limpeza periódica leve sem reter o processo ativo no shutdown
  const timer = setInterval(cleanup, 60000);
  if (timer.unref) timer.unref();

  return {
    check(key) {
      const now = Date.now();
      let record = store.get(key);
      if (!record || now > record.resetAt) {
        // Enforce teto máximo de chaves contra ataques de inflação de memória
        if (store.size >= maxEntries) {
          cleanup();
          if (store.size >= maxEntries) {
            // Remove a chave mais antiga
            const oldestKey = store.keys().next().value;
            if (oldestKey) store.delete(oldestKey);
          }
        }
        record = { count: 0, resetAt: now + windowMs };
      }
      record.count++;
      store.set(key, record);
      return record.count <= max;
    },
    reset(key) {
      if (key) store.delete(key);
      else store.clear();
    },
    size() {
      return store.size;
    },
    cleanup,
    close() {
      clearInterval(timer);
      store.clear();
    }
  };
}

// Limitador de PIN: 5 tentativas por minuto por IP/usuário
export const pinRateLimiter = createRateLimiter({ windowMs: 60000, max: 5, maxEntries: 2000 });

// Limitador de Join de Feiras por Código: 15 tentativas por minuto por IP
export const joinRateLimiter = createRateLimiter({ windowMs: 60000, max: 15, maxEntries: 2000 });

// Limitador de Criação de Recursos (Perfis e Feiras): 30 criações por minuto por IP contra Flood/DoS
export const creationRateLimiter = createRateLimiter({ windowMs: 60000, max: 30, maxEntries: 2000 });

// Limitador de Health Check: 60 verificações por minuto por IP contra Flood/DoS na persistência
export const healthRateLimiter = createRateLimiter({ windowMs: 60000, max: 60, maxEntries: 2000 });
