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

test('FASE 1 — Testes Automatizados de Segurança, Permissões, Brute-Force e WebSockets', async (t) => {
  const db = getDatabase(':memory:');
  seedDatabase(db);

  const app = express();
  app.use(express.json());
  const server = http.createServer(app);

  const listRepoForAuth = new ListRepository(db);
  const socketManager = new SocketManager(server, (listId, userId) => {
    if (!listId) return false;
    const perm = listRepoForAuth.checkPermission(listId, userId);
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

  // Cria Alice e Bob
  const { data: alice } = await req('/users', {
    method: 'POST',
    body: JSON.stringify({ name: 'Alice Segurança', pin: '1234' })
  });
  const { data: bob } = await req('/users', {
    method: 'POST',
    body: JSON.stringify({ name: 'Bob Convidado' })
  });
  const { data: eve } = await req('/users', {
    method: 'POST',
    body: JSON.stringify({ name: 'Eve Intruso' })
  });

  // Alice cria uma feira
  const { data: aliceList } = await req('/lists', {
    method: 'POST',
    headers: { 'X-User-Id': alice.id },
    body: JSON.stringify({ title: 'Feira Segura Alice', budget_cents: 30000 })
  });

  await t.test('1. IDOR: Usuário de outro perfil (Eve) não pode modificar perfil de Bob', async () => {
    // Eve tenta alterar Bob
    const resEve = await req(`/users/${bob.id}`, {
      method: 'PUT',
      headers: { 'X-User-Id': eve.id },
      body: JSON.stringify({ name: 'Nome Modificado por Eve' })
    });
    assert.equal(resEve.status, 403, 'Eve não pode alterar perfil de Bob');
  });

  await t.test('2. Brute Force no PIN: PUT /users/:id bloqueia após 5 tentativas de current_pin inválido', async () => {
    // 5 tentativas com current_pin errado
    for (let i = 0; i < 5; i++) {
      const resWrong = await req(`/users/${alice.id}`, {
        method: 'PUT',
        headers: { 'X-User-Id': alice.id },
        body: JSON.stringify({ pin: '9999', current_pin: `000${i}` })
      });
      assert.equal(resWrong.status, 403, `Tentativa ${i + 1} deve falhar com 403`);
    }

    // 6ª tentativa deve retornar 429 Too Many Requests
    const resBlocked = await req(`/users/${alice.id}`, {
      method: 'PUT',
      headers: { 'X-User-Id': alice.id },
      body: JSON.stringify({ pin: '9999', current_pin: '1234' })
    });
    assert.equal(resBlocked.status, 429, '6ª tentativa deve ser bloqueada por rate limit (429)');
    assert.match(resBlocked.data.error, /Muitas tentativas/i);
  });

  await t.test('3. Permissões de Feira: Estranho (Eve) não pode manipular shares de feira alheia', async () => {
    const resEveDeleteShare = await req(`/lists/${aliceList.id}/shares/${eve.id}`, {
      method: 'DELETE',
      headers: { 'X-User-Id': eve.id }
    });
    assert.equal(resEveDeleteShare.status, 403, 'Estranho não pode alterar shares da feira');
  });

  await t.test('4. WebSockets: Revogação de Acesso em tempo real desvincula e silencia o cliente', async () => {
    // Compartilha lista de Alice com Bob
    const resShare = await req(`/lists/${aliceList.id}/shares`, {
      method: 'POST',
      headers: { 'X-User-Id': alice.id },
      body: JSON.stringify({ user_id: bob.id, permission: 'write' })
    });
    assert.equal(resShare.status, 201);

    // Bob conecta via WebSocket
    const bobSocket = new WebSocket(wsUrl);
    await new Promise((resolve) => bobSocket.on('open', resolve));

    const bobMessages = [];
    bobSocket.on('message', (msg) => {
      try {
        bobMessages.push(JSON.parse(msg.toString()));
      } catch (_) {}
    });

    // Bob entra na sala da lista
    bobSocket.send(JSON.stringify({ type: 'JOIN_LIST', listId: aliceList.id, userId: bob.id }));
    await new Promise((resolve) => setTimeout(resolve, 100));

    const joinedMsg = bobMessages.find((m) => m.type === 'JOINED_LIST');
    assert.ok(joinedMsg, 'Bob deve ter ingressado na sala com sucesso');

    // Alice revoga o compartilhamento de Bob
    const resRevoke = await req(`/lists/${aliceList.id}/shares/${bob.id}`, {
      method: 'DELETE',
      headers: { 'X-User-Id': alice.id }
    });
    assert.equal(resRevoke.status, 200);

    // Aguarda processamento de evicção do WebSocket
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Bob deve ter recebido o evento ACCESS_REVOKED
    const revokedMsg = bobMessages.find((m) => m.type === 'ACCESS_REVOKED');
    assert.ok(revokedMsg, 'Bob deve receber evento ACCESS_REVOKED ao ser removido dos compartilhamentos');
    assert.equal(revokedMsg.listId, aliceList.id);

    // Alice adiciona um produto à lista
    const resAddItem = await req(`/lists/${aliceList.id}/items`, {
      method: 'POST',
      headers: { 'X-User-Id': alice.id },
      body: JSON.stringify({ name: 'Maçã Fuji Secreta', quantity: 3, unit: 'kg' })
    });
    assert.equal(resAddItem.status, 201);

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Bob NÃO deve receber o evento ITEM_ADDED
    const itemAddedMsg = bobMessages.find((m) => m.type === 'ITEM_ADDED');
    assert.equal(itemAddedMsg, undefined, 'Bob revogado NÃO deve receber atualizações em tempo real');

    bobSocket.close();
  });

  await new Promise((resolve) => server.close(resolve));
});
