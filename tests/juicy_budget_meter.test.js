import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('BARRA DE ORÇAMENTO SUCULENTA ("JUICE") — Modo No Mercado (MarketModeView)', async (t) => {
  const rootDir = process.cwd();
  const marketModePath = path.join(rootDir, 'client', 'src', 'components', 'MarketModeView.jsx');
  const appPath = path.join(rootDir, 'client', 'src', 'App.jsx');
  const cssPath = path.join(rootDir, 'client', 'src', 'index.css');

  await t.test('1. Existência e Integridade Estrutural do MarketModeView.jsx', () => {
    assert.ok(fs.existsSync(marketModePath), 'MarketModeView.jsx deve existir');
    const content = fs.readFileSync(marketModePath, 'utf-8');

    // Props: onUpdateBudget
    assert.match(
      content,
      /onUpdateBudget/,
      'MarketModeView deve aceitar onUpdateBudget para ajuste dinâmico do teto'
    );

    // Cálculos de orçamento e gastos
    assert.match(content, /budgetCents/, 'Deve calcular o teto em centavos (budgetCents)');
    assert.match(content, /totalSpentCents/, 'Deve calcular o total gasto no carrinho (totalSpentCents)');
    assert.match(content, /isOverBudget/, 'Deve detectar quando o orçamento for ultrapassado (isOverBudget)');
    assert.match(content, /excessCents/, 'Deve calcular o valor excedente quando estourar o teto');
  });

  await t.test('2. Progressão Dinâmica de Cores (Verde -> Amarelo -> Laranja -> Vermelho)', () => {
    const content = fs.readFileSync(marketModePath, 'utf-8');

    // Verde (<50%)
    assert.ok(
      content.includes('from-emerald-400') || content.includes('emerald'),
      'Deve incluir escala verde esmeralda para gastos seguros (<50%)'
    );

    // Amarelo (50-74%)
    assert.ok(
      content.includes('from-amber-400') || content.includes('yellow'),
      'Deve incluir escala amarela para gastos médios (50-74%)'
    );

    // Laranja (75-99%)
    assert.ok(
      content.includes('from-amber-500') || content.includes('orange'),
      'Deve incluir escala laranja para zona de perigo (75-99%)'
    );

    // Vermelho (>=100%)
    assert.ok(
      content.includes('from-red-500') || content.includes('red'),
      'Deve incluir escala vermelha vibrante para teto estourado (>=100%)'
    );
  });

  await t.test('3. Suculência (Game-feel Juice) & Micro-feedbacks Visuais', () => {
    const content = fs.readFileSync(marketModePath, 'utf-8');

    // Pop no valor
    assert.match(content, /isPopping/, 'Deve gerenciar estado isPopping');
    assert.match(content, /animate-juice-pop/, 'Deve aplicar animação juice-pop ao alterar valor');

    // Partícula flutuante
    assert.match(content, /floatingDelta/, 'Deve exibir partícula flutuante de acréscimo');
    assert.match(content, /animate-float-particle/, 'Deve aplicar animate-float-particle');

    // Card fixo (sem tremor) e efeito leve de confete (sem emojis)
    assert.ok(!content.includes('animate-screen-shake'), 'Card deve permanecer fixo sem tremor');
    assert.ok(!content.includes('animate-wobble-boom'), 'Card de aviso deve permanecer fixo sem balanço');
    assert.match(content, /showOverConfetti/, 'Deve ter estado para confete leve ao estourar o teto');
    assert.match(content, /animate-confetti-fall/, 'Deve aplicar animate-confetti-fall');
  });

  await t.test('4. Frase de Aviso ao Estourar o Teto (Passou do teto, calma no caixa)', () => {
    const content = fs.readFileSync(marketModePath, 'utf-8');

    assert.ok(
      content.includes('Passou do teto, calma no caixa'),
      'Deve exibir a frase curta e bem-humorada sem cortar no mobile'
    );
    assert.ok(
      !content.includes('Quem converte não se diverte!'),
      'Deve remover frases antigas de piadas rotativas'
    );
  });

  await t.test('5. Ajuste Rápido de Teto Inline e Delegação no App.jsx', () => {
    const marketContent = fs.readFileSync(marketModePath, 'utf-8');
    const appContent = fs.readFileSync(appPath, 'utf-8');

    assert.match(marketContent, /isEditingCeiling/, 'Deve permitir edição rápida do teto');
    assert.match(marketContent, /Salvar Teto/, 'Deve ter botão de salvar teto');
    assert.ok(appContent.includes('onUpdateBudget={handleUpdateBudget}'), 'App.jsx deve passar onUpdateBudget para MarketModeView');
  });

  await t.test('6. Definições de Animação CSS em index.css', () => {
    assert.ok(fs.existsSync(cssPath), 'index.css deve existir');
    const cssContent = fs.readFileSync(cssPath, 'utf-8');

    assert.ok(cssContent.includes('@keyframes screenShake'), 'Deve conter keyframe screenShake');
    assert.ok(cssContent.includes('@keyframes juicePop'), 'Deve conter keyframe juicePop');
    assert.ok(cssContent.includes('@keyframes floatParticle'), 'Deve conter keyframe floatParticle');
    assert.ok(cssContent.includes('@keyframes wobbleBoom'), 'Deve conter keyframe wobbleBoom');
    assert.ok(cssContent.includes('@keyframes flyingMoney'), 'Deve conter keyframe flyingMoney');
    assert.ok(cssContent.includes('@keyframes shimmerGlow'), 'Deve conter keyframe shimmerGlow');
    assert.ok(
      !cssContent.includes('wobbleBoom 1.4s ease-in-out infinite'),
      'Animação do card cômico deve ocorrer apenas na entrada, sem loop infinito'
    );
    assert.ok(cssContent.includes('@keyframes microCelebration'), 'Deve conter keyframe microCelebration');
    assert.ok(cssContent.includes('.btn-tactile'), 'Deve conter utilitário btn-tactile para press físico suave');
  });

  await t.test('7. Suíte de Micro-interações Sutis e Elegantes (Haptics, Celebração e Botões)', () => {
    const hapticsPath = path.join(rootDir, 'client', 'src', 'utils', 'haptics.js');
    assert.ok(fs.existsSync(hapticsPath), 'haptics.js deve existir');
    const hapticsContent = fs.readFileSync(hapticsPath, 'utf-8');
    assert.ok(hapticsContent.includes('triggerHaptic'), 'Deve exportar função triggerHaptic');

    const marketContent = fs.readFileSync(marketModePath, 'utf-8');
    assert.match(marketContent, /showCelebration/, 'MarketModeView deve exibir celebração suave ao concluir lista');
    assert.match(marketContent, /triggerHaptic/, 'MarketModeView deve utilizar feedback háptico');

    const calcPath = path.join(rootDir, 'client', 'src', 'components', 'PackageCalculatorModal.jsx');
    const calcContent = fs.readFileSync(calcPath, 'utf-8');
    assert.match(calcContent, /🏆/, 'PackageCalculatorModal deve destacar opção mais econômica com badge sutil');

    const sharePath = path.join(rootDir, 'client', 'src', 'components', 'ShareModal.jsx');
    const shareContent = fs.readFileSync(sharePath, 'utf-8');
    assert.match(shareContent, /✓ Copiado!/, 'ShareModal deve fornecer feedback visual instantâneo de cópia');

    const normalPath = path.join(rootDir, 'client', 'src', 'components', 'NormalModeView.jsx');
    const normalContent = fs.readFileSync(normalPath, 'utf-8');
    assert.match(normalContent, /btn-tactile/, 'NormalModeView deve aplicar classes táteis nos atalhos');
  });
});
