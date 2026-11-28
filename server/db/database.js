import { DatabaseSync } from 'node:sqlite';
import { createClient } from '@libsql/client';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AsyncLocalStorage } from 'node:async_hooks';

export const requestContextStorage = new AsyncLocalStorage();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let currentDb = null;

/**
 * Inicializa ou retorna a conexão com o banco de dados SQLite nativo.
 * @param {string} [customPath] - Caminho customizado (ou ':memory:' para testes)
 * @returns {DatabaseSync}
 */
export function getDatabase(customPath) {
  if (currentDb && !customPath) {
    return currentDb;
  }

  const rawPath = customPath || process.env.DB_PATH || path.join(process.cwd(), 'data', 'feira.db');
  const dbPath = rawPath === ':memory:' ? ':memory:' : path.resolve(rawPath);

  if (dbPath !== ':memory:') {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new DatabaseSync(dbPath);

  // Configurações fundamentais de integridade e desempenho
  db.exec('PRAGMA foreign_keys = ON;');
  // [AUDIT-FIX #5]: Timeout de 5000ms para evitar falhas instantâneas de SQLITE_BUSY em concorrência
  db.exec('PRAGMA busy_timeout = 5000;');
  if (dbPath !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA synchronous = NORMAL;');
    // [AUDIT-FIX #5]: Autocheckpoint a cada 1000 páginas evitando crescimento descontrolado do .db-wal
    db.exec('PRAGMA wal_autocheckpoint = 1000;');
    // [AUDIT-FIX #6]: Verificação preventiva rápida de integridade no boot
    try { db.exec('PRAGMA quick_check;'); } catch (_) {}
  }

  // [AUDIT-FIX #1 & SEC-03]: Tabela de operações processadas para idempotência da fila offline (com isolamento por user_id)
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS processed_operations (
        operation_id TEXT PRIMARY KEY,
        user_id TEXT,
        response_status INTEGER NOT NULL,
        response_body TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    try {
      db.exec('ALTER TABLE processed_operations ADD COLUMN user_id TEXT;');
    } catch (_) {}
  } catch (_) {}

  // Tabela de códigos de verificação por e-mail (Cadastro e Recuperação)
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS email_verifications (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL COLLATE NOCASE,
        code TEXT NOT NULL,
        purpose TEXT NOT NULL,
        expires_at DATETIME NOT NULL,
        attempts INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_email_verifications_lookup ON email_verifications(email, purpose);
    `);
  } catch (_) {}

  // Migrações incrementais idempotentes antes de schemaSql (para tabelas já existentes)
  try {
    db.exec('ALTER TABLE users ADD COLUMN email TEXT;');
  } catch (_) {
    // Tabela ainda não existe ou coluna já criada
  }
  try {
    db.exec('ALTER TABLE users ADD COLUMN recovery_key_hash TEXT;');
  } catch (_) {}
  try {
    db.exec('ALTER TABLE users ADD COLUMN security_question TEXT;');
  } catch (_) {}
  try {
    db.exec('ALTER TABLE users ADD COLUMN security_answer_hash TEXT;');
  } catch (_) {}
  try {
    db.exec('ALTER TABLE users ADD COLUMN token_version INTEGER DEFAULT 1;');
  } catch (_) {}

  // Limpeza preventiva idempotente de duplicatas legadas antes da criação de índices únicos
  try {
    db.exec(`
      DELETE FROM list_items 
      WHERE rowid NOT IN (
        SELECT MIN(rowid) 
        FROM list_items 
        GROUP BY list_id, product_id
      );
    `);
  } catch (_) {
    // Tabela ainda não existe no primeiro bootstrap
  }

  try {
    // Se existirem contas legadas com mesmo e-mail antes da aplicação do índice exclusivo,
    // preserva o e-mail na conta mais recente e desvincula nas contas antigas para evitar colisão
    db.exec(`
      UPDATE users 
      SET email = NULL 
      WHERE rowid NOT IN (
        SELECT MAX(rowid) 
        FROM users 
        WHERE email IS NOT NULL 
        GROUP BY lower(email)
      ) AND email IS NOT NULL;
    `);
  } catch (_) {
    // Tabela ainda não existe no primeiro bootstrap
  }

  // Executa migrações estruturais
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
  db.exec(schemaSql);

  try {
    db.exec('ALTER TABLE list_items ADD COLUMN version INTEGER DEFAULT 1;');
  } catch (_) {
    // Coluna version já existente
  }

  try {
    db.exec('ALTER TABLE users ADD COLUMN token_version INTEGER DEFAULT 1;');
  } catch (_) {
    // Coluna token_version já existente
  }

  try {
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_list_items_unique_prod ON list_items(list_id, product_id);');
  } catch (_) {
    // Caso existam registros duplicados prévios em bases legadas
  }

  try {
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users(email) WHERE email IS NOT NULL;');
  } catch (_) {
    // Caso existam e-mails duplicados em bases legadas não sanitizadas
  }

  if (!customPath) {
    currentDb = db;
  }

  return db;
}

/**
 * Fecha a conexão com o banco de dados se aberta.
 */
export function closeDatabase() {
  if (currentDb) {
    currentDb.close();
    currentDb = null;
  }
}

/**
 * Verifica se as credenciais do Turso (LibSQL em nuvem 100% gratuito) estão configuradas no ambiente.
 * @returns {boolean}
 */
export function isLibsqlConfigured() {
  const url = process.env.LIBSQL_URL || process.env.TURSO_DATABASE_URL;
  return Boolean(url && url.trim());
}

/**
 * Cria uma instância do cliente oficial Turso LibSQL.
 * Permite persistência perpétua e gratuita ($0) sem risco de perda em contêineres com disco efêmero.
 * @param {object} [options]
 * @returns {import('@libsql/client').Client}
 */
export function createLibsqlClient(options = {}) {
  const url = options.url || process.env.LIBSQL_URL || process.env.TURSO_DATABASE_URL;
  const authToken = options.authToken || process.env.LIBSQL_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN;
  const syncUrl = options.syncUrl;
  if (!url && !syncUrl) {
    throw new Error('LIBSQL_URL ou TURSO_DATABASE_URL não configurada no ambiente.');
  }
  if (syncUrl) {
    return createClient({ url, syncUrl, authToken });
  }
  return createClient({ url, authToken });
}

/**
 * Inicializa a estrutura de tabelas, índices e migrações no banco Turso LibSQL.
 * @param {import('@libsql/client').Client} client
 */
export async function initLibsqlSchema(client) {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
  await client.executeMultiple(schemaSql);

  // Executa migrações incrementais e índices de integridade
  try { await client.execute('ALTER TABLE users ADD COLUMN email TEXT;'); } catch (_) {}
  try { await client.execute('ALTER TABLE users ADD COLUMN recovery_key_hash TEXT;'); } catch (_) {}
  try { await client.execute('ALTER TABLE users ADD COLUMN security_question TEXT;'); } catch (_) {}
  try { await client.execute('ALTER TABLE users ADD COLUMN security_answer_hash TEXT;'); } catch (_) {}
  try { await client.execute('ALTER TABLE users ADD COLUMN token_version INTEGER DEFAULT 1;'); } catch (_) {}
  try { await client.execute('ALTER TABLE list_items ADD COLUMN version INTEGER DEFAULT 1;'); } catch (_) {}
  try { await client.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_list_items_unique_prod ON list_items(list_id, product_id);'); } catch (_) {}
  try { await client.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users(email COLLATE NOCASE) WHERE email IS NOT NULL;'); } catch (_) {}
  try {
    await client.execute(`
      CREATE TABLE IF NOT EXISTS email_verifications (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL COLLATE NOCASE,
        code TEXT NOT NULL,
        purpose TEXT NOT NULL,
        expires_at DATETIME NOT NULL,
        attempts INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.execute('CREATE INDEX IF NOT EXISTS idx_email_verifications_lookup ON email_verifications(email, purpose);');
  } catch (_) {}
}

/**
 * Cria um wrapper replicado sobre o banco SQLite nativo (node:sqlite DatabaseSync)
 * que intercepta operações de escrita (INSERT, UPDATE, DELETE, REPLACE) e as encaminha
 * via write-through em segundo plano para o Turso LibSQL Cloud.
 *
 * Isso garante:
 * 1. Desempenho máximo com latência 0ms em consultas e escritas locais síncronas.
 * 2. Persistência real na nuvem no Turso LibSQL Cloud, sobrevivendo à perda de contêineres e discos efêmeros (Render Free).
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {import('@libsql/client').Client} [libsqlClient]
 * @returns {import('node:sqlite').DatabaseSync}
 */
export function createReplicatedDatabase(db, libsqlClient) {
  if (!libsqlClient) return db;

  const WRITE_REGEX = /^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER)\b/i;
  const BEGIN_REGEX = /^\s*BEGIN\b/i;
  const COMMIT_REGEX = /^\s*COMMIT\b/i;
  const ROLLBACK_REGEX = /^\s*ROLLBACK\b/i;

  const pendingReplications = new Set();
  let inTransaction = false;
  let txBuffer = [];
  const activeScopes = new Set();
  const nestedTxStack = [];
  let scopeCounter = 0;
  let nestedCounter = 0;

  const trackReplication = (promise) => {
    let rejection = null;
    const safePromise = promise.catch((err) => {
      rejection = err;
    });
    const tracker = async () => {
      await safePromise;
      if (rejection) {
        throw rejection;
      }
    };
    pendingReplications.add(tracker);
    safePromise.finally(() => {
      pendingReplications.delete(tracker);
    });
  };

  const dispatchBatch = (statements) => {
    if (!statements || statements.length === 0) return;
    let repPromise;
    if (typeof libsqlClient.batch === 'function') {
      repPromise = Promise.resolve(libsqlClient.batch(statements, 'write'));
    } else if (typeof libsqlClient.executeMultiple === 'function' && statements.every((s) => !s.args || s.args.length === 0)) {
      const fullSql = statements.map((s) => s.sql.trim().replace(/;*$/, ';')).join('\n');
      repPromise = Promise.resolve(libsqlClient.executeMultiple(fullSql));
    } else {
      repPromise = (async () => {
        for (const s of statements) {
          await libsqlClient.execute(s);
        }
      })();
    }
    trackReplication(repPromise);
  };

  return new Proxy(db, {
    get(target, prop, receiver) {
      if (prop === 'waitForReplication') {
        return async function () {
          const list = Array.from(pendingReplications);
          await Promise.all(list.map((fn) => fn()));
        };
      }

      if (prop === 'getLibsqlClient') {
        return function () {
          return libsqlClient;
        };
      }

      if (prop === 'beginMutationScope') {
        return function () {
          const spName = `mut_sp_${Date.now()}_${++scopeCounter}_${Math.random().toString(36).slice(2, 6)}`;
          target.exec(`SAVEPOINT ${spName};`);
          activeScopes.add(spName);
          return spName;
        };
      }

      if (prop === 'commitMutationScope') {
        return function (spName) {
          if (!spName || !activeScopes.has(spName)) {
            throw new Error('Escopo de mutação SQLite inválido ou já finalizado');
          }
          if (nestedTxStack.length > 0 || inTransaction) {
            throw new Error('Não é possível confirmar o escopo com uma transação aninhada aberta');
          }
          target.exec(`RELEASE ${spName};`);
          activeScopes.delete(spName);
          return true;
        };
      }

      if (prop === 'rollbackMutationScope') {
        return function (spName) {
          if (!spName || !activeScopes.has(spName)) {
            throw new Error('Escopo de mutação SQLite inválido ou já finalizado');
          }
          // Nunca libere o savepoint se o rollback falhar: RELEASE confirmaria as escritas pendentes.
          target.exec(`ROLLBACK TO ${spName};`);
          nestedTxStack.length = 0;
          inTransaction = false;
          txBuffer = [];
          target.exec(`RELEASE ${spName};`);
          activeScopes.delete(spName);
          return true;
        };
      }

      if (prop === 'prepare') {
        return function (sql) {
          const stmt = target.prepare(sql);
          const isWrite = WRITE_REGEX.test(sql);
          const isBegin = BEGIN_REGEX.test(sql);
          const isCommit = COMMIT_REGEX.test(sql);
          const isRollback = ROLLBACK_REGEX.test(sql);

          if (!isWrite && !isBegin && !isCommit && !isRollback) {
            return stmt;
          }

          return new Proxy(stmt, {
            get(stmtTarget, stmtProp) {
              if (stmtProp === 'run') {
                return function (...args) {
                  if (isBegin) {
                    if (activeScopes.size > 0 || nestedTxStack.length > 0) {
                      const nestedSp = `nested_tx_${++nestedCounter}`;
                      target.exec(`SAVEPOINT ${nestedSp};`);
                      nestedTxStack.push(nestedSp);
                    } else {
                      stmtTarget.run(...args);
                    }
                    inTransaction = true;
                    txBuffer = [];
                    return { changes: 0, lastInsertRowid: 0 };
                  }

                  if (isCommit) {
                    if (nestedTxStack.length > 0) {
                      const nestedSp = nestedTxStack[nestedTxStack.length - 1];
                      target.exec(`RELEASE ${nestedSp};`);
                      nestedTxStack.pop();
                    } else {
                      stmtTarget.run(...args);
                    }
                    if (inTransaction) {
                      const toCommit = [...txBuffer];
                      inTransaction = false;
                      txBuffer = [];
                      const reqCtx = requestContextStorage.getStore();
                      if (!reqCtx) {
                        dispatchBatch(toCommit);
                      } else {
                        reqCtx.statements.push(...toCommit);
                      }
                    }
                    return { changes: 0, lastInsertRowid: 0 };
                  }

                  if (isRollback) {
                    if (nestedTxStack.length > 0) {
                      const nestedSp = nestedTxStack[nestedTxStack.length - 1];
                      // RELEASE após um ROLLBACK TO que falhou poderia confirmar a transação aninhada.
                      target.exec(`ROLLBACK TO ${nestedSp};`);
                      target.exec(`RELEASE ${nestedSp};`);
                      nestedTxStack.pop();
                    } else {
                      stmtTarget.run(...args);
                    }
                    inTransaction = false;
                    txBuffer = [];
                    return { changes: 0, lastInsertRowid: 0 };
                  }

                  const reqCtx = requestContextStorage.getStore();
                  if (isWrite && reqCtx?.aborted) {
                    const err = new Error('Operação cancelada: a requisição foi abortada pelo cliente antes da gravação');
                    err.code = 'ECANCELED';
                    throw err;
                  }

                  const result = stmtTarget.run(...args);

                  if (isWrite && libsqlClient) {
                    const safeArgs = args.map((arg) => (arg === undefined ? null : arg));
                    const reqCtx = requestContextStorage.getStore();
                    if (inTransaction) {
                      txBuffer.push({ sql, args: safeArgs });
                    } else if (reqCtx) {
                      reqCtx.statements.push({ sql, args: safeArgs });
                    } else if (typeof libsqlClient.execute === 'function') {
                      const repPromise = Promise.resolve(libsqlClient.execute({ sql, args: safeArgs }));
                      trackReplication(repPromise);
                    }
                  }
                  return result;
                };
              }
              const val = stmtTarget[stmtProp];
              return typeof val === 'function' ? val.bind(stmtTarget) : val;
            }
          });
        };
      }

      if (prop === 'exec') {
        return function (sql) {
          const isBegin = BEGIN_REGEX.test(sql);
          const isCommit = COMMIT_REGEX.test(sql);
          const isRollback = ROLLBACK_REGEX.test(sql);
          const isWrite = WRITE_REGEX.test(sql);

          if (isBegin) {
            if (activeScopes.size > 0 || nestedTxStack.length > 0) {
              const nestedSp = `nested_tx_${++nestedCounter}`;
              target.exec(`SAVEPOINT ${nestedSp};`);
              nestedTxStack.push(nestedSp);
            } else {
              target.exec(sql);
            }
            inTransaction = true;
            txBuffer = [];
            return;
          }

          if (isCommit) {
            if (nestedTxStack.length > 0) {
              const nestedSp = nestedTxStack[nestedTxStack.length - 1];
              target.exec(`RELEASE ${nestedSp};`);
              nestedTxStack.pop();
            } else {
              target.exec(sql);
            }
            if (inTransaction) {
              const toCommit = [...txBuffer];
              inTransaction = false;
              txBuffer = [];
              const reqCtx = requestContextStorage.getStore();
              if (!reqCtx) {
                dispatchBatch(toCommit);
              } else {
                reqCtx.statements.push(...toCommit);
              }
            }
            return;
          }

          if (isRollback) {
            if (nestedTxStack.length > 0) {
              const nestedSp = nestedTxStack[nestedTxStack.length - 1];
              // RELEASE após um ROLLBACK TO que falhou poderia confirmar a transação aninhada.
              target.exec(`ROLLBACK TO ${nestedSp};`);
              target.exec(`RELEASE ${nestedSp};`);
              nestedTxStack.pop();
            } else {
              target.exec(sql);
            }
            inTransaction = false;
            txBuffer = [];
            return;
          }

          const reqCtx = requestContextStorage.getStore();
          if (isWrite && reqCtx?.aborted) {
            const err = new Error('Operação cancelada: a requisição foi abortada pelo cliente antes da gravação');
            err.code = 'ECANCELED';
            throw err;
          }

          const result = target.exec(sql);

          if (isWrite && libsqlClient) {
            const reqCtx = requestContextStorage.getStore();
            if (inTransaction) {
              txBuffer.push({ sql, args: [] });
            } else if (reqCtx) {
              reqCtx.statements.push({ sql, args: [] });
            } else if (typeof libsqlClient.executeMultiple === 'function') {
              const repPromise = Promise.resolve(libsqlClient.executeMultiple(sql));
              trackReplication(repPromise);
            } else if (typeof libsqlClient.execute === 'function') {
              const repPromise = Promise.resolve(libsqlClient.execute(sql));
              trackReplication(repPromise);
            }
          }
          return result;
        };
      }

      const val = Reflect.get(target, prop, receiver);
      return typeof val === 'function' ? val.bind(target) : val;
    }
  });
}

/**
 * Restaura dados persistidos no Turso LibSQL Cloud para o banco SQLite local no boot.
 * Permite que um novo contêiner em nuvem com disco efêmero recupere imediatamente todos
 * os perfis, listas e históricos salvos remotamente.
 *
 * @param {import('node:sqlite').DatabaseSync} localDb
 * @param {import('@libsql/client').Client} libsqlClient
 */
export async function restoreFromLibsql(localDb, libsqlClient) {
  if (!libsqlClient || typeof libsqlClient.execute !== 'function') return;

  const TABLES = [
    'users',
    'categories',
    'stores',
    'products',
    'shopping_lists',
    'list_items',
    'list_shares',
    'purchase_history',
    'price_history',
    'processed_operations'
  ];

  for (const table of TABLES) {
    try {
      const res = await libsqlClient.execute(`SELECT * FROM ${table}`);
      if (res && res.rows && res.rows.length > 0) {
        for (const row of res.rows) {
          const cols = Object.keys(row);
          const placeholders = cols.map(() => '?').join(', ');
          const values = cols.map((c) => row[c]);

          try {
            const pk = table === 'processed_operations' ? 'operation_id' : 'id';
            const nonPkCols = cols.filter((c) => c !== pk);
            const updateClause = nonPkCols.length > 0
              ? `ON CONFLICT(${pk}) DO UPDATE SET ${nonPkCols.map((c) => `${c} = excluded.${c}`).join(', ')}`
              : `ON CONFLICT(${pk}) DO NOTHING`;

            localDb.prepare(`
              INSERT INTO ${table} (${cols.join(', ')})
              VALUES (${placeholders})
              ${updateClause}
            `).run(...values);
          } catch (rowErr) {
            console.warn(`[Turso Restore] Falha ao restaurar registro em '${table}': ${rowErr?.message || rowErr}`);
          }
        }
        console.log(`📥 [Turso LibSQL] Restaurados ${res.rows.length} registros da tabela '${table}' para o SQLite local.`);
      }
    } catch (err) {
      const msg = String(err?.message || err);
      // Tabela ainda não criada remotamente pode ser tolerada
      if (msg.toLowerCase().includes('no such table')) {
        continue;
      }
      if (process.env.NODE_ENV === 'production') {
        throw new Error(`Falha crítica ao restaurar tabela '${table}' do Turso LibSQL: ${msg}`);
      }
      console.warn(`[Turso Restore] Alerta ao restaurar tabela '${table}': ${msg}`);
    }
  }
}
