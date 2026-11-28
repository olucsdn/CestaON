/**
 * Utilitário de Feedback Háptico Seguro e Sutil (Vibração Táctil no Celular)
 * 100% nativo (navigator.vibrate), opera apenas quando suportado e de forma discreta.
 */
export function triggerHaptic(pattern = 12) {
  try {
    if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  } catch (_) {
    // Silencioso se não suportado ou bloqueado pelo SO/navegador
  }
}
