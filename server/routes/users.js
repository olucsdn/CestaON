import { Router } from 'express';
import crypto from 'node:crypto';
import { pinRateLimiter, creationRateLimiter } from '../middlewares/rateLimiter.js';
import { validateUserData } from '../middlewares/validators.js';
import { generateRecoveryKey } from '../repositories/userRepository.js';
import { createSessionToken, requireAuth, isTestEnvironment } from '../middlewares/auth.js';
import { sendVerificationCodeEmail } from '../services/emailService.js';

/**
 * Extrai o identificador autorizado do solicitante.
 * Prioriza estritamente o token de sessão validado (req.user).
 * Em qualquer ambiente que não seja teste automatizado local, rejeita headers/query/body (fail-closed).
 */
function getAuthorizedCallerId(req) {
  if (req.user?.id) return req.user.id;
  if (req.user?.sub) return req.user.sub;
  if (isTestEnvironment()) {
    return req.headers['x-user-id'] || req.query?.userId || req.body?.user_id || req.body?.caller_id || null;
  }
  return null;
}

export function createUsersRouter({ userRepo }) {
  const router = Router();

  router.get('/', requireAuth, (req, res) => {
    const callerId = getAuthorizedCallerId(req);
    if (!callerId) {
      return res.status(401).json({ error: 'Autenticação necessária para listar usuários' });
    }

    const allUsers = userRepo.getAll();
    // Restringe estritamente ao próprio usuário solicitante e aos contatos com vínculo autorizado ativo
    const scopedUsers = allUsers.filter((u) => {
      if (u.id === callerId) return true;
      return userRepo.hasAuthorizedLink ? userRepo.hasAuthorizedLink(callerId, u.id) : false;
    });

    res.json(scopedUsers);
  });

  router.get('/:id', requireAuth, (req, res) => {
    const callerId = getAuthorizedCallerId(req);
    if (!callerId) {
      return res.status(401).json({ error: 'Autenticação necessária para consultar perfil' });
    }

    const targetUser = userRepo.getById(req.params.id);
    if (!targetUser) return res.status(404).json({ error: 'Usuário não encontrado' });

    // Se o solicitante for o próprio titular, retorna todos os dados do perfil (incluindo email, security_question e stats)
    if (callerId === req.params.id) {
      return res.json(targetUser);
    }

    // Acesso cruzado: verifica se existe vínculo autorizado legítimo (ex: compartilhamento familiar ativo)
    const isLinked = userRepo.hasAuthorizedLink ? userRepo.hasAuthorizedLink(callerId, req.params.id) : false;
    if (!isLinked) {
      return res.status(403).json({ error: 'Acesso negado: não autorizado a visualizar perfil de outro titular sem vínculo' });
    }

    // Com vínculo autorizado, expõe estritamente os campos públicos necessários, bloqueando acesso a dados privados
    return res.json({
      id: targetUser.id,
      name: targetUser.name,
      avatar_color: targetUser.avatar_color,
      created_at: targetUser.created_at,
      has_pin: targetUser.has_pin
    });
  });

  router.post('/:id/verify-pin', async (req, res, next) => {
    try {
      const callerId = getAuthorizedCallerId(req);
      if (process.env.NODE_ENV === 'production' && !callerId) {
        return res.status(401).json({ error: 'Autenticação necessária para verificar PIN' });
      }
      if (callerId && callerId !== req.params.id) {
        return res.status(403).json({ error: 'Acesso não autorizado para verificar PIN de outro usuário' });
      }

      const ip = req.ip || req.socket?.remoteAddress || 'local';
      const limitKey = `${ip}:${req.params.id}`;
      if (!pinRateLimiter.check(limitKey)) {
        return res.status(429).json({ error: 'Muitas tentativas de PIN incorretas. Aguarde 1 minuto.' });
      }

      const { pin } = req.body;
      if (!pin) return res.status(400).json({ error: 'PIN não informado' });
      const isValid = userRepo.verifyPinAsync
        ? await userRepo.verifyPinAsync(req.params.id, String(pin).trim())
        : userRepo.verifyPin(req.params.id, String(pin).trim());
      if (isValid) {
        pinRateLimiter.reset(limitKey);
      }
      res.json({ valid: isValid });
    } catch (err) {
      next(err);
    }
  });

  router.post('/login', async (req, res, next) => {
    try {
      const ip = req.ip || req.socket?.remoteAddress || 'local';
      const limitKey = `${ip}:login`;
      const { email, password, pin } = req.body;
      const normalizedEmail = email ? String(email).trim().toLowerCase() : '';
      const accountLimitKey = normalizedEmail ? `login:${normalizedEmail}` : null;

      if (!pinRateLimiter.check(limitKey) || (accountLimitKey && !pinRateLimiter.check(accountLimitKey))) {
        return res.status(429).json({ error: 'Muitas tentativas de login incorretas. Aguarde 1 minuto.' });
      }

      const cred = password || pin;
      if (!email || !String(email).trim()) {
        return res.status(400).json({ error: 'E-mail é obrigatório para login' });
      }
      if (!cred || !String(cred).trim()) {
        return res.status(400).json({ error: 'Senha é obrigatória para login' });
      }

      const user = userRepo.getByEmail(String(email).trim());
      if (!user) {
        return res.status(401).json({ error: 'E-mail ou senha inválidos' });
      }

      if (!user.email || !user.email.trim()) {
        return res.status(403).json({ error: 'Esta conta foi cadastrada sem e-mail e foi deslogada por segurança' });
      }

      if (!user.has_pin) {
        return res.status(401).json({ error: 'E-mail ou senha inválidos' });
      }

      const isValid = userRepo.verifyPinAsync
        ? await userRepo.verifyPinAsync(user.id, String(cred).trim())
        : userRepo.verifyPin(user.id, String(cred).trim());
      if (!isValid) {
        return res.status(401).json({ error: 'E-mail ou senha inválidos' });
      }

      pinRateLimiter.reset(limitKey);
      if (accountLimitKey) pinRateLimiter.reset(accountLimitKey);
      const token = createSessionToken({
        sub: user.id,
        email: user.email,
        name: user.name,
        token_version: user.token_version ?? 1
      });
      res.json({ message: 'Login realizado com sucesso', user, token });
    } catch (err) {
      next(err);
    }
  });

  router.post('/send-verification-code', async (req, res, next) => {
    try {
      const ip = req.ip || req.socket?.remoteAddress || 'local';
      const limitKey = `${ip}:send-vcode`;
      if (!pinRateLimiter.check(limitKey)) {
        return res.status(429).json({ error: 'Muitos códigos solicitados. Aguarde 1 minuto.' });
      }

      const { email, purpose } = req.body;
      if (!email || !String(email).trim()) {
        return res.status(400).json({ error: 'E-mail é obrigatório para envio do código' });
      }

      const cleanEmail = String(email).trim().toLowerCase();
      const validPurpose = purpose === 'recover' ? 'recover' : 'register';

      if (validPurpose === 'register') {
        const existing = userRepo.getByEmail(cleanEmail);
        if (existing) {
          return res.status(409).json({ error: 'Este e-mail já está cadastrado. Faça login ou recupere seu acesso.' });
        }
      } else if (validPurpose === 'recover') {
        const existing = userRepo.getByEmail(cleanEmail);
        if (!existing) {
          return res.status(404).json({ error: 'Nenhum usuário cadastrado com este e-mail' });
        }
      }

      // [AUDIT-FIX SEC-01]: Geração criptográfica segura com CSPRNG do SO
      const code = crypto.randomInt(100000, 1000000).toString();
      userRepo.createVerificationCode(cleanEmail, validPurpose, code, 15);

      const emailResult = await sendVerificationCodeEmail(cleanEmail, code, validPurpose);
      if (!emailResult.success && !emailResult.simulated) {
        return res.status(502).json({
          error: `Não foi possível enviar o código para o seu e-mail (${emailResult.error || 'Erro SMTP'}). Verifique o endereço digitado ou tente novamente.`
        });
      }

      res.json({
        success: true,
        message: 'Código de verificação enviado com sucesso para o seu e-mail!',
        email: cleanEmail,
        expires_in_minutes: 15,
        simulated: emailResult.simulated || false
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/security-question', (req, res) => {
    const ip = req.ip || req.socket?.remoteAddress || 'local';
    const { email } = req.body;
    if (!email || !String(email).trim()) {
      return res.status(400).json({ error: 'E-mail é obrigatório' });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const limitKey = `${ip}:sec-question`;
    const emailLimitKey = `sec-question:${cleanEmail}`;
    if (!pinRateLimiter.check(limitKey) || !pinRateLimiter.check(emailLimitKey)) {
      return res.status(429).json({ error: 'Muitas consultas. Aguarde 1 minuto.' });
    }

    const info = userRepo.getSecurityQuestionByEmail(cleanEmail);
    if (!info || !info.question) {
      return res.status(404).json({ error: 'Nenhuma pergunta de segurança configurada para este e-mail' });
    }

    res.json({ email: info.email, question: info.question });
  });

  router.post('/recover', async (req, res, next) => {
    try {
      const ip = req.ip || req.socket?.remoteAddress || 'local';
      const limitKey = `${ip}:recover`;
      if (!pinRateLimiter.check(limitKey)) {
        return res.status(429).json({ error: 'Muitas tentativas de recuperação. Aguarde 1 minuto.' });
      }

      const { email, password, pin, recovery_key, security_answer, verification_code } = req.body;
      const newCred = password || pin;
      if (!email || !String(email).trim()) {
        return res.status(400).json({ error: 'E-mail cadastrado é obrigatório para recuperação' });
      }
      if (!newCred || !String(newCred).trim()) {
        return res.status(400).json({ error: 'Nova senha é obrigatória' });
      }

      const user = userRepo.getByEmail(String(email).trim());
      if (!user) {
        return res.status(404).json({ error: 'Nenhum usuário cadastrado com este e-mail' });
      }

      // Validação estrita: Opção 1 (Código no E-mail), Opção 2 (Chave Secreta) ou Opção 3 (Pergunta de Segurança)
      let authenticated = false;
      let methodUsed = '';

      if (verification_code && String(verification_code).trim()) {
        // Opção 1: Código de 6 dígitos enviado por e-mail
        const verifyResult = userRepo.verifyCode(String(email).trim().toLowerCase(), 'recover', String(verification_code).trim());
        if (!verifyResult.valid) {
          return res.status(401).json({ error: verifyResult.reason || 'Código de verificação de e-mail inválido ou expirado' });
        }
        authenticated = true;
        methodUsed = 'verification_code';
      } else if (recovery_key && String(recovery_key).trim()) {
        // Opção 2: Chave Secreta de Recuperação (Principal)
        const validKey = userRepo.verifyRecoveryKeyAsync
          ? await userRepo.verifyRecoveryKeyAsync(user.id, String(recovery_key).trim())
          : userRepo.verifyRecoveryKey(user.id, String(recovery_key).trim());
        if (!validKey) {
          return res.status(401).json({ error: 'Chave secreta de recuperação inválida ou incorreta' });
        }
        authenticated = true;
        methodUsed = 'recovery_key';
      } else if (security_answer && String(security_answer).trim()) {
        // Opção 3: Pergunta Secreta de Segurança (Fallback)
        const validAns = userRepo.verifySecurityAnswerAsync
          ? await userRepo.verifySecurityAnswerAsync(user.id, String(security_answer).trim())
          : userRepo.verifySecurityAnswer(user.id, String(security_answer).trim());
        if (!validAns) {
          return res.status(401).json({ error: 'Resposta de segurança incorreta' });
        }
        authenticated = true;
        methodUsed = 'security_answer';
      } else {
        return res.status(400).json({
          error: 'Para redefinir sua senha com segurança, informe o código enviado ao seu e-mail, sua Chave Secreta de Recuperação ou a resposta da Pergunta Secreta.'
        });
      }

      const validation = validateUserData({ pin: newCred, isUpdate: true });
      if (validation.error) {
        return res.status(validation.status).json({ error: validation.error });
      }

      pinRateLimiter.reset(limitKey);

      // Gera nova chave de emergência ao redefinir a senha para segurança total
      const newRecoveryKey = generateRecoveryKey();
      const updated = userRepo.updateAsync
        ? await userRepo.updateAsync(user.id, {
            pin: validation.safePin,
            recovery_key: newRecoveryKey
          })
        : userRepo.update(user.id, {
            pin: validation.safePin,
            recovery_key: newRecoveryKey
          });

      const token = createSessionToken({
        sub: user.id,
        email: user.email,
        name: updated.name,
        token_version: updated.token_version ?? 1
      });
      res.json({
        message: 'Senha redefinida com sucesso!',
        method: methodUsed,
        new_recovery_key: newRecoveryKey,
        user: updated,
        token
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/', async (req, res, next) => {
    try {
      const ip = req.ip || req.socket?.remoteAddress || 'local';
      if (!creationRateLimiter.check(ip)) {
        return res.status(429).json({ error: 'Muitas criações de perfis. Aguarde 1 minuto.' });
      }

      const { name, email, avatar_color, pin, security_question, security_answer, verification_code } = req.body;
      const validation = validateUserData({ name, email, avatar_color, pin, isUpdate: false });
      if (validation.error) {
        return res.status(validation.status).json({ error: validation.error });
      }

      if (process.env.NODE_ENV === 'production' && !validation.safeEmail) {
        return res.status(400).json({ error: 'E-mail obrigatório para criar uma conta.' });
      }

      if (validation.safeEmail) {
        const existing = userRepo.getByEmail(validation.safeEmail);
        if (existing) {
          return res.status(409).json({ error: 'Este e-mail já está cadastrado. Faça login ou recupere seu acesso.' });
        }

        const requireCode = process.env.NODE_ENV === 'production' || Boolean(verification_code);
        if (requireCode) {
          if (!verification_code || !String(verification_code).trim()) {
            return res.status(400).json({ error: 'Código de confirmação de 6 dígitos enviado ao seu e-mail é obrigatório para ativar a conta' });
          }
          const verifyResult = userRepo.verifyCode(validation.safeEmail, 'register', String(verification_code).trim());
          if (!verifyResult.valid) {
            return res.status(400).json({ error: verifyResult.reason || 'Código de verificação de e-mail inválido ou expirado' });
          }
        }
      }

      const createPayload = {
        name: validation.safeName,
        email: validation.safeEmail,
        avatar_color: validation.safeColor,
        pin: validation.safePin,
        security_question: security_question ? String(security_question).trim().slice(0, 120) : null,
        security_answer: security_answer ? String(security_answer).trim().slice(0, 100) : null
      };

      const user = userRepo.createAsync
        ? await userRepo.createAsync(createPayload)
        : userRepo.create(createPayload);
      const token = createSessionToken({
        sub: user.id,
        email: user.email,
        name: user.name,
        token_version: user.token_version ?? 1
      });
      res.status(201).json({ ...user, token });
    } catch (err) {
      if (err && (String(err.message).includes('UNIQUE') || String(err.message).includes('já está em uso') || String(err.message).includes('já está cadastrado'))) {
        return res.status(409).json({ error: 'Este e-mail já está cadastrado. Faça login ou recupere seu acesso.' });
      }
      next(err);
    }
  });

  router.put('/:id', async (req, res, next) => {
    try {
      // Validação estrita de autorização: exige que a sessão pertença ao próprio titular
      const callerId = getAuthorizedCallerId(req);
      if (!callerId) {
        return res.status(401).json({ error: 'Autenticação necessária para alterar dados de perfil' });
      }
      if (callerId !== req.params.id) {
        return res.status(403).json({ error: 'Não autorizado a alterar dados de outro perfil' });
      }

      const targetUser = userRepo.getById(req.params.id);
      if (!targetUser) return res.status(404).json({ error: 'Usuário não encontrado' });

      const { name, email, avatar_color, pin, current_pin } = req.body;
      // Se o perfil já possui PIN cadastrado, exige validação do PIN atual para redefinição com rate limiting
      if (pin !== undefined && userRepo.hasPin(req.params.id)) {
        if (!current_pin) {
          return res.status(400).json({ error: 'PIN atual obrigatório para redefinição' });
        }
        const ip = req.ip || req.socket?.remoteAddress || 'local';
        const limitKey = `${ip}:${req.params.id}:put`;
        if (!pinRateLimiter.check(limitKey)) {
          return res.status(429).json({ error: 'Muitas tentativas de PIN incorretas. Aguarde 1 minuto.' });
        }
        const isCurrentValid = userRepo.verifyPinAsync
          ? await userRepo.verifyPinAsync(req.params.id, String(current_pin).trim())
          : userRepo.verifyPin(req.params.id, String(current_pin).trim());
        if (!isCurrentValid) {
          return res.status(403).json({ error: 'PIN atual incorreto' });
        }
        pinRateLimiter.reset(limitKey);
      }

      const validation = validateUserData({ name, email, avatar_color, pin, isUpdate: true });
      if (validation.error) {
        return res.status(validation.status).json({ error: validation.error });
      }

      if (validation.safeEmail) {
        const existing = userRepo.getByEmail(validation.safeEmail);
        if (existing && existing.id !== req.params.id) {
          return res.status(409).json({ error: 'Este e-mail já está em uso por outra conta' });
        }
      }

      const updatePayload = {
        name: validation.safeName,
        email: validation.safeEmail,
        avatar_color: validation.safeColor,
        pin: validation.safePin
      };

      const user = userRepo.updateAsync
        ? await userRepo.updateAsync(req.params.id, updatePayload)
        : userRepo.update(req.params.id, updatePayload);
      if (pin !== undefined && user) {
        const refreshedToken = createSessionToken({
          sub: user.id,
          email: user.email,
          name: user.name,
          token_version: user.token_version ?? 1
        });
        return res.json({ ...user, token: refreshedToken });
      }
      res.json(user);
    } catch (err) {
      next(err);
    }
  });

  // DIREITO À PORTABILIDADE (LGPD - Art. 18, V)
  router.get('/:id/export', async (req, res, next) => {
    try {
      const callerId = getAuthorizedCallerId(req);
      if (!callerId) {
        return res.status(401).json({ error: 'Autenticação necessária para exportar dados do titular' });
      }
      if (callerId !== req.params.id) {
        return res.status(403).json({ error: 'Não autorizado a exportar dados de outro titular' });
      }

      const data = userRepo.exportUserDataAsync
        ? await userRepo.exportUserDataAsync(req.params.id)
        : userRepo.exportUserData(req.params.id);

      if (!data) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }

      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="cestaon_dados_${req.params.id}.json"`);
      res.json(data);
    } catch (err) {
      next(err);
    }
  });

  // DIREITO À ELIMINAÇÃO (LGPD - Art. 18, VI)
  router.delete('/:id', async (req, res, next) => {
    try {
      const callerId = getAuthorizedCallerId(req);
      if (!callerId) {
        return res.status(401).json({ error: 'Autenticação necessária para excluir a conta do titular' });
      }
      if (callerId !== req.params.id) {
        return res.status(403).json({ error: 'Não autorizado a excluir a conta de outro titular' });
      }

      const targetUser = userRepo.getById(req.params.id);
      if (!targetUser) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }

      // Se o usuário possui PIN, exige validação de senha/PIN com rate limiter anti-força bruta
      if (userRepo.hasPin(req.params.id)) {
        const pin = req.body?.pin || req.body?.password || req.headers['x-user-pin'];
        if (!pin) {
          return res.status(400).json({ error: 'Senha de confirmação obrigatória para excluir a conta definitivamente' });
        }

        const ip = req.ip || req.socket?.remoteAddress || 'local';
        const limitKey = `${ip}:${req.params.id}:delete`;
        if (!pinRateLimiter.check(limitKey)) {
          return res.status(429).json({ error: 'Muitas tentativas. Aguarde 1 minuto.' });
        }

        const isValid = userRepo.verifyPinAsync
          ? await userRepo.verifyPinAsync(req.params.id, String(pin).trim())
          : userRepo.verifyPin(req.params.id, String(pin).trim());

        if (!isValid) {
          return res.status(403).json({ error: 'Senha incorreta. Exclusão de conta cancelada por segurança.' });
        }

        pinRateLimiter.reset(limitKey);
      }

      const deleted = userRepo.deleteAccountAsync
        ? await userRepo.deleteAccountAsync(req.params.id)
        : userRepo.deleteAccount(req.params.id);

      if (!deleted) {
        return res.status(500).json({ error: 'Falha ao excluir conta e dados associados' });
      }

      res.json({
        success: true,
        message: 'Conta e todos os dados associados foram excluídos definitivamente (LGPD).'
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
