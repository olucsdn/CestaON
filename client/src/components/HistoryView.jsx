import React, { useState, useEffect } from 'react';
import { formatMoney, formatDate, formatPercent } from '../utils/formatters.js';
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  Store,
  ArrowUpRight,
  ArrowDownRight,
  Info,
  LineChart,
  X,
  WifiOff,
  CheckCircle2
} from 'lucide-react';
import {
  getCachedHistory,
  getCachedTrends,
  getCachedComparison,
  isSubsurface
} from '../utils/subsurfaceCache.js';

export function HistoryView({ onClose }) {
  const [historyList, setHistoryList] = useState([]);
  const [selectedComparison, setSelectedComparison] = useState(null);
  const [trends, setTrends] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isFromCache, setIsFromCache] = useState(false);

  useEffect(() => {
    async function loadData() {
      // 1. Se estiver no subsolo (sem rede), recupera direto do cache preditivo
      if (isSubsurface()) {
        const cachedHist = getCachedHistory();
        const cachedTrends = getCachedTrends();
        if (cachedHist && cachedHist.data) {
          setHistoryList(cachedHist.data);
          setTrends(cachedTrends?.data || []);
          setIsFromCache(true);
          if (cachedHist.data.length > 0) {
            const cachedComp = getCachedComparison(cachedHist.data[0].id);
            if (cachedComp?.data) setSelectedComparison(cachedComp.data);
          }
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

        const [histRes, trendsRes] = await Promise.all([
          fetch('/api/history', { headers }).then((r) => (r.ok ? r.json() : null)),
          fetch('/api/history/trends', { headers }).then((r) => (r.ok ? r.json() : null))
        ]);
        if (histRes) setHistoryList(histRes);
        if (trendsRes) setTrends(trendsRes);
        setIsFromCache(false);

        // Se houver pelo menos uma feira, carrega a comparação da mais recente
        if (histRes && histRes.length > 0) {
          const comp = await fetch(`/api/history/compare/${histRes[0].id}`, { headers }).then((r) => (r.ok ? r.json() : null));
          if (comp) setSelectedComparison(comp);
        }
      } catch (err) {
        // Fallback resiliente para o cache preditivo
        const cachedHist = getCachedHistory();
        const cachedTrends = getCachedTrends();
        if (cachedHist && cachedHist.data) {
          setHistoryList(cachedHist.data);
          setTrends(cachedTrends?.data || []);
          setIsFromCache(true);
          if (cachedHist.data.length > 0) {
            const cachedComp = getCachedComparison(cachedHist.data[0].id);
            if (cachedComp?.data) setSelectedComparison(cachedComp.data);
          }
        } else {
          console.warn('Sem cache preditivo para histórico:', err);
        }
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const handleSelectHistory = async (historyId) => {
    if (isSubsurface()) {
      const cachedComp = getCachedComparison(historyId);
      if (cachedComp?.data) {
        setSelectedComparison(cachedComp.data);
        return;
      }
    }

    try {
      const userId = typeof window !== 'undefined' ? localStorage.getItem('feira_user_id') : null;
      const token = typeof window !== 'undefined' ? localStorage.getItem('feira_auth_token') : null;
      const headers = {};
      if (userId) headers['X-User-Id'] = userId;
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const comp = await fetch(`/api/history/compare/${historyId}`, { headers }).then((r) => (r.ok ? r.json() : null));
      if (comp) {
        setSelectedComparison(comp);
      } else {
        const cachedComp = getCachedComparison(historyId);
        if (cachedComp?.data) setSelectedComparison(cachedComp.data);
      }
    } catch (_) {
      const cachedComp = getCachedComparison(historyId);
      if (cachedComp?.data) setSelectedComparison(cachedComp.data);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden my-auto transition-colors duration-200">
        {/* Cabeçalho do Modal */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-800/80">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-brand-600 dark:text-brand-400 block">Inteligência Financeira</span>
            <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">Histórico & Comparativo de Feiras</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-200/80 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-300 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Conteúdo com Scroll */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {loading ? (
            <div className="text-center py-12 text-slate-400 text-sm">Carregando histórico...</div>
          ) : historyList.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <Calendar className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto" />
              <h4 className="font-extrabold text-slate-700 dark:text-slate-300">Nenhuma feira finalizada ainda</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                Quando você terminar suas compras e tocar em "Finalizar", seu histórico e gráficos de variação de preços começarão a ser gerados aqui.
              </p>
            </div>
          ) : (
            <>
              {/* Aviso Preditivo do Modo Subsolo */}
              {isFromCache && (
                <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-2xl p-3 flex items-center gap-2.5 text-xs text-amber-800 dark:text-amber-300">
                  <WifiOff className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <span>
                    <strong>Modo Subsolo Ativo:</strong> Exibindo histórico e comparativos salvos no cache preditivo do aparelho.
                  </span>
                </div>
              )}

              {/* Card de Destaque da Comparação */}
              {selectedComparison && (
                <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-400">
                      Comparativo: {selectedComparison.current?.list_title}
                    </span>
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      {formatDate(selectedComparison.current?.completed_at)}
                    </span>
                  </div>

                  {selectedComparison.hasComparison ? (
                    <div>
                      {/* Mensagem Humanizada */}
                      <div
                        className={`p-3.5 rounded-xl border flex items-center gap-2.5 font-bold text-xs sm:text-sm ${
                          selectedComparison.deltaCents > 0
                            ? 'bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300 border-red-200 dark:border-red-800/60'
                            : selectedComparison.deltaCents < 0
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        {selectedComparison.deltaCents > 0 ? (
                          <TrendingUp className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0" />
                        ) : selectedComparison.deltaCents < 0 ? (
                          <TrendingDown className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        ) : (
                          <Info className="w-5 h-5 text-slate-600 dark:text-slate-400 shrink-0" />
                        )}
                        <span>{selectedComparison.humanMessage}</span>
                      </div>

                      {/* Maiores Altas e Baixas */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                        {/* Maiores Aumentos */}
                        <div className="bg-white dark:bg-slate-800/90 border border-slate-200/90 dark:border-slate-700/80 rounded-xl p-3">
                          <span className="text-[11px] font-extrabold text-red-700 dark:text-red-400 flex items-center gap-1 mb-2">
                            <ArrowUpRight className="w-3.5 h-3.5" /> Maiores Aumentos de Preço
                          </span>
                          {selectedComparison.topIncreases?.length > 0 ? (
                            <div className="space-y-1.5">
                              {selectedComparison.topIncreases.map((item) => (
                                <div key={item.productId} className="flex justify-between items-center text-xs">
                                  <span className="font-semibold text-slate-700 dark:text-slate-300 truncate max-w-[140px]">{item.name}</span>
                                  <span className="font-extrabold text-red-600 dark:text-red-400">
                                    {formatPercent(item.percentChange)} (+{formatMoney(item.diffCents)})
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 italic">Nenhum aumento expressivo registrado.</span>
                          )}
                        </div>

                        {/* Maiores Quedas */}
                        <div className="bg-white dark:bg-slate-800/90 border border-slate-200/90 dark:border-slate-700/80 rounded-xl p-3">
                          <span className="text-[11px] font-extrabold text-emerald-700 dark:text-emerald-400 flex items-center gap-1 mb-2">
                            <ArrowDownRight className="w-3.5 h-3.5" /> Maiores Reduções de Preço
                          </span>
                          {selectedComparison.topDecreases?.length > 0 ? (
                            <div className="space-y-1.5">
                              {selectedComparison.topDecreases.map((item) => (
                                <div key={item.productId} className="flex justify-between items-center text-xs">
                                  <span className="font-semibold text-slate-700 dark:text-slate-300 truncate max-w-[140px]">{item.name}</span>
                                  <span className="font-extrabold text-emerald-600 dark:text-emerald-400">
                                    {formatPercent(item.percentChange)} ({formatMoney(item.diffCents)})
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 italic">Nenhuma redução registrada.</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 space-y-2.5">
                      <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-bold text-xs sm:text-sm">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span>1ª Feira Registrada com Sucesso!</span>
                      </div>
                      <p className="text-xs text-emerald-700 dark:text-emerald-400 leading-relaxed">
                        Esta é a sua primeira feira finalizada no CestaON. Os comparativos de variação de preço (maiores altas e quedas) serão calculados automaticamente a partir da sua 2ª feira finalizada!
                      </p>
                      <div className="pt-2 border-t border-emerald-200/60 dark:border-emerald-800/60 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-700 dark:text-slate-300">
                        <div>Mercado: <strong className="text-slate-900 dark:text-white">{selectedComparison.current?.store_name || 'Supermercado'}</strong></div>
                        <div>Total Pago: <strong className="text-brand-600 dark:text-brand-400">{formatMoney(selectedComparison.current?.total_spent_cents)}</strong></div>
                        <div>Itens: <strong className="text-slate-900 dark:text-white">{selectedComparison.current?.total_items || 0}</strong></div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Gráfico Mensal de Cesta Básica / Produtos Essenciais */}
              {trends.length > 0 && (
                <div className="bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <LineChart className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                    <h3 className="font-extrabold text-xs sm:text-sm text-slate-800 dark:text-slate-100 uppercase tracking-wider">
                      Evolução de Preço dos Itens Essenciais (R$/kg, R$/L)
                    </h3>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                          <th className="py-2">Produto</th>
                          <th className="py-2">Mês/Ano</th>
                          <th className="py-2 text-right">Preço Unitário Base</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                        {trends.slice(0, 8).map((t, idx) => (
                          <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <td className="py-2 font-bold text-slate-800 dark:text-slate-200">{t.product_name}</td>
                            <td className="py-2 text-slate-500 dark:text-slate-400">{t.month_year}</td>
                            <td className="py-2 text-right font-extrabold text-brand-600 dark:text-brand-400">
                              {formatMoney(t.normalized_price_per_base_unit_cents)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Lista Completa de Feiras Anteriores */}
              <div className="space-y-2">
                <span className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 block px-1">
                  Todas as Feiras Registradas ({historyList.length})
                </span>
                <div className="space-y-2">
                  {historyList.map((h) => (
                    <div
                      key={h.id}
                      onClick={() => handleSelectHistory(h.id)}
                      className={`p-3 sm:p-4 rounded-xl border transition cursor-pointer flex items-center justify-between gap-3 ${
                        selectedComparison?.current?.id === h.id
                          ? 'bg-emerald-50/50 dark:bg-emerald-950/40 border-brand-500 dark:border-brand-500'
                          : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      <div>
                        <h4 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">{h.list_title}</h4>
                        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          <span className="flex items-center gap-1">
                            <Store className="w-3 h-3" />
                            {h.store_name || 'Supermercado'}
                          </span>
                          <span>•</span>
                          <span>{formatDate(h.completed_at)}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-sm font-black text-slate-900 dark:text-slate-100 block">
                          {formatMoney(h.total_spent_cents)}
                        </span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">
                          {h.total_items} {h.total_items === 1 ? 'item' : 'itens'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
