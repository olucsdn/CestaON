/**
 * Validadores e Sanitizadores de Entrada para a API REST
 */

export const HEX_COLOR_REGEX = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;
export const PIN_REGEX = /^\d{4,8}$/;
export const MEDIUM_PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*#?&.\-_]{6,64}$/;
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Valida dados de perfil de usuário (nome, email, avatar_color, pin/senha)
 */
export function validateUserData({ name, email, avatar_color, pin, isUpdate = false }) {
  let safeName;
  if (!isUpdate || name !== undefined) {
    if (!name || typeof name !== 'string' || !name.trim()) {
      return { error: isUpdate ? 'Nome do usuário não pode ser vazio' : 'Nome do usuário é obrigatório', status: 400 };
    }
    safeName = name.trim().slice(0, 60);
  }

  let safeEmail = isUpdate ? undefined : null;
  if (email !== undefined) {
    if (email === null || email === '') {
      safeEmail = null;
    } else {
      const emailStr = String(email).trim().toLowerCase();
      if (!EMAIL_REGEX.test(emailStr)) {
        return { error: 'E-mail informado possui formato inválido', status: 400 };
      }
      safeEmail = emailStr.slice(0, 100);
    }
  }

  let safeColor = isUpdate ? undefined : '#10B981';
  if (avatar_color !== undefined) {
    if (typeof avatar_color !== 'string' || !HEX_COLOR_REGEX.test(avatar_color.trim())) {
      return { error: 'Cor do avatar deve ser um código hexadecimal válido (ex: #10B981)', status: 400 };
    }
    safeColor = avatar_color.trim();
  }

  let safePin = isUpdate ? undefined : null;
  if (pin !== undefined) {
    if (pin === null || pin === '') {
      safePin = null;
    } else {
      const pinStr = String(pin).trim();
      const isValid = PIN_REGEX.test(pinStr) || MEDIUM_PASSWORD_REGEX.test(pinStr);
      if (!isValid) {
        return { error: 'A senha deve conter no mínimo 6 caracteres, incluindo letras e números (ou PIN de 4 a 8 dígitos)', status: 400 };
      }
      safePin = pinStr;
    }
  }

  return { safeName, safeEmail, safeColor, safePin };
}

/**
 * Sanitiza valores de orçamento (centavos)
 */
export function sanitizeBudget(budget_cents) {
  if (budget_cents === undefined || budget_cents === null || budget_cents === '') {
    return { value: 0 };
  }
  const bNum = Number(budget_cents);
  if (!Number.isFinite(bNum) || bNum < 0 || bNum > 1000000000) {
    return { error: 'Orçamento deve ser um número não-negativo válido', status: 400 };
  }
  return { value: Math.round(bNum) };
}

/**
 * Sanitiza e normaliza quantidade de itens
 */
export function sanitizeQuantity(quantity) {
  if (quantity === undefined) return 1;
  const qNum = Number(quantity);
  return (!Number.isFinite(qNum) || qNum === 0)
    ? 1
    : Math.max(0.001, Math.min(100000, Math.abs(qNum)));
}

/**
 * Sanitiza e normaliza preços de itens (em centavos)
 */
export function sanitizePrice(priceCents) {
  if (priceCents === undefined) return 0;
  const num = Number(priceCents);
  return Math.max(0, Math.min(1000000000, Math.round(num) || 0));
}

/**
 * Validação de dados para comparação de embalagens
 */
export function validatePackageCompareInput({ optionA, optionB }) {
  if (!optionA || !optionB) {
    return { error: 'Ambas as opções A e B são obrigatórias', status: 400 };
  }
  const pA = Number(optionA.priceCents);
  const pB = Number(optionB.priceCents);
  const qA = Number(optionA.quantity);
  const qB = Number(optionB.quantity);

  if (
    !Number.isFinite(pA) || !Number.isFinite(pB) || !Number.isFinite(qA) || !Number.isFinite(qB) ||
    pA < 0 || pB < 0 || qA <= 0 || qB <= 0 ||
    pA > 1000000000 || pB > 1000000000 || qA > 1000000 || qB > 1000000
  ) {
    return { error: 'Preços e quantidades devem ser números finitos positivos válidos', status: 400 };
  }

  return {
    optionA: { ...optionA, priceCents: Math.round(pA), quantity: qA },
    optionB: { ...optionB, priceCents: Math.round(pB), quantity: qB }
  };
}
