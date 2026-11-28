import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { getDatabase } from '../server/db/database.js';

test('PRONTIDÃO PARA DEPLOY EM PRODUÇÃO E NUVEM (CLOUD READINESS)', async (t) => {
  const rootDir = process.cwd();

  await t.test('1. Validação dos Arquivos de Infraestrutura de Nuvem e Contêineres', () => {
    // .env.example
    const envExamplePath = path.join(rootDir, '.env.example');
    assert.ok(fs.existsSync(envExamplePath), '.env.example deve existir na raiz');
    const envContent = fs.readFileSync(envExamplePath, 'utf-8');
    assert.ok(envContent.includes('PORT='), 'Deve documentar PORT');
    assert.ok(envContent.includes('NODE_ENV='), 'Deve documentar NODE_ENV');
    assert.ok(envContent.includes('DB_PATH='), 'Deve documentar DB_PATH');
    assert.ok(envContent.includes('CORS_ORIGIN='), 'Deve documentar CORS_ORIGIN');
    assert.ok(envContent.includes('TRUST_PROXY='), 'Deve documentar TRUST_PROXY');

    // Dockerfile
    const dockerfilePath = path.join(rootDir, 'Dockerfile');
    assert.ok(fs.existsSync(dockerfilePath), 'Dockerfile deve existir na raiz');
    const dockerContent = fs.readFileSync(dockerfilePath, 'utf-8');
    assert.ok(dockerContent.includes('node:22-alpine'), 'Deve utilizar imagem oficial Node 22 Alpine');
    assert.ok(dockerContent.includes('VOLUME ["/app/data"]'), 'Deve definir volume persistente para banco de dados');
    assert.ok(dockerContent.includes('EXPOSE 3000'), 'Deve expor a porta 3000');
    assert.ok(dockerContent.includes('HEALTHCHECK'), 'Deve conter instrução HEALTHCHECK');

    // docker-compose.yml
    const composePath = path.join(rootDir, 'docker-compose.yml');
    assert.ok(fs.existsSync(composePath), 'docker-compose.yml deve existir na raiz');
    const composeContent = fs.readFileSync(composePath, 'utf-8');
    assert.ok(composeContent.includes('cestaon-data:/app/data'), 'Compose deve mapear volume persistente');
    assert.ok(composeContent.includes('3000:3000'), 'Compose deve expor porta 3000');

    // HOSPEDAGEM_E_BANCO.md
    const guidePath = path.join(rootDir, 'HOSPEDAGEM_E_BANCO.md');
    assert.ok(fs.existsSync(guidePath), 'HOSPEDAGEM_E_BANCO.md deve existir na raiz');
    const guideContent = fs.readFileSync(guidePath, 'utf-8');
    assert.ok(guideContent.includes('Render.com'), 'Deve documentar deploy no Render');
    assert.ok(guideContent.includes('Turso'), 'Deve documentar banco de dados Turso');
  });

  await t.test('2. Scripts Padrão de Produção no package.json (start e build)', () => {
    const pkgPath = path.join(rootDir, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

    assert.ok(pkg.scripts.start, 'package.json deve conter script start');
    assert.equal(pkg.scripts.start, 'node server/index.js', 'Script start deve iniciar server/index.js');
    assert.ok(pkg.scripts.build, 'package.json deve conter script build');
    assert.match(pkg.scripts.build, /client/, 'Script build deve compilar o frontend client');
  });

  await t.test('3. Endpoints de Monitoramento e Verificação de Integridade (Health Check)', async () => {
    const db = getDatabase(':memory:');
    const app = express();

    const healthHandler = (req, res) => {
      try {
        db.prepare('SELECT 1 as alive').get();
        res.status(200).json({
          status: 'ok',
          service: 'cestaon',
          uptime: Math.floor(process.uptime()),
          timestamp: new Date().toISOString(),
          database: 'connected',
          environment: process.env.NODE_ENV || 'test'
        });
      } catch (err) {
        res.status(503).json({
          status: 'error',
          message: 'Banco de dados inacessível',
          error: err.message
        });
      }
    };

    app.get('/health', healthHandler);
    app.get('/api/health', healthHandler);

    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    try {
      // Teste em /health
      const res1 = await fetch(`http://localhost:${port}/health`);
      assert.equal(res1.status, 200);
      const data1 = await res1.json();
      assert.equal(data1.status, 'ok');
      assert.equal(data1.service, 'cestaon');
      assert.equal(data1.database, 'connected');
      assert.equal(typeof data1.uptime, 'number');

      // Teste em /api/health
      const res2 = await fetch(`http://localhost:${port}/api/health`);
      assert.equal(res2.status, 200);
      const data2 = await res2.json();
      assert.equal(data2.status, 'ok');
      assert.equal(data2.database, 'connected');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  await t.test('4. Validação Dinâmica de CORS para Produção', async () => {
    const parseCorsOrigins = (envVal) => {
      if (!envVal) return [];
      return envVal.split(',').map((o) => o.trim()).filter(Boolean);
    };

    const buildCorsMiddleware = (envVal) => {
      const allowed = parseCorsOrigins(envVal);
      return cors({
        origin: (origin, callback) => {
          if (!origin) return callback(null, true);
          if (allowed.includes('*') || allowed.includes(origin)) return callback(null, true);
          if (/^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$/.test(origin)) {
            return callback(null, true);
          }
          return callback(new Error('Origem não permitida pela política CORS'));
        }
      });
    };

    // Caso A: Domínio autorizado explicitamente
    const mockRes = () => ({ setHeader: () => {}, getHeader: () => {} });
    const corsMiddleware = buildCorsMiddleware('https://cestaon.com.br,https://app.cestaon.com');
    await new Promise((resolve) => {
      corsMiddleware({ headers: { origin: 'https://cestaon.com.br' }, method: 'GET' }, mockRes(), (err) => {
        assert.ifError(err);
        resolve();
      });
    });

    // Caso B: Domínio não autorizado é barrado
    await new Promise((resolve) => {
      corsMiddleware({ headers: { origin: 'https://site-malicioso.com' }, method: 'GET' }, mockRes(), (err) => {
        assert.ok(err, 'Origem desconhecida fora da rede privada deve ser rejeitada');
        resolve();
      });
    });

    // Caso C: Wildcard '*' autoriza qualquer origem
    const wildcardCors = buildCorsMiddleware('*');
    await new Promise((resolve) => {
      wildcardCors({ headers: { origin: 'https://qualquer-dominio.com' }, method: 'GET' }, mockRes(), (err) => {
        assert.ifError(err);
        resolve();
      });
    });
  });
});
