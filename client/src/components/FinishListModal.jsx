import React, { useState } from 'react';
import { formatMoney, maskBankCurrencyInput, parseBankCurrencyToCents } from '../utils/formatters.js';
import { CheckCircle2, Store, X, Scale } from 'lucide-react';
import { triggerHaptic } from '../utils/haptics.js';
import { showToast } from '../utils/toast.js';

export function FinishListModal({ list, stores, onFinish, onUpdateItemPrice, onClose }) {
  const [selectedStore, setSelectedStore] = useState(list?.store_id || (stores[0]?.id || ''));
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [quickPrices, setQuickPrices] = useState({});
  const [savingItemId, setSavingItemId] = useState(null);

  if (!list) return null;

  const purchasedCount = list.stats?.purchasedCount || 0;
  const totalSpent = list.stats?.totalSpentCents || 0;
  const unpricedItems = list.items?.filter((i) => i.is_purchased && (!i.actual_price_cents || i.actual_price_cents === 0)) || [];
  const unpricedCount = unpricedItems.length;

  const handleQuickSavePrice = async (itemId) => {
    if (!onUpdateItemPrice) return;
    const cents = parseBankCurrencyToCents(quickPrices[itemId]);
    if (cents <= 0) {
      showToast('Informe um valor maior que zero.', 'warning');
      return;
    }
    setSavingItemId(itemId);
    try {
      await onUpdateItemPrice(itemId, cents);
      setQuickPrices((prev) => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
    } catch (err) {
      showToast(err.message || 'Erro ao salvar valor do item', 'error');
    } finally {
      setSavingItemId(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (list?.status === 'completed') {
      showToast('Esta feira já foi finalizada anteriormente.', 'info');
      return;
    }
    const pendingCount = list.items?.filter((item) => !item.is_purchased).length || 0;
    if (pendingCount > 0) {
      showToast(`Conclua ou remova os ${pendingCount} item(ns) pendente(s) antes de finalizar.`, 'warning');
      return;
    }
    if (purchasedCount === 0) {
      showToast('Marque pelo menos um item como comprado antes de finalizar a feira.', 'warning');
      return;
    }
    if (unpricedCount > 0) {
      showToast(`Informe o valor de todos os produtos antes de finalizar a feira (${unpricedCount} ${unpricedCount === 1 ? 'item sem valor' : 'itens sem valor'}).`, 'warning');
      return;
    }
    if (isSubmitting) return;
    setIsSubmitting(true);
    triggerHaptic(18);
    try {
      await onFinish({ store_id: selectedStore, notes });
      onClose();
    } catch (err) {
      showToast(err.message || 'Erro ao finalizar feira', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full shadow-2xl overflow-hidden my-auto transition-colors duration-200">
        {/* Cabeçalho */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/80">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-base font-black text-slate-900 dark:text-white">Finalizar Feira</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-200/80 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-300 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Resumo da Compra */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-2xl p-4 text-center">
            <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider block">Gasto Total Efetivo</span>
            <span className="text-2xl font-black text-emerald-950 dark:text-emerald-100 block mt-1">
              {formatMoney(totalSpent)}
            </span>
            <span className="text-xs text-emerald-700 dark:text-emerald-300 mt-1 block">
              {purchasedCount} item(ns) colocados no carrinho
            </span>
          </div>

          {unpricedCount > 0 && (
            <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/80 rounded-2xl p-3 text-xs text-rose-900 dark:text-rose-200 space-y-2.5">
              <div className="flex items-center gap-2">
                <Scale className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
                <span>
                  <strong>Obrigatório:</strong> informe o valor {unpricedCount === 1 ? 'do produto sem preço' : `dos ${unpricedCount} produtos sem preço`} abaixo para finalizar:
                </span>
              </div>
              {onUpdateItemPrice && (
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-0.5">
                  {unpricedItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-2 bg-white dark:bg-slate-900/90 border border-rose-200/80 dark:border-rose-900/60 rounded-xl px-2.5 py-1.5"
                    >
                      <span className="font-bold text-slate-800 dark:text-slate-100 truncate flex-1">
                        {item.custom_name || item.product_name}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">R$</span>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={quickPrices[item.id] ?? ''}
                            onChange={(e) => setQuickPrices((prev) => ({ ...prev, [item.id]: maskBankCurrencyInput(e.target.value) }))}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleQuickSavePrice(item.id);
                              }
                            }}
                            placeholder="0,00"
                            className="w-20 pl-6 pr-1.5 py-1 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:border-brand-500"
                          />
                        </div>
                        <button
                          type="button"
                          disabled={savingItemId === item.id}
                          onClick={() => handleQuickSavePrice(item.id)}
                          className="px-2.5 py-1 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-extrabold text-[11px] transition disabled:opacity-50"
                        >
                          {savingItemId === item.id ? '...' : 'OK'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1">
              Supermercado
            </label>
            <select
              value={selectedStore}
              onChange={(e) => setSelectedStore(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-brand-500"
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1">
              Anotações (opcional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: promoções do dia..."
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl px-3 py-2 text-sm outline-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition"
            >
              Voltar
            </button>
            <button
              type="submit"
              disabled={isSubmitting || unpricedCount > 0 || purchasedCount === 0}
              className="btn-tactile active:scale-95 px-5 py-2.5 text-xs font-black bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white rounded-xl shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed border border-transparent dark:border-slate-700"
            >
              {isSubmitting ? 'Salvando...' : 'Confirmar e Congelar Histórico'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
