/**
 * Formata um valor em centavos inteiros para o padrão monetário Real (R$).
 * @param {number} cents 
 * @returns {string} Ex: "R$ 14,90"
 */
export function formatMoney(cents) {
  if (cents === null || cents === undefined || isNaN(cents)) return 'R$ 0,00';
  const val = cents / 100;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(val);
}

/**
 * Formata uma variação percentual com sinal explícito e vírgula.
 * @param {number} percent 
 * @returns {string} Ex: "+6,8%" ou "-3,2%"
 */
export function formatPercent(percent) {
  if (percent === null || percent === undefined || isNaN(percent)) return '0,0%';
  const sign = percent > 0 ? '+' : '';
  return `${sign}${percent.toFixed(1).replace('.', ',')}%`;
}

/**
 * Formata datas ISO ou SQLite para exibição amigável em pt-BR (horário de Brasília).
 * @param {string} isoString 
 * @returns {string} Ex: "28 de out. de 2026, 13:30"
 */
export function formatDate(isoString) {
  if (!isoString) return '';
  let cleaned = String(isoString).trim();
  // Se for string no padrão SQLite 'YYYY-MM-DD HH:MM:SS', converte para ISO UTC 'YYYY-MM-DDTHH:MM:SSZ'
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(cleaned)) {
    cleaned = cleaned.replace(' ', 'T') + 'Z';
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    cleaned = `${cleaned}T00:00:00Z`;
  }
  const date = new Date(cleaned);
  if (isNaN(date.getTime())) return String(isoString);
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo'
  }).format(date);
}

/**
 * Formata quantidade com sua unidade correspondente.
 * @param {number} qty 
 * @param {string} unit 
 * @returns {string} Ex: "2 kg", "1 un", "500 g"
 */
export function formatQuantity(qty, unit) {
  const formattedQty = Number.isInteger(qty) ? qty.toString() : qty.toString().replace('.', ',');
  return `${formattedQty} ${unit || 'un'}`;
}

const MAX_BANK_CENTS = 999999999;

/**
 * Converte centavos inteiros para string formatada estilo banco (sem "R$").
 * Ex: 5 -> "0,05", 1234 -> "12,34", 123456 -> "1.234,56", 0 -> "".
 * @param {number} cents
 * @returns {string}
 */
export function formatCentsToBankInput(cents) {
  const safe = Math.min(Math.max(Math.round(Number(cents) || 0), 0), MAX_BANK_CENTS);
  if (safe <= 0) return '';
  return (safe / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * Máscara estilo banco: cada dígito entra na casa das unidades de centavos
 * e desloca os anteriores para a esquerda (centavos -> reais -> milhares).
 * @param {string} rawValue
 * @returns {string}
 */
export function maskBankCurrencyInput(rawValue) {
  const digits = String(rawValue ?? '').replace(/\D/g, '');
  if (!digits) return '';
  const cents = Math.min(parseInt(digits, 10) || 0, MAX_BANK_CENTS);
  return formatCentsToBankInput(cents);
}

/**
 * Converte uma string mascarada estilo banco ("1.234,56") para centavos inteiros (123456).
 * @param {string} formattedValue
 * @returns {number}
 */
export function parseBankCurrencyToCents(formattedValue) {
  const digits = String(formattedValue ?? '').replace(/\D/g, '');
  if (!digits) return 0;
  return Math.min(parseInt(digits, 10) || 0, MAX_BANK_CENTS);
}
