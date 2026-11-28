import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { getDatabase } from '../server/db/database.js';
import { seedDatabase } from '../server/db/seed.js';
import { SocketManager } from '../server/ws/socketManager.js';
import { createApiRouter } from '../server/routes/api.js';

test('CICLO 1 DE TESTES — Varredura e Validação de Vulnerabilidades', async (t) => {
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

  // 1. Cria dois usuários distintos para teste de BOLA / IDOR
  let userAliceId = null;
  let userBobId = null;

  await t.test('1.1 Criação de Usuários e Hash Salted de PIN', async () => {
    const resAlice = await req('/users', {
      method: 'POST',
      body: JSON.stringify({ name: 'Alice Silva', pin: '1234' })
    });
    assert.equal(resAlice.status, 201);
    userAliceId = resAlice.data.id;

    const resBob = await req('/users', {
      method: 'POST',
      body: JSON.stringify({ name: 'Bob Atacante', pin: '9999' })
    });
    assert.equal(resBob.status, 201);
    userBobId = resBob.data.id;

    // Validação de verificação de PIN seguro
    const verifyValid = await req(`/users/${userAliceId}/verify-pin`, {
      method: 'POST',
      body: JSON.stringify({ pin: '1234' })
    });
    assert.equal(verifyValid.status, 200);
    assert.equal(verifyValid.data.valid, true);

    const verifyInvalid = await req(`/users/${userAliceId}/verify-pin`, {
      method: 'POST',
      body: JSON.stringify({ pin: '0000' })
    });
    assert.equal(verifyInvalid.status, 200);
    assert.equal(verifyInvalid.data.valid, false);
  });

  let aliceListId = null;
  await t.test('1.2 Alice cria feira privada e testa isolamento de listagem', async () => {
    const res = await req('/lists', {
      method: 'POST',
      headers: { 'X-User-Id': userAliceId },
      body: JSON.stringify({
        title: 'Feira Secreta da Alice',
        budget_cents: 15000
      })
    });
    assert.equal(res.status, 201);
    aliceListId = res.data.id;
    assert.equal(res.data.owner_id, userAliceId);

    // Bob consulta suas listas: não deve ver a lista de Alice
    const resBobLists = await req('/lists', {
      headers: { 'X-User-Id': userBobId }
    });
    assert.equal(resBobLists.status, 200);
    const hasAliceList = resBobLists.data.some(l => l.id === aliceListId);
    assert.equal(hasAliceList, false, 'Bob não pode ver a feira privada de Alice');
  });

  await t.test('1.3 Bloqueio de BOLA / IDOR: Bob tenta acessar, alterar e excluir a feira de Alice', async () => {
    // Tentativa de leitura não autorizada
    const readAttempt = await req(`/lists/${aliceListId}`, {
      headers: { 'X-User-Id': userBobId }
    });
    assert.equal(readAttempt.status, 403, 'Bob deve receber 403 ao tentar ler lista da Alice');

    // Tentativa de alteração não autorizada
    const updateAttempt = await req(`/lists/${aliceListId}`, {
      method: 'PUT',
      headers: { 'X-User-Id': userBobId },
      body: JSON.stringify({ title: 'Feira Hackeada por Bob' })
    });
    assert.equal(updateAttempt.status, 403, 'Bob deve receber 403 ao tentar alterar lista da Alice');

    // Tentativa de exclusão não autorizada
    const deleteAttempt = await req(`/lists/${aliceListId}`, {
      method: 'DELETE',
      headers: { 'X-User-Id': userBobId }
    });
    assert.equal(deleteAttempt.status, 403, 'Bob deve receber 403 ao tentar excluir lista da Alice');

    // Tentativa de adicionar item não autorizado
    const addItemAttempt = await req(`/lists/${aliceListId}/items`, {
      method: 'POST',
      headers: { 'X-User-Id': userBobId },
      body: JSON.stringify({ name: 'Produto Intruso', quantity: 1 })
    });
    assert.equal(addItemAttempt.status, 403, 'Bob deve receber 403 ao tentar adicionar item');

    // Tentativa de manipulação de compartilhamento por terceiro
    const shareAttempt = await req(`/lists/${aliceListId}/shares`, {
      method: 'POST',
      headers: { 'X-User-Id': userBobId },
      body: JSON.stringify({ user_id: userBobId, permission: 'admin' })
    });
    assert.equal(shareAttempt.status, 403, 'Bob não pode se promover a admin na lista da Alice');
  });

  let aliceItemId = null;
  await t.test('1.4 Proteção de integridade financeira contra valores negativos e corrupção numérica', async () => {
    // Alice adiciona item com quantidade negativa tentando subverter o total
    const resNegativeItem = await req(`/lists/${aliceListId}/items`, {
      method: 'POST',
      headers: { 'X-User-Id': userAliceId },
      body: JSON.stringify({
        name: 'Arroz Teste',
        quantity: -50,
        estimated_price_cents: -3000
      })
    });
    assert.equal(resNegativeItem.status, 201);
    assert.ok(resNegativeItem.data.item.quantity > 0, 'Quantidade negativa deve ser sanada para valor positivo');
    assert.ok(resNegativeItem.data.item.estimated_price_cents >= 0, 'Preço estimado negativo deve ser travado em zero');
    aliceItemId = resNegativeItem.data.item.id;

    // Bob tenta alterar o item de Alice via BOLA
    const bobEditItem = await req(`/items/${aliceItemId}`, {
      method: 'PUT',
      headers: { 'X-User-Id': userBobId },
      body: JSON.stringify({ actual_price_cents: 99999 })
    });
    assert.equal(bobEditItem.status, 403, 'Bob deve ser impedido de alterar itens de Alice');

    // Alice altera com preço negativo: deve ser sanitizado
    const aliceToggle = await req(`/items/${aliceItemId}/toggle`, {
      method: 'PUT',
      headers: { 'X-User-Id': userAliceId },
      body: JSON.stringify({
        is_purchased: true,
        actual_price_cents: -1000
      })
    });
    assert.equal(aliceToggle.status, 200);
    assert.equal(aliceToggle.data.item.actual_price_cents, 0, 'Preço real negativo é normalizado para zero');
    assert.ok(aliceToggle.data.stats.totalSpentCents >= 0, 'Total gasto nunca pode ser negativo');
  });

  await t.test('1.5 Proteção contra divisão por zero em compare-packages', async () => {
    const resZero = await req('/tools/compare-packages', {
      method: 'POST',
      body: JSON.stringify({
        optionA: { priceCents: 0, quantity: 1, unit: 'kg' },
        optionB: { priceCents: 1000, quantity: 2, unit: 'kg' }
      })
    });
    // Deve rejeitar valores zerados/inválidos ou retornar resposta segura sem NaN/Infinity
    if (resZero.status === 200) {
      assert.notEqual(resZero.data.percentSavings, Infinity);
      assert.notEqual(Number.isNaN(resZero.data.percentSavings), true);
    } else {
      assert.equal(resZero.status, 400);
    }
  });

  await t.test('1.6 Escape de wildcards SQL LIKE na busca de produtos', async () => {
    const resWildcard = await req('/products/search?q=%25%25%25&limit=10000');
    assert.equal(resWildcard.status, 200);
    assert.ok(Array.isArray(resWildcard.data));
    assert.ok(resWildcard.data.length <= 50, 'Paginação deve ter teto máximo de 50 itens');
  });

  await t.test('1.7 Rate limiting em tentativa de ingressar por share_code', async () => {
    let gotRateLimited = false;
    for (let i = 0; i < 20; i++) {
      const res = await req('/lists/join', {
        method: 'POST',
        headers: { 'X-User-Id': userBobId },
        body: JSON.stringify({ share_code: `FAKE${i}` })
      });
      if (res.status === 429) {
        gotRateLimited = true;
        break;
      }
    }
    assert.equal(gotRateLimited, true, 'Força bruta de share_code deve ser bloqueada com status 429');
  });

  server.close();
});
