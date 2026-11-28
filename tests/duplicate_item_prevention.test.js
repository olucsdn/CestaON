import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { getDatabase } from '../server/db/database.js';
import { seedDatabase } from '../server/db/seed.js';
import { SocketManager } from '../server/ws/socketManager.js';
import { createApiRouter } from '../server/routes/api.js';
import { ListRepository } from '../server/repositories/listRepository.js';
import { ProductRepository } from '../server/repositories/productRepository.js';

test('BLOQUEIO DE DUPLICATAS — Proibição de Adicionar o Mesmo Produto na Mesma Feira', async (t) => {
  const db = getDatabase(':memory:');
  seedDatabase(db);

  const listRepo = new ListRepository(db);
  const productRepo = new ProductRepository(db);

  const app = express();
  app.use(express.json());
  const server = http.createServer(app);
  const socketManager = new SocketManager(server);
  app.use('/api', createApiRouter(db, socketManager));

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api`;

  async function req(path, options = {}) {
    const res = await fetch(`${baseUrl}${path}`, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options
    });
    const data = await res.json();
    return { status: res.status, data };
  }

  t.after(() => {
    server.close();
  });

  // Criação de lista de testes
  const { data: listA } = await req('/lists', {
    method: 'POST',
    body: JSON.stringify({ title: 'Feira Principal' })
  });
  const listIdA = listA.id;

  const { data: listB } = await req('/lists', {
    method: 'POST',
    body: JSON.stringify({ title: 'Segunda Feira' })
  });
  const listIdB = listB.id;

  await t.test('1. Permite adicionar produto pela primeira vez na feira', async () => {
    const res = await req(`/lists/${listIdA}/items`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'Peça de Carne Alcatra',
        quantity: 1.5,
        unit: 'kg',
        estimated_price_cents: 4500
      })
    });

    assert.equal(res.status, 201, 'Primeira adição deve retornar 201');
    assert.equal(res.data.item.custom_name, 'Peça de Carne Alcatra');
  });

  await t.test('2. Bloqueia adicionar exatamente o mesmo produto por nome na mesma feira', async () => {
    const res = await req(`/lists/${listIdA}/items`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'Peça de Carne Alcatra',
        quantity: 2,
        unit: 'kg'
      })
    });

    assert.equal(res.status, 400, 'Segunda adição do mesmo produto deve retornar HTTP 400');
    assert.match(res.data.error, /já foi adicionado a esta feira/i);
  });

  await t.test('3. Bloqueia adicionar o mesmo produto com variações de caixa e espaços', async () => {
    const res = await req(`/lists/${listIdA}/items`, {
      method: 'POST',
      body: JSON.stringify({
        name: '  peça de carne alcatra  ',
        quantity: 1,
        unit: 'kg'
      })
    });

    assert.equal(res.status, 400, 'Adição com case diferente deve ser bloqueada com HTTP 400');
    assert.match(res.data.error, /já foi adicionado a esta feira/i);
  });

  await t.test('4. Bloqueia adicionar o mesmo produto via product_id (favorito/catálogo)', async () => {
    const favoriteCarne = productRepo.findByName('Peito de Frango');
    assert.ok(favoriteCarne, 'Produto inicial deve existir');

    // 1ª adição via product_id
    const res1 = await req(`/lists/${listIdA}/items`, {
      method: 'POST',
      body: JSON.stringify({
        product_id: favoriteCarne.id,
        quantity: 1,
        unit: 'kg'
      })
    });
    assert.equal(res1.status, 201);

    // 2ª tentativa de adição do mesmo product_id
    const res2 = await req(`/lists/${listIdA}/items`, {
      method: 'POST',
      body: JSON.stringify({
        product_id: favoriteCarne.id,
        quantity: 2,
        unit: 'kg'
      })
    });
    assert.equal(res2.status, 400);
    assert.match(res2.data.error, /já foi adicionado a esta feira/i);

    // 3ª tentativa passando o nome correspondente ao product_id
    const res3 = await req(`/lists/${listIdA}/items`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'Peito de Frango',
        quantity: 1
      })
    });
    assert.equal(res3.status, 400);
    assert.match(res3.data.error, /já foi adicionado a esta feira/i);
  });

  await t.test('5. Permite adicionar o mesmo produto em OUTRA feira diferente (isolamento)', async () => {
    const res = await req(`/lists/${listIdB}/items`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'Peça de Carne Alcatra',
        quantity: 1,
        unit: 'kg'
      })
    });

    assert.equal(res.status, 201, 'Mesmo produto em feira distinta deve ser aceito');
  });

  await t.test('6. Permite readicionar o produto após exclusão do item anterior da feira', async () => {
    // Busca os itens da listA
    const getListRes = await req(`/lists/${listIdA}`);
    const itemToDelete = getListRes.data.items.find(i => i.custom_name === 'Peça de Carne Alcatra');
    assert.ok(itemToDelete, 'Item deve existir antes de deletar');

    // Exclui o item
    const delRes = await req(`/items/${itemToDelete.id}`, { method: 'DELETE' });
    assert.equal(delRes.status, 200);

    // Readiciona o produto
    const reAddRes = await req(`/lists/${listIdA}/items`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'Peça de Carne Alcatra',
        quantity: 1.8,
        unit: 'kg'
      })
    });
    assert.equal(reAddRes.status, 201, 'Readicionar produto após exclusão deve ser permitido com 201');
  });

  await t.test('7. Bloqueia renomear item para nome de outro produto já existente na feira (PUT /api/items/:id)', async () => {
    // Adiciona um segundo item diferente
    const resBife = await req(`/lists/${listIdA}/items`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'Bife de Patinho',
        quantity: 1,
        unit: 'kg'
      })
    });
    assert.equal(resBife.status, 201);
    const bifeItemId = resBife.data.item.id;

    // Tenta renomear "Bife de Patinho" para "Peça de Carne Alcatra" (que já existe na mesma lista)
    const renameRes = await req(`/items/${bifeItemId}`, {
      method: 'PUT',
      body: JSON.stringify({
        custom_name: 'Peça de Carne Alcatra'
      })
    });
    assert.equal(renameRes.status, 400, 'Renomear para item duplicado deve retornar 400');
    assert.match(renameRes.data.error, /Já existe outro produto com este nome nesta feira/i);
  });

  await t.test('8. ListRepository.addItem rejeita duplicatas diretamente com exceção', () => {
    const tomate = productRepo.findByName('Tomate');
    assert.ok(tomate);

    // Primeira adição via repository
    const item1 = listRepo.addItem({
      list_id: listIdA,
      product_id: tomate.id,
      category_id: tomate.category_id,
      quantity: 1,
      unit: 'kg'
    });
    assert.ok(item1.id);

    // Segunda adição do mesmo produto direto no repo deve lançar erro
    assert.throws(
      () => {
        listRepo.addItem({
          list_id: listIdA,
          product_id: tomate.id,
          category_id: tomate.category_id,
          quantity: 2,
          unit: 'kg'
        });
      },
      /já foi adicionado a esta feira/i
    );
  });

  await t.test('9. Duplicação de feira preserva unicidade dos itens sem criar duplicatas', async () => {
    const dupRes = await req(`/lists/${listIdA}/duplicate`, {
      method: 'POST',
      body: JSON.stringify({ title: 'Feira Duplicada' })
    });
    assert.equal(dupRes.status, 201);

    const dupList = dupRes.data;
    const productIds = dupList.items.map(i => i.product_id);
    const uniqueProductIds = new Set(productIds);
    assert.equal(productIds.length, uniqueProductIds.size, 'Lista duplicada não pode conter itens duplicados');
  });
});
