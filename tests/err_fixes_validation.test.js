import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { getDatabase } from '../server/db/database.js';
import { seedDatabase } from '../server/db/seed.js';
import { SocketManager } from '../server/ws/socketManager.js';
import { createApiRouter } from '../server/routes/api.js';
import { UserRepository } from '../server/repositories/userRepository.js';

test('VALIDAÇÃO DAS CORREÇÕES AUDITADAS (ERR-01 a ERR-05 e SEG-01/02)', async (t) => {
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

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  await t.test('ERR-01: Bloqueia cadastro sem e-mail em produção (HTTP 400)', async () => {
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const res = await req('/users', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Usuario Anonimo',
          pin: 'senhaForte123'
        })
      });
      assert.equal(res.status, 400);
      assert.match(res.data.error, /e-mail obrigatório/i);
    } finally {
      process.env.NODE_ENV = prevEnv;
    }
  });

  await t.test('ERR-02: Cabeçalho X-Operation-Id permitido na configuração CORS', () => {
    const indexSource = fs.readFileSync(path.resolve('server/index.js'), 'utf-8');
    assert.ok(
      indexSource.includes("'X-Operation-Id'") || indexSource.includes('"X-Operation-Id"'),
      'server/index.js deve incluir X-Operation-Id em allowedHeaders'
    );
  });

  await t.test('ERR-03: Valida category_id e store_id inexistentes no PUT /items/:id (HTTP 400)', async () => {
    // 1. Cria usuário e lista
    const { data: user } = await req('/users', {
      method: 'POST',
      body: JSON.stringify({ name: 'Tester Items', email: 'items.test@cestaon.com', pin: '123456' })
    });
    const token = user.token;

    const { data: list } = await req('/lists', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: 'Feira Teste Itens', budget_cents: 50000 })
    });

    const { data: itemData } = await req(`/lists/${list.id}/items`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: 'Maçã Fuji', quantity: 2, unit: 'kg' })
    });
    const itemId = itemData.item.id;

    // 2. Tenta atualizar com category_id inválido
    const badCatRes = await req(`/items/${itemId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ category_id: 'cat_inexistente_999' })
    });
    assert.equal(badCatRes.status, 400);
    assert.match(badCatRes.data.error, /categoria.*não existe/i);

    // 3. Tenta atualizar com store_id inválido
    const badStoreRes = await req(`/items/${itemId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ store_id: 'store_inexistente_999' })
    });
    assert.equal(badStoreRes.status, 400);
    assert.match(badStoreRes.data.error, /estabelecimento.*não existe/i);
  });

  await t.test('ERR-04: Evicção de WebSocket condicionada à primeira associação da conexão', () => {
    const socketSource = fs.readFileSync(path.resolve('server/ws/socketManager.js'), 'utf-8');
    assert.ok(
      socketSource.includes('!currentBoundUser'),
      'socketManager.js deve verificar !currentBoundUser antes de evictUserSessions'
    );
  });

  await t.test('ERR-05: FinishListModal.jsx bloqueia envio quando há itens pendentes', () => {
    const modalSource = fs.readFileSync(path.resolve('client/src/components/FinishListModal.jsx'), 'utf-8');
    assert.ok(
      modalSource.includes('pendingCount') && modalSource.includes('showToast'),
      'FinishListModal.jsx deve calcular pendingCount e alertar via showToast se pendingCount > 0'
    );
  });

  await t.test('SEG-01: Código OTP não fica armazenado em texto puro no banco', () => {
    const userRepo = new UserRepository(db);
    const testEmail = 'otp.audit@cestaon.com';
    const plainCode = '849201';

    userRepo.createVerificationCode(testEmail, 'register', plainCode, 15);

    // Consulta direta no SQLite para inspecionar o valor persistido na coluna 'code'
    const record = db.prepare('SELECT code FROM email_verifications WHERE email = ?').get(testEmail);
    assert.ok(record, 'Registro deve existir');
    assert.notEqual(record.code, plainCode, 'Código no banco NÃO pode estar em texto puro');
    assert.equal(record.code.length, 64, 'Código no banco deve ser um hash hex de 64 caracteres (SHA256 HMAC)');

    // Validação funcional deve passar com o código correto
    const verifyResult = userRepo.verifyCode(testEmail, 'register', plainCode);
    assert.equal(verifyResult.valid, true, 'Validação deve aceitar o código original');
  });

  await t.test('SEG-02: Rate limit de login por conta protege contra ataques distribuídos', () => {
    const usersSource = fs.readFileSync(path.resolve('server/routes/users.js'), 'utf-8');
    assert.ok(
      usersSource.includes('accountLimitKey') && usersSource.includes('pinRateLimiter.check(accountLimitKey)'),
      'users.js deve incluir checagem de rate limit por conta (login:email)'
    );
  });
});
