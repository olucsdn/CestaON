import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { getDatabase } from '../server/db/database.js';
import { seedDatabase } from '../server/db/seed.js';
import { SocketManager } from '../server/ws/socketManager.js';
import { createApiRouter } from '../server/routes/api.js';

test('ETAPAS 3 A 7 — Testes Integrados da API REST e Inteligência', async (t) => {
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
    const data = await res.json();
    return { status: res.status, data };
  }

  await t.test('GET /api/categories retorna os 9 setores com sucesso', async () => {
    const { status, data } = await req('/categories');
    assert.equal(status, 200);
    assert.ok(data.length >= 9);
    assert.ok(data.some(c => c.name === 'Hortifrúti'));
  });

  let createdListId = null;
  await t.test('POST /api/lists cria lista com orçamento definido', async () => {
    const { status, data } = await req('/lists', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Feira Mensal',
        budget_cents: 25000, // R$ 250,00
        store_id: 'store_atacadao'
      })
    });
    assert.equal(status, 201);
    assert.equal(data.title, 'Feira Mensal');
    assert.equal(data.budget_cents, 25000);
    assert.equal(data.stats.remainingBudgetCents, 25000);
    createdListId = data.id;
  });

  let itemTomatoId = null;
  await t.test('POST /api/lists/:id/items adiciona produto com auto-categorização', async () => {
    const { status, data } = await req(`/lists/${createdListId}/items`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'Tomate Débora',
        quantity: 3,
        unit: 'kg',
        estimated_price_cents: 2100
      })
    });
    assert.equal(status, 201);
    assert.equal(data.item.category_id, 'cat_hortifruti'); // Inferência automática
    assert.equal(data.stats.totalItems, 1);
    itemTomatoId = data.item.id;
  });

  await t.test('PUT /api/items/:id/toggle marca como comprado e atualiza orçamento em tempo real', async () => {
    const { status, data } = await req(`/items/${itemTomatoId}/toggle`, {
      method: 'PUT',
      body: JSON.stringify({
        is_purchased: true,
        actual_price_cents: 1950 // R$ 19,50
      })
    });
    assert.equal(status, 200);
    assert.equal(data.item.is_purchased, 1);
    assert.equal(data.stats.totalSpentCents, 1950);
    assert.equal(data.stats.remainingBudgetCents, 23050); // 25000 - 1950
    assert.equal(data.stats.budgetUsedPercentage, 8); // ~7.8% -> 8%
  });

  let duplicatedListId = null;
  await t.test('POST /api/lists/:id/duplicate clona lista para feira rápida', async () => {
    const { status, data } = await req(`/lists/${createdListId}/duplicate`, {
      method: 'POST',
      body: JSON.stringify({ title: 'Próxima Feira' })
    });
    assert.equal(status, 201);
    assert.equal(data.title, 'Próxima Feira');
    assert.equal(data.items.length, 1);
    assert.equal(data.items[0].is_purchased, 0); // Resetado para pendente
    assert.equal(data.items[0].estimated_price_cents, 1950); // Preço anterior vira estimativa
    duplicatedListId = data.id;
  });

  let finishedHistoryId = null;
  await t.test('POST /api/lists/:id/finish congela histórico de compra e preços', async () => {
    const { status, data } = await req(`/lists/${createdListId}/finish`, {
      method: 'POST',
      body: JSON.stringify({ store_id: 'store_atacadao' })
    });
    assert.equal(status, 200);
    assert.equal(data.total_spent_cents, 1950);
    finishedHistoryId = data.id;
  });

  await t.test('Bloqueio estrito de edição após finalização: somente ver, copiar e excluir são permitidos', async () => {
    // 1. Tentar adicionar item na feira finalizada deve ser rejeitado com 400
    const addItemRes = await req(`/lists/${createdListId}/items`, {
      method: 'POST',
      body: JSON.stringify({ name: 'Banana Prata', quantity: 1 })
    });
    assert.equal(addItemRes.status, 400);
    assert.match(addItemRes.data.error, /finalizada/);

    // 2. Tentar alterar orçamento ou propriedades da feira finalizada deve ser rejeitado com 400
    const updateListRes = await req(`/lists/${createdListId}`, {
      method: 'PUT',
      body: JSON.stringify({ budget_cents: 99999 })
    });
    assert.equal(updateListRes.status, 400);

    // 3. Tentar alterar item da feira finalizada deve ser rejeitado com 400
    const toggleItemRes = await req(`/items/${itemTomatoId}/toggle`, {
      method: 'PUT',
      body: JSON.stringify({ is_purchased: false })
    });
    assert.equal(toggleItemRes.status, 400);

    // 4. Operação 'ver ela' (GET) é permitida com 200
    const viewRes = await req(`/lists/${createdListId}`);
    assert.equal(viewRes.status, 200);
    assert.equal(viewRes.data.status, 'completed');

    // 5. Operação 'copiar' (POST /duplicate) é permitida com 201
    const copyRes = await req(`/lists/${createdListId}/duplicate`, {
      method: 'POST',
      body: JSON.stringify({ title: 'Nova Feira Clonada' })
    });
    assert.equal(copyRes.status, 201);
    assert.equal(copyRes.data.status, 'active');
  });

  await t.test('Validações de integridade no fechamento da feira (Itens pendentes e re-finalização)', async () => {
    // 1. Tentar re-finalizar uma feira já finalizada deve retornar 400
    const reFinishRes = await req(`/lists/${createdListId}/finish`, {
      method: 'POST',
      body: JSON.stringify({ store_id: 'store_atacadao' })
    });
    assert.equal(reFinishRes.status, 400);
    assert.match(reFinishRes.data.error, /finalizada anteriormente/);

    // 2. Criar lista com item pendente e tentar finalizar deve retornar 400
    const { data: pendingList } = await req('/lists', {
      method: 'POST',
      body: JSON.stringify({ title: 'Feira com Pendências' })
    });
    const { data: item1 } = await req(`/lists/${pendingList.id}/items`, {
      method: 'POST',
      body: JSON.stringify({ name: 'Maçã Fuji', quantity: 1, unit: 'kg' })
    });
    const { data: item2 } = await req(`/lists/${pendingList.id}/items`, {
      method: 'POST',
      body: JSON.stringify({ name: 'Laranja Pera', quantity: 1, unit: 'kg' })
    });
    // Marca apenas o item1 como comprado
    await req(`/items/${item1.item.id}/toggle`, {
      method: 'PUT',
      body: JSON.stringify({ is_purchased: true, actual_price_cents: 500 })
    });

    // Tentar finalizar com o item2 ainda pendente deve ser rejeitado
    const finishPendingRes = await req(`/lists/${pendingList.id}/finish`, {
      method: 'POST',
      body: JSON.stringify({ store_id: 'store_atacadao' })
    });
    assert.equal(finishPendingRes.status, 400);
    assert.match(finishPendingRes.data.error, /itens pendentes/);

    // Após marcar o item2 como comprado, finalização deve ter sucesso 200
    await req(`/items/${item2.item.id}/toggle`, {
      method: 'PUT',
      body: JSON.stringify({ is_purchased: true, actual_price_cents: 400 })
    });
    const finishSuccessRes = await req(`/lists/${pendingList.id}/finish`, {
      method: 'POST',
      body: JSON.stringify({ store_id: 'store_atacadao' })
    });
    assert.equal(finishSuccessRes.status, 200);
    assert.equal(finishSuccessRes.data.list.status, 'completed');
  });

  await t.test('POST /api/tools/compare-packages calcula melhor opção econômica por unidade', async () => {
    const { status, data } = await req('/tools/compare-packages', {
      method: 'POST',
      body: JSON.stringify({
        optionA: { priceCents: 650, quantity: 1, unit: 'kg' },
        optionB: { priceCents: 3100, quantity: 5, unit: 'kg' }
      })
    });
    assert.equal(status, 200);
    assert.equal(data.canCompare, true);
    assert.equal(data.bestOption, 'B');
    assert.match(data.summary, /mais econômica/);
  });

  await t.test('GET /api/lists/:id/where-to-buy simula custo em outros estabelecimentos', async () => {
    const { status, data } = await req(`/lists/${duplicatedListId}/where-to-buy`);
    assert.equal(status, 200);
    assert.ok(Array.isArray(data.stores));
  });

  await t.test('Operações de Perfil do Usuário (/api/users)', async () => {
    // 1. Listar usuários
    const listRes = await req('/users');
    assert.equal(listRes.status, 200);
    assert.ok(listRes.data.length >= 1);

    // 2. Criar novo perfil
    const createRes = await req('/users', {
      method: 'POST',
      body: JSON.stringify({ name: 'Helena', avatar_color: '#EC4899' })
    });
    assert.equal(createRes.status, 201);
    assert.equal(createRes.data.name, 'Helena');
    assert.equal(createRes.data.avatar_color, '#EC4899');
    const newUserId = createRes.data.id;

    // 3. Obter detalhes e métricas do perfil
    const getRes = await req(`/users/${newUserId}`, {
      headers: { 'X-User-Id': newUserId }
    });
    assert.equal(getRes.status, 200);
    assert.equal(getRes.data.name, 'Helena');
    assert.ok(getRes.data.stats !== undefined);

    // 4. Atualizar perfil
    const updateRes = await req(`/users/${newUserId}`, {
      method: 'PUT',
      headers: { 'X-User-Id': newUserId },
      body: JSON.stringify({ name: 'Helena Silva', avatar_color: '#3B82F6' })
    });
    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.data.name, 'Helena Silva');
    assert.equal(updateRes.data.avatar_color, '#3B82F6');
  });

  await t.test('Compartilhamento de Feira e Acesso Familiar (/api/lists/:id/shares e /api/lists/join)', async () => {
    // 1. Criar novo usuário familiar (ex: Helena)
    const userRes = await req('/users', {
      method: 'POST',
      body: JSON.stringify({ name: 'Helena Familiar', avatar_color: '#EC4899' })
    });
    const familiarId = userRes.data.id;

    // 2. Consultar detalhes de compartilhamento da lista principal
    const sharesRes = await req(`/lists/${createdListId}/shares`);
    assert.equal(sharesRes.status, 200);
    assert.ok(sharesRes.data.share_code);
    assert.equal(sharesRes.data.owner.id, 'usr_default');

    // 3. Adicionar familiar explicitamente à feira
    const addShareRes = await req(`/lists/${createdListId}/shares`, {
      method: 'POST',
      body: JSON.stringify({ user_id: familiarId, permission: 'write' })
    });
    assert.equal(addShareRes.status, 201);
    assert.ok(addShareRes.data.shares.some(s => s.user_id === familiarId));

    // 4. Ingressar via código de compartilhamento (join) com outro usuário
    const joinUserRes = await req('/users', {
      method: 'POST',
      body: JSON.stringify({ name: 'Filho', avatar_color: '#8B5CF6' })
    });
    const joinRes = await req('/lists/join', {
      method: 'POST',
      body: JSON.stringify({ share_code: sharesRes.data.share_code, user_id: joinUserRes.data.id })
    });
    assert.equal(joinRes.status, 200);
    assert.equal(joinRes.data.id, createdListId);
    assert.ok(joinRes.data.shares.some(s => s.user_id === joinUserRes.data.id));

    // 5. Remover compartilhamento
    const removeRes = await req(`/lists/${createdListId}/shares/${familiarId}`, {
      method: 'DELETE'
    });
    assert.equal(removeRes.status, 200);
    assert.equal(removeRes.data.success, true);
    assert.ok(!removeRes.data.list.shares.some(s => s.user_id === familiarId));
  });

  await t.test('DELETE /api/lists/:id remove lista salva e retorna 200 ou 404', async () => {
    // 1. Exclusão bem-sucedida de lista existente
    const delRes = await req(`/lists/${duplicatedListId}`, { method: 'DELETE' });
    assert.equal(delRes.status, 200);
    assert.equal(delRes.data.success, true);
    assert.equal(delRes.data.listId, duplicatedListId);

    // 2. Tentar excluir novamente deve retornar 404
    const notFoundRes = await req(`/lists/${duplicatedListId}`, { method: 'DELETE' });
    assert.equal(notFoundRes.status, 404);
  });

  server.close();
});
