import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { fileURLToPath } from 'node:url';

import { getDatabase } from '../server/db/database.js';
import { seedDatabase } from '../server/db/seed.js';
import { SocketManager } from '../server/ws/socketManager.js';
import { createApiRouter } from '../server/routes/api.js';
import { UserRepository } from '../server/repositories/userRepository.js';
import { ListRepository } from '../server/repositories/listRepository.js';
import { PriceRepository } from '../server/repositories/priceRepository.js';
import { createSessionToken } from '../server/middlewares/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('AUDITORIA DE REMEDIAÇÃO — Validação das Correções de Segurança e Lógica', async (t) => {
  const db = getDatabase(':memory:');
  seedDatabase(db);

  const app = express();
  app.use(express.json());

  const server = http.createServer(app);
  const socketManager = new SocketManager(server);
  app.use('/api', createApiRouter(db, socketManager));

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  t.after(() => {
    server.close();
    socketManager.close();
  });

  const userRepo = new UserRepository(db);
  const listRepo = new ListRepository(db);
  const priceRepo = new PriceRepository(db);

  await t.test('1. SEC-01: Não-reversão do contador de tentativas OTP sob falha/rollback de savepoint', async () => {
    const testEmail = 'alvo.bruteforce@cestaon.com.br';
    userRepo.create({ name: 'Usuario Alvo', email: testEmail, pin: '123456' });

    // Gera código legítimo de verificação para recuperação
    userRepo.createVerificationCode(testEmail, 'recover', '654321', 15);

    // 1. Envia tentativa incorreta com X-Operation-Id (ativa savepoint do idempotency.js)
    const resFail1 = await fetch(`${baseUrl}/api/users/recover`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Operation-Id': 'op_otp_attempt_1'
      },
      body: JSON.stringify({
        email: testEmail,
        verification_code: '000000',
        pin: 'novaSenha123'
      })
    });

    assert.equal(resFail1.status, 401, 'Deve retornar 401 para código OTP incorreto');

    // Consulta no banco direto se o contador attempts foi incrementado para 1 (NÃO revertido pelo rollback do savepoint!)
    const recordAfter1 = db.prepare('SELECT attempts FROM email_verifications WHERE email = ? AND purpose = ?').get(testEmail, 'recover');
    assert.ok(recordAfter1, 'Registro de verificação deve existir');
    assert.equal(recordAfter1.attempts, 1, 'attempts deve ser 1 mesmo após resposta 401 com rollback do savepoint de negócio');

    // 2. Envia mais tentativas incorretas até estourar o limite de 5
    for (let i = 2; i <= 4; i++) {
      const resFail = await fetch(`${baseUrl}/api/users/recover`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Operation-Id': `op_otp_attempt_${i}`
        },
        body: JSON.stringify({
          email: testEmail,
          verification_code: `00000${i}`,
          pin: 'novaSenha123'
        })
      });
      assert.equal(resFail.status, 401);
    }

    // Registra a 5ª tentativa no repositório
    const recordAfter4 = db.prepare('SELECT attempts FROM email_verifications WHERE email = ? AND purpose = ?').get(testEmail, 'recover');
    assert.equal(recordAfter4.attempts, 4, 'attempts deve ser 4 após 4 tentativas incorretas consecutivas');

    // 5ª tentativa incorreta
    userRepo.verifyCode(testEmail, 'recover', '000005');
    const recordAfter5 = db.prepare('SELECT attempts FROM email_verifications WHERE email = ? AND purpose = ?').get(testEmail, 'recover');
    assert.equal(recordAfter5.attempts, 5, 'attempts deve ser 5 após 5 tentativas incorretas consecutivas');

    // 3. Sexta tentativa mesmo com o código CORRETO ('654321') deve ser BLOQUEADA porque estourou o teto de 5 tentativas!
    const verifyBlocked = userRepo.verifyCode(testEmail, 'recover', '654321');
    assert.equal(verifyBlocked.valid, false, 'Deve bloquear por excesso de tentativas');
    assert.match(verifyBlocked.reason, /Muitas tentativas incorretas/i, 'Mensagem deve indicar bloqueio por tentativas');
  });

  await t.test('2. LOG-04: PUT /api/lists/:id com store_id="" normaliza para null e não quebra chave estrangeira (500)', async () => {
    const owner = userRepo.create({ name: 'Dono Lista FK', email: 'owner.fk@cestaon.com.br', pin: '123456' });
    const token = createSessionToken({ id: owner.id, sub: owner.id, email: owner.email });

    const list = listRepo.create({ title: 'Lista Teste FK', owner_id: owner.id, store_id: 'store_atacadao' });
    assert.equal(list.store_id, 'store_atacadao');

    // Envia store_id como string vazia ""
    const resUpdate = await fetch(`${baseUrl}/api/lists/${list.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ store_id: '' })
    });

    assert.equal(resUpdate.status, 200, 'Não deve falhar com erro 500 de Foreign Key!');
    const updated = await resUpdate.json();
    assert.equal(updated.store_id, null, 'store_id vazio deve ser normalizado para null');
  });

  await t.test('3. LOG-01: MarketModeView.jsx declara hooks antes de qualquer retorno condicional', () => {
    const filePath = path.join(rootDir, 'client', 'src', 'components', 'MarketModeView.jsx');
    const content = fs.readFileSync(filePath, 'utf-8');

    const ifIndex = content.indexOf('if (!list || !list.items) return null;');
    const useRefPendingIndex = content.indexOf('useRef(pendingItems.length)');
    const useEffectSpentIndex = content.indexOf('prevSpentRef.current = totalSpentCents');

    assert.ok(ifIndex > -1, 'Early return deve existir');
    assert.ok(useRefPendingIndex > -1, 'useRef deve existir');
    assert.ok(useEffectSpentIndex > -1, 'useEffect deve existir');

    assert.ok(
      ifIndex > useRefPendingIndex && ifIndex > useEffectSpentIndex,
      'Early return condicional DEVE ficar após todos os useRef e useEffect no MarketModeView.jsx'
    );
  });

  await t.test('4. LOG-02: useWebSocket.js não agenda reconexão infinita em evicção de sessão (4001)', () => {
    const filePath = path.join(rootDir, 'client', 'src', 'hooks', 'useWebSocket.js');
    const content = fs.readFileSync(filePath, 'utf-8');

    assert.ok(
      content.includes('4001') && content.includes('isRevokedRef.current = true'),
      'useWebSocket.js deve interceptar código 4001 e travar reconexão via isRevokedRef'
    );
  });

  await t.test('5. SEC-08: sw.js não enfileira credenciais sensíveis de autenticação no IndexedDB', () => {
    const swPath = path.join(rootDir, 'client', 'public', 'sw.js');
    const content = fs.readFileSync(swPath, 'utf-8');

    assert.ok(content.includes('isSensitiveAuth'), 'sw.js deve identificar rotas sensíveis de autenticação');
    assert.ok(content.includes('/api/users/login'), 'sw.js deve excluir /login da fila offline');
    assert.ok(content.includes('/api/users/recover'), 'sw.js deve excluir /recover da fila offline');
  });

  await t.test('6. LOG-07: RegisterEntryPage.jsx separa blocos de chave secreta e pergunta secreta com &&', () => {
    const regPath = path.join(rootDir, 'client', 'src', 'components', 'RegisterEntryPage.jsx');
    const content = fs.readFileSync(regPath, 'utf-8');

    assert.ok(
      content.includes("recoverMethod === 'key' &&"),
      'Chave de recuperação deve usar guard && e não ternário que exiba pergunta por engano'
    );
    assert.ok(
      content.includes("recoverMethod === 'question' &&"),
      'Pergunta secreta deve usar guard && exclusivo'
    );
  });

  await t.test('7. SEC-05: Redefinição de PIN invalida tokens JWT anteriores via token_version', async () => {
    const created = userRepo.create({
      name: 'Usuario Token Version',
      email: 'token.version@cestaon.com.br',
      pin: '123456'
    });

    // 1. Faz login para obter token inicial (token_version = 1)
    const loginRes = await fetch(`${baseUrl}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'token.version@cestaon.com.br', pin: '123456' })
    });
    assert.equal(loginRes.status, 200);
    const { token: oldToken } = await loginRes.json();
    assert.ok(oldToken, 'Login deve emitir token');

    // Confirma que o token antigo funciona antes da troca de PIN
    const beforeRes = await fetch(`${baseUrl}/api/users/${created.id}`, {
      headers: { 'Authorization': `Bearer ${oldToken}` }
    });
    assert.equal(beforeRes.status, 200);

    // 2. Redefine o PIN via /recover usando a chave de recuperação
    const recoverRes = await fetch(`${baseUrl}/api/users/recover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'token.version@cestaon.com.br',
        recovery_key: created.recovery_key,
        pin: '654321'
      })
    });
    assert.equal(recoverRes.status, 200);
    const { token: newToken } = await recoverRes.json();
    assert.ok(newToken, 'Recuperação deve emitir novo token');

    // 3. Token antigo deve ser rejeitado (401) após incremento de token_version
    const oldAfterRes = await fetch(`${baseUrl}/api/users/${created.id}`, {
      headers: { 'Authorization': `Bearer ${oldToken}` }
    });
    assert.equal(oldAfterRes.status, 401, 'Token antigo deve ser invalidado imediatamente após troca de PIN');

    // 4. Novo token deve funcionar normalmente (200)
    const newAfterRes = await fetch(`${baseUrl}/api/users/${created.id}`, {
      headers: { 'Authorization': `Bearer ${newToken}` }
    });
    assert.equal(newAfterRes.status, 200, 'Novo token deve ser aceito após troca de PIN');
  });

  await t.test('8. SEC-03: simulateWhereToBuy isola histórico de preços por userId entre tenants', () => {
    const userA = userRepo.create({ name: 'Tenant A', email: 'tenanta@cestaon.com.br', pin: '123456' });
    const userB = userRepo.create({ name: 'Tenant B', email: 'tenantb@cestaon.com.br', pin: '123456' });

    const prod = db.prepare('SELECT id, category_id FROM products LIMIT 1').get();
    assert.ok(prod, 'Deve existir ao menos um produto seedado');

    // Tenant A registra uma lista finalizada com preço no store_atacadao
    const listA = listRepo.create({ title: 'Lista Privada A', owner_id: userA.id, store_id: 'store_atacadao' });
    const itemA = listRepo.addItem({
      list_id: listA.id,
      product_id: prod.id,
      category_id: prod.category_id,
      quantity: 1,
      unit: 'un',
      actual_price_cents: 1500
    });
    listRepo.toggleItemPurchased(itemA.id, true, 1500, userA.id);
    priceRepo.finishShoppingList(listA.id, 'store_atacadao');

    // Tenant B cria uma lista com o mesmo produto, mas NÃO tem histórico próprio
    const listB = listRepo.create({ title: 'Lista Privada B', owner_id: userB.id });
    listRepo.addItem({
      list_id: listB.id,
      product_id: prod.id,
      category_id: prod.category_id,
      quantity: 1,
      unit: 'un'
    });

    // Tenant B não pode acessar simulação da lista de A
    assert.equal(priceRepo.simulateWhereToBuy(listA.id, userB.id), null);

    // Simulação da lista de B não deve usar preços privados de A
    const simB = priceRepo.simulateWhereToBuy(listB.id, userB.id);
    assert.ok(simB);
    const atacadaoB = simB.stores.find((s) => s.storeId === 'store_atacadao');
    assert.equal(atacadaoB.matchedItemsCount, 0, 'Preços privados de Tenant A não devem vazar para Tenant B');

    // Simulação da lista de A enxerga os próprios preços de A
    const simA = priceRepo.simulateWhereToBuy(listA.id, userA.id);
    const atacadaoA = simA.stores.find((s) => s.storeId === 'store_atacadao');
    assert.equal(atacadaoA.matchedItemsCount, 1, 'Tenant A deve enxergar seus próprios preços');
  });
});
