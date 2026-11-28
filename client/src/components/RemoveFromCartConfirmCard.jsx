import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { triggerHaptic } from '../utils/haptics.js';

export function RemoveFromCartConfirmCard({ item, onKeep, onConfirmRemove }) {
  if (!item) return null;

  const itemName = item.custom_name || item.product_name;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-[2px] flex items-center justify-center p-4"
      onClick={onKeep}
      role="dialog"
      aria-modal="true"
      aria-labelledby="remove-cart-confirm-title"
    >
      <div
        className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/60 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3
              id="remove-cart-confirm-title"
              className="text-sm font-extrabold text-slate-900 dark:text-white leading-snug"
            >
              Deseja remover este produto do carrinho?
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
              <strong className="text-slate-700 dark:text-slate-200">{itemName}</strong> voltará apenas para a lista pendente.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5 pt-1">
          <button
            type="button"
            onClick={() => {
              triggerHaptic(8);
              onKeep();
            }}
            className="btn-tactile py-2.5 px-3 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition cursor-pointer"
          >
            Manter no carrinho
          </button>
          <button
            type="button"
            onClick={() => {
              triggerHaptic(14);
              onConfirmRemove(item);
            }}
            className="btn-tactile py-2.5 px-3 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition cursor-pointer"
          >
            Remover produto
          </button>
        </div>
      </div>
    </div>
  );
}
