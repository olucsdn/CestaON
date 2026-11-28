import express from 'express';
import cors from 'cors';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { getDatabase, isLibsqlConfigured, createLibsqlClient, initLibsqlSchema, createReplicatedDatabase, restoreFromLibsql } from './db/database.js';
import { seedDatabase, seedLibsqlDatabase } from './db/seed.js';
import { SocketManager } from './ws/socketManager.js';
import { createApiRouter } from './routes/api.js';
import { ListRepository } from './repositories/listRepository.js';
import { validateAuthSecretConfiguration } from './middlewares/auth.js';
import { healthRateLimiter } from './middlewares/rateLimiter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isMainModule = Boolean(
  process.argv[1] &&
  path.resolve(__filename).toLowerCase() === path.resolve(process.argv[1]).toLowerCase()
);

/**
 * Validação mandatória no boot para persistência em produção
 */
export function validateProductionPersistence() {
  if (process.env.NODE_ENV === 'production' && !isLibsqlConfigured()) {
    throw new Error('FALHA CRÍTICA DE PERSISTÊNCIA NO BOOT: LIBSQL_URL ou TURSO_DATABASE_URL é mandatória em produção para garantir sobrevivência e persistência real em nuvem.');
  }
}

// Validação mandatória de segurança da chave secreta e persistência em nuvem (fail-fast no boot em produção)
if (isMainModule) {
  validateAuthSecretConfiguration();
  validateProductionPersistence();
}

const app = express();
const server = http.createServer(app);

// Desativa cabeçalho de fingerprinting do Express
app.disable('x-powered-by');

// Habilita proxy reverso para ambientes de nuvem (Render, Railway, Nginx, Cloudflare)
if (process.env.TRUST_PROXY === 'true' || process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Middleware de Auditoria e Registro de Acesso Operacional (sem expor query strings ou dados sensíveis)
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    if (req.path === '/health' || req.path === '/api/health') return;
    const duration = Date.now() - start;
    const ip = req.ip || req.socket?.remoteAddress || '127.0.0.1';
    // Sanitização estrita: registra apenas o caminho da rota sem parâmetros de query ou tokens
    const safePath = req.baseUrl ? `${req.baseUrl}${req.path}` : req.path;
    console.log(`[AUDIT-LOG] ${new Date().toISOString()} | ${ip} | ${req.method} ${safePath} | ${res.statusCode} | ${duration}ms`);
  });
  next();
});

// Middlewares de Segurança e Proteção HTTP
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  // [AUDIT-FIX SEC-05]: Hardening da CSP removendo 'unsafe-inline' de script-src (proteção estrita contra XSS)
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' ws: wss: https://fonts.googleapis.com https://fonts.gstatic.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none';");
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// Bloqueio defensivo HTTP 403 para arquivos sensíveis e diretórios internos
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

// CORS: suporte a ambientes de nuvem (Render) com fallback para desenvolvimento local e testes
const parseCorsOrigins = () => {
  const baseOrigins = ['https://cestaon.onrender.com'];
  if (!process.env.CORS_ORIGIN) return baseOrigins;
  const custom = process.env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean);
  return Array.from(new Set([...baseOrigins, ...custom]));
};

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);

    const configuredOrigins = parseCorsOrigins();
    if (configuredOrigins.includes('*') || configuredOrigins.includes(origin)) {
      return callback(null, true);
    }

    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Origem não permitida pela política CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-User-Id', 'X-Operation-Id']
}));

// Limite estrito de payload no body parser contra JSON/Memory Bombing
app.use(express.json({ limit: '500kb' }));

// 1. Inicializa banco de dados e sementes (Suporte a Turso LibSQL Cloud e SQLite local)
let db = getDatabase();
seedDatabase(db);
const effectiveDbPath = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : path.join(process.cwd(), 'data', 'feira.db');
console.log(`✅ Banco de dados SQLite local inicializado em: ${effectiveDbPath}`);

let cloudLibsqlClient = null;

// [AUDIT-FIX #4]: Em produção, falha o boot imediatamente se a persistência em nuvem não estiver configurada
if (process.env.NODE_ENV === 'production' && !isLibsqlConfigured()) {
  throw new Error('FALHA CRÍTICA DE PERSISTÊNCIA NO BOOT: LIBSQL_URL ou TURSO_DATABASE_URL é mandatória em produção para garantir sobrevivência e persistência real em nuvem.');
}

if (isLibsqlConfigured()) {
  const rawLibsqlUrl = process.env.LIBSQL_URL || process.env.TURSO_DATABASE_URL;
  try {
    // Configura cliente oficial Turso LibSQL em nuvem (conexão direta HTTPS/LibSQL protocol)
    cloudLibsqlClient = createLibsqlClient({
      url: rawLibsqlUrl,
      authToken: process.env.LIBSQL_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN
    });

    await initLibsqlSchema(cloudLibsqlClient);
    await seedLibsqlDatabase(cloudLibsqlClient);

    // [AUDIT-FIX #4]: Restaura dados persistidos no Turso para o SQLite local ANTES de servir requisições
    await restoreFromLibsql(db, cloudLibsqlClient);

    // [AUDIT-FIX #4]: Integra persistência real da API com write-through atômico para o LibSQL/Turso Cloud
    db = createReplicatedDatabase(db, cloudLibsqlClient);
    console.log(`🌐 Banco Turso LibSQL conectado, replicado e sincronizado na nuvem (Custo Zero Perpétuo): ${rawLibsqlUrl}`);
  } catch (err) {
    if (process.env.NODE_ENV === 'production') {
      console.error('💥 [PRODUÇÃO] Falha crítica de persistência cloud no Turso LibSQL:', err.message);
      throw err; // Remove fallback silencioso em produção!
    }
    console.warn('⚠️ Falha ao conectar ao Turso LibSQL em desenvolvimento:', err.message);
  }

  // Sincronização periódica a cada 60s em background para backup contínuo no Turso
  if (cloudLibsqlClient && typeof cloudLibsqlClient.sync === 'function') {
    const syncInterval = setInterval(async () => {
      try {
        await cloudLibsqlClient.sync();
      } catch (_) {}
    }, 60000);
    if (syncInterval.unref) syncInterval.unref();
  }
}

// Endpoint de Monitoramento e Health Check para orquestradores de nuvem e contêineres
/**
 * Cria o manipulador do endpoint /health e /api/health com validação de round-trip de persistência
 * @param {import('node:sqlite').DatabaseSync} localDb
 * @param {(() => any) | any} [cloudClientProvider]
 */
export function createHealthHandler(localDb, cloudClientProvider = () => null, { cacheTtlMs = 30000 } = {}) {
  let lastCheckedClient = null;
  let lastCheckAt = 0;
  let cachedCloudStatus = 'disabled';
  let cachedPersistenceVerified = false;

  return async (req, res) => {
    try {
      const ip = req.ip || req.socket?.remoteAddress || 'local';
      if (!healthRateLimiter.check(ip)) {
        return res.status(429).json({
          status: 'error',
          error: 'Muitas verificações de saúde. Aguarde 1 minuto.'
        });
      }

      let cloudStatus = 'disabled';
      let realPersistenceVerified = false;
      const client = typeof cloudClientProvider === 'function' ? cloudClientProvider() : cloudClientProvider;

      if (client) {
        const now = Date.now();
        if (lastCheckedClient === client && (now - lastCheckAt) < cacheTtlMs) {
          cloudStatus = cachedCloudStatus;
          realPersistenceVerified = cachedPersistenceVerified;
        } else {
          try {
            const pingKey = `health_ping_${now}_${Math.random().toString(36).slice(2, 7)}`;
            await client.execute({
              sql: `INSERT INTO processed_operations (operation_id, user_id, response_status, response_body, created_at)
                    VALUES (?, ?, 200, ?, CURRENT_TIMESTAMP)`,
              args: [pingKey, null, JSON.stringify({ ping: 'ok' })]
            });
            const readRes = await client.execute({
              sql: `SELECT response_body FROM processed_operations WHERE operation_id = ?`,
              args: [pingKey]
            });
            await client.execute({
              sql: `DELETE FROM processed_operations WHERE operation_id = ?`,
              args: [pingKey]
            }).catch(() => {});

            if (readRes && readRes.rows && readRes.rows.length > 0) {
              cloudStatus = 'connected';
              realPersistenceVerified = true;
            } else {
              cloudStatus = 'unexpected_response';
              realPersistenceVerified = false;
            }
          } catch (e) {
            cloudStatus = process.env.NODE_ENV === 'production' ? 'degraded' : 'degraded: ' + e.message;
            realPersistenceVerified = false;
          }
          lastCheckedClient = client;
          lastCheckAt = Date.now();
          cachedCloudStatus = cloudStatus;
          cachedPersistenceVerified = realPersistenceVerified;
        }
      } else {
        // Em ambiente local sem LibSQL, valida o round-trip de escrita e leitura no SQLite
        try {
          const localPing = `health_local_${Date.now()}`;
          localDb.prepare(`INSERT INTO processed_operations (operation_id, user_id, response_status, response_body, created_at) VALUES (?, ?, 200, '{"local":"ok"}', CURRENT_TIMESTAMP)`).run(localPing, null);
          const readLocal = localDb.prepare(`SELECT response_body FROM processed_operations WHERE operation_id = ?`).get(localPing);
          localDb.prepare(`DELETE FROM processed_operations WHERE operation_id = ?`).run(localPing);
          realPersistenceVerified = Boolean(readLocal?.response_body);
        } catch (_) {
          realPersistenceVerified = false;
        }
      }

      // Se estiver em produção e a persistência não estiver 100% verificada, reporta 503
      if (process.env.NODE_ENV === 'production' && !realPersistenceVerified) {
        return res.status(503).json({
          status: 'error',
          service: 'cestaon',
          message: 'Persistência em nuvem LibSQL inacessível ou falha no round-trip de escrita em ambiente de produção',
          cloud_database: cloudStatus,
          persistence_verified: false
        });
      }

      localDb.prepare('SELECT 1 as alive').get();
      return res.status(200).json({
        status: 'ok',
        service: 'cestaon',
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
        database: client ? 'turso_libsql_cloud_synced' : 'sqlite_local',
        cloud_database: cloudStatus,
        persistence_verified: realPersistenceVerified,
        environment: process.env.NODE_ENV || 'development'
      });
    } catch (err) {
      return res.status(503).json({
        status: 'error',
        message: 'Banco de dados inacessível',
        ...(process.env.NODE_ENV === 'production' ? {} : { error: err.message })
      });
    }
  };
}

export const healthHandler = createHealthHandler(db, () => cloudLibsqlClient);
app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

// 2. Inicializa WebSocket Server com autorização estrita por sala
const listRepoForAuth = new ListRepository(db);
const socketManager = new SocketManager(server, (listId, userId) => {
  if (!listId) return false;
  const perm = listRepoForAuth.checkPermission(listId, userId);
  return perm.allowed;
});
console.log('✅ Servidor WebSocket pronto para conexões em tempo real.');

// 3. Monta rotas de API
app.use('/api', createApiRouter(db, socketManager));

// 4. Servir arquivos estáticos do frontend em produção exclusivamente a partir da pasta dist
const clientDistPath = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDistPath, {
  dotfiles: 'ignore',
  setHeaders: (res, filePath) => {
    // Service Worker, manifesto e index.html nunca devem sofrer cache estrito
    if (filePath.endsWith('sw.js') || filePath.endsWith('index.html') || filePath.endsWith('manifest.webmanifest')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else if (filePath.includes(`${path.sep}assets${path.sep}`) || filePath.includes('/assets/')) {
      // Bundles JS e CSS com hash do Vite recebem cache longo imutável
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }
}));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  const indexPath = path.join(clientDistPath, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      res.status(404).json({ error: 'Recurso não encontrado' });
    }
  });
});

// Middleware centralizado de tratamento de erros e contenção de vazamento de informações internas
app.use((err, req, res, next) => {
  console.error('[Segurança/Servidor]', err.message);
  const isCorsError = err.message?.includes('CORS');
  const statusCode = err.status || (isCorsError ? 403 : 500);
  res.status(statusCode).json({
    error: isCorsError ? 'Acesso bloqueado por política de segurança de origem (CORS)' : 'Erro interno seguro do servidor'
  });
});

const PORT = process.env.PORT || 3000;
if (isMainModule) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Servidor CestaOn rodando em produção online!`);
    console.log(`👉 Produção: https://cestaon.onrender.com (porta ${PORT})\n`);
  });
}

// Encerramento Gracioso (Graceful Shutdown) para orquestradores de contêineres e nuvem (SIGTERM, SIGINT)
const gracefulShutdown = async (signal) => {
  console.log(`\n🛑 Sinal ${signal} recebido. Encerrando servidor graciosamente...`);
  try {
    socketManager.close();
  } catch (_) {}

  // Sincronização final do Turso LibSQL antes de encerrar
  if (cloudLibsqlClient && typeof cloudLibsqlClient.sync === 'function') {
    try {
      await cloudLibsqlClient.sync();
      console.log('✅ Dados finais sincronizados com Turso LibSQL Cloud.');
    } catch (_) {}
  }

  server.close(() => {
    console.log('✅ Servidor HTTP e WebSockets encerrados.');
    try {
      db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
      db.close();
      console.log('✅ Conexão com SQLite fechada com segurança.');
    } catch (_) {
      // Ignora se já fechado
    }
    process.exit(0);
  });

  // Teto de 10s para forçar término caso haja conexões presas
  setTimeout(() => {
    console.error('⚠️ Forçando encerramento imediato após timeout de 10s.');
    process.exit(1);
  }, 10000).unref();
};

if (isMainModule) {
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    console.error('⚠️ [Processo] Rejeição de Promise não capturada:', reason);
  });

  process.on('uncaughtException', (err) => {
    console.error('💥 [Processo] Exceção não capturada crítica:', err);
    gracefulShutdown('uncaughtException');
  });
}
