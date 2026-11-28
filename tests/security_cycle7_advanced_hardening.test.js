import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { getDatabase } from '../server/db/database.js';
import { seedDatabase } from '../server/db/seed.js';
import { SocketManager } from '../server/ws/socketManager.js';
import { createApiRouter } from '../server/routes/api.js';
import { ListRepository } from '../server/repositories/listRepository.js';
import { PriceRepository } from '../server/repositories/priceRepository.js';

test('CICLO 7 DE TESTES — Auditoria Avançada de Segurança e Blindagem Multicamadas', async (t) => {
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

  // 1. Cria dois perfis: Alice e Bob
  const { data: userAlice } = await req('/users', {
    method: 'POST',
    body: JSON.stringify({ name: 'Alice Proprietária' })
  });

  const { data: userBob } = await req('/users', {
    method: 'POST',
    body: JSON.stringify({ name: 'Bob Alvo' })
  });

  await t.test('7.1 Bloqueio de IDOR e Imunidade contra Bypass de usr_default em PUT /users/:id', async () => {
    // Tentativa 1: Eve tenta alterar Bob passando explicitamente seu ID (deve tomar 403)
    const resEve = await req(`/users/${userBob.id}`, {
      method: 'PUT',
      headers: { 'X-User-Id': userAlice.id },
      body: JSON.stringify({ name: 'Nome Injetado' })
    });
    assert.equal(resEve.status, 403, 'Usuário externo não pode alterar perfil de terceiro');

    // Tentativa 2: Atacante tenta passar X-User-Id: usr_default para burlar checagem (deve tomar 403)
    const resSpoofedDefault = await req(`/users/${userBob.id}`, {
      method: 'PUT',
      headers: { 'X-User-Id': 'usr_default' },
      body: JSON.stringify({ name: 'Nome Injetado via usr_default' })
    });
    assert.equal(resSpoofedDefault.status, 403, 'Spoofing de usr_default contra Bob deve ser rejeitado com 403');

    // Bob alterando seu próprio perfil com X-User-Id legítimo é aprovado com 200
    const resBobSelf = await req(`/users/${userBob.id}`, {
      method: 'PUT',
      headers: { 'X-User-Id': userBob.id },
      body: JSON.stringify({ name: 'Bob Atualizado' })
    });
    assert.equal(resBobSelf.status, 200);
    assert.equal(resBobSelf.data.name, 'Bob Atualizado');
  });

  await t.test('7.2 Isolamento Estrito Cross-Tenant no Comparador Delta Automático (PriceRepository)', async () => {
    const priceRepo = new PriceRepository(db);

    // Alice cria uma feira com itens e finaliza
    const { data: aliceList } = await req('/lists', {
      method: 'POST',
      headers: { 'X-User-Id': userAlice.id },
      body: JSON.stringify({ title: 'Feira Secreta Alice' })
    });
    const { data: aliceItem } = await req(`/lists/${aliceList.id}/items`, {
      method: 'POST',
      headers: { 'X-User-Id': userAlice.id },
      body: JSON.stringify({ name: 'Salmão Fresco', estimated_price_cents: 8000, actual_price_cents: 8000, quantity: 1, unit: 'kg' })
    });
    await req(`/items/${aliceItem.item.id}/toggle`, {
      method: 'PUT',
      headers: { 'X-User-Id': userAlice.id },
      body: JSON.stringify({ is_purchased: true, actual_price_cents: 8000 })
    });
    const aliceFinish = await req(`/lists/${aliceList.id}/finish`, {
      method: 'POST',
      headers: { 'X-User-Id': userAlice.id },
      body: JSON.stringify({})
    });
    assert.equal(aliceFinish.status, 200);

    // Bob cria sua feira própria depois e finaliza
    const { data: bobList } = await req('/lists', {
      method: 'POST',
      headers: { 'X-User-Id': userBob.id },
      body: JSON.stringify({ title: 'Primeira Feira Bob' })
    });
    const { data: bobItem } = await req(`/lists/${bobList.id}/items`, {
      method: 'POST',
      headers: { 'X-User-Id': userBob.id },
      body: JSON.stringify({ name: 'Pão de Forma', estimated_price_cents: 900, actual_price_cents: 900, quantity: 1, unit: 'un' })
    });
    await req(`/items/${bobItem.item.id}/toggle`, {
      method: 'PUT',
      headers: { 'X-User-Id': userBob.id },
      body: JSON.stringify({ is_purchased: true, actual_price_cents: 900 })
    });
    const bobFinish = await req(`/lists/${bobList.id}/finish`, {
      method: 'POST',
      headers: { 'X-User-Id': userBob.id },
      body: JSON.stringify({})
    });
    assert.equal(bobFinish.status, 200);

    // Bob solicita comparação automática (sem previousId) da sua primeira feira
    const bobComparison = priceRepo.compareShoppingLists(bobFinish.data.id, null);
    assert.ok(bobComparison);
    // Como esta é a PRIMEIRA compra de Bob, NÃO deve vazar o salmão da Alice como "compra anterior"!
    assert.equal(bobComparison.hasComparison, false, 'Não deve comparar feira de Bob com feira anterior de Alice');
    assert.match(bobComparison.message, /primeira compra/i);
  });

  await t.test('7.3 Validação de Integridade Referencial contra Crash 500 (Foreign Keys)', async () => {
    // 1. Categoria inexistente em POST /products deve retornar 400, não 500
    const prodRes = await req('/products', {
      method: 'POST',
      body: JSON.stringify({ name: 'Produto Fantasma', category_id: 'cat_inexistente_999' })
    });
    assert.equal(prodRes.status, 400, 'Categoria inválida deve retornar 400 Bad Request');
    assert.match(prodRes.data.error, /Categoria informada não existe/);

    // 2. Estabelecimento inexistente em POST /lists deve retornar 400, não 500
    const listRes = await req('/lists', {
      method: 'POST',
      headers: { 'X-User-Id': userBob.id },
      body: JSON.stringify({ title: 'Feira com Loja Falsa', store_id: 'store_fantasma_999' })
    });
    assert.equal(listRes.status, 400, 'Estabelecimento inválido em POST /lists deve retornar 400');
    assert.match(listRes.data.error, /Estabelecimento informado não existe/);

    // 3. Estabelecimento inexistente em PUT /lists/:id deve retornar 400
    const validList = await req('/lists', {
      method: 'POST',
      headers: { 'X-User-Id': userBob.id },
      body: JSON.stringify({ title: 'Feira Bob Válida' })
    });
    assert.equal(validList.status, 201);

    const updateRes = await req(`/lists/${validList.data.id}`, {
      method: 'PUT',
      headers: { 'X-User-Id': userBob.id },
      body: JSON.stringify({ store_id: 'store_fantasma_999' })
    });
    assert.equal(updateRes.status, 400, 'Estabelecimento inválido em PUT /lists/:id deve retornar 400');

    // 4. Categoria inexistente em POST /lists/:id/items deve retornar 400
    const itemRes = await req(`/lists/${validList.data.id}/items`, {
      method: 'POST',
      headers: { 'X-User-Id': userBob.id },
      body: JSON.stringify({ name: 'Item Invalido', category_id: 'cat_fantasma_999' })
    });
    assert.equal(itemRes.status, 400, 'Categoria inválida em itens deve retornar 400');
  });

  await t.test('7.4 Sanitização Anti-Prototype-Pollution no ItemMutationQueue', async () => {
    const listRepo = new ListRepository(db);
    const validList = await req('/lists', {
      method: 'POST',
      headers: { 'X-User-Id': userBob.id },
      body: JSON.stringify({ title: 'Feira Teste Fila' })
    });
    const { data: itemData } = await req(`/lists/${validList.data.id}/items`, {
      method: 'POST',
      headers: { 'X-User-Id': userBob.id },
      body: JSON.stringify({ name: 'Item Para Mutacao', quantity: 2 })
    });
    const itemId = itemData.item.id;

    // Envia payload malicioso com __proto__ e constructor
    const maliciousPayload = JSON.parse('{"quantity": 5, "__proto__": {"polluted": true}, "constructor": {"prototype": {"polluted": true}}}');
    const updated = await listRepo.atomicUpdateItem(itemId, maliciousPayload);

    assert.equal(updated.quantity, 5);
    // Verifica que o protótipo global de Object NÃO foi poluído
    assert.equal(({}).polluted, undefined, 'Object.prototype não deve ser poluído');
  });

  await new Promise((resolve) => server.close(resolve));
});
