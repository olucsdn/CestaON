import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeUnit as serverNormalizeUnit,
  calculateNormalizedPrice as serverCalculateNormalizedPrice,
  PriceRepository
} from '../server/repositories/priceRepository.js';
import {
  normalizeUnit as clientNormalizeUnit,
  calculateNormalizedPrice as clientCalculateNormalizedPrice,
  comparePackageSizesOffline
} from '../client/src/utils/subsurfaceCache.js';

test('PARIDADE MATEMÁTICA — Normalização de Unidades e Cálculo de Embalagens (Backend vs. Frontend)', async (t) => {
  const priceRepo = new PriceRepository(null);

  await t.test('1. Paridade Estrita de Conversão de Grandezas (normalizeUnit)', () => {
    const testCases = [
      { qty: 500, unit: 'g' },
      { qty: 1000, unit: 'gramas' },
      { qty: 2.5, unit: 'kg' },
      { qty: 3, unit: 'quilos' },
      { qty: 250, unit: 'ml' },
      { qty: 1500, unit: 'mililitros' },
      { qty: 1, unit: 'L' },
      { qty: 2, unit: 'litros' },
      { qty: 2, unit: 'dz' },
      { qty: 1, unit: 'dúzia' },
      { qty: 6, unit: 'un' },
      { qty: 10, unit: '' }
    ];

    for (const { qty, unit } of testCases) {
      const serverRes = serverNormalizeUnit(qty, unit);
      const clientRes = clientNormalizeUnit(qty, unit);

      assert.equal(serverRes.baseQuantity, clientRes.baseQuantity, `baseQuantity divergente para ${qty} ${unit}`);
      assert.equal(serverRes.baseUnit, clientRes.baseUnit, `baseUnit divergente para ${qty} ${unit}`);
    }
  });

  await t.test('2. Paridade Estrita de Cálculo de Preço Normalizado (calculateNormalizedPrice)', () => {
    const testCases = [
      { price: 650, qty: 1, unit: 'kg' },
      { price: 3100, qty: 5, unit: 'kg' },
      { price: 450, qty: 500, unit: 'g' },
      { price: 799, qty: 900, unit: 'ml' },
      { price: 1200, qty: 2, unit: 'L' },
      { price: 1800, qty: 1, unit: 'dz' },
      // Edge cases: zero, negativos e números inválidos
      { price: 0, qty: 1, unit: 'kg' },
      { price: -500, qty: 2, unit: 'kg' },
      { price: 500, qty: 0, unit: 'kg' },
      { price: 500, qty: -1, unit: 'kg' },
      { price: Infinity, qty: 1, unit: 'kg' },
      { price: 500, qty: NaN, unit: 'kg' }
    ];

    for (const { price, qty, unit } of testCases) {
      const serverRes = serverCalculateNormalizedPrice(price, qty, unit);
      const clientRes = clientCalculateNormalizedPrice(price, qty, unit);

      assert.equal(
        serverRes.normalizedPriceCents,
        clientRes.normalizedPriceCents,
        `normalizedPriceCents divergente para R$ ${price / 100} (${qty} ${unit})`
      );
      assert.equal(
        serverRes.baseUnit,
        clientRes.baseUnit,
        `baseUnit divergente para R$ ${price / 100} (${qty} ${unit})`
      );
    }
  });

  await t.test('3. Paridade Estrita do Comparador de Embalagens (comparePackageSizes)', () => {
    const comparisonCases = [
      {
        optionA: { priceCents: 650, quantity: 1, unit: 'kg' },
        optionB: { priceCents: 3100, quantity: 5, unit: 'kg' }
      },
      {
        optionA: { priceCents: 500, quantity: 500, unit: 'g' },
        optionB: { priceCents: 900, quantity: 1, unit: 'kg' }
      },
      {
        optionA: { priceCents: 1000, quantity: 1, unit: 'L' },
        optionB: { priceCents: 1000, quantity: 1, unit: 'L' }
      },
      {
        optionA: { priceCents: 1500, quantity: 1, unit: 'kg' },
        optionB: { priceCents: 1500, quantity: 1, unit: 'L' } // Incompatível
      }
    ];

    for (const { optionA, optionB } of comparisonCases) {
      const serverRes = priceRepo.comparePackageSizes({ optionA, optionB });
      const clientRes = comparePackageSizesOffline({ optionA, optionB });

      assert.equal(serverRes.canCompare, clientRes.canCompare, 'canCompare divergente');
      if (serverRes.canCompare) {
        assert.equal(serverRes.bestOption, clientRes.bestOption, 'bestOption divergente');
        assert.equal(serverRes.percentSavings, clientRes.percentSavings, 'percentSavings divergente');
        assert.equal(serverRes.baseUnit, clientRes.baseUnit, 'baseUnit divergente');
        assert.equal(
          serverRes.optionA.pricePerBaseUnitCents,
          clientRes.optionA.pricePerBaseUnitCents,
          'pricePerBaseUnitCents (A) divergente'
        );
        assert.equal(
          serverRes.optionB.pricePerBaseUnitCents,
          clientRes.optionB.pricePerBaseUnitCents,
          'pricePerBaseUnitCents (B) divergente'
        );
      }
    }
  });
});
