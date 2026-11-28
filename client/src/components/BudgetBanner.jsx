import React, { useState } from 'react';
import { formatMoney, formatCentsToBankInput, maskBankCurrencyInput, parseBankCurrencyToCents } from '../utils/formatters.js';
import { Edit3 } from 'lucide-react';

export function BudgetBanner({ list, onUpdateBudget }) {
  const [isEditing, setIsEditing] = useState(false);
  const [budgetValue, setBudgetValue] = useState(formatCentsToBankInput(list?.budget_cents));

  if (!list) return null;

  const stats = list.stats || {};
  const budgetCents = stats.budgetCents || 0;
  const totalSpentCents = stats.totalSpentCents || 0;
  const remainingBudgetCents = stats.remainingBudgetCents;
  const percentage = stats.budgetUsedPercentage || 0;
  const isOver = stats.isOverBudget;

  const handleSaveBudget = (e) => {
    e.preventDefault();
    const parsed = parseBankCurrencyToCents(budgetValue);
    onUpdateBudget(parsed);
    setIsEditing(false);
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 mb-4 transition-colors">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">
          Orçamento
        </h2>

        {!isEditing ? (
          <button
            onClick={() => {
              setBudgetValue(formatCentsToBankInput(budgetCents));
              setIsEditing(true);
            }}
            className="flex items-center gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-brand-600 transition"
          >
            <span>Teto: {budgetCents > 0 ? formatMoney(budgetCents) : 'Definir'}</span>
            <Edit3 className="w-3 h-3 text-slate-400" />
          </button>
        ) : (
          <form onSubmit={handleSaveBudget} className="flex items-center gap-1">
            <input
              type="text"
              inputMode="numeric"
              value={budgetValue}
              onChange={(e) => setBudgetValue(maskBankCurrencyInput(e.target.value))}
              placeholder="0,00"
              className="w-24 text-xs font-bold bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-brand-500 rounded-lg px-2 py-1 outline-none"
              autoFocus
            />
            <button
              type="submit"
              className="bg-brand-600 text-white text-xs font-bold px-2 py-1 rounded-lg"
            >
              OK
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="text-xs text-slate-400 px-1"
            >
              ✕
            </button>
          </form>
        )}
      </div>

      {/* Métricas Principais */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 py-1 mb-2.5">
        <div className="bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl">
          <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500 block">
            Gasto Registrado
          </span>
          <span className="text-base font-bold text-slate-900 dark:text-slate-100">
            {formatMoney(totalSpentCents)}
          </span>
        </div>

        <div className="bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl">
          <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500 block">
            Saldo Restante
          </span>
          <span
            className={`text-base font-bold ${
              isOver ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'
            }`}
          >
            {budgetCents > 0
              ? isOver
                ? `- ${formatMoney(Math.abs(remainingBudgetCents))}`
                : formatMoney(remainingBudgetCents)
              : '—'}
          </span>
        </div>

        <div className="bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl col-span-2 sm:col-span-1">
          <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500 block">
            Itens no Carrinho
          </span>
          <span className="text-base font-bold text-slate-900 dark:text-slate-100">
            {stats.purchasedCount || 0} de {stats.totalItems || 0}
          </span>
        </div>
      </div>

      {/* Barra de Progresso */}
      {budgetCents > 0 && (
        <div className="space-y-1">
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                isOver ? 'bg-red-500' : 'bg-brand-500'
              }`}
              style={{ width: `${Math.min(percentage, 100)}%` }}
            />
          </div>
          {isOver && (
            <p className="text-xs text-red-600 dark:text-red-400 font-semibold pt-0.5">
              Orçamento ultrapassado em {formatMoney(Math.abs(remainingBudgetCents))}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
