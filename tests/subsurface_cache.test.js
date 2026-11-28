import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeUnit,
  calculateNormalizedPrice,
  comparePackageSizesOffline
} from '../client/src/utils/subsurfaceCache.js';

test('CACHE PREDITIVO & INTELIGÊNCIA NO SUBSOLO — Testes de Normalização e Cálculos Offline', async (t) => {
  await t.test('1. Normalização de Grandezas e Unidades Base', () => {
    // Gramas para Quilos
    const gNorm = normalizeUnit(500, 'g');
    assert.equal(gNorm.baseQuantity, 0.5);
    assert.equal(gNorm.baseUnit, 'kg');

    // Mililitros para Litros
    const mlNorm = normalizeUnit(750, 'ml');
    assert.equal(mlNorm.baseQuantity, 0.75);
    assert.equal(mlNorm.baseUnit, 'L');

    // Dúzias para Unidades
    const dzNorm = normalizeUnit(2, 'dz');
    assert.equal(dzNorm.baseQuantity, 24);
    assert.equal(dzNorm.baseUnit, 'un');

    // Unidades diretas
    const kgNorm = normalizeUnit(3.5, 'kg');
    assert.equal(kgNorm.baseQuantity, 3.5);
    assert.equal(kgNorm.baseUnit, 'kg');
  });

  await t.test('2. Cálculo de Preço Normalizado por Unidade Base', () => {
    // 500g por R$ 10,00 -> R$ 20,00 por kg (2000 centavos)
    const normPrice = calculateNormalizedPrice(1000, 500, 'g');
    assert.equal(normPrice.normalizedPriceCents, 2000);
    assert.equal(normPrice.baseUnit, 'kg');

    // 250ml por R$ 5,00 -> R$ 20,00 por L (2000 centavos)
    const normDrink = calculateNormalizedPrice(500, 250, 'ml');
    assert.equal(normDrink.normalizedPriceCents, 2000);
    assert.equal(normDrink.baseUnit, 'L');
  });

  await t.test('3. Comparador Inteligente de Embalagens Offline (Modo Subsolo)', () => {
    // Exemplo clássico: Opção A (1 kg por R$ 6,50) vs Opção B (5 kg por R$ 31,00)
    // Opção A: R$ 6,50/kg
    // Opção B: R$ 6,20/kg -> Opção B é mais vantajosa!
    const res = comparePackageSizesOffline({
      optionA: { priceCents: 650, quantity: 1, unit: 'kg' },
      optionB: { priceCents: 3100, quantity: 5, unit: 'kg' }
    });

    assert.equal(res.canCompare, true);
    assert.equal(res.bestOption, 'B');
    assert.equal(res.baseUnit, 'kg');
    assert.equal(res.optionA.pricePerBaseUnitCents, 650);
    assert.equal(res.optionB.pricePerBaseUnitCents, 620);
    assert.ok(res.percentSavings > 0, 'Economia deve ser percentualmente positiva');
    assert.ok(res.isOfflineCalc, 'Deve marcar como cálculo offline');
  });

  await t.test('4. Comparador de Embalagens com Unidades Diferentes mas Compatíveis (g vs kg)', () => {
    // Opção A: 500g por R$ 7,00 (R$ 14,00 / kg)
    // Opção B: 1kg por R$ 12,00 (R$ 12,00 / kg) -> B é mais vantajosa!
    const res = comparePackageSizesOffline({
      optionA: { priceCents: 700, quantity: 500, unit: 'g' },
      optionB: { priceCents: 1200, quantity: 1, unit: 'kg' }
    });

    assert.equal(res.canCompare, true);
    assert.equal(res.bestOption, 'B');
    assert.equal(res.baseUnit, 'kg');
    assert.equal(res.optionA.pricePerBaseUnitCents, 1400);
    assert.equal(res.optionB.pricePerBaseUnitCents, 1200);
  });

  await t.test('5. Rejeição Segura de Unidades Incompatíveis no Subsolo', () => {
    // Comparar kg com Litro não faz sentido físico
    const res = comparePackageSizesOffline({
      optionA: { priceCents: 1000, quantity: 1, unit: 'kg' },
      optionB: { priceCents: 1000, quantity: 1, unit: 'L' }
    });

    assert.equal(res.canCompare, false);
    assert.ok(res.message.includes('Unidades incompatíveis'));
  });

  await t.test('6. Proteção Matemática contra Valores Inválidos e Divisão por Zero', () => {
    const resZero = calculateNormalizedPrice(0, 0, 'kg');
    assert.equal(resZero.normalizedPriceCents, 0);

    const resNegative = calculateNormalizedPrice(-500, -2, 'kg');
    assert.equal(resNegative.normalizedPriceCents, 0);
  });
});
