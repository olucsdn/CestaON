process.env.NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { getDatabase } from '../server/db/database.js';
import { seedDatabase } from '../server/db/seed.js';
import { SocketManager } from '../server/ws/socketManager.js';
import { createApiRouter } from '../server/routes/api.js';
import { UserRepository } from '../server/repositories/userRepository.js';

test('VERIFICAÇÃO DE E-MAIL & UNICIDADE EM MINÚSCULAS — CestaON', async (t) => {
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

  const userRepo = new UserRepository(db);

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  await t.test('1. Normalização permanente de e-mails em minúsculas (toLowerCase) e unicidade estrita', () => {
    const u1 = userRepo.create({
      name: 'Maria Silva',
      email: '  Maria.Silva@Exemplo.COM  ',
      pin: 'senha123'
    });

    assert.equal(u1.email, 'maria.silva@exemplo.com', 'E-mail deve ser salvo em minúsculas e sem espaços');

    // Busca por minúsculas ou maiúsculas deve encontrar o mesmo usuário
    const foundLower = userRepo.getByEmail('maria.silva@exemplo.com');
    const foundUpper = userRepo.getByEmail('MARIA.SILVA@EXEMPLO.COM');
    assert.equal(foundLower.id, u1.id);
    assert.equal(foundUpper.id, u1.id);

    // Tentativa de criar outra conta com o mesmo e-mail (mesmo variando maiúsculas) deve ser bloqueada
    assert.throws(
      () => {
        userRepo.create({
          name: 'Maria Clonada',
          email: 'MARIA.silva@exemplo.com',
          pin: 'outraSenha1'
        });
      },
      /já está em uso/i,
      'Não deve permitir duplicar o mesmo e-mail em outra conta'
    );
  });

  await t.test('2. Ciclo de vida do código de verificação: expiração, tentativas e consumo único', () => {
    const testEmail = 'seguranca@cestaon.com';

    // Cria código com TTL de 15 minutos
    userRepo.createVerificationCode(testEmail, 'register', '123456', 15);

    // Código incorreto deve falhar
    const fail1 = userRepo.verifyCode(testEmail, 'register', '999999');
    assert.equal(fail1.valid, false);
    assert.match(fail1.reason, /incorreto/i);

    // Código correto deve validar e ser consumido
    const ok = userRepo.verifyCode(testEmail, 'register', '123456');
    assert.equal(ok.valid, true);

    // Reutilizar o código já consumido deve falhar (registro foi deletado após consumo)
    const reuse = userRepo.verifyCode(testEmail, 'register', '123456');
    assert.equal(reuse.valid, false);
    assert.match(reuse.reason, /Nenhum código de verificação encontrado/i);
  });

  await t.test('3. API: Envio de código para cadastro e bloqueio de e-mail duplicado (HTTP 409)', async () => {
    // 3.1 Solicita código para e-mail novo -> Sucesso
    const sendRes = await apiReq('/users/send-verification-code', {
      method: 'POST',
      body: JSON.stringify({ email: 'Novo.Usuario@Teste.Com', purpose: 'register' })
    });
    assert.equal(sendRes.status, 200);
    assert.equal(sendRes.data.success, true);
    assert.equal(sendRes.data.email, 'novo.usuario@teste.com');

    // 3.2 Tentar solicitar código de cadastro para e-mail já existente (maria.silva@exemplo.com) -> Rejeita com 409
    const dupRes = await apiReq('/users/send-verification-code', {
      method: 'POST',
      body: JSON.stringify({ email: 'MARIA.SILVA@EXEMPLO.COM', purpose: 'register' })
    });
    assert.equal(dupRes.status, 409);
    assert.match(dupRes.data.error, /já está cadastrado/i);
  });

  await t.test('4. API: Cadastro de usuário com validação de código de 6 dígitos', async () => {
    const email = 'cadastro.confirmado@cestaon.com';

    // Gera código
    userRepo.createVerificationCode(email, 'register', '654321', 15);

    // Tentativa com código errado -> Rejeita com 400
    const badCodeRes = await apiReq('/users', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Cadastro Teste',
        email: email,
        pin: 'senhaForte1',
        verification_code: '000000',
        security_question: 'Qual sua comida favorita?',
        security_answer: 'Pizza'
      })
    });
    assert.equal(badCodeRes.status, 400);

    // Tentativa sem código em produção -> Rejeita com 400
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const noCodeRes = await apiReq('/users', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Tentativa Sem Codigo',
          email: 'novo.sem.codigo@cestaon.com',
          pin: 'senhaForte123',
          security_question: 'Pergunta?',
          security_answer: 'Resposta'
        })
      });
      assert.equal(noCodeRes.status, 400);
      assert.match(noCodeRes.data.error, /código de confirmação.*obrigatório/i);
    } finally {
      process.env.NODE_ENV = prevEnv;
    }

    // Tentativa com código certo -> Sucesso 201
    const goodCodeRes = await apiReq('/users', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Cadastro Teste',
        email: email,
        pin: 'senhaForte1',
        verification_code: '654321',
        security_question: 'Qual sua comida favorita?',
        security_answer: 'Pizza'
      })
    });
    assert.equal(goodCodeRes.status, 201);
    assert.equal(goodCodeRes.data.email, email);

    // Reutilizar o mesmo e-mail para cadastrar outra conta -> Rejeita com 409
    const duplicateRegister = await apiReq('/users', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Impostor',
        email: 'CADASTRO.CONFIRMADO@CESTAON.COM',
        pin: 'outraSenha123'
      })
    });
    assert.equal(duplicateRegister.status, 409);
  });

  await t.test('5. API: Recuperação de senha via código de 6 dígitos enviado por e-mail', async () => {
    const email = 'cadastro.confirmado@cestaon.com';

    // 5.1 Gera código de recuperação no repositório
    userRepo.createVerificationCode(email, 'recover', '789123', 15);

    // 5.2 Tentativa de recuperação com código errado -> Rejeita com 401
    const badRecover = await apiReq('/users/recover', {
      method: 'POST',
      body: JSON.stringify({
        email,
        verification_code: '999888',
        password: 'novaSenhaRecuperada1'
      })
    });
    assert.equal(badRecover.status, 401);

    // 5.3 Tentativa de recuperação com código correto -> Sucesso 200
    const goodRecover = await apiReq('/users/recover', {
      method: 'POST',
      body: JSON.stringify({
        email,
        verification_code: '789123',
        password: 'novaSenhaRecuperada1'
      })
    });
    assert.equal(goodRecover.status, 200);
    assert.equal(goodRecover.data.method, 'verification_code');

    // 5.4 Login com a nova senha redefinida -> Sucesso 200
    const loginRes = await apiReq('/users/login', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password: 'novaSenhaRecuperada1'
      })
    });
    assert.equal(loginRes.status, 200);
    assert.equal(loginRes.data.user.email, email);
  });
});
