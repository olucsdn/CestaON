/**
 * Cache Preditivo dos Módulos Inteligentes no Subsolo
 * 
 * Garante que todos os módulos inteligentes (Simulador Onde Comprar,
 * Calculadora de Embalagens, Comparativos Delta e Histórico) funcionem
 * 100% offline em locais sem sinal celular ou Wi-Fi (como subsolos de supermercados).
 */

export function normalizeUnit(quantity, unit) {
  const u = (unit || '').toLowerCase().trim();
  if (u === 'g' || u === 'gramas') {
    return { baseQuantity: quantity / 1000, baseUnit: 'kg' };
  }
  if (u === 'kg' || u === 'quilos') {
    return { baseQuantity: quantity, baseUnit: 'kg' };
  }
  if (u === 'ml' || u === 'mililitros') {
    return { baseQuantity: quantity / 1000, baseUnit: 'L' };
  }
  if (u === 'l' || u === 'litro' || u === 'litros') {
    return { baseQuantity: quantity, baseUnit: 'L' };
  }
  if (u === 'dz' || u === 'duzia' || u === 'dúzia') {
    return { baseQuantity: quantity * 12, baseUnit: 'un' };
  }
  return { baseQuantity: quantity, baseUnit: u || 'un' };
}

export function calculateNormalizedPrice(priceCents, quantity, unit) {
  const safePrice = Number.isFinite(priceCents) && priceCents > 0 ? Math.round(priceCents) : 0;
  const safeQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
  const { baseQuantity, baseUnit } = normalizeUnit(safeQuantity, unit);
  if (baseQuantity <= 0 || safePrice <= 0) return { normalizedPriceCents: safePrice, baseUnit };
  const normalizedPriceCents = Math.round(safePrice / baseQuantity);
  return { normalizedPriceCents, baseUnit };
}

/**
 * Motor de Cálculo 100% Offline para Calculadora de Embalagens
 */
export function comparePackageSizesOffline({ optionA, optionB }) {
  const normA = calculateNormalizedPrice(optionA.priceCents, optionA.quantity, optionA.unit);
  const normB = calculateNormalizedPrice(optionB.priceCents, optionB.quantity, optionB.unit);

  if (normA.baseUnit !== normB.baseUnit) {
    return {
      canCompare: false,
      message: `Unidades incompatíveis para comparação direta (${normA.baseUnit} vs ${normB.baseUnit}).`,
      isOfflineCalc: true
    };
  }

  const diffCents = normA.normalizedPriceCents - normB.normalizedPriceCents;
  const bestOption = diffCents > 0 ? 'B' : diffCents < 0 ? 'A' : 'EQUAL';
  let percentSavings = 0;
  if (bestOption === 'B' && normA.normalizedPriceCents > 0) {
    percentSavings = Math.round(((diffCents / normA.normalizedPriceCents) * 100) * 10) / 10;
  } else if (bestOption === 'A' && normB.normalizedPriceCents > 0) {
    percentSavings = Math.round(((Math.abs(diffCents) / normB.normalizedPriceCents) * 100) * 10) / 10;
  }

  return {
    canCompare: true,
    baseUnit: normA.baseUnit,
    optionA: {
      ...optionA,
      pricePerBaseUnitCents: normA.normalizedPriceCents
    },
    optionB: {
      ...optionB,
      pricePerBaseUnitCents: normB.normalizedPriceCents
    },
    bestOption,
    percentSavings,
    summary: bestOption === 'EQUAL'
      ? 'Ambas as opções possuem exatamente o mesmo preço por unidade base.'
      : `A opção ${bestOption} é ${percentSavings.toFixed(1).replace('.', ',')}% mais econômica por ${normA.baseUnit}.`,
    isOfflineCalc: true
  };
}

/**
 * Utilitários de Detecção do Modo Subsolo (Sem Rede)
 */
export function isSubsurface() {
  if (typeof navigator === 'undefined') return false;
  return !navigator.onLine;
}

export function subscribeSubsurfaceStatus(callback) {
  if (typeof window === 'undefined') return () => {};
  const handleOnline = () => callback(false);
  const handleOffline = () => callback(true);
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}

const STORAGE_KEYS = {
  WTB_PREFIX: 'feira_subsurface_wtb_',
  HISTORY: 'feira_subsurface_history',
  TRENDS: 'feira_subsurface_trends',
  COMPARE_PREFIX: 'feira_subsurface_comp_'
};

/**
 * Pré-carregamento Ativo (Prefetch Preditivo) de Inteligência de Mercado
 * Disparado silenciosamente em background quando a lista é aberta ou modificada.
 */
let debounceTimeout = null;

export function triggerPredictivePreload(listId) {
  if (!listId || typeof window === 'undefined' || isSubsurface()) return;

  if (debounceTimeout) clearTimeout(debounceTimeout);
  debounceTimeout = setTimeout(async () => {
    try {
      const userId = typeof window !== 'undefined' ? localStorage.getItem('feira_user_id') : null;
      const token = typeof window !== 'undefined' ? localStorage.getItem('feira_auth_token') : null;
      const headers = {};
      if (userId) headers['X-User-Id'] = userId;
      if (token) headers['Authorization'] = `Bearer ${token}`;

      // 1. Prefetch do Simulador "Onde Comprar" para a feira ativa
      const wtbRes = await fetch(`/api/lists/${listId}/where-to-buy`, { headers }).catch(() => null);
      if (wtbRes && wtbRes.ok) {
        const wtbData = await wtbRes.json();
        localStorage.setItem(
          `${STORAGE_KEYS.WTB_PREFIX}${listId}`,
          JSON.stringify({ data: wtbData, timestamp: Date.now() })
        );
      }

      // 2. Prefetch do Histórico e Tendências
      const [histRes, trendsRes] = await Promise.all([
        fetch('/api/history', { headers }).catch(() => null),
        fetch('/api/history/trends', { headers }).catch(() => null)
      ]);

      if (histRes && histRes.ok) {
        const histData = await histRes.json();
        localStorage.setItem(
          STORAGE_KEYS.HISTORY,
          JSON.stringify({ data: histData, timestamp: Date.now() })
        );

        if (Array.isArray(histData) && histData.length > 0) {
          const latestId = histData[0].id;
          const compRes = await fetch(`/api/history/compare/${latestId}`, { headers }).catch(() => null);
          if (compRes && compRes.ok) {
            const compData = await compRes.json();
            localStorage.setItem(
              `${STORAGE_KEYS.COMPARE_PREFIX}${latestId}`,
              JSON.stringify({ data: compData, timestamp: Date.now() })
            );
          }
        }
      }

      if (trendsRes && trendsRes.ok) {
        const trendsData = await trendsRes.json();
        localStorage.setItem(
          STORAGE_KEYS.TRENDS,
          JSON.stringify({ data: trendsData, timestamp: Date.now() })
        );
      }
    } catch (_) {
      // Silencioso em caso de falha de conexão transitória
    }
  }, 1200);
}

/**
 * Recuperação de dados salvos no Cache Preditivo
 */
export function getCachedWhereToBuy(listId) {
  if (typeof localStorage === 'undefined' || !listId) return null;
  try {
    const raw = localStorage.getItem(`${STORAGE_KEYS.WTB_PREFIX}${listId}`);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

export function getCachedHistory() {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.HISTORY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

export function getCachedTrends() {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.TRENDS);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

export function getCachedComparison(historyId) {
  if (typeof localStorage === 'undefined' || !historyId) return null;
  try {
    const raw = localStorage.getItem(`${STORAGE_KEYS.COMPARE_PREFIX}${historyId}`);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}
