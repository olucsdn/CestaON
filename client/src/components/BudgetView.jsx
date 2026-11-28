import React, { useState, useEffect } from 'react';
import { formatMoney, formatQuantity, formatCentsToBankInput, maskBankCurrencyInput, parseBankCurrencyToCents } from '../utils/formatters.js';
import {
  Target,
  Edit3,
  Check,
  X,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Info,
  ListChecks,
  ShoppingCart,
  DollarSign,
  PieChart,
  ArrowRight,
  Wallet
} from 'lucide-react';

export function BudgetView({
  list,
  categories = [],
  onUpdateBudget,
  onSwitchToPlanning,
  onSwitchToMarket,
  onOpenNewList,
  onOpenShareModal
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [budgetValue, setBudgetValue] = useState('');

  useEffect(() => {
    setBudgetValue(formatCentsToBankInput(list?.budget_cents));
  }, [list?.budget_cents]);

  if (!list) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8 text-center max-w-lg mx-auto my-12 shadow-sm transition-colors duration-200">
        <div className="w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-950 text-brand-600 dark:text-brand-400 flex items-center justify-center mx-auto mb-4">
          <Target className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-black text-slate-900 dark:text-white mb-2">Nenhuma Lista Selecionada</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
          Selecione uma feira no topo ou crie uma nova lista para gerenciar o controle orçamentário.
        </p>
        <button
          onClick={onOpenNewList}
          className="min-h-[48px] bg-brand-600 hover:bg-brand-700 text-white font-extrabold text-sm px-6 py-3 rounded-xl shadow-md transition"
        >
          Criar Nova Lista
        </button>
      </div>
    );
  }

  const stats = list.stats || {};
  const budgetCents = stats.budgetCents || 0;
  const totalSpentCents = stats.totalSpentCents || 0;
  const totalEstimatedCents = stats.totalEstimatedCents || 0;
  const remainingBudgetCents = stats.remainingBudgetCents;
  const percentage = stats.budgetUsedPercentage || 0;
  const isOver = stats.isOverBudget;
  const isNearLimit = percentage >= 80 && !isOver;
  const totalItems = stats.totalItems || (list.items ? list.items.length : 0);
  const purchasedCount = stats.purchasedCount || 0;
  const itemsWithEstimateCount = stats.itemsWithEstimateCount || 0;

  // Cor da barra de progresso
  let barColor = 'bg-brand-500';
  if (isOver) barColor = 'bg-red-500 animate-pulse';
  else if (isNearLimit) barColor = 'bg-amber-500';

  const handleSaveBudget = (e) => {
    e.preventDefault();
    const parsed = parseBankCurrencyToCents(budgetValue);
    onUpdateBudget(parsed);
    setIsEditing(false);
  };

  const handleApplyPreset = (valueCents) => {
    onUpdateBudget(valueCents);
    setBudgetValue(formatCentsToBankInput(valueCents));
    setIsEditing(false);
  };

  const handleAddIncrement = (incrementCents) => {
    const current = budgetCents || 0;
    const nextVal = current + incrementCents;
    onUpdateBudget(nextVal);
    setBudgetValue(formatCentsToBankInput(nextVal));
  };

  // Cálculo da distribuição de custos por setor/categoria
  const items = list.items || [];
  const sectorMap = {};

  items.forEach((item) => {
    const catName = item.category_name || 'Outros';
    const catColor = item.category_color || '#10B981';

    let itemCost = 0;
    if (item.actual_price_cents > 0) {
      itemCost = item.actual_price_cents;
    } else if (item.estimated_price_cents > 0) {
      itemCost = Math.round(item.estimated_price_cents * (item.quantity || 1));
    }

    if (!sectorMap[catName]) {
      sectorMap[catName] = {
        name: catName,
        color: catColor,
        totalCents: 0,
        itemCount: 0,
        purchasedCount: 0
      };
    }
    sectorMap[catName].totalCents += itemCost;
    sectorMap[catName].itemCount += 1;
    if (item.is_purchased) {
      sectorMap[catName].purchasedCount += 1;
    }
  });

  const sectorList = Object.values(sectorMap).sort((a, b) => b.totalCents - a.totalCents);
  const totalCalculatedCents = sectorList.reduce((acc, s) => acc + s.totalCents, 0);

  return (
    <div className="space-y-4 pb-16 sm:pb-8">
      {/* 1. Painel de Controle de Teto Orçamentário */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-sm transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              Orçamento de {list.title}
            </h2>
            <span className="text-xs text-slate-400 dark:text-slate-500">
              {totalItems} itens na feira
            </span>
          </div>

          {!isEditing ? (
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => {
                  setBudgetValue(formatCentsToBankInput(budgetCents));
                  setIsEditing(true);
                }}
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 px-3 py-1.5 rounded-xl transition"
              >
                <Edit3 className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
                <span>{budgetCents > 0 ? `Teto: ${formatMoney(budgetCents)}` : 'Definir Teto'}</span>
              </button>

              <button
                onClick={() => handleAddIncrement(5000)}
                className="text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 px-2.5 py-1.5 rounded-xl transition"
              >
                + R$ 50
              </button>

              <button
                onClick={() => handleAddIncrement(10000)}
                className="text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 px-2.5 py-1.5 rounded-xl transition"
              >
                + R$ 100
              </button>
            </div>
          ) : (
            <form onSubmit={handleSaveBudget} className="flex items-center gap-1.5">
              <input
                type="text"
                inputMode="numeric"
                value={budgetValue}
                onChange={(e) => setBudgetValue(maskBankCurrencyInput(e.target.value))}
                placeholder="0,00"
                className="w-28 text-xs font-bold bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-brand-500 rounded-lg px-2.5 py-1.5 outline-none"
                autoFocus
              />
              <button
                type="submit"
                className="bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg"
              >
                Salvar
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="text-xs text-slate-400 hover:text-slate-600 px-1.5"
              >
                ✕
              </button>
            </form>
          )}
        </div>
      </div>

      {/* 2. Grid de Métricas Financeiras Principais (KPIs) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Teto Planejado */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm transition-colors duration-200">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-xs font-semibold">Teto Orçamentário</span>
            <DollarSign className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white leading-tight">
            {budgetCents > 0 ? formatMoney(budgetCents) : 'Sem teto'}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            {budgetCents > 0 ? 'Meta financeira definida' : 'Orçamento em aberto'}
          </p>
        </div>

        {/* Valor Registrado (No Carrinho) */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm transition-colors duration-200">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-xs font-semibold">Valor Registrado</span>
            <ShoppingCart className="w-4 h-4 text-brand-600 dark:text-brand-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-brand-600 dark:text-brand-400 leading-tight">
            {formatMoney(totalSpentCents)}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            {purchasedCount} de {totalItems} itens no carrinho
          </p>
        </div>

        {/* Saldo Restante */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm transition-colors duration-200">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-xs font-semibold">Saldo Restante</span>
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          </div>
          <div
            className={`text-xl sm:text-2xl font-black leading-tight ${
              isOver ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'
            }`}
          >
            {budgetCents > 0
              ? isOver
                ? `- ${formatMoney(Math.abs(remainingBudgetCents))}`
                : formatMoney(remainingBudgetCents)
              : 'Ilimitado'}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            {budgetCents > 0
              ? isOver
                ? 'Orçamento ultrapassado!'
                : `${percentage}% consumido`
              : 'Defina um teto para acompanhar'}
          </p>
        </div>

        {/* Estimativa Prévia Baseada no Histórico Real */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm transition-colors duration-200">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-xs font-semibold flex items-center gap-1">
              Estimativa Prévia
              <Info className="w-3 h-3 text-slate-400" />
            </span>
            {itemsWithEstimateCount > 0 && (
              <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold px-1.5 py-0.5 rounded">
                {itemsWithEstimateCount}/{totalItems}
              </span>
            )}
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white leading-tight">
            {itemsWithEstimateCount > 0 ? formatMoney(totalEstimatedCents) : 'Aguardando'}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            {itemsWithEstimateCount > 0
              ? itemsWithEstimateCount === totalItems
                ? '100% dos itens com preço anterior'
                : `${itemsWithEstimateCount} itens precificados`
              : 'Disponível após a 1ª feira finalizada'}
          </p>
        </div>
      </div>

      {/* 3. Barra de Progresso e Alertas Semânticos */}
      {budgetCents > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-sm transition-colors duration-200 space-y-3">
          <div className="flex justify-between items-center text-xs sm:text-sm">
            <span className="font-bold text-slate-700 dark:text-slate-300">
              Consumo do Teto Orçamentário
            </span>
            <span className="font-black text-slate-900 dark:text-white">{percentage}%</span>
          </div>

          <div className="w-full bg-slate-100 dark:bg-slate-800 h-3.5 rounded-full overflow-hidden p-0.5">
            <div
              className={`h-full rounded-full transition-all duration-300 ${barColor}`}
              style={{ width: `${Math.min(percentage, 100)}%` }}
            />
          </div>

          {/* Alertas Condicionais */}
          {isOver && (
            <div className="flex items-start gap-2.5 text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 rounded-xl p-3 font-medium">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
              <div>
                <strong className="font-extrabold">Atenção Crítica:</strong> Seu teto orçamentário foi
                ultrapassado em <strong>{formatMoney(Math.abs(remainingBudgetCents))}</strong>.
                Considere revisar os itens ou ajustar o teto planejado.
              </div>
            </div>
          )}

          {isNearLimit && (
            <div className="flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl p-3 font-medium">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div>
                <strong className="font-extrabold">Alerta de Proximidade:</strong> Você atingiu{' '}
                <strong>{percentage}%</strong> do limite orçamentário ({formatMoney(totalSpentCents)} de{' '}
                {formatMoney(budgetCents)}).
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. Distribuição Financeira por Setor / Categoria */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-sm transition-colors duration-200 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-4">
          <div className="flex items-center gap-2">
            <PieChart className="w-5 h-5 text-brand-600 dark:text-brand-400 shrink-0" />
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
              Distribuição por Categoria
            </h3>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400 pl-7 sm:pl-0">
            Total calculado: <strong className="text-slate-900 dark:text-slate-100 font-bold">{formatMoney(totalCalculatedCents)}</strong>
          </span>
        </div>

        {sectorList.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400 italic py-2">
            Nenhum item adicionado ainda nesta feira. Vá para a página de Criação da Lista para adicionar produtos.
          </p>
        ) : (
          <div className="pt-2 divide-y divide-slate-100 dark:divide-slate-800">
            {sectorList.map((sector) => {
              const sectorPercent = totalCalculatedCents > 0
                ? Math.round((sector.totalCents / totalCalculatedCents) * 100)
                : 0;

              return (
                <div key={sector.name} className="py-3.5 first:pt-0 last:pb-0 space-y-2">
                  <div className="space-y-1">
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: sector.color }}
                        />
                        <span className="font-bold text-slate-800 dark:text-slate-200 leading-snug">
                          {sector.name}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-2 shrink-0 text-right tabular-nums whitespace-nowrap">
                        <span className="font-bold text-slate-900 dark:text-white">
                          {formatMoney(sector.totalCents)}
                        </span>
                        <span className="text-[11px] text-slate-400 dark:text-slate-500 font-semibold min-w-[2.25rem] text-right">
                          {sectorPercent}%
                        </span>
                      </div>
                    </div>

                    <div className="pl-[18px] text-[11px] text-slate-500 dark:text-slate-400">
                      {sector.itemCount} {sector.itemCount === 1 ? 'item' : 'itens'}
                      {sector.purchasedCount > 0 && ` • ${sector.purchasedCount} comprado(s)`}
                    </div>
                  </div>

                  <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${sectorPercent}%`,
                        backgroundColor: sector.color
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 5. Tabela / Detalhamento Financeiro dos Itens */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-sm transition-colors duration-200 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-4">
          <div className="flex items-center gap-2">
            <ListChecks className="w-5 h-5 text-brand-600 dark:text-brand-400 shrink-0" />
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
              Itens da Feira e Custos
            </h3>
          </div>
          <button
            onClick={onSwitchToPlanning}
            className="text-xs font-bold text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1 pl-7 sm:pl-0 w-fit cursor-pointer"
          >
            <span>Gerenciar itens</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {items.length === 0 ? (
          <div className="text-center py-6 text-slate-500 dark:text-slate-400 text-xs">
            Lista sem itens. Clique no botão acima para adicionar produtos.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 overflow-x-auto">
            {items.map((item) => {
              const hasPrice = item.actual_price_cents > 0;
              const hasEstimate = item.estimated_price_cents > 0;
              const totalCostCents = hasPrice
                ? item.actual_price_cents
                : (hasEstimate ? Math.round(item.estimated_price_cents * (item.quantity || 1)) : 0);

              return (
                <div
                  key={item.id}
                  className="py-3 text-xs"
                >
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${item.is_purchased ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
                      <span className="font-bold text-slate-800 dark:text-slate-200 truncate">
                        {item.custom_name || item.product_name}
                      </span>
                    </div>

                    <span className="font-extrabold text-slate-900 dark:text-white text-right tabular-nums whitespace-nowrap">
                      {totalCostCents > 0 ? formatMoney(totalCostCents) : 'Sem preço'}
                    </span>
                  </div>

                  <div className="mt-1.5 pl-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400 min-w-0">
                      <span className="whitespace-nowrap font-medium text-slate-600 dark:text-slate-300">
                        {formatQuantity(item.quantity, item.unit)}
                      </span>
                      <span aria-hidden="true">•</span>
                      <span className="whitespace-nowrap">
                        {item.category_name || 'Outros'}
                      </span>
                      {item.is_purchased && (
                        <span className="whitespace-nowrap text-[10px] text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950 px-1.5 py-0.5 rounded-md">
                          No Carrinho
                        </span>
                      )}
                    </div>

                    {!hasPrice && (
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 text-right whitespace-nowrap ml-auto">
                        {hasEstimate
                          ? `${formatMoney(item.estimated_price_cents)}/un (estimado)`
                          : 'Aguardando compra'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
