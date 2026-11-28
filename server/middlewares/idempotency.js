import { requestContextStorage } from '../db/database.js';
import { getCallerUserId } from './auth.js';

/**
 * [AUDIT-FIX #1]: Middleware de Idempotência e Durabilidade Atômica para API e Fila Offline (SyncManager)
 * Integra mutação e marcador numa unidade durável atômica:
 * - Impede que requisições reenviadas após oscilação de rede dupliquem registros ou operações financeiras.
 * - Garante que o marcador processed_operations seja gravado e replicado duravelmente no LibSQL antes de retornar 2xx.
 * - Em caso de falha de persistência remota, reverte o marcador local e retorna 503 sem registrar falso sucesso.
 */
export function createIdempotencyMiddleware(db) {
  // Limpeza periódica de operações antigas (> 7 dias)
  try {
    db.prepare(`
      DELETE FROM processed_operations 
      WHERE created_at < datetime('now', '-7 days')
    `).run();
  } catch (_) {}

  // Fila para serialização estrita de savepoints de mutação local
  let mutationQueue = Promise.resolve();
  // Keep the API closed if SQLite reports that a savepoint could not be finalized.
  let persistenceFault = null;
  const persistenceUnavailableBody = {
    error: 'Persistência temporariamente indisponível; tente novamente após a recuperação do serviço'
  };

  return (req, res, next) => {
    const isMutation = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method);
    if (!isMutation) {
      if (req.method === 'OPTIONS') {
        return next();
      }
      // Sincroniza requisições de leitura (ex: GET, HEAD) com a fila de mutações ativas.
      // Impede que leituras na conexão SQLite compartilhada acessem dados não confirmados
      // sob savepoints abertos enquanto a mutação aguarda confirmação remota no Turso LibSQL.
      const continueRead = () => {
        if (res.writableEnded || req.destroyed) return;
        if (persistenceFault) return res.status(503).json(persistenceUnavailableBody);
        return next();
      };
      return mutationQueue.then(continueRead, continueRead);
    }

    const rawOpId = req.headers['x-operation-id'];
    const opId = (rawOpId && typeof rawOpId === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(rawOpId.trim().slice(0, 64)))
      ? rawOpId.trim().slice(0, 64)
      : null;

    const hasScopeSupport = typeof db?.beginMutationScope === 'function';
    const cloudClient = typeof db?.getLibsqlClient === 'function' ? db.getLibsqlClient() : null;

    const executeMutation = (markDone) => {
      let mutationScope = null;
      if (hasScopeSupport) {
        mutationScope = db.beginMutationScope();
      } else if (cloudClient) {
        throw new Error('Atomic mutation scopes are required for replicated writes');
      }

      const reqCtx = {
        opId,
        statements: [],
        pendingSecurityUpdates: [],
        aborted: false
      };

      const originalJson = res.json.bind(res);
      const originalSend = res.send.bind(res);
      let handled = false;
      let clientAborted = false;

      const cleanupScope = (commit) => {
        if (!mutationScope) return;
        const sp = mutationScope;
        if (commit) {
          db.commitMutationScope(sp);
        } else {
          db.rollbackMutationScope(sp);
          // [AUDIT-FIX SEC-01]: Persiste atualizações de segurança (ex: contador de tentativas OTP)
          // imediatamente após o rollback do savepoint de negócio, impedindo ataques de força bruta.
          if (Array.isArray(reqCtx.pendingSecurityUpdates) && reqCtx.pendingSecurityUpdates.length > 0) {
            for (const update of reqCtx.pendingSecurityUpdates) {
              try {
                db.prepare(update.sql).run(...(update.args || []));
              } catch (secErr) {
                console.error('[Security Hardening] Falha ao persistir contador de segurança pós-rollback:', secErr.message);
              }
            }
          }
        }
        mutationScope = null;
      };

      const finalizeScope = (commit) => {
        try {
          cleanupScope(commit);
          return true;
        } catch (err) {
          persistenceFault = persistenceFault || err;
          console.error('[Persistência Crítica] Falha ao finalizar escopo SQLite:', err.message);
          return false;
        }
      };

      let abortSafetyTimer = null;
      const markAborted = () => {
        // Apenas marca como abortada se a resposta ainda não foi finalizada
        if (!res.writableEnded && !res.finished) {
          clientAborted = true;
          reqCtx.aborted = true;
          // Não libera a fila nem desfaz o savepoint aqui prematuramente, pois o handler
          // assíncrono (ex: hash de senha, validações I/O) ainda está em execução.
          // O escopo e a fila permanecem protegidos até o término real do handler.
          // Um timer de contingência de 5s garante desbloqueio caso um handler trave indefinidamente.
          if (!handled && !abortSafetyTimer) {
            abortSafetyTimer = setTimeout(() => {
              if (!handled) {
                handled = true;
                finalizeScope(false);
                markDone();
              }
            }, 5000);
            if (typeof abortSafetyTimer.unref === 'function') abortSafetyTimer.unref();
          }
        }
      };

      res.on('close', markAborted);

      const onHandlerSettled = () => {
        if (abortSafetyTimer) clearTimeout(abortSafetyTimer);
        if (!handled) {
          handled = true;
          finalizeScope(false);
          markDone();
        }
      };

      const origEnd = res.end.bind(res);
      res.end = (...args) => {
        onHandlerSettled();
        return origEnd(...args);
      };

      const commitAndDurable = async (body, sendFn) => {
        if (abortSafetyTimer) clearTimeout(abortSafetyTimer);
        if (handled) return sendFn(body);
        handled = true;

        let responseBody = body;
        let responseSender = sendFn;
        const failClosedResponse = () => {
          res.status(503);
          responseBody = {
            error: 'Durable persistence could not be confirmed in LibSQL'
          };
          responseSender = originalJson;
        };

        try {
          if (clientAborted || (res.destroyed && !res.writableEnded)) {
            finalizeScope(false);
            return;
          }

          const status = res.statusCode || 200;
          if (status < 400) {
            let markerReady = true;
            const isSensitiveAuthEndpoint = req.path.includes('/login') ||
                                           req.path.includes('/recover') ||
                                           req.path.includes('/send-verification-code') ||
                                           req.path.includes('/security-question') ||
                                           req.path.includes('/verify-pin');
            if (opId && !isSensitiveAuthEndpoint) {
              const bodyStr = typeof body === 'object' ? JSON.stringify(body) : String(body ?? '');
              const callerId = getCallerUserId(req) || req.user?.id || req.user?.sub || null;
              const markerStmt = {
                sql: 'INSERT OR REPLACE INTO processed_operations (operation_id, user_id, response_status, response_body) VALUES (?, ?, ?, ?)',
                args: [opId, callerId, status, bodyStr]
              };
              try {
                db.prepare(markerStmt.sql).run(...markerStmt.args);
                if (!reqCtx.statements.some((statement) =>
                  statement.sql === markerStmt.sql && statement.args?.[0] === opId
                )) {
                  reqCtx.statements.push(markerStmt);
                }
              } catch (err) {
                markerReady = false;
                console.error('[Persistence Critical] Failed to write local marker:', err.message);
                finalizeScope(false);
                failClosedResponse();
              }
            }

            if (markerReady && cloudClient && reqCtx.statements.length > 0) {
              const hasAtomicBatch = typeof cloudClient.batch === 'function';
              let remoteCommitted = false;
              try {
                if (hasAtomicBatch) {
                  await cloudClient.batch(reqCtx.statements, 'write');
                } else if (typeof cloudClient.executeMultiple === 'function') {
                  const fullSql = reqCtx.statements.map((s) => s.sql.trim().replace(/;*$/, ';')).join('\n');
                  await cloudClient.executeMultiple(fullSql);
                } else {
                  for (const statement of reqCtx.statements) await cloudClient.execute(statement);
                }
                remoteCommitted = true;
              } catch (err) {
                console.error('[Persistence Critical] Remote mutation/idempotency batch failed:', err.message);
                if (!hasAtomicBatch) persistenceFault = persistenceFault || err;
                finalizeScope(false);
                failClosedResponse();
              }

              if (remoteCommitted && !finalizeScope(true)) {
                // O cloud j? confirmou. Bloqueie a API at? rein?cio/restaura??o para n?o expor estado local incerto.
                persistenceFault = persistenceFault || new Error('Failed to release the local savepoint after remote commit');
                finalizeScope(false);
                failClosedResponse();
              }
            } else if (markerReady && typeof db?.waitForReplication === 'function') {
              try {
                await db.waitForReplication();
                if (!finalizeScope(true)) {
                  persistenceFault = persistenceFault || new Error('Failed to release the local savepoint after replication');
                  finalizeScope(false);
                  failClosedResponse();
                }
              } catch (err) {
                console.error('[Persistence Critical] Failed while waiting for replication:', err.message);
                persistenceFault = persistenceFault || err;
                finalizeScope(false);
                failClosedResponse();
              }
            } else if (markerReady && !finalizeScope(true)) {
              persistenceFault = persistenceFault || new Error('Failed to release the local savepoint');
              finalizeScope(false);
              failClosedResponse();
            }
          } else if (!finalizeScope(false)) {
            failClosedResponse();
          }
        } catch (err) {
          console.error('[Persistence Critical] Unexpected mutation lifecycle error:', err.message);
          persistenceFault = persistenceFault || err;
          finalizeScope(false);
          failClosedResponse();
        } finally {
          if (mutationScope) finalizeScope(false);
          markDone();
        }

        try {
          if (res.destroyed && !res.writableEnded) return;
          return responseSender(responseBody);
        } catch (_) {}
      };

      res.json = (body) => commitAndDurable(body, originalJson);
      res.send = (body) => commitAndDurable(body, originalSend);

      const wrappedNext = (err) => {
        if (err) {
          onHandlerSettled();
          return next(err);
        }
        return next();
      };

      return requestContextStorage.run(reqCtx, () => {
        wrappedNext();
      });
    };

    const runInQueue = () => {
      return new Promise((resolve) => {
        let done = false;
        const markDone = () => {
          if (!done) {
            done = true;
            resolve();
          }
        };

        if (persistenceFault) {
          try {
            if (!res.writableEnded && !res.destroyed) {
              res.status(503).json(persistenceUnavailableBody);
            }
          } finally {
            markDone();
          }
          return;
        }

        const isSensitiveAuthEndpoint = req.path.includes('/login') ||
                                       req.path.includes('/recover') ||
                                       req.path.includes('/send-verification-code') ||
                                       req.path.includes('/security-question') ||
                                       req.path.includes('/verify-pin');

        // Verificação de idempotência DENTRO da seção serializada:
        // Garante que só lê marcadores de operações já finalizadas e duravelmente confirmadas
        if (opId && !isSensitiveAuthEndpoint) {
          try {
            const callerId = getCallerUserId(req) || req.user?.id || req.user?.sub || 'anon';
            const existing = db.prepare(`
              SELECT user_id, response_status, response_body
              FROM processed_operations
              WHERE operation_id = ?
            `).get(opId);

            // [AUDIT-FIX SEC-03]: Replay isolado por usuário — impede vazamento e replay cruzado entre contas
            if (existing && (!existing.user_id || existing.user_id === callerId)) {
              res.setHeader('X-Idempotent-Replay', 'true');
              res.status(existing.response_status);
              markDone();
              if (existing.response_body) {
                try {
                  return res.json(JSON.parse(existing.response_body));
                } catch (_) {
                  return res.send(existing.response_body);
                }
              }
              return res.end();
            }
          } catch (_) {}
        }

        try {
          executeMutation(markDone);
        } catch (err) {
          console.error('[Persistência Crítica] Não foi possível abrir escopo de mutação:', err.message);
          try {
            if (!res.headersSent && !res.writableEnded && !res.destroyed) {
              res.status(503).json(persistenceUnavailableBody);
            } else {
              next(err);
            }
          } finally {
            markDone();
          }
        }
      });
    };

    mutationQueue = mutationQueue.then(runInQueue, runInQueue);
  };
}
