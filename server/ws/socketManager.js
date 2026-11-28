import { WebSocketServer, WebSocket } from 'ws';
import { verifySessionToken } from '../middlewares/auth.js';

/**
 * [PROD-FIX]: Constantes de segurança e dimensionamento de infraestrutura para produção
 */
const MAX_PAYLOAD_SIZE = 64 * 1024; // 64 KB
const MAX_BUFFER_AMOUNT = 256 * 1024; // [PROD-FIX]: 256 KB teto de backpressure contra OOM Crash
const MAX_MSG_PER_WINDOW = 50; // [SEC-FIX]: Rate limit de 50 mensagens por janela por socket
const MSG_WINDOW_MS = 10000; // Janela de 10 segundos
const MAX_TOTAL_CLIENTS = 2000; // [PROD-FIX]: Teto global de conexões simultâneas contra esgotamento de FD (ulimit)
const MAX_CLIENTS_PER_IP = 30; // [SEC-FIX]: Máximo de conexões simultâneas por IP contra DoS

export class SocketManager {
  /**
   * @param {import('node:http').Server} httpServer
   * @param {((listId: string, userId: string | null) => boolean) | null} [authChecker]
   * @param {object} [options]
   */
  constructor(httpServer, authChecker = null, options = {}) {
    this.authChecker = typeof authChecker === 'function' ? authChecker : null;
    this.options = options;

    // [PROD-FIX]: Rastreamento de conexões por IP para mitigação de DoS / Slowloris
    this.ipConnections = new Map();

    // [SEC-FIX]: Inicialização do WebSocketServer com verifyClient para mitigar CSWSH (Cross-Site WebSocket Hijacking)
    this.wss = new WebSocketServer({
      server: httpServer,
      maxPayload: MAX_PAYLOAD_SIZE,
      verifyClient: (info, callback) => {
        try {
          // [PROD-FIX]: Verificação do teto de conexões ativas simultâneas
          if (this.wss.clients.size >= MAX_TOTAL_CLIENTS) {
            return callback(false, 503, 'Servidor com capacidade máxima de conexões');
          }

          const req = info.req;
          const ip = this.extractClientIp(req);
          const currentIpCount = this.ipConnections.get(ip) || 0;
          if (currentIpCount >= MAX_CLIENTS_PER_IP) {
            return callback(false, 429, 'Limite de conexões por IP atingido');
          }

          // [SEC-FIX]: Validação de Origin contra CSWSH
          const origin = info.origin;
          if (process.env.NODE_ENV === 'production' && !origin) {
            return callback(false, 403, 'Origem do cliente obrigatória em produção para WebSocket');
          }
          if (origin && !this.isAllowedOrigin(origin)) {
            return callback(false, 403, 'Origem não permitida pela política CORS do WebSocket');
          }

          callback(true);
        } catch (_) {
          callback(false, 500, 'Falha interna de verificação do cliente');
        }
      }
    });

    // [PROD-FIX]: Captura de erros no nível do servidor WebSocket prevenindo uncaughtException/crash do processo
    this.wss.on('error', (err) => {
      console.error('[WebSocketServer Error]', err?.message || err);
    });

    // Map de listId -> Set<WebSocket>
    this.rooms = new Map();
    // Map de ws -> Set<listId> para limpeza integral e prevenção de memory leak
    this.clientRooms = new Map();
    // Map de ws -> userId para validação e revogação dinâmica de permissões
    this.clientUsers = new Map();
    // [SEC-FIX]: Rastreamento reverso userId -> Set<ws> para suporte a Sessão Única por Dispositivo
    this.userSockets = new Map();
    // [SEC-FIX]: Map de ws -> { count: number, resetAt: number } para rate limit de mensagens
    this.socketRateLimits = new Map();
    // [PROD-FIX]: Map de ws -> ip para decremento seguro na desconexão
    this.socketIps = new Map();

    // Heartbeat a cada 30s para prevenir timeout ocioso de proxies reversos (Render, Cloudflare, Nginx)
    this.heartbeatInterval = setInterval(() => {
      for (const client of this.wss.clients) {
        if (client.isAlive === false) {
          try {
            client.terminate();
          } catch (_) {}
          continue;
        }
        client.isAlive = false;
        try {
          client.ping();
        } catch (_) {
          try {
            client.terminate();
          } catch (_) {}
        }
      }
    }, 30000);

    if (this.heartbeatInterval.unref) {
      this.heartbeatInterval.unref();
    }

    this.wss.on('connection', (ws, req) => {
      const clientIp = this.extractClientIp(req);
      this.socketIps.set(ws, clientIp);
      this.ipConnections.set(clientIp, (this.ipConnections.get(clientIp) || 0) + 1);

      ws.isAlive = true;
      ws.on('pong', () => {
        ws.isAlive = true;
      });

      this.clientRooms.set(ws, new Set());
      this.socketRateLimits.set(ws, { count: 0, resetAt: Date.now() + MSG_WINDOW_MS });

      ws.on('message', (messageRaw) => {
        try {
          // [SEC-FIX]: Rate limiting contra Message Flood e DoS por saturação de CPU/banco
          if (!this.checkRateLimit(ws)) {
            ws.close(1008, 'Limite de mensagens excedido (Flood Protection)');
            return;
          }

          // Limita tamanho da mensagem antes de JSON.parse
          if (messageRaw.length > MAX_PAYLOAD_SIZE) {
            ws.close(1009, 'Payload excessivo');
            return;
          }

          let data;
          try {
            data = JSON.parse(messageRaw.toString());
          } catch (_) {
            return; // [PROD-FIX]: Ignora JSON malformado sem explodir
          }

          if (!data || typeof data !== 'object' || Array.isArray(data)) return;

          const joined = this.clientRooms.get(ws) || new Set();

          if (data.type === 'JOIN_LIST') {
            // [SEC-FIX]: Validação estrita de tipo (rejeita números, arrays e objetos maliciosos)
            if (typeof data.listId !== 'string') return;
            const listId = data.listId.trim();
            if (!listId || listId.length > 64) return;

            let extractedUserId = null;

            // 1. Validação de Token Criptográfico de Sessão
            if (data.token && typeof data.token === 'string') {
              const verified = verifySessionToken(data.token);
              if (!verified || !verified.sub) {
                this.safeSend(ws, {
                  type: 'ERROR',
                  message: 'Token de sessão WebSocket inválido ou expirado'
                });
                return;
              }
              extractedUserId = verified.sub;

              // Prevenção de conflito se cliente enviar userId discrepante do token
              if (data.userId && data.userId !== extractedUserId) {
                this.safeSend(ws, {
                  type: 'ERROR',
                  message: 'Conflito de identidade entre token e identificador declarado'
                });
                return;
              }
            } else if (process.env.NODE_ENV === 'production') {
              // Em ambiente de produção pública, recusa conexão sem token assinado
              this.safeSend(ws, {
                type: 'ERROR',
                message: 'Autenticação mandatória: token de sessão ausente'
              });
              return;
            } else {
              // Fallback exclusivo para suíte de testes locais e desenvolvimento
              extractedUserId = typeof data.userId === 'string' ? data.userId.trim() : null;
            }

            const rawUserId = extractedUserId;

            // [SEC-FIX]: Prevenção de Identity Pollution: um socket não pode alternar seu userId para burlar autorizações
            const currentBoundUser = this.clientUsers.get(ws);
            if (currentBoundUser && rawUserId && currentBoundUser !== rawUserId) {
              this.safeSend(ws, {
                type: 'ERROR',
                message: 'Conflito de identidade de conexão WebSocket'
              });
              return;
            }

            const effectiveUserId = currentBoundUser || rawUserId;

            // Validação de autorização antes de permitir ingresso na sala
            if (this.authChecker) {
              let isAuthorized = false;
              try {
                isAuthorized = Boolean(this.authChecker(listId, effectiveUserId));
              } catch (_) {
                isAuthorized = false;
              }
              if (!isAuthorized) {
                this.safeSend(ws, {
                  type: 'ERROR',
                  message: 'Acesso não autorizado a esta feira em tempo real'
                });
                return;
              }
            }

            // Registra usuário na conexão WebSocket
            if (effectiveUserId) {
              if (!currentBoundUser) {
                this.evictUserSessions(effectiveUserId, ws);
              }
              this.clientUsers.set(ws, effectiveUserId);
              if (!this.userSockets.has(effectiveUserId)) {
                this.userSockets.set(effectiveUserId, new Set());
              }
              this.userSockets.get(effectiveUserId).add(ws);
            }

            // Limite de no máximo 10 salas por cliente para prevenir DoS / memory exhaustion
            if (joined.size >= 10 && !joined.has(listId)) {
              this.safeSend(ws, { type: 'ERROR', message: 'Limite de salas ativas atingido' });
              return;
            }

            if (!this.rooms.has(listId)) {
              this.rooms.set(listId, new Set());
            }
            this.rooms.get(listId).add(ws);
            joined.add(listId);
            this.clientRooms.set(ws, joined);

            this.safeSend(ws, {
              type: 'JOINED_LIST',
              listId,
              clientCount: this.rooms.get(listId).size
            });
          }

          if (data.type === 'LEAVE_LIST') {
            if (typeof data.listId !== 'string') return;
            const listId = data.listId.trim();
            if (listId && this.rooms.has(listId)) {
              this.rooms.get(listId).delete(ws);
              if (this.rooms.get(listId).size === 0) {
                this.rooms.delete(listId);
              }
            }
            joined.delete(listId);
          }
        } catch (_) {
          // Ignora silenciosamente mensagens malformadas prevenindo DoS no log
        }
      });

      ws.on('close', () => {
        this.cleanupSocket(ws);
      });

      ws.on('error', () => {
        try {
          ws.close();
        } catch (_) {}
      });
    });
  }

  /**
   * [PROD-FIX]: Extrai o IP real do cliente com suporte a proxies reversos (Nginx, Render, Cloudflare)
   */
  extractClientIp(req) {
    if (!req) return '127.0.0.1';
    const cfIp = req.headers['cf-connecting-ip'];
    if (cfIp && typeof cfIp === 'string' && cfIp.trim()) {
      return cfIp.trim();
    }
    const isBehindProxy = Boolean(process.env.TRUST_PROXY || process.env.RENDER || process.env.NODE_ENV === 'production');
    const xForwardedFor = req.headers['x-forwarded-for'];
    if (isBehindProxy && xForwardedFor) {
      const ips = String(xForwardedFor).split(',').map((s) => s.trim()).filter(Boolean);
      if (ips.length > 0) {
        // [AUDIT-FIX SEC-07]: O IP adicionado pelo proxy reverso confiável fica no final da cadeia.
        // O primeiro IP pode ser manipulado pelo cliente para contornar o teto por IP.
        return ips[ips.length - 1];
      }
    }
    return req.socket?.remoteAddress || '127.0.0.1';
  }

  /**
   * [SEC-FIX]: Valida se a origem do handshake WebSocket é permitida
   */
  isAllowedOrigin(origin) {
    if (!origin) return true;
    const baseOrigins = ['https://cestaon.onrender.com'];
    const envOrigins = (process.env.CORS_ORIGIN || '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);

    const allowed = Array.from(new Set([...baseOrigins, ...envOrigins]));
    if (allowed.includes('*') || allowed.includes(origin)) {
      return true;
    }

    // Suporte a desenvolvimento local, CI e testes (localhost e loopback)
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return true;
    }

    return false;
  }

  /**
   * [SEC-FIX]: Controle de taxa de mensagens por conexão (Sliding Window / Leaky Bucket)
   */
  checkRateLimit(ws) {
    const now = Date.now();
    let rl = this.socketRateLimits.get(ws);
    if (!rl || now > rl.resetAt) {
      rl = { count: 1, resetAt: now + MSG_WINDOW_MS };
      this.socketRateLimits.set(ws, rl);
      return true;
    }
    rl.count++;
    return rl.count <= MAX_MSG_PER_WINDOW;
  }

  /**
   * [PROD-FIX]: Limpeza atômica e integral do socket para evitar memory leaks
   */
  cleanupSocket(ws) {
    const ip = this.socketIps.get(ws);
    if (ip && this.ipConnections.has(ip)) {
      const current = this.ipConnections.get(ip) - 1;
      if (current <= 0) {
        this.ipConnections.delete(ip);
      } else {
        this.ipConnections.set(ip, current);
      }
    }
    this.socketIps.delete(ws);
    this.socketRateLimits.delete(ws);

    const userId = this.clientUsers.get(ws);
    if (userId) {
      this.clientUsers.delete(ws);
      const userSocketsSet = this.userSockets.get(userId);
      if (userSocketsSet) {
        userSocketsSet.delete(ws);
        if (userSocketsSet.size === 0) {
          this.userSockets.delete(userId);
        }
      }
    }

    const joined = this.clientRooms.get(ws);
    if (joined) {
      for (const listId of joined) {
        if (this.rooms.has(listId)) {
          this.rooms.get(listId).delete(ws);
          if (this.rooms.get(listId).size === 0) {
            this.rooms.delete(listId);
          }
        }
      }
      this.clientRooms.delete(ws);
    }
  }

  /**
   * [PROD-FIX]: Envio protegido contra falhas de buffer, sockets fechados e backpressure excessivo (OOM)
   */
  safeSend(client, data) {
    if (!client || client.readyState !== WebSocket.OPEN) return;

    // [PROD-FIX]: Detecção de conexão móvel lenta (Backpressure Buffer Bloat) para prevenir OOM Crash
    if (client.bufferedAmount > MAX_BUFFER_AMOUNT) {
      try {
        client.terminate();
      } catch (_) {}
      return;
    }

    try {
      client.send(JSON.stringify(data), (err) => {
        if (err) {
          try { client.close(); } catch (_) {}
        }
      });
    } catch (_) {}
  }

  /**
   * [SEC-FIX]: Evicção de Sessão Única por Dispositivo.
   * Encerra conexões ativas anteriores de um usuário quando uma nova sessão for iniciada.
   * @param {string} userId
   * @param {WebSocket} [exceptWs]
   */
  evictUserSessions(userId, exceptWs = null) {
    if (!userId) return;
    const sockets = this.userSockets.get(userId);
    if (!sockets || sockets.size === 0) return;

    for (const ws of Array.from(sockets)) {
      if (ws !== exceptWs && ws.readyState === WebSocket.OPEN) {
        this.safeSend(ws, {
          type: 'SESSION_EVICTED',
          message: 'Sua conta foi conectada em outro dispositivo. Esta sessão foi encerrada.'
        });
        try {
          ws.close(4001, 'Sessão substituída em outro dispositivo');
        } catch (_) {}
      }
    }
  }

  /**
   * Remove ativamente um usuário revogado de uma sala específica e notifica o cliente.
   * @param {string} listId
   * @param {string} userId
   */
  evictUserFromList(listId, userId) {
    if (!listId || !userId) return;
    const clients = this.rooms.get(listId);
    if (!clients || clients.size === 0) return;

    for (const client of Array.from(clients)) {
      const clientUserId = this.clientUsers.get(client);
      if (clientUserId === userId) {
        this.safeSend(client, {
          type: 'ACCESS_REVOKED',
          listId,
          message: 'Seu acesso a esta feira foi revogado.'
        });
        clients.delete(client);
        const joined = this.clientRooms.get(client);
        if (joined) joined.delete(listId);
      }
    }
    if (clients.size === 0) {
      this.rooms.delete(listId);
    }
  }

  /**
   * Envia uma mensagem em broadcast exclusivamente para clientes na sala da lista,
   * revalidando autorização se authChecker estiver presente para prevenir vazamento pós-revogação.
   * @param {string} listId 
   * @param {string} type 
   * @param {any} payload 
   */
  broadcastToList(listId, type, payload) {
    const clients = this.rooms.get(listId);
    if (!clients || clients.size === 0) return;

    for (const client of Array.from(clients)) {
      if (this.authChecker) {
        const userId = this.clientUsers.get(client) || null;
        let isAuthorized = false;
        try {
          isAuthorized = Boolean(this.authChecker(listId, userId));
        } catch (_) {
          isAuthorized = false;
        }
        if (!isAuthorized) {
          this.safeSend(client, {
            type: 'ACCESS_REVOKED',
            listId,
            message: 'Seu acesso a esta feira foi revogado.'
          });
          clients.delete(client);
          const joined = this.clientRooms.get(client);
          if (joined) joined.delete(listId);
          continue;
        }
      }
      this.safeSend(client, { type, payload });
    }
  }

  /**
   * Envia evento geral seguro para conexões ativas.
   * @param {string} type 
   * @param {any} payload 
   */
  broadcastAll(type, payload) {
    for (const client of this.wss.clients) {
      this.safeSend(client, { type, payload });
    }
  }

  /**
   * [PROD-FIX]: Encerramento gracioso do WebSocketServer e desconexão limpa de clientes (Status 1001 Going Away)
   */
  close() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.wss) {
      for (const client of this.wss.clients) {
        try {
          client.close(1001, 'Servidor reiniciando (Going Away)');
        } catch (_) {}
      }
      try {
        this.wss.close();
      } catch (_) {}
    }
  }
}
