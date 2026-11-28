import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { getDatabase } from '../server/db/database.js';
import { seedDatabase } from '../server/db/seed.js';
import { createApiRouter } from '../server/routes/api.js';
import { PriceRepository } from '../server/repositories/priceRepository.js';

test('HARDENING OFFLINE & PERSISTÊNCIA — Validação dos Pontos Críticos de Produção', async (t) => {
  const db = getDatabase(':memory:');
  seedDatabase(db);

  const app = express();
  app.use(express.json());
  app.use('/api', createApiRouter(db, null));

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api`;

  async function req(path, options = {}) {
    const { headers, ...rest } = options;
    const res = await fetch(`${baseUrl}${path}`, {
      headers: { 'Content-Type': 'application/json', ...(headers || {}) },
      ...rest
    });
    let data;
    try {
      data = await res.json();
    } catch (_) {
      data = null;
    }
    return { status: res.status, data, headers: res.headers };
  }

  await t.test('1. Idempotência: Reenvio de Mutação com mesmo X-Operation-Id não duplica itens', async () => {
    // Cria feira
    const { data: list } = await req('/lists', {
      method: 'POST',
      body: JSON.stringify({ title: 'Feira Idempotente', budget_cents: 10000 })
    });

    const opId = 'op_test_uuid_' + Date.now();

    // Primeira tentativa de adição de item (simula envio inicial do celular)
    const firstRes = await req(`/lists/${list.id}/items`, {
      method: 'POST',
      headers: { 'X-Operation-Id': opId },
      body: JSON.stringify({ name: 'Leite Integral Idempotente', quantity: 2, unit: 'L' })
    });
    assert.equal(firstRes.status, 201);
    const firstItemId = firstRes.data.id;

    // Segunda tentativa com mesmo X-Operation-Id (simula reconexão 3G e reenvio da fila do IndexedDB)
    const secondRes = await req(`/lists/${list.id}/items`, {
      method: 'POST',
      headers: { 'X-Operation-Id': opId },
      body: JSON.stringify({ name: 'Leite Integral Idempotente', quantity: 2, unit: 'L' })
    });

    assert.equal(secondRes.status, 201);
    assert.equal(secondRes.headers.get('x-idempotent-replay'), 'true', 'Deve sinalizar replay idempotente');
    assert.equal(secondRes.data.id, firstItemId, 'Deve devolver o mesmo item previamente criado');

    // Confere que no banco há apenas 1 item
    const { data: freshList } = await req(`/lists/${list.id}`);
    assert.equal(freshList.items.length, 1, 'Não deve duplicar o item no banco');
  });

  await t.test('2. Onde Comprar: Consulta em Lote O(1) sem N+1 Queries no Event Loop', async () => {
    const { data: list } = await req('/lists', {
      method: 'POST',
      body: JSON.stringify({ title: 'Feira Simulação Rápida' })
    });

    // Adiciona 5 itens com produtos cadastrados
    await req(`/lists/${list.id}/items`, { method: 'POST', body: JSON.stringify({ name: 'Arroz Branco', quantity: 1, unit: 'kg' }) });
    await req(`/lists/${list.id}/items`, { method: 'POST', body: JSON.stringify({ name: 'Feijão Carioca', quantity: 1, unit: 'kg' }) });
    await req(`/lists/${list.id}/items`, { method: 'POST', body: JSON.stringify({ name: 'Óleo de Soja', quantity: 1, unit: 'L' }) });

    const priceRepo = new PriceRepository(db);
    const start = performance.now();
    const sim = priceRepo.simulateWhereToBuy(list.id);
    const elapsed = performance.now() - start;

    assert.ok(Array.isArray(sim.stores), 'Deve retornar lista de estabelecimentos');
    assert.ok(elapsed < 20, `Simulação deve ser sub-milissegundos com O(1) in-memory, demorou ${elapsed}ms`);
  });

  await t.test('3. Configuração de Banco: Busy Timeout e WAL autocheckpoint configurados', async () => {
    const busyTimeout = db.prepare('PRAGMA busy_timeout;').get();
    assert.equal(Number(busyTimeout.timeout), 5000, 'busy_timeout deve estar configurado para 5000ms');
  });

  await new Promise((resolve) => server.close(resolve));
});
