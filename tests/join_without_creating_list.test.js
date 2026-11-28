import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import { getDatabase } from '../server/db/database.js';
import { seedDatabase } from '../server/db/seed.js';
import { SocketManager } from '../server/ws/socketManager.js';
import { createApiRouter } from '../server/routes/api.js';
import { UserRepository } from '../server/repositories/userRepository.js';
import { ListRepository } from '../server/repositories/listRepository.js';

test('INGRESSO DIRETO EM FEIRAS — Sem Necessidade de Criar Feira Prévia', async (t) => {
  const rootDir = process.cwd();
  const appPath = path.join(rootDir, 'client', 'src', 'App.jsx');
  const headerPath = path.join(rootDir, 'client', 'src', 'components', 'Header.jsx');
  const savedListsPath = path.join(rootDir, 'client', 'src', 'components', 'SavedListsView.jsx');
  const newListModalPath = path.join(rootDir, 'client', 'src', 'components', 'NewListModal.jsx');

  await t.test('1. Remoção da auto-criação forçada de feiras no App.jsx', () => {
    assert.ok(fs.existsSync(appPath), 'App.jsx deve existir');
    const content = fs.readFileSync(appPath, 'utf-8');

    // Não deve conter a auto-criação forçada de feira inicial ao carregar listas vazias
    assert.ok(!content.includes('createInitialList()'), 'App.jsx não deve chamar createInitialList automaticamente');
    assert.ok(!content.includes("title: 'Minha Primeira Feira'"), 'App.jsx não deve conter título forçado Minha Primeira Feira');
  });

  await t.test('2. Presença de pontos diretos de entrada com código na interface', () => {
    const appContent = fs.readFileSync(appPath, 'utf-8');
    const headerContent = fs.readFileSync(headerPath, 'utf-8');
    const savedListsContent = fs.readFileSync(savedListsPath, 'utf-8');
    const newListModalContent = fs.readFileSync(newListModalPath, 'utf-8');

    // App.jsx: tela de nenhuma feira ativa deve ter botão para entrar com código
    assert.ok(appContent.includes('Entrar com Código'), 'App.jsx deve oferecer botão Entrar com Código no estado vazio');
    assert.ok(appContent.includes("handleOpenShareModal(null, 'join')"), 'App.jsx deve abrir modal na aba join diretamente');

    // Header.jsx: botão de entrada direta e no menu de ferramentas
    assert.ok(headerContent.includes('title="Entrar em uma feira com código"'), 'Header.jsx deve ter botão rápido para entrar com código');
    assert.ok(headerContent.includes('Entrar com código'), 'Menu de ferramentas do Header deve permitir entrar com código mesmo sem feira ativa');

    // SavedListsView.jsx: estado de zero feiras deve permitir entrar com código
    assert.ok(savedListsContent.includes('Entrar com Código'), 'SavedListsView.jsx deve oferecer botão Entrar com Código quando não há feiras');

    // NewListModal.jsx: atalho para entrar com código caso o usuário tenha aberto criar feira por engano
    assert.ok(newListModalContent.includes('onOpenJoinModal'), 'NewListModal.jsx deve aceitar callback onOpenJoinModal');
    assert.ok(newListModalContent.includes('Entrar com código'), 'NewListModal.jsx deve conter atalho para entrar com código');
  });

  await t.test('3. Fluxo de ponta a ponta: Usuário sem feiras ingressa diretamente com código de terceiro', async () => {
    // Configuração do servidor em memória para teste integrado
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
      // 1. Criar Usuário A (Dono da Feira)
      const userARes = await fetch(`${baseUrl}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Dono Da Casa', email: 'dono@casa.com', pin: '123456' })
      });
      assert.equal(userARes.status, 201);
      const userA = await userARes.json();

      // 2. Usuário A cria uma lista
      const createListRes = await fetch(`${baseUrl}/lists`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userA.token}`,
          'X-User-Id': userA.id
        },
        body: JSON.stringify({
          title: 'Feira do Mês da Família',
          budget_cents: 35000,
          owner_id: userA.id
        })
      });
      assert.equal(createListRes.status, 201);
      const listA = await createListRes.json();
      assert.ok(listA.share_code, 'Lista deve possuir share_code gerado');

      // 3. Criar Usuário B (Convidado que NUNCA criou nenhuma feira)
      const userBRes = await fetch(`${baseUrl}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Familiar Convidado', email: 'familiar@casa.com', pin: '654321' })
      });
      assert.equal(userBRes.status, 201);
      const userB = await userBRes.json();

      // 4. Verificar que Usuário B tem 0 feiras cadastradas
      const listsBInitialRes = await fetch(`${baseUrl}/lists`, {
        headers: {
          'Authorization': `Bearer ${userB.token}`,
          'X-User-Id': userB.id
        }
      });
      assert.equal(listsBInitialRes.status, 200);
      const listsBInitial = await listsBInitialRes.json();
      assert.equal(listsBInitial.length, 0, 'Usuário B não deve ter nenhuma feira prévia');

      // 5. Usuário B ingressa na feira do Usuário A com o share_code (SEM CRIAR NENHUMA FEIRA)
      const joinRes = await fetch(`${baseUrl}/lists/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userB.token}`,
          'X-User-Id': userB.id
        },
        body: JSON.stringify({
          share_code: listA.share_code,
          user_id: userB.id
        })
      });
      assert.equal(joinRes.status, 200, 'Ingresso deve ocorrer com sucesso sem feira prévia');
      const joinedList = await joinRes.json();
      assert.equal(joinedList.id, listA.id);
      assert.equal(joinedList.title, 'Feira do Mês da Família');

      // 6. Consultar listas do Usuário B: Deve conter exatamente a feira em que ele ingressou
      const listsBAfterJoinRes = await fetch(`${baseUrl}/lists`, {
        headers: {
          'Authorization': `Bearer ${userB.token}`,
          'X-User-Id': userB.id
        }
      });
      assert.equal(listsBAfterJoinRes.status, 200);
      const listsBAfterJoin = await listsBAfterJoinRes.json();
      assert.equal(listsBAfterJoin.length, 1, 'Usuário B deve ver exatamente 1 feira');
      assert.equal(listsBAfterJoin[0].id, listA.id);
      assert.equal(listsBAfterJoin[0].owner_id, userA.id, 'O dono original deve permanecer Usuário A');

      // 7. Usuário B consegue adicionar itens na feira compartilhada
      const addItemRes = await fetch(`${baseUrl}/lists/${listA.id}/items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userB.token}`,
          'X-User-Id': userB.id
        },
        body: JSON.stringify({
          name: 'Leite Desnatado 1L',
          quantity: 2,
          unit: 'un',
          estimated_price_cents: 550
        })
      });
      assert.equal(addItemRes.status, 201, 'Usuário B deve poder adicionar itens na feira compartilhada');
      const itemData = await addItemRes.json();
      assert.equal(itemData.item.custom_name, 'Leite Desnatado 1L');
    } finally {
      await new Promise((resolve) => server.close(resolve));
      try {
        db.close();
      } catch (_) {}
    }
  });
});
