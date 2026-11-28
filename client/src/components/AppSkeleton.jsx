import React from 'react';

export function AppSkeleton({ isColdStarting = false }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Carregando CestaON"
      className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col w-full max-w-full overflow-x-hidden"
    >
      {/* Skeleton do Cabeçalho */}
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 w-full">
        <div className="cestaon-header max-w-7xl mx-auto px-3 sm:px-8 flex items-center justify-between gap-2 sm:gap-6">
          {/* Logo */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl skeleton-shimmer" />
            <div className="hidden sm:flex flex-col gap-1.5">
              <div className="h-4 w-24 rounded-md skeleton-shimmer" />
              <div className="h-2.5 w-32 rounded-md skeleton-shimmer opacity-70" />
            </div>
          </div>

          {/* Seletor de Feiras */}
          <div className="flex-1 min-w-0 sm:max-w-sm md:max-w-md">
            <div className="h-10 w-full rounded-xl skeleton-shimmer" />
          </div>

          {/* Ações à Direita */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            <div className="h-10 w-10 sm:w-28 rounded-xl skeleton-shimmer" />
            <div className="hidden sm:block h-10 w-10 rounded-xl skeleton-shimmer" />
            <div className="h-10 w-10 rounded-xl skeleton-shimmer" />
            <div className="h-10 w-10 rounded-full skeleton-shimmer" />
          </div>
        </div>
      </header>

      {/* Skeleton das Abas de Navegação */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-2 sm:px-3 py-2 sm:py-2.5 w-full">
        <div className="max-w-2xl mx-auto flex items-center justify-between sm:justify-center gap-1.5 sm:gap-2">
          <div className="flex-1 sm:flex-none sm:w-24 h-10 rounded-xl skeleton-shimmer" />
          <div className="flex-1 sm:flex-none sm:w-28 h-10 rounded-xl skeleton-shimmer opacity-80" />
          <div className="flex-1 sm:flex-none sm:w-24 h-10 rounded-xl skeleton-shimmer opacity-80" />
          <div className="flex-1 sm:flex-none sm:w-24 h-10 rounded-xl skeleton-shimmer opacity-80" />
        </div>
      </div>

      {/* Skeleton do Conteúdo Principal */}
      <main className="flex-1 max-w-4xl lg:max-w-5xl w-full mx-auto p-3.5 sm:p-6 space-y-5">
        {/* Barra de Adicionar Produto */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 sm:p-4 shadow-sm">
          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="h-11 flex-1 rounded-xl skeleton-shimmer" />
            <div className="flex items-center gap-2">
              <div className="h-11 w-16 rounded-xl skeleton-shimmer" />
              <div className="h-11 w-20 rounded-xl skeleton-shimmer" />
              <div className="h-11 flex-1 sm:w-28 rounded-xl skeleton-shimmer" />
            </div>
          </div>
        </div>

        {/* Chips de Favoritos / Adição Rápida */}
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="h-7 w-20 rounded-full skeleton-shimmer shrink-0" />
          <div className="h-7 w-24 rounded-full skeleton-shimmer shrink-0" />
          <div className="h-7 w-20 rounded-full skeleton-shimmer shrink-0" />
          <div className="h-7 w-28 rounded-full skeleton-shimmer shrink-0" />
          <div className="h-7 w-24 rounded-full skeleton-shimmer shrink-0 hidden sm:block" />
          <div className="h-7 w-20 rounded-full skeleton-shimmer shrink-0 hidden md:block" />
        </div>

        {/* Card de Categoria 1 */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-3 h-3 rounded-full skeleton-shimmer" />
              <div className="h-4 w-40 rounded-md skeleton-shimmer" />
            </div>
            <div className="h-5 w-14 rounded-full skeleton-shimmer" />
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
            {[0, 1, 2].map((idx) => (
              <div key={idx} className="px-4 py-3.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-5 h-5 rounded-full skeleton-shimmer shrink-0" />
                  <div className="space-y-1.5 flex-1">
                    <div
                      className={`h-4 rounded-md skeleton-shimmer ${
                        idx === 0 ? 'w-36' : idx === 1 ? 'w-48' : 'w-28'
                      }`}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="h-6 w-12 rounded-lg skeleton-shimmer" />
                  <div className="h-7 w-7 rounded-lg skeleton-shimmer" />
                  <div className="h-7 w-7 rounded-lg skeleton-shimmer hidden sm:block" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Card de Categoria 2 */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-3 h-3 rounded-full skeleton-shimmer" />
              <div className="h-4 w-32 rounded-md skeleton-shimmer" />
            </div>
            <div className="h-5 w-12 rounded-full skeleton-shimmer" />
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
            {[0, 1].map((idx) => (
              <div key={idx} className="px-4 py-3.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-5 h-5 rounded-full skeleton-shimmer shrink-0" />
                  <div className={`h-4 rounded-md skeleton-shimmer ${idx === 0 ? 'w-44' : 'w-32'}`} />
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="h-6 w-12 rounded-lg skeleton-shimmer" />
                  <div className="h-7 w-7 rounded-lg skeleton-shimmer" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Aviso discreto apenas se a rede estiver lenta ou o servidor estiver reconectando */}
      {isColdStarting && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 px-4 py-2.5 rounded-full bg-slate-900/90 dark:bg-slate-800/95 text-white text-xs font-semibold shadow-lg border border-slate-700/60 backdrop-blur-md flex items-center gap-2 whitespace-nowrap animate-in fade-in">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Conectando ao servidor... Aguarde um instante.</span>
        </div>
      )}
    </div>
  );
}
