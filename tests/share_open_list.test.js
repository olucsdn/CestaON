import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import { seedDatabase } from '../server/db/seed.js';
import { SocketManager } from '../server/ws/socketManager.js';
import { createApiRouter } from '../server/routes/api.js';

test('COMPARTILHAMENTO DE FEIRA ABERTA — Sempre Acessível e Proeminente', async (t) => {
  const rootDir = process.cwd();
  const headerPath = path.join(rootDir, 'client', 'src', 'components', 'Header.jsx');
  const normalModePath = path.join(rootDir, 'client', 'src', 'components', 'NormalModeView.jsx');
  const marketModePath = path.join(rootDir, 'client', 'src', 'components', 'MarketModeView.jsx');
  const budgetViewPath = path.join(rootDir, 'client', 'src', 'components', 'BudgetView.jsx');
  const savedListsPath = path.join(rootDir, 'client', 'src', 'components', 'SavedListsView.jsx');
  const shareModalPath = path.join(rootDir, 'client', 'src', 'components', 'ShareModal.jsx');
  const appPath = path.join(rootDir, 'client', 'src', 'App.jsx');

  await t.test('1. Header.jsx disponibiliza botão direto de Compartilhar enquanto a feira estiver aberta', () => {
    assert.ok(fs.existsSync(headerPath), 'Header.jsx deve existir');
    const content = fs.readFileSync(headerPath, 'utf-8');

    // Import do ícone Share2
    assert.ok(content.includes('Share2'), 'Header.jsx deve importar Share2 de lucide-react');

    // Botão direto na barra de ações quando a feira está aberta
    assert.ok(
      content.includes("activeList && activeList.status !== 'completed'"),
      'Header.jsx deve checar se a feira ativa não está finalizada'
    );
    assert.ok(
      content.includes("onOpenShareModal && onOpenShareModal('share')"),
      'Header.jsx deve chamar onOpenShareModal com a aba share'
    );
    assert.ok(
      content.includes('Compartilhar'),
      'Header.jsx deve conter o rótulo Compartilhar'
    );
    assert.ok(
      content.includes('title="Compartilhar esta feira aberta (código e link em tempo real)"'),
      'Header.jsx deve conter tooltip acessível para compartilhar feira aberta'
    );
  });

  await t.test('2. NormalModeView.jsx mantém a tela de lista limpa sem botões redundantes de compartilhar', () => {
    assert.ok(fs.existsSync(normalModePath), 'NormalModeView.jsx deve existir');
    const content = fs.readFileSync(normalModePath, 'utf-8');

    assert.equal(
      content.includes('Compartilhar feira para planejar em família'),
      false,
      'NormalModeView.jsx não deve exibir botão redundante de compartilhar na lista vazia'
    );
    assert.equal(
      content.includes('Compartilhar Feira'),
      false,
      'NormalModeView.jsx não deve exibir banner redundante de compartilhar feira'
    );
  });

  await t.test('3. MarketModeView.jsx mantém a barra inferior do total limpa sem botão de compartilhar', () => {
    assert.ok(fs.existsSync(marketModePath), 'MarketModeView.jsx deve existir');
    const content = fs.readFileSync(marketModePath, 'utf-8');

    assert.ok(
      !content.includes('title="Compartilhar feira aberta para comprar em conjunto"'),
      'MarketModeView.jsx não deve exibir botão de compartilhar na barra inferior do total'
    );
  });

  await t.test('4. BudgetView.jsx mantém o painel de limite rápido limpo sem botão de compartilhar', () => {
    assert.ok(fs.existsSync(budgetViewPath), 'BudgetView.jsx deve existir');
    const content = fs.readFileSync(budgetViewPath, 'utf-8');

    assert.ok(
      !content.includes('title="Compartilhar feira aberta"'),
      'BudgetView.jsx não deve exibir botão de compartilhar na barra de limite rápido'
    );
  });

  await t.test('5. SavedListsView.jsx disponibiliza compartilhamento em cada card de feira aberta e no modal de abertura', () => {
    assert.ok(fs.existsSync(savedListsPath), 'SavedListsView.jsx deve existir');
    const content = fs.readFileSync(savedListsPath, 'utf-8');

    assert.ok(content.includes('Share2'), 'SavedListsView.jsx deve importar Share2');
    // Botão no card da lista
    assert.ok(
      content.includes('title="Compartilhar feira aberta"'),
      'SavedListsView.jsx deve exibir botão de compartilhar no card de feira aberta'
    );
    assert.ok(
      content.includes("onOpenShareModal(list, 'share')"),
      'SavedListsView.jsx deve disparar compartilhamento da lista ativa'
    );
    // Botão no modal listToOpen
    assert.ok(
      content.includes("listToOpen.status !== 'completed' && onOpenShareModal"),
      'SavedListsView.jsx deve oferecer botão Compartilhar no diálogo listToOpen'
    );
  });

  await t.test('6. ShareModal.jsx oferece código, cópia, WhatsApp e badge de Feira Aberta', () => {
    assert.ok(fs.existsSync(shareModalPath), 'ShareModal.jsx deve existir');
    const content = fs.readFileSync(shareModalPath, 'utf-8');

    // Badge de Feira Aberta
    assert.ok(
      content.includes('Feira Aberta • Sincronização em tempo real'),
      'ShareModal.jsx deve conter indicador de feira aberta em tempo real'
    );

    // Botão de WhatsApp
    assert.ok(
      content.includes('handleShareWhatsApp'),
      'ShareModal.jsx deve conter handler dedicado para compartilhamento via WhatsApp'
    );
    assert.ok(
      content.includes('api.whatsapp.com/send?text='),
      'ShareModal.jsx deve formatar mensagem amigável para envio pelo WhatsApp'
    );

    // Botão de Compartilhamento Nativo no Celular (navigator.share)
    assert.ok(
      content.includes('handleNativeShare'),
      'ShareModal.jsx deve conter suporte a navigator.share nativo de dispositivos móveis'
    );
  });

  await t.test('7. App.jsx conecta onOpenShareModal em todas as visões principais', () => {
    assert.ok(fs.existsSync(appPath), 'App.jsx deve existir');
    const content = fs.readFileSync(appPath, 'utf-8');

    // NormalModeView
    assert.ok(
      content.includes("onOpenShareModal={(tab) => handleOpenShareModal(activeList, tab || 'share')}"),
      'App.jsx deve repassar onOpenShareModal para NormalModeView, BudgetView e MarketModeView'
    );
  });

  await t.test('8. Integração Backend: Criação de feira, geração de código de 6 caracteres e ingresso de participante', async () => {
    const db = new DatabaseSync(':memory:');
    const schemaSql = fs.readFileSync(path.join(rootDir, 'server', 'db', 'schema.sql'), 'utf-8');
    db.exec(schemaSql);
    seedDatabase(db);

    const app = express();
    app.use(express.json());

    const server = http.createServer(app);
    const socketManager = new SocketManager(server);
    const apiRouter = createApiRouter(db, socketManager);
    app.use('/api', apiRouter);

    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}/api`;

    try {
      // 1. Criar Usuário Dono via API (retorna token HMAC autenticado)
      const ownerRes = await fetch(`${baseUrl}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Maria Feirante', email: 'maria@cestaon.com', pin: '123456' })
      });
      assert.equal(ownerRes.status, 201);
      const owner = await ownerRes.json();

      // 2. Criar Usuário Familiar Convidado via API
      const guestRes = await fetch(`${baseUrl}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'João Familiar', email: 'joao@cestaon.com', pin: '654321' })
      });
      assert.equal(guestRes.status, 201);
      const guest = await guestRes.json();

      // 3. Criar feira aberta
      const createRes = await fetch(`${baseUrl}/lists`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${owner.token}`,
          'X-User-Id': owner.id
        },
        body: JSON.stringify({
          title: 'Feira de Domingo da Família',
          owner_id: owner.id,
          budget_cents: 25000
        })
      });

      assert.equal(createRes.status, 201, 'Deve criar a feira com sucesso');
      const createdList = await createRes.json();

      assert.equal(createdList.status, 'active', 'A feira deve nascer com status active (aberta)');
      assert.ok(createdList.share_code, 'A feira deve ter um código de compartilhamento');
      assert.ok(createdList.share_code.length >= 6, 'O código de compartilhamento deve ter pelo menos 6 caracteres');

      // 4. Consultar participantes da feira aberta
      const sharesRes = await fetch(`${baseUrl}/lists/${createdList.id}/shares`, {
        headers: {
          'Authorization': `Bearer ${owner.token}`,
          'X-User-Id': owner.id
        }
      });
      assert.equal(sharesRes.status, 200, 'Dono deve conseguir listar participantes da feira');
      const sharesData = await sharesRes.json();
      assert.equal(sharesData.share_code, createdList.share_code, 'Código retornado deve ser o mesmo');

      // 5. Convidado ingressa na feira aberta utilizando o código de compartilhamento
      const joinRes = await fetch(`${baseUrl}/lists/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${guest.token}`,
          'X-User-Id': guest.id
        },
        body: JSON.stringify({
          share_code: createdList.share_code,
          user_id: guest.id
        })
      });

      assert.equal(joinRes.status, 200, 'Familiar deve conseguir ingressar na feira com o código');
      const joinedList = await joinRes.json();
      assert.equal(joinedList.id, createdList.id, 'Deve ser a mesma feira');

      // 6. Convidado adiciona um item à feira aberta
      const addItemRes = await fetch(`${baseUrl}/lists/${createdList.id}/items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${guest.token}`,
          'X-User-Id': guest.id
        },
        body: JSON.stringify({
          name: 'Maçã Gala',
          quantity: 2,
          unit: 'kg',
          estimated_price_cents: 1400
        })
      });

      assert.equal(addItemRes.status, 201, 'Convidado com acesso compartilhado deve conseguir adicionar itens');
      const itemData = await addItemRes.json();
      assert.equal(itemData.item.product_name, 'Maçã Gala');

      // 7. Verificar que a feira continua aberta com o item para o Dono
      const listCheckRes = await fetch(`${baseUrl}/lists/${createdList.id}`, {
        headers: {
          'Authorization': `Bearer ${owner.token}`,
          'X-User-Id': owner.id
        }
      });
      const listCheck = await listCheckRes.json();
      assert.equal(listCheck.status, 'active', 'A feira deve continuar aberta');
      assert.equal(listCheck.items.length, 1, 'A feira deve conter o item adicionado pelo familiar');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
