import React, { useState, useEffect } from 'react';
import { formatMoney } from '../utils/formatters.js';
import { Store, TrendingDown, AlertCircle, CheckCircle2, X, WifiOff } from 'lucide-react';
import { getCachedWhereToBuy, isSubsurface } from '../utils/subsurfaceCache.js';

export function WhereToBuyModal({ listId, onClose }) {
  const [simulation, setSimulation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isFromCache, setIsFromCache] = useState(false);

  useEffect(() => {
    async function fetchSim() {
      // 1. Se estiver no subsolo (sem rede), tenta o cache preditivo imediatamente
      if (isSubsurface()) {
        const cached = getCachedWhereToBuy(listId);
        if (cached && cached.data) {
          setSimulation(cached.data);
          setIsFromCache(true);
          setLoading(false);
          return;
        }
      }

      try {
        const userId = typeof window !== 'undefined' ? localStorage.getItem('feira_user_id') : null;
        const token = typeof window !== 'undefined' ? localStorage.getItem('feira_auth_token') : null;
        const headers = {};
        if (userId) headers['X-User-Id'] = userId;
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`/api/lists/${listId}/where-to-buy`, { headers });
        if (!res.ok) throw new Error('Falha na resposta da rede');
        const data = await res.json();
        setSimulation(data);
        setIsFromCache(false);
      } catch (err) {
        // Fallback resiliente para o cache preditivo salvo no aparelho
        const cached = getCachedWhereToBuy(listId);
        if (cached && cached.data) {
          setSimulation(cached.data);
          setIsFromCache(true);
        } else {
          console.warn('Sem cache preditivo para esta feira offline:', err);
        }
      } finally {
        setLoading(false);
      }
    }
    if (listId) fetchSim();
  }, [listId]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden my-auto transition-colors duration-200">
        {/* Cabeçalho */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/80">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-brand-600 dark:text-brand-400 block">Inteligência de Mercado</span>
            <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">Simulador "Onde Comprar"</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-200/80 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-300 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="p-4 sm:p-6 space-y-4">
          {loading ? (
            <div className="text-center py-10 text-slate-400 text-sm">Calculando cotações dos supermercados...</div>
          ) : !simulation || simulation.message === 'Lista vazia' || simulation.totalListItems === 0 || simulation.stores?.length === 0 ? (
            <div className="text-center py-10 px-4 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
                <Store className="w-6 h-6" />
              </div>
              <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">
                Sua lista atual está vazia
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto leading-relaxed">
                Adicione produtos nesta feira (na aba Lista). O CestaON cruzará sua lista com os preços registrados nos estabelecimentos e indicará onde ela fica mais barata!
              </p>
              <div className="pt-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-bold text-xs transition shadow-sm"
                >
                  Voltar e Adicionar Produtos
                </button>
              </div>
            </div>
          ) : simulation.stores.every((s) => s.matchedItemsCount === 0) ? (
            <div className="text-center py-10 px-4 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
                <Store className="w-6 h-6" />
              </div>
              <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">
                Ainda não há cotações para estes itens
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto leading-relaxed">
                Os itens adicionados nesta lista ainda não possuem histórico de preços nos supermercados cadastrados.
              </p>
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl text-xs text-slate-600 dark:text-slate-300 max-w-md mx-auto text-left flex items-start gap-2 border border-slate-200/60 dark:border-slate-700/60">
                <AlertCircle className="w-4 h-4 text-brand-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Como funciona:</strong> Ao fazer suas compras e tocar em "Finalizar" no modo mercado, o CestaON aprende os preços pagos e passa a sugerir automaticamente o mercado mais barato para as próximas compras.
                </span>
              </div>
            </div>
          ) : (
            <>
              {/* Aviso Preditivo do Modo Subsolo */}
              {isFromCache && (
                <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-2xl p-3 flex items-center gap-2.5 text-xs text-amber-800 dark:text-amber-300">
                  <WifiOff className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <span>
                    <strong>Modo Subsolo Ativo:</strong> Exibindo cotações pré-calculadas salvas no aparelho antes de perder o sinal.
                  </span>
                </div>
              )}

              {/* Resumo de Economia Potencial */}
              {simulation.potentialSavingsCents > 0 && simulation.cheapestStore && (
                <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-2xl p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0">
                    <TrendingDown className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-sm text-emerald-900 dark:text-emerald-200">
                      Economia potencial de {formatMoney(simulation.potentialSavingsCents)}
                    </h4>
                    <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-0.5">
                      Comprando no <strong>{simulation.cheapestStore.storeName}</strong> sua feira sai mais em conta com base nas suas últimas compras.
                    </p>
                  </div>
                </div>
              )}

              {/* Cards dos Estabelecimentos */}
              <div className="space-y-3">
                {simulation.stores.map((store) => {
                  const isCheapest =
                    simulation.cheapestStore?.storeId === store.storeId && store.coveragePercentage >= 80;

                  return (
                    <div
                      key={store.storeId}
                      className={`relative overflow-hidden p-4 rounded-2xl border transition-all duration-200 ${
                        isCheapest
                          ? 'bg-gradient-to-br from-emerald-50/70 via-emerald-50/40 to-teal-50/20 dark:from-emerald-950/40 dark:via-emerald-950/20 dark:to-slate-900 border-2 border-emerald-500/80 dark:border-emerald-500/70 shadow-md shadow-emerald-500/10'
                          : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      {/* Badge Superior Destacada para o Mais Econômico */}
                      {isCheapest && (
                        <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-emerald-200/80 dark:border-emerald-800/80">
                          <span className="inline-flex items-center gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-[10px] sm:text-[11px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full shadow-sm shadow-emerald-600/25 whitespace-nowrap">
                            <TrendingDown className="w-3.5 h-3.5 shrink-0" />
                            <span>Mais Econômico</span>
                          </span>
                          {(simulation.potentialSavingsCents || 0) > 0 && (
                            <span className="text-[11px] font-extrabold text-emerald-700 dark:text-emerald-300">
                              Economia de {formatMoney(simulation.potentialSavingsCents)}
                            </span>
                          )}
                        </div>
                      )}

                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                              isCheapest
                                ? 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            <Store className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-extrabold text-sm text-slate-900 dark:text-slate-100 truncate">
                              {store.storeName}
                            </h4>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 block truncate">
                              Cobertura: {store.matchedItemsCount} de {store.totalItemsCount} itens ({store.coveragePercentage}%)
                            </span>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          {store.matchedItemsCount > 0 ? (
                            <>
                              <span
                                className={`text-base font-black block ${
                                  isCheapest ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-900 dark:text-slate-100'
                                }`}
                              >
                                {formatMoney(store.totalEstimatedCents)}
                              </span>
                              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold block">
                                {store.isComplete ? 'Preço 100% Coberto' : 'Custo Parcial'}
                              </span>
                            </>
                          ) : (
                            <span className="text-xs text-slate-400 dark:text-slate-500 italic block">
                              Sem cotações
                            </span>
                          )}
                        </div>
                      </div>

                      {!store.isComplete && (
                        <div className="mt-2.5 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-300">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            {store.totalItemsCount - store.matchedItemsCount} item(ns) ainda não possuem preço registrado neste mercado.
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
