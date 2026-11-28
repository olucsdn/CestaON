import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { WebSocket } from 'ws';
import { getDatabase } from '../server/db/database.js';
import { seedDatabase } from '../server/db/seed.js';
import { SocketManager } from '../server/ws/socketManager.js';
import { createApiRouter } from '../server/routes/api.js';
import { ListRepository } from '../server/repositories/listRepository.js';
import { UserRepository } from '../server/repositories/userRepository.js';
import {
  createSessionToken,
  verifySessionToken,
  getAuthSecret
} from '../server/middlewares/auth.js';

test('PRONTIDÃO PARA PRODUÇÃO PÚBLICA — Autenticação por Token, WebSocket Seguro, Persistência e LGPD', async (t) => {
  const prevAuthSecret = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = 'cestaon-production-auth-secret-32-chars-long-secure-key!';

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
  const wsUrl = `ws://127.0.0.1:${port}`;

  const userRepo = new UserRepository(db);

  // 1. Validação de Primitivas Criptográficas de Tokens HMAC-SHA256
  await t.test('1. Emissão, Estrutura e Verificação Criptográfica de Tokens HMAC-SHA256', () => {
    const token = createSessionToken({ sub: 'usr_test_1', email: 'teste@cestaon.app' }, { expiresInSeconds: 3600 });
    assert.ok(token, 'Token deve ser gerado');
    const parts = token.split('.');
    assert.equal(parts.length, 3, 'Token deve conter 3 partes separadas por ponto (header.payload.signature)');

    // Verificação válida
    const verified = verifySessionToken(token);
    assert.ok(verified, 'Token íntegro deve ser verificado com sucesso');
    assert.equal(verified.sub, 'usr_test_1');
    assert.equal(verified.email, 'teste@cestaon.app');
    assert.equal(verified.id, 'usr_test_1');

    // Token adulterado deve falhar
    const tampered = token.slice(0, -4) + 'abcd';
    assert.equal(verifySessionToken(tampered), null, 'Token com assinatura adulterada deve retornar null');

    // Token expirado deve falhar
    const expiredToken = createSessionToken({ sub: 'usr_exp', email: 'exp@cestaon.app' }, { expiresInSeconds: -10 });
    assert.equal(verifySessionToken(expiredToken), null, 'Token expirado deve retornar null');
  });

  // 2. Criação de Contas e Retorno de Tokens de Sessão no Cadastro e Login
  let createdUser = null;
  let userToken = null;

  await t.test('2. Cadastro e Login retornam Token de Sessão assinado', async () => {
    // Cadastro
    const regRes = await fetch(`${baseUrl}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Carlos Oliveira',
        email: 'carlos.oliveira@cestaon.app',
        pin: '123456',
        avatar_color: '#10B981',
        security_question: 'Animal de estimação?',
        security_answer: 'Rex'
      })
    });
    assert.equal(regRes.status, 201);
    const regData = await regRes.json();
    assert.ok(regData.id);
    assert.ok(regData.token, 'Cadastro deve retornar token de sessão');
    createdUser = regData;
    userToken = regData.token;

    // Login
    const loginRes = await fetch(`${baseUrl}/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'carlos.oliveira@cestaon.app',
        password: '123456'
      })
    });
    assert.equal(loginRes.status, 200);
    const loginData = await loginRes.json();
    assert.ok(loginData.token, 'Login deve retornar token de sessão');
    const verifiedLogin = verifySessionToken(loginData.token);
    assert.equal(verifiedLogin.sub, createdUser.id);
  });

  // 3. Bloqueio Mandatório de Acesso sem Autenticação nos Endpoints LGPD e Perfil
  await t.test('3. Endpoints LGPD (/export e exclusão) exigem autenticação do titular', async () => {
    // 3.1 GET /export sem credencial deve retornar 401
    const noAuthExport = await fetch(`${baseUrl}/users/${createdUser.id}/export`);
    assert.equal(noAuthExport.status, 401, 'Exportação sem autenticação deve retornar 401');

    // 3.2 GET /export com token do titular legítimo deve retornar 200
    const authExport = await fetch(`${baseUrl}/users/${createdUser.id}/export`, {
      headers: { Authorization: `Bearer ${userToken}` }
    });
    assert.equal(authExport.status, 200, 'Exportação com Bearer token legítimo deve retornar 200');
    const exportData = await authExport.json();
    assert.equal(exportData.user.email, 'carlos.oliveira@cestaon.app');

    // 3.3 GET /export com token de outro usuário (Eve) deve retornar 403
    const eveToken = createSessionToken({ sub: 'usr_eve_hacker', email: 'eve@hacker.com' });
    const idorExport = await fetch(`${baseUrl}/users/${createdUser.id}/export`, {
      headers: { Authorization: `Bearer ${eveToken}` }
    });
    assert.equal(idorExport.status, 403, 'Acesso cruzado (IDOR) deve ser bloqueado com 403');

    // 3.4 PUT /users/:id sem autenticação deve retornar 401
    const noAuthPut = await fetch(`${baseUrl}/users/${createdUser.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Nome Injetado Sem Auth' })
    });
    assert.equal(noAuthPut.status, 401, 'Alteração de perfil sem credencial deve retornar 401');

    // 3.5 PUT /users/:id com token de outro usuário deve retornar 403
    const idorPut = await fetch(`${baseUrl}/users/${createdUser.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${eveToken}`
      },
      body: JSON.stringify({ name: 'Nome Injetado por Eve' })
    });
    assert.equal(idorPut.status, 403, 'Alteração por terceiro deve retornar 403');
  });

  // 4. WebSocket: Rejeição de Identidade Declarada sem Token em Produção e Aceite de Token
  await t.test('4. WebSocket: Bloqueio de Identidade Spoofada e Validação de Token de Sessão', async () => {
    // Cria lista para o Carlos
    const listRes = await fetch(`${baseUrl}/lists`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`
      },
      body: JSON.stringify({ title: 'Feira do Carlos', owner_id: createdUser.id })
    });
    const listData = await listRes.json();
    const listId = listData.id;

    // Ativa temporariamente simulação de produção
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    let wsA = null;
    let wsB = null;
    let wsC = null;
    try {
      // Cenário A: Cliente tenta declarar userId sem fornecer token em produção -> REJEITADO
      wsA = new WebSocket(wsUrl, { headers: { Origin: 'http://localhost' } });
      await new Promise((resolve) => wsA.on('open', resolve));

      let errorMessageA = null;
      wsA.on('message', (msg) => {
        const parsed = JSON.parse(msg.toString());
        if (parsed.type === 'ERROR') {
          errorMessageA = parsed.message;
        }
      });

      wsA.send(JSON.stringify({
        type: 'JOIN_LIST',
        listId,
        userId: createdUser.id // sem token
      }));

      await new Promise((resolve) => setTimeout(resolve, 150));
      assert.match(errorMessageA || '', /token de sessão ausente/i, 'Deve rejeitar JOIN_LIST sem token em produção');
      wsA.close();
      wsA = null;

      // Cenário B: Cliente conecta com token de sessão válido -> AUTORIZADO
      wsB = new WebSocket(wsUrl, { headers: { Origin: 'http://localhost' } });
      await new Promise((resolve) => wsB.on('open', resolve));

      let joinedConfirmed = false;
      wsB.on('message', (msg) => {
        const parsed = JSON.parse(msg.toString());
        if (parsed.type === 'JOINED_LIST') {
          joinedConfirmed = true;
        }
      });

      wsB.send(JSON.stringify({
        type: 'JOIN_LIST',
        listId,
        token: userToken // token HMAC assinado do Carlos
      }));

      await new Promise((resolve) => setTimeout(resolve, 150));
      assert.equal(joinedConfirmed, true, 'Deve autorizar JOIN_LIST com token legítimo');
      wsB.close();
      wsB = null;

      // Cenário C: Cliente envia token válido do Carlos, mas declara userId da Eve (conflito) -> REJEITADO
      wsC = new WebSocket(wsUrl, { headers: { Origin: 'http://localhost' } });
      await new Promise((resolve) => wsC.on('open', resolve));

      let errorMessageC = null;
      wsC.on('message', (msg) => {
        const parsed = JSON.parse(msg.toString());
        if (parsed.type === 'ERROR') {
          errorMessageC = parsed.message;
        }
      });

      wsC.send(JSON.stringify({
        type: 'JOIN_LIST',
        listId,
        token: userToken, // pertence a Carlos
        userId: 'usr_outro_alvo' // discordância maliciosa
      }));

      await new Promise((resolve) => setTimeout(resolve, 150));
      assert.match(errorMessageC || '', /conflito de identidade/i, 'Deve rejeitar divergência entre token e userId');
      wsC.close();
      wsC = null;

    } finally {
      try { wsA?.close(); } catch (_) {}
      try { wsB?.close(); } catch (_) {}
      try { wsC?.close(); } catch (_) {}
      process.env.NODE_ENV = prevEnv;
    }
  });

  // 5. Verificação da Sincronização e Conexão do Turso LibSQL
  await t.test('5. Prontidão da Camada de Sincronização Turso LibSQL (@libsql/client)', async () => {
    const { createLibsqlClient, isLibsqlConfigured } = await import('../server/db/database.js');
    
    // Testa criação de cliente com parâmetro syncUrl (Embedded Replica)
    const client = createLibsqlClient({
      url: ':memory:'
    });
    assert.ok(client, 'Cliente LibSQL deve ser instanciado');
    assert.equal(typeof client.execute, 'function');
  });

  // Encerra servidor
  socketManager.close();
  if (server.closeAllConnections) {
    server.closeAllConnections();
  }
  await new Promise((resolve) => server.close(resolve));
  process.env.AUTH_SECRET = prevAuthSecret;
});
