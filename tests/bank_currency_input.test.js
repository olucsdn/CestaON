import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  formatCentsToBankInput,
  maskBankCurrencyInput,
  parseBankCurrencyToCents
} from '../client/src/utils/formatters.js';

test('BANK CURRENCY MASK — Progressão dígito a dígito (centavos -> reais -> milhares)', () => {
  let val = '';
  const steps = [
    ['1', '0,01'],
    ['2', '0,12'],
    ['3', '1,23'],
    ['4', '12,34'],
    ['5', '123,45'],
    ['6', '1.234,56'],
    ['7', '12.345,67']
  ];

  for (const [digit, expected] of steps) {
    val = maskBankCurrencyInput(`${val}${digit}`);
    assert.equal(val, expected);
  }

  // Backspace reduz uma casa por vez
  val = maskBankCurrencyInput(val.slice(0, -1));
  assert.equal(val, '1.234,56');

  // Apagar tudo retorna vazio (exibe placeholder 0,00)
  assert.equal(maskBankCurrencyInput('0,0'), '');
  assert.equal(maskBankCurrencyInput(''), '');
});

test('BANK CURRENCY MASK — Conversão exata para centavos inteiros sem erro de ponto flutuante', () => {
  assert.equal(parseBankCurrencyToCents('0,01'), 1);
  assert.equal(parseBankCurrencyToCents('19,99'), 1999);
  assert.equal(parseBankCurrencyToCents('1.234,56'), 123456);
  assert.equal(parseBankCurrencyToCents(''), 0);

  assert.equal(formatCentsToBankInput(0), '');
  assert.equal(formatCentsToBankInput(5), '0,05');
  assert.equal(formatCentsToBankInput(1999), '19,99');
  assert.equal(formatCentsToBankInput(123456), '1.234,56');
});

test('BANK CURRENCY MASK — Todos os campos monetários da UI usam máscara estilo banco', () => {
  const components = [
    'CartPricePromptModal.jsx',
    'BudgetBanner.jsx',
    'BudgetView.jsx',
    'FinishListModal.jsx',
    'MarketModeView.jsx',
    'NewListModal.jsx',
    'NormalModeView.jsx',
    'PackageCalculatorModal.jsx'
  ];

  for (const file of components) {
    const content = fs.readFileSync(path.resolve('client/src/components', file), 'utf8');
    assert.match(content, /maskBankCurrencyInput/, `${file} deve usar maskBankCurrencyInput`);
    assert.match(content, /parseBankCurrencyToCents/, `${file} deve usar parseBankCurrencyToCents`);
  }
});
