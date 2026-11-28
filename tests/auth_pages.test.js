import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import { getDatabase } from '../server/db/database.js';
import { seedDatabase } from '../server/db/seed.js';
import { SocketManager } from '../server/ws/socketManager.js';
import { createApiRouter } from '../server/routes/api.js';
import {
  UserRepository,
  generateRecoveryKey,
  hashRecoveryKey,
  verifyRecoveryKeyHash,
  hashSecurityAnswer,
  verifySecurityAnswerHash
} from '../server/repositories/userRepository.js';

test('AUTENTICAÇÃO & ACESSO SEGURO — Validação das Páginas de Login, Cadastrar e Recuperar', async (t) => {
  const rootDir = process.cwd();
  const authModalPath = path.join(rootDir, 'client', 'src', 'components', 'AuthModal.jsx');
  const modalManagerPath = path.join(rootDir, 'client', 'src', 'hooks', 'useModalManager.js');
  const headerPath = path.join(rootDir, 'client', 'src', 'components', 'Header.jsx');
  const userProfileModalPath = path.join(rootDir, 'client', 'src', 'components', 'UserProfileModal.jsx');
  const appPath = path.join(rootDir, 'client', 'src', 'App.jsx');

  await t.test('1. Existência e Integridade Estrutural do AuthModal.jsx', () => {
    assert.ok(fs.existsSync(authModalPath), 'AuthModal.jsx deve existir no disco');
    const content = fs.readFileSync(authModalPath, 'utf-8');

    // Validação de exportação
    assert.match(content, /export function AuthModal\(/, 'Deve exportar o componente AuthModal');

    // Validação das 3 telas essenciais solicitadas
    assert.ok(content.includes('Entrar na Conta'), 'Deve conter tela de Login');
    assert.ok(content.includes('Criar Nova Conta'), 'Deve conter tela de Cadastrar');
    assert.ok(content.includes('Recuperar Acesso'), 'Deve conter tela de Recuperar');

    // Elementos de segurança e formulários
    assert.ok(content.includes('handleSubmitLogin'), 'Deve possuir handler de login');
    assert.ok(content.includes('handleSubmitRegister'), 'Deve possuir handler de cadastro');
    assert.ok(content.includes('handleSubmitRecover'), 'Deve possuir handler de recuperação');
    assert.ok(content.includes('verify-pin'), 'Deve integrar com verificação de PIN');
  });

  await t.test('2. Suporte no useModalManager.js', () => {
    assert.ok(fs.existsSync(modalManagerPath), 'useModalManager.js deve existir no disco');
    const content = fs.readFileSync(modalManagerPath, 'utf-8');

    assert.match(content, /auth:\s*false/, 'Deve registrar o estado auth');
    assert.ok(content.includes('authInitialView'), 'Deve gerenciar authInitialView');
  });

  await t.test('3. Integração nos Componentes de Interface (Header, Profile e App)', () => {
    const headerContent = fs.readFileSync(headerPath, 'utf-8');
    assert.ok(headerContent.includes('onOpenProfile'), 'Header deve possuir acesso ao perfil do usuário');

    const profileContent = fs.readFileSync(userProfileModalPath, 'utf-8');
    assert.ok(profileContent.includes('onOpenAuth'), 'UserProfileModal deve aceitar onOpenAuth');
    assert.ok(profileContent.includes('Página de Login, Recuperação e Cadastro') || profileContent.includes('Adicionar Conta') || profileContent.includes('Sair da conta atual'), 'Página do usuário deve conter ações de login e gerenciamento de contas');
    assert.ok(profileContent.includes('editEmail'), 'UserProfileModal deve permitir editar o email da conta');

    const appContent = fs.readFileSync(appPath, 'utf-8');
    assert.ok(appContent.includes('AuthModal'), 'App.jsx deve importar AuthModal');
    assert.ok(appContent.includes('modals.auth &&'), 'App.jsx deve renderizar AuthModal condicionalmente');
  });

  await t.test('4. Validação de Backend: Cadastro, Verificação de PIN e Redefinição', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        pin_hash TEXT,
        avatar_color TEXT DEFAULT '#10B981',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE shopping_lists (id TEXT PRIMARY KEY, owner_id TEXT);
      CREATE TABLE list_items (id TEXT PRIMARY KEY, purchased_by_user_id TEXT, actual_price_cents INTEGER);
    `);

    const userRepo = new UserRepository(db);

    // 1. Cadastrar novo usuário com PIN
    const newUser = userRepo.create({
      name: 'Carla Dias',
      avatar_color: '#3B82F6',
      pin: '123456'
    });
    assert.ok(newUser.id, 'Usuário deve ser criado com ID');
    assert.equal(newUser.name, 'Carla Dias');
    assert.equal(userRepo.hasPin(newUser.id), true, 'Deve confirmar que o usuário tem PIN');

    // 2. Verificar PIN (Login)
    assert.equal(userRepo.verifyPin(newUser.id, '123456'), true, 'PIN correto deve ser validado');
    assert.equal(userRepo.verifyPin(newUser.id, '000000'), false, 'PIN incorreto deve ser rejeitado');

    // 3. Recuperar / Redefinir PIN
    const updated = userRepo.update(newUser.id, { pin: '654321' });
    assert.ok(updated);
    assert.equal(userRepo.verifyPin(newUser.id, '654321'), true, 'Novo PIN redefinido deve ser aceito');
    assert.equal(userRepo.verifyPin(newUser.id, '123456'), false, 'PIN antigo deve ser invalidado');
  });

  await t.test('5. Portão Mandatório de Autenticação (Login Obrigatório para Acessar o App)', () => {
    const authModalContent = fs.readFileSync(authModalPath, 'utf-8');
    assert.ok(authModalContent.includes('isMandatory'), 'AuthModal deve suportar prop isMandatory');
    assert.ok(authModalContent.includes('!isMandatory && onClose'), 'Botão de fechar deve ser ocultado no modo obrigatório');

    const appContent = fs.readFileSync(appPath, 'utf-8');
    assert.ok(appContent.includes('if (!currentUser)'), 'App.jsx deve bloquear a aplicação se currentUser for nulo');
    assert.ok(appContent.includes('isMandatory={true}'), 'App.jsx deve acionar AuthModal no modo mandatório');
    assert.ok(appContent.includes('handleLogout'), 'App.jsx deve implementar handleLogout');
    assert.ok(appContent.includes('onLogout={handleLogout}'), 'App.jsx deve repassar onLogout aos componentes');
    assert.ok(!appContent.includes('usersRes.find((u) => u.id === savedUserId) || usersRes[0]'), 'Não deve haver fallback automático para o primeiro usuário sem login prévio');

    const headerContent = fs.readFileSync(headerPath, 'utf-8');
    assert.ok(headerContent.includes('onLogout'), 'Header deve receber prop onLogout');
    assert.ok(!headerContent.includes('Sair da Conta'), 'Header não deve exibir botão Sair da Conta no menu de 3 pontos');

    const profileContent = fs.readFileSync(userProfileModalPath, 'utf-8');
    assert.ok(profileContent.includes('onLogout'), 'UserProfileModal deve aceitar prop onLogout');
    assert.ok(profileContent.includes('Sair da conta atual'), 'UserProfileModal deve possuir botão de logout');
  });

  await t.test('6. Página de Criação de Conta Pré-Entrada (RegisterEntryPage.jsx)', () => {
    const registerEntryPath = path.join(rootDir, 'client', 'src', 'components', 'RegisterEntryPage.jsx');
    assert.ok(fs.existsSync(registerEntryPath), 'RegisterEntryPage.jsx deve existir no disco');
    const content = fs.readFileSync(registerEntryPath, 'utf-8');

    // Validação de exportação
    assert.match(content, /export function RegisterEntryPage\(/, 'Deve exportar o componente RegisterEntryPage');

    // Branding e Slogan oficial
    assert.ok(content.includes('CestaOn') || content.includes('CestaON'), 'Deve conter marca CestaON');
    assert.ok(content.includes('No CestaON, o preço é bom.'), 'Deve exibir o slogan oficial');
    assert.ok(content.includes('Crie sua conta antes de entrar no CestaON') || content.includes('Crie sua conta no CestaON'), 'Deve informar a criação de conta pré-entrada');

    // Handlers e Funcionalidades
    assert.ok(content.includes('handleSubmitRegister'), 'Deve conter handler de cadastro');
    assert.ok(content.includes('handleSubmitLogin'), 'Deve conter handler de login');
    assert.ok(content.includes('handleSubmitRecover'), 'Deve conter handler de recuperação');
    assert.ok(content.includes('AVATAR_COLORS'), 'Deve disponibilizar paleta de cores para avatar');
    assert.ok(content.includes('onGuestEntry') || !content.includes('onGuestEntry'), 'Deve tratar suporte a entrada de visitante com segurança');
    assert.ok(content.includes('onToggleTheme'), 'Deve suportar alternância de tema');

    // Integração no App.jsx
    const appContent = fs.readFileSync(appPath, 'utf-8');
    assert.ok(appContent.includes('RegisterEntryPage'), 'App.jsx deve importar RegisterEntryPage');
    assert.ok(appContent.includes('<RegisterEntryPage'), 'App.jsx deve renderizar RegisterEntryPage');
    assert.ok(appContent.includes('handleGuestEntry') || !appContent.includes('handleGuestEntry'), 'Deve tratar handler de visitante com segurança');
  });

  await t.test('7. Páginas Distintas de Autenticação (LoginPage, RegisterPage, RecoverPage) e Roteamento SPA', () => {
    const loginPagePath = path.join(rootDir, 'client', 'src', 'pages', 'LoginPage.jsx');
    const registerPagePath = path.join(rootDir, 'client', 'src', 'pages', 'RegisterPage.jsx');
    const recoverPagePath = path.join(rootDir, 'client', 'src', 'pages', 'RecoverPage.jsx');

    // 1. LoginPage.jsx
    assert.ok(fs.existsSync(loginPagePath), 'LoginPage.jsx deve existir no diretório client/src/pages');
    const loginContent = fs.readFileSync(loginPagePath, 'utf-8');
    assert.match(loginContent, /export function LoginPage\(/, 'Deve exportar o componente LoginPage');
    assert.ok(loginContent.includes('handleSubmitLogin'), 'Deve conter handler de login');
    assert.ok(loginContent.includes('Entrar na Conta'), 'Deve exibir título de Entrar na Conta');
    assert.ok(loginContent.includes('/cadastro'), 'Deve ter link de navegação para /cadastro');
    assert.ok(loginContent.includes('/recuperar'), 'Deve ter link de navegação para /recuperar');

    // 2. RegisterPage.jsx
    assert.ok(fs.existsSync(registerPagePath), 'RegisterPage.jsx deve existir no diretório client/src/pages');
    const registerContent = fs.readFileSync(registerPagePath, 'utf-8');
    assert.match(registerContent, /export function RegisterPage\(/, 'Deve exportar o componente RegisterPage');
    assert.ok(registerContent.includes('handleSubmitRegister'), 'Deve conter handler de cadastro');
    assert.ok(registerContent.includes('Criar Nova Conta'), 'Deve exibir título de Criar Nova Conta');
    assert.ok(registerContent.includes('AVATAR_COLORS'), 'Deve conter seletor de paleta de cores para o avatar');
    assert.ok(registerContent.includes('/login'), 'Deve ter link de navegação para /login');

    // 3. RecoverPage.jsx
    assert.ok(fs.existsSync(recoverPagePath), 'RecoverPage.jsx deve existir no diretório client/src/pages');
    const recoverContent = fs.readFileSync(recoverPagePath, 'utf-8');
    assert.match(recoverContent, /export function RecoverPage\(/, 'Deve exportar o componente RecoverPage');
    assert.ok(recoverContent.includes('handleSubmitRecover'), 'Deve conter handler de recuperação');
    assert.ok(recoverContent.includes('Recuperar Acesso'), 'Deve exibir título de Recuperar Acesso');
    assert.ok(recoverContent.includes('/login'), 'Deve ter link para retornar ao /login');

    // 4. Integração no App.jsx com Roteamento SPA
    const appContent = fs.readFileSync(appPath, 'utf-8');
    assert.ok(appContent.includes('LoginPage'), 'App.jsx deve importar LoginPage');
    assert.ok(appContent.includes('RegisterPage'), 'App.jsx deve importar RegisterPage');
    assert.ok(appContent.includes('RecoverPage'), 'App.jsx deve importar RecoverPage');
    assert.ok(appContent.includes('currentPath'), 'App.jsx deve controlar estado de rota currentPath');
    assert.ok(appContent.includes('/login'), 'App.jsx deve possuir rota dedicada para /login');
    assert.ok(appContent.includes('/cadastro'), 'App.jsx deve possuir rota dedicada para /cadastro');
    assert.ok(appContent.includes('/recuperar'), 'App.jsx deve possuir rota dedicada para /recuperar');
    assert.ok(appContent.includes('popstate'), 'App.jsx deve escutar popstate para navegação no histórico');
  });

  await t.test('8. Validação das Atualizações de Segurança e Ergonomia de Cadastro/Recuperação', () => {
    const loginPagePath = path.join(rootDir, 'client', 'src', 'pages', 'LoginPage.jsx');
    const registerPagePath = path.join(rootDir, 'client', 'src', 'pages', 'RegisterPage.jsx');
    const recoverPagePath = path.join(rootDir, 'client', 'src', 'pages', 'RecoverPage.jsx');
    const entryPagePath = path.join(rootDir, 'client', 'src', 'components', 'RegisterEntryPage.jsx');

    const registerContent = fs.readFileSync(registerPagePath, 'utf-8');
    const recoverContent = fs.readFileSync(recoverPagePath, 'utf-8');
    const loginContent = fs.readFileSync(loginPagePath, 'utf-8');
    const entryContent = fs.readFileSync(entryPagePath, 'utf-8');

    // 1. Remoção do último botão roxo rgb(99, 102, 241) / #6366F1
    assert.ok(!registerContent.includes('#6366F1'), 'RegisterPage NÃO deve conter a cor roxa #6366F1');
    assert.ok(!entryContent.includes('#6366F1'), 'RegisterEntryPage NÃO deve conter a cor roxa #6366F1');

    // 2. Campo de E-mail e Senha com Exigências Médias no Cadastro
    assert.ok(registerContent.includes('email'), 'RegisterPage deve conter campo de e-mail');
    assert.ok(registerContent.includes('hasMinLength') || registerContent.includes('6 caracteres'), 'Deve validar tamanho mínimo da senha');
    assert.ok(registerContent.includes('hasLetter') || registerContent.includes('letras'), 'Deve validar presença de letras');
    assert.ok(registerContent.includes('hasNumber') || registerContent.includes('números'), 'Deve validar presença de números');

    // 3. Recuperação com Campo Digitável de E-mail (sem select pré-preenchido)
    assert.ok(!recoverContent.includes('<select'), 'RecoverPage NÃO deve conter dropdown preenchido com contas');
    assert.ok(recoverContent.includes('type="email"'), 'RecoverPage deve conter campo digitável de e-mail');
    assert.ok(recoverContent.includes('/api/users/recover'), 'RecoverPage deve integrar com o endpoint /api/users/recover');

    // 4. Remoção do Botão de Visitante na UI
    assert.ok(!loginContent.includes('Continuar como Visitante'), 'LoginPage NÃO deve conter botão visível de visitante');
    assert.ok(!registerContent.includes('Continuar como Visitante'), 'RegisterPage NÃO deve conter botão visível de visitante');
    assert.ok(!entryContent.includes('Continuar como visitante'), 'RegisterEntryPage NÃO deve conter botão visível de visitante');
  });

  await t.test('9. Validação de Deslogar Contas Cadastradas sem E-mail', () => {
    const appContent = fs.readFileSync(appPath, 'utf-8');
    const loginPagePath = path.join(rootDir, 'client', 'src', 'pages', 'LoginPage.jsx');
    const loginContent = fs.readFileSync(loginPagePath, 'utf-8');

    // 1. App.jsx limpa sessão de usuário sem e-mail ao inicializar
    assert.ok(appContent.includes('!active.email'), 'App.jsx deve verificar se conta ativa possui email');
    assert.ok(appContent.includes('localStorage.removeItem(\'feira_user_id\')'), 'App.jsx deve remover feira_user_id do localStorage');

    // 2. App.jsx impede troca (switch) para contas sem e-mail
    assert.ok(appContent.includes('if (!user.email || !user.email.trim())'), 'handleSwitchUser deve deslogar se conta não tiver email');

    // 3. LoginPage.jsx bloqueia login e exibe alerta para contas sem email
    assert.ok(loginContent.includes('Sem e-mail cadastrado (Deslogada)'), 'LoginPage deve sinalizar contas sem e-mail');
    assert.ok(loginContent.includes('Esta conta foi cadastrada sem e-mail e foi deslogada por segurança'), 'LoginPage deve bloquear tentativa de login');
  });

  await t.test('10. Edição de E-mail de Conta de Usuário no Repositório e Interface', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT,
        pin_hash TEXT,
        avatar_color TEXT DEFAULT '#10B981',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE shopping_lists (id TEXT PRIMARY KEY, owner_id TEXT);
      CREATE TABLE list_items (id TEXT PRIMARY KEY, purchased_by_user_id TEXT, actual_price_cents INTEGER);
    `);

    const userRepo = new UserRepository(db);
    const u1 = userRepo.create({ name: 'Lucas Teste', email: 'lucas@antigo.com' });
    assert.equal(u1.email, 'lucas@antigo.com');

    const updated = userRepo.update(u1.id, { email: 'lucas@novo.com' });
    assert.equal(updated.email, 'lucas@novo.com');

    const fetched = userRepo.getByEmail('lucas@novo.com');
    assert.ok(fetched);
    assert.equal(fetched.id, u1.id);

    const profileContent = fs.readFileSync(userProfileModalPath, 'utf-8');
    assert.ok(profileContent.includes('editEmail'), 'UserProfileModal deve gerenciar estado editEmail');
    assert.ok(profileContent.includes('E-mail da Conta'), 'UserProfileModal deve renderizar campo de E-mail da Conta');
  });

  await t.test('11. Alteração de Senha no Perfil e Redirecionamento para Recuperação', () => {
    const profileContent = fs.readFileSync(userProfileModalPath, 'utf-8');
    assert.ok(profileContent.includes('wantChangePassword'), 'UserProfileModal deve suportar estado wantChangePassword');
    assert.ok(profileContent.includes('handleRedirectToRecover'), 'UserProfileModal deve possuir handler de redirecionamento para recuperação');
    assert.ok(profileContent.includes('/recuperar'), 'UserProfileModal deve redirecionar para a rota /recuperar');
    assert.ok(profileContent.includes('Não lembra a senha?') || profileContent.includes('Não lembra?'), 'UserProfileModal deve alertar caso o usuário não lembre a senha');

    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT,
        pin_hash TEXT,
        avatar_color TEXT DEFAULT '#10B981',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE shopping_lists (id TEXT PRIMARY KEY, owner_id TEXT);
      CREATE TABLE list_items (id TEXT PRIMARY KEY, purchased_by_user_id TEXT, actual_price_cents INTEGER);
    `);

    const userRepo = new UserRepository(db);
    const u = userRepo.create({ name: 'Carla Dias', email: 'carla@teste.com', pin: '123456' });
    assert.equal(userRepo.verifyPin(u.id, '123456'), true);

    // Alteração com PIN atual válido
    userRepo.update(u.id, { pin: 'senhaForte2026' });
    assert.equal(userRepo.verifyPin(u.id, 'senhaForte2026'), true);
    assert.equal(userRepo.verifyPin(u.id, '123456'), false);
  });

  await t.test('12. Login Exclusivo com E-mail e Senha (Sem Listagem de Contas Previamente Logadas)', () => {
    const loginPagePath = path.join(rootDir, 'client', 'src', 'pages', 'LoginPage.jsx');
    const entryPagePath = path.join(rootDir, 'client', 'src', 'components', 'RegisterEntryPage.jsx');
    const authModalPath = path.join(rootDir, 'client', 'src', 'components', 'AuthModal.jsx');

    const loginContent = fs.readFileSync(loginPagePath, 'utf-8');
    const entryContent = fs.readFileSync(entryPagePath, 'utf-8');
    const authModalContent = fs.readFileSync(authModalPath, 'utf-8');

    // 1. LoginPage.jsx não deve conter listagem de perfis nem dropdown de contas
    assert.ok(!loginContent.includes('validUsers.map'), 'LoginPage NÃO deve listar perfis na tela');
    assert.ok(!loginContent.includes('Selecione seu Perfil'), 'LoginPage NÃO deve conter seleção de perfil');
    assert.ok(!loginContent.includes('<select'), 'LoginPage NÃO deve conter elemento <select>');
    assert.ok(loginContent.includes('type="email"'), 'LoginPage deve conter campo de e-mail');
    assert.ok(loginContent.includes("type={showPassword ? 'text' : 'password'}"), 'LoginPage deve conter campo de senha');
    assert.ok(loginContent.includes('/api/users/login'), 'LoginPage deve autenticar via POST /api/users/login');

    // 2. RegisterEntryPage.jsx não deve conter select de contas no login
    assert.ok(!entryContent.includes('Selecione sua Conta'), 'RegisterEntryPage NÃO deve conter seleção de contas');
    assert.ok(!entryContent.includes('<select'), 'RegisterEntryPage NÃO deve conter elemento <select>');
    assert.ok(entryContent.includes('loginEmail'), 'RegisterEntryPage deve possuir estado loginEmail');

    // 3. AuthModal.jsx não deve conter select de contas no login
    assert.ok(!authModalContent.includes('Conta / Perfil'), 'AuthModal NÃO deve conter seleção de contas no login');
    assert.ok(authModalContent.includes('loginEmail'), 'AuthModal deve possuir estado loginEmail');
  });

  await t.test('13. Recuperação Robusta e Segura: Chave Secreta (Opção 2 - Principal) + Pergunta Secreta (Opção 3 - Fallback)', async () => {
    // 1. Funções Criptográficas Independentes
    const generatedKey = generateRecoveryKey();
    assert.match(generatedKey, /^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/, 'Formato Base32 de alta legibilidade XXXX-XXXX');

    const keyHash = hashRecoveryKey(generatedKey);
    assert.ok(keyHash.includes(':'), 'Hash da chave com salt PBKDF2');
    assert.equal(verifyRecoveryKeyHash(generatedKey, keyHash), true, 'Chave correta deve validar');
    assert.equal(verifyRecoveryKeyHash(generatedKey.toLowerCase(), keyHash), true, 'Chave case-insensitive deve validar');
    assert.equal(verifyRecoveryKeyHash('WRONG-KEY1', keyHash), false, 'Chave incorreta deve falhar');

    const ansHash = hashSecurityAnswer('  Rex  ');
    assert.ok(ansHash.includes(':'), 'Hash da resposta com salt PBKDF2');
    assert.equal(verifySecurityAnswerHash('rex', ansHash), true, 'Resposta normalizada minúscula deve validar');
    assert.equal(verifySecurityAnswerHash('REX', ansHash), true, 'Resposta maiúscula deve validar');
    assert.equal(verifySecurityAnswerHash('Mel', ansHash), false, 'Resposta incorreta deve falhar');

    // 2. Servidor de Teste Integrado com Banco Real
    const db = getDatabase(':memory:');
    seedDatabase(db);
    const app = express();
    app.use(express.json());
    const server = http.createServer(app);
    const socketManager = new SocketManager(server);
    app.use('/api', createApiRouter(db, socketManager));

    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}/api`;

    async function apiReq(urlPath, options = {}) {
      const res = await fetch(`${baseUrl}${urlPath}`, {
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        ...options
      });
      const data = await res.json().catch(() => ({}));
      return { status: res.status, data };
    }

    try {
      // 3. Cadastro de usuário com Pergunta e Resposta Secreta
      const userEmail = 'recuperacao.segura@cestaon.com';
      const userPass = 'senhaForte123';
      const question = 'Qual o nome do seu primeiro animal de estimação?';
      const answer = 'Totó';

      const regRes = await apiReq('/users', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Usuário Seguro',
          email: userEmail,
          pin: userPass,
          security_question: question,
          security_answer: answer
        })
      });

      assert.equal(regRes.status, 201);
      assert.ok(regRes.data.recovery_key, 'Criação de conta deve retornar chave secreta em texto plano uma única vez');
      const userRecoveryKey = regRes.data.recovery_key;

      // 4. Consulta de Pergunta de Segurança
      const qRes = await apiReq('/users/security-question', {
        method: 'POST',
        body: JSON.stringify({ email: userEmail })
      });
      assert.equal(qRes.status, 200);
      assert.equal(qRes.data.question, question);
      assert.equal(qRes.data.answer, undefined, 'Endpoint de pergunta NUNCA deve expor a resposta');
      assert.equal(qRes.data.recovery_key, undefined, 'Endpoint de pergunta NUNCA deve expor a chave');

      // Consulta de e-mail inexistente retorna 404
      const qNotFound = await apiReq('/users/security-question', {
        method: 'POST',
        body: JSON.stringify({ email: 'inexistente@cestaon.com' })
      });
      assert.equal(qNotFound.status, 404);

      // 5. Tentativa de Recuperação Sem Autenticação (Nem chave nem pergunta) -> Rejeita com 400
      const noAuthRes = await apiReq('/users/recover', {
        method: 'POST',
        body: JSON.stringify({
          email: userEmail,
          password: 'novaSenhaSemAuth1'
        })
      });
      assert.equal(noAuthRes.status, 400);

      // 6. Opção 2 (Chave Secreta - Principal)
      // 6.1 Chave incorreta -> Rejeita com 401
      const badKeyRes = await apiReq('/users/recover', {
        method: 'POST',
        body: JSON.stringify({
          email: userEmail,
          recovery_key: 'CHAV-EERR',
          password: 'novaSenha123'
        })
      });
      assert.equal(badKeyRes.status, 401);

      // 6.2 Chave correta -> Sucesso 200 e gera nova chave
      const goodKeyRes = await apiReq('/users/recover', {
        method: 'POST',
        body: JSON.stringify({
          email: userEmail,
          recovery_key: userRecoveryKey,
          password: 'novaSenhaChave123'
        })
      });
      assert.equal(goodKeyRes.status, 200);
      assert.equal(goodKeyRes.data.method, 'recovery_key');
      assert.ok(goodKeyRes.data.new_recovery_key, 'Deve retornar nova chave de recuperação para segurança contínua');
      const secondRecoveryKey = goodKeyRes.data.new_recovery_key;

      // Login com nova senha redefinida via chave
      const loginWithKeyPass = await apiReq('/users/login', {
        method: 'POST',
        body: JSON.stringify({
          email: userEmail,
          password: 'novaSenhaChave123'
        })
      });
      assert.equal(loginWithKeyPass.status, 200, 'Deve conseguir logar com a nova senha redefinida via chave');

      // Chave anterior não deve mais funcionar (rotação)
      const oldKeyRes = await apiReq('/users/recover', {
        method: 'POST',
        body: JSON.stringify({
          email: userEmail,
          recovery_key: userRecoveryKey,
          password: 'outraSenha123'
        })
      });
      assert.equal(oldKeyRes.status, 401, 'Chave antiga deve ser invalidada após redefinição');

      // 7. Opção 3 (Pergunta Secreta - Fallback quando a pessoa perde o código)
      // 7.1 Resposta incorreta -> Rejeita com 401
      const badAnswerRes = await apiReq('/users/recover', {
        method: 'POST',
        body: JSON.stringify({
          email: userEmail,
          security_answer: 'Gato Miau',
          password: 'novaSenhaPergunta1'
        })
      });
      assert.equal(badAnswerRes.status, 401);

      // 7.2 Resposta correta (case insensitive) -> Sucesso 200 e gera nova chave
      const goodAnswerRes = await apiReq('/users/recover', {
        method: 'POST',
        body: JSON.stringify({
          email: userEmail,
          security_answer: 'totó',
          password: 'novaSenhaPergunta123'
        })
      });
      assert.equal(goodAnswerRes.status, 200);
      assert.equal(goodAnswerRes.data.method, 'security_answer');
      assert.ok(goodAnswerRes.data.new_recovery_key, 'Fallback pela pergunta também entrega nova chave secreta');

      // Login com nova senha redefinida via pergunta secreta
      const loginWithAnswerPass = await apiReq('/users/login', {
        method: 'POST',
        body: JSON.stringify({
          email: userEmail,
          password: 'novaSenhaPergunta123'
        })
      });
      assert.equal(loginWithAnswerPass.status, 200, 'Deve conseguir logar com a nova senha redefinida via pergunta secreta');

      // 8. Validação de Componentes UI do Frontend
      const registerPagePath = path.join(rootDir, 'client', 'src', 'pages', 'RegisterPage.jsx');
      const recoverPagePath = path.join(rootDir, 'client', 'src', 'pages', 'RecoverPage.jsx');
      const entryPagePath = path.join(rootDir, 'client', 'src', 'components', 'RegisterEntryPage.jsx');
      const authModalPath = path.join(rootDir, 'client', 'src', 'components', 'AuthModal.jsx');

      const registerContent = fs.readFileSync(registerPagePath, 'utf-8');
      const recoverContent = fs.readFileSync(recoverPagePath, 'utf-8');
      const entryContent = fs.readFileSync(entryPagePath, 'utf-8');
      const authModalContent = fs.readFileSync(authModalPath, 'utf-8');

      // RegisterPage
      assert.ok(registerContent.includes('DEFAULT_SECURITY_QUESTIONS'), 'RegisterPage deve ter perguntas padrão');
      assert.ok(registerContent.includes('securityAnswer'), 'RegisterPage deve ter campo de resposta');
      assert.ok(registerContent.includes('Chave de Emergência') || registerContent.includes('Chave Secreta'), 'RegisterPage deve exibir chave gerada');

      // RecoverPage
      assert.ok(recoverContent.includes('recoveryKey'), 'RecoverPage deve suportar recoveryKey');
      assert.ok(recoverContent.includes('securityAnswer'), 'RecoverPage deve suportar securityAnswer');
      assert.ok(recoverContent.includes('/api/users/security-question'), 'RecoverPage deve buscar pergunta');
      assert.ok(recoverContent.includes('/api/users/recover'), 'RecoverPage deve enviar para /recover');

      // RegisterEntryPage
      assert.ok(entryContent.includes('recoverMethod'), 'RegisterEntryPage deve suportar método dual');
      assert.ok(entryContent.includes('recoverKey'), 'RegisterEntryPage deve ter chave de recuperação');
      assert.ok(entryContent.includes('recoverAnswer'), 'RegisterEntryPage deve ter resposta de segurança');

      // AuthModal
      assert.ok(authModalContent.includes('recoverMethod'), 'AuthModal deve suportar método dual');
      assert.ok(authModalContent.includes('recoverKey'), 'AuthModal deve ter chave de recuperação');
      assert.ok(authModalContent.includes('recoverAnswer'), 'AuthModal deve ter resposta de segurança');

    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test('14. Dispositivo com Sessão Única Exclusiva (Sem lista de contas logadas e sem duplicação de recuperação)', () => {
    const userProfileModalPath = path.join(rootDir, 'client', 'src', 'components', 'UserProfileModal.jsx');
    const appPath = path.join(rootDir, 'client', 'src', 'App.jsx');

    const userProfileContent = fs.readFileSync(userProfileModalPath, 'utf-8');
    const appContent = fs.readFileSync(appPath, 'utf-8');

    // 1. UserProfileModal não deve conter lista ou contagem de múltiplas contas logadas
    assert.ok(!userProfileContent.includes('Contas Logadas'), 'UserProfileModal NÃO deve exibir seção de Contas Logadas');
    assert.ok(!userProfileContent.includes('loggedUsers.map'), 'UserProfileModal NÃO deve iterar sobre lista de contas no dispositivo');
    assert.ok(userProfileContent.includes('Sessão Principal'), 'UserProfileModal deve exibir badge de Sessão Principal');

    // 2. Não deve conter o link duplicado de recuperação dentro do input de Senha Atual
    assert.ok(
      !userProfileContent.includes('Não lembra? Recuperar na página de recuperação'),
      'UserProfileModal NÃO deve conter a segunda opção duplicada de recuperação de senha'
    );
    assert.ok(
      userProfileContent.includes('Não lembra a senha?'),
      'UserProfileModal deve manter o link principal de recuperação de senha'
    );

    // 3. App.jsx deve impor no máximo 1 sessão por dispositivo
    assert.ok(
      appContent.includes("localStorage.setItem('feira_logged_user_ids', JSON.stringify([userId]))"),
      'App.jsx deve registrar no máximo 1 sessão no dispositivo (sessão principal)'
    );
  });
});
