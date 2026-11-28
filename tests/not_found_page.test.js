import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('PÁGINA 404 PERSONALIZADA E TEMÁTICA (CESTAON TRISTE & CORREDOR VAZIO)', async (t) => {
  const rootDir = process.cwd();
  const notFoundPagePath = path.join(rootDir, 'client', 'src', 'pages', 'NotFoundPage.jsx');
  const appPath = path.join(rootDir, 'client', 'src', 'App.jsx');

  await t.test('1. Existência e Integridade Estrutural de NotFoundPage.jsx', () => {
    assert.ok(fs.existsSync(notFoundPagePath), 'NotFoundPage.jsx deve existir no diretório client/src/pages/');
    const content = fs.readFileSync(notFoundPagePath, 'utf-8');

    assert.match(content, /export function NotFoundPage/, 'Deve exportar a função NotFoundPage');
    assert.match(content, /currentUser/, 'Deve aceitar prop currentUser para adaptar os botões de ação');
    assert.match(content, /theme/, 'Deve aceitar prop theme para suporte a dark/light mode');
    assert.match(content, /onToggleTheme/, 'Deve aceitar callback onToggleTheme');
    assert.match(content, /onNavigate/, 'Deve aceitar callback onNavigate para navegação SPA segura');
    assert.match(content, /currentPath/, 'Deve exibir o caminho da rota que não foi encontrada');
  });

  await t.test('2. Elementos Temáticos de Melancolia e Tristeza do Programa', () => {
    const content = fs.readFileSync(notFoundPagePath, 'utf-8');

    // Badge de erro temático
    assert.match(content, /404/, 'Deve mencionar o código de erro 404');
    assert.match(content, /Corredor Vazio/i, 'Deve contextualizar o erro 404 no tema de supermercado/feira');

    // Elementos visuais SVG da cestinha triste
    assert.match(content, /<svg/i, 'Deve conter ilustração SVG artesanal da cestinha');
    assert.match(content, /lagriminha|lágrima|tear/i, 'Deve conter representação de lágrima da cestinha');
    assert.match(content, /folhinha|leaf/i, 'Deve representar cesta desprovida de produtos');

    // Textos emotivos da aplicação
    assert.match(content, /procurou em cada prateleira/i, 'Deve conter a narrativa do programa procurando pela página');
    assert.match(content, /empurrando rodinhas no vazio|sozinho/i, 'Deve transmitir o sentimento de tristeza e solidão do programa');
  });

  await t.test('3. Mecânica Interativa de Conforto e Consolo da Cestinha', () => {
    const content = fs.readFileSync(notFoundPagePath, 'utf-8');

    assert.match(content, /comforted/i, 'Deve possuir estado de conforto/consolo');
    assert.match(content, /handleComfort/i, 'Deve ter função para consolar o CestaON');
    assert.match(content, /triggerHaptic/i, 'Deve acionar vibração háptica tátil ao consolar');
    assert.match(content, /Heart|Coração/i, 'Deve exibir coração/carinho ao ser consolado');
    assert.match(content, /obrigado pelo carinho/i, 'Deve reagir com mensagem carinhosa ao ser reconfortado');
  });

  await t.test('4. Ergonomia de Navegação e Retorno ao Aplicativo', () => {
    const content = fs.readFileSync(notFoundPagePath, 'utf-8');

    assert.match(content, /onNavigate\('\/'\)/, 'Deve permitir retornar à página inicial / feiras');
    assert.match(content, /Voltar para/i, 'Deve ter botão claro para voltar');
    assert.match(content, /onNavigate\('\/login'\)/, 'Deve oferecer atalho para login quando deslogado');
  });

  await t.test('5. Integração com o Roteamento SPA no App.jsx', () => {
    assert.ok(fs.existsSync(appPath), 'App.jsx deve existir');
    const appContent = fs.readFileSync(appPath, 'utf-8');

    assert.match(appContent, /import \{ NotFoundPage \} from '\.\/pages\/NotFoundPage\.jsx';/, 'Deve importar NotFoundPage');
    assert.match(appContent, /normalizedPath/, 'Deve normalizar o caminho para evitar erros com trailing slash');
    assert.match(appContent, /<NotFoundPage/, 'Deve renderizar NotFoundPage para rotas não reconhecidas');
    assert.match(appContent, /currentPath=\{currentPath\}/, 'Deve repassar currentPath para NotFoundPage');
  });
});
