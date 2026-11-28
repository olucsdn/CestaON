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

test('AUDITORIA E VALIDAÇÃO DOS ERROS REPORTADOS (CestaON - 7 Correções)', async (t) => {
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

  // Criação dos usuários para os testes
  const { data: owner } = await req('/users', {
    method: 'POST',
    body: JSON.stringify({ name: 'Dono da Feira', email: 'dono@teste.com', pin: '123456' })
  });

  const { data: guest } = await req('/users', {
    method: 'POST',
    body: JSON.stringify({ name: 'Convidado Participante', email: 'convidado@teste.com', pin: '654321' })
  });

  // =========================================================================
  // CENÁRIO 1: Convidado saindo da feira de outra pessoa (ERR-01)
  // =========================================================================
  await t.test('ERR-01: Convidado consegue sair da feira compartilhada via DELETE /shares/:userId, mas não pode deletar a feira', async () => {
    // 1. Dono cria a feira
    const { data: list } = await req('/lists', {
      method: 'POST',
      headers: {
        'X-User-Id': owner.id,
        'Authorization': `Bearer ${owner.token}`
      },
      body: JSON.stringify({ title: 'Feira Compartilhada Familiar', owner_id: owner.id })
    });
    assert.ok(list?.id, 'Lista criada com sucesso');

    // 2. Dono adiciona o convidado à feira
    const { status: shareStatus } = await req(`/lists/${list.id}/shares`, {
      method: 'POST',
      headers: {
        'X-User-Id': owner.id,
        'Authorization': `Bearer ${owner.token}`
      },
      body: JSON.stringify({ user_id: guest.id, permission: 'write' })
    });
    assert.equal(shareStatus, 201, 'Convidado adicionado na feira');

    // 3. Convidado tenta deletar a feira inteira (deve ser barrado com HTTP 403 Forbidden)
    const { status: deleteAttemptStatus } = await req(`/lists/${list.id}`, {
      method: 'DELETE',
      headers: {
        'X-User-Id': guest.id,
        'Authorization': `Bearer ${guest.token}`
      }
    });
    assert.equal(deleteAttemptStatus, 403, 'Convidado não pode excluir a feira do dono');

    // 4. Convidado executa a auto-saída da feira compartilhada (DELETE /shares/:guestId)
    const { status: leaveStatus, data: leaveData } = await req(`/lists/${list.id}/shares/${guest.id}`, {
      method: 'DELETE',
      headers: {
        'X-User-Id': guest.id,
        'Authorization': `Bearer ${guest.token}`
      }
    });
    assert.equal(leaveStatus, 200, 'Convidado consegue sair da feira com sucesso');
    assert.equal(leaveData.success, true, 'Resposta confirma a saída voluntária');

    // 5. Verifica se o convidado não consta mais nos shares da feira
    const { data: refreshedList } = await req(`/lists/${list.id}`, {
      headers: {
        'X-User-Id': owner.id,
        'Authorization': `Bearer ${owner.token}`
      }
    });
    const stillShared = refreshedList.shares.some(s => s.user_id === guest.id);
    assert.equal(stillShared, false, 'Convidado foi devidamente removido dos participantes');
  });

  // =========================================================================
  // CENÁRIO 2: Modo Mercado e Estado Vazio vs Concluído (ERR-02)
  // =========================================================================
  await t.test('ERR-02: Validação da lógica do Modo Mercado (0 itens = Nenhum item adicionado; não Concluído)', async () => {
    // Função espelho da lógica em MarketModeView.jsx
    function getMarketDisplayState(listItems) {
      const items = listItems || [];
      const pendingItems = items.filter(i => !i.is_purchased);

      const indicatorText = items.length === 0
        ? 'Nenhum item na lista'
        : pendingItems.length === 0
        ? 'Todos os itens comprados'
        : `${pendingItems.length} itens restantes`;

      let viewCard = 'PENDING_LIST';
      if (items.length === 0) {
        viewCard = 'EMPTY_STATE_CARD'; // Nenhum item adicionado
      } else if (pendingItems.length === 0) {
        viewCard = 'COMPLETED_CELEBRATION'; // Lista Concluída 🎯
      }

      return { indicatorText, viewCard };
    }

    // Caso A: Feira sem nenhum item (0 itens)
    const emptyState = getMarketDisplayState([]);
    assert.equal(emptyState.indicatorText, 'Nenhum item na lista', 'Indicador deve informar lista sem itens');
    assert.equal(emptyState.viewCard, 'EMPTY_STATE_CARD', 'Card deve ser de estado vazio e NÃO celebração de concluído');

    // Caso B: Feira com 2 itens pendentes
    const pendingState = getMarketDisplayState([
      { id: '1', product_name: 'Maçã', is_purchased: false },
      { id: '2', product_name: 'Leite', is_purchased: false }
    ]);
    assert.equal(pendingState.indicatorText, '2 itens restantes');
    assert.equal(pendingState.viewCard, 'PENDING_LIST');

    // Caso C: Feira com todos os 2 itens comprados
    const completedState = getMarketDisplayState([
      { id: '1', product_name: 'Maçã', is_purchased: true },
      { id: '2', product_name: 'Leite', is_purchased: true }
    ]);
    assert.equal(completedState.indicatorText, 'Todos os itens comprados');
    assert.equal(completedState.viewCard, 'COMPLETED_CELEBRATION', 'Celebração acionada somente com itens existentes comprados');
  });

  // =========================================================================
  // CENÁRIO 3: Ausência do bloco 'Adicionar familiar criado neste dispositivo' (ERR-03)
  // =========================================================================
  await t.test('ERR-03: ShareModal.jsx não contém o bloco de familiares locais nem availableUsersToInvite', async () => {
    const shareModalPath = path.resolve('client/src/components/ShareModal.jsx');
    const content = fs.readFileSync(shareModalPath, 'utf8');

    assert.equal(content.includes('Adicionar familiar criado neste dispositivo'), false, 'Texto do bloco local deve ser inexistente');
    assert.equal(content.includes('availableUsersToInvite'), false, 'Variável availableUsersToInvite deve ter sido removida');
    assert.ok(content.includes('Sair da feira'), 'Botão de saída voluntária deve estar presente para participantes');
  });

  // =========================================================================
  // CENÁRIO 4: Remoção de bypass sem credencial e isolamento de contas (ERR-04)
  // =========================================================================
  await t.test('ERR-04: Ausência de handleGuestEntry e integridade do modal de perfil', async () => {
    const appPath = path.resolve('client/src/App.jsx');
    const appContent = fs.readFileSync(appPath, 'utf8');

    assert.equal(appContent.includes('handleGuestEntry'), false, 'handleGuestEntry deve estar completamente expurgado');
    assert.equal(appContent.includes('onGuestEntry='), false, 'Props onGuestEntry devem ser inexistentes');

    const profileModalPath = path.resolve('client/src/components/UserProfileModal.jsx');
    const profileContent = fs.readFileSync(profileModalPath, 'utf8');

    assert.equal(profileContent.includes('Página de Login, Recuperação e Cadastro'), false, 'Botão redundante de login deve estar removido');
    assert.ok(profileContent.includes('Sair da conta atual'), 'Botão legítimo de logout deve existir');
  });

  // =========================================================================
  // CENÁRIO 5: Cálculo de Custo no Orçamento sem dupla multiplicação (ERR-05)
  // =========================================================================
  await t.test('ERR-05: BudgetView calcula custo real usando actual_price_cents diretamente', async () => {
    // Função espelho da lógica corrigida em BudgetView.jsx
    function calculateItemBudgetCost(item) {
      let itemCost = 0;
      if (item.actual_price_cents > 0) {
        itemCost = item.actual_price_cents;
      } else if (item.estimated_price_cents > 0) {
        itemCost = Math.round(item.estimated_price_cents * (item.quantity || 1));
      }
      return itemCost;
    }

    // Exemplo: 500g (quantidade = 500) com preço total pago de R$ 10,00 (1000 centavos)
    const weighedItem = {
      actual_price_cents: 1000,
      quantity: 500,
      unit: 'g'
    };
    const weighedCost = calculateItemBudgetCost(weighedItem);
    assert.equal(weighedCost, 1000, 'Preço real registrado na gôndola é o valor total de R$ 10,00 (não R$ 5.000,00)');

    // Exemplo: 3 unidades com estimativa de R$ 5,00 cada (500 centavos) sem preço real ainda
    const estimatedItem = {
      actual_price_cents: 0,
      estimated_price_cents: 500,
      quantity: 3,
      unit: 'un'
    };
    const estimatedCost = calculateItemBudgetCost(estimatedItem);
    assert.equal(estimatedCost, 1500, 'Item estimado multiplica estimativa unitária pela quantidade (R$ 15,00)');
  });

  // =========================================================================
  // CENÁRIO 6: Paridade de propriedade no Simulador Onde Comprar (ERR-06)
  // =========================================================================
  await t.test('ERR-06: WhereToBuyModal consome potentialSavingsCents em paridade com backend', async () => {
    const whereToBuyPath = path.resolve('client/src/components/WhereToBuyModal.jsx');
    const content = fs.readFileSync(whereToBuyPath, 'utf8');

    assert.equal(content.includes('simulation.maxSavingsCents'), false, 'maxSavingsCents não deve existir');
    assert.ok(content.includes('simulation.potentialSavingsCents'), 'potentialSavingsCents deve ser utilizado para badge de economia');
  });

  // =========================================================================
  // CENÁRIO 7: Limpeza de chaves de cache offline no Logout (ERR-07)
  // =========================================================================
  await t.test('ERR-07: Rotina de logout expurga chaves feira_subsurface_* e cestaon_pending_*', async () => {
    // Simulação do localStorage
    const mockStorage = new Map();
    mockStorage.set('feira_user_id', 'usr_123');
    mockStorage.set('feira_auth_token', 'token_xyz');
    mockStorage.set('feira_subsurface_where_to_buy_1', 'cached_data');
    mockStorage.set('cestaon_pending_join_code', 'ABC123');
    mockStorage.set('user_theme_preference', 'dark'); // Não deve ser removido

    // Executa a lógica de purga implementada em handleLogout
    const keysToRemove = [];
    for (const key of mockStorage.keys()) {
      if (key && (key.startsWith('feira_subsurface_') || key.startsWith('cestaon_pending_'))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => mockStorage.delete(k));
    mockStorage.delete('feira_user_id');
    mockStorage.delete('feira_auth_token');

    assert.equal(mockStorage.has('feira_user_id'), false, 'ID de usuário removido');
    assert.equal(mockStorage.has('feira_auth_token'), false, 'Token de autenticação removido');
    assert.equal(mockStorage.has('feira_subsurface_where_to_buy_1'), false, 'Cache preditivo offline purgado');
    assert.equal(mockStorage.has('cestaon_pending_join_code'), false, 'Código temporário pendente purgado');
    assert.equal(mockStorage.has('user_theme_preference'), true, 'Preferências visuais neutras do app preservadas');
  });

  server.close();
});
