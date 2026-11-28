import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { getDatabase } from '../server/db/database.js';
import { seedDatabase } from '../server/db/seed.js';
import { SocketManager } from '../server/ws/socketManager.js';
import { createApiRouter } from '../server/routes/api.js';
import { ListRepository, ItemMutationQueue } from '../server/repositories/listRepository.js';
import { ProductRepository } from '../server/repositories/productRepository.js';

test('FILA ATÔMICA COM MERGING POR ITEM — Prevenção de Sobrescrita Concorrente', async (t) => {
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

  // Cria usuário e feira para os testes
  const { data: user } = await req('/users', {
    method: 'POST',
    body: JSON.stringify({ name: 'Família Concorrente' })
  });

  const { data: list } = await req('/lists', {
    method: 'POST',
    headers: { 'X-User-Id': user.id },
    body: JSON.stringify({ title: 'Feira Concorrente Teste', budget_cents: 30000 })
  });

  await t.test('1. Concorrência Real com Merging de Campos Complementares (Sem Perda de Dados)', async () => {
    // 1. Cria um item inicial
    const { data: addRes } = await req(`/lists/${list.id}/items`, {
      method: 'POST',
      headers: { 'X-User-Id': user.id },
      body: JSON.stringify({
        name: 'Tomate Italiano',
        quantity: 1,
        unit: 'kg',
        estimated_price_cents: 800
      })
    });
    const itemId = addRes.item.id;
    assert.ok(itemId);

    // 2. Dispara 4 mutações simultâneas concorrentes sobre o MESMO item alterando campos diferentes
    const [p1, p2, p3, p4] = await Promise.all([
      req(`/items/${itemId}`, {
        method: 'PUT',
        headers: { 'X-User-Id': user.id },
        body: JSON.stringify({ quantity: 4.5 })
      }),
      req(`/items/${itemId}`, {
        method: 'PUT',
        headers: { 'X-User-Id': user.id },
        body: JSON.stringify({ custom_name: 'Tomate Italiano Orgânico' })
      }),
      req(`/items/${itemId}`, {
        method: 'PUT',
        headers: { 'X-User-Id': user.id },
        body: JSON.stringify({ notes: 'Escolher bem maduros' })
      }),
      req(`/items/${itemId}/toggle`, {
        method: 'PUT',
        headers: { 'X-User-Id': user.id },
        body: JSON.stringify({ is_purchased: true, actual_price_cents: 1450 })
      })
    ]);

    // Todas as 4 requisições devem retornar sucesso (HTTP 200)
    assert.equal(p1.status, 200);
    assert.equal(p2.status, 200);
    assert.equal(p3.status, 200);
    assert.equal(p4.status, 200);

    // 3. Consulta o estado persistido no banco de dados
    const { data: listFresh } = await req(`/lists/${list.id}`, {
      headers: { 'X-User-Id': user.id }
    });
    const finalItem = listFresh.items.find((i) => i.id === itemId);
    assert.ok(finalItem, 'Item deve existir na lista');

    // Validação de Merging Atômico: TODOS os 4 campos foram preservados sem nenhuma sobrescrita!
    assert.equal(finalItem.quantity, 4.5, 'Quantidade alterada pelo Worker 1 deve ser preservada');
    assert.equal(finalItem.custom_name, 'Tomate Italiano Orgânico', 'Nome alterado pelo Worker 2 deve ser preservado');
    assert.equal(finalItem.notes, 'Escolher bem maduros', 'Notas alteradas pelo Worker 3 devem ser preservadas');
    assert.equal(finalItem.is_purchased, 1, 'Status de compra do Worker 4 deve ser preservado');
    assert.equal(finalItem.actual_price_cents, 1450, 'Preço real do Worker 4 deve ser preservado');
    assert.ok(finalItem.version >= 2, 'Contador de versão deve ter sido incrementado');
  });

  await t.test('2. Merging na Fila da ItemMutationQueue e Limpeza de Memória', async () => {
    const listRepo = new ListRepository(db);
    const productRepo = new ProductRepository(db);
    const queue = new ItemMutationQueue(listRepo);

    const bananaProd = productRepo.getOrCreate('Banana Nanica', 'cat_hortifruti', 'kg');

    // Adiciona item para teste unitário de fila
    const item = listRepo.addItem({
      list_id: list.id,
      product_id: bananaProd.id,
      category_id: bananaProd.category_id,
      quantity: 1,
      unit: 'kg'
    });

    // Enfileira 3 mutações instantâneas
    const pA = queue.enqueue(item.id, { quantity: 3 });
    const pB = queue.enqueue(item.id, { estimated_price_cents: 950 });
    const pC = queue.enqueue(item.id, { notes: 'Banana Prata Grande' });

    const [resA, resB, resC] = await Promise.all([pA, pB, pC]);

    // Todas as promessas devem resolver com o estado atualizado
    assert.ok(resA);
    assert.ok(resB);
    assert.ok(resC);

    const fresh = listRepo.getItemById(item.id);
    assert.equal(fresh.quantity, 3);
    assert.equal(fresh.estimated_price_cents, 950);
    assert.equal(fresh.notes, 'Banana Prata Grande');

    // Aguarda microtasks e garante que a fila em memória foi completamente desalocada
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(queue.getActiveQueuesCount(), 0, 'A fila deve ser limpa do Map após o término');
  });

  await t.test('3. Concorrência Paralela Entre Itens Distintos da Mesma Feira', async () => {
    // Cria dois itens distintos
    const { data: res1 } = await req(`/lists/${list.id}/items`, {
      method: 'POST',
      headers: { 'X-User-Id': user.id },
      body: JSON.stringify({ name: 'Leite Desnatado', quantity: 2, unit: 'L' })
    });
    const { data: res2 } = await req(`/lists/${list.id}/items`, {
      method: 'POST',
      headers: { 'X-User-Id': user.id },
      body: JSON.stringify({ name: 'Pão Francês', quantity: 6, unit: 'un' })
    });

    const item1Id = res1.item.id;
    const item2Id = res2.item.id;

    // Dispara alterações simultâneas em itens diferentes
    const [upd1, upd2] = await Promise.all([
      req(`/items/${item1Id}`, {
        method: 'PUT',
        headers: { 'X-User-Id': user.id },
        body: JSON.stringify({ quantity: 4, notes: 'Sem lactose' })
      }),
      req(`/items/${item2Id}/toggle`, {
        method: 'PUT',
        headers: { 'X-User-Id': user.id },
        body: JSON.stringify({ is_purchased: true, actual_price_cents: 600 })
      })
    ]);

    assert.equal(upd1.status, 200);
    assert.equal(upd2.status, 200);

    const { data: listAfter } = await req(`/lists/${list.id}`, {
      headers: { 'X-User-Id': user.id }
    });

    const it1 = listAfter.items.find((i) => i.id === item1Id);
    const it2 = listAfter.items.find((i) => i.id === item2Id);

    assert.equal(it1.quantity, 4);
    assert.equal(it1.notes, 'Sem lactose');
    assert.equal(it2.is_purchased, 1);
    assert.equal(it2.actual_price_cents, 600);
  });

  await new Promise((resolve) => server.close(resolve));
});
