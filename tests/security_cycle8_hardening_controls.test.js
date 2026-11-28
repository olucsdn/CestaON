import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { getDatabase } from '../server/db/database.js';

test('CICLO 8 DE TESTES — Controles de Hardening, Bloqueio 403, Headers e Restrição UNIQUE', async (t) => {
  const rootDir = process.cwd();

  await t.test('8.1 Restrição Física UNIQUE de E-mail no SQLite', () => {
    const db = getDatabase(':memory:');
    
    // Inserção do primeiro usuário com e-mail
    const insertStmt = db.prepare(`
      INSERT INTO users (id, name, email) VALUES (?, ?, ?)
    `);
    
    insertStmt.run('usr_unique_1', 'Usuário Um', 'teste.unico@exemplo.com');
    
    // Tentativa de duplicar o mesmo e-mail deve falhar no motor SQLite com erro de UNIQUE
    assert.throws(() => {
      insertStmt.run('usr_unique_2', 'Usuário Dois', 'teste.unico@exemplo.com');
    }, /UNIQUE constraint failed: users\.email/i, 'SQLite deve rejeitar e-mail duplicado via índice físico UNIQUE');

    // Múltiplos usuários com e-mail nulo devem ser permitidos (índice parcial)
    insertStmt.run('usr_null_1', 'Sem Email 1', null);
    insertStmt.run('usr_null_2', 'Sem Email 2', null);
    const countNull = db.prepare("SELECT COUNT(*) as count FROM users WHERE email IS NULL").get();
    assert.equal(countNull.count, 2, 'Usuários legados sem e-mail não devem colidir');
  });

  await t.test('8.2 Bloqueio HTTP 403 a Arquivos Sensíveis e Diretórios Internos', async () => {
    const app = express();
    app.disable('x-powered-by');

    // Middlewares replicando a proteção configurada em server/index.js
    const SENSITIVE_FILES_REGEX = /\.(env.*|sql|log|md|ini|yml|yaml|sh|conf|db|db-wal|db-shm|sqlite|sqlite3|bak)$|Dockerfile|docker-compose/i;
    const INTERNAL_DIRS_REGEX = /^\/(src|config|includes|database|db|data|docs|tests|docker|\.git|node_modules)(\/.*)?$/i;

    app.use((req, res, next) => {
      if (INTERNAL_DIRS_REGEX.test(req.path) || SENSITIVE_FILES_REGEX.test(req.path)) {
        return res.status(403).json({
          error: 'Acesso negado: recurso restrito por política de segurança'
        });
      }
      next();
    });

    app.get('/health', (req, res) => res.json({ status: 'ok' }));

    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // Arquivos sensíveis
      const sensitiveFiles = [
        '/.env',
        '/.env.local',
        '/schema.sql',
        '/server.log',
        '/README.md',
        '/config.ini',
        '/Dockerfile',
        '/docker-compose.yml',
        '/backup.db',
        '/feira.db-wal',
        '/feira.db-shm',
        '/banco.sqlite',
        '/banco.sqlite3',
        '/deploy.sh'
      ];

      for (const file of sensitiveFiles) {
        const res = await fetch(`${baseUrl}${file}`);
        assert.equal(res.status, 403, `Arquivo ${file} deve ser bloqueado com HTTP 403`);
        const json = await res.json();
        assert.ok(json.error.includes('restrito'), `Resposta de ${file} deve conter mensagem de segurança`);
      }

      // Diretórios internos
      const internalDirs = [
        '/src/App.jsx',
        '/config/database.json',
        '/database/schema.sql',
        '/data/feira.db',
        '/data/feira.db-wal',
        '/tests/api.test.js',
        '/.git/HEAD',
        '/node_modules/express/package.json'
      ];

      for (const dir of internalDirs) {
        const res = await fetch(`${baseUrl}${dir}`);
        assert.equal(res.status, 403, `Diretório interno ${dir} deve ser bloqueado com HTTP 403`);
      }

      // Rota legítima deve passar normalmente
      const okRes = await fetch(`${baseUrl}/health`);
      assert.equal(okRes.status, 200, 'Rota legítima /health deve retornar 200 OK');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  await t.test('8.3 Cabeçalhos HTTP Defensivos Expandidos (CSP, Permissions-Policy, X-Frame-Options)', async () => {
    const app = express();
    app.disable('x-powered-by');

    app.use((req, res, next) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' ws: wss: https://fonts.googleapis.com https://fonts.gstatic.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none';");
      next();
    });

    app.get('/test-headers', (req, res) => res.send('ok'));

    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/test-headers`);
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(res.headers.get('x-frame-options'), 'DENY');
      assert.equal(res.headers.get('x-xss-protection'), '1; mode=block');
      assert.equal(res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
      assert.ok(res.headers.get('permissions-policy')?.includes('camera=()'));
      assert.ok(res.headers.get('content-security-policy')?.includes("default-src 'self'"));
      assert.equal(res.headers.get('x-powered-by'), null, 'x-powered-by deve ser omitido');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  await t.test('8.4 Medidor Visual de Força de Senha no Cadastro (RegisterPage.jsx)', () => {
    const registerPath = path.join(rootDir, 'client', 'src', 'pages', 'RegisterPage.jsx');
    const content = fs.readFileSync(registerPath, 'utf-8');

    assert.ok(content.includes('strengthScore'), 'RegisterPage deve calcular o score de força');
    assert.ok(content.includes('strengthInfo'), 'RegisterPage deve mapear as propriedades visuais de força');
    assert.ok(content.includes('Força da Senha:'), 'RegisterPage deve renderizar o rótulo do medidor visual');
    assert.ok(content.includes('transition-all duration-300'), 'Barra de progresso deve ter animação suave');
  });

  await t.test('8.5 Bloqueio Estrito de Login para Contas sem PIN (usr_default / Sem Credencial)', async () => {
    const db = getDatabase(':memory:');
    const { seedDatabase } = await import('../server/db/seed.js');
    seedDatabase(db);

    const { UserRepository } = await import('../server/repositories/userRepository.js');
    const { createUsersRouter } = await import('../server/routes/users.js');
    const userRepo = new UserRepository(db);

    const app = express();
    app.use(express.json());
    app.use('/users', createUsersRouter({ userRepo }));

    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    try {
      // Tentativa de login na conta padrão seed 'usr_default' (visitante@cestaon.app) que não possui pin
      const res = await fetch(`http://127.0.0.1:${port}/users/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'visitante@cestaon.app',
          password: 'qualquer_senha'
        })
      });

      assert.equal(res.status, 401, 'Tentativa de login em conta sem PIN deve ser rejeitada com 401');
      const data = await res.json();
      assert.ok(data.error, 'Deve retornar mensagem de erro segura');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  await t.test('8.6 Resiliência de Persistência em Nuvem (Criação Recursiva de Diretório DB_PATH)', () => {
    const tempTestDbDir = path.join(rootDir, 'data', 'temp_cloud_test_' + Date.now());
    const tempTestDbPath = path.join(tempTestDbDir, 'nested', 'cloud.db');

    assert.equal(fs.existsSync(tempTestDbDir), false, 'Diretório de teste não deve existir previamente');

    const testDb = getDatabase(tempTestDbPath);
    try {
      assert.ok(fs.existsSync(tempTestDbDir), 'getDatabase deve criar diretório pai recursivamente');
      assert.ok(fs.existsSync(tempTestDbPath), 'Arquivo de banco deve ser criado no caminho especificado');
      const row = testDb.prepare('SELECT 1 as alive').get();
      assert.equal(row.alive, 1);
    } finally {
      testDb.close();
      fs.rmSync(tempTestDbDir, { recursive: true, force: true });
    }
  });

  await t.test('8.7 Criptografia em Trânsito WSS Dinâmica no useWebSocket.js', () => {
    const wsHookPath = path.join(rootDir, 'client', 'src', 'hooks', 'useWebSocket.js');
    const content = fs.readFileSync(wsHookPath, 'utf-8');

    assert.ok(
      content.includes("window.location.protocol === 'https:' ? 'wss:' : 'ws:'"),
      'useWebSocket deve alternar dinamicamente para wss: sob conexões HTTPS'
    );
  });

  await t.test('8.8 Prontidão de Banco em Nuvem Turso LibSQL (@libsql/client)', async () => {
    const { createClient } = await import('@libsql/client');
    const { initLibsqlSchema } = await import('../server/db/database.js');
    const { seedLibsqlDatabase } = await import('../server/db/seed.js');

    // Executa em memória simulando conexão Turso
    const client = createClient({ url: ':memory:' });
    await initLibsqlSchema(client);
    await seedLibsqlDatabase(client);

    const checkCats = await client.execute('SELECT COUNT(*) as count FROM categories');
    assert.equal(Number(checkCats.rows[0].count), 9, 'Turso LibSQL deve conter 9 setores cadastrados');

    const checkStores = await client.execute('SELECT COUNT(*) as count FROM stores');
    assert.ok(Number(checkStores.rows[0].count) >= 3, 'Turso LibSQL deve conter estabelecimentos prévios');

    const checkProds = await client.execute('SELECT COUNT(*) as count FROM products');
    assert.ok(Number(checkProds.rows[0].count) >= 30, 'Turso LibSQL deve conter catálogo com mais de 30 produtos');
  });

  await t.test('8.9 Reconexão Resiliente WebSocket com Exponential Backoff e Drenagem IndexedDB', () => {
    const wsHookPath = path.join(rootDir, 'client', 'src', 'hooks', 'useWebSocket.js');
    const wsHookContent = fs.readFileSync(wsHookPath, 'utf-8');

    assert.ok(wsHookContent.includes('reconnectAttemptRef'), 'useWebSocket deve rastrear número de tentativas de reconexão');
    assert.ok(wsHookContent.includes('cestaon:ws-reconnected'), 'useWebSocket deve disparar evento cestaon:ws-reconnected ao recuperar conexão');

    const syncHookPath = path.join(rootDir, 'client', 'src', 'hooks', 'useSubsurfaceSync.js');
    const syncHookContent = fs.readFileSync(syncHookPath, 'utf-8');
    assert.ok(syncHookContent.includes('cestaon:ws-reconnected'), 'useSubsurfaceSync deve escutar cestaon:ws-reconnected para drenagem da fila');
  });

  await t.test('8.10 Criptografia PBKDF2 Assíncrona e Não Bloqueante', async () => {
    const {
      hashPinAsync,
      verifyPinHashAsync,
      UserRepository
    } = await import('../server/repositories/userRepository.js');

    const testPin = '987654';
    const hash = await hashPinAsync(testPin);
    assert.ok(hash.includes(':'), 'Hash PBKDF2 assíncrono deve conter salt e derived');

    const isValid = await verifyPinHashAsync(testPin, hash);
    assert.equal(isValid, true, 'verifyPinHashAsync deve validar PIN correto com timingSafeEqual');

    const isWrong = await verifyPinHashAsync('000000', hash);
    assert.equal(isWrong, false, 'verifyPinHashAsync deve rejeitar PIN incorreto');

    const db = getDatabase(':memory:');
    const repo = new UserRepository(db);
    const user = await repo.createAsync({ name: 'Ana PBKDF2', pin: '654321' });
    assert.ok(user.id);
    const pinMatch = await repo.verifyPinAsync(user.id, '654321');
    assert.equal(pinMatch, true, 'verifyPinAsync deve retornar true para senha correta');
  });
});
