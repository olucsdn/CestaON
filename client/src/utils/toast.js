/**
 * Utilitário de Notificações Estilizadas e Não-Bloqueantes (Toast System)
 * Substitui os alerts nativos intrusivos do navegador por toasts modernos,
 * responsivos e com micro-vibração táctil (haptics) alinhados à identidade do CestaON.
 */
import { triggerHaptic } from './haptics.js';

const listeners = new Set();
let toastIdCounter = 0;

/**
 * Registra um ouvinte para receber novas notificações toast.
 * @param {Function} listener
 * @returns {Function} Função de desinscrição (cleanup)
 */
export function subscribeToast(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Determina um título padrão com base no tipo semântico e conteúdo da mensagem.
 */
function getDefaultTitle(type, msg) {
  const lower = (msg || '').toLowerCase();
  if (
    lower.includes('já foi adicionado') ||
    lower.includes('já está na lista') ||
    lower.includes('já existe outro')
  ) {
    return 'Item Já na Lista';
  }
  switch (type) {
    case 'warning':
      return 'Atenção';
    case 'error':
      return 'Erro';
    case 'success':
      return 'Sucesso';
    case 'info':
    default:
      return 'Aviso da Feira';
  }
}

/**
 * Dispara uma notificação toast no aplicativo.
 * @param {string} message - Texto principal da mensagem
 * @param {'warning' | 'error' | 'success' | 'info'} [type='warning'] - Tipo semântico da notificação
 * @param {object} [options] - Opções adicionais (duration, title)
 */
export function showToast(message, type = 'warning', options = {}) {
  if (!message) return;

  const msgStr = typeof message === 'string' ? message : String(message);

  // Inferência automática refinada se o tipo for genérico
  let finalType = type;
  const lowerMsg = msgStr.toLowerCase();
  if (type === 'warning' || !type) {
    if (
      lowerMsg.includes('sucesso') ||
      lowerMsg.includes('concluído') ||
      lowerMsg.includes('excluídos definitivamente')
    ) {
      finalType = 'success';
    } else if (
      lowerMsg.includes('erro') ||
      lowerMsg.includes('falha') ||
      lowerMsg.includes('inválido')
    ) {
      finalType = 'error';
    } else if (
      lowerMsg.includes('já foi adicionado') ||
      lowerMsg.includes('já está na lista') ||
      lowerMsg.includes('já existe outro')
    ) {
      finalType = 'warning';
    }
  }

  // Micro-vibração táctil sutil no celular (quando disponível)
  if (finalType === 'warning') {
    triggerHaptic([18, 30, 18]);
  } else if (finalType === 'error') {
    triggerHaptic([25, 40, 25]);
  } else if (finalType === 'success') {
    triggerHaptic(15);
  } else {
    triggerHaptic(12);
  }

  const toastItem = {
    id: ++toastIdCounter,
    message: msgStr,
    type: finalType,
    title: options.title || getDefaultTitle(finalType, msgStr),
    duration: typeof options.duration === 'number' ? options.duration : 4000,
    timestamp: Date.now()
  };

  listeners.forEach((listener) => {
    try {
      listener(toastItem);
    } catch (e) {
      console.error('[Toast] Erro no listener:', e);
    }
  });

  return toastItem.id;
}

export const toast = {
  warning: (msg, opts) => showToast(msg, 'warning', opts),
  error: (msg, opts) => showToast(msg, 'error', opts),
  success: (msg, opts) => showToast(msg, 'success', opts),
  info: (msg, opts) => showToast(msg, 'info', opts)
};
