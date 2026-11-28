import React, { useState } from 'react';
import { Plus, X, ShoppingBag, KeyRound } from 'lucide-react';
import { showToast } from '../utils/toast.js';
import { maskBankCurrencyInput, parseBankCurrencyToCents } from '../utils/formatters.js';

export function NewListModal({ stores, onCreate, onClose, onOpenJoinModal }) {
  const [title, setTitle] = useState('');
  const [budget, setBudget] = useState('');
  const [storeId, setStoreId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);
    try {
      const budgetCents = parseBankCurrencyToCents(budget);
      await onCreate({
        title: title.trim(),
        budget_cents: budgetCents,
        store_id: storeId || null
      });
      onClose();
    } catch (err) {
      showToast(err.message || 'Erro ao criar feira', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full shadow-2xl overflow-hidden my-auto transition-colors duration-200">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/80">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-brand-700 dark:text-brand-300 flex items-center justify-center">
              <ShoppingBag className="w-4 h-4" />
            </div>
            <h2 className="text-base font-black text-slate-900 dark:text-white">Nova Lista de Compras</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-200/80 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-300 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Título da Feira / Lista
              </label>
              <span className={`text-[10px] font-semibold ${title.length >= 35 ? 'text-amber-500 font-bold' : 'text-slate-400 dark:text-slate-500'}`}>
                {title.length}/35
              </span>
            </div>
            <input
              type="text"
              maxLength={35}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Feira Semanal, Compras do Mês..."
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-brand-500"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">Teto do Orçamento (R$)</label>
            <input
              type="text"
              inputMode="numeric"
              value={budget}
              onChange={(e) => setBudget(maskBankCurrencyInput(e.target.value))}
              placeholder="Ex: 350,00 (Opcional)"
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">Supermercado Pretendido</label>
            <select
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl px-3.5 py-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">Selecione ou deixe em aberto</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 text-xs font-black bg-brand-600 hover:bg-brand-700 text-white rounded-xl shadow-md transition disabled:opacity-50"
            >
              {isSubmitting ? 'Criando...' : 'Criar Lista'}
            </button>
          </div>

          {onOpenJoinModal && (
            <div className="pt-3 text-center border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenJoinModal();
                }}
                className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1.5"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>Já tem um código de feira? <strong>Entrar com código</strong></span>
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
