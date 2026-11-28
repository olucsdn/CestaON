import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { WebSocket } from 'ws';
import { getDatabase } from '../server/db/database.js';
import { seedDatabase } from '../server/db/seed.js';
import { SocketManager } from '../server/ws/socketManager.js';
import { createApiRouter } from '../server/routes/api.js';
import { ListRepository } from '../server/repositories/listRepository.js';

test('CICLO 4 DE TESTES (Teste 2/2 de Segurança) — Isolamento Cross-Tenant, BOLA e Autorização WebSocket', async (t) => {
  const db = getDatabase(':memory:');
  seedDatabase(db);

  const listRepo = new ListRepository(db);
  const app = express();
  app.use(express.json());
  const server = http.createServer(app);

  // Inicializa SocketManager com o verificador estrito de autorização
  const socketManager = new SocketManager(server, (listId, userId) => {
    if (!listId) return false;
    const perm = listRepo.checkPermission(listId, userId);
    return perm.allowed;
  });

  app.use('/api', createApiRouter(db, socketManager));

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api`;
  const wsUrl = `ws://127.0.0.1:${port}`;

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
    return { status: res.status, data };
  }

  // 1. Cria dois perfis: Alice (proprietária legítima) e Bob (usuário não autorizado)
  const { data: userAlice } = await req('/users', {
    method: 'POST',
    body: JSON.stringify({ name: 'Alice Proprietária' })
  });

  const { data: userBob } = await req('/users', {
    method: 'POST',
    body: JSON.stringify({ name: 'Bob Estranho' })
  });

  // 2. Alice cria uma lista
  const { data: aliceList } = await req('/lists', {
    method: 'POST',
    headers: { 'X-User-Id': userAlice.id },
    body: JSON.stringify({ title: 'Feira Confidencial da Alice', budget_cents: 15000 })
  });
  assert.ok(aliceList?.id);

  // Alice adiciona um produto e marca como comprado
  const { data: itemData } = await req(`/lists/${aliceList.id}/items`, {
    method: 'POST',
    headers: { 'X-User-Id': userAlice.id },
    body: JSON.stringify({ name: 'Arroz 5kg', price_cents: 2500, quantity: 1, unit: 'un' })
  });
  assert.ok(itemData?.item?.id);
  await req(`/items/${itemData.item.id}/toggle`, {
    method: 'PUT',
    headers: { 'X-User-Id': userAlice.id },
    body: JSON.stringify({ is_purchased: true, actual_price_cents: 2500 })
  });

  await t.test('4.1 Bloqueio de BOLA em GET /lists/:id/where-to-buy', async () => {
    // Bob tenta inspecionar a simulação de onde comprar na feira de Alice
    const resBobInspect = await req(`/lists/${aliceList.id}/where-to-buy`, {
      headers: { 'X-User-Id': userBob.id }
    });
    assert.equal(resBobInspect.status, 403, 'Bob não pode acessar simulador de feira alheia');

    // Alice tem acesso permitido
    const resAliceInspect = await req(`/lists/${aliceList.id}/where-to-buy`, {
      headers: { 'X-User-Id': userAlice.id }
    });
    assert.equal(resAliceInspect.status, 200, 'Alice acessa sua própria simulação normalmente');
  });

  await t.test('4.2 Rejeição de Manipulação Arbitrária de Status em PUT /lists/:id', async () => {
    // Bob tenta alterar o status da lista da Alice
    const resBobUpdate = await req(`/lists/${aliceList.id}`, {
      method: 'PUT',
      headers: { 'X-User-Id': userBob.id },
      body: JSON.stringify({ status: 'completed' })
    });
    assert.equal(resBobUpdate.status, 403, 'Bob não tem permissão para alterar a lista');

    // Alice tenta injetar status: 'completed' diretamente via PUT (bypass do fluxo /finish)
    const resAliceTamper = await req(`/lists/${aliceList.id}`, {
      method: 'PUT',
      headers: { 'X-User-Id': userAlice.id },
      body: JSON.stringify({ title: 'Novo Título Legítimo', status: 'completed' })
    });
    assert.equal(resAliceTamper.status, 200);

    // O status real no banco deve permanecer 'active', pois PUT só aceita { title, store_id, budget_cents }
    const { data: freshList } = await req(`/lists/${aliceList.id}`, {
      headers: { 'X-User-Id': userAlice.id }
    });
    assert.equal(freshList.title, 'Novo Título Legítimo');
    assert.equal(freshList.status, 'active', 'O status NÃO deve ser alterado por injeção direta de payload');
  });

  await t.test('4.3 Isolamento Cross-Tenant em Histórico de Compras', async () => {
    // Alice finaliza a lista legitimamente
    const finishRes = await req(`/lists/${aliceList.id}/finish`, {
      method: 'POST',
      headers: { 'X-User-Id': userAlice.id },
      body: JSON.stringify({})
    });
    assert.equal(finishRes.status, 200);

    // Alice consulta o histórico e vê sua feira
    const aliceHistory = await req('/history', {
      headers: { 'X-User-Id': userAlice.id }
    });
    assert.equal(aliceHistory.status, 200);
    assert.equal(aliceHistory.data.length, 1);
    assert.equal(aliceHistory.data[0].list_id, aliceList.id);

    // Bob consulta o histórico e NÃO deve ver os dados da feira da Alice (cross-tenant leak prevenido)
    const bobHistory = await req('/history', {
      headers: { 'X-User-Id': userBob.id }
    });
    assert.equal(bobHistory.status, 200);
    assert.equal(bobHistory.data.length, 0, 'Histórico de terceiros não deve vazar para Bob');

    // Bob tenta comparar preços da feira de Alice via GET /history/compare/:id
    const resBobCompare = await req(`/history/compare/${aliceHistory.data[0].id}`, {
      headers: { 'X-User-Id': userBob.id }
    });
    assert.equal(resBobCompare.status, 403, 'Bob não tem permissão para comparar histórico de feira alheia');
  });

  await t.test('4.4 Autorização em Tempo Real via WebSocket (JOIN_LIST)', async () => {
    // 1. Bob tenta escutar a sala da Alice via WebSocket
    const bobSocket = new WebSocket(wsUrl);
    await new Promise((resolve) => bobSocket.on('open', resolve));

    const bobReceived = [];
    bobSocket.on('message', (msg) => {
      try {
        bobReceived.push(JSON.parse(msg.toString()));
      } catch (_) {}
    });

    // Bob tenta entrar na lista da Alice
    bobSocket.send(JSON.stringify({ type: 'JOIN_LIST', listId: aliceList.id, userId: userBob.id }));

    // Aguarda processamento
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Bob deve ter recebido mensagem de ERROR e NÃO deve ter JOINED_LIST
    const bobError = bobReceived.find((m) => m.type === 'ERROR');
    const bobJoined = bobReceived.find((m) => m.type === 'JOINED_LIST');
    assert.ok(bobError, 'Bob deve receber evento de ERROR');
    assert.ok(bobError.message.includes('não autorizado'), 'Mensagem de erro deve indicar acesso não autorizado');
    assert.equal(bobJoined, undefined, 'Bob NÃO deve receber JOINED_LIST');

    bobSocket.close();

    // 2. Alice entra na sua própria sala via WebSocket
    const aliceSocket = new WebSocket(wsUrl);
    await new Promise((resolve) => aliceSocket.on('open', resolve));

    const aliceReceived = [];
    aliceSocket.on('message', (msg) => {
      try {
        aliceReceived.push(JSON.parse(msg.toString()));
      } catch (_) {}
    });

    aliceSocket.send(JSON.stringify({ type: 'JOIN_LIST', listId: aliceList.id, userId: userAlice.id }));

    await new Promise((resolve) => setTimeout(resolve, 150));

    const aliceJoined = aliceReceived.find((m) => m.type === 'JOINED_LIST');
    assert.ok(aliceJoined, 'Alice deve ingressar na sala com sucesso');
    assert.equal(aliceJoined.listId, aliceList.id);

    aliceSocket.close();
  });

  await new Promise((resolve) => server.close(resolve));
});
