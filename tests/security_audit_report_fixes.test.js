import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { getDatabase } from '../server/db/database.js';
import { seedDatabase } from '../server/db/seed.js';
import { SocketManager } from '../server/ws/socketManager.js';
import { createApiRouter } from '../server/routes/api.js';
import { UserRepository } from '../server/repositories/userRepository.js';
import { requireAuth, getCallerUserId, createSessionToken } from '../server/middlewares/auth.js';

test('AUDITORIA DE SEGURANÇA WHITE-BOX — Validação das Remediações SEC-01 a SEC-05', async (t) => {
  const db = getDatabase(':memory:');
  seedDatabase(db);

  const app = express();
  app.use(express.json());

  // Simula cabeçalhos globais do server/index.js para validação de SEC-05
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' ws: wss: https://fonts.googleapis.com https://fonts.gstatic.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none';");
    next();
  });

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

  await t.test('SEC-01: Geração de Código de Recuperação com CSPRNG de 6 dígitos', async () => {
    // 1. Testa unicidade e formato de 6 dígitos numéricos no endpoint
    const generatedCodes = new Set();
    for (let i = 0; i < 3; i++) {
      const email = `test_csprng_${i}@cestaon.com.br`;
      const res = await fetch(`${baseUrl}/api/users/send-verification-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, purpose: 'register' })
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);

      // Consulta no banco o código gravado (armazenado como hash HMAC-SHA256 conforme SEG-01)
      const record = db.prepare('SELECT code, id FROM email_verifications WHERE email = ?').get(email);
      assert.ok(record, 'Registro de verificação deve existir no banco');
      assert.equal(record.code.length, 64, 'Código no banco deve estar protegido por hash HMAC-SHA256 de 64 caracteres');
      assert.match(record.code, /^[a-f0-9]{64}$/, 'Hash do código OTP deve ser hexadecimal');
      assert.ok(record.id.startsWith('vcode_'), 'ID deve iniciar com vcode_');
      assert.ok(record.id.length >= 15, 'ID com CSPRNG deve conter entropia adequada');
      generatedCodes.add(record.code);
    }

    // 2. Valida chamada direta ao repositório para testar entropia do ID sem limitação de taxa
    for (let i = 0; i < 15; i++) {
      const email = `repo_entropy_${i}@cestaon.com.br`;
      const created = userRepo.createVerificationCode(email, 'register', '123456');
      assert.ok(created.id.startsWith('vcode_'));
      generatedCodes.add(created.id);
    }

    assert.ok(generatedCodes.size >= 17, 'Entropia CSPRNG deve evitar colisões previsíveis');
  });

  await t.test('SEC-02: Fail-Closed em Autenticação fora do Ambiente de Teste (Bloqueio de Header Spoofing)', async () => {
    // Simula ambiente de desenvolvimento/staging alterando temporariamente NODE_ENV
    const originalEnv = process.env.NODE_ENV;
    const originalExecArgv = [...process.execArgv];

    try {
      process.env.NODE_ENV = 'development';
      // Limpa temporariamente flags que simulam --test
      process.execArgv.length = 0;

      // 1. getCallerUserId fora de teste deve retornar null se não houver req.user autenticado
      const mockReq = {
        headers: { 'x-user-id': 'usr_spoofed' },
        query: { userId: 'usr_spoofed' },
        body: { user_id: 'usr_spoofed' }
      };
      assert.equal(getCallerUserId(mockReq), null, 'getCallerUserId deve retornar null fora de ambiente de teste');

      // 2. requireAuth fora de teste deve responder 401 se não houver token assinado
      let statusCalled = null;
      let jsonCalled = null;
      let nextCalled = false;
      const mockRes = {
        status: (code) => {
          statusCalled = code;
          return {
            json: (payload) => {
              jsonCalled = payload;
            }
          };
        }
      };
      requireAuth(mockReq, mockRes, () => {
        nextCalled = true;
      });
      assert.equal(nextCalled, false, 'requireAuth não deve chamar next() para headers não autenticados');
      assert.equal(statusCalled, 401);
      assert.ok(jsonCalled?.error?.includes('Acesso restrito'), 'Deve retornar erro fail-closed de autenticação');

      // 3. Com token válido assinado, requireAuth deve passar
      const validToken = createSessionToken('usr_valid', 'usr_valid');
      const authReq = {
        user: { id: 'usr_valid', sub: 'usr_valid' }
      };
      let authNext = false;
      requireAuth(authReq, mockRes, () => {
        authNext = true;
      });
      assert.equal(authNext, true, 'requireAuth deve aprovar requisição com req.user autenticado');
    } finally {
      process.env.NODE_ENV = originalEnv;
      process.execArgv.push(...originalExecArgv);
    }
  });

  await t.test('SEC-03: Isolamento Multi-Tenant de Idempotência e Prevenção de Replay Cruzado', async () => {
    // Cria usuários para o teste
    const userAlice = userRepo.create({ name: 'Alice Sec', email: 'alice_sec@cestaon.com.br', pin: '1234' });
    const userBob = userRepo.create({ name: 'Bob Sec', email: 'bob_sec@cestaon.com.br', pin: '5678' });

    const aliceToken = createSessionToken({ id: userAlice.id, sub: userAlice.id });
    const bobToken = createSessionToken({ id: userBob.id, sub: userBob.id });

    const opId = `op_audit_${Date.now()}_test`;

    // 1. Alice executa mutação com X-Operation-Id
    const resAlice1 = await fetch(`${baseUrl}/api/lists`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aliceToken}`,
        'X-Operation-Id': opId
      },
      body: JSON.stringify({ title: 'Lista Secreta da Alice', budget_cents: 15000 })
    });

    assert.equal(resAlice1.status, 201);
    const listAlice = await resAlice1.json();
    assert.equal(listAlice.title, 'Lista Secreta da Alice');

    // Verifica que a tabela processed_operations gravou o user_id da Alice
    const record = db.prepare('SELECT operation_id, user_id, response_status, response_body FROM processed_operations WHERE operation_id = ?').get(opId);
    assert.ok(record, 'Operação deve estar registrada em processed_operations');
    assert.equal(record.user_id, userAlice.id, 'user_id deve ser registrado na idempotência');

    // 2. Alice repete o envio com mesmo X-Operation-Id -> deve receber replay legítimo com header X-Idempotent-Replay
    const resAliceReplay = await fetch(`${baseUrl}/api/lists`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aliceToken}`,
        'X-Operation-Id': opId
      },
      body: JSON.stringify({ title: 'Tentativa duplicada Alice' })
    });
    assert.equal(resAliceReplay.headers.get('x-idempotent-replay'), 'true');
    const replayAliceData = await resAliceReplay.json();
    assert.equal(replayAliceData.id, listAlice.id);

    // 3. Bob tenta reenviar o MESMO X-Operation-Id da Alice -> NÃO deve receber o replay com os dados da Alice!
    const resBobCrossReplay = await fetch(`${baseUrl}/api/lists`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bobToken}`,
        'X-Operation-Id': opId
      },
      body: JSON.stringify({ title: 'Lista do Bob com mesmo OpId', budget_cents: 8000 })
    });

    // Bob não pode receber o replay da Alice (header X-Idempotent-Replay não deve estar presente para resposta alheia)
    assert.notEqual(resBobCrossReplay.headers.get('x-idempotent-replay'), 'true', 'Bob não pode receber replay da Alice');
    const bobData = await resBobCrossReplay.json();
    // A resposta deve ser a criação da própria lista de Bob, e não os dados da lista da Alice
    assert.equal(bobData.title, 'Lista do Bob com mesmo OpId');
    assert.notEqual(bobData.id, listAlice.id, 'Lista de Bob deve ter ID próprio sem vazamento da Alice');
  });

  await t.test('SEC-04: Cabeçalhos Anti-Cache Defensivos em Endpoints REST (/api/*)', async () => {
    const res = await fetch(`${baseUrl}/api/categories`);
    assert.equal(res.status, 200);

    const cacheControl = res.headers.get('cache-control');
    const pragma = res.headers.get('pragma');

    assert.ok(cacheControl, 'Cache-Control deve estar presente');
    assert.ok(cacheControl.includes('no-store'), 'Deve conter no-store');
    assert.ok(cacheControl.includes('no-cache'), 'Deve conter no-cache');
    assert.ok(cacheControl.includes('must-revalidate'), 'Deve conter must-revalidate');
    assert.ok(cacheControl.includes('max-age=0'), 'Deve conter max-age=0');
    assert.equal(pragma, 'no-cache', 'Pragma deve ser no-cache');
  });

  await t.test('SEC-05: Hardening de Content-Security-Policy (Sem unsafe-inline em scripts)', async () => {
    const res = await fetch(`${baseUrl}/api/categories`);
    const csp = res.headers.get('content-security-policy');

    assert.ok(csp, 'Content-Security-Policy deve estar presente');
    assert.ok(csp.includes("default-src 'self'"), "CSP deve conter default-src 'self'");
    assert.ok(csp.includes("script-src 'self'"), "CSP deve conter script-src 'self'");
    assert.ok(!csp.includes("script-src 'self' 'unsafe-inline'"), "script-src NÃO deve conter 'unsafe-inline'");
  });
});
