import React, { useState } from 'react';
import {
  formatMoney,
  formatQuantity,
  formatCentsToBankInput,
  maskBankCurrencyInput,
  parseBankCurrencyToCents
} from '../utils/formatters.js';
import { ShoppingCart, Check, X, Scale } from 'lucide-react';

export function CartPricePromptModal({ item, onConfirmPrice, onUnknownPrice, onCancelPending, onClose }) {
  const [priceInput, setPriceInput] = useState(
    formatCentsToBankInput(item?.actual_price_cents)
  );
  const [error, setError] = useState('');

  if (!item) return null;

  const itemName = item.custom_name || item.product_name || 'Produto';
  const estimatedCents = item.estimated_price_cents || 0;

  const handleConfirmPrice = (e) => {
    e.preventDefault();
    const cents = parseBankCurrencyToCents(priceInput);
    if (cents <= 0) {
      setError('Informe um valor maior que zero ou selecione a opção abaixo.');
      return;
    }
    setError('');
    onConfirmPrice(item.id, cents);
    onClose();
  };

  const handleUnknown = () => {
    onUnknownPrice(item.id);
    onClose();
  };

  const handleUseEstimated = () => {
    if (estimatedCents > 0) {
      setPriceInput(formatCentsToBankInput(estimatedCents));
      setError('');
    }
  };

  const handleCancel = () => {
    if (item?.is_purchased && onCancelPending) {
      onCancelPending(item.id);
    } else {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-md w-full shadow-2xl overflow-hidden my-auto transition-colors duration-200 animate-in fade-in zoom-in-95 duration-150">
        {/* Cabeçalho */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-brand-100 dark:bg-brand-950/70 text-brand-700 dark:text-brand-300 flex items-center justify-center">
              <ShoppingCart className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white leading-tight">
                {item.is_purchased ? 'Atualizar Preço no Carrinho' : 'Colocar no Carrinho'}
              </h2>
              <span
                className="inline-block text-[11px] font-bold px-1.5 py-0.5 rounded mt-0.5"
                style={{
                  backgroundColor: `${item.category_color || '#64748B'}20`,
                  color: item.category_color || '#64748B'
                }}
              >
                {item.category_name || 'Item da feira'}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-200/80 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-300 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Informações do Item */}
        <div className="p-5 space-y-4">
          <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate">
                {itemName}
              </h3>
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Quantidade: {formatQuantity(item.quantity, item.unit)}
              </span>
            </div>
            {estimatedCents > 0 && (
              <div className="text-right shrink-0">
                <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 block">
                  Estimado
                </span>
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                  {formatMoney(estimatedCents)}
                </span>
              </div>
            )}
          </div>

          {/* Opção 1: Digitar o Preço */}
          <form onSubmit={handleConfirmPrice} className="space-y-3">
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Qual o valor deste item?
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                  R$
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  autoFocus
                  value={priceInput}
                  onChange={(e) => {
                    setPriceInput(maskBankCurrencyInput(e.target.value));
                    if (error) setError('');
                  }}
                  placeholder="0,00"
                  className="w-full pl-11 pr-4 py-3 bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 rounded-xl text-lg font-black text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-500 transition shadow-inner"
                />
              </div>

              {error && (
                <p className="text-xs font-medium text-rose-600 dark:text-rose-400 mt-1">
                  {error}
                </p>
              )}

              {estimatedCents > 0 && (
                <button
                  type="button"
                  onClick={handleUseEstimated}
                  className="text-xs text-brand-600 dark:text-brand-400 hover:underline font-semibold mt-1.5 block"
                >
                  💡 Preencher com valor estimado ({formatMoney(estimatedCents)})
                </button>
              )}
            </div>

            <button
              type="submit"
              className="w-full bg-brand-600 hover:bg-brand-700 active:scale-[0.99] text-white font-bold text-sm py-3 px-4 rounded-xl shadow-sm transition flex items-center justify-center gap-2"
            >
              <Check className="w-4 h-4 stroke-[2.5]" />
              <span>{item.is_purchased ? 'Atualizar Valor' : 'Confirmar Valor e Adicionar'}</span>
            </button>
          </form>

          {/* Divisor */}
          <div className="relative flex py-1 items-center">
            <div className="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
            <span className="flex-shrink mx-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Ou se ainda não souber o preço
            </span>
            <div className="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
          </div>

          {/* Opção 2: Não sabe o preço no momento (pesar / caixa) */}
          <button
            type="button"
            onClick={handleUnknown}
            className="w-full text-left bg-amber-50 hover:bg-amber-100/80 dark:bg-amber-950/30 dark:hover:bg-amber-950/50 border border-amber-200 dark:border-amber-800/80 rounded-2xl p-3.5 transition group"
          >
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0 mt-0.5">
                <Scale className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="font-bold text-xs sm:text-sm text-amber-950 dark:text-amber-200 block group-hover:text-amber-900 dark:group-hover:text-amber-100">
                  {item.is_purchased && item.actual_price_cents > 0 ? 'Mudar para preço a definir' : 'Não sei o preço no momento'}
                </span>
                <p className="text-[11px] text-amber-800 dark:text-amber-400 mt-0.5 leading-snug">
                  Produto a ser pesado ou preço disponível somente na hora do pagamento (caixa).
                </p>
              </div>
            </div>
          </button>

          {/* Botão de Cancelar */}
          <div className="pt-1 text-center">
            <button
              type="button"
              onClick={handleCancel}
              className={`text-xs font-semibold transition ${
                item.is_purchased
                  ? 'text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400'
                  : 'text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300'
              }`}
              title={
                item.is_purchased
                  ? 'Remover produto do carrinho e voltar para a lista de itens pendentes'
                  : 'Manter item pendente'
              }
            >
              Cancelar (manter item pendente)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
