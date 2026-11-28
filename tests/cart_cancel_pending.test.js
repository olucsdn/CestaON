import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import express from 'express';
import { getDatabase } from '../server/db/database.js';
import { seedDatabase } from '../server/db/seed.js';
import { SocketManager } from '../server/ws/socketManager.js';
import { createApiRouter } from '../server/routes/api.js';

test('CANCELAR (MANTER ITEM PENDENTE) NO CARRINHO — Remoção e Retorno para a Lista', async (t) => {
  const rootDir = process.cwd();
  const modalPath = path.join(rootDir, 'client', 'src', 'components', 'CartPricePromptModal.jsx');
  const appPath = path.join(rootDir, 'client', 'src', 'App.jsx');

  await t.test('1. Estrutura e Lógica do CartPricePromptModal.jsx', () => {
    assert.ok(fs.existsSync(modalPath), 'CartPricePromptModal.jsx deve existir');
    const content = fs.readFileSync(modalPath, 'utf-8');

    // Assinatura com onCancelPending
    assert.match(
      content,
      /onCancelPending/,
      'CartPricePromptModal deve receber onCancelPending nas props'
    );

    // Texto exato do botão solicitado pelo usuário
    assert.ok(
      content.includes('Cancelar (manter item pendente)'),
      'O botão de cancelar deve manter a redação "Cancelar (manter item pendente)"'
    );

    // Lógica de cancelamento: se no carrinho chama onCancelPending, senão onClose
    assert.ok(
      content.includes('item?.is_purchased && onCancelPending'),
      'Deve verificar se o item está no carrinho antes de acionar onCancelPending'
    );

    // Atualização de texto do botão principal quando já estiver no carrinho
    assert.ok(
      content.includes("item.is_purchased ? 'Atualizar Valor' : 'Confirmar Valor e Adicionar'"),
      'Deve exibir "Atualizar Valor" quando o item já estiver no carrinho'
    );
  });

  await t.test('2. Integração no App.jsx', () => {
    assert.ok(fs.existsSync(appPath), 'App.jsx deve existir');
    const content = fs.readFileSync(appPath, 'utf-8');

    // Handler de cancelamento
    assert.ok(
      content.includes('handleCancelCartPrompt'),
      'App.jsx deve implementar handleCancelCartPrompt'
    );

    // Chamada a handleToggleItem com is_purchased false e preço zerado
    assert.ok(
      content.includes('handleToggleItem(itemId, false, 0)'),
      'Deve retornar o item para a lista pendente e zerar o preço pago'
    );

    // Prop passada ao componente CartPricePromptModal
    assert.ok(
      content.includes('onCancelPending={handleCancelCartPrompt}'),
      'CartPricePromptModal deve receber onCancelPending={handleCancelCartPrompt}'
    );
  });

  await t.test('3. Teste Integrado de API: Produto No Carrinho -> Cancelar para Pendente', async () => {
    // Configura banco de dados em memória isolado
    const db = getDatabase(':memory:');
    seedDatabase(db);

    const app = express();
    app.use(express.json());
    const server = http.createServer(app);
    const socketManager = new SocketManager(server);
    app.use('/api', createApiRouter(db, socketManager));

    await new Promise((res) => server.listen(0, res));
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}/api`;

    try {
      // 1. Cria lista com orçamento de R$ 50,00
      const listRes = await fetch(`${baseUrl}/lists`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': 'usr_default' },
        body: JSON.stringify({ title: 'Feira Teste Cancelar', budget_cents: 5000, owner_id: 'usr_default' })
      });
      const listData = await listRes.json();
      assert.equal(listRes.status, 201);
      const listId = listData.id;

      // 2. Adiciona item "Maçã Fuji"
      const itemRes = await fetch(`${baseUrl}/lists/${listId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': 'usr_default' },
        body: JSON.stringify({ name: 'Maçã Fuji', quantity: 1, unit: 'kg', estimated_price_cents: 900 })
      });
      const itemData = await itemRes.json();
      assert.equal(itemRes.status, 201);
      const itemId = itemData.item.id;
      assert.equal(itemData.item.is_purchased, 0);

      // 3. Coloca o item "No Carrinho" com valor pago de R$ 12,00 (1200 centavos)
      const putCartRes = await fetch(`${baseUrl}/items/${itemId}/toggle`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': 'usr_default' },
        body: JSON.stringify({ is_purchased: true, actual_price_cents: 1200 })
      });
      const putCartData = await putCartRes.json();
      assert.equal(putCartRes.status, 200);
      assert.equal(putCartData.item.is_purchased, 1);
      assert.equal(putCartData.item.actual_price_cents, 1200);
      assert.equal(putCartData.stats.purchasedCount, 1);
      assert.equal(putCartData.stats.remainingCount, 0);
      assert.equal(putCartData.stats.totalSpentCents, 1200);

      // 4. Usuário abre o item no carrinho e escolhe "Cancelar (manter item pendente)"
      // O frontend dispara handleToggleItem(itemId, false, 0)
      const cancelRes = await fetch(`${baseUrl}/items/${itemId}/toggle`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-User-Id': 'usr_default' },
        body: JSON.stringify({ is_purchased: false, actual_price_cents: 0 })
      });
      const cancelData = await cancelRes.json();
      assert.equal(cancelRes.status, 200);

      // 5. Verifica que o produto retornou para a lista pendente
      assert.equal(cancelData.item.is_purchased, 0, 'Item não deve mais estar marcado como comprado');
      assert.equal(cancelData.item.actual_price_cents, 0, 'Preço pago deve ser resetado');
      assert.equal(cancelData.stats.purchasedCount, 0, 'Contagem no carrinho deve ser 0');
      assert.equal(cancelData.stats.remainingCount, 1, 'Contagem de pendentes deve voltar para 1');
      assert.equal(cancelData.stats.totalSpentCents, 0, 'Total gasto deve ser 0');

      // 6. Confirma via GET da lista completa
      const fullListRes = await fetch(`${baseUrl}/lists/${listId}`, {
        headers: { 'X-User-Id': 'usr_default' }
      });
      const fullListData = await fullListRes.json();
      const updatedItem = fullListData.items.find((i) => i.id === itemId);
      assert.equal(updatedItem.is_purchased, 0, 'Item na lista deve estar pendente');
      assert.equal(updatedItem.actual_price_cents, 0);
      assert.equal(fullListData.stats.purchasedCount, 0);
      assert.equal(fullListData.stats.remainingCount, 1);
    } finally {
      server.close();
      db.close();
    }
  });
});
