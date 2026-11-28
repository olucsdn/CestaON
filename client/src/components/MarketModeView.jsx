import React, { useState, useRef, useEffect } from 'react';
import { formatMoney, formatQuantity, formatCentsToBankInput, maskBankCurrencyInput, parseBankCurrencyToCents } from '../utils/formatters.js';
import { triggerHaptic } from '../utils/haptics.js';
import { RemoveFromCartConfirmCard } from './RemoveFromCartConfirmCard.jsx';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Scale,
  Edit3,
  Sparkles,
  AlertTriangle,
  TrendingUp,
  PartyPopper,
  ShoppingBag
} from 'lucide-react';

const OVER_BUDGET_PHRASE = 'Passou do teto, calma no caixa';

export function MarketModeView({
  list,
  onToggleItem,
  onUpdateItemPrice,
  onOpenFinishModal,
  onRequestPricePrompt,
  onUpdateBudget,
  onOpenShareModal
}) {
  const [showPurchased, setShowPurchased] = useState(false);
  const [editingPriceItemId, setEditingPriceItemId] = useState(null);
  const [priceInput, setPriceInput] = useState('');
  const [sectorFilter, setSectorFilter] = useState('all');

  // Estados de "Juice" (micro-interações e suculência visual)
  const [isPopping, setIsPopping] = useState(false);
  const [floatingDelta, setFloatingDelta] = useState(null);
  const [showOverConfetti, setShowOverConfetti] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [isEditingCeiling, setIsEditingCeiling] = useState(false);
  const [ceilingInput, setCeilingInput] = useState('');
  const [itemPendingRemoval, setItemPendingRemoval] = useState(null);

  // [AUDIT-FIX LOG-01]: Declaração incondicional dos hooks (useRef e useEffect) antes de retornos condicionais
  // Previne erro crítico de violação das Regras dos Hooks do React quando offline ou durante mutações.
  const safeItems = Array.isArray(list?.items) ? list.items : [];
  const pendingItems = safeItems.filter((i) => !i.is_purchased);
  const purchasedItems = safeItems.filter((i) => i.is_purchased);

  // Celebração discreta ao concluir o último item da lista
  const prevPendingCountRef = useRef(pendingItems.length);
  useEffect(() => {
    if (prevPendingCountRef.current > 0 && pendingItems.length === 0 && purchasedItems.length > 0) {
      setShowCelebration(true);
      triggerHaptic([20, 50, 20]);
      const timer = setTimeout(() => setShowCelebration(false), 2000);
      return () => clearTimeout(timer);
    }
    prevPendingCountRef.current = pendingItems.length;
  }, [pendingItems.length, purchasedItems.length]);

  // Cálculos de orçamento e progresso
  const budgetCents = Number(list?.budget_cents || list?.stats?.budgetCents || 0);
  const actualSpentCents = purchasedItems.reduce((acc, item) => acc + (item.actual_price_cents || 0), 0);
  const totalSpentCents = list?.stats?.totalSpentCents !== undefined ? list.stats.totalSpentCents : actualSpentCents;

  const prevSpentRef = useRef(totalSpentCents);

  useEffect(() => {
    if (prevSpentRef.current !== undefined && totalSpentCents !== prevSpentRef.current) {
      const delta = totalSpentCents - prevSpentRef.current;
      if (delta > 0) {
        setIsPopping(true);
        setFloatingDelta({ text: `+ ${formatMoney(delta)}`, id: Date.now() });

        const timer1 = setTimeout(() => setIsPopping(false), 450);
        const timer2 = setTimeout(() => setFloatingDelta(null), 1200);

        // Se estourou o teto ou adicionou valor enquanto já estourado
        if (budgetCents > 0 && totalSpentCents > budgetCents) {
          triggerHaptic([25, 40, 25]);
          setShowOverConfetti(true);
          const timer3 = setTimeout(() => setShowOverConfetti(false), 1600);
          return () => {
            clearTimeout(timer1);
            clearTimeout(timer2);
            clearTimeout(timer3);
          };
        }

        return () => {
          clearTimeout(timer1);
          clearTimeout(timer2);
        };
      }
    }
    prevSpentRef.current = totalSpentCents;
  }, [totalSpentCents, budgetCents]);

  if (!list || !list.items) return null;

  const hasCeiling = budgetCents > 0;
  const rawPercentage = hasCeiling ? Math.round((totalSpentCents / budgetCents) * 100) : 0;
  const percentageClamped = Math.min(100, Math.max(0, rawPercentage));
  const isOverBudget = hasCeiling && totalSpentCents > budgetCents;
  const excessCents = isOverBudget ? totalSpentCents - budgetCents : 0;
  const remainingCents = hasCeiling && !isOverBudget ? budgetCents - totalSpentCents : 0;

  // Progressão dinâmica de cores:
  // Verde (<50%) -> Amarelo (50-74%) -> Laranja (75-99%) -> Vermelho (>=100%)
  let barGradient = 'from-emerald-400 via-emerald-500 to-teal-500';
  let statusBadge = {
    text: 'Tudo sob controle! 🟢',
    bg: 'bg-emerald-50 dark:bg-emerald-950/40',
    border: 'border-emerald-200 dark:border-emerald-800',
    textColor: 'text-emerald-700 dark:text-emerald-300'
  };

  if (!hasCeiling) {
    barGradient = 'from-slate-400 to-slate-500';
    statusBadge = {
      text: 'Sem teto definido ⚪',
      bg: 'bg-slate-50 dark:bg-slate-800/60',
      border: 'border-slate-200 dark:border-slate-700',
      textColor: 'text-slate-600 dark:text-slate-300'
    };
  } else if (rawPercentage >= 100) {
    barGradient = 'from-red-500 via-rose-600 to-red-600';
    statusBadge = {
      text: 'TETO ESTOURADO! 💥🚨',
      bg: 'bg-red-50 dark:bg-red-950/60',
      border: 'border-red-300 dark:border-red-800',
      textColor: 'text-red-700 dark:text-red-300'
    };
  } else if (rawPercentage >= 75) {
    barGradient = 'from-amber-500 via-orange-500 to-orange-600';
    statusBadge = {
      text: 'Zona de perigo! 🟠 Quase no limite',
      bg: 'bg-orange-50 dark:bg-orange-950/40',
      border: 'border-orange-200 dark:border-orange-800',
      textColor: 'text-orange-700 dark:text-orange-300'
    };
  } else if (rawPercentage >= 50) {
    barGradient = 'from-amber-400 via-yellow-400 to-amber-500';
    statusBadge = {
      text: 'Passando da metade! 🟡 Fique de olho',
      bg: 'bg-amber-50 dark:bg-amber-950/40',
      border: 'border-amber-200 dark:border-amber-800',
      textColor: 'text-amber-700 dark:text-amber-300'
    };
  }

  // Agrupa itens pendentes por setor (categoria)
  const pendingBySector = pendingItems.reduce((acc, item) => {
    const catName = item.category_name || 'Outros';
    if (!acc[catName]) {
      acc[catName] = {
        name: catName,
        color: item.category_color || '#64748B',
        items: []
      };
    }
    acc[catName].items.push(item);
    return acc;
  }, {});

  const displayedSectors = Object.values(pendingBySector).filter(
    (sector) => sectorFilter === 'all' || sector.name === sectorFilter
  );

  const handleStartEditPrice = (e, item) => {
    e.stopPropagation();
    setEditingPriceItemId(item.id);
    setPriceInput(formatCentsToBankInput(item.actual_price_cents));
  };

  const handleSavePrice = (e, item) => {
    e.stopPropagation();
    e.preventDefault();
    const cents = parseBankCurrencyToCents(priceInput);
    onUpdateItemPrice(item.id, cents);
    setEditingPriceItemId(null);
  };

  return (
    <div className="space-y-4 pb-24">
      {/* ======================================================== */}
      {/* BARRA DE ORÇAMENTO SUCULENTA ("JUICE") NO TOPO DA ABA     */}
      {/* ======================================================== */}
      <div
        className={`relative overflow-hidden bg-white dark:bg-slate-900 rounded-3xl p-4 sm:p-5 shadow-sm border transition-colors duration-300 ${
          isOverBudget
            ? 'border-red-400/80 dark:border-red-700/80 shadow-[0_4px_25px_rgba(239,68,68,0.2)] bg-gradient-to-b from-red-50/40 via-white to-red-50/20 dark:from-red-950/30 dark:via-slate-900 dark:to-red-950/20'
            : 'border-slate-200 dark:border-slate-800'
        }`}
      >
        {/* Efeito leve de confete ao ultrapassar o teto (sem emojis) */}
        {showOverConfetti && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden z-30 select-none">
            <span className="absolute left-[10%] top-1 w-2 h-1.5 rounded-sm bg-rose-400/85 animate-confetti-fall" style={{ animationDelay: '0ms' }} />
            <span className="absolute left-[22%] top-0 w-1.5 h-2 rounded-sm bg-amber-400/85 animate-confetti-fall" style={{ animationDelay: '110ms' }} />
            <span className="absolute left-[36%] top-2 w-2 h-1.5 rounded-sm bg-emerald-400/85 animate-confetti-fall" style={{ animationDelay: '60ms' }} />
            <span className="absolute left-[50%] top-0 w-1.5 h-1.5 rounded-full bg-sky-400/85 animate-confetti-fall" style={{ animationDelay: '180ms' }} />
            <span className="absolute left-[64%] top-1 w-2 h-1.5 rounded-sm bg-rose-500/80 animate-confetti-fall" style={{ animationDelay: '90ms' }} />
            <span className="absolute left-[78%] top-0 w-1.5 h-2 rounded-sm bg-amber-500/85 animate-confetti-fall" style={{ animationDelay: '150ms' }} />
            <span className="absolute left-[90%] top-2 w-1.5 h-1.5 rounded-full bg-emerald-500/80 animate-confetti-fall" style={{ animationDelay: '40ms' }} />
          </div>
        )}

        {/* Partícula flutuante de acréscimo de valor (+ R$ XX,XX ✨) */}
        {floatingDelta && (
          <div
            key={floatingDelta.id}
            className="absolute top-2 right-4 pointer-events-none z-30 font-black text-xs px-2.5 py-1 rounded-full bg-emerald-500 text-white shadow-lg animate-float-particle"
          >
            {floatingDelta.text}
          </div>
        )}

        {/* Cabeçalho do Card: Total no Carrinho vs Teto de Gastos */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 block">
              Gasto no Carrinho
            </span>
            <div className="flex items-baseline gap-2">
              <span
                className={`text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white transition-transform ${
                  isPopping ? 'animate-juice-pop text-brand-600 dark:text-brand-400' : ''
                }`}
              >
                {formatMoney(totalSpentCents)}
              </span>
            </div>
          </div>

          <div className="text-right">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 block">
              Teto de Gastos
            </span>
            <button
              type="button"
              onClick={() => {
                setCeilingInput(formatCentsToBankInput(budgetCents));
                setIsEditingCeiling(!isEditingCeiling);
              }}
              className="inline-flex items-center gap-1.5 group cursor-pointer text-slate-700 dark:text-slate-200 hover:text-brand-600 dark:hover:text-brand-400 transition"
              title="Clique para ajustar o limite de gastos"
            >
              <span className="text-sm sm:text-base font-extrabold">
                {budgetCents > 0 ? formatMoney(budgetCents) : 'Não definido'}
              </span>
              <Edit3 className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 group-hover:scale-110 transition text-brand-600 dark:text-brand-400" />
            </button>
          </div>
        </div>

        {/* Ajuste Rápido de Teto Inline */}
        {isEditingCeiling && (
          <div className="mt-3 p-3 bg-slate-50 dark:bg-slate-850 rounded-2xl border border-slate-200 dark:border-slate-750 animate-in fade-in">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                Ajustar Limite de Gastos (Teto):
              </span>
              <button
                type="button"
                onClick={() => setIsEditingCeiling(false)}
                className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-bold px-1"
              >
                ✕
              </button>
            </div>

            <div className="flex items-center gap-2 mb-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">R$</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={ceilingInput}
                  onChange={(e) => setCeilingInput(maskBankCurrencyInput(e.target.value))}
                  placeholder="0,00"
                  className="w-full pl-9 pr-3 py-1.5 text-xs font-bold rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none focus:border-brand-500"
                  autoFocus
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  const cents = parseBankCurrencyToCents(ceilingInput);
                  if (onUpdateBudget) {
                    onUpdateBudget(cents);
                  }
                  setIsEditingCeiling(false);
                }}
                className="px-3.5 py-1.5 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs rounded-xl shadow-sm transition cursor-pointer"
              >
                Salvar Teto
              </button>
            </div>

            {/* Atalhos Rápidos (+R$ 20, +R$ 50, +R$ 100) */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold text-slate-400">Aumentar rápido:</span>
              {[20, 50, 100].map((addVal) => (
                <button
                  key={addVal}
                  type="button"
                  onClick={() => {
                    const currentCents = budgetCents || 0;
                    const newCents = currentCents + (addVal * 100);
                    if (onUpdateBudget) {
                      onUpdateBudget(newCents);
                    }
                    setIsEditingCeiling(false);
                  }}
                  className="px-2 py-1 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-[10px] font-bold text-slate-700 dark:text-slate-200 hover:border-brand-500 hover:text-brand-600 transition"
                >
                  +{addVal}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Barra de Progresso Suculenta */}
        <div className="mt-3">
          <div className="relative h-4 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden p-0.5 border border-slate-200/80 dark:border-slate-700/80 shadow-inner">
            <div
              className={`h-full rounded-full bg-gradient-to-r ${barGradient} transition-all duration-700 cubic-bezier(0.34, 1.56, 0.64, 1) relative overflow-hidden ${
                isOverBudget ? 'animate-shimmer-glow' : ''
              }`}
              style={{
                width: hasCeiling ? `${Math.max(percentageClamped, totalSpentCents > 0 ? 4 : 0)}%` : '0%'
              }}
            >
              {/* Brilho interior (gloss / shine) */}
              <div className="absolute inset-0 bg-white/20 rounded-full" />
            </div>
          </div>

          {/* Linha de Status da Barra: Percentual & Restante */}
          <div className="flex items-center justify-between mt-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-1.5">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-black border ${statusBadge.bg} ${statusBadge.border} ${statusBadge.textColor}`}>
                {hasCeiling ? `${rawPercentage}% do limite` : 'Sem limite'}
              </span>
              {isOverBudget && (
                <span className="font-bold text-red-600 dark:text-red-400 animate-pulse text-[10px]">
                  (Excedido em {formatMoney(excessCents)})
                </span>
              )}
            </div>

            <div>
              {hasCeiling ? (
                isOverBudget ? (
                  <span className="font-bold text-red-600 dark:text-red-400">
                    R$ 0,00 restante
                  </span>
                ) : (
                  <span>
                    Resta: <strong className="text-slate-700 dark:text-slate-200">{formatMoney(remainingCents)}</strong>
                  </span>
                )
              ) : (
                <button
                  type="button"
                  onClick={() => setIsEditingCeiling(true)}
                  className="text-brand-600 dark:text-brand-400 font-bold hover:underline"
                >
                  + Definir teto
                </button>
              )}
            </div>
          </div>
        </div>

        {/* AVISO FIXO AO ESTOURAR O TETO */}
        {isOverBudget && (
          <div
            className="w-full mt-3 p-3 rounded-2xl bg-red-100/90 dark:bg-red-950/70 border border-red-300 dark:border-red-800 text-left flex items-center justify-between gap-2.5"
          >
            <div className="flex items-center gap-2 min-w-0">
              <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-black text-red-900 dark:text-red-200 leading-snug">
                  {OVER_BUDGET_PHRASE}
                </p>
                <p className="text-[10px] font-bold text-red-700/80 dark:text-red-300/80">
                  Excedido em <span className="underline">{formatMoney(excessCents)}</span>
                </p>
              </div>
            </div>
            <span className="shrink-0 text-xs font-black px-2.5 py-1 rounded-xl bg-red-600 text-white shadow-sm">
              + {formatMoney(excessCents)}
            </span>
          </div>
        )}
      </div>

      {/* Indicador de Itens Restantes vs Carrinho */}
      <div className="flex items-center justify-between px-1 text-xs text-slate-500 dark:text-slate-400 font-semibold">
        <span>
          {list.items.length === 0
            ? 'Nenhum item na lista'
            : pendingItems.length === 0
            ? 'Todos os itens comprados'
            : `${pendingItems.length} ${pendingItems.length === 1 ? 'item restante' : 'itens restantes'}`}
        </span>
        <span>
          {purchasedItems.length} de {list.items.length} no carrinho
        </span>
      </div>

      {/* Barra de Filtro Rápido por Setor */}
      {Object.keys(pendingBySector).length > 1 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <button
            type="button"
            onClick={() => setSectorFilter('all')}
            className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              sectorFilter === 'all'
                ? 'bg-slate-900 text-white dark:bg-slate-800 dark:text-white dark:border dark:border-slate-700 shadow-sm'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <span>Todos</span>
            <span className="text-[10px] opacity-75">
              ({pendingItems.length})
            </span>
          </button>

          {Object.values(pendingBySector).map((sector) => {
            const isSelected = sectorFilter === sector.name;
            return (
              <button
                key={sector.name}
                type="button"
                onClick={() => setSectorFilter(isSelected ? 'all' : sector.name)}
                className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border ${
                  isSelected
                    ? 'border-transparent text-white shadow-sm'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
                style={
                  isSelected
                    ? { backgroundColor: sector.color || '#64748B' }
                    : {}
                }
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: isSelected ? '#ffffff' : (sector.color || '#64748B') }}
                />
                <span>{sector.name}</span>
                <span className={`text-[10px] ${isSelected ? 'text-white/90' : 'text-slate-400 dark:text-slate-500'}`}>
                  ({sector.items.length})
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Lista de Itens Pendentes */}
      {list.items.length === 0 ? (
        <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center my-4 animate-in fade-in duration-300">
          <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3 text-slate-400 dark:text-slate-500">
            <ShoppingBag className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
            Nenhum item adicionado
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs mx-auto">
            Sua lista está vazia. Adicione produtos na aba &quot;Lista&quot; para iniciar suas compras no mercado.
          </p>
        </div>
      ) : pendingItems.length === 0 ? (
        <div className="relative overflow-hidden bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-6 text-center my-4 animate-in fade-in zoom-in-95 duration-300">
          {showCelebration && (
            <div className="absolute inset-0 pointer-events-none select-none overflow-hidden">
              <span className="absolute left-[15%] bottom-2 text-lg animate-micro-celebration" style={{ animationDelay: '0ms' }}>✨</span>
              <span className="absolute left-[32%] bottom-3 text-base animate-micro-celebration" style={{ animationDelay: '80ms' }}>🎉</span>
              <span className="absolute left-[50%] bottom-2 text-lg animate-micro-celebration" style={{ animationDelay: '160ms' }}>🥬</span>
              <span className="absolute left-[68%] bottom-3 text-base animate-micro-celebration" style={{ animationDelay: '120ms' }}>⭐</span>
              <span className="absolute left-[85%] bottom-2 text-lg animate-micro-celebration" style={{ animationDelay: '200ms' }}>🛒</span>
            </div>
          )}
          <CheckCircle2 className="w-10 h-10 text-emerald-600 dark:text-emerald-400 mx-auto mb-2 animate-in zoom-in duration-300" />
          <h3 className="text-base font-bold text-emerald-900 dark:text-emerald-200">
            Lista Concluída 🎯
          </h3>
          <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-0.5">
            Todos os itens foram marcados como comprados.
          </p>
        </div>
      ) : displayedSectors.length === 0 ? (
        <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 rounded-2xl p-6 text-center my-2">
          <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400 mx-auto mb-1.5" />
          <h4 className="text-sm font-bold text-emerald-900 dark:text-emerald-200">
            Setor concluído!
          </h4>
          <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-0.5 mb-3">
            Todos os itens deste setor já foram colocados no carrinho.
          </p>
          <button
            type="button"
            onClick={() => setSectorFilter('all')}
            className="text-xs font-bold px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-sm transition"
          >
            Ver todos os setores restantes
          </button>
        </div>
      ) : (
        displayedSectors.map((sector) => (
          <div key={sector.name} className="space-y-2">
            <div className="flex items-center gap-2 px-1 pt-1">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
                style={{ backgroundColor: sector.color || '#64748B' }}
              />
              <h3
                className="text-xs font-black uppercase tracking-wider"
                style={{ color: sector.color || '#64748B' }}
              >
                {sector.name}
              </h3>
            </div>

            <div className="space-y-2">
              {sector.items.map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    triggerHaptic(12);
                    onToggleItem(item.id, true);
                  }}
                  className="btn-tactile bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/60 active:scale-[0.99] border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-sm transition flex items-center justify-between gap-3 cursor-pointer select-none"
                  style={{ borderLeftWidth: '4px', borderLeftColor: item.category_color || sector.color || '#64748B' }}
                >
                  {/* Checkbox circular (tamanho táctil confortável) */}
                  <div className="w-8 h-8 rounded-full border-2 border-slate-300 dark:border-slate-600 flex items-center justify-center shrink-0">
                    <Check className="w-4 h-4 text-transparent hover:text-slate-400 transition" />
                  </div>

                  {/* Informações do Produto */}
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-sm sm:text-base text-slate-900 dark:text-slate-100 leading-snug truncate">
                      {item.custom_name || item.product_name}
                    </h4>
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      {formatQuantity(item.quantity, item.unit)}
                    </span>
                  </div>

                  {/* Preço na Gôndola */}
                  <div className="shrink-0 text-right">
                    {editingPriceItemId === item.id ? (
                      <form onSubmit={(e) => handleSavePrice(e, item)} className="flex items-center gap-1">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={priceInput}
                          onChange={(e) => setPriceInput(maskBankCurrencyInput(e.target.value))}
                          placeholder="0,00"
                          className="w-20 text-xs font-bold bg-white dark:bg-slate-800 text-slate-900 dark:text-white border-2 border-brand-500 rounded-lg p-1 outline-none"
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                        />
                        <button
                          type="submit"
                          className="bg-brand-600 text-white text-xs font-bold px-2 py-1 rounded-lg"
                        >
                          OK
                        </button>
                      </form>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onRequestPricePrompt) {
                            onRequestPricePrompt(item);
                          } else {
                            handleStartEditPrice(e, item);
                          }
                        }}
                        className="text-right p-1"
                        title="Informar preço"
                      >
                        <span className="text-sm font-bold text-slate-800 dark:text-slate-200 block">
                          {item.actual_price_cents > 0
                            ? formatMoney(item.actual_price_cents)
                            : item.estimated_price_cents > 0
                            ? `~${formatMoney(item.estimated_price_cents)}`
                            : 'Definir R$'}
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {/* Itens Comprados (Ocultáveis) */}
      {purchasedItems.length > 0 && (
        <div className="pt-2">
          <button
            onClick={() => setShowPurchased(!showPurchased)}
            className="w-full flex items-center justify-between p-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/70 dark:hover:bg-slate-700/70 rounded-xl font-semibold text-xs text-slate-600 dark:text-slate-300 transition"
          >
            <span>No Carrinho ({purchasedItems.length})</span>
            {showPurchased ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showPurchased && (
            <div className="space-y-1.5 mt-2">
              {purchasedItems.map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    if (onRequestPricePrompt) onRequestPricePrompt(item);
                  }}
                  className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 flex items-center justify-between gap-3 opacity-85 hover:opacity-100 transition cursor-pointer select-none"
                  title="Clique no item para informar ou editar o valor pago"
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setItemPendingRemoval(item);
                    }}
                    className="w-7 h-7 rounded-full bg-emerald-500 hover:bg-rose-500 text-white flex items-center justify-center shrink-0 transition active:scale-90"
                    title="Tirar item do carrinho"
                    aria-label="Tirar item do carrinho"
                  >
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-xs text-slate-600 dark:text-slate-300 line-through truncate block">
                      {item.custom_name || item.product_name} ({formatQuantity(item.quantity, item.unit)})
                    </span>
                  </div>
                  <div className="shrink-0 text-right">
                    {item.actual_price_cents > 0 ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onRequestPricePrompt) onRequestPricePrompt(item);
                        }}
                        className="text-xs font-bold text-slate-700 dark:text-slate-300 hover:text-brand-600 transition"
                        title="Clique para editar valor pago"
                      >
                        {formatMoney(item.actual_price_cents)}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onRequestPricePrompt) onRequestPricePrompt(item);
                        }}
                        className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-lg bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/70 dark:hover:bg-amber-900 text-amber-800 dark:text-amber-300 transition"
                        title="Aguardando pesagem ou preço no caixa. Clique para informar valor."
                      >
                        <Scale className="w-3 h-3" />
                        <span>Pesar / caixa</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Barra Inferior Fixa Limpa — Total e Finalizar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-t border-slate-200 dark:border-slate-800 px-4 py-3 z-20 shadow-md">
        <div className="max-w-xl mx-auto flex items-center justify-between gap-3">
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 block">
              Total no Carrinho
            </span>
            <div className="flex items-center gap-2">
              <span className={`text-xl font-bold transition-transform ${isPopping ? 'animate-juice-pop' : ''} ${isOverBudget ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-slate-100'}`}>
                {formatMoney(totalSpentCents)}
              </span>
              {isOverBudget && (
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-red-600 text-white animate-pulse shadow-sm">
                  ESTOUROU!
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {pendingItems.length === 0 && list.items.length > 0 && onOpenFinishModal && (
              <button
                onClick={() => {
                  triggerHaptic(18);
                  onOpenFinishModal();
                }}
                className="btn-tactile bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs sm:text-sm px-4 py-2.5 rounded-xl shadow-sm transition flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Finalizar Feira</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <RemoveFromCartConfirmCard
        item={itemPendingRemoval}
        onKeep={() => setItemPendingRemoval(null)}
        onConfirmRemove={(target) => {
          onToggleItem(target.id, false);
          setItemPendingRemoval(null);
        }}
      />
    </div>
  );
}
