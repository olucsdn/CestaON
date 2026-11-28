import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { showToast, toast, subscribeToast } from '../client/src/utils/toast.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('SISTEMA DE NOTIFICAÇÕES ESTILIZADAS (TOAST) — Eliminação de Alerts Nativos e Feedback Visual', async (t) => {
  await t.test('1. Integridade e funcionalidade do utilitário toast.js', () => {
    assert.equal(typeof showToast, 'function', 'showToast deve ser uma função');
    assert.equal(typeof toast.warning, 'function', 'toast.warning deve ser uma função');
    assert.equal(typeof toast.error, 'function', 'toast.error deve ser uma função');
    assert.equal(typeof toast.success, 'function', 'toast.success deve ser uma função');
    assert.equal(typeof toast.info, 'function', 'toast.info deve ser uma função');
    assert.equal(typeof subscribeToast, 'function', 'subscribeToast deve ser uma função');

    // Teste de disparo e recepção via listener
    let received = null;
    const unsubscribe = subscribeToast((item) => {
      received = item;
    });

    const toastId = showToast('Este produto já foi adicionado a esta feira.', 'warning');
    assert.ok(toastId, 'showToast deve retornar um ID numérico');
    assert.ok(received, 'Listener deve ter recebido a notificação');
    assert.equal(received.message, 'Este produto já foi adicionado a esta feira.');
    assert.equal(received.type, 'warning');
    assert.equal(received.title, 'Item Já na Lista');
    assert.equal(received.duration, 4000);

    // Teste de desinscrição (cleanup)
    unsubscribe();
    received = null;
    showToast('Segunda mensagem');
    assert.equal(received, null, 'Listener desinscrito não deve receber mensagens');
  });

  await t.test('2. Inferência semântica automática de tipos e títulos de mensagem', () => {
    let received = null;
    const unsub = subscribeToast((item) => {
      received = item;
    });

    // Mensagem de duplicata de item (deve inferir warning e título 'Item Já na Lista')
    showToast('O produto "Banana" já está na lista desta feira.');
    assert.equal(received.type, 'warning');
    assert.equal(received.title, 'Item Já na Lista');

    // Mensagem de erro
    showToast('Erro ao finalizar feira');
    assert.equal(received.type, 'error');
    assert.equal(received.title, 'Erro');

    // Mensagem de sucesso
    showToast('Sua conta e todos os dados associados foram excluídos definitivamente.');
    assert.equal(received.type, 'success');
    assert.equal(received.title, 'Sucesso');

    unsub();
  });

  await t.test('3. Estrutura e ergonomia visual do componente ToastNotification.jsx', () => {
    const toastComponentPath = path.join(rootDir, 'client', 'src', 'components', 'ToastNotification.jsx');
    assert.ok(fs.existsSync(toastComponentPath), 'ToastNotification.jsx deve existir no disco');

    const content = fs.readFileSync(toastComponentPath, 'utf-8');
    assert.ok(content.includes('role="alert"'), 'Deve conter role="alert" para acessibilidade');
    assert.ok(content.includes('aria-live="assertive"'), 'Deve conter aria-live="assertive"');
    assert.ok(content.includes('AlertTriangle'), 'Deve exibir AlertTriangle para avisos');
    assert.ok(content.includes('AlertCircle'), 'Deve exibir AlertCircle para erros');
    assert.ok(content.includes('CheckCircle2'), 'Deve exibir CheckCircle2 para sucessos');
    assert.ok(content.includes('Info'), 'Deve exibir Info para avisos neutros');
    assert.ok(content.includes('z-[9999]'), 'Deve possuir z-index máximo para flutuar sobre modais');
    assert.ok(content.includes('progressBar'), 'Deve conter barra visual de progresso de tempo');
    assert.ok(content.includes('dismissToast'), 'Deve permitir dispensa manual imediata');
  });

  await t.test('4. Ausência total de chamadas a alert() nativo nos componentes JSX do cliente', () => {
    const srcDir = path.join(rootDir, 'client', 'src');
    function scanDir(dir) {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          scanDir(fullPath);
        } else if (file.endsWith('.jsx')) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const alertMatches = content.match(/\balert\s*\(/g);
          assert.equal(
            alertMatches,
            null,
            `O arquivo ${file} NÃO deve conter chamadas nativas a alert(): encontrou ${alertMatches?.length}`
          );
        }
      }
    }
    scanDir(srcDir);
  });

  await t.test('5. Integração do Toast nos fluxos críticos de prevenção de duplicatas e modais', () => {
    const normalModePath = path.join(rootDir, 'client', 'src', 'components', 'NormalModeView.jsx');
    const normalContent = fs.readFileSync(normalModePath, 'utf-8');
    assert.ok(normalContent.includes('showToast'), 'NormalModeView deve importar showToast');
    assert.ok(normalContent.includes('showToast(`O produto "${trimmed}" já está na lista desta feira.`, \'warning\')'), 'Deve alertar via toast com warning ao tentar readicionar');
    assert.ok(normalContent.includes('showToast(`Já existe outro item chamado "${newName}" nesta feira.`, \'warning\')'), 'Deve alertar via toast ao editar para nome duplicado');

    const appPath = path.join(rootDir, 'client', 'src', 'App.jsx');
    const appContent = fs.readFileSync(appPath, 'utf-8');
    assert.ok(appContent.includes('ToastNotification'), 'App.jsx deve importar e renderizar ToastNotification');
    assert.ok(appContent.includes('showToast'), 'App.jsx deve importar showToast');
    assert.ok(appContent.includes('window.alert = (msg) => {'), 'App.jsx deve configurar interceptação fallback para window.alert');

    const finishPath = path.join(rootDir, 'client', 'src', 'components', 'FinishListModal.jsx');
    const finishContent = fs.readFileSync(finishPath, 'utf-8');
    assert.ok(finishContent.includes('showToast'), 'FinishListModal deve usar showToast');

    const newListPath = path.join(rootDir, 'client', 'src', 'components', 'NewListModal.jsx');
    const newListContent = fs.readFileSync(newListPath, 'utf-8');
    assert.ok(newListContent.includes('showToast'), 'NewListModal deve usar showToast');

    const profilePath = path.join(rootDir, 'client', 'src', 'components', 'UserProfileModal.jsx');
    const profileContent = fs.readFileSync(profilePath, 'utf-8');
    assert.ok(profileContent.includes('showToast'), 'UserProfileModal deve usar showToast');
  });
});
