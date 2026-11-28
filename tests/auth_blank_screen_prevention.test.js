import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('PREVENÇÃO DE TELA ESCURA / EM BRANCO — Hardening de Autenticação e Blindagem React', async (t) => {

  await t.test('1. Existência e Estrutura do ErrorBoundary.jsx (Blank Screen Shield)', () => {
    const errorBoundaryPath = path.join(rootDir, 'client', 'src', 'components', 'ErrorBoundary.jsx');
    assert.ok(fs.existsSync(errorBoundaryPath), 'ErrorBoundary.jsx deve existir no frontend');

    const content = fs.readFileSync(errorBoundaryPath, 'utf-8');
    assert.ok(content.includes('class ErrorBoundary extends React.Component'), 'Deve ser um React Class Component');
    assert.ok(content.includes('getDerivedStateFromError'), 'Deve implementar getDerivedStateFromError');
    assert.ok(content.includes('componentDidCatch'), 'Deve implementar componentDidCatch');
    assert.ok(content.includes('handleReload'), 'Deve possuir handler de recarregamento');
    assert.ok(content.includes('handleResetSession'), 'Deve possuir handler de limpeza de sessão');
    assert.ok(content.includes('feira_auth_token'), 'Deve limpar token ao reiniciar sessão');
  });

  await t.test('2. Integração do ErrorBoundary no Ponto de Entrada main.jsx', () => {
    const mainPath = path.join(rootDir, 'client', 'src', 'main.jsx');
    const content = fs.readFileSync(mainPath, 'utf-8');

    assert.ok(content.includes("import { ErrorBoundary } from './components/ErrorBoundary.jsx'"), 'main.jsx deve importar ErrorBoundary');
    assert.ok(content.includes('<ErrorBoundary>'), 'main.jsx deve abrir a tag <ErrorBoundary>');
    assert.ok(content.includes('<App />'), 'main.jsx deve renderizar <App /> dentro do ErrorBoundary');
    assert.ok(content.includes('</ErrorBoundary>'), 'main.jsx deve fechar a tag </ErrorBoundary>');
  });

  await t.test('3. Blindagem contra listas não-array em Header.jsx (Zero Crash on filter)', () => {
    const headerPath = path.join(rootDir, 'client', 'src', 'components', 'Header.jsx');
    const content = fs.readFileSync(headerPath, 'utf-8');

    assert.ok(content.includes('Array.isArray(lists) ? lists : []'), 'Header.jsx deve normalizar lists com Array.isArray');
    assert.ok(!content.includes('const activeLists = lists.filter'), 'Header.jsx não deve chamar filter diretamente em lists sem proteção');
  });

  await t.test('4. Blindagem contra listas não-array em SavedListsView.jsx (Zero Crash on map)', () => {
    const savedPath = path.join(rootDir, 'client', 'src', 'components', 'SavedListsView.jsx');
    const content = fs.readFileSync(savedPath, 'utf-8');

    assert.ok(content.includes('Array.isArray(lists) ? lists : []'), 'SavedListsView.jsx deve normalizar lists com Array.isArray');
    assert.ok(!content.includes('{lists.map'), 'SavedListsView.jsx não deve chamar map diretamente na prop crua sem proteção');
  });

  await t.test('5. Tratamento de resposta em App.jsx:refreshLists (Imunidade a { error: ... })', () => {
    const appPath = path.join(rootDir, 'client', 'src', 'App.jsx');
    const content = fs.readFileSync(appPath, 'utf-8');

    assert.ok(content.includes('!res.ok || !Array.isArray(data)'), 'refreshLists deve checar res.ok e Array.isArray antes de setLists');
    assert.ok(content.includes('setLists([])'), 'refreshLists deve definir lista vazia em caso de resposta não-array');
    assert.ok(content.includes('setLists((prev) => (Array.isArray(prev) ? prev : []))'), 'refreshLists catch deve manter array válido');
  });

  await t.test('6. Persistência de feira_auth_token em todos os fluxos de login, cadastro e recuperação', () => {
    const loginPage = fs.readFileSync(path.join(rootDir, 'client', 'src', 'pages', 'LoginPage.jsx'), 'utf-8');
    assert.ok(loginPage.includes("localStorage.setItem('feira_auth_token', data.token)"), 'LoginPage deve salvar feira_auth_token');
    assert.ok(loginPage.includes("localStorage.setItem('feira_user_id', data.user.id)"), 'LoginPage deve salvar feira_user_id');

    const regEntry = fs.readFileSync(path.join(rootDir, 'client', 'src', 'components', 'RegisterEntryPage.jsx'), 'utf-8');
    assert.ok(regEntry.includes("localStorage.setItem('feira_auth_token', data.token)"), 'RegisterEntryPage deve salvar feira_auth_token no login');
    assert.ok(regEntry.includes("localStorage.setItem('feira_auth_token', created.token)"), 'RegisterEntryPage deve salvar feira_auth_token no cadastro');

    const regPage = fs.readFileSync(path.join(rootDir, 'client', 'src', 'pages', 'RegisterPage.jsx'), 'utf-8');
    assert.ok(regPage.includes("localStorage.setItem('feira_auth_token', createdUser.token)"), 'RegisterPage deve salvar feira_auth_token');

    const authModal = fs.readFileSync(path.join(rootDir, 'client', 'src', 'components', 'AuthModal.jsx'), 'utf-8');
    assert.ok(authModal.includes("localStorage.setItem('feira_auth_token', data.token)"), 'AuthModal deve salvar feira_auth_token no login');
    assert.ok(authModal.includes("localStorage.setItem('feira_auth_token', created.token)"), 'AuthModal deve salvar feira_auth_token no cadastro');

    const recoverPage = fs.readFileSync(path.join(rootDir, 'client', 'src', 'pages', 'RecoverPage.jsx'), 'utf-8');
    assert.ok(recoverPage.includes("localStorage.setItem('feira_auth_token', data.token)"), 'RecoverPage deve salvar feira_auth_token na redefinição');
  });

  await t.test('7. Exibição e entrega da Chave de Emergência sem unmount prematuro', () => {
    const regEntry = fs.readFileSync(path.join(rootDir, 'client', 'src', 'components', 'RegisterEntryPage.jsx'), 'utf-8');
    assert.ok(regEntry.includes('pendingCreatedUser'), 'RegisterEntryPage deve reter o usuário recém-criado em estado');
    assert.ok(regEntry.includes('onLogin(userToLogin, userToLogin.token)'), 'RegisterEntryPage deve conectar o usuário ao confirmar a chave de emergência');

    const app = fs.readFileSync(path.join(rootDir, 'client', 'src', 'App.jsx'), 'utf-8');
    assert.ok(app.includes('handleCreateUser = async (payload, autoLogin = true)'), 'handleCreateUser deve aceitar autoLogin condicional');
  });

  await t.test('8. Resiliência de handleSwitchUser contra falhas transitórias em /api/users/:id', () => {
    const app = fs.readFileSync(path.join(rootDir, 'client', 'src', 'App.jsx'), 'utf-8');
    assert.ok(app.includes('handleSwitchUser = async (user, token = null)'), 'handleSwitchUser deve aceitar token explícito');
    assert.ok(app.includes('const authToken = token || user.token'), 'handleSwitchUser deve priorizar o token recebido');
    assert.ok(app.includes('if (userRes.ok)'), 'handleSwitchUser deve checar userRes.ok antes de processar');
    assert.ok(app.includes('setCurrentUser(user)'), 'handleSwitchUser deve usar fallback seguro sem deslogar em erro de rede');
  });

});
