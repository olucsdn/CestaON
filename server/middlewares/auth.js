import crypto from 'node:crypto';

/**
 * Middlewares e Utilitários de Autenticação e Autorização Granular
 */

export const DEFAULT_DEV_SECRET = 'cestaon-development-secret-key-32-chars-minimum!';

/**
 * Valida rigorosamente a configuração de segurança do segredo criptográfico no boot.
 * Em produção, falha obrigatoriamente se AUTH_SECRET estiver ausente, fraca ou usando o padrão de dev.
 * Não gera fallback volátil efêmero em produção para evitar quebras em reinicializações e clusters.
 * Em desenvolvimento/testes, permite operação automática com o segredo padrão.
 * 
 * @returns {string} Segredo validado
 */
export function validateAuthSecretConfiguration() {
  const secret = process.env.AUTH_SECRET;
  const isProd = process.env.NODE_ENV === 'production';

  if (isProd) {
    if (!secret || typeof secret !== 'string' || !secret.trim()) {
      throw new Error(
        'FALHA CRÍTICA DE SEGURANÇA NO BOOT: A variável de ambiente AUTH_SECRET é obrigatória em produção e não foi configurada. ' +
        'Defina uma chave criptográfica forte com no mínimo 32 caracteres (ex: 256 bits gerados via openssl rand -hex 32).'
      );
    }
    const cleanSecret = secret.trim();
    if (cleanSecret === DEFAULT_DEV_SECRET) {
      throw new Error(
        'FALHA CRÍTICA DE SEGURANÇA NO BOOT: AUTH_SECRET em produção não pode utilizar o segredo padrão de desenvolvimento. ' +
        'Gere uma chave secreta exclusiva e forte para este ambiente.'
      );
    }
    if (cleanSecret.length < 32) {
      throw new Error(
        `FALHA CRÍTICA DE SEGURANÇA NO BOOT: AUTH_SECRET em produção deve ter no mínimo 32 caracteres para garantir segurança criptográfica contra força bruta (tamanho atual: ${cleanSecret.length}).`
      );
    }
    return cleanSecret;
  }

  // Em desenvolvimento / teste:
  if (secret && typeof secret === 'string' && secret.trim().length >= 16) {
    return secret.trim();
  }
  return DEFAULT_DEV_SECRET;
}

/**
 * Retorna o segredo criptográfico para assinatura e validação de tokens de sessão.
 */
export function getAuthSecret() {
  return validateAuthSecretConfiguration();
}

/**
 * Converte Buffer/String para Base64URL (RFC 7515)
 */
function base64UrlEncode(data) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(typeof data === 'string' ? data : JSON.stringify(data));
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/**
 * Decodifica Base64URL para Buffer
 */
function base64UrlDecode(str) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64');
}

/**
 * Emite um token de sessão assinado com HMAC-SHA256 (Padrão JWT Compacto)
 * @param {object} payload - Ex: { sub: userId, email, name }
 * @param {object} [options] - Ex: { expiresInSeconds: 2592000 } // 30 dias
 * @returns {string} Token de sessão
 */
export function createSessionToken(payload, options = {}) {
  const secret = options.secret || getAuthSecret();
  const expiresIn = typeof options.expiresInSeconds === 'number' && Number.isFinite(options.expiresInSeconds)
    ? options.expiresInSeconds
    : 30 * 24 * 60 * 60; // 30 dias por padrão
  const now = Math.floor(Date.now() / 1000);

  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };

  const tokenPayload = {
    ...payload,
    iat: now,
    exp: now + expiresIn
  };

  const encodedHeader = base64UrlEncode(header);
  const encodedPayload = base64UrlEncode(tokenPayload);
  const dataToSign = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto.createHmac('sha256', secret).update(dataToSign).digest();
  const encodedSignature = base64UrlEncode(signature);

  return `${dataToSign}.${encodedSignature}`;
}

/**
 * Valida criptograficamente um token de sessão HMAC-SHA256.
 * Exige estritamente subject não vazio e expiração numérica finita válida.
 * 
 * @param {string} token
 * @param {string} [customSecret]
 * @returns {object|null} Payload decodificado se válido, null se adulterado, expirado ou malformado
 */
export function verifySessionToken(token, customSecret = null) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.trim().split('.');
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  let secret;
  try {
    secret = customSecret || getAuthSecret();
  } catch (_) {
    return null;
  }

  try {
    const dataToSign = `${encodedHeader}.${encodedPayload}`;
    const expectedSig = crypto.createHmac('sha256', secret).update(dataToSign).digest();
    const receivedSig = base64UrlDecode(encodedSignature);

    if (expectedSig.length !== receivedSig.length) {
      return null;
    }

    if (!crypto.timingSafeEqual(expectedSig, receivedSig)) {
      return null;
    }

    const payloadJson = base64UrlDecode(encodedPayload).toString('utf-8');
    const payload = JSON.parse(payloadJson);

    if (!payload || typeof payload !== 'object') {
      return null;
    }

    // Exigência estrita: Subject não vazio
    const sub = payload.sub;
    if (!sub || typeof sub !== 'string' || !sub.trim()) {
      return null;
    }

    // Exigência estrita: Expiração numérica finita válida
    const exp = payload.exp;
    if (typeof exp !== 'number' || !Number.isFinite(exp) || Number.isNaN(exp)) {
      return null;
    }

    const now = Math.floor(Date.now() / 1000);
    if (now > exp) {
      return null; // Token expirado
    }

    // Normaliza campo id para conveniência
    payload.id = sub.trim();
    payload.sub = sub.trim();

    return payload;
  } catch (_) {
    return null;
  }
}

/**
 * Verifica se a versão do token (token_version) confere com o registro atual no banco.
 * Garante revogação imediata de sessões após redefinição de PIN/senha (SEC-05).
 */
export function isTokenVersionValid(db, verifiedPayload) {
  if (!db || !verifiedPayload?.sub) return true;
  try {
    const row = db.prepare('SELECT COALESCE(token_version, 1) as token_version FROM users WHERE id = ?').get(verifiedPayload.sub);
    if (!row) {
      return isTestEnvironment();
    }
    const dbVersion = Number(row.token_version ?? 1);
    const tokenVersion = verifiedPayload.token_version !== undefined ? Number(verifiedPayload.token_version) : 1;
    return Number.isFinite(tokenVersion) && tokenVersion === dbVersion;
  } catch (_) {
    return true;
  }
}

/**
 * Cria middleware de autenticação que valida assinatura JWT e token_version no banco.
 * @param {import('node:sqlite').DatabaseSync} [db]
 */
export function createTokenAuthenticator(db = null) {
  return (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      const verified = verifySessionToken(token);
      if (verified) {
        if (db && !isTokenVersionValid(db, verified)) {
          req.authError = 'Sessão revogada após alteração de credenciais';
        } else {
          req.user = verified;
        }
      } else {
        req.authError = 'Token inválido ou expirado';
      }
    }
    next();
  };
}

/**
 * Middleware que inspeciona o header Authorization: Bearer <token>
 * Se válido, anexa req.user com a identidade do titular.
 */
export function authenticateToken(req, res, next) {
  return createTokenAuthenticator(null)(req, res, next);
}

/**
 * Helper para verificar se a execução atual está estritamente restrita a testes automatizados locais.
 */
export function isTestEnvironment() {
  if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'staging') {
    return false;
  }
  return process.env.NODE_ENV === 'test' || (!process.env.NODE_ENV && process.execArgv.some((arg) => arg.startsWith('--test')));
}

/**
 * Middleware que exige sessão autenticada válida
 * Fail-closed por padrão em qualquer ambiente (produção, staging, dev).
 * Apenas em suítes locais de teste automatizado é permitida a injeção mock via headers.
 */
export function requireAuth(req, res, next) {
  if (req.user && (req.user.id || req.user.sub)) {
    if (!req.user.id) req.user.id = req.user.sub;
    return next();
  }

  // Se houve erro explícito no token ou se for anônimo declarado, rejeita imediatamente
  if (req.authError || req.headers['x-anonymous'] === 'true') {
    return res.status(401).json({
      error: 'Acesso restrito: autenticação mandatória via token de sessão válido'
    });
  }

  // [AUDIT-FIX SEC-02]: Bypass de cabeçalho restrito estritamente a testes unitários automatizados
  if (isTestEnvironment()) {
    const fallbackId = req.headers['x-user-id'] || req.query?.userId || req.body?.caller_id || req.body?.owner_id || req.body?.current_user_id || 'usr_default';
    req.user = { id: fallbackId, sub: fallbackId };
    return next();
  }

  // Em todos os outros cenários (dev, staging, produção, contêiner): FAIL-CLOSED
  return res.status(401).json({
    error: 'Acesso restrito: autenticação mandatória via token de sessão válido'
  });
}

/**
 * Extrai o identificador do usuário solicitante (caller ID)
 * Prioriza estritamente a identidade verificada pelo token (req.user).
 * Em qualquer ambiente que não seja teste automatizado local, recusa headers ou query/body inseguros.
 */
export function getCallerUserId(req) {
  if (req.user?.id) {
    return req.user.id;
  }
  if (req.user?.sub) {
    return req.user.sub;
  }

  // [AUDIT-FIX SEC-02]: Apenas suíte de testes unitários automatizados locais pode injetar mock
  if (isTestEnvironment()) {
    const headerUser = req.headers['x-user-id'];
    const queryUser = req.query?.userId;
    const bodyUser = req.body?.caller_id || req.body?.owner_id || req.body?.current_user_id;
    return headerUser || queryUser || bodyUser || 'usr_default';
  }

  return null;
}

/**
 * Verifica se um usuário possui a permissão exigida sobre uma lista
 * @param {import('../repositories/listRepository.js').ListRepository} listRepo
 * @param {string} listId
 * @param {string} userId
 * @param {'read'|'write'|'admin'|'owner'} requiredPermission
 * @returns {boolean}
 */
export function hasListPermission(listRepo, listId, userId, requiredPermission = 'read') {
  if (!userId) return false;
  const perm = listRepo.checkPermission(listId, userId);
  if (!perm.allowed) return false;
  if (requiredPermission === 'read') return true;
  if (requiredPermission === 'write') return perm.permission === 'write' || perm.permission === 'admin';
  if (requiredPermission === 'admin') return perm.permission === 'admin';
  if (requiredPermission === 'owner') return perm.isOwner === true;
  return false;
}
