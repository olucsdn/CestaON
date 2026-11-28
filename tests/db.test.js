import test from 'node:test';
import assert from 'node:assert/strict';
import { getDatabase, closeDatabase } from '../server/db/database.js';
import { seedDatabase } from '../server/db/seed.js';
import { CategoryRepository } from '../server/repositories/categoryRepository.js';
import { StoreRepository } from '../server/repositories/storeRepository.js';
import { ProductRepository } from '../server/repositories/productRepository.js';
import { ListRepository } from '../server/repositories/listRepository.js';
import {
  PriceRepository,
  normalizeUnit,
  calculateNormalizedPrice
} from '../server/repositories/priceRepository.js';

test('ETAPA 2 — Testes de Modelagem, Persistência e Integridade', async (t) => {
  const db = getDatabase(':memory:');
  seedDatabase(db);

  const categoryRepo = new CategoryRepository(db);
  const storeRepo = new StoreRepository(db);
  const productRepo = new ProductRepository(db);
  const listRepo = new ListRepository(db);
  const priceRepo = new PriceRepository(db);

  await t.test('1. Categorias e sementes iniciais devem ser carregadas', () => {
    const categories = categoryRepo.getAll();
    assert.ok(categories.length >= 9, 'Deve ter pelo menos 9 categorias padrão');
    const hortifruti = categories.find(c => c.id === 'cat_hortifruti');
    assert.equal(hortifruti.name, 'Hortifrúti');
    assert.equal(hortifruti.color, '#10B981');
  });

  await t.test('2. Estabelecimentos devem ser cadastrados e recuperados', () => {
    const stores = storeRepo.getAll();
    assert.ok(stores.length >= 3, 'Deve conter os estabelecimentos padrão');
    const atacadao = storeRepo.getById('store_atacadao');
    assert.equal(atacadao.name, 'Atacadão');

    const created = storeRepo.getOrCreateByName('Mercadinho da Vila');
    assert.ok(created.id);
    assert.equal(created.name, 'Mercadinho da Vila');
  });

  await t.test('3. Produtos e Heurística de Categorização Automática', () => {
    // Teste da inferência inteligente de setor
    assert.equal(productRepo.inferCategory('Tomate Italiano'), 'cat_hortifruti');
    assert.equal(productRepo.inferCategory('Peito de Frango Sadia'), 'cat_acougue');
    assert.equal(productRepo.inferCategory('Detergente Ypê Neutro'), 'cat_limpeza');
    assert.equal(productRepo.inferCategory('Café Torrado Pilão'), 'cat_graos');
    assert.equal(productRepo.inferCategory('Sabonete Dove'), 'cat_higiene');
    assert.equal(productRepo.inferCategory('Item Desconhecido XYZ'), 'cat_outros');

    // Criação de produto com inferência automática
    const newProd = productRepo.create({ name: 'Alface Americana' });
    assert.equal(newProd.category_id, 'cat_hortifruti');

    // Favoritar produto
    const toggled = productRepo.toggleFavorite(newProd.id);
    assert.equal(toggled.is_favorite, 1);
  });

  await t.test('4. Gestão de Lista de Compras, Itens e Orçamento', () => {
    // Cria lista com orçamento de R$ 100,00 (10000 centavos)
    const list = listRepo.create({
      title: 'Feira de Sábado',
      budget_cents: 10000,
      store_id: 'store_super_dia'
    });
    assert.ok(list.id);
    assert.equal(list.title, 'Feira de Sábado');
    assert.equal(list.stats.budgetCents, 10000);
    assert.equal(list.stats.totalSpentCents, 0);

    // Adiciona Tomate (2 kg)
    const tomate = productRepo.findByName('Tomate');
    const item1 = listRepo.addItem({
      list_id: list.id,
      product_id: tomate.id,
      category_id: tomate.category_id,
      quantity: 2,
      unit: 'kg',
      estimated_price_cents: 1500
    });
    assert.ok(item1.id);
    assert.equal(item1.is_purchased, 0);

    // Adiciona Arroz (5 kg)
    const arroz = productRepo.findByName('Arroz');
    const item2 = listRepo.addItem({
      list_id: list.id,
      product_id: arroz.id,
      category_id: arroz.category_id,
      quantity: 5,
      unit: 'kg',
      estimated_price_cents: 3000
    });

    // Marca Tomate como comprado por R$ 16,00 (1600 centavos)
    const purchasedItem1 = listRepo.toggleItemPurchased(item1.id, {
      is_purchased: true,
      actual_price_cents: 1600
    });
    assert.equal(purchasedItem1.is_purchased, 1);
    assert.equal(purchasedItem1.actual_price_cents, 1600);

    // Verifica estatísticas em tempo real
    const updatedList = listRepo.getById(list.id);
    assert.equal(updatedList.stats.totalItems, 2);
    assert.equal(updatedList.stats.purchasedCount, 1);
    assert.equal(updatedList.stats.remainingCount, 1);
    assert.equal(updatedList.stats.totalSpentCents, 1600);
    assert.equal(updatedList.stats.budgetUsedPercentage, 16);
    assert.equal(updatedList.stats.remainingBudgetCents, 8400);
    assert.equal(updatedList.stats.isOverBudget, false);
  });

  await t.test('5. Duplicação de Lista para Reutilização Rápida', () => {
    const listSummary = listRepo.getAll()[0];
    const originalList = listRepo.getById(listSummary.id);
    const duplicated = listRepo.duplicate(originalList.id, 'Feira de Domingo');

    assert.ok(duplicated.id);
    assert.notEqual(duplicated.id, originalList.id);
    assert.equal(duplicated.title, 'Feira de Domingo');
    assert.equal(duplicated.items.length, originalList.items.length);

    // Na lista duplicada, todos os itens devem voltar com status is_purchased = 0
    for (const item of duplicated.items) {
      assert.equal(item.is_purchased, 0);
    }
  });

  await t.test('6. Normalização Matemática de Unidades e Preço Base', () => {
    // 500g por R$ 10,00 -> Preço por kg deve ser R$ 20,00 (2000 centavos)
    const norm1 = calculateNormalizedPrice(1000, 500, 'g');
    assert.equal(norm1.baseUnit, 'kg');
    assert.equal(norm1.normalizedPriceCents, 2000);

    // 2 Litros por R$ 14,00 -> Preço por L deve ser R$ 7,00 (700 centavos)
    const norm2 = calculateNormalizedPrice(1400, 2, 'L');
    assert.equal(norm2.baseUnit, 'L');
    assert.equal(norm2.normalizedPriceCents, 700);

    // Comparação de embalagens: Pacote 1kg por R$ 6,50 vs Pacote 5kg por R$ 31,00
    const comp = priceRepo.comparePackageSizes({
      optionA: { priceCents: 650, quantity: 1, unit: 'kg' },
      optionB: { priceCents: 3100, quantity: 5, unit: 'kg' }
    });
    assert.equal(comp.canCompare, true);
    assert.equal(comp.bestOption, 'B'); // 3100 / 5 = 620 < 650
    assert.ok(comp.percentSavings > 0);
  });

  await t.test('7. Fechamento de Feira, Histórico e Comparativo Delta', () => {
    // Feira 1: Gasta R$ 100,00 no Supermercado Dia
    const list1 = listRepo.create({ title: 'Semana 1', store_id: 'store_super_dia' });
    const pArroz = productRepo.findByName('Arroz');
    const pFeijao = productRepo.findByName('Feijão');

    const it1 = listRepo.addItem({ list_id: list1.id, product_id: pArroz.id, category_id: pArroz.category_id, quantity: 1, unit: 'kg' });
    const it2 = listRepo.addItem({ list_id: list1.id, product_id: pFeijao.id, category_id: pFeijao.category_id, quantity: 1, unit: 'kg' });

    listRepo.toggleItemPurchased(it1.id, { is_purchased: true, actual_price_cents: 600 }); // R$ 6,00
    listRepo.toggleItemPurchased(it2.id, { is_purchased: true, actual_price_cents: 800 }); // R$ 8,00

    const hist1 = priceRepo.finishShoppingList(list1.id);
    assert.equal(hist1.total_spent_cents, 1400); // R$ 14,00

    // Feira 2: Gasta mais nos mesmos produtos (Semana 2)
    const list2 = listRepo.create({ title: 'Semana 2', store_id: 'store_super_dia' });
    const it2_1 = listRepo.addItem({ list_id: list2.id, product_id: pArroz.id, category_id: pArroz.category_id, quantity: 1, unit: 'kg' });
    const it2_2 = listRepo.addItem({ list_id: list2.id, product_id: pFeijao.id, category_id: pFeijao.category_id, quantity: 1, unit: 'kg' });

    listRepo.toggleItemPurchased(it2_1.id, { is_purchased: true, actual_price_cents: 700 }); // R$ 7,00 (+16.7%)
    listRepo.toggleItemPurchased(it2_2.id, { is_purchased: true, actual_price_cents: 900 }); // R$ 9,00 (+12.5%)

    const hist2 = priceRepo.finishShoppingList(list2.id);
    assert.equal(hist2.total_spent_cents, 1600); // R$ 16,00

    // Comparativo entre Feira 2 e Feira 1
    const comparison = priceRepo.compareShoppingLists(hist2.id, hist1.id);
    assert.equal(comparison.hasComparison, true);
    assert.equal(comparison.deltaCents, 200); // + R$ 2,00
    assert.ok(comparison.deltaPercentage > 14); // ~14.3%
    assert.match(comparison.humanMessage, /mais cara/);
    assert.ok(comparison.topIncreases.length > 0);
  });

  await t.test('8. Simulador Onde Comprar', () => {
    // Cria lista com Arroz e Feijão e simula Onde Comprar
    const simList = listRepo.create({ title: 'Lista Simulação' });
    const pArroz = productRepo.findByName('Arroz');
    listRepo.addItem({ list_id: simList.id, product_id: pArroz.id, category_id: pArroz.category_id, quantity: 2, unit: 'kg' });

    const simResult = priceRepo.simulateWhereToBuy(simList.id);
    assert.ok(simResult.stores.length >= 3);
    const superDia = simResult.stores.find(s => s.storeId === 'store_super_dia');
    assert.equal(superDia.matchedItemsCount, 1);
    assert.equal(superDia.isComplete, true);
  });

  await t.test('9. Exclusão de Feiras com Transação e Limpeza Segura (deleteList)', () => {
    // Cria uma lista, adiciona item, finaliza para criar purchase_history e price_history
    const toDeleteList = listRepo.create({ title: 'Lista Para Excluir', store_id: 'store_super_dia' });
    const prod = productRepo.findByName('Arroz');
    const item = listRepo.addItem({
      list_id: toDeleteList.id,
      product_id: prod.id,
      category_id: prod.category_id,
      quantity: 1,
      unit: 'kg'
    });
    listRepo.toggleItemPurchased(item.id, true);
    listRepo.updateItem(item.id, { actual_price_cents: 850 });
    priceRepo.finishShoppingList(toDeleteList.id, 'store_super_dia');

    // Executa exclusão transacional
    const deleted = listRepo.deleteList(toDeleteList.id);
    assert.equal(deleted, true);

    // Garante que a lista foi removida
    const checkList = listRepo.getById(toDeleteList.id);
    assert.equal(checkList, null);
  });

  closeDatabase();
});
