import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { WebSocket } from 'ws';
import { SocketManager } from '../server/ws/socketManager.js';

test('HARDENING WEBSOCKET — Validação de Produção, CSWSH, Rate Limit e Sessão Única', async (t) => {
  const server = http.createServer();
  
  // Simula authChecker: autoriza apenas se userId === 'user_authorized' na list_123
  const socketManager = new SocketManager(server, (listId, userId) => {
    return listId === 'list_123' && userId === 'user_authorized';
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const wsUrl = `ws://127.0.0.1:${port}`;

  await t.test('1. CSWSH: Rejeição de Handshake com Origin Não Autorizada em Produção', async () => {
    const prevEnv = process.env.NODE_ENV;
    const prevCors = process.env.CORS_ORIGIN;
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGIN = 'https://cestaon.com';

    let connectionRejected = false;
    try {
      const hostileSocket = new WebSocket(wsUrl, {
        headers: { Origin: 'https://evil-hacker-site.com' }
      });

      await new Promise((resolve, reject) => {
        hostileSocket.on('open', resolve);
        hostileSocket.on('unexpected-response', (req, res) => {
          if (res.statusCode === 403) {
            connectionRejected = true;
          }
          resolve();
        });
        hostileSocket.on('error', (err) => {
          if (err.message.includes('403')) {
            connectionRejected = true;
          }
          resolve();
        });
      });
    } finally {
      process.env.NODE_ENV = prevEnv;
      process.env.CORS_ORIGIN = prevCors;
    }

    assert.equal(connectionRejected, true, 'Conexão com Origin hostil deve ser barrada com HTTP 403 no handshake');
  });

  await t.test('2. Rate Limiting de Mensagens por Socket (Flood Protection)', async () => {
    const ws = new WebSocket(wsUrl);
    await new Promise((resolve) => ws.on('open', resolve));

    let closeCode = null;
    let closeReason = '';
    ws.on('close', (code, reason) => {
      closeCode = code;
      closeReason = reason.toString();
    });

    // Dispara 60 mensagens em rajada rápida (teto é 50 por janela)
    for (let i = 0; i < 60; i++) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'PING_FLOOD', index: i }));
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 200));

    assert.equal(closeCode, 1008, 'Socket deve ser desconectado com código 1008 (Policy Violation)');
    assert.match(closeReason, /Limite de mensagens/i, 'Motivo deve indicar excesso de mensagens');
  });

  await t.test('3. Sessão Única por Dispositivo: Evicção de Conexões Antigas', async () => {
    // Aparelho 1 conecta
    const device1 = new WebSocket(wsUrl);
    await new Promise((resolve) => device1.on('open', resolve));
    device1.send(JSON.stringify({ type: 'JOIN_LIST', listId: 'list_123', userId: 'user_authorized' }));

    let device1Evicted = false;
    let device1CloseCode = null;
    device1.on('message', (msg) => {
      try {
        const payload = JSON.parse(msg.toString());
        if (payload.type === 'SESSION_EVICTED') device1Evicted = true;
      } catch (_) {}
    });
    device1.on('close', (code) => {
      device1CloseCode = code;
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Aparelho 2 conecta com o mesmo usuário e dispara evicção da sessão anterior
    const device2 = new WebSocket(wsUrl);
    await new Promise((resolve) => device2.on('open', resolve));
    device2.send(JSON.stringify({ type: 'JOIN_LIST', listId: 'list_123', userId: 'user_authorized' }));
    
    // O sistema evicta conexões anteriores do mesmo usuário
    socketManager.evictUserSessions('user_authorized', device2);

    await new Promise((resolve) => setTimeout(resolve, 150));

    assert.equal(device1Evicted, true, 'Aparelho anterior deve receber evento SESSION_EVICTED');
    assert.equal(device1CloseCode, 4001, 'Aparelho anterior deve ser fechado com código 4001');

    device2.close();
  });

  await t.test('4. Prevenção de Conflito de Identidade no Mesmo Socket', async () => {
    const ws = new WebSocket(wsUrl);
    await new Promise((resolve) => ws.on('open', resolve));

    const messages = [];
    ws.on('message', (msg) => {
      try {
        messages.push(JSON.parse(msg.toString()));
      } catch (_) {}
    });

    // 1. Vincula como user_authorized
    ws.send(JSON.stringify({ type: 'JOIN_LIST', listId: 'list_123', userId: 'user_authorized' }));
    await new Promise((resolve) => setTimeout(resolve, 80));

    // 2. Tenta trocar para hacker_spoof no mesmo socket
    ws.send(JSON.stringify({ type: 'JOIN_LIST', listId: 'list_123', userId: 'hacker_spoof' }));
    await new Promise((resolve) => setTimeout(resolve, 80));

    const conflictErr = messages.find((m) => m.type === 'ERROR' && m.message.includes('Conflito de identidade'));
    assert.ok(conflictErr, 'Deve rejeitar tentativa de poluição de identidade na mesma conexão');

    ws.close();
  });

  socketManager.close();
  await new Promise((resolve) => server.close(resolve));
});
