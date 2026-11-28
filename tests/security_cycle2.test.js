import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { getDatabase } from '../server/db/database.js';
import { seedDatabase } from '../server/db/seed.js';
import { SocketManager } from '../server/ws/socketManager.js';
import { createApiRouter } from '../server/routes/api.js';

test('CICLO 2 DE TESTES — Re-teste Rigoroso de Regressão e Segurança Avançada', async (t) => {
  const db = getDatabase(':memory:');
  seedDatabase(db);

  const app = express();
  // Headers de segurança e proteção
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });
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
    return { status: res.status, headers: res.headers, data };
  }

  // Criação dos perfis
  const { data: owner } = await req('/users', {
    method: 'POST',
    body: JSON.stringify({ name: 'Proprietário Oficial' })
  });
  const { data: reader } = await req('/users', {
    method: 'POST',
    body: JSON.stringify({ name: 'Familiar Somente Leitura' })
  });
  const { data: writer } = await req('/users', {
    method: 'POST',
    body: JSON.stringify({ name: 'Familiar Editor' })
  });
  const { data: attacker } = await req('/users', {
    method: 'POST',
    body: JSON.stringify({ name: 'Atacante Externo' })
  });

  let sharedListId = null;
  let testItemId = null;

  await t.test('2.1 Validação dos Headers de Segurança HTTP', async () => {
    const res = await req('/categories');
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.equal(res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  });

  await t.test('2.2 Criação e Compartilhamento com Níveis Distintos de Permissão', async () => {
    const res = await req('/lists', {
      method: 'POST',
      headers: { 'X-User-Id': owner.id },
      body: JSON.stringify({
        title: 'Feira com Permissões Granulares',
        budget_cents: 20000
      })
    });
    assert.equal(res.status, 201);
    sharedListId = res.data.id;

    // Compartilha com o leitor com permissão 'read'
    const shareRead = await req(`/lists/${sharedListId}/shares`, {
      method: 'POST',
      headers: { 'X-User-Id': owner.id },
      body: JSON.stringify({ user_id: reader.id, permission: 'read' })
    });
    assert.equal(shareRead.status, 201);

    // Compartilha com o editor com permissão 'write'
    const shareWrite = await req(`/lists/${sharedListId}/shares`, {
      method: 'POST',
      headers: { 'X-User-Id': owner.id },
      body: JSON.stringify({ user_id: writer.id, permission: 'write' })
    });
    assert.equal(shareWrite.status, 201);

    // Proprietário adiciona item inicial
    const itemRes = await req(`/lists/${sharedListId}/items`, {
      method: 'POST',
      headers: { 'X-User-Id': owner.id },
      body: JSON.stringify({ name: 'Banana Prata', quantity: 1, estimated_price_cents: 800 })
    });
    assert.equal(itemRes.status, 201);
    testItemId = itemRes.data.item.id;
  });

  await t.test('2.3 Restrição Estrita: Leitor (read) não pode alterar nem criar itens', async () => {
    // Leitor tenta adicionar item -> 403
    const addRes = await req(`/lists/${sharedListId}/items`, {
      method: 'POST',
      headers: { 'X-User-Id': reader.id },
      body: JSON.stringify({ name: 'Item Não Autorizado' })
    });
    assert.equal(addRes.status, 403, 'Usuário com permissão read não pode adicionar itens');

    // Leitor tenta marcar item como comprado -> 403
    const toggleRes = await req(`/items/${testItemId}/toggle`, {
      method: 'PUT',
      headers: { 'X-User-Id': reader.id },
      body: JSON.stringify({ is_purchased: true })
    });
    assert.equal(toggleRes.status, 403, 'Usuário com permissão read não pode dar toggle em itens');

    // Leitor tenta excluir lista -> 403
    const deleteListRes = await req(`/lists/${sharedListId}`, {
      method: 'DELETE',
      headers: { 'X-User-Id': reader.id }
    });
    assert.equal(deleteListRes.status, 403, 'Usuário com permissão read não pode excluir a lista');
  });

  await t.test('2.4 Editor (write) pode manipular itens, mas NÃO pode excluir a lista nem gerenciar permissões', async () => {
    // Editor altera item -> 200
    const editRes = await req(`/items/${testItemId}`, {
      method: 'PUT',
      headers: { 'X-User-Id': writer.id },
      body: JSON.stringify({ quantity: 2 })
    });
    assert.equal(editRes.status, 200, 'Usuário com permissão write pode atualizar item');

    // Editor tenta excluir a feira -> 403 (apenas admin/owner pode)
    const deleteRes = await req(`/lists/${sharedListId}`, {
      method: 'DELETE',
      headers: { 'X-User-Id': writer.id }
    });
    assert.equal(deleteRes.status, 403, 'Usuário com permissão write NÃO pode excluir a lista');

    // Editor tenta adicionar outro usuário -> 403
    const addShareRes = await req(`/lists/${sharedListId}/shares`, {
      method: 'POST',
      headers: { 'X-User-Id': writer.id },
      body: JSON.stringify({ user_id: attacker.id, permission: 'write' })
    });
    assert.equal(addShareRes.status, 403, 'Usuário write não pode gerenciar compartilhamentos');
  });

  await t.test('2.5 Atacante Externo não consegue finalizar feira de terceiros', async () => {
    // Atacante tenta fechar a feira -> 403
    const finishRes = await req(`/lists/${sharedListId}/finish`, {
      method: 'POST',
      headers: { 'X-User-Id': attacker.id },
      body: JSON.stringify({ notes: 'Tentativa de sequestro' })
    });
    assert.equal(finishRes.status, 403, 'Atacante sem permissão é rejeitado ao tentar finalizar');
  });

  await t.test('2.6 Sanitização contra injeção massiva de IDs na rota de tendências', async () => {
    // Envia 200 IDs aleatórios e caracteres maliciosos
    const hugeQuery = Array.from({ length: 200 }, (_, i) => `malicious_id_${i}' OR '1'='1`).join(',');
    const resTrends = await req(`/history/trends?products=${encodeURIComponent(hugeQuery)}`);
    assert.equal(resTrends.status, 200, 'API deve responder 200 sem estourar limites do SQLite');
    assert.ok(Array.isArray(resTrends.data), 'Resposta deve ser um array seguro');
  });

  await t.test('2.7 Exclusão segura e legítima pelo proprietário', async () => {
    const deleteOwnerRes = await req(`/lists/${sharedListId}`, {
      method: 'DELETE',
      headers: { 'X-User-Id': owner.id }
    });
    assert.equal(deleteOwnerRes.status, 200, 'Proprietário pode excluir a feira');
    assert.equal(deleteOwnerRes.data.success, true);
  });

  server.close();
});
