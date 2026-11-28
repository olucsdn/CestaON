import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('GUIA E TUTORIAL DO USUÁRIO — Validação do Módulo "Como Usar o CestaON"', async (t) => {
  const rootDir = process.cwd();
  const tutorialComponentPath = path.join(rootDir, 'client', 'src', 'components', 'TutorialGuideModal.jsx');
  const modalManagerPath = path.join(rootDir, 'client', 'src', 'hooks', 'useModalManager.js');
  const headerPath = path.join(rootDir, 'client', 'src', 'components', 'Header.jsx');
  const appPath = path.join(rootDir, 'client', 'src', 'App.jsx');

  await t.test('1. Existência e Integridade Estrutural do TutorialGuideModal.jsx', () => {
    assert.ok(fs.existsSync(tutorialComponentPath), 'TutorialGuideModal.jsx deve existir no disco');
    const content = fs.readFileSync(tutorialComponentPath, 'utf-8');

    // Validação de exportação e nome do componente
    assert.match(content, /export function TutorialGuideModal\(/, 'Deve exportar o componente TutorialGuideModal');

    // Validação dos tópicos e seções mandatórias do guia
    assert.ok(content.includes('TUTORIAL_SECTIONS'), 'Deve definir as seções do tutorial');
    assert.ok(content.includes('Visão Geral'), 'Deve conter seção de Visão Geral');
    assert.ok(content.includes('Planejar Lista'), 'Deve conter seção de Planejar Lista');
    assert.ok(content.includes('No Supermercado'), 'Deve conter seção No Supermercado');
    assert.ok(content.includes('Gastos e Orçamento'), 'Deve conter seção Gastos e Orçamento');
    assert.ok(content.includes('Inteligência e Ferramentas'), 'Deve conter seção de Inteligência e Ferramentas');
    assert.ok(content.includes('Modo Subsolo e Família'), 'Deve conter seção Modo Subsolo e Família');
    assert.ok(content.includes('Perguntas Frequentes'), 'Deve conter seção de Perguntas Frequentes');

    // Slogan oficial
    assert.ok(content.includes('No CestaON, o preço é bom.'), 'Deve exibir o slogan da marca');
    // Cobertura dos recursos essenciais
    assert.ok(content.includes('Calculadora de Embalagens'), 'Deve ensinar a Calculadora de Embalagens');
    assert.ok(content.includes('Simulador "Onde Comprar"'), 'Deve ensinar o Simulador Onde Comprar');
    assert.ok(content.includes('Modo Subsolo'), 'Deve explicar a operação 100% offline no Subsolo');
  });

  await t.test('2. Integração no Hook useModalManager.js', () => {
    assert.ok(fs.existsSync(modalManagerPath), 'useModalManager.js deve existir no disco');
    const content = fs.readFileSync(modalManagerPath, 'utf-8');

    assert.match(content, /tutorial:\s*false/, 'Deve registrar o estado tutorial em useModalManager');
  });

  await t.test('3. Integração de Acesso no Header.jsx', () => {
    assert.ok(fs.existsSync(headerPath), 'Header.jsx deve existir no disco');
    const content = fs.readFileSync(headerPath, 'utf-8');

    assert.ok(content.includes('onOpenTutorial'), 'Header deve receber onOpenTutorial como prop');
    assert.ok(content.includes('Como usar o app'), 'Menu de ferramentas deve ter item para Como usar o app');
    assert.ok(content.includes('HelpCircle'), 'Deve utilizar o ícone HelpCircle para acessibilidade visual');
  });

  await t.test('4. Integração no Componente Raiz App.jsx', () => {
    assert.ok(fs.existsSync(appPath), 'App.jsx deve existir no disco');
    const content = fs.readFileSync(appPath, 'utf-8');

    assert.ok(content.includes('TutorialGuideModal'), 'App.jsx deve importar o TutorialGuideModal');
    assert.ok(content.includes('modals.tutorial &&'), 'App.jsx deve renderizar o TutorialGuideModal condicionalmente');
    assert.ok(content.includes('onOpenTutorial={() => openModal(\'tutorial\')}'), 'App.jsx deve conectar o gatilho ao Header');
  });
});
