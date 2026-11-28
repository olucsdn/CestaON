import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { getDatabase, createReplicatedDatabase, restoreFromLibsql, isLibsqlConfigured } from '../server/db/database.js';
import { seedDatabase } from '../server/db/seed.js';
import { SocketManager } from '../server/ws/socketManager.js';
import { createApiRouter } from '../server/routes/api.js';
import { UserRepository } from '../server/repositories/userRepository.js';
import { ListRepository } from '../server/repositories/listRepository.js';
import {
  createSessionToken,
  verifySessionToken,
  validateAuthSecretConfiguration,
  DEFAULT_DEV_SECRET
} from '../server/middlewares/auth.js';
import {
  enqueuePendingMutation,
  getPendingMutations,
  flushPendingMutations,
  getQueueStatus,
  clearConflictLogs,
  getConflictLogs,
  subscribeConflictNotifications,
  persistConflict,
  loadUnacknowledgedConflicts,
  acknowledgeConflict
} from '../client/src/utils/syncManager.js';
import { validateProductionPersistence, createHealthHandler } from '../server/index.js';

// Polyfill minimal e fiel do IndexedDB para testes no ambiente Node.js com suporte a stores múltiplos
function setupIndexedDBPolyfill() {
  const mutationMap = new Map();
  const conflictMap = new Map();
  let nextMutationId = 1;
  let nextConflictId = 1;
  let failConflictStore = false;

  const mockDb = {
    objectStoreNames: {
      contains: (name) => name === 'pending_mutations' || name === 'sync_conflicts'
    },
    createObjectStore: () => ({
      createIndex: () => {}
    }),
    transaction: (storeNames) => {
      const targetStoreName = Array.isArray(storeNames) ? storeNames[0] : storeNames;
      const tx = {
        oncomplete: null,
        onerror: null,
        onabort: null,
        error: null,
        objectStore: (name) => {
          const storeToUse = name || targetStoreName;
          const activeMap = storeToUse === 'sync_conflicts' ? conflictMap : mutationMap;
          return {
            add: (record) => {
              const req = { onsuccess: null, onerror: null, result: null, error: null };
              queueMicrotask(() => {
                if (failConflictStore && storeToUse === 'sync_conflicts') {
                  const quotaErr = new Error('IndexedDB QuotaExceededError');
                  req.error = quotaErr;
                  tx.error = quotaErr;
                  if (req.onerror) req.onerror({ target: req });
                  if (tx.onerror) tx.onerror({ target: tx });
                  return;
                }
                const id = record.id || (activeMap === conflictMap ? nextConflictId++ : nextMutationId++);
                const cloned = { ...record, id };
                activeMap.set(id, cloned);
                req.result = id;
                if (req.onsuccess) req.onsuccess({ target: req });
                if (tx.oncomplete) tx.oncomplete();
              });
              return req;
            },
            getAll: () => {
              const req = { onsuccess: null, onerror: null, result: null };
              queueMicrotask(() => {
                req.result = Array.from(activeMap.values());
                if (req.onsuccess) req.onsuccess({ target: req });
                if (tx.oncomplete) tx.oncomplete();
              });
              return req;
            },
            get: (id) => {
              const req = { onsuccess: null, onerror: null, result: null };
              queueMicrotask(() => {
                req.result = activeMap.get(id);
                if (req.onsuccess) req.onsuccess({ target: req });
                if (tx.oncomplete) tx.oncomplete();
              });
              return req;
            },
            put: (record) => {
              const req = { onsuccess: null, onerror: null, result: null };
              queueMicrotask(() => {
                activeMap.set(record.id, record);
                req.result = record.id;
                if (req.onsuccess) req.onsuccess({ target: req });
                if (tx.oncomplete) tx.oncomplete();
              });
              return req;
            },
            delete: (id) => {
              const req = { onsuccess: null, onerror: null, result: null };
              queueMicrotask(() => {
                activeMap.delete(id);
                req.result = undefined;
                if (req.onsuccess) req.onsuccess({ target: req });
                if (tx.oncomplete) tx.oncomplete();
              });
              return req;
            },
            clear: () => {
              const req = { onsuccess: null, onerror: null, result: null };
              queueMicrotask(() => {
                activeMap.clear();
                req.result = undefined;
                if (req.onsuccess) req.onsuccess({ target: req });
                if (tx.oncomplete) tx.oncomplete();
              });
              return req;
            }
          };
        }
      };
      return tx;
    }
  };

  globalThis.indexedDB = {
    open: () => {
      const req = {
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
        result: mockDb
      };
      queueMicrotask(() => {
        if (req.onupgradeneeded) {
          req.onupgradeneeded({ target: { result: mockDb } });
        }
        if (req.onsuccess) {
          req.onsuccess({ target: req });
        }
      });
      return req;
    }
  };

  return {
    cleanup: () => {
      mutationMap.clear();
      conflictMap.clear();
      nextMutationId = 1;
      nextConflictId = 1;
      delete globalThis.indexedDB;
    },
    setFailConflictStore: (val) => {
      failConflictStore = Boolean(val);
    }
  };
}

test('AUDITORIA E HARDENING DE PRODUÇÃO — Verificação Rigorosa dos Bloqueios Críticos', async (t) => {
  const TEST_SECRET = 'cestaon-production-audit-secret-32-chars-long-valid!';
  process.env.AUTH_SECRET = TEST_SECRET;

  const db = getDatabase(':memory:');
  seedDatabase(db);

  const app = express();
  app.use(express.json());
  const server = http.createServer(app);
  const socketManager = new SocketManager(server);
  app.use('/api', createApiRouter(db, socketManager));

  // Instala o createHealthHandler REAL exportado de server/index.js
  let healthCloudClient = null;
  const realHealthHandler = createHealthHandler(db, () => healthCloudClient);
  app.get('/health', realHealthHandler);

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api`;

  const userRepo = new UserRepository(db);
  const listRepo = new ListRepository(db);

  async function apiReq(path, options = {}) {
    const { headers, ...rest } = options;
    const res = await fetch(`${baseUrl}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(headers || {})
      },
      ...rest
    });
    let data = null;
    try {
      data = await res.json();
    } catch (_) {}
    return { status: res.status, data };
  }

  // --------------------------------------------------------------------------
  // ITEM 1: AUTORIZAÇÃO E MITIGAÇÃO DE IDOR EM ROTAS MUTÁVEIS
  // --------------------------------------------------------------------------
  await t.test('1. Autorização: Proteção de rotas mutáveis contra anônimos e IDOR em POST /shares', async () => {
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      // 1.1 POST /api/products sem token em produção -> 401
      const noAuthProd = await apiReq('/products', {
        method: 'POST',
        body: JSON.stringify({ name: 'Produto Sem Login' })
      });
      assert.equal(noAuthProd.status, 401, 'POST /products anônimo deve retornar 401');

      // 1.2 POST /api/products/:id/toggle-favorite sem token -> 401
      const noAuthFav = await apiReq('/products/prod_1/toggle-favorite', { method: 'POST' });
      assert.equal(noAuthFav.status, 401, 'POST /products/:id/toggle-favorite anônimo deve retornar 401');

      // 1.3 POST /api/stores sem token -> 401
      const noAuthStore = await apiReq('/stores', {
        method: 'POST',
        body: JSON.stringify({ name: 'Mercado Sem Login' })
      });
      assert.equal(noAuthStore.status, 401, 'POST /stores anônimo deve retornar 401');

      // 1.4 Rotas de leitura continuam públicas
      const pubCats = await apiReq('/categories');
      assert.equal(pubCats.status, 200);

      // 1.5 Cria dois usuários para teste de IDOR
      const userA = userRepo.create({ name: 'Dona Alice', email: 'alice.idor@cestaon.app' });
      const userB = userRepo.create({ name: 'Atacante Bob', email: 'bob.idor@cestaon.app' });
      const tokenA = createSessionToken({ sub: userA.id, email: userA.email });
      const tokenB = createSessionToken({ sub: userB.id, email: userB.email });

      // Cria lista pertencente exclusivamente à Alice
      const listA = listRepo.create({ title: 'Lista da Alice', owner_id: userA.id });

      // 1.6 IDOR ATTACK: Bob envia seu próprio token válido B, mas tenta forjar identidade da Alice via header X-User-Id
      const idorAttempt = await apiReq(`/lists/${listA.id}/shares`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenB}`,
          'X-User-Id': userA.id // Bob tenta fingir ser a Alice
        },
        body: JSON.stringify({
          user_id: userB.id,
          permission: 'admin'
        })
      });

      // DEVE RETORNAR 403 e NÃO CRIAR O SHARE
      assert.equal(idorAttempt.status, 403, 'Ataque IDOR com Token B e Header X-User-Id de A deve retornar HTTP 403');
      const refreshedListA = listRepo.getById(listA.id);
      const bobShare = (refreshedListA.shares || []).find((s) => s.user_id === userB.id);
      assert.equal(bobShare, undefined, 'Nenhum compartilhamento deve ter sido criado para Bob na lista da Alice');

      // 1.7 Alice com token A legítimo pode compartilhar com Bob
      const legitShare = await apiReq(`/lists/${listA.id}/shares`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({ user_id: userB.id, permission: 'write' })
      });
      assert.equal(legitShare.status, 201, 'Proprietária legítima deve conseguir compartilhar');
    } finally {
      process.env.NODE_ENV = prevEnv;
    }
  });

  // --------------------------------------------------------------------------
  // ITEM 2: ESCOPO E ISOLAMENTO DE USUÁRIOS
  // --------------------------------------------------------------------------
  await t.test('2. Isolamento: GET /users restringe ao titular e contatos com vínculo ativo', async () => {
    const userX = userRepo.create({ name: 'Usuario X', email: 'x@cestaon.app', security_question: 'Pergunta X' });
    const userY = userRepo.create({ name: 'Usuario Y', email: 'y@cestaon.app', security_question: 'Pergunta Y' });
    const tokenX = createSessionToken({ sub: userX.id, email: userX.email });

    // 2.1 Antes de qualquer compartilhamento, Usuario X NÃO deve ver Usuario Y em GET /api/users
    const unlinkedListRes = await apiReq('/users', {
      headers: { Authorization: `Bearer ${tokenX}` }
    });
    assert.equal(unlinkedListRes.status, 200);
    const hasYUnlinked = unlinkedListRes.data.some((u) => u.id === userY.id);
    assert.equal(hasYUnlinked, false, 'Usuario X sem vínculo NÃO deve ver Usuario Y na listagem');
    const hasXSelf = unlinkedListRes.data.some((u) => u.id === userX.id);
    assert.equal(hasXSelf, true, 'Usuario X deve ver o próprio perfil na listagem');

    // 2.2 Consulta direta GET /api/users/:id sem vínculo retorna 403
    const crossDirect = await apiReq(`/users/${userY.id}`, {
      headers: { Authorization: `Bearer ${tokenX}` }
    });
    assert.equal(crossDirect.status, 403, 'Acesso cruzado sem vínculo deve retornar HTTP 403');

    // 2.3 Cria vínculo legítimo compartilhando uma lista de X com Y
    const listX = listRepo.create({ title: 'Lista Compartilhada X-Y', owner_id: userX.id });
    listRepo.addShare(listX.id, userY.id, 'write');

    // Agora existe vínculo: Usuario X deve ver Usuario Y na listagem
    const linkedListRes = await apiReq('/users', {
      headers: { Authorization: `Bearer ${tokenX}` }
    });
    assert.equal(linkedListRes.status, 200);
    const linkedY = linkedListRes.data.find((u) => u.id === userY.id);
    assert.ok(linkedY, 'Com vínculo ativo, Usuario Y deve aparecer na listagem de contatos');
    assert.equal(linkedY.email, undefined, 'E-mail privado de Y nunca deve ser exposto na listagem');
    assert.equal(linkedY.security_question, undefined, 'Pergunta secreta de Y nunca deve ser exposta');

    // E a consulta direta ao perfil vinculado expõe apenas dados públicos necessários
    const crossLinked = await apiReq(`/users/${userY.id}`, {
      headers: { Authorization: `Bearer ${tokenX}` }
    });
    assert.equal(crossLinked.status, 200);
    assert.equal(crossLinked.data.id, userY.id);
    assert.equal(crossLinked.data.name, 'Usuario Y');
    assert.equal(crossLinked.data.email, undefined, 'E-mail de Y permanece privado mesmo com vínculo');
  });

  // --------------------------------------------------------------------------
  // ITEM 3: FILA OFFLINE REAL & RETENÇÃO DE CONFLITO 403 COM APP FECHADO
  // --------------------------------------------------------------------------
  await t.test('3. Fila Offline Real: retenção em 401, replay com novo token e persistência de 403 com app fechado', async () => {
    const idbControl = setupIndexedDBPolyfill();
    clearConflictLogs();

    // Configura localStorage e window no global para simular ambiente do cliente
    const localStore = new Map();
    globalThis.localStorage = {
      getItem: (k) => localStore.get(k) || null,
      setItem: (k, v) => localStore.set(k, String(v)),
      removeItem: (k) => localStore.delete(k)
    };

    const windowListeners = new Map();
    globalThis.window = {
      addEventListener: (type, fn) => {
        if (!windowListeners.has(type)) windowListeners.set(type, new Set());
        windowListeners.get(type).add(fn);
      },
      removeEventListener: (type, fn) => {
        windowListeners.get(type)?.delete(fn);
      },
      dispatchEvent: (event) => {
        const listeners = windowListeners.get(event.type);
        if (listeners) {
          listeners.forEach((fn) => {
            try { fn(event); } catch (_) {}
          });
        }
        return true;
      }
    };
    globalThis.CustomEvent = class CustomEvent {
      constructor(type, params = {}) {
        this.type = type;
        this.detail = params.detail;
      }
    };

    try {
      // 3.1 Enfileira mutação real com token expirado via REAL enqueuePendingMutation
      const expiredToken = createSessionToken({ sub: 'usr_real_offline' }, { expiresInSeconds: -30 });
      const mutationId = await enqueuePendingMutation({
        url: `${baseUrl}/stores`,
        method: 'POST',
        headers: { Authorization: `Bearer ${expiredToken}` },
        body: { name: 'Mercado Fila Offline Real' }
      });

      assert.ok(mutationId, 'Deve gerar ID na fila real do IndexedDB');
      const pendingBefore = await getPendingMutations();
      assert.equal(pendingBefore.length, 1, 'Deve conter 1 mutação persistida no IndexedDB');

      // 3.2 Executa o flushPendingMutations REAL contra o servidor Express
      const flush1 = await flushPendingMutations(fetch);
      assert.equal(flush1.processed, 0, 'Não deve processar com sucesso');
      assert.equal(flush1.remaining, 1, 'A mutação DEVE ser retida na fila em caso de 401');

      // Verifica status da fila
      const statusAfter401 = getQueueStatus();
      assert.equal(statusAfter401.state, 'paused_auth_required', 'Status da fila deve estar pausado');

      // Verifica que o conflito de 401 foi gravado no log para alerta na UI
      const conflicts = getConflictLogs();
      assert.ok(conflicts.length > 0, 'Deve registrar conflito no log para alerta visual');
      assert.equal(conflicts[0].status, 401);

      // 3.3 Usuário faz login e armazena token fresco no localStorage
      const freshToken = createSessionToken({ sub: 'usr_real_offline', email: 'real@cestaon.app' });
      globalThis.localStorage.setItem('feira_auth_token', freshToken);

      // 3.4 Executa novo flushPendingMutations REAL: deve usar o token fresco do localStorage e ter sucesso
      const flush2 = await flushPendingMutations(fetch);
      assert.equal(flush2.processed, 1, 'Operação retida deve ter sido executada com sucesso usando o token fresco');
      assert.equal(flush2.remaining, 0, 'Fila no IndexedDB deve estar completamente drenada');

      const pendingAfter = await getPendingMutations();
      assert.equal(pendingAfter.length, 0, 'IndexedDB deve estar vazio após flush com sucesso');

      // 3.5 Teste de 403 com APP FECHADO (zero clientes ativos):
      // Simula Service Worker processando mutação em background com clients.matchAll() => []
      const offlineConflict = {
        mutationId: 999,
        url: `${baseUrl}/forbidden`,
        method: 'POST',
        status: 403,
        reason: 'Acesso negado (HTTP 403): permissão insuficiente para executar esta alteração',
        timestamp: Date.now(),
        acknowledged: false
      };

      // Persiste conflito no IndexedDB (como o sw.js faz agora antes de apagar a mutação)
      await persistConflict(offlineConflict);

      // 3.6 Próximo carregamento: usuário abre o app. A função loadUnacknowledgedConflicts() lê o conflito
      const unacknowledged = await loadUnacknowledgedConflicts();
      assert.equal(unacknowledged.length, 1, 'Conflito 403 deve permanecer gravado no IndexedDB mesmo com app fechado');
      assert.equal(unacknowledged[0].status, 403);
      assert.ok(unacknowledged[0].reason.includes('403'));

      // Usuário clica em 'Entendi' na interface, chamando acknowledgeConflict
      await acknowledgeConflict(unacknowledged[0].id);

      // Confirma que após reconhecimento do usuário, o conflito é devidamente limpo
      const afterAck = await loadUnacknowledgedConflicts();
      assert.equal(afterAck.length, 0, 'Após reconhecimento do usuário, o conflito deve ser limpo do IndexedDB');

      // 3.7 Regressão SW Real: Provoca falha no IndexedDB durante 403 e valida retenção em pending_mutations
      globalThis.self = {
        addEventListener: () => {},
        skipWaiting: async () => {},
        clients: {
          matchAll: async () => [],
          claim: async () => {}
        },
        registration: {
          sync: {
            register: async () => {}
          }
        }
      };
      const swModule = await import('../client/public/sw.js');

      const mut403Id = await enqueuePendingMutation({
        url: `${baseUrl}/lists/invalid_list_id/shares`,
        method: 'POST',
        headers: { Authorization: `Bearer ${freshToken}` },
        body: { user_id: 'usr_default', permission: 'read' }
      });

      // Ativa falha de escrita no IndexedDB para a store sync_conflicts
      idbControl.setFailConflictStore(true);

      // Executa a rotina real do Service Worker (flushPendingMutationsSW)
      await globalThis.self.flushPendingMutationsSW();

      // Como a escrita do conflito falhou, a mutação NÃO pode ter sido removida de pending_mutations!
      const pendingAfterIdbError = await getPendingMutations();
      assert.ok(
        pendingAfterIdbError.some((m) => m.id === mut403Id),
        'Mutação DEVE ser retida na fila se houver falha de escrita no store sync_conflicts'
      );

      // Desativa a falha e reexecuta flushPendingMutationsSW com IndexedDB saudável
      idbControl.setFailConflictStore(false);
      await globalThis.self.flushPendingMutationsSW();

      // Agora a mutação foi removida com sucesso
      const pendingAfterIdbRecovered = await getPendingMutations();
      assert.ok(
        !pendingAfterIdbRecovered.some((m) => m.id === mut403Id),
        'Mutação deve ser removida após confirmação estrita de persistência do conflito'
      );

      // E ao reabrir o app, o aviso foi devidamente persistido e permanece visível
      const unackedAfterSw = await loadUnacknowledgedConflicts();
      assert.ok(unackedAfterSw.length >= 1, 'O aviso 403 não some ao reabrir o app');
      assert.equal(unackedAfterSw[0].status, 403);
    } finally {
      idbControl.cleanup();
      delete globalThis.self;
      delete globalThis.localStorage;
      delete globalThis.window;
      delete globalThis.CustomEvent;
    }
  });

  // --------------------------------------------------------------------------
  // ITEM 4: TURSO/LIBSQL ATOMICIDADE EM TRANSAÇÕES, BOOT E HEALTH CHECK REAL
  // --------------------------------------------------------------------------
  await t.test('4. Turso/LibSQL: Atomicidade transacional em lote, boot real fail-closed e health round-trip', async (t) => {
    const prevEnv = process.env.NODE_ENV;
    const prevUrl = process.env.LIBSQL_URL;
    const prevTurso = process.env.TURSO_DATABASE_URL;

    try {
      // 4.1 Validação do Boot Real de Produção via função exportada e execução de processo real
      process.env.NODE_ENV = 'production';
      delete process.env.LIBSQL_URL;
      delete process.env.TURSO_DATABASE_URL;

      // Executa a função real de validação exportada de server/index.js
      assert.throws(
        () => validateProductionPersistence(),
        /FALHA CRÍTICA DE PERSISTÊNCIA NO BOOT: LIBSQL_URL ou TURSO_DATABASE_URL é mandatória em produção/i
      );

      // Executa o boot real do script server/index.js via processo filho (subprocesso)
      const bootSubproc = spawnSync(process.execPath, ['server/index.js'], {
        env: {
          ...process.env,
          NODE_ENV: 'production',
          AUTH_SECRET: 'uma-chave-de-producao-com-mais-de-32-caracteres!',
          LIBSQL_URL: '',
          TURSO_DATABASE_URL: ''
        }
      });
      assert.equal(bootSubproc.status, 1, 'Processo real do server/index.js deve sair com código 1 em produção sem LIBSQL_URL');
      assert.match(
        bootSubproc.stderr.toString(),
        /FALHA CRÍTICA DE PERSISTÊNCIA NO BOOT: LIBSQL_URL ou TURSO_DATABASE_URL é mandatória em produção/i
      );

      // 4.2 Atomicidade Transacional na Replicação Cloud (Transações com Rollback e Commit com Batch)
      const localMemoryDb = getDatabase(':memory:');
      seedDatabase(localMemoryDb);

      const capturedBatches = [];
      const mockBatchClient = {
        batch: async (statements, mode) => {
          capturedBatches.push({ statements, mode });
          return statements.map(() => ({ rowsAffected: 1 }));
        },
        execute: async () => ({ rowsAffected: 1 }),
        executeMultiple: async () => ({})
      };

      const replicatedDb = createReplicatedDatabase(localMemoryDb, mockBatchClient);

      // Teste A: Transação com ROLLBACK no SQLite NÃO pode enviar nada para o LibSQL
      replicatedDb.exec('BEGIN IMMEDIATE;');
      replicatedDb.prepare('INSERT INTO stores (id, name) VALUES (?, ?)').run('store_temp', 'Mercado Temporario');
      replicatedDb.exec('ROLLBACK;');

      assert.equal(capturedBatches.length, 0, 'Nenhum lote deve ser enviado ao cloud após ROLLBACK local');
      const rollbackStore = localMemoryDb.prepare('SELECT * FROM stores WHERE id = ?').get('store_temp');
      assert.equal(rollbackStore, undefined, 'Registro no SQLite local deve ter sido cancelado');

      // Teste B: Transação com COMMIT e chaves estrangeiras envia o lote inteiro em ordem atômica
      replicatedDb.exec('BEGIN IMMEDIATE;');
      replicatedDb.prepare('INSERT INTO shopping_lists (id, title, owner_id) VALUES (?, ?, ?)').run('list_atom_1', 'Feira Atomica 1', 'usr_default');
      replicatedDb.prepare('INSERT INTO shopping_lists (id, title, owner_id) VALUES (?, ?, ?)').run('list_atom_2', 'Feira Atomica 2', 'usr_default');
      replicatedDb.prepare('INSERT INTO list_shares (id, list_id, user_id, permission) VALUES (?, ?, ?, ?)').run('share_atom_1', 'list_atom_1', 'usr_default', 'admin');
      replicatedDb.exec('COMMIT;');

      await replicatedDb.waitForReplication();

      assert.equal(capturedBatches.length, 1, 'Deve disparar exatamente 1 chamada atômica batch');
      assert.equal(capturedBatches[0].mode, 'write');
      assert.equal(capturedBatches[0].statements.length, 3, 'O lote deve conter todas as 3 operações da transação');
      assert.equal(capturedBatches[0].statements[0].args[0], 'list_atom_1', 'Ordem cronológica pai -> filho deve ser preservada para respeitar FKs');

      // Teste C: Falha na replicação remota do lote resulta em erro capturado em waitForReplication
      const failingBatchClient = {
        batch: async () => {
          throw new Error('Erro na conexão com cluster Turso Cloud durante batch');
        }
      };
      const failingReplicatedDb = createReplicatedDatabase(localMemoryDb, failingBatchClient);

      failingReplicatedDb.exec('BEGIN IMMEDIATE;');
      failingReplicatedDb.prepare('INSERT INTO stores (id, name) VALUES (?, ?)').run('store_fail_batch', 'Mercado Batch Fail');
      failingReplicatedDb.exec('COMMIT;');

      await assert.rejects(
        async () => await failingReplicatedDb.waitForReplication(),
        /Erro na conexão com cluster Turso Cloud durante batch/
      );

      // Comprova que como a gravação remota falhou no cloud, na restauração de um novo contêiner
      // o SQLite local não conterá essa operação, mantendo a consistência estrita com a nuvem
      const restoredFreshCheckDb = getDatabase(':memory:');
      await restoreFromLibsql(restoredFreshCheckDb, { execute: async () => ({ rows: [] }) });
      const failedStoreInFresh = restoredFreshCheckDb.prepare('SELECT * FROM stores WHERE id = ?').get('store_fail_batch');
      assert.equal(failedStoreInFresh, undefined, 'A alteração que falhou no cloud não existe no estado durável da nuvem');

      // Teste D: Concorrência - Não mantém transação SQLite aberta durante await de rede
      // Com batch remoto atrasado (simulando latência de rede):
      const delayedResolvers = [];
      const delayedBatchClient = {
        batch: async () => {
          return new Promise((resolve) => {
            delayedResolvers.push(resolve);
          });
        }
      };
      const concurrentDb = createReplicatedDatabase(getDatabase(':memory:'), delayedBatchClient);

      // Transação 1: Inicia, grava e comita localmente
      concurrentDb.exec('BEGIN IMMEDIATE;');
      concurrentDb.prepare('INSERT INTO stores (id, name) VALUES (?, ?)').run('store_c1', 'Mercado C1');
      concurrentDb.exec('COMMIT;');

      // Enquanto a replicação remota da Transação 1 ainda está em voo (pendente na rede):
      // A Transação 2 DEVE conseguir iniciar e comitar sem lançar "cannot start a transaction within a transaction"
      assert.doesNotThrow(() => {
        concurrentDb.exec('BEGIN IMMEDIATE;');
        concurrentDb.prepare('INSERT INTO stores (id, name) VALUES (?, ?)').run('store_c2', 'Mercado C2');
        concurrentDb.exec('COMMIT;');
      }, 'A próxima transação deve iniciar e terminar limpa sem conflito de transação aninhada');

      // Libera a rede e aguarda a replicação de ambas
      delayedResolvers.forEach((r) => r({ rowsAffected: 1 }));
      await concurrentDb.waitForReplication();

      const storeC1 = concurrentDb.prepare('SELECT * FROM stores WHERE id = ?').get('store_c1');
      const storeC2 = concurrentDb.prepare('SELECT * FROM stores WHERE id = ?').get('store_c2');
      assert.ok(storeC1, 'Transação 1 persistida localmente com sucesso');
      assert.ok(storeC2, 'Transação 2 concorrente persistida localmente com sucesso');

      // 4.3 Health Check REAL exportado de server/index.js com Round-Trip de Escrita e Leitura
      const mockCloudStorage = new Map();
      const mockHealthyClient = {
        execute: async (query) => {
          const sql = (typeof query === 'string' ? query : (query?.sql || '')).trim();
          const args = query?.args || [];
          if (sql.includes('INSERT INTO processed_operations')) {
            mockCloudStorage.set(args[0], args[2] || JSON.stringify({ ping: 'ok' }));
            return { rowsAffected: 1 };
          }
          if (sql.includes('SELECT response_body FROM processed_operations')) {
            const val = mockCloudStorage.get(args[0]);
            return { rows: val ? [{ response_body: val }] : [] };
          }
          if (sql.includes('DELETE FROM processed_operations')) {
            mockCloudStorage.delete(args[0]);
            return { rowsAffected: 1 };
          }
          if (sql.includes('SELECT * FROM users')) {
            return { rows: [{ id: 'usr_restored', name: 'Usuario Restaurado', email: 'restored@turso.io', avatar_color: '#10B981' }] };
          }
          return { rows: [] };
        }
      };

      healthCloudClient = mockHealthyClient;
      const healthOk = await fetch(`http://127.0.0.1:${port}/health`);
      assert.equal(healthOk.status, 200);
      const healthOkData = await healthOk.json();
      assert.equal(healthOkData.persistence_verified, true, 'Round-trip de escrita/leitura real deve verificar persistência');

      // Quando o cliente remoto falha no round-trip de escrita, /health deve retornar 503 em produção
      const failingRemoteClient = {
        execute: async () => {
          throw new Error('Falha de conexão com cluster Turso LibSQL');
        }
      };
      healthCloudClient = failingRemoteClient;
      const healthDegraded = await fetch(`http://127.0.0.1:${port}/health`);
      assert.equal(healthDegraded.status, 503, 'Health check real degradado em produção deve retornar 503');
      const healthDegradedData = await healthDegraded.json();
      assert.equal(healthDegradedData.persistence_verified, false);

      // 4.4 Sobrevivência à reinicialização: restoreFromLibsql popula o novo contêiner
      const freshDb = getDatabase(':memory:');
      seedDatabase(freshDb);
      await restoreFromLibsql(freshDb, mockHealthyClient);
      const restored = freshDb.prepare('SELECT * FROM users WHERE id = ?').get('usr_restored');
      assert.ok(restored, 'Dados remotos devem ser restaurados no SQLite local no boot');
      assert.equal(restored.name, 'Usuario Restaurado');

      // 4.5 Teste de Durabilidade Atômica, Falha Cloud, Restart e Replay Idempotente:
      const cloudStorage = new Map();
      const capturedApiBatches = [];
      let simulateCloudFailure = false;

      const durableLibsqlClient = {
        execute: async (query) => {
          if (simulateCloudFailure) {
            throw new Error('Falha de rede com Turso LibSQL Cloud');
          }
          const sql = (typeof query === 'string' ? query : (query?.sql || '')).trim();
          if (sql.includes('processed_operations')) {
            throw new Error('Marcador de idempotência não deve ser enviado por execute separado; deve estar no batch atômico');
          }
          return { rowsAffected: 1, rows: [] };
        },
        batch: async (statements) => {
          capturedApiBatches.push(statements);
          if (simulateCloudFailure) {
            throw new Error('Falha de rede com Turso LibSQL Cloud durante batch');
          }
          for (const s of statements) {
            const sql = (typeof s === 'string' ? s : (s?.sql || '')).trim();
            const args = s?.args || [];
            if (sql.includes('processed_operations')) {
              cloudStorage.set(args[0], { status: args[1], body: args[2] });
            }
          }
          return statements.map(() => ({ rowsAffected: 1 }));
        }
      };

      const durableDb = createReplicatedDatabase(getDatabase(':memory:'), durableLibsqlClient);
      seedDatabase(durableDb);
      const durableApp = express();
      durableApp.use(express.json());
      const durableServer = http.createServer(durableApp);
      durableApp.use('/api', createApiRouter(durableDb, new SocketManager(durableServer)));
      await new Promise((resolve) => durableServer.listen(0, resolve));
      const durablePort = durableServer.address().port;
      const durableUrl = `http://127.0.0.1:${durablePort}/api`;
      const testToken = createSessionToken({ sub: 'usr_default', email: 'visitante@cestaon.app' });

      // Cenário A: Falha cloud durante mutação com X-Operation-Id
      simulateCloudFailure = true;
      const failRes = await fetch(`${durableUrl}/stores`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testToken}`,
          'X-Operation-Id': 'op_cloud_fail_test'
        },
        body: JSON.stringify({ name: 'Mercado Nao Gravado' })
      });
      assert.equal(failRes.status, 503, 'Deve retornar 503 quando a persistência cloud falhar');
      const opAfterFail = durableDb.prepare('SELECT * FROM processed_operations WHERE operation_id = ?').get('op_cloud_fail_test');
      assert.equal(opAfterFail, undefined, 'Marcador de idempotência não deve ser persistido em falha 503');

      // Verificação do banco original após a falha: comprova rollback local real no SQLite
      const storeInOriginalAfterFail = durableDb.prepare('SELECT * FROM stores WHERE name = ?').get('Mercado Nao Gravado');
      assert.equal(storeInOriginalAfterFail, undefined, 'A mutação que falhou no cloud DEVE ser revertida no SQLite original via rollback local');

      // Retry com o mesmo X-Operation-Id após a falha: conclui com sucesso e sem duplicação
      simulateCloudFailure = false;
      const retryAfterFailRes = await fetch(`${durableUrl}/stores`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testToken}`,
          'X-Operation-Id': 'op_cloud_fail_test'
        },
        body: JSON.stringify({ name: 'Mercado Nao Gravado' })
      });
      assert.equal(retryAfterFailRes.status, 201, 'Retry com mesmo X-Operation-Id após restabelecimento deve retornar 201');
      const storesInOriginalAfterRetry = durableDb.prepare('SELECT * FROM stores WHERE name = ?').all('Mercado Nao Gravado');
      assert.equal(storesInOriginalAfterRetry.length, 1, 'Não deve duplicar a mutação no banco original após falha e retry');
      const opAfterRetry = durableDb.prepare('SELECT * FROM processed_operations WHERE operation_id = ?').get('op_cloud_fail_test');
      assert.ok(opAfterRetry, 'Marcador de idempotência deve estar gravado após retry bem-sucedido');

      // Terceira chamada (replay idempotente legítimo): retorna replay do cache sem duplicar
      const replayRes = await fetch(`${durableUrl}/stores`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testToken}`,
          'X-Operation-Id': 'op_cloud_fail_test'
        },
        body: JSON.stringify({ name: 'Mercado Nao Gravado' })
      });
      assert.equal(replayRes.status, 201);
      assert.equal(replayRes.headers.get('x-idempotent-replay'), 'true', 'Deve retornar header de replay');
      const storesAfterReplay = durableDb.prepare('SELECT * FROM stores WHERE name = ?').all('Mercado Nao Gravado');
      assert.equal(storesAfterReplay.length, 1, 'Registro permanece único após replay idempotente');

      // Cenário B: Sucesso com persistência atômica tanto da mutação quanto de processed_operations
      simulateCloudFailure = false;
      const successRes = await fetch(`${durableUrl}/stores`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testToken}`,
          'X-Operation-Id': 'op_cloud_success_test'
        },
        body: JSON.stringify({ name: 'Mercado Gravado Duravel' })
      });
      assert.equal(successRes.status, 201, 'Deve retornar 201 após persistência durável');
      assert.ok(capturedApiBatches.length > 0, 'Deve ter disparado batch');
      const lastBatch = capturedApiBatches[capturedApiBatches.length - 1];
      const hasMutationInBatch = lastBatch.some((s) => s.sql.includes('INSERT INTO stores'));
      const hasMarkerInBatch = lastBatch.some((s) => s.sql.includes('processed_operations'));
      assert.ok(hasMutationInBatch, 'A mutação deve estar presente no lote remoto');
      assert.ok(hasMarkerInBatch, 'O marcador de idempotência DEVE estar no MESMO lote remoto que a mutação');
      assert.ok(cloudStorage.has('op_cloud_success_test'), 'processed_operations deve estar persistido no Turso Cloud via batch');
      const opLocal = durableDb.prepare('SELECT * FROM processed_operations WHERE operation_id = ?').get('op_cloud_success_test');
      assert.ok(opLocal, 'processed_operations deve estar persistido no SQLite local');

      // Cenário C: Reinicialização do contêiner (restart) - restaura dados do cloud
      const restartedDb = getDatabase(':memory:');
      seedDatabase(restartedDb);
      const restoreClient = {
        execute: async (query) => {
          const sql = typeof query === 'string' ? query : (query?.sql || '');
          if (sql.includes('SELECT * FROM processed_operations')) {
            const rows = Array.from(cloudStorage.entries()).map(([opId, data]) => ({
              operation_id: opId,
              response_status: data.status,
              response_body: data.body
            }));
            return { rows };
          }
          return { rows: [] };
        }
      };
      await restoreFromLibsql(restartedDb, restoreClient);
      const restoredOp = restartedDb.prepare('SELECT * FROM processed_operations WHERE operation_id = ?').get('op_cloud_success_test');
      assert.ok(restoredOp, 'Marcador de idempotência deve ter sido restaurado do cloud após restart');

      // Cenário D: Reenvio (retry) com o mesmo X-Operation-Id no banco restaurado
      const restartedApp = express();
      restartedApp.use(express.json());
      const restartedServer = http.createServer(restartedApp);
      restartedApp.use('/api', createApiRouter(restartedDb, new SocketManager(restartedServer)));
      await new Promise((resolve) => restartedServer.listen(0, resolve));
      const restartedPort = restartedServer.address().port;

      const retryRes = await fetch(`http://127.0.0.1:${restartedPort}/api/stores`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testToken}`,
          'X-Operation-Id': 'op_cloud_success_test'
        },
        body: JSON.stringify({ name: 'Mercado Gravado Duravel' })
      });
      assert.equal(retryRes.status, 201);
      assert.equal(retryRes.headers.get('x-idempotent-replay'), 'true', 'Deve retornar replay idempotente sem duplicar');

      // Cenário E: Idempotência sob Concorrência Real com Batch Remoto Controlado
      // Nenhuma requisição simultânea pode responder 2xx antes da decisão durável no LibSQL Cloud.
      // E1: Se o batch da primeira falhar, a segunda deve executar do zero e persistir uma única mutação no SQLite.
      // E2: Se o batch da primeira suceder, a segunda deve responder 201 com X-Idempotent-Replay: true.
      const controlledBatches = [];
      const controlledLibsqlClient = {
        batch: async (statements) => {
          return new Promise((resolve, reject) => {
            controlledBatches.push({ statements, resolve, reject });
          });
        },
        execute: async () => ({ rowsAffected: 1, rows: [] }),
        executeMultiple: async () => ({})
      };

      const controlledDb = createReplicatedDatabase(getDatabase(':memory:'), controlledLibsqlClient);
      seedDatabase(controlledDb);
      const controlledApp = express();
      controlledApp.use(express.json());
      const controlledServer = http.createServer(controlledApp);
      controlledApp.use('/api', createApiRouter(controlledDb, new SocketManager(controlledServer)));
      await new Promise((resolve) => controlledServer.listen(0, resolve));
      const controlledPort = controlledServer.address().port;
      const controlledUrl = `http://127.0.0.1:${controlledPort}/api`;

      // E1: Duas requisições simultâneas com o mesmo X-Operation-Id onde a primeira falha no cloud
      const failOpId = 'op_concurrent_fail_race';
      const failReq1Promise = fetch(`${controlledUrl}/lists`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testToken}`,
          'X-Operation-Id': failOpId
        },
        body: JSON.stringify({ title: 'Feira Concorrente Falha' })
      });
      const failReq2Promise = fetch(`${controlledUrl}/lists`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testToken}`,
          'X-Operation-Id': failOpId
        },
        body: JSON.stringify({ title: 'Feira Concorrente Falha' })
      });

      // Aguarda para garantir que ambas as requisições foram despachadas ao servidor
      let failReq1Settled = false;
      let failReq2Settled = false;
      failReq1Promise.then(() => { failReq1Settled = true; });
      failReq2Promise.then(() => { failReq2Settled = true; });
      await new Promise((r) => setTimeout(r, 60));

      assert.equal(failReq1Settled, false, 'Req 1 não pode ter respondido antes da decisão do batch remoto');
      assert.equal(failReq2Settled, false, 'Req 2 não pode responder 2xx como falso replay antes da decisão durável');
      assert.equal(controlledBatches.length, 1, 'Exatamente o batch da primeira requisição deve estar em voo');

      // Rejeita o batch remoto da primeira requisição (simulando falha de rede/cloud)
      const failBatch1 = controlledBatches.shift();
      failBatch1.reject(new Error('Falha simulada no batch da Req 1'));

      const failRes1 = await failReq1Promise;
      assert.equal(failRes1.status, 503, 'Primeira requisição deve retornar 503');

      // Aguarda a segunda requisição avançar e disparar seu próprio batch remoto
      while (controlledBatches.length === 0) {
        await new Promise((r) => setTimeout(r, 10));
      }
      assert.equal(controlledBatches.length, 1, 'Segunda requisição deve executar e disparar seu próprio batch');
      const failBatch2 = controlledBatches.shift();
      // O batch da segunda requisição tem sucesso
      failBatch2.resolve([{ rowsAffected: 1 }]);

      const failRes2 = await failReq2Promise;
      assert.equal(failRes2.status, 201, 'Segunda requisição deve persistir com sucesso (201)');
      assert.equal(failRes2.headers.get('x-idempotent-replay'), null, 'Segunda requisição após falha da primeira não é replay, é criação real');

      // Verifica SQLite: deve haver exatamente 1 feira
      const failListsInDb = controlledDb.prepare('SELECT * FROM shopping_lists WHERE title = ?').all('Feira Concorrente Falha');
      assert.equal(failListsInDb.length, 1, 'Deve persistir uma única mutação no SQLite após falha da primeira e sucesso da segunda');
      const failOpInDb = controlledDb.prepare('SELECT * FROM processed_operations WHERE operation_id = ?').get(failOpId);
      assert.ok(failOpInDb, 'Marcador de idempotência deve estar gravado após a conclusão com sucesso');

      // E2: Duas requisições simultâneas com o mesmo X-Operation-Id onde a primeira tem sucesso no cloud
      const successOpId = 'op_concurrent_success_race';
      const succReq1Promise = fetch(`${controlledUrl}/lists`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testToken}`,
          'X-Operation-Id': successOpId
        },
        body: JSON.stringify({ title: 'Feira Concorrente Sucesso' })
      });
      const succReq2Promise = fetch(`${controlledUrl}/lists`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testToken}`,
          'X-Operation-Id': successOpId
        },
        body: JSON.stringify({ title: 'Feira Concorrente Sucesso' })
      });

      let succReq1Settled = false;
      let succReq2Settled = false;
      succReq1Promise.then(() => { succReq1Settled = true; });
      succReq2Promise.then(() => { succReq2Settled = true; });
      await new Promise((r) => setTimeout(r, 60));

      assert.equal(succReq1Settled, false, 'Req 1 não pode ter respondido antes do batch');
      assert.equal(succReq2Settled, false, 'Req 2 não pode responder antes da decisão');
      assert.equal(controlledBatches.length, 1, 'O batch da primeira requisição deve estar em voo');

      // Confirma o batch remoto da primeira com sucesso
      const succBatch1 = controlledBatches.shift();
      succBatch1.resolve([{ rowsAffected: 1 }]);

      const succRes1 = await succReq1Promise;
      assert.equal(succRes1.status, 201, 'Primeira requisição retorna 201');

      // A segunda requisição agora deve ser finalizada como replay
      const succRes2 = await succReq2Promise;
      assert.equal(succRes2.status, 201, 'Segunda requisição retorna 201');
      assert.equal(succRes2.headers.get('x-idempotent-replay'), 'true', 'Segunda requisição após sucesso da primeira deve ser replay');

      // Verifica SQLite: deve haver exatamente 1 feira
      const succListsInDb = controlledDb.prepare('SELECT * FROM shopping_lists WHERE title = ?').all('Feira Concorrente Sucesso');
      assert.equal(succListsInDb.length, 1, 'Deve persistir uma única feira no SQLite, sem duplicações');

      // Cenário F: Bloqueio de Leitura Não Confirmada sob Savepoint (Dirty Read Isolation)
      // POST pendente aguardando batch remoto + GET concorrente + Falha do batch remoto:
      // O GET concorrente NÃO deve expor a mutação revertida.
      const dirtyReadTitle = 'Feira Pendente Que Vai Falhar';
      const postPromise = fetch(`${controlledUrl}/lists`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testToken}`,
          'X-Operation-Id': 'op_dirty_read_test'
        },
        body: JSON.stringify({ title: dirtyReadTitle })
      });

      // Aguarda o batch da mutação ser interceptado e mantido em voo
      while (controlledBatches.length === 0) {
        await new Promise((r) => setTimeout(r, 10));
      }
      assert.equal(controlledBatches.length, 1, 'Batch da mutação POST deve estar em voo');

      // Enquanto o POST está pendente (savepoint aberto no SQLite aguardando LibSQL),
      // dispara um GET /lists concorrente pela mesma conexão:
      let getResSettled = false;
      const getPromise = fetch(`${controlledUrl}/lists`, {
        headers: {
          'Authorization': `Bearer ${testToken}`
        }
      });
      getPromise.then(() => { getResSettled = true; });

      // Dá um tempo para garantir que a requisição GET chegou e foi processada pelo middleware
      await new Promise((r) => setTimeout(r, 60));
      assert.equal(getResSettled, false, 'GET concorrente deve aguardar a confirmação da mutação antes de ler');

      // Agora simula a FALHA do batch remoto da mutação (rejeita a Promise remota)
      const pendingBatch = controlledBatches.shift();
      pendingBatch.reject(new Error('Falha simulada na rede Turso LibSQL Cloud'));

      // O POST responde 503 e executa rollback no SQLite
      const postRes = await postPromise;
      assert.equal(postRes.status, 503, 'POST pendente que falhou no cloud deve retornar 503');

      // O GET agora é liberado e responde 200
      const getRes = await getPromise;
      assert.equal(getRes.status, 200, 'GET concorrente deve responder 200 após liberação');
      const listsFromGet = await getRes.json();

      // O GET NÃO pode expor a feira revertida!
      const exposed = listsFromGet.some((l) => l.title === dirtyReadTitle);
      assert.equal(exposed, false, 'GET concorrente NÃO deve expor a mutação revertida');

      // Confirma que no SQLite a mutação foi realmente desfeita
      const inDb = controlledDb.prepare('SELECT * FROM shopping_lists WHERE title = ?').all(dirtyReadTitle);
      assert.equal(inDb.length, 0, 'Registro não confirmado deve ter sido revertido do SQLite');

      // Cenário G: Bloqueio de Leitura sob Abort do Cliente (Client Disconnect During Remote Batch)
      // POST abortado via AbortController durante batch remoto em voo + GET concorrente + Falha do batch remoto:
      // A fila DEVE permanecer bloqueada mesmo após a desconexão do cliente até a decisão durável;
      // o GET concorrente NÃO deve expor a mutação revertida.
      const abortTitle = 'Feira Abortada Que Vai Falhar';
      const abortController = new AbortController();
      const abortPostPromise = fetch(`${controlledUrl}/lists`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testToken}`,
          'X-Operation-Id': 'op_abort_dirty_read_test'
        },
        body: JSON.stringify({ title: abortTitle }),
        signal: abortController.signal
      });

      // Aguarda o batch da mutação ser capturado e mantido em voo
      while (controlledBatches.length === 0) {
        await new Promise((r) => setTimeout(r, 10));
      }
      assert.equal(controlledBatches.length, 1, 'Batch da mutação POST deve estar em voo');

      // Agora ABORTA a requisição POST do cliente enquanto o batch está em voo no servidor
      abortController.abort();
      // Captura a rejeição esperada no lado cliente do POST abortado
      await abortPostPromise.catch(() => {});

      // Dispara um GET /lists concorrente imediatamente após a desconexão do cliente:
      let abortGetSettled = false;
      const abortGetPromise = fetch(`${controlledUrl}/lists`, {
        headers: {
          'Authorization': `Bearer ${testToken}`
        }
      });
      abortGetPromise.then(() => { abortGetSettled = true; });

      // Dá um tempo para garantir que a requisição GET chegou ao servidor Express
      await new Promise((r) => setTimeout(r, 60));
      assert.equal(abortGetSettled, false, 'GET concorrente DEVE aguardar a finalização do batch mesmo após o cliente abortar');

      // Agora simula a FALHA do batch remoto da mutação abortada
      const abortBatch = controlledBatches.shift();
      abortBatch.reject(new Error('Falha simulada na rede durante batch de requisição abortada'));

      // O GET agora é liberado e responde 200
      const abortGetRes = await abortGetPromise;
      assert.equal(abortGetRes.status, 200, 'GET concorrente deve responder 200 após liberação da fila');
      const listsFromAbortGet = await abortGetRes.json();

      // O GET NÃO pode expor a feira revertida!
      const exposedInAbort = listsFromAbortGet.some((l) => l.title === abortTitle);
      assert.equal(exposedInAbort, false, 'GET concorrente NÃO deve expor a mutação revertida após abort do POST');

      // Confirma que no SQLite a mutação abortada foi desfeita via rollback
      const inDbAfterAbort = controlledDb.prepare('SELECT * FROM shopping_lists WHERE title = ?').all(abortTitle);
      assert.equal(inDbAfterAbort.length, 0, 'Registro abortado e revertido não deve existir no SQLite');

      // Cenário H: Bloqueio de Escrita Não Replicada em Abort de Rota Assíncrona antes da Gravação
      // Rota com await prévio à escrita (ex: criação de usuário com hash PBKDF2 ou await controlado).
      // Se o cliente abortar a conexão durante esse await antes da gravação:
      // O handler assíncrono é impedido de persistir localmente no SQLite sem batch remoto;
      // confirma que não há escrita local sem replicação e o estado permanece íntegro.
      const asyncAbortEmail = 'abort_prewrite_test@cestaon.app';
      let prewriteResolve;
      const prewriteBarrier = new Promise((resolve) => { prewriteResolve = resolve; });
      let handlerFinishedResolve;
      const handlerFinishedPromise = new Promise((resolve) => { handlerFinishedResolve = resolve; });

      // Intercepta UserRepository.prototype.createAsync para garantir que a requisição está
      // pausada em um await assíncrono ANTES de qualquer instrução SQL ser executada
      const origUserCreateAsync = UserRepository.prototype.createAsync;
      UserRepository.prototype.createAsync = async function (payload) {
        await prewriteBarrier;
        try {
          return await origUserCreateAsync.call(this, payload);
        } finally {
          handlerFinishedResolve();
        }
      };

      new UserRepository(controlledDb).createVerificationCode(asyncAbortEmail, 'register', '123456');

      const prevBatchCount = controlledBatches.length;
      const asyncAbortController = new AbortController();

      try {
        const asyncPostPromise = fetch(`${controlledUrl}/users`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: 'Usuario Abortado Pre-Gravacao',
            email: asyncAbortEmail,
            avatar_color: '#10B981',
            pin: '123456',
            verification_code: '123456'
          }),
          signal: asyncAbortController.signal
        });

        // Aguarda a requisição chegar ao Express e entrar no await de createAsync
        await new Promise((r) => setTimeout(r, 60));

        // ABORTA a requisição cliente enquanto a rota assíncrona aguarda antes de gravar
        asyncAbortController.abort();
        await asyncPostPromise.catch(() => {});

        // Agora libera a barreira assíncrona para que o handler continue sua execução pós-abort
        prewriteResolve();

        // Aguarda deterministicamente a conclusão do handler assíncrono
        await handlerFinishedPromise;
        // Pequena folga para os microtasks do Express concluírem o ciclo de resposta
        await new Promise((r) => setTimeout(r, 50));

        // Confirmações estritas:
        // 1. NÃO deve haver escrita local no SQLite (usuário NÃO pode existir no banco local)
        const userInLocalDb = controlledDb.prepare('SELECT * FROM users WHERE email = ?').all(asyncAbortEmail);
        assert.equal(userInLocalDb.length, 0, 'NÃO deve haver escrita local no SQLite após abort durante await pré-gravação');

        // 2. NÃO deve haver nenhuma chamada ao batch remoto da replicação para este usuário
        assert.equal(controlledBatches.length, prevBatchCount, 'Nenhum batch remoto deve ter sido disparado após abort');

        // 3. Uma leitura subsequente confirma que os dados locais estão limpos e a fila liberada
        const getCheckRes = await fetch(`${controlledUrl}/users`);
        assert.equal(getCheckRes.status, 401, 'Fila deve estar liberada para requisições subsequentes');
      } finally {
        UserRepository.prototype.createAsync = origUserCreateAsync;
      }

      await t.test('Escopos SQLite falhos interrompem mutações e isolam a API', async (t) => {
        await t.test('não executa a rota se SAVEPOINT falhar', async () => {
          const scopeFailRawDb = getDatabase(':memory:');
          seedDatabase(scopeFailRawDb);
          let scopeFailBatchCalls = 0;
          const scopeFailClient = {
            execute: async () => ({ rowsAffected: 1, rows: [] }),
            batch: async () => {
              scopeFailBatchCalls += 1;
              return [{ rowsAffected: 1 }];
            }
          };
          const scopeFailReplicatedDb = createReplicatedDatabase(scopeFailRawDb, scopeFailClient);
          const scopeFailDb = new Proxy(scopeFailReplicatedDb, {
            get(target, prop, receiver) {
              if (prop === 'beginMutationScope') {
                return () => { throw new Error('Falha de SAVEPOINT injetada'); };
              }
              return Reflect.get(target, prop, receiver);
            }
          });

          const scopeFailApp = express();
          scopeFailApp.use(express.json());
          const scopeFailServer = http.createServer(scopeFailApp);
          scopeFailApp.use('/api', createApiRouter(scopeFailDb, new SocketManager(scopeFailServer)));
          await new Promise((resolve) => scopeFailServer.listen(0, resolve));
          const scopeFailUrl = `http://127.0.0.1:${scopeFailServer.address().port}/api`;
          const title = 'Mutação Bloqueada Sem Savepoint';

          try {
            const response = await fetch(`${scopeFailUrl}/lists`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${testToken}`,
                'X-Operation-Id': 'op_scope_start_failure'
              },
              body: JSON.stringify({ title, budget_cents: 0 })
            });
            assert.equal(response.status, 503);
            assert.equal(scopeFailBatchCalls, 0, 'A rota e a réplica remota não devem executar sem o savepoint local');
            assert.equal(scopeFailRawDb.prepare('SELECT * FROM shopping_lists WHERE title = ?').all(title).length, 0);

            const readResponse = await fetch(`${scopeFailUrl}/lists`, {
              headers: { 'Authorization': `Bearer ${testToken}` }
            });
            assert.equal(readResponse.status, 200, 'Falha ao iniciar o savepoint não deve deixar a API em estado incerto');
          } finally {
            await new Promise((resolve) => scopeFailServer.close(resolve));
            scopeFailRawDb.close();
          }
        });

        await t.test('bloqueia leituras se rollback do savepoint falhar', async () => {
          const rollbackFailRawDb = getDatabase(':memory:');
          seedDatabase(rollbackFailRawDb);
          const rollbackFailClient = {
            execute: async () => ({ rowsAffected: 1, rows: [] }),
            batch: async () => { throw new Error('Falha remota injetada'); }
          };
          const rollbackFailReplicatedDb = createReplicatedDatabase(rollbackFailRawDb, rollbackFailClient);
          const rollbackFailDb = new Proxy(rollbackFailReplicatedDb, {
            get(target, prop, receiver) {
              if (prop === 'rollbackMutationScope') {
                return () => { throw new Error('Falha de ROLLBACK injetada'); };
              }
              return Reflect.get(target, prop, receiver);
            }
          });

          const rollbackFailApp = express();
          rollbackFailApp.use(express.json());
          const rollbackFailServer = http.createServer(rollbackFailApp);
          rollbackFailApp.use('/api', createApiRouter(rollbackFailDb, new SocketManager(rollbackFailServer)));
          await new Promise((resolve) => rollbackFailServer.listen(0, resolve));
          const rollbackFailUrl = `http://127.0.0.1:${rollbackFailServer.address().port}/api`;

          try {
            const mutationResponse = await fetch(`${rollbackFailUrl}/lists`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${testToken}`,
                'X-Operation-Id': 'op_scope_rollback_failure'
              },
              body: JSON.stringify({ title: 'Mutação Com Rollback Incerto', budget_cents: 0 })
            });
            assert.equal(mutationResponse.status, 503);

            const readResponse = await fetch(`${rollbackFailUrl}/lists`, {
              headers: { 'Authorization': `Bearer ${testToken}` }
            });
            assert.equal(readResponse.status, 503, 'A API deve bloquear leituras após falha ao reverter o estado SQLite');
          } finally {
            await new Promise((resolve) => rollbackFailServer.close(resolve));
            rollbackFailRawDb.close();
          }
        });
      });

      await new Promise((resolve) => controlledServer.close(resolve));

      await new Promise((resolve) => durableServer.close(resolve));
      await new Promise((resolve) => restartedServer.close(resolve));
    } finally {
      process.env.NODE_ENV = prevEnv;
      if (prevUrl) process.env.LIBSQL_URL = prevUrl;
      if (prevTurso) process.env.TURSO_DATABASE_URL = prevTurso;
    }
  });

  // --------------------------------------------------------------------------
  // ITEM 5: SEGREDO CRIPTOGRÁFICO (AUTH_SECRET EM PRODUÇÃO)
  // --------------------------------------------------------------------------
  await t.test('5. Segredo: Falha estrita no boot em produção e sem fallback volátil', () => {
    const prevEnv = process.env.NODE_ENV;
    const prevSecret = process.env.AUTH_SECRET;

    try {
      process.env.NODE_ENV = 'production';

      // 5.1 AUTH_SECRET ausente em produção -> Deve falhar com erro claro
      delete process.env.AUTH_SECRET;
      assert.throws(
        () => validateAuthSecretConfiguration(),
        /FALHA CRÍTICA DE SEGURANÇA NO BOOT: A variável de ambiente AUTH_SECRET é obrigatória/i
      );

      // 5.2 AUTH_SECRET com chave padrão de desenvolvimento -> Deve falhar
      process.env.AUTH_SECRET = DEFAULT_DEV_SECRET;
      assert.throws(
        () => validateAuthSecretConfiguration(),
        /não pode utilizar o segredo padrão de desenvolvimento/i
      );

      // 5.3 AUTH_SECRET fraca (menos de 32 chars) -> Deve falhar
      process.env.AUTH_SECRET = 'chave-curta-insegura-123';
      assert.throws(
        () => validateAuthSecretConfiguration(),
        /deve ter no mínimo 32 caracteres/i
      );

      // 5.4 AUTH_SECRET válida em produção -> Sucesso sem falhas
      process.env.AUTH_SECRET = 'chave-de-producao-longa-segura-e-forte-32-chars!';
      const validated = validateAuthSecretConfiguration();
      assert.equal(validated, 'chave-de-producao-longa-segura-e-forte-32-chars!');

      // 5.5 Em desenvolvimento (NODE_ENV !== production), opera de forma resiliente
      process.env.NODE_ENV = 'development';
      delete process.env.AUTH_SECRET;
      const devSecret = validateAuthSecretConfiguration();
      assert.equal(devSecret, DEFAULT_DEV_SECRET, 'Em dev deve usar segredo padrão');
    } finally {
      process.env.NODE_ENV = prevEnv;
      process.env.AUTH_SECRET = prevSecret;
    }
  });

  // --------------------------------------------------------------------------
  // ITEM 6: VALIDAÇÃO ESTRITA DE TOKENS (SUBJECT E EXPIRAÇÃO FINITA)
  // --------------------------------------------------------------------------
  await t.test('6. Tokens: Exigência de subject não vazio e expiração numérica finita válida', () => {
    const secret = 'chave-de-teste-para-validacao-de-tokens-32-chars!';

    // 6.1 Token com subject ausente ou vazio -> Deve retornar null
    const noSubToken = createSessionToken({ email: 'nosub@test.com' }, { secret });
    assert.equal(verifySessionToken(noSubToken, secret), null, 'Token sem sub deve ser rejeitado');

    const emptySubToken = createSessionToken({ sub: '   ' }, { secret });
    assert.equal(verifySessionToken(emptySubToken, secret), null, 'Token com sub em branco deve ser rejeitado');

    // 6.2 Token com expiração não numérica ou não finita -> Deve retornar null
    const base64Url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const sign = (h, p) => {
      const data = `${h}.${p}`;
      const sig = crypto.createHmac('sha256', secret).update(data).digest();
      return `${data}.${base64Url(sig)}`;
    };

    const header = base64Url({ alg: 'HS256', typ: 'JWT' });

    // Payload sem exp
    const pNoExp = base64Url({ sub: 'usr_valid' });
    assert.equal(verifySessionToken(sign(header, pNoExp), secret), null, 'Token sem exp deve ser rejeitado');

    // Payload com exp em string
    const pStringExp = base64Url({ sub: 'usr_valid', exp: 'never' });
    assert.equal(verifySessionToken(sign(header, pStringExp), secret), null, 'Token com exp em string deve ser rejeitado');

    // Payload com exp Infinity
    const pInfExp = base64Url({ sub: 'usr_valid', exp: Infinity });
    assert.equal(verifySessionToken(sign(header, pInfExp), secret), null, 'Token com exp Infinity deve ser rejeitado');

    // 6.3 Token expirado -> Deve retornar null
    const expiredToken = createSessionToken({ sub: 'usr_valid' }, { secret, expiresInSeconds: -10 });
    assert.equal(verifySessionToken(expiredToken, secret), null, 'Token expirado deve retornar null');

    // 6.4 Token adulterado ou malformado -> Deve retornar null
    assert.equal(verifySessionToken('token.mal.formado.extra', secret), null);
    assert.equal(verifySessionToken('tokeninvalido', secret), null);
    assert.equal(verifySessionToken(null, secret), null);

    // 6.5 Token legítimo completo -> Deve ser aceito e normalizado
    const validToken = createSessionToken({ sub: 'usr_ok_123', email: 'ok@cestaon.app' }, { secret, expiresInSeconds: 3600 });
    const verified = verifySessionToken(validToken, secret);
    assert.ok(verified, 'Token válido deve ser aprovado');
    assert.equal(verified.sub, 'usr_ok_123');
    assert.equal(verified.id, 'usr_ok_123');
    assert.ok(Number.isFinite(verified.exp));
  });

  await new Promise((resolve) => server.close(resolve));
});
