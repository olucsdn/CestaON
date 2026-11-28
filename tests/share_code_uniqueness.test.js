import test from 'node:test';
import assert from 'node:assert/strict';
import { getDatabase, closeDatabase } from '../server/db/database.js';
import { seedDatabase } from '../server/db/seed.js';
import { ListRepository } from '../server/repositories/listRepository.js';

test('PREVENÇÃO E DETECÇÃO DE CÓDIGOS DE FEIRA DUPLICADOS (SHARE_CODE UNIQUENESS)', async (t) => {
  const db = getDatabase(':memory:');
  seedDatabase(db);
  const listRepo = new ListRepository(db);

  await t.test('1. generateShareCode() nunca retorna código já existente no banco', () => {
    const fixedCode = 'ABC123';
    db.prepare(`
      INSERT INTO shopping_lists (id, title, owner_id, status, share_code)
      VALUES ('list_mock_1', 'Feira Teste', 'usr_default', 'active', ?)
    `).run(fixedCode);

    const exists = db.prepare("SELECT id FROM shopping_lists WHERE UPPER(REPLACE(share_code, '-', '')) = ?").get(fixedCode);
    assert.ok(exists, 'O código inserido deve existir no banco');

    for (let i = 0; i < 100; i++) {
      const newCode = listRepo.generateShareCode();
      assert.notEqual(newCode, fixedCode, `generateShareCode não deve gerar código colidente com ${fixedCode}`);
      assert.ok(newCode.length >= 6, 'Código gerado deve ter pelo menos 6 caracteres');
    }
  });

  await t.test('2. Criação sequencial e em lote de listas gera códigos estritamente únicos', () => {
    const createdCodes = new Set();
    const totalLists = 30;

    for (let i = 0; i < totalLists; i++) {
      const list = listRepo.create({
        title: `Feira Concorrente ${i}`,
        owner_id: 'usr_default',
        budget_cents: 10000
      });

      assert.ok(list.share_code, 'Lista deve ter share_code gerado');
      assert.ok(!createdCodes.has(list.share_code), `share_code ${list.share_code} já havia sido gerado antes!`);
      createdCodes.add(list.share_code);
    }

    assert.equal(createdCodes.size, totalLists, 'Todos os códigos gerados devem ser mutuamente exclusivos');
  });

  await t.test('3. Integridade do banco contra colisões forçadas', () => {
    const list = listRepo.create({
      title: 'Feira Integridade',
      owner_id: 'usr_default'
    });

    assert.throws(
      () => {
        db.prepare(`
          INSERT INTO shopping_lists (id, title, owner_id, status, share_code)
          VALUES ('list_mock_dup', 'Duplicata Forçada', 'usr_default', 'active', ?)
        `).run(list.share_code);
      },
      /UNIQUE constraint failed/
    );
  });

  t.after(() => {
    closeDatabase(db);
  });
});
