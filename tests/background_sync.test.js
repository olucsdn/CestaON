import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { getDatabase } from '../server/db/database.js';
import { seedDatabase } from '../server/db/seed.js';
import { SocketManager } from '../server/ws/socketManager.js';
import { createApiRouter } from '../server/routes/api.js';

test('BACKGROUND SYNC NATIVO (SYNCMANAGER) — Testes da Fila Persistente e Sincronização Resiliente', async (t) => {
  const db = getDatabase(':memory:');
  seedDatabase(db);

  const app = express();
  app.use(express.json());
  const server = http.createServer(app);
  const socketManager = new SocketManager(server);
  app.use('/api', createApiRouter(db, socketManager));

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api`;

  // Mock em memória da fila IndexedDB do SyncManager para testes de nó
  class MockSyncQueue {
    constructor() {
      this.store = [];
      this.nextId = 1;
    }

    async enqueue({ url, method, headers, body }) {
      const record = {
        id: this.nextId++,
        url,
        method: method.toUpperCase(),
        headers: headers || { 'Content-Type': 'application/json' },
        body: typeof body === 'string' ? body : (body ? JSON.stringify(body) : null),
        timestamp: Date.now(),
        attempts: 0
      };
      this.store.push(record);
      return record.id;
    }

    async getAll() {
      return [...this.store].sort((a, b) => a.timestamp - b.timestamp);
    }

    async remove(id) {
      this.store = this.store.filter((item) => item.id !== id);
    }

    async incrementAttempts(id) {
      const item = this.store.find((i) => i.id === id);
      if (item) item.attempts++;
    }

    async flush(fetchFn = fetch) {
      const mutations = await this.getAll();
      let processed = 0;

      for (const item of mutations) {
        try {
          const options = {
            method: item.method,
            headers: item.headers || { 'Content-Type': 'application/json' }
          };
          if (item.body && item.method !== 'GET') {
            options.body = item.body;
          }

          const res = await fetchFn(item.url, options);

          if (res.ok || (res.status >= 400 && res.status < 500)) {
            await this.remove(item.id);
            processed++;
          } else {
            await this.incrementAttempts(item.id);
            break; // Preserva ordenação FIFO em falha transitória
          }
        } catch (_) {
          await this.incrementAttempts(item.id);
          break;
        }
      }

      return { processed, remaining: this.store.length };
    }
  }

  // 1. Cria usuário e lista base
  const resUser = await fetch(`${baseUrl}/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Usuario Sync' })
  });
  const user = await resUser.json();

  const resList = await fetch(`${baseUrl}/lists`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Id': user.id },
    body: JSON.stringify({ title: 'Feira SyncManager', budget_cents: 20000 })
  });
  const list = await resList.json();
  assert.ok(list?.id);

  await t.test('1. Enfileiramento FIFO de Mutações no Subsolo', async () => {
    const queue = new MockSyncQueue();

    // Simula 3 mutações feitas offline: adição de item, toggle de compra e ajuste de orçamento
    const id1 = await queue.enqueue({
      url: `${baseUrl}/lists/${list.id}/items`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': user.id },
      body: { name: 'Café Especial', quantity: 2, unit: 'un', estimated_price_cents: 1800 }
    });

    const id2 = await queue.enqueue({
      url: `${baseUrl}/lists/${list.id}`,
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': user.id },
      body: { budget_cents: 25000 }
    });

    assert.equal(id1, 1);
    assert.equal(id2, 2);

    const pending = await queue.getAll();
    assert.equal(pending.length, 2);
    assert.equal(pending[0].id, 1);
    assert.equal(pending[1].id, 2);
  });

  await t.test('2. Sincronização Resiliente em Segundo Plano (Flush das Mutações)', async () => {
    const queue = new MockSyncQueue();

    // 1. Enfileira mutação de adição de produto
    await queue.enqueue({
      url: `${baseUrl}/lists/${list.id}/items`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': user.id },
      body: { name: 'Azeite Extra Virgem', quantity: 1, unit: 'un', estimated_price_cents: 3500 }
    });

    // 2. Enfileira alteração de orçamento
    await queue.enqueue({
      url: `${baseUrl}/lists/${list.id}`,
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': user.id },
      body: { budget_cents: 40000 }
    });

    // Executa a drenagem / flush da fila (como o SyncManager faria ao religar a rede)
    const result = await queue.flush();
    assert.equal(result.processed, 2);
    assert.equal(result.remaining, 0, 'Todas as mutações devem ter sido sincronizadas');

    // Valida no backend se as operações foram persistidas
    const checkListRes = await fetch(`${baseUrl}/lists/${list.id}`, {
      headers: { 'X-User-Id': user.id }
    });
    const updatedList = await checkListRes.json();
    assert.equal(updatedList.budget_cents, 40000, 'Orçamento deve ter sido sincronizado para 40000');
    assert.ok(updatedList.items.some((i) => i.custom_name === 'Azeite Extra Virgem'), 'Item deve ter sido criado via sync');
  });

  await t.test('3. Descarte de Erros Irreversíveis (4xx) Prevenindo Deadlock da Fila', async () => {
    const queue = new MockSyncQueue();

    // Enfileira uma requisição inválida proposital (título vazio em criação de lista) que retorna HTTP 400
    await queue.enqueue({
      url: `${baseUrl}/lists`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { title: '   ' }
    });

    // Enfileira em seguida uma operação válida
    await queue.enqueue({
      url: `${baseUrl}/lists/${list.id}`,
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': user.id },
      body: { title: 'Feira Sync Atualizada' }
    });

    const result = await queue.flush();
    assert.equal(result.processed, 2, 'Ambas devem ser processadas (400 é descartado e operação seguinte processada)');
    assert.equal(result.remaining, 0);

    const checkListRes = await fetch(`${baseUrl}/lists/${list.id}`, {
      headers: { 'X-User-Id': user.id }
    });
    const updatedList = await checkListRes.json();
    assert.equal(updatedList.title, 'Feira Sync Atualizada');
  });

  await t.test('4. Retenção e Pausa da Fila em Falhas de Conexão Transitórias (Offline)', async () => {
    const queue = new MockSyncQueue();

    await queue.enqueue({
      url: `${baseUrl}/lists/${list.id}/items`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': user.id },
      body: { name: 'Item Que Falha', quantity: 1 }
    });

    // Simula falha de conexão (fetch que rejeita por erro de rede offline)
    const mockOfflineFetch = async () => {
      throw new Error('TypeError: Failed to fetch (Offline)');
    };

    const result = await queue.flush(mockOfflineFetch);
    assert.equal(result.processed, 0);
    assert.equal(result.remaining, 1, 'Item deve ser retido na fila para o próximo ciclo de sync');

    const pending = await queue.getAll();
    assert.equal(pending[0].attempts, 1, 'Contador de tentativas deve ter sido incrementado');
  });

  await t.test('5. Rastreabilidade de Conflitos e Notificação em Descarte 4xx (404/403)', async () => {
    const {
      recordConflict,
      getConflictLogs,
      clearConflictLogs,
      subscribeConflictNotifications
    } = await import('../client/src/utils/syncManager.js');

    clearConflictLogs();
    const recordedEvents = [];
    const unsubscribe = subscribeConflictNotifications((conflict) => {
      recordedEvents.push(conflict);
    });

    // Simula descarte de item cuja lista foi encerrada ou removida (HTTP 404)
    recordConflict({
      id: 999,
      url: `${baseUrl}/items/item_inexistente`,
      method: 'PUT',
      status: 404,
      timestamp: Date.now(),
      reason: 'Item ou feira não encontrada no servidor'
    });

    assert.equal(recordedEvents.length, 1, 'Deve emitir evento de conflito resolvido');
    assert.equal(recordedEvents[0].status, 404);
    assert.match(recordedEvents[0].reason, /não encontrada/i);

    const logs = getConflictLogs();
    assert.equal(logs.length, 1);
    assert.equal(logs[0].id, 999);

    unsubscribe();
  });

  await new Promise((resolve) => server.close(resolve));
});
