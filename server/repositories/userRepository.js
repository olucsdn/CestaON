import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { requestContextStorage } from '../db/database.js';

const pbkdf2Async = promisify(crypto.pbkdf2);
const PBKDF2_ROUNDS = parseInt(process.env.PBKDF2_ROUNDS, 10) || (process.env.NODE_ENV === 'test' ? 10000 : 100000);

function parsePbkdf2Hash(storedHash) {
  if (!storedHash || !storedHash.includes(':')) return null;
  const parts = storedHash.split(':');
  if (parts.length === 3) {
    return {
      rounds: parseInt(parts[0], 10) || 10000,
      salt: parts[1],
      originalDerived: parts[2]
    };
  }
  if (parts.length === 2) {
    return {
      rounds: 10000,
      salt: parts[0],
      originalDerived: parts[1]
    };
  }
  return null;
}

/**
 * Utilitários criptográficos seguros para armazenamento de PIN, Chave de Recuperação e Resposta Secreta
 * Suporta versões assíncronas (non-blocking para evitar travar o event loop e os WebSockets)
 * e versões síncronas para retrocompatibilidade direta em testes locais.
 */
export async function hashPinAsync(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = await pbkdf2Async(pin.toString(), salt, PBKDF2_ROUNDS, 32, 'sha256');
  return `${PBKDF2_ROUNDS}:${salt}:${derived.toString('hex')}`;
}

export function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.pbkdf2Sync(pin.toString(), salt, PBKDF2_ROUNDS, 32, 'sha256').toString('hex');
  return `${PBKDF2_ROUNDS}:${salt}:${derived}`;
}

export async function verifyPinHashAsync(pin, storedHash) {
  const parsed = parsePbkdf2Hash(storedHash);
  if (!parsed) return false;
  const derived = await pbkdf2Async(pin.toString(), parsed.salt, parsed.rounds, 32, 'sha256');
  const bufA = Buffer.from(derived.toString('hex'), 'hex');
  const bufB = Buffer.from(parsed.originalDerived, 'hex');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function verifyPinHash(pin, storedHash) {
  const parsed = parsePbkdf2Hash(storedHash);
  if (!parsed) return false;
  const derived = crypto.pbkdf2Sync(pin.toString(), parsed.salt, parsed.rounds, 32, 'sha256').toString('hex');
  const bufA = Buffer.from(derived, 'hex');
  const bufB = Buffer.from(parsed.originalDerived, 'hex');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function generateRecoveryKey() {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let part1 = '';
  let part2 = '';
  for (let i = 0; i < 4; i++) {
    part1 += chars[crypto.randomInt(0, chars.length)];
    part2 += chars[crypto.randomInt(0, chars.length)];
  }
  return `${part1}-${part2}`;
}

export function normalizeRecoveryKey(key) {
  if (!key) return '';
  return String(key).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

export async function hashRecoveryKeyAsync(key) {
  const clean = normalizeRecoveryKey(key);
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = await pbkdf2Async(clean, salt, PBKDF2_ROUNDS, 32, 'sha256');
  return `${PBKDF2_ROUNDS}:${salt}:${derived.toString('hex')}`;
}

export function hashRecoveryKey(key) {
  const clean = normalizeRecoveryKey(key);
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.pbkdf2Sync(clean, salt, PBKDF2_ROUNDS, 32, 'sha256').toString('hex');
  return `${PBKDF2_ROUNDS}:${salt}:${derived}`;
}

export async function verifyRecoveryKeyHashAsync(key, storedHash) {
  const clean = normalizeRecoveryKey(key);
  const parsed = parsePbkdf2Hash(storedHash);
  if (!clean || !parsed) return false;
  const derived = await pbkdf2Async(clean, parsed.salt, parsed.rounds, 32, 'sha256');
  const bufA = Buffer.from(derived.toString('hex'), 'hex');
  const bufB = Buffer.from(parsed.originalDerived, 'hex');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function verifyRecoveryKeyHash(key, storedHash) {
  const clean = normalizeRecoveryKey(key);
  const parsed = parsePbkdf2Hash(storedHash);
  if (!clean || !parsed) return false;
  const derived = crypto.pbkdf2Sync(clean, parsed.salt, parsed.rounds, 32, 'sha256').toString('hex');
  const bufA = Buffer.from(derived, 'hex');
  const bufB = Buffer.from(parsed.originalDerived, 'hex');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function normalizeSecurityAnswer(ans) {
  if (!ans) return '';
  return String(ans).trim().toLowerCase();
}

export async function hashSecurityAnswerAsync(ans) {
  const clean = normalizeSecurityAnswer(ans);
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = await pbkdf2Async(clean, salt, PBKDF2_ROUNDS, 32, 'sha256');
  return `${PBKDF2_ROUNDS}:${salt}:${derived.toString('hex')}`;
}

export function hashSecurityAnswer(ans) {
  const clean = normalizeSecurityAnswer(ans);
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.pbkdf2Sync(clean, salt, PBKDF2_ROUNDS, 32, 'sha256').toString('hex');
  return `${PBKDF2_ROUNDS}:${salt}:${derived}`;
}

export async function verifySecurityAnswerHashAsync(ans, storedHash) {
  const clean = normalizeSecurityAnswer(ans);
  const parsed = parsePbkdf2Hash(storedHash);
  if (!clean || !parsed) return false;
  const derived = await pbkdf2Async(clean, parsed.salt, parsed.rounds, 32, 'sha256');
  const bufA = Buffer.from(derived.toString('hex'), 'hex');
  const bufB = Buffer.from(parsed.originalDerived, 'hex');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function verifySecurityAnswerHash(ans, storedHash) {
  const clean = normalizeSecurityAnswer(ans);
  const parsed = parsePbkdf2Hash(storedHash);
  if (!clean || !parsed) return false;
  const derived = crypto.pbkdf2Sync(clean, parsed.salt, parsed.rounds, 32, 'sha256').toString('hex');
  const bufA = Buffer.from(derived, 'hex');
  const bufB = Buffer.from(parsed.originalDerived, 'hex');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

const HEX_COLOR_REGEX = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

export class UserRepository {
  /**
   * @param {import('node:sqlite').DatabaseSync} db
   */
  constructor(db) {
    this.db = db;
  }

  getAll() {
    try {
      return this.db.prepare(`
        SELECT u.id, u.name, u.avatar_color, u.created_at,
               (CASE WHEN u.pin_hash IS NOT NULL THEN 1 ELSE 0 END) as has_pin
        FROM users u
        ORDER BY u.created_at ASC
      `).all();
    } catch (_) {
      return [];
    }
  }

  /**
   * Verifica se dois usuários possuem vínculo autorizado legítimo
   * (compartilhamento familiar ativo em ao menos uma lista de compras)
   * @param {string} userIdA
   * @param {string} userIdB
   * @returns {boolean}
   */
  hasAuthorizedLink(userIdA, userIdB) {
    if (!userIdA || !userIdB) return false;
    if (userIdA === userIdB) return true;

    try {
      const row = this.db.prepare(`
        SELECT 1 FROM shopping_lists sl
        WHERE (
          -- sl pertence a A e B tem share
          (sl.owner_id = ? AND EXISTS (SELECT 1 FROM list_shares ls WHERE ls.list_id = sl.id AND ls.user_id = ?))
          OR
          -- sl pertence a B e A tem share
          (sl.owner_id = ? AND EXISTS (SELECT 1 FROM list_shares ls WHERE ls.list_id = sl.id AND ls.user_id = ?))
          OR
          -- Ambos têm share ativo na mesma lista de compras compartilhada
          (EXISTS (SELECT 1 FROM list_shares lsA WHERE lsA.list_id = sl.id AND lsA.user_id = ?)
           AND EXISTS (SELECT 1 FROM list_shares lsB WHERE lsB.list_id = sl.id AND lsB.user_id = ?))
        )
        LIMIT 1
      `).get(userIdA, userIdB, userIdB, userIdA, userIdA, userIdB);
      return Boolean(row);
    } catch (_) {
      return false;
    }
  }

  getById(id) {
    let user;
    try {
      user = this.db.prepare(`
        SELECT id, name, email, avatar_color, created_at, security_question,
               COALESCE(token_version, 1) as token_version,
               (CASE WHEN pin_hash IS NOT NULL THEN 1 ELSE 0 END) as has_pin,
               (CASE WHEN recovery_key_hash IS NOT NULL THEN 1 ELSE 0 END) as has_recovery_key,
               (CASE WHEN security_answer_hash IS NOT NULL THEN 1 ELSE 0 END) as has_security_question
        FROM users
        WHERE id = ?
      `).get(id);
    } catch (_) {
      try {
        user = this.db.prepare(`
          SELECT id, name, email, avatar_color, created_at,
                 (CASE WHEN pin_hash IS NOT NULL THEN 1 ELSE 0 END) as has_pin
          FROM users
          WHERE id = ?
        `).get(id);
      } catch (__) {
        user = this.db.prepare(`
          SELECT id, name, avatar_color, created_at,
                 (CASE WHEN pin_hash IS NOT NULL THEN 1 ELSE 0 END) as has_pin
          FROM users
          WHERE id = ?
        `).get(id);
      }
    }

    if (!user) return null;

    let stats = { total_lists: 0, total_items_purchased: 0, total_spent_cents: 0 };
    try {
      stats = this.db.prepare(`
        SELECT 
          (SELECT COUNT(*) FROM shopping_lists WHERE owner_id = ?) as total_lists,
          (SELECT COUNT(*) FROM list_items WHERE purchased_by_user_id = ?) as total_items_purchased,
          (SELECT COALESCE(SUM(actual_price_cents), 0) FROM list_items WHERE purchased_by_user_id = ?) as total_spent_cents
      `).get(id, id, id) || stats;
    } catch (_) {}

    return {
      ...user,
      stats: {
        totalLists: stats.total_lists || 0,
        totalItemsPurchased: stats.total_items_purchased || 0,
        totalSpentCents: stats.total_spent_cents || 0
      }
    };
  }

  getByEmail(email) {
    if (!email) return null;
    const clean = String(email).trim().toLowerCase();
    try {
      const user = this.db.prepare(`
        SELECT id
        FROM users
        WHERE LOWER(email) = ?
      `).get(clean);

      if (!user) return null;
      return this.getById(user.id);
    } catch (_) {
      return null;
    }
  }

  /**
   * Registra um código numérico de 6 dígitos para confirmação de e-mail ou recuperação de senha.
   * @param {string} email 
   * @param {'register' | 'recover'} purpose 
   * @param {string} code 
   * @param {number} [expiresInMinutes=15] 
   */
  createVerificationCode(email, purpose, code, expiresInMinutes = 15) {
    const cleanEmail = String(email).trim().toLowerCase();
    // [AUDIT-FIX SEC-01]: ID único gerado com CSPRNG (crypto.randomBytes)
    const id = 'vcode_' + Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000).toISOString();

    const otpSecret = process.env.AUTH_SECRET || 'cestaon-otp-secret';
    const codeHash = crypto
      .createHmac('sha256', otpSecret)
      .update(`${cleanEmail}:${purpose}:${String(code).trim()}`)
      .digest('hex');

    try {
      this.db.prepare('DELETE FROM email_verifications WHERE email = ? AND purpose = ?').run(cleanEmail, purpose);
    } catch (_) {}

    try {
      this.db.prepare(`
        INSERT INTO email_verifications (id, email, code, purpose, expires_at, attempts)
        VALUES (?, ?, ?, ?, ?, 0)
      `).run(id, cleanEmail, codeHash, purpose, expiresAt);
      return { id, email: cleanEmail, code, expiresAt };
    } catch (_) {
      return null;
    }
  }

  /**
   * Valida o código informado pelo usuário contra o registrado no banco.
   * @param {string} email 
   * @param {'register' | 'recover'} purpose 
   * @param {string} code 
   * @returns {{ valid: boolean, reason?: string }}
   */
  verifyCode(email, purpose, code) {
    if (!email || !code) return { valid: false, reason: 'E-mail e código são obrigatórios' };
    const cleanEmail = String(email).trim().toLowerCase();
    const cleanCode = String(code).trim();

    try {
      const record = this.db.prepare(`
        SELECT * FROM email_verifications
        WHERE email = ? AND purpose = ?
        ORDER BY created_at DESC
        LIMIT 1
      `).get(cleanEmail, purpose);

      if (!record) {
        return { valid: false, reason: 'Nenhum código de verificação encontrado para este e-mail' };
      }

      if (new Date(record.expires_at).getTime() < Date.now()) {
        return { valid: false, reason: 'Código de verificação expirado. Solicite um novo código.' };
      }

      if (record.attempts >= 5) {
        return { valid: false, reason: 'Muitas tentativas incorretas. Solicite um novo código.' };
      }

      const otpSecret = process.env.AUTH_SECRET || 'cestaon-otp-secret';
      const expectedHash = crypto
        .createHmac('sha256', otpSecret)
        .update(`${cleanEmail}:${purpose}:${cleanCode}`)
        .digest('hex');

      const bufA = Buffer.from(record.code, 'hex');
      const bufB = Buffer.from(expectedHash, 'hex');
      const isMatch = (bufA.length === bufB.length) && crypto.timingSafeEqual(bufA, bufB);
      const isLegacyMatch = record.code === cleanCode;

      if (!isMatch && !isLegacyMatch) {
        const attemptSql = 'UPDATE email_verifications SET attempts = attempts + 1 WHERE id = ?';
        try {
          this.db.prepare(attemptSql).run(record.id);
        } catch (_) {}
        // [AUDIT-FIX SEC-01]: Registra a atualização no contexto da requisição para que,
        // mesmo se a rota responder 400/401 e o savepoint for revertido, o incremento persista.
        try {
          const store = requestContextStorage?.getStore?.();
          if (store?.pendingSecurityUpdates) {
            store.pendingSecurityUpdates.push({
              sql: attemptSql,
              args: [record.id]
            });
          }
        } catch (_) {}
        return { valid: false, reason: 'Código de verificação incorreto' };
      }

      // Código válido: consome para não permitir reuso
      try {
        this.db.prepare('DELETE FROM email_verifications WHERE id = ?').run(record.id);
      } catch (_) {}

      return { valid: true };
    } catch (_) {
      return { valid: false, reason: 'Erro ao validar código de verificação' };
    }
  }

  create({ name, email = null, avatar_color = '#10B981', pin = null, security_question = null, security_answer = null, recovery_key = null }) {
    const id = 'usr_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
    let pinHash = null;
    if (pin) {
      pinHash = hashPin(pin);
    }

    const safeName = (name || '').trim().slice(0, 60) || 'Usuário';
    const safeEmail = (email && typeof email === 'string' && email.trim()) ? email.trim().toLowerCase().slice(0, 100) : null;
    if (safeEmail) {
      const existing = this.getByEmail(safeEmail);
      if (existing) {
        throw new Error('Este e-mail já está em uso por outro usuário');
      }
    }
    const safeColor = (typeof avatar_color === 'string' && HEX_COLOR_REGEX.test(avatar_color.trim()))
      ? avatar_color.trim()
      : '#10B981';

    // Opção 2: Chave de Recuperação
    const plainRecoveryKey = recovery_key ? recovery_key.trim() : generateRecoveryKey();
    const recoveryKeyHash = hashRecoveryKey(plainRecoveryKey);

    // Opção 3: Pergunta e Resposta Secreta
    const safeQuestion = security_question ? String(security_question).trim().slice(0, 120) : null;
    const answerHash = security_answer ? hashSecurityAnswer(security_answer) : null;

    try {
      this.db.prepare(`
        INSERT INTO users (id, name, email, avatar_color, pin_hash, recovery_key_hash, security_question, security_answer_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, safeName, safeEmail, safeColor, pinHash, recoveryKeyHash, safeQuestion, answerHash);
    } catch (err) {
      if (err && (String(err.message).includes('UNIQUE') || err.code === 'SQLITE_CONSTRAINT_UNIQUE')) {
        throw new Error('Este e-mail já está em uso por outro usuário');
      }
      try {
        this.db.prepare(`
          INSERT INTO users (id, name, email, avatar_color, pin_hash)
          VALUES (?, ?, ?, ?, ?)
        `).run(id, safeName, safeEmail, safeColor, pinHash);
      } catch (err2) {
        if (err2 && (String(err2.message).includes('UNIQUE') || err2.code === 'SQLITE_CONSTRAINT_UNIQUE')) {
          throw new Error('Este e-mail já está em uso por outro usuário');
        }
        this.db.prepare(`
          INSERT INTO users (id, name, avatar_color, pin_hash)
          VALUES (?, ?, ?, ?)
        `).run(id, safeName, safeColor, pinHash);
      }
    }

    const created = this.getById(id);
    return {
      ...created,
      recovery_key: plainRecoveryKey
    };
  }

  update(id, { name, email, avatar_color, pin, recovery_key, security_question, security_answer }) {
    const user = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!user) return null;

    let finalName = user.name;
    if (name !== undefined) {
      finalName = String(name).trim().slice(0, 60) || user.name;
    }

    let finalEmail = user.email;
    if (email !== undefined) {
      finalEmail = (email && typeof email === 'string' && email.trim()) ? email.trim().toLowerCase().slice(0, 100) : null;
      if (finalEmail) {
        const existing = this.getByEmail(finalEmail);
        if (existing && existing.id !== id) {
          throw new Error('Este e-mail já está em uso por outro usuário');
        }
      }
    }

    let finalColor = user.avatar_color;
    if (avatar_color !== undefined) {
      finalColor = (typeof avatar_color === 'string' && HEX_COLOR_REGEX.test(avatar_color.trim()))
        ? avatar_color.trim()
        : user.avatar_color;
    }

    let finalPinHash = user.pin_hash;
    if (pin !== undefined) {
      finalPinHash = pin ? hashPin(pin) : null;
    }

    let finalKeyHash = user.recovery_key_hash;
    let plainKey = null;
    if (recovery_key !== undefined) {
      if (recovery_key) {
        plainKey = recovery_key.trim();
        finalKeyHash = hashRecoveryKey(plainKey);
      } else {
        finalKeyHash = null;
      }
    }

    let finalQuestion = user.security_question;
    if (security_question !== undefined) {
      finalQuestion = security_question ? String(security_question).trim().slice(0, 120) : null;
    }

    let finalAnswerHash = user.security_answer_hash;
    if (security_answer !== undefined) {
      finalAnswerHash = security_answer ? hashSecurityAnswer(security_answer) : null;
    }

    try {
      this.db.prepare(`
        UPDATE users
        SET name = ?, email = ?, avatar_color = ?, pin_hash = ?,
            recovery_key_hash = ?, security_question = ?, security_answer_hash = ?
        WHERE id = ?
      `).run(finalName, finalEmail, finalColor, finalPinHash, finalKeyHash, finalQuestion, finalAnswerHash, id);
    } catch (err) {
      if (err && (String(err.message).includes('UNIQUE') || err.code === 'SQLITE_CONSTRAINT_UNIQUE')) {
        throw new Error('Este e-mail já está em uso por outro usuário');
      }
      try {
        this.db.prepare(`
          UPDATE users
          SET name = ?, email = ?, avatar_color = ?, pin_hash = ?
          WHERE id = ?
        `).run(finalName, finalEmail, finalColor, finalPinHash, id);
      } catch (err2) {
        if (err2 && (String(err2.message).includes('UNIQUE') || err2.code === 'SQLITE_CONSTRAINT_UNIQUE')) {
          throw new Error('Este e-mail já está em uso por outro usuário');
        }
        this.db.prepare(`
          UPDATE users
          SET name = ?, avatar_color = ?, pin_hash = ?
          WHERE id = ?
        `).run(finalName, finalColor, finalPinHash, id);
      }
    }

    if (pin !== undefined) {
      try {
        this.db.prepare('UPDATE users SET token_version = COALESCE(token_version, 1) + 1 WHERE id = ?').run(id);
      } catch (_) {}
    }

    const updated = this.getById(id);
    if (plainKey) {
      return { ...updated, recovery_key: plainKey };
    }
    return updated;
  }

  async createAsync(payload) {
    const { name, email = null, avatar_color = '#10B981', pin = null, security_question = null, security_answer = null, recovery_key = null } = payload;
    const id = 'usr_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
    let pinHash = null;
    if (pin) {
      pinHash = await hashPinAsync(pin);
    }

    const safeName = (name || '').trim().slice(0, 60) || 'Usuário';
    const safeEmail = (email && typeof email === 'string' && email.trim()) ? email.trim().toLowerCase().slice(0, 100) : null;
    if (safeEmail) {
      const existing = this.getByEmail(safeEmail);
      if (existing) {
        throw new Error('Este e-mail já está em uso por outro usuário');
      }
    }
    const safeColor = (typeof avatar_color === 'string' && HEX_COLOR_REGEX.test(avatar_color.trim()))
      ? avatar_color.trim()
      : '#10B981';

    const plainRecoveryKey = recovery_key ? recovery_key.trim() : generateRecoveryKey();
    const recoveryKeyHash = await hashRecoveryKeyAsync(plainRecoveryKey);

    const safeQuestion = security_question ? String(security_question).trim().slice(0, 120) : null;
    const answerHash = security_answer ? await hashSecurityAnswerAsync(security_answer) : null;

    try {
      this.db.prepare(`
        INSERT INTO users (id, name, email, avatar_color, pin_hash, recovery_key_hash, security_question, security_answer_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, safeName, safeEmail, safeColor, pinHash, recoveryKeyHash, safeQuestion, answerHash);
    } catch (err) {
      if (err && (String(err.message).includes('UNIQUE') || err.code === 'SQLITE_CONSTRAINT_UNIQUE')) {
        throw new Error('Este e-mail já está em uso por outro usuário');
      }
      try {
        this.db.prepare(`
          INSERT INTO users (id, name, email, avatar_color, pin_hash)
          VALUES (?, ?, ?, ?, ?)
        `).run(id, safeName, safeEmail, safeColor, pinHash);
      } catch (err2) {
        if (err2 && (String(err2.message).includes('UNIQUE') || err2.code === 'SQLITE_CONSTRAINT_UNIQUE')) {
          throw new Error('Este e-mail já está em uso por outro usuário');
        }
        this.db.prepare(`
          INSERT INTO users (id, name, avatar_color, pin_hash)
          VALUES (?, ?, ?, ?)
        `).run(id, safeName, safeColor, pinHash);
      }
    }

    const created = this.getById(id);
    return {
      ...created,
      recovery_key: plainRecoveryKey
    };
  }

  async updateAsync(id, { name, email, avatar_color, pin, recovery_key, security_question, security_answer }) {
    const user = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!user) return null;

    let finalName = user.name;
    if (name !== undefined) {
      finalName = String(name).trim().slice(0, 60) || user.name;
    }

    let finalEmail = user.email;
    if (email !== undefined) {
      finalEmail = (email && typeof email === 'string' && email.trim()) ? email.trim().toLowerCase().slice(0, 100) : null;
      if (finalEmail) {
        const existing = this.getByEmail(finalEmail);
        if (existing && existing.id !== id) {
          throw new Error('Este e-mail já está em uso por outro usuário');
        }
      }
    }

    let finalColor = user.avatar_color;
    if (avatar_color !== undefined) {
      finalColor = (typeof avatar_color === 'string' && HEX_COLOR_REGEX.test(avatar_color.trim()))
        ? avatar_color.trim()
        : user.avatar_color;
    }

    let finalPinHash = user.pin_hash;
    if (pin !== undefined) {
      finalPinHash = pin ? await hashPinAsync(pin) : null;
    }

    let finalKeyHash = user.recovery_key_hash;
    let plainKey = null;
    if (recovery_key !== undefined) {
      if (recovery_key) {
        plainKey = recovery_key.trim();
        finalKeyHash = await hashRecoveryKeyAsync(plainKey);
      } else {
        finalKeyHash = null;
      }
    }

    let finalQuestion = user.security_question;
    if (security_question !== undefined) {
      finalQuestion = security_question ? String(security_question).trim().slice(0, 120) : null;
    }

    let finalAnswerHash = user.security_answer_hash;
    if (security_answer !== undefined) {
      finalAnswerHash = security_answer ? await hashSecurityAnswerAsync(security_answer) : null;
    }

    try {
      this.db.prepare(`
        UPDATE users
        SET name = ?, email = ?, avatar_color = ?, pin_hash = ?,
            recovery_key_hash = ?, security_question = ?, security_answer_hash = ?
        WHERE id = ?
      `).run(finalName, finalEmail, finalColor, finalPinHash, finalKeyHash, finalQuestion, finalAnswerHash, id);
    } catch (err) {
      if (err && (String(err.message).includes('UNIQUE') || err.code === 'SQLITE_CONSTRAINT_UNIQUE')) {
        throw new Error('Este e-mail já está em uso por outro usuário');
      }
      try {
        this.db.prepare(`
          UPDATE users
          SET name = ?, email = ?, avatar_color = ?, pin_hash = ?
          WHERE id = ?
        `).run(finalName, finalEmail, finalColor, finalPinHash, id);
      } catch (err2) {
        if (err2 && (String(err2.message).includes('UNIQUE') || err2.code === 'SQLITE_CONSTRAINT_UNIQUE')) {
          throw new Error('Este e-mail já está em uso por outro usuário');
        }
        this.db.prepare(`
          UPDATE users
          SET name = ?, avatar_color = ?, pin_hash = ?
          WHERE id = ?
        `).run(finalName, finalColor, finalPinHash, id);
      }
    }

    if (pin !== undefined) {
      try {
        this.db.prepare('UPDATE users SET token_version = COALESCE(token_version, 1) + 1 WHERE id = ?').run(id);
      } catch (_) {}
    }

    const updated = this.getById(id);
    if (plainKey) {
      return { ...updated, recovery_key: plainKey };
    }
    return updated;
  }

  hasPin(id) {
    const user = this.db.prepare('SELECT pin_hash FROM users WHERE id = ?').get(id);
    return Boolean(user && user.pin_hash);
  }

  async verifyPinAsync(id, pin) {
    if (!pin) return false;
    const user = this.db.prepare('SELECT pin_hash FROM users WHERE id = ?').get(id);
    if (!user || !user.pin_hash) return false;
    return verifyPinHashAsync(pin, user.pin_hash);
  }

  verifyPin(id, pin) {
    if (!pin) return false;
    const user = this.db.prepare('SELECT pin_hash FROM users WHERE id = ?').get(id);
    if (!user || !user.pin_hash) return false;
    return verifyPinHash(pin, user.pin_hash);
  }

  async verifyRecoveryKeyAsync(id, key) {
    if (!key) return false;
    const user = this.db.prepare('SELECT recovery_key_hash FROM users WHERE id = ?').get(id);
    if (!user || !user.recovery_key_hash) return false;
    return verifyRecoveryKeyHashAsync(key, user.recovery_key_hash);
  }

  verifyRecoveryKey(id, key) {
    if (!key) return false;
    const user = this.db.prepare('SELECT recovery_key_hash FROM users WHERE id = ?').get(id);
    if (!user || !user.recovery_key_hash) return false;
    return verifyRecoveryKeyHash(key, user.recovery_key_hash);
  }

  async verifySecurityAnswerAsync(id, answer) {
    if (!answer) return false;
    const user = this.db.prepare('SELECT security_answer_hash FROM users WHERE id = ?').get(id);
    if (!user || !user.security_answer_hash) return false;
    return verifySecurityAnswerHashAsync(answer, user.security_answer_hash);
  }

  verifySecurityAnswer(id, answer) {
    if (!answer) return false;
    const user = this.db.prepare('SELECT security_answer_hash FROM users WHERE id = ?').get(id);
    if (!user || !user.security_answer_hash) return false;
    return verifySecurityAnswerHash(answer, user.security_answer_hash);
  }

  getSecurityQuestionByEmail(email) {
    if (!email) return null;
    const clean = String(email).trim().toLowerCase();
    try {
      const user = this.db.prepare('SELECT id, email, security_question FROM users WHERE LOWER(email) = ?').get(clean);
      if (!user) return null;
      return {
        userId: user.id,
        email: user.email,
        question: user.security_question
      };
    } catch (_) {
      return null;
    }
  }

  /**
   * Eliminação definitiva de conta e dados pessoais (LGPD - Art. 18, VI)
   * Executa em transação atômica BEGIN IMMEDIATE para garantir que nenhum dado órfão
   * permaneça no banco e evita colisão com a constraint RESTRICT de purchase_history.
   */
  deleteAccount(userId) {
    if (!userId) return false;
    const user = this.db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!user) return false;

    try {
      this.db.exec('BEGIN IMMEDIATE;');

      // 1. Remove registros de histórico de preços ligados às listas deste usuário
      this.db.prepare(`
        DELETE FROM price_history 
        WHERE list_id IN (SELECT id FROM shopping_lists WHERE owner_id = ?)
      `).run(userId);

      // 2. Remove registros de purchase_history ligados às listas deste usuário (evita falha de RESTRICT)
      this.db.prepare(`
        DELETE FROM purchase_history 
        WHERE list_id IN (SELECT id FROM shopping_lists WHERE owner_id = ?)
      `).run(userId);

      // 3. Remove itens das listas criadas por este usuário
      this.db.prepare(`
        DELETE FROM list_items 
        WHERE list_id IN (SELECT id FROM shopping_lists WHERE owner_id = ?)
      `).run(userId);

      // 4. Desvincula o usuário de itens comprados por ele em listas de outros membros
      this.db.prepare(`
        UPDATE list_items 
        SET purchased_by_user_id = NULL 
        WHERE purchased_by_user_id = ?
      `).run(userId);

      // 5. Remove compartilhamentos das listas do usuário e participações do usuário em listas de terceiros
      this.db.prepare(`
        DELETE FROM list_shares 
        WHERE list_id IN (SELECT id FROM shopping_lists WHERE owner_id = ?) OR user_id = ?
      `).run(userId, userId);

      // 6. Remove todas as listas do usuário
      this.db.prepare(`
        DELETE FROM shopping_lists 
        WHERE owner_id = ?
      `).run(userId);

      // 7. Remove permanentemente o registro do usuário
      const result = this.db.prepare('DELETE FROM users WHERE id = ?').run(userId);

      this.db.exec('COMMIT;');
      return result.changes > 0;
    } catch (err) {
      try {
        this.db.exec('ROLLBACK;');
      } catch (_) {}
      throw err;
    }
  }

  async deleteAccountAsync(userId) {
    return this.deleteAccount(userId);
  }

  /**
   * Exporta todos os dados do titular em formato estruturado (LGPD - Art. 18, V)
   */
  exportUserData(userId) {
    const user = this.db.prepare(`
      SELECT id, name, email, avatar_color, created_at,
             (CASE WHEN pin_hash IS NOT NULL THEN 1 ELSE 0 END) as has_pin,
             (CASE WHEN security_question IS NOT NULL THEN 1 ELSE 0 END) as has_security_question
      FROM users WHERE id = ?
    `).get(userId);
    if (!user) return null;

    const lists = this.db.prepare(`
      SELECT sl.id, sl.title, sl.budget_cents, sl.status, sl.created_at, sl.completed_at,
             s.name as store_name
      FROM shopping_lists sl
      LEFT JOIN stores s ON s.id = sl.store_id
      WHERE sl.owner_id = ?
      ORDER BY sl.created_at DESC
    `).all(userId);

    const detailedLists = lists.map((list) => {
      const items = this.db.prepare(`
        SELECT li.id, COALESCE(li.custom_name, p.name) as name, li.quantity, li.unit,
               li.estimated_price_cents, li.actual_price_cents, li.is_purchased,
               c.name as category_name
        FROM list_items li
        LEFT JOIN products p ON p.id = li.product_id
        LEFT JOIN categories c ON c.id = li.category_id
        WHERE li.list_id = ?
      `).all(list.id);
      return { ...list, items };
    });

    const purchases = this.db.prepare(`
      SELECT ph.id, ph.list_id, sl.title as list_title, s.name as store_name,
             ph.total_spent_cents, ph.completed_at, ph.notes
      FROM purchase_history ph
      JOIN shopping_lists sl ON sl.id = ph.list_id
      LEFT JOIN stores s ON s.id = ph.store_id
      WHERE sl.owner_id = ?
      ORDER BY ph.completed_at DESC
    `).all(userId);

    return {
      exported_at: new Date().toISOString(),
      disclaimer: 'Relatório estruturado de portabilidade de dados pessoais (Art. 18, V da Lei 13.709/2018 - LGPD).',
      user,
      shopping_lists: detailedLists,
      purchase_history: purchases
    };
  }

  async exportUserDataAsync(userId) {
    return this.exportUserData(userId);
  }
}
