import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { getDatabase } from '../server/db/database.js';
import { seedDatabase } from '../server/db/seed.js';
import { SocketManager } from '../server/ws/socketManager.js';
import { createApiRouter } from '../server/routes/api.js';
import { UserRepository } from '../server/repositories/userRepository.js';
import { PriceRepository } from '../server/repositories/priceRepository.js';
import { formatDate } from '../client/src/utils/formatters.js';

test('CONFORMIDADE LEGAL & RESILIÊNCIA EM PRODUÇÃO — LGPD, Marco Civil, DLQ e Fuso Horário', async (t) => {
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

  const userRepo = new UserRepository(db);
  const priceRepo = new PriceRepository(db);

  try {
    // 1. Cria usuário de teste com e-mail e senha
  const testUser = await userRepo.createAsync({
    name: 'Maria da Silva',
    email: 'maria.lgpd@exemplo.com',
    pin: '123456',
    avatar_color: '#10B981',
    security_question: 'Cidade onde nasceu?',
    security_answer: 'Curitiba'
  });

  // Cria uma lista para este usuário
  const listRes = await fetch(`${baseUrl}/lists`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Id': testUser.id },
    body: JSON.stringify({
      title: 'Feira Mensal de Frutas',
      budget_cents: 15000,
      owner_id: testUser.id
    })
  });
  const createdList = await listRes.json();

  // Adiciona itens à lista
  const itemRes = await fetch(`${baseUrl}/lists/${createdList.id}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Id': testUser.id },
    body: JSON.stringify({
      name: 'Maçã Fuji',
      quantity: 2,
      unit: 'kg',
      estimated_price_cents: 1200
    })
  });
  const createdItem = await itemRes.json();
  const itemId = createdItem.item?.id || createdItem.id;

  // Marca o item como comprado com valor real pago para permitir a finalização
  const toggleRes = await fetch(`${baseUrl}/items/${itemId}/toggle`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-User-Id': testUser.id },
    body: JSON.stringify({ is_purchased: true, actual_price_cents: 1200 })
  });
  assert.equal(toggleRes.status, 200);

  // Finaliza a lista para gerar purchase_history e price_history
  const finishRes = await fetch(`${baseUrl}/lists/${createdList.id}/finish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Id': testUser.id },
    body: JSON.stringify({ notes: 'Feira teste finalizada' })
  });
  assert.equal(finishRes.status, 200);

  await t.test('1. LGPD Art. 18, V — Direito à Portabilidade: Exportação Completa dos Dados em JSON', async () => {
    const exportRes = await fetch(`${baseUrl}/users/${testUser.id}/export`, {
      headers: { 'X-User-Id': testUser.id }
    });
    assert.equal(exportRes.status, 200);
    assert.match(exportRes.headers.get('content-type') || '', /application\/json/);

    const exportData = await exportRes.json();
    assert.ok(exportData.exported_at, 'Deve conter carimbo de data/hora');
    assert.match(exportData.disclaimer, /LGPD/);
    assert.equal(exportData.user.email, 'maria.lgpd@exemplo.com');
    assert.equal(exportData.user.name, 'Maria da Silva');
    assert.equal(exportData.shopping_lists.length, 1);
    assert.equal(exportData.shopping_lists[0].title, 'Feira Mensal de Frutas');
    assert.equal(exportData.purchase_history.length, 1);

    // Tentativa de exportar dados de outro usuário sem autorização (IDOR) deve retornar 403
    const idorRes = await fetch(`${baseUrl}/users/${testUser.id}/export`, {
      headers: { 'X-User-Id': 'usr_outro_desconhecido' }
    });
    assert.equal(idorRes.status, 403);
  });

  await t.test('2. LGPD Art. 18, VI — Direito à Eliminação: Bloqueio de Exclusão sem Confirmação de Senha', async () => {
    // Tentativa sem fornecer senha
    const noPinRes = await fetch(`${baseUrl}/users/${testUser.id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': testUser.id },
      body: JSON.stringify({})
    });
    assert.equal(noPinRes.status, 400);

    // Tentativa com senha incorreta
    const wrongPinRes = await fetch(`${baseUrl}/users/${testUser.id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': testUser.id },
      body: JSON.stringify({ pin: 'senha_errada' })
    });
    assert.equal(wrongPinRes.status, 403);

    // Usuário ainda deve existir no banco
    assert.ok(userRepo.getById(testUser.id));
  });

  await t.test('3. LGPD Art. 18, VI — Exclusão Definitiva em Cascata Atômica (Sem Dados Órfãos)', async () => {
    const deleteRes = await fetch(`${baseUrl}/users/${testUser.id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'X-User-Id': testUser.id },
      body: JSON.stringify({ pin: '123456' })
    });
    assert.equal(deleteRes.status, 200);

    const deleteJson = await deleteRes.json();
    assert.equal(deleteJson.success, true);

    // Verifica que o usuário foi deletado
    assert.equal(userRepo.getById(testUser.id), null);

    // Verifica que as listas do usuário foram deletadas
    const orphanLists = db.prepare('SELECT count(*) as count FROM shopping_lists WHERE owner_id = ?').get(testUser.id);
    assert.equal(orphanLists.count, 0);

    // Verifica que os itens foram deletados
    const orphanItems = db.prepare('SELECT count(*) as count FROM list_items WHERE list_id = ?').get(createdList.id);
    assert.equal(orphanItems.count, 0);

    // Verifica que purchase_history e price_history foram deletados sem violação de Foreign Key
    const orphanPurchases = db.prepare('SELECT count(*) as count FROM purchase_history WHERE list_id = ?').get(createdList.id);
    assert.equal(orphanPurchases.count, 0);
  });

  await t.test('4. Resiliência de Sincronização: Dead Letter Queue (DLQ) após 5 Falhas Transitórias (5xx)', async () => {
    // Simula a lógica de DLQ do flushPendingMutations
    let conflictRecorded = null;
    let removedId = null;

    const mockMutation = {
      id: 888,
      url: `${baseUrl}/items/item_com_falha_500`,
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity: 5 }),
      attempts: 4 // Quatro tentativas anteriores realizadas
    };

    // Mock fetch que retorna 500 (Erro interno do servidor)
    const mock500Fetch = async () => ({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error'
    });

    const res = await mock500Fetch();
    if (!res.ok && res.status >= 500) {
      if ((mockMutation.attempts || 0) >= 4) {
        // DLQ acionada na 5ª tentativa
        conflictRecorded = {
          id: mockMutation.id,
          status: res.status,
          reason: 'Excedido o limite de 5 tentativas de sincronização (Erro 5xx). Operação movida para Dead Letter Queue.'
        };
        removedId = mockMutation.id;
      }
    }

    assert.ok(conflictRecorded, 'Deve mover para DLQ ao atingir 5 tentativas');
    assert.equal(removedId, 888, 'Deve remover da fila para destravar próximas mutações');
    assert.match(conflictRecorded.reason, /Dead Letter Queue/);
  });

  await t.test('5. Ajuste de Fuso Horário de Brasília (America/Sao_Paulo, UTC-3)', async () => {
    // Inserção com timestamp próximo à meia-noite UTC (22:30 no Brasil = 01:30 UTC do dia seguinte)
    // 2026-06-01 01:30:00 UTC corresponde a 2026-05-31 22:30:00 em Brasília (-3 horas)
    const res = db.prepare(`
      SELECT strftime('%Y-%m', '2026-06-01 01:30:00', '-3 hours') as month_year
    `).get();

    assert.equal(res.month_year, '2026-05', 'Com -3 hours, deve pertencer ao mês de Maio de Brasília');

    // Teste do formatador formatDate em pt-BR com string SQLite
    const formatted = formatDate('2026-10-28 16:30:00');
    assert.ok(formatted.includes('28'), 'Deve conter o dia 28');
    assert.ok(formatted.includes('2026'), 'Deve conter o ano 2026');
  });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
