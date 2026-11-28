import React, { useState, useEffect } from 'react';
import {
  Download,
  Smartphone,
  Share,
  PlusSquare,
  MoreVertical,
  X,
  ShoppingBag,
  Sparkles,
  CheckCircle2
} from 'lucide-react';

export function InstallPwaPrompt({ externalOpenTrigger, onExternalOpenHandled }) {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [guidePlatform, setGuidePlatform] = useState('android');
  const [showBanner, setShowBanner] = useState(false);
  const [showIosModal, setShowIosModal] = useState(false);
  const [showInstalledToast, setShowInstalledToast] = useState(false);

  useEffect(() => {
    // 1. Detecta se já está rodando em modo standalone (PWA instalado) ou se já foi instalado
    const isStandaloneMode =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      window.matchMedia('(display-mode: minimal-ui)').matches ||
      window.navigator.standalone === true ||
      document.referrer.includes('android-app://');

    const wasInstalled = localStorage.getItem('pwa_installed') === 'true';

    if (isStandaloneMode || wasInstalled) {
      setIsStandalone(true);
      if (isStandaloneMode) return;
    }

    // 1.1 Verificação nativa via getInstalledRelatedApps se suportada
    if (typeof navigator !== 'undefined' && 'getInstalledRelatedApps' in navigator) {
      navigator.getInstalledRelatedApps().then((relatedApps) => {
        if (Array.isArray(relatedApps) && relatedApps.length > 0) {
          setIsStandalone(true);
          localStorage.setItem('pwa_installed', 'true');
        }
      }).catch(() => {});
    }

    // 2. Detecta se é iOS / Safari
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIos(isIosDevice);
    setGuidePlatform(isIosDevice ? 'iphone' : 'android');

    // 3. Verifica se o usuário dispensou o prompt recentemente (respeito à escolha por 7 dias)
    const dismissedUntil = localStorage.getItem('pwa_prompt_dismissed_until');
    const isDismissed = dismissedUntil && Date.now() < parseInt(dismissedUntil, 10);

    // 4. Captura o evento beforeinstallprompt (Android / Chrome / Edge)
    const handleBeforeInstallPrompt = (e) => {
      // Se disparou o prompt, significa que o app NÃO está instalado
      localStorage.removeItem('pwa_installed');
      setIsStandalone(false);

      e.preventDefault();
      setDeferredPrompt(e);
      if (!isDismissed) {
        // Exibe o banner suavemente após 2.5 segundos de navegação inicial
        const timer = setTimeout(() => {
          setShowBanner(true);
        }, 2500);
        return () => clearTimeout(timer);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Se for iOS e não dispensado e não standalone, exibe o banner ergonômico após breve intervalo
    if (isIosDevice && !isDismissed && !isStandaloneMode) {
      const timer = setTimeout(() => {
        setShowBanner(true);
      }, 3000);
      return () => clearTimeout(timer);
    }

    // 5. Escuta evento de conclusão de instalação
    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setShowBanner(false);
      setShowIosModal(false);
      setIsStandalone(true);
      localStorage.setItem('pwa_installed', 'true');
      window.dispatchEvent(new Event('cestaon:pwa-installed'));
      setShowInstalledToast(true);
      setTimeout(() => setShowInstalledToast(false), 4000);
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  // 6. Responde a acionamento externo (ex: clique em "Como instalar no celular" nos 3 pontos)
  useEffect(() => {
    if (externalOpenTrigger) {
      setShowBanner(false);
      setShowIosModal(true);
      if (onExternalOpenHandled) {
        onExternalOpenHandled();
      }
    }
  }, [externalOpenTrigger]);

  const handleInstallClick = async () => {
    if (isStandalone) {
      setShowBanner(false);
      setShowIosModal(false);
      return;
    }

    if (isIos) {
      setShowIosModal(true);
      setShowBanner(false);
      return;
    }

    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        setShowBanner(false);
      }
      setDeferredPrompt(null);
    } else {
      // Fallback para navegadores sem beforeinstallprompt disponível
      setShowIosModal(true);
      setShowBanner(false);
    }
  };

  const handleDismiss = () => {
    setShowBanner(false);
    // Guarda dispensa por 7 dias para respeitar a ergonomia do usuário
    const nextWeek = Date.now() + 7 * 24 * 60 * 60 * 1000;
    localStorage.setItem('pwa_prompt_dismissed_until', String(nextWeek));
  };

  if (isStandalone && !showInstalledToast && !showIosModal) return null;

  return (
    <>
      {/* Toast de Confirmação de Instalação */}
      {showInstalledToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2.5 text-xs sm:text-sm font-bold animate-bounce">
          <CheckCircle2 className="w-5 h-5 text-white shrink-0" />
          <span>CestaOn instalado com sucesso na sua tela inicial!</span>
        </div>
      )}

      {/* Banner Ergonômico Mobile (Flutuante na base da tela, acima da navegação por abas) */}
      {showBanner && (
        <aside
          role="region"
          aria-label="Instalação do Aplicativo"
          className="fixed bottom-20 left-3 right-3 sm:left-auto sm:right-6 sm:bottom-6 sm:max-w-md z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 rounded-3xl p-3.5 sm:p-4 shadow-2xl transition-all animate-in fade-in slide-in-from-bottom-4 duration-300"
        >
          <div className="flex items-center gap-3">
            {/* Ícone com gradiente emerald */}
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-brand-600 to-emerald-400 flex items-center justify-center text-white shadow-md shrink-0">
              <ShoppingBag className="w-5 h-5" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <h4 className="text-sm font-black text-slate-900 dark:text-white truncate">
                  Instalar o CestaOn no celular
                </h4>
                <span className="bg-emerald-100 dark:bg-emerald-950/80 text-brand-700 dark:text-brand-300 text-[10px] font-extrabold px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                  Grátis
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5 font-medium">
                Funciona sem internet direto da tela inicial
              </p>
            </div>

            {/* Fechar rápido */}
            <button
              onClick={handleDismiss}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-full shrink-0"
              title="Dispensar por enquanto"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={handleInstallClick}
              className="flex-1 flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 active:scale-[0.98] text-white text-xs sm:text-sm font-black py-2.5 px-4 rounded-xl shadow-md shadow-brand-500/20 transition-all touch-target"
            >
              <Download className="w-4 h-4" />
              <span>Instalar Aplicativo</span>
            </button>
            <button
              onClick={handleDismiss}
              className="px-3 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl transition"
            >
              Agora não
            </button>
          </div>
        </aside>
      )}

      {/* Modal Explicativo Separado para Android e iPhone */}
      {showIosModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 sm:p-6 overflow-y-auto"
          onClick={() => setShowIosModal(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-sm w-full shadow-2xl overflow-hidden transition-colors duration-200 animate-in fade-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0 sm:zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center text-white shadow-sm">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white leading-tight">
                    Como Instalar no Celular
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Escolha seu aparelho e siga os passos
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowIosModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                title="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Seletor Separado: Android | iPhone */}
              <div className="grid grid-cols-2 gap-1.5 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-2xl">
                <button
                  type="button"
                  onClick={() => setGuidePlatform('android')}
                  className={`py-2 px-3 rounded-xl text-xs font-extrabold transition ${
                    guidePlatform === 'android'
                      ? 'bg-white dark:bg-slate-900 text-brand-700 dark:text-brand-300 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  Android (Chrome)
                </button>
                <button
                  type="button"
                  onClick={() => setGuidePlatform('iphone')}
                  className={`py-2 px-3 rounded-xl text-xs font-extrabold transition ${
                    guidePlatform === 'iphone'
                      ? 'bg-white dark:bg-slate-900 text-brand-700 dark:text-brand-300 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  iPhone (Safari)
                </button>
              </div>

              {guidePlatform === 'android' ? (
                <div className="space-y-3">
                  {/* Passo 1 Android */}
                  <div className="flex items-start gap-3 bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-2xl border border-slate-100 dark:border-slate-700/60">
                    <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-extrabold flex items-center justify-center shrink-0 text-xs">
                      1
                    </div>
                    <div className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                      Abra o CestaOn no <strong className="text-slate-900 dark:text-white">Google Chrome</strong> e toque nos{' '}
                      <span className="font-bold inline-flex items-center gap-0.5 text-slate-900 dark:text-white">
                        3 pontinhos <MoreVertical className="w-3.5 h-3.5 text-slate-700 dark:text-slate-200 inline" />
                      </span>{' '}
                      no canto superior direito.
                    </div>
                  </div>

                  {/* Passo 2 Android */}
                  <div className="flex items-start gap-3 bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-2xl border border-slate-100 dark:border-slate-700/60">
                    <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-extrabold flex items-center justify-center shrink-0 text-xs">
                      2
                    </div>
                    <div className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                      Toque em{' '}
                      <span className="font-bold inline-flex items-center gap-1 text-slate-900 dark:text-white">
                        "Instalar aplicativo" <Download className="w-3.5 h-3.5 text-emerald-600 inline" />
                      </span>{' '}
                      ou <strong className="text-slate-900 dark:text-white">"Adicionar à tela inicial"</strong> e confirme em <strong className="text-slate-900 dark:text-white">Instalar</strong>.
                    </div>
                  </div>

                  {deferredPrompt && (
                    <button
                      type="button"
                      onClick={handleInstallClick}
                      className="w-full flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-extrabold py-2.5 rounded-xl text-xs sm:text-sm transition shadow-sm active:scale-[0.98]"
                    >
                      <Download className="w-4 h-4" />
                      <span>Instalar agora com 1 toque</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Passo 1 iPhone */}
                  <div className="flex items-start gap-3 bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-2xl border border-slate-100 dark:border-slate-700/60">
                    <div className="w-8 h-8 rounded-xl bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300 font-extrabold flex items-center justify-center shrink-0 text-xs">
                      1
                    </div>
                    <div className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                      Abra o CestaOn no navegador <strong className="text-slate-900 dark:text-white">Safari</strong> e toque no botão{' '}
                      <span className="font-bold inline-flex items-center gap-1 text-slate-900 dark:text-white">
                        Compartilhar <Share className="w-3.5 h-3.5 text-blue-500 inline" />
                      </span>{' '}
                      na barra inferior da tela.
                    </div>
                  </div>

                  {/* Passo 2 iPhone */}
                  <div className="flex items-start gap-3 bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-2xl border border-slate-100 dark:border-slate-700/60">
                    <div className="w-8 h-8 rounded-xl bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300 font-extrabold flex items-center justify-center shrink-0 text-xs">
                      2
                    </div>
                    <div className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                      Role as opções para baixo, toque em{' '}
                      <span className="font-bold inline-flex items-center gap-1 text-slate-900 dark:text-white">
                        "Adicionar à Tela de Início" <PlusSquare className="w-3.5 h-3.5 text-slate-900 dark:text-white inline" />
                      </span>{' '}
                      e confirme em <strong className="text-slate-900 dark:text-white">Adicionar</strong>.
                    </div>
                  </div>
                </div>
              )}

              {/* Benefícios */}
              <div className="flex items-center gap-2 px-1 text-[11px] text-slate-500 dark:text-slate-400">
                <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
                <span>Abre em tela cheia sem barra de navegador e funciona offline no subsolo!</span>
              </div>

              <button
                onClick={() => setShowIosModal(false)}
                className="w-full bg-slate-900 hover:bg-slate-800 dark:bg-brand-600 dark:hover:bg-brand-700 text-white font-bold py-2.5 rounded-xl text-xs sm:text-sm transition hover:opacity-90 active:scale-[0.98]"
              >
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
