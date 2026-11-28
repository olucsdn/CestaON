import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { getDatabase } from '../server/db/database.js';
import { seedDatabase } from '../server/db/seed.js';
import { SocketManager } from '../server/ws/socketManager.js';
import { createApiRouter } from '../server/routes/api.js';

test('CICLO 3 DE TESTES (Teste 1/2 de Segurança) — Brute-Force, IDOR em Perfis e Validação Numérica', async (t) => {
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

  // 1. Cria usuário com PIN configurado
  const { data: userAlice } = await req('/users', {
    method: 'POST',
    body: JSON.stringify({ name: 'Alice Defesa', pin: '4321' })
  });
  assert.ok(userAlice?.id);

  // 2. Cria usuário atacante (Bob)
  const { data: userBob } = await req('/users', {
    method: 'POST',
    body: JSON.stringify({ name: 'Bob Invasor' })
  });
  assert.ok(userBob?.id);

  await t.test('3.1 Rate Limiting contra Força Bruta no PIN (HTTP 429)', async () => {
    // 5 tentativas erradas seguidas
    for (let i = 0; i < 5; i++) {
      const resFail = await req(`/users/${userAlice.id}/verify-pin`, {
        method: 'POST',
        body: JSON.stringify({ pin: `000${i}` })
      });
      assert.equal(resFail.status, 200);
      assert.equal(resFail.data.valid, false);
    }

    // 6ª tentativa deve ser bloqueada por rate limit (429 Too Many Requests)
    const resBlocked = await req(`/users/${userAlice.id}/verify-pin`, {
      method: 'POST',
      body: JSON.stringify({ pin: '4321' })
    });
    assert.equal(resBlocked.status, 429, 'Deveria retornar 429 após 5 tentativas falhas de PIN');
    assert.ok(resBlocked.data.error.includes('Muitas tentativas'));
  });

  await t.test('3.2 Bloqueio de IDOR e Account Takeover em PUT /users/:id', async () => {
    // Bob tenta alterar o nome e sobrescrever o PIN de Alice sem ser Alice
    const resHacked = await req(`/users/${userAlice.id}`, {
      method: 'PUT',
      headers: { 'X-User-Id': userBob.id },
      body: JSON.stringify({ name: 'Conta Sequestrada', pin: '9999' })
    });
    assert.equal(resHacked.status, 403, 'Usuário de outro perfil não pode alterar dados alheios');

    // Alice tenta alterar seu próprio PIN sem fornecer o PIN atual (current_pin)
    const resNoCurrentPin = await req(`/users/${userAlice.id}`, {
      method: 'PUT',
      headers: { 'X-User-Id': userAlice.id },
      body: JSON.stringify({ pin: '9999' })
    });
    assert.equal(resNoCurrentPin.status, 400, 'Redefinição de PIN exige validação do PIN atual');

    // Alice fornece PIN atual incorreto
    const resWrongCurrent = await req(`/users/${userAlice.id}`, {
      method: 'PUT',
      headers: { 'X-User-Id': userAlice.id },
      body: JSON.stringify({ pin: '9999', current_pin: '0000' })
    });
    assert.equal(resWrongCurrent.status, 403, 'PIN atual incorreto deve rejeitar a alteração');
  });

  await t.test('3.3 Subversão Numérica em POST /tools/compare-packages', async () => {
    // Teste com Infinity
    const resInfinity = await req('/tools/compare-packages', {
      method: 'POST',
      body: JSON.stringify({
        price_a: 10,
        quantity_a: Infinity,
        price_b: 20,
        quantity_b: 2
      })
    });
    assert.equal(resInfinity.status, 400, 'Valores não finitos (Infinity) devem ser rejeitados');

    // Teste com números negativos
    const resNegative = await req('/tools/compare-packages', {
      method: 'POST',
      body: JSON.stringify({
        price_a: -10,
        quantity_a: 1,
        price_b: 20,
        quantity_b: 2
      })
    });
    assert.equal(resNegative.status, 400, 'Valores negativos devem ser rejeitados');

    // Teste com números excessivamente gigantes (anti-overflow)
    const resExcessive = await req('/tools/compare-packages', {
      method: 'POST',
      body: JSON.stringify({
        price_a: 10000000000,
        quantity_a: 1,
        price_b: 20,
        quantity_b: 2
      })
    });
    assert.equal(resExcessive.status, 400, 'Valores astronômicos devem ser rejeitados');
  });

  await t.test('3.4 Sanitização Robusta em POST /stores', async () => {
    // Cadastro legítimo com anotações tratadas
    const resValidStore = await req('/stores', {
      method: 'POST',
      body: JSON.stringify({
        name: ' Supermercado Seguro ',
        address_notes: ' Entrada B '
      })
    });
    assert.equal(resValidStore.status, 201);
    assert.equal(resValidStore.data.name, 'Supermercado Seguro');
    assert.equal(resValidStore.data.address_notes, 'Entrada B');

    // Rejeição de nome vazio
    const resEmptyName = await req('/stores', {
      method: 'POST',
      body: JSON.stringify({ name: '   ' })
    });
    assert.equal(resEmptyName.status, 400);
  });

  await new Promise((resolve) => server.close(resolve));
});
