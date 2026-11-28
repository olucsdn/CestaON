import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('CORREÇÕES DE UI — "Mais Econômico" Elegante e Ocultação de Erros Técnicos Internos', async (t) => {
  await t.test('1. WhereToBuyModal.jsx: Estilização elegante de "Mais Econômico" sem quebra de linha', () => {
    const modalPath = path.join(rootDir, 'client', 'src', 'components', 'WhereToBuyModal.jsx');
    assert.ok(fs.existsSync(modalPath), 'WhereToBuyModal.jsx deve existir');

    const content = fs.readFileSync(modalPath, 'utf-8');
    // Deve possuir whitespace-nowrap para impedir quebra feia em 2 linhas
    assert.ok(content.includes('whitespace-nowrap'), 'Badge "Mais Econômico" deve conter whitespace-nowrap');
    assert.ok(content.includes('TrendingDown'), 'Deve exibir ícone TrendingDown');
    assert.ok(content.includes('Mais Econômico'), 'Deve conter o texto "Mais Econômico"');
    assert.ok(content.includes('isCheapest'), 'Deve calcular isCheapest para destacar o card mais vantajoso');
  });

  await t.test('2. App.jsx: Destruturação mandatória de setShareTargetList no useModalManager', () => {
    const appPath = path.join(rootDir, 'client', 'src', 'App.jsx');
    const content = fs.readFileSync(appPath, 'utf-8');

    // Deve desestruturar setShareTargetList do hook useModalManager
    assert.ok(
      content.includes('setShareTargetList') && content.includes('useModalManager()'),
      'App.jsx deve desestruturar setShareTargetList do useModalManager'
    );
  });

  await t.test('3. ShareModal.jsx: Sanitização estrita contra vazamento de erros técnicos para o usuário', () => {
    const shareModalPath = path.join(rootDir, 'client', 'src', 'components', 'ShareModal.jsx');
    const content = fs.readFileSync(shareModalPath, 'utf-8');

    assert.ok(content.includes('isInternalTechnical'), 'Deve detectar e sanitizar erros técnicos internos');
    assert.ok(content.includes('setShareTarget'), 'Deve filtrar menções a setShareTarget');
    assert.ok(content.includes('AlertCircle'), 'Deve renderizar AlertCircle no bloco de joinError');
    assert.ok(content.match(/import\s*\{[^}]*AlertCircle[^}]*\}\s*from\s*['"]lucide-react['"]/), 'Deve importar AlertCircle de lucide-react');
    assert.ok(content.includes('Feira não existente ou indisponível'), 'Deve definir mensagem limpa "Feira não existente ou indisponível"');
    assert.ok(content.includes('Aviso ao Entrar na Feira'), 'Deve ter aria-label amigável no bloco de erro');
    assert.ok(!content.includes('{err.message || \'Código de feira não encontrado.\'}'), 'Não deve passar err.message cru sem sanitização');
  });

  await t.test('4. PackageCalculatorModal.jsx: Tratamento elegante e em português para opções de preço igual (Empate)', () => {
    const calcModalPath = path.join(rootDir, 'client', 'src', 'components', 'PackageCalculatorModal.jsx');
    const content = fs.readFileSync(calcModalPath, 'utf-8');

    // Não deve renderizar cruamente "Opção Recomendada: EQUAL" nem "EQUAL" dentro do círculo
    assert.ok(!content.includes('Opção Recomendada: {result.bestOption}'), 'Não deve exibir "Opção Recomendada: {result.bestOption}" cru');
    assert.ok(content.includes('Preços Equivalentes (Empate)'), 'Deve exibir título elegante "Preços Equivalentes (Empate)"');
    assert.ok(content.includes('Tanto Faz'), 'Deve exibir badge "Tanto Faz" no empate');
    assert.ok(content.includes('Scale'), 'Deve utilizar o ícone Scale para o empate');
  });
});
