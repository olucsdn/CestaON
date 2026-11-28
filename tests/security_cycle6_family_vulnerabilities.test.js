import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { getDatabase } from '../server/db/database.js';
import { seedDatabase } from '../server/db/seed.js';
import { SocketManager } from '../server/ws/socketManager.js';
import { createApiRouter } from '../server/routes/api.js';

test('CICLO 6 DE TESTES (Teste 2/2) — Auditoria e Remediação em Compartilhamento Familiar', async (t) => {
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

  // 1. Criar usuários: Alice (Proprietária), Bob (Familiar Admin), Carlos (Familiar Leitor)
  const { data: userAlice } = await req('/users', {
    method: 'POST',
    body: JSON.stringify({ name: 'Alice Mãe de Família', avatar_color: '#10B981' })
  });
  const { data: userBob } = await req('/users', {
    method: 'POST',
    body: JSON.stringify({ name: 'Bob Cônjuge Admin', avatar_color: '#3B82F6' })
  });
  const { data: userCarlos } = await req('/users', {
    method: 'POST',
    body: JSON.stringify({ name: 'Carlos Filho Leitor', avatar_color: '#F59E0B' })
  });

  // 2. Alice cria sua feira da família
  const { data: aliceList } = await req('/lists', {
    method: 'POST',
    headers: { 'X-User-Id': userAlice.id },
    body: JSON.stringify({ title: 'Feira da Família Silva', budget_cents: 50000 })
  });

  await t.test('6.1 Proteção contra Crash 500 por Foreign Key ao compartilhar com ID inexistente', async () => {
    // Tenta compartilhar com um ID de usuário que não existe
    const resGhost = await req(`/lists/${aliceList.id}/shares`, {
      method: 'POST',
      headers: { 'X-User-Id': userAlice.id },
      body: JSON.stringify({ user_id: 'usr_inexistente_9999', permission: 'write' })
    });
    assert.equal(resGhost.status, 404, 'Deve retornar HTTP 404 em vez de crashar com 500');
    assert.match(resGhost.data.error, /não encontrado/i);
  });

  await t.test('6.2 Proteção contra Auto-Compartilhamento e Descaracterização do Proprietário', async () => {
    // Alice tenta compartilhar a lista com ela mesma
    const resSelfShare = await req(`/lists/${aliceList.id}/shares`, {
      method: 'POST',
      headers: { 'X-User-Id': userAlice.id },
      body: JSON.stringify({ user_id: userAlice.id, permission: 'read' })
    });
    assert.equal(resSelfShare.status, 400, 'Não deve permitir adicionar o próprio dono na lista de compartilhamento');
    assert.match(resSelfShare.data.error, /proprietário já possui controle/i);
  });

  await t.test('6.3 Compartilhamento legítimo de familiares com papéis distintos', async () => {
    // Alice compartilha com Bob como administrador
    const shareBob = await req(`/lists/${aliceList.id}/shares`, {
      method: 'POST',
      headers: { 'X-User-Id': userAlice.id },
      body: JSON.stringify({ user_id: userBob.id, permission: 'admin' })
    });
    assert.equal(shareBob.status, 201);

    // Alice compartilha com Carlos como leitor
    const shareCarlos = await req(`/lists/${aliceList.id}/shares`, {
      method: 'POST',
      headers: { 'X-User-Id': userAlice.id },
      body: JSON.stringify({ user_id: userCarlos.id, permission: 'read' })
    });
    assert.equal(shareCarlos.status, 201);

    // Valida painel de compartilhamento
    const sharesInfo = await req(`/lists/${aliceList.id}/shares`, {
      headers: { 'X-User-Id': userAlice.id }
    });
    assert.equal(sharesInfo.status, 200);
    assert.equal(sharesInfo.data.shares.length, 2);
  });

  await t.test('6.4 Prevenção de Escalada de Privilégio: Familiar Admin NÃO pode excluir a lista do Dono', async () => {
    // Bob tem papel 'admin' na feira, mas NÃO é o proprietário original (isOwner = false)
    const bobDeleteAttempt = await req(`/lists/${aliceList.id}`, {
      method: 'DELETE',
      headers: { 'X-User-Id': userBob.id }
    });
    assert.equal(bobDeleteAttempt.status, 403, 'Bob admin não deve ter permissão para destruir a feira de Alice');
    assert.match(bobDeleteAttempt.data.error, /Apenas o proprietário original/i);

    // Garante que a lista ainda existe intacta
    const checkList = await req(`/lists/${aliceList.id}`, {
      headers: { 'X-User-Id': userAlice.id }
    });
    assert.equal(checkList.status, 200, 'A feira deve permanecer ativa e íntegra');
  });

  await t.test('6.5 Proteção contra Remoção do Dono e Auto-Desvinculação Legítima', async () => {
    // Bob tenta remover Alice da própria lista
    const removeOwnerAttempt = await req(`/lists/${aliceList.id}/shares/${userAlice.id}`, {
      method: 'DELETE',
      headers: { 'X-User-Id': userBob.id }
    });
    assert.equal(removeOwnerAttempt.status, 400, 'Deve rejeitar tentativa de remover o proprietário');
    assert.match(removeOwnerAttempt.data.error, /Não é possível remover o proprietário/i);

    // Carlos (leitor) decide sair voluntariamente da lista (auto-desvinculação)
    const carlosLeave = await req(`/lists/${aliceList.id}/shares/${userCarlos.id}`, {
      method: 'DELETE',
      headers: { 'X-User-Id': userCarlos.id }
    });
    assert.equal(carlosLeave.status, 200, 'Membro familiar deve conseguir sair voluntariamente da feira');

    // Valida que Carlos não tem mais acesso de leitura
    const carlosInspect = await req(`/lists/${aliceList.id}`, {
      headers: { 'X-User-Id': userCarlos.id }
    });
    assert.equal(carlosInspect.status, 403, 'Carlos não tem mais acesso à lista após sair');
  });

  await t.test('6.6 Exclusão legítima pelo proprietário original', async () => {
    // Alice (proprietária legítima) exclui sua própria lista
    const aliceDelete = await req(`/lists/${aliceList.id}`, {
      method: 'DELETE',
      headers: { 'X-User-Id': userAlice.id }
    });
    assert.equal(aliceDelete.status, 200, 'Proprietário deve conseguir excluir sua lista');

    // Confirma exclusão
    const checkGone = await req(`/lists/${aliceList.id}`, {
      headers: { 'X-User-Id': userAlice.id }
    });
    assert.equal(checkGone.status, 404);
  });

  await new Promise((resolve) => server.close(resolve));
});
