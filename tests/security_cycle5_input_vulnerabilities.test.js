import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { getDatabase } from '../server/db/database.js';
import { seedDatabase } from '../server/db/seed.js';
import { SocketManager } from '../server/ws/socketManager.js';
import { createApiRouter } from '../server/routes/api.js';

test('CICLO 5 DE TESTES (Teste 1/2) — Auditoria e Remediação em Campos e Formulários', async (t) => {
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

  let testUserId = null;
  let testListId = null;

  await t.test('5.1 Injeção de CSS em avatar_color e validação estrita de cores hexadecimais', async () => {
    // Tentativa de CSS Injection / string arbitrária no avatar_color em POST /users
    const maliciousPost = await req('/users', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Usuário Invasor',
        avatar_color: 'red; background: url(javascript:alert(1));'
      })
    });
    assert.equal(maliciousPost.status, 400, 'Deve rejeitar cor não-hexadecimal com HTTP 400');
    assert.match(maliciousPost.data.error, /hexadecimal/i);

    // Criação válida com código hexadecimal correto
    const validPost = await req('/users', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Usuário Legítimo',
        avatar_color: '#3B82F6',
        pin: '1234'
      })
    });
    assert.equal(validPost.status, 201);
    assert.equal(validPost.data.avatar_color, '#3B82F6');
    testUserId = validPost.data.id;

    // Tentativa de injeção no PUT /users/:id
    const maliciousPut = await req(`/users/${testUserId}`, {
      method: 'PUT',
      headers: { 'X-User-Id': testUserId },
      body: JSON.stringify({
        avatar_color: '<script>alert(1)</script>'
      })
    });
    assert.equal(maliciousPut.status, 400, 'Deve rejeitar injeção em PUT /users/:id');
  });

  await t.test('5.2 Validação de tamanho e formato de PIN em Usuários', async () => {
    // PIN com letras
    const resLetters = await req('/users', {
      method: 'POST',
      body: JSON.stringify({ name: 'User Inv', pin: 'abcd' })
    });
    assert.equal(resLetters.status, 400, 'PIN com letras deve ser rejeitado');

    // PIN menor que 4 dígitos
    const resShort = await req('/users', {
      method: 'POST',
      body: JSON.stringify({ name: 'User Inv', pin: '12' })
    });
    assert.equal(resShort.status, 400, 'PIN curto (< 4 dígitos) deve ser rejeitado');

    // PIN excessivamente longo (> 8 dígitos)
    const resLong = await req('/users', {
      method: 'POST',
      body: JSON.stringify({ name: 'User Inv', pin: '123456789012' })
    });
    assert.equal(resLong.status, 400, 'PIN longo (> 8 dígitos) deve ser rejeitado');
  });

  await t.test('5.3 Validação de orçamento negativo e campos vazios em Listas', async () => {
    // Lista com título vazio
    const resEmptyTitle = await req('/lists', {
      method: 'POST',
      headers: { 'X-User-Id': testUserId },
      body: JSON.stringify({ title: '   ', budget_cents: 10000 })
    });
    assert.equal(resEmptyTitle.status, 400, 'Título vazio deve ser rejeitado');

    // Lista com orçamento negativo
    const resNegBudget = await req('/lists', {
      method: 'POST',
      headers: { 'X-User-Id': testUserId },
      body: JSON.stringify({ title: 'Feira Orçamento Inválido', budget_cents: -5000 })
    });
    assert.equal(resNegBudget.status, 400, 'Orçamento negativo deve ser rejeitado com 400');

    // Criação válida
    const resValidList = await req('/lists', {
      method: 'POST',
      headers: { 'X-User-Id': testUserId },
      body: JSON.stringify({ title: 'Feira do Mês', budget_cents: 20000 })
    });
    assert.equal(resValidList.status, 201);
    testListId = resValidList.data.id;

    // Tentativa de injetar orçamento negativo via PUT
    const resPutNegBudget = await req(`/lists/${testListId}`, {
      method: 'PUT',
      headers: { 'X-User-Id': testUserId },
      body: JSON.stringify({ budget_cents: -999 })
    });
    assert.equal(resPutNegBudget.status, 400, 'Orçamento negativo via PUT deve ser rejeitado com 400');
  });

  await t.test('5.4 Integridade de campos e textos longos em Itens e Estabelecimentos', async () => {
    // Estabelecimento com strings excessivas (DoS)
    const hugeNotes = 'A'.repeat(500);
    const resStore = await req('/stores', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Hipermercado Protegido',
        address_notes: hugeNotes
      })
    });
    assert.equal(resStore.status, 201);
    assert.ok(resStore.data.address_notes.length <= 300, 'Notas de endereço devem ser cortadas com segurança');

    // Item adicionado com texto grande em notas e custom_name
    const hugeName = 'Café Especial Selecionado '.repeat(20);
    const resItem = await req(`/lists/${testListId}/items`, {
      method: 'POST',
      headers: { 'X-User-Id': testUserId },
      body: JSON.stringify({
        name: hugeName,
        quantity: 2,
        notes: hugeNotes
      })
    });
    assert.equal(resItem.status, 201);
    assert.ok(resItem.data.item.custom_name.length <= 120, 'Nome do produto customizado deve ser delimitado');
    assert.ok(resItem.data.item.notes.length <= 300, 'Anotação do item deve ser delimitada');
  });

  await new Promise((resolve) => server.close(resolve));
});
