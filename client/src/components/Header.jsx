import React, { useState, useRef, useEffect } from 'react';
import {
  ShoppingBag,
  Plus,
  History,
  TrendingDown,
  Calculator,
  Copy,
  Sun,
  Moon,
  Users,
  MoreVertical,
  WifiOff,
  Download,
  RefreshCw,
  HelpCircle,
  X,
  KeyRound,
  Share2,
  AlertTriangle,
  ChevronDown
} from 'lucide-react';

export function Header({
  lists,
  activeList,
  currentUser,
  theme,
  onToggleTheme,
  onSelectList,
  onOpenNewListModal,
  onOpenHistory,
  onOpenWhereToBuy,
  onOpenCalculator,
  onOpenProfile,
  onOpenShareModal,
  onDuplicateList,
  onOpenInstallPwa,
  onOpenTutorial,
  onOpenAuth,
  onLogout,
  onNavigate,
  isSubsurface,
  pendingSyncCount = 0,
  conflictNotification = null,
  onDismissConflict = null
}) {
  const [showToolsMenu, setShowToolsMenu] = useState(false);
  const menuRef = useRef(null);

  // Detecção se o aplicativo já está instalado no celular/computador ou rodando em modo standalone
  const [isAppInstalled, setIsAppInstalled] = useState(() => {
    if (typeof window === 'undefined') return false;
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      window.matchMedia('(display-mode: minimal-ui)').matches ||
      window.navigator.standalone === true ||
      document.referrer.includes('android-app://');
    return isStandalone || localStorage.getItem('pwa_installed') === 'true';
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const matchStandalone = window.matchMedia('(display-mode: standalone)');
    const handleDisplayChange = (e) => {
      if (e.matches) {
        setIsAppInstalled(true);
        localStorage.setItem('pwa_installed', 'true');
      }
    };
    if (matchStandalone?.addEventListener) {
      matchStandalone.addEventListener('change', handleDisplayChange);
    }

    const handleAppInstalled = () => {
      setIsAppInstalled(true);
      localStorage.setItem('pwa_installed', 'true');
    };
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('cestaon:pwa-installed', handleAppInstalled);

    const handleBeforeInstallPrompt = () => {
      const isStandaloneNow =
        window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true ||
        document.referrer.includes('android-app://');
      if (!isStandaloneNow) {
        setIsAppInstalled(false);
        localStorage.removeItem('pwa_installed');
      }
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    if ('getInstalledRelatedApps' in navigator) {
      navigator.getInstalledRelatedApps().then((relatedApps) => {
        if (Array.isArray(relatedApps) && relatedApps.length > 0) {
          setIsAppInstalled(true);
          localStorage.setItem('pwa_installed', 'true');
        }
      }).catch(() => {});
    }

    return () => {
      if (matchStandalone?.removeEventListener) {
        matchStandalone.removeEventListener('change', handleDisplayChange);
      }
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('cestaon:pwa-installed', handleAppInstalled);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const safeLists = Array.isArray(lists) ? lists : [];
  const activeLists = safeLists.filter((l) => l.status === 'active');

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowToolsMenu(false);
      }
    }
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        setShowToolsMenu(false);
      }
    }
    if (showToolsMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showToolsMenu]);

  return (
    <header className="cestaon-header sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 px-3.5 sm:px-8 flex flex-col justify-center transition-all w-full max-w-full shadow-sm">
      <div className="max-w-5xl mx-auto w-full flex items-center justify-between gap-2.5 sm:gap-6">
        {/* Marca & Logo Minimalista */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center text-white shadow-sm shrink-0">
            <ShoppingBag className="w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-base sm:text-lg text-slate-900 dark:text-white tracking-tight leading-none">
              Cesta<span className="text-brand-500">On</span>
            </span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium hidden sm:inline leading-tight mt-1">
              No CestaON, o preço é bom.
            </span>
          </div>
        </div>

        {/* Seletor de Lista Ativa (Apenas listas não-finalizadas) */}
        <div className="flex-1 min-w-0 max-w-full sm:max-w-sm md:max-w-md">
          {activeLists.length > 0 ? (
            <div className="relative">
              <select
                value={activeList?.status === 'active' ? activeList.id : ''}
                onChange={(e) => onSelectList(e.target.value)}
                className="w-full h-11 sm:h-10 min-h-[44px] sm:min-h-[40px] appearance-none bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs sm:text-sm font-semibold rounded-xl pl-3.5 pr-9 sm:pr-11 py-2 outline-none focus:ring-2 focus:ring-brand-500 transition truncate cursor-pointer shadow-sm"
              >
                {activeLists.map((l) => (
                  <option key={l.id} value={l.id} title={l.title}>
                    {l.title && l.title.length > 28 ? `${l.title.slice(0, 25)}...` : (l.title || 'Sem título')}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-slate-500 dark:text-slate-400 pointer-events-none absolute right-3 sm:right-4 top-1/2 -translate-y-1/2" />
            </div>
          ) : (
            <div className="w-full h-11 sm:h-10 flex items-center justify-center text-center px-2.5 sm:px-3.5 rounded-xl bg-slate-100/70 dark:bg-slate-800/60 border border-dashed border-slate-200 dark:border-slate-700/80 text-xs sm:text-sm text-slate-400 dark:text-slate-500 font-medium select-none">
              <span className="truncate">Sem feira</span>
            </div>
          )}
        </div>

        {/* Ações */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          {pendingSyncCount > 0 && (
            <div
              className="h-10 flex items-center gap-1 bg-sky-50 dark:bg-sky-950/60 border border-sky-300 dark:border-sky-800 text-sky-800 dark:text-sky-300 text-[10px] sm:text-[11px] font-bold px-2 rounded-xl animate-pulse"
              title={`${pendingSyncCount} operação(ões) salvas no aparelho aguardando sincronização em segundo plano via SyncManager`}
            >
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-sky-600 dark:text-sky-400" />
              <span className="hidden xs:inline">{pendingSyncCount}</span>
            </div>
          )}

          {isSubsurface && (
            <div
              className="h-10 flex items-center gap-1 bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-[10px] sm:text-[11px] font-bold px-2 rounded-xl"
              title="Modo Subsolo Ativo: Todos os módulos inteligentes e cotações estão funcionando via cache local"
            >
              <WifiOff className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span className="hidden sm:inline">Subsolo</span>
            </div>
          )}

          <button
            onClick={onOpenNewListModal}
            className="h-11 w-11 sm:h-10 sm:w-auto min-w-[44px] sm:min-w-0 flex items-center justify-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs sm:text-sm font-semibold sm:px-3.5 rounded-xl shadow-sm transition shrink-0 active:scale-95"
            title="Criar nova lista"
          >
            <Plus className="w-5 h-5 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">Nova Lista</span>
          </button>

          {/* Menu de Ferramentas e Recursos */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowToolsMenu((prev) => !prev)}
              className={`h-11 w-11 sm:h-10 sm:w-10 flex items-center justify-center rounded-xl transition ${
                showToolsMenu
                  ? 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              title="Mais opções e ferramentas"
            >
              <MoreVertical className="w-5 h-5 sm:w-4 sm:h-4" />
            </button>

            {showToolsMenu && (
              <>
                {/* Backdrop para fechar ao tocar fora no mobile e desktop */}
                <div
                  className="fixed inset-0 z-40 bg-black/15 dark:bg-black/35 backdrop-blur-[1px] sm:bg-transparent sm:backdrop-blur-none"
                  onClick={() => setShowToolsMenu(false)}
                  onTouchStart={() => setShowToolsMenu(false)}
                />

                <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl py-1.5 z-50 text-xs sm:text-sm animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-3.5 py-2 border-b border-slate-100 dark:border-slate-700/60 flex items-center justify-between">
                    <span className="font-bold text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Ferramentas
                    </span>
                    <button
                      onClick={() => setShowToolsMenu(false)}
                      className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
                      title="Fechar menu"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {activeList && (
                    <>
                      {activeList && activeList.status !== 'completed' && (
                        <button
                          onClick={() => {
                            setShowToolsMenu(false);
                            onOpenShareModal && onOpenShareModal('share');
                          }}
                          className="w-full px-3 py-2 text-left flex items-center gap-2 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
                          title="Compartilhar esta feira aberta (código e link em tempo real)"
                        >
                          <Share2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          <span>Compartilhar lista</span>
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setShowToolsMenu(false);
                          onDuplicateList(activeList.id);
                        }}
                        className="w-full px-3 py-2 text-left flex items-center gap-2 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
                      >
                        <Copy className="w-4 h-4 text-slate-500" />
                        <span>Duplicar feira</span>
                      </button>
                      <button
                        onClick={() => {
                          setShowToolsMenu(false);
                          onOpenWhereToBuy();
                        }}
                        className="w-full px-3 py-2 text-left flex items-center gap-2 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
                      >
                        <TrendingDown className="w-4 h-4 text-emerald-500" />
                        <span>Onde Comprar</span>
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => {
                      setShowToolsMenu(false);
                      onOpenShareModal && onOpenShareModal('join');
                    }}
                    className="w-full px-3 py-2 text-left flex items-center gap-2 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
                    title="Entrar em uma feira com código"
                  >
                    <KeyRound className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                    <span>Entrar com código</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowToolsMenu(false);
                      onOpenCalculator();
                    }}
                    className="w-full px-3 py-2 text-left flex items-center gap-2 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
                  >
                    <Calculator className="w-4 h-4 text-blue-500" />
                    <span>Comparar embalagens</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowToolsMenu(false);
                      onOpenHistory();
                    }}
                    className="w-full px-3 py-2 text-left flex items-center gap-2 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
                  >
                    <History className="w-4 h-4 text-amber-500" />
                    <span>Histórico de preços</span>
                  </button>
                  <div className="my-1 border-t border-slate-100 dark:border-slate-700/60" />
                  <button
                    onClick={() => {
                      setShowToolsMenu(false);
                      if (onOpenTutorial) onOpenTutorial();
                    }}
                    className="w-full px-3 py-2 text-left flex items-center gap-2 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 font-semibold"
                  >
                    <HelpCircle className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                    <span>Como usar o app</span>
                  </button>
                  {!isAppInstalled && (
                    <button
                      onClick={() => {
                        setShowToolsMenu(false);
                        if (onOpenInstallPwa) onOpenInstallPwa();
                      }}
                      className="w-full px-3 py-2 text-left flex items-center gap-2 text-brand-700 dark:text-brand-300 hover:bg-brand-50 dark:hover:bg-brand-950/50 font-bold"
                    >
                      <Download className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                      <span>Como instalar no celular</span>
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setShowToolsMenu(false);
                      onToggleTheme();
                    }}
                    className="w-full px-3 py-2 text-left flex items-center gap-2 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 sm:hidden"
                  >
                    {theme === 'dark' ? (
                      <>
                        <Sun className="w-4 h-4 text-amber-400" />
                        <span>Modo Claro</span>
                      </>
                    ) : (
                      <>
                        <Moon className="w-4 h-4 text-slate-500" />
                        <span>Modo Escuro</span>
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Guia Como Usar (Desktop) */}
          <button
            onClick={onOpenTutorial}
            className="hidden sm:flex h-10 w-10 items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition"
            title="Como usar o app (Guia e Tutorial)"
          >
            <HelpCircle className="w-4 h-4 text-brand-600 dark:text-brand-400" />
          </button>

          {/* Alternar Tema (Desktop) */}
          <button
            onClick={onToggleTheme}
            className="hidden sm:flex h-10 w-10 items-center justify-center text-slate-600 dark:text-amber-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition"
            title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Perfil */}
          <button
            onClick={onOpenProfile}
            className="h-11 w-11 sm:h-10 sm:w-10 rounded-xl flex items-center justify-center text-white text-xs sm:text-sm font-bold shrink-0 transition shadow-sm ml-0.5 sm:ml-1.5 active:scale-95"
            style={{ backgroundColor: currentUser?.avatar_color || '#10B981' }}
            title={currentUser?.name || 'Perfil'}
          >
            {currentUser?.name?.charAt(0)?.toUpperCase() || 'U'}
          </button>
        </div>
      </div>

      {/* Alerta de Conflito Resolvido na Sincronização Pós-Subsolo */}
      {conflictNotification && (
        <div className="w-full max-w-5xl mx-auto mt-2 px-0.5 sm:px-1">
          <div className="w-full bg-amber-50 dark:bg-amber-950/85 border border-amber-300 dark:border-amber-700/80 rounded-2xl p-2.5 sm:p-3 flex items-center justify-between gap-2.5 text-xs text-amber-900 dark:text-amber-100 shadow-sm animate-in fade-in transition-all">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <div className="min-w-0 flex-1 leading-snug">
                <span className="font-extrabold text-amber-800 dark:text-amber-300 mr-1.5 inline">
                  Aviso de Sincronização:
                </span>
                <span className="text-amber-900/90 dark:text-amber-200/90 break-words inline">
                  {conflictNotification.reason || 'Alteração offline descartada (conflito resolvido no servidor).'}
                </span>
              </div>
            </div>
            {onDismissConflict && (
              <button
                type="button"
                onClick={onDismissConflict}
                className="shrink-0 px-2.5 py-1 rounded-xl bg-amber-200/80 hover:bg-amber-300 dark:bg-amber-900/70 dark:hover:bg-amber-800 text-amber-950 dark:text-amber-100 font-extrabold text-[11px] transition shadow-xs cursor-pointer active:scale-95"
                title="Dispensar aviso"
              >
                Entendi
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
